// Drive 저장소 서비스 — 설계서 v2.9 §7(Phase 5). HTTP와 분리된 순수 작업 단위라 계약 테스트가 가짜 Drive·가짜 DB로 돈다.
//
// 작업 목록(= api/drive 액션):
//   status · oauth-start / OAuth 콜백 · disconnect           — 연결(관리자)
//   ensure-tree · adopt-folder · archive-project            — 폴더 트리(§7.1)
//   upload-start · upload-chunk · upload-status · upload-commit — 4MB 조각 중계 업로드(§7.2)
//   link                                                    — Drive에 직접 올린 파일을 링크로 등록(§7.2b)
//   file-urls · client-file-urls · stream                    — 서명 URL 프록시(§7.4, 100MB 상한)
//   scan                                                    — 인박스 감지 + 확정 복사 재시도(§7.3·§7.5)
//   client-finalize                                         — 발주처 승인 → 06_발주처공유 복사 성공 후 final(§7.5)
// 불변 규칙: 공유 권한은 바꾸지 않는다(anyone 링크 0) · 루트 밖 파일은 읽어 들이지 않는다 · 권한 판정은 SQL 정본에 맡긴다.
import { randomUUID } from 'node:crypto'
import { driveFolderUrl, looksLikeDriveFileId, parseDriveLink } from '../../../src/lib/driveLink.js'
import {
  driveAccessToken,
  driveAuthMode,
  driveConfigured,
  exchangeOAuthCode,
  NOT_CONFIGURED_MESSAGE,
  OAUTH_REVOKE_URL,
  oauthAuthorizeUrl,
  oauthRedirectUri,
  refreshTokenFor,
  type DriveAuthEnv,
} from './auth.js'
import { DriveError, notReady } from './errors.js'
import { DriveApi, FOLDER_MIME, GOOGLE_NATIVE_PREFIX, SHORTCUT_MIME, qEscape, type DriveFile, type UploadProgress } from './googleDrive.js'
import { signingKey, signToken, verifyToken, type SigningEnv } from './sign.js'
import type { DriveStore, MemberRole, SnapshotTarget, StoreEnv, VersionRow } from './store.js'
import {
  ancestorIds,
  APP_DELIVERABLE_KEY,
  APP_PROJECT_KEY,
  APP_SNAPSHOT_KEY,
  APP_UPLOAD_KEY,
  ARCHIVE_FOLDER,
  ensureChildFolder,
  ensureItemFolder,
  ensureParts,
  ensurePartPath,
  ensureProjectRoot,
  ensureProjectTree,
  ensureRootFolders,
  PART,
  QUOTE_FOLDER,
  sanitizeName,
  SCAN_EXCLUDED_PARTS,
} from './tree.js'

export interface DriveEnv extends DriveAuthEnv, SigningEnv, StoreEnv {
  /** 업로드 상한(MB) — 기본 2048 */
  DRIVE_MAX_UPLOAD_MB?: string
}

export interface DriveCtx {
  env: DriveEnv
  readonly store: DriveStore
  fetchImpl: typeof fetch
  now: () => number
  sleep: (ms: number) => Promise<void>
}

/** 조각 크기 — Drive 재개 업로드 규약(256KiB 배수) · Vercel 요청 본문 한도(4.5MB) 아래 */
export const CHUNK_BYTES = 4 * 1024 * 1024
const CHUNK_UNIT = 256 * 1024
/** §7.4 프록시 상한 — 원본(AI·PSD·영상)은 보관용, 미리보기·컨펌은 PDF·이미지 */
export const STREAM_MAX_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_UPLOAD_MB = 2048
const INTERNAL_URL_TTL = 60 * 60
const CLIENT_URL_TTL = 2 * 60 * 60
const UPLOAD_TICKET_TTL = 6 * 60 * 60
const OAUTH_STATE_TTL = 10 * 60
/** 커밋 전 업로드(진행 중)를 인박스에 올리지 않는 유예 */
const INFLIGHT_GRACE_MS = 10 * 60 * 1000
const SCAN_MAX_FOLDERS = 400
const TOKEN_RE = /^[0-9a-f-]{36}$/i

export interface CallerIdentity {
  authUserId: string
  email: string | null
  profileId: string
  appRole: 'admin' | 'sales' | 'staff'
}

// ── 공용 ───────────────────────────────────────────────────────────
export function driveApiFor(ctx: DriveCtx): DriveApi {
  return new DriveApi(() => driveAccessToken(ctx.env, ctx.store, ctx.fetchImpl, ctx.now()), ctx.fetchImpl)
}

function driveRoot(ctx: DriveCtx): string {
  if (!driveConfigured(ctx.env)) throw notReady(NOT_CONFIGURED_MESSAGE)
  return ctx.env.DRIVE_ROOT_FOLDER_ID!
}

function key(ctx: DriveCtx): Buffer {
  return signingKey(ctx.env)
}

export function maxUploadBytes(env: DriveEnv): number {
  const mb = Number(env.DRIVE_MAX_UPLOAD_MB)
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024
}

function str(v: unknown, what: string, max = 500): string {
  if (typeof v !== 'string' || !v.trim()) throw new DriveError(400, 'validation', `${what}이(가) 필요합니다.`)
  return v.trim().slice(0, max)
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 실서버 Drive가 살아 있음을 기록 — SQL의 §7.5 2단계 확정(client_decide)이 이 표식을 본다 */
async function markLive(ctx: DriveCtx): Promise<void> {
  try {
    await ctx.store.setDriveEnabled(true)
  } catch (e) {
    console.warn('[drive] drive_enabled 기록 실패:', message(e))
  }
}

export async function requireUser(ctx: DriveCtx, jwt: string): Promise<CallerIdentity> {
  const u = await ctx.store.authUser(jwt)
  if (!u) throw new DriveError(401, 'forbidden', '로그인이 필요합니다.')
  const p = await ctx.store.profileByAuth(u.authUserId)
  if (!p) throw new DriveError(403, 'forbidden', '프로필이 없습니다 — 다시 로그인하세요.')
  return { authUserId: u.authUserId, email: u.email, profileId: p.id, appRole: p.app_role }
}

function requireAdmin(user: CallerIdentity, what = 'Drive 연결'): void {
  if (user.appRole !== 'admin') throw new DriveError(403, 'forbidden', `${what}은(는) 관리자(admin)만 할 수 있습니다.`)
}

async function requireMember(ctx: DriveCtx, user: CallerIdentity, projectId: string): Promise<MemberRole> {
  const role = await ctx.store.memberRole(user.profileId, projectId)
  if (!role) throw new DriveError(403, 'forbidden', '프로젝트 멤버가 아닙니다.')
  return role
}

async function mustProject(ctx: DriveCtx, projectId: string) {
  const project = await ctx.store.project(projectId)
  if (!project) throw new DriveError(404, 'not_found', '프로젝트를 찾을 수 없습니다.')
  return project
}

// ── 연결 상태·OAuth ─────────────────────────────────────────────────
export interface DriveStatus {
  configured: boolean
  connected: boolean
  mode: 'oauth' | 'service_account'
  token_source: 'env' | 'vault' | 'service_account' | null
  account_email: string | null
  connected_at: string | null
  last_error: string | null
  last_error_at: string | null
  root_folder_id: string | null
  root_url: string | null
  can_connect: boolean
  redirect_uri: string | null
  max_upload_mb: number
  chunk_bytes: number
}

export async function driveStatus(ctx: DriveCtx, user: CallerIdentity, requestUrl: string): Promise<DriveStatus> {
  const configured = driveConfigured(ctx.env)
  const mode = driveAuthMode(ctx.env)
  let connected = false
  let info = null
  if (configured) {
    if (mode === 'service_account') connected = true
    else {
      connected = Boolean(await refreshTokenFor(ctx.env, ctx.store))
      info = await ctx.store.connectionInfo().catch(() => null)
    }
  }
  const root = ctx.env.DRIVE_ROOT_FOLDER_ID ?? null
  const isAdmin = user.appRole === 'admin'
  return {
    configured,
    connected,
    mode,
    token_source: !configured ? null : mode === 'service_account' ? 'service_account' : ctx.env.GOOGLE_DRIVE_REFRESH_TOKEN ? 'env' : connected ? 'vault' : null,
    account_email: info?.account_email ?? null,
    connected_at: info?.connected_at ?? null,
    last_error: info?.last_error ?? null,
    last_error_at: info?.last_error_at ?? null,
    root_folder_id: root,
    root_url: root ? driveFolderUrl(root) : null,
    can_connect: isAdmin && configured && mode === 'oauth',
    redirect_uri: isAdmin ? oauthRedirectUri(ctx.env, requestUrl) : null,
    max_upload_mb: Math.round(maxUploadBytes(ctx.env) / 1024 / 1024),
    chunk_bytes: CHUNK_BYTES,
  }
}

export async function oauthStart(ctx: DriveCtx, user: CallerIdentity, requestUrl: string): Promise<{ url: string; redirect_uri: string }> {
  requireAdmin(user)
  if (driveAuthMode(ctx.env) !== 'oauth') throw new DriveError(409, 'conflict', '서비스 계정 모드에서는 연결 절차가 필요 없습니다.')
  if (!driveConfigured(ctx.env)) throw notReady(NOT_CONFIGURED_MESSAGE)
  const redirectUri = oauthRedirectUri(ctx.env, requestUrl)
  const state = signToken({ k: 'oa', u: user.profileId, r: redirectUri }, key(ctx), OAUTH_STATE_TTL, ctx.now())
  return { url: oauthAuthorizeUrl(ctx.env, redirectUri, state), redirect_uri: redirectUri }
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
}

/**
 * OAuth 복귀 뒤 행사 설정으로 돌아갈 앱 루트(Phase 4.4 — 하위 경로·회사 도메인 배포). 리디렉트 URI(`…/api/drive`)에서
 * `/api/drive`를 뗀 자리가 앱 루트다. 회사 도메인(CloudFront 경유)이면 함수는 Vercel 주소로 요청을 받아 회사 주소를 모르므로
 * 리디렉트 URI가 유일한 단서다. 요청과 같은 오리진이면 경로만(루트 배포 = 지금과 같은 `/settings…`), 다르면 절대 주소.
 */
export function settingsReturnBase(requestUrl: string, redirectUri: string | undefined): string {
  if (!redirectUri) return ''
  let r: URL
  try {
    r = new URL(redirectUri)
  } catch {
    return ''
  }
  const path = r.pathname.replace(/\/api\/drive\/?$/, '').replace(/\/$/, '')
  return r.origin === new URL(requestUrl).origin ? path : `${r.origin}${path}`
}

/**
 * Google 동의 후 돌아오는 GET /api/drive?code&state — 결과는 행사 설정으로 되돌려 보내며 사유 코드만 싣는다
 * (토큰·이메일은 URL에 싣지 않는다). 저장 전에 **연결 계정이 저장소 루트에 쓸 수 있는지** 확인한다.
 */
export async function oauthCallback(ctx: DriveCtx, requestUrl: string): Promise<Response> {
  const url = new URL(requestUrl)
  // state를 못 읽으면 env 리디렉트 URI로, 읽으면 연결을 시작한 그 리디렉트 URI로 앱 루트를 정한다
  let appRoot = settingsReturnBase(requestUrl, ctx.env.DRIVE_OAUTH_REDIRECT_URI)
  const back = (q: string) => redirectTo(`${appRoot}/settings?drive=${q}`)
  let st: { u: string; r: string }
  try {
    st = verifyToken<{ u: string; r: string }>(url.searchParams.get('state') ?? '', key(ctx), ctx.now(), 'oa')
  } catch {
    return back('error&reason=state')
  }
  appRoot = settingsReturnBase(requestUrl, st.r)
  const err = url.searchParams.get('error')
  if (err) return back(`error&reason=${err === 'access_denied' ? 'denied' : 'google'}`)
  const code = url.searchParams.get('code')
  if (!code) return back('error&reason=code')
  try {
    const tokens = await exchangeOAuthCode(ctx.env, code, st.r, ctx.fetchImpl)
    if (!tokens.refresh_token) return back('error&reason=no_refresh_token')
    const api = new DriveApi(async () => tokens.access_token, ctx.fetchImpl)
    const about = await api.about()
    const root = await api.getFile(ctx.env.DRIVE_ROOT_FOLDER_ID ?? '', 'id,name,mimeType,trashed,capabilities(canAddChildren)')
    if (!root || root.trashed || root.mimeType !== FOLDER_MIME || root.capabilities?.canAddChildren === false) {
      return back('error&reason=root_access')
    }
    await ctx.store.saveConnection({ refreshToken: tokens.refresh_token, accountEmail: about.user?.emailAddress ?? null, connectedBy: st.u })
    await markLive(ctx)
    await ensureRootFolders(api, root.id).catch((e) => console.warn('[drive] 루트 공용 폴더 생성 실패:', message(e)))
    return back('connected')
  } catch (e) {
    console.warn('[drive] OAuth 콜백 실패:', message(e))
    return back('error&reason=exchange')
  }
}

export async function disconnect(ctx: DriveCtx, user: CallerIdentity): Promise<{ disconnected: true }> {
  requireAdmin(user, 'Drive 연결 해제')
  if (ctx.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    throw new DriveError(409, 'conflict', '서버 env(GOOGLE_DRIVE_REFRESH_TOKEN)에 넣은 연결은 Vercel 환경 변수에서 지워야 합니다.')
  }
  const refresh = await ctx.store.readRefreshToken().catch(() => null)
  if (refresh) {
    await ctx.fetchImpl(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => undefined)
  }
  await ctx.store.clearConnection()
  await ctx.store.setDriveEnabled(false)
  return { disconnected: true }
}

// ── 폴더 트리 ─────────────────────────────────────────────────────────
export async function ensureTreeOp(ctx: DriveCtx, user: CallerIdentity, projectId: string) {
  await requireMember(ctx, user, projectId)
  const root = driveRoot(ctx)
  const project = await mustProject(ctx, projectId)
  const tree = await ensureProjectTree(driveApiFor(ctx), ctx.store, root, project)
  await markLive(ctx)
  return { folder_id: tree.rootId, folder_url: driveFolderUrl(tree.rootId), created: tree.created }
}

/** 기존 폴더를 행사 폴더로 지정(pm) — 루트 안 · 예약 폴더 아님 · 다른 행사 미사용 */
export async function adoptFolderOp(ctx: DriveCtx, user: CallerIdentity, projectId: string, link: string) {
  const role = await requireMember(ctx, user, projectId)
  if (role !== 'pm') throw new DriveError(403, 'forbidden', '행사 폴더 지정은 PM만 할 수 있습니다.')
  const parsed = parseDriveLink(link)
  if (!parsed || parsed.kind !== 'folder') {
    throw new DriveError(400, 'validation', '폴더 링크를 붙여 주세요 (drive.google.com/drive/folders/…).')
  }
  const root = driveRoot(ctx)
  const project = await mustProject(ctx, projectId)
  if (project.status === 'closed') throw new DriveError(409, 'conflict', '종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.')
  const api = driveApiFor(ctx)
  const f = await api.getFile(parsed.id)
  if (!f || f.trashed || f.mimeType !== FOLDER_MIME) {
    throw new DriveError(404, 'not_found', '폴더를 찾을 수 없습니다 — 링크가 맞는지, MICE Communicator 폴더 안에 있는지 확인하세요.')
  }
  if (f.id === root) throw new DriveError(422, 'validation', '저장소 루트 자체는 행사 폴더로 쓸 수 없습니다 — 그 안의 행사 폴더 링크를 붙여 주세요.')
  if (f.parents?.includes(root) && (f.name === QUOTE_FOLDER || f.name === ARCHIVE_FOLDER)) {
    throw new DriveError(422, 'validation', `예약 폴더(${QUOTE_FOLDER}·${ARCHIVE_FOLDER})는 행사 폴더로 쓸 수 없습니다.`)
  }
  if (!(await ancestorIds(api, f, root)).has(root)) {
    throw new DriveError(403, 'forbidden', 'MICE Communicator 폴더 밖의 폴더는 행사 폴더로 지정할 수 없습니다.')
  }
  const owner = f.appProperties?.[APP_PROJECT_KEY]
  const other = await ctx.store.projectByRoot(f.id)
  if ((owner && owner !== projectId) || (other && other.id !== projectId)) {
    throw new DriveError(409, 'conflict', '다른 행사가 이미 쓰는 폴더입니다.')
  }
  await api.update(f.id, { appProperties: { [APP_PROJECT_KEY]: projectId } })
  await ctx.store.setProjectRoot(projectId, f.id)
  await ctx.store.log(projectId, 'drive.tree_adopted', 'project', projectId, { folder_id: f.id })
  await ensureParts(api, f.id)
  await markLive(ctx)
  return { folder_id: f.id, folder_url: driveFolderUrl(f.id), created: false }
}

/** 삭제된 행사의 폴더를 루트 99_archive로 옮긴다(admin, best-effort — 파일은 지우지 않는다) */
export async function archiveProjectOp(ctx: DriveCtx, user: CallerIdentity, folderId: string, projectName: string) {
  requireAdmin(user, '행사 폴더 보관')
  if (!driveConfigured(ctx.env)) return { archived: false, reason: 'not_configured' }
  const root = ctx.env.DRIVE_ROOT_FOLDER_ID!
  const api = driveApiFor(ctx)
  const f = await api.getFile(str(folderId, '폴더 id', 200))
  if (!f || f.trashed || f.mimeType !== FOLDER_MIME) return { archived: false, reason: 'missing' }
  if (f.id === root) throw new DriveError(422, 'validation', '저장소 루트는 보관할 수 없습니다.')
  if (!(await ancestorIds(api, f, root)).has(root)) throw new DriveError(403, 'forbidden', 'MICE Communicator 폴더 밖의 폴더입니다.')
  if (await ctx.store.projectByRoot(f.id)) throw new DriveError(409, 'conflict', '아직 행사가 쓰는 폴더입니다.')
  const { archive } = await ensureRootFolders(api, root)
  const stamp = new Date(ctx.now() + 9 * 3600 * 1000).toISOString().slice(2, 10).replace(/-/g, '')
  const name = `${sanitizeName(projectName || f.name, 100)} (삭제됨 ${stamp})`
  await api.update(f.id, { name }, { addParents: archive, removeParents: f.parents?.[0] })
  return { archived: true, folder_id: f.id }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Phase 4.5 — 지운 항목의 폴더를 그 행사 폴더의 99_archive로 옮긴다(pm, best-effort — 파일은 지우지 않는다).
 * 판정 순서: 요청자가 그 행사의 PM → 항목이 DB에서 이미 지워졌다(살아 있는 항목의 폴더는 못 옮긴다) → 폴더가 이 항목의
 * 표식(appProperties)을 달고 행사 폴더 안에 있다. 공통 영역 항목은 파트 폴더 자체를 쓰므로(표식 없음) 옮기지 않는다 —
 * 다른 항목의 파일까지 딸려 가기 때문이다. 99_archive는 인박스 스캔 제외 파트라 옮긴 파일이 인박스에 다시 뜨지 않는다.
 */
export async function archiveItemOp(ctx: DriveCtx, user: CallerIdentity, body: Record<string, unknown>) {
  const projectId = str(body.project_id, '행사 id', 100)
  const deliverableId = str(body.deliverable_id, '항목 id', 100)
  const folderId = str(body.folder_id, '폴더 id', 200)
  if (!UUID_RE.test(deliverableId)) throw new DriveError(400, 'validation', '항목 id 형식이 올바르지 않습니다.')
  const role = await requireMember(ctx, user, projectId)
  if (role !== 'pm') throw new DriveError(403, 'forbidden', '항목 폴더 보관은 PM만 할 수 있습니다.')
  if (!driveConfigured(ctx.env)) return { archived: false, reason: 'not_configured' }
  if (await ctx.store.deliverableExists(deliverableId)) {
    throw new DriveError(409, 'conflict', '아직 있는 항목의 폴더는 보관할 수 없습니다 — 항목을 먼저 지우세요.')
  }
  const project = await mustProject(ctx, projectId)
  const projectRoot = project.drive_root_folder_id
  if (!projectRoot) return { archived: false, reason: 'no_project_folder' }
  const api = driveApiFor(ctx)
  const f = await api.getFile(folderId)
  if (!f || f.trashed || f.mimeType !== FOLDER_MIME) return { archived: false, reason: 'missing' }
  if (f.appProperties?.[APP_DELIVERABLE_KEY] !== deliverableId) return { archived: false, reason: 'not_item_folder' }
  if (f.id === projectRoot || !(await ancestorIds(api, f, projectRoot)).has(projectRoot)) {
    throw new DriveError(403, 'forbidden', '이 행사 폴더 밖의 폴더입니다.')
  }
  const archive = await ensureChildFolder(api, projectRoot, PART.archive)
  if (f.parents?.includes(archive)) return { archived: true, folder_id: f.id }
  const stamp = new Date(ctx.now() + 9 * 3600 * 1000).toISOString().slice(2, 10).replace(/-/g, '')
  const name = `${sanitizeName(typeof body.title === 'string' && body.title.trim() ? body.title : f.name, 100)} (삭제됨 ${stamp})`
  await api.update(f.id, { name }, { addParents: archive, removeParents: f.parents?.[0] })
  await ctx.store.log(projectId, 'drive.item_archived', 'deliverable', deliverableId, { folder_id: f.id })
  return { archived: true, folder_id: f.id }
}

// ── 업로드 (4MB 조각 중계 — 브라우저→Google 직접 PUT은 CORS로 막힌다) ──────────
interface UploadTicket {
  k: 'up'
  s: string
  d: string
  n: string
  f: string
  o: string
  z: number
  u: string
}

function assertSessionUri(uri: string): void {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    throw new DriveError(403, 'forbidden', '업로드 세션이 올바르지 않습니다.')
  }
  if (u.protocol !== 'https:' || u.hostname !== 'www.googleapis.com' || !u.pathname.startsWith('/upload/drive/v3/files')) {
    throw new DriveError(403, 'forbidden', '업로드 세션이 올바르지 않습니다.')
  }
}

export async function uploadStartOp(
  ctx: DriveCtx,
  jwt: string,
  user: CallerIdentity,
  body: { deliverable_id?: unknown; file_name?: unknown; original_file_name?: unknown; mime_type?: unknown; size?: unknown },
) {
  const deliverableId = str(body.deliverable_id, '항목 id', 100)
  const fileName = sanitizeName(str(body.file_name, '파일 이름'), 200)
  const original = sanitizeName(typeof body.original_file_name === 'string' ? body.original_file_name : fileName, 200)
  const size = Number(body.size)
  if (!Number.isInteger(size) || size < 0) throw new DriveError(400, 'validation', '파일 크기가 올바르지 않습니다.')
  const max = maxUploadBytes(ctx.env)
  if (size > max) throw new DriveError(413, 'validation', `파일이 너무 큽니다 (최대 ${Math.round(max / 1024 / 1024)}MB).`)
  const mimeType = typeof body.mime_type === 'string' && body.mime_type ? body.mime_type.slice(0, 200) : 'application/octet-stream'
  const root = driveRoot(ctx)
  const target = await ctx.store.uploadCheck(jwt, deliverableId)
  const api = driveApiFor(ctx)
  const { folderId } = await ensureItemFolder(api, ctx.store, root, target.project, target.deliverable)
  const nonce = randomUUID()
  const session = await api.startResumable(
    {
      name: fileName,
      parents: [folderId],
      appProperties: { [APP_UPLOAD_KEY]: nonce, [APP_DELIVERABLE_KEY]: deliverableId },
      description: `원본 파일명: ${original}`,
    },
    { mimeType, size },
  )
  await markLive(ctx)
  const ticket: UploadTicket = { k: 'up', s: session, d: deliverableId, n: nonce, f: fileName, o: original, z: size, u: user.authUserId }
  return {
    ticket: signToken({ ...ticket }, key(ctx), UPLOAD_TICKET_TTL, ctx.now()),
    chunk_bytes: CHUNK_BYTES,
    size,
    folder_id: folderId,
  }
}

function progressJson(p: UploadProgress) {
  return p.done
    ? { done: true as const, file_id: p.file.id, name: p.file.name, mime_type: p.file.mimeType, size: Number(p.file.size ?? 0) }
    : { done: false as const, received: p.received }
}

const noToken = async (): Promise<string> => {
  throw new DriveError(500, 'validation', '조각 전송에는 인증 토큰을 쓰지 않습니다.')
}

export async function uploadChunkOp(ctx: DriveCtx, ticketStr: string | null, contentRange: string | null, bytes: Uint8Array) {
  const t = verifyToken<UploadTicket & Record<string, unknown>>(ticketStr ?? '', key(ctx), ctx.now(), 'up')
  assertSessionUri(t.s)
  const api = new DriveApi(noToken, ctx.fetchImpl)
  if (t.z === 0) return progressJson(await api.putChunk(t.s, new Uint8Array(0), 0, -1, 0))
  const m = (contentRange ?? '').match(/^bytes (\d+)-(\d+)\/(\d+)$/)
  if (!m) throw new DriveError(400, 'validation', 'Content-Range 형식이 올바르지 않습니다 (bytes 시작-끝/전체).')
  const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const len = end - start + 1
  if (total !== t.z || end < start || end >= total || bytes.length !== len || len > CHUNK_BYTES) {
    throw new DriveError(400, 'validation', '조각 범위가 파일 크기와 맞지 않습니다.')
  }
  if (end !== total - 1 && len % CHUNK_UNIT !== 0) throw new DriveError(400, 'validation', '마지막이 아닌 조각은 256KB 배수여야 합니다.')
  return progressJson(await api.putChunk(t.s, bytes, start, end, total))
}

export async function uploadStatusOp(ctx: DriveCtx, ticketStr: string) {
  const t = verifyToken<UploadTicket & Record<string, unknown>>(ticketStr, key(ctx), ctx.now(), 'up')
  assertSessionUri(t.s)
  return progressJson(await new DriveApi(noToken, ctx.fetchImpl).uploadStatus(t.s, t.z))
}

export async function uploadCommitOp(
  ctx: DriveCtx,
  jwt: string,
  user: CallerIdentity,
  body: { ticket?: unknown; file_id?: unknown; note?: unknown },
): Promise<VersionRow> {
  const t = verifyToken<UploadTicket & Record<string, unknown>>(str(body.ticket, '업로드 티켓', 8000), key(ctx), ctx.now(), 'up')
  if (t.u !== user.authUserId) throw new DriveError(403, 'forbidden', '다른 사용자의 업로드입니다.')
  const api = driveApiFor(ctx)
  const file = await api.getFile(str(body.file_id, '파일 id', 200))
  if (!file || file.trashed || file.appProperties?.[APP_UPLOAD_KEY] !== t.n) {
    throw new DriveError(409, 'conflict', '업로드된 파일을 확인하지 못했습니다 — 다시 올려 주세요.')
  }
  try {
    return await ctx.store.registerVersion(jwt, {
      deliverable_id: t.d,
      file_name: t.f,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null,
      original_file_name: t.o,
      drive_file_id: file.id,
    })
  } catch (e) {
    // 등록이 거부되면(상태가 바뀜 등) 올라간 파일을 휴지통으로 — 고아 파일을 남기지 않는다(Drive 휴지통 30일 복구 가능)
    await api.update(file.id, { trashed: true }).catch(() => undefined)
    throw e
  }
}

// ── 링크 등록 (§7.2b) ─────────────────────────────────────────────────
export async function linkOp(
  ctx: DriveCtx,
  jwt: string,
  body: { deliverable_id?: unknown; url?: unknown; note?: unknown },
): Promise<{ version: VersionRow; copied: boolean; file_id: string }> {
  const deliverableId = str(body.deliverable_id, '항목 id', 100)
  const parsed = parseDriveLink(typeof body.url === 'string' ? body.url : '')
  if (!parsed) {
    throw new DriveError(400, 'validation', '구글 드라이브 파일 링크를 붙여 주세요 (drive.google.com/file/d/… 또는 docs.google.com/…).')
  }
  if (parsed.kind === 'folder') throw new DriveError(422, 'validation', '폴더 링크입니다 — 등록할 파일의 링크를 붙여 주세요.')
  const root = driveRoot(ctx)
  const target = await ctx.store.uploadCheck(jwt, deliverableId)
  const api = driveApiFor(ctx)
  let file: DriveFile | null = await api.getFile(parsed.id)
  if (file?.mimeType === SHORTCUT_MIME && file.shortcutDetails?.targetId) file = await api.getFile(file.shortcutDetails.targetId)
  if (!file) {
    throw new DriveError(404, 'not_found', '파일을 찾을 수 없습니다 — 링크가 맞는지, MICE Communicator 폴더 안에 있는지 확인하세요.')
  }
  if (file.mimeType === FOLDER_MIME) throw new DriveError(422, 'validation', '폴더 링크입니다 — 등록할 파일의 링크를 붙여 주세요.')
  if (file.trashed) throw new DriveError(409, 'conflict', '휴지통에 있는 파일입니다 — 복원한 뒤 다시 등록하세요.')

  // 루트 밖 파일은 읽어 들이지 않는다 — 연결 계정 권한으로 개인 파일이 새어 나가는 경로 차단
  const { rootId } = await ensureProjectRoot(api, ctx.store, root, target.project)
  const chain = await ancestorIds(api, file, root)
  if (!chain.has(root)) {
    throw new DriveError(
      403,
      'forbidden',
      'MICE Communicator 폴더 밖의 파일은 등록할 수 없습니다 — 먼저 행사 폴더에 올리거나 옮긴 뒤 링크를 붙여 주세요.',
    )
  }
  let fileId = file.id
  let copied = false
  if (!chain.has(rootId)) {
    // 루트 안이지만 이 행사 폴더 밖 → 항목 폴더로 복사(행사 트리를 자기완결로 유지)
    const { folderId } = await ensureItemFolder(api, ctx.store, root, target.project, target.deliverable)
    const copy = await api.copy(file.id, {
      name: sanitizeName(file.name, 200),
      parents: [folderId],
      appProperties: { [APP_DELIVERABLE_KEY]: target.deliverable.id },
    })
    fileId = copy.id
    copied = true
  }
  await markLive(ctx)
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null
  try {
    const version = await ctx.store.registerVersion(jwt, {
      deliverable_id: deliverableId,
      file_name: sanitizeName(file.name, 200),
      note: note ?? (copied ? 'Drive 링크로 등록(항목 폴더로 복사)' : 'Drive 링크로 등록'),
      original_file_name: file.name,
      drive_file_id: fileId,
    })
    return { version, copied, file_id: fileId }
  } catch (e) {
    if (copied) await api.update(fileId, { trashed: true }).catch(() => undefined)
    throw e
  }
}

// ── 파일 보기 (서명 URL 프록시 §7.4) ────────────────────────────────────
export async function fileUrlsOp(ctx: DriveCtx, jwt: string, versionIds: unknown): Promise<{ tokens: Record<string, string | null> }> {
  if (!Array.isArray(versionIds) || versionIds.length > 200 || versionIds.some((v) => typeof v !== 'string')) {
    throw new DriveError(400, 'validation', 'version_ids(최대 200개)가 필요합니다.')
  }
  const tokens: Record<string, string | null> = {}
  for (const id of versionIds as string[]) tokens[id] = null
  if (!driveConfigured(ctx.env) || versionIds.length === 0) return { tokens }
  const rows = await ctx.store.visibleVersions(jwt, versionIds as string[])
  const k = key(ctx)
  for (const r of rows) {
    if (looksLikeDriveFileId(r.drive_file_id)) tokens[r.id] = signToken({ k: 'st', f: r.drive_file_id, n: r.file_name }, k, INTERNAL_URL_TTL, ctx.now())
  }
  return { tokens }
}

/** 발주처(`/c`) — 토큰이 볼 수 있는 버전(컨펌 대기 + 확정본)만 서명 URL. 다른 버전 id는 받지 않는다(목록을 SQL이 정한다) */
export async function clientFileUrlsOp(ctx: DriveCtx, token: unknown): Promise<{ tokens: Record<string, string> }> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new DriveError(404, 'not_found', '유효하지 않은 링크입니다.')
  if (!driveConfigured(ctx.env)) return { tokens: {} }
  const rows = await ctx.store.clientFileVersions(token)
  const k = key(ctx)
  const tokens: Record<string, string> = {}
  for (const r of rows) {
    if (looksLikeDriveFileId(r.drive_file_id)) tokens[r.version_id] = signToken({ k: 'st', f: r.drive_file_id, n: r.file_name }, k, CLIENT_URL_TTL, ctx.now())
  }
  return { tokens }
}

/** 브라우저 안에서 바로 열어도 안전한 형식 — 나머지는 내려받기(attachment)로만 준다(업로드된 HTML·SVG의 스크립트 차단) */
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'text/plain',
])

function rfc5987(s: string): string {
  return encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export async function streamOp(ctx: DriveCtx, t: string | null, range: string | null): Promise<Response> {
  const p = verifyToken<{ f: string; n: string }>(t ?? '', key(ctx), ctx.now(), 'st')
  const api = driveApiFor(ctx)
  const file = await api.getFile(p.f, 'id,name,mimeType,size,trashed')
  if (!file || file.trashed || file.mimeType === FOLDER_MIME) {
    throw new DriveError(404, 'not_found', '파일을 찾을 수 없습니다 — Drive에서 옮겨지거나 삭제됐을 수 있습니다.')
  }
  const native = file.mimeType.startsWith(GOOGLE_NATIVE_PREFIX)
  if (!native && Number(file.size ?? 0) > STREAM_MAX_BYTES) {
    throw new DriveError(413, 'validation', '미리보기 한도(100MB)를 넘는 파일입니다 — 내부 담당자는 Drive에서 직접 여세요.')
  }
  const upstream = native ? await api.exportPdf(file.id) : await api.media(file.id, range)
  const type = native ? 'application/pdf' : upstream.headers.get('content-type') || file.mimeType || 'application/octet-stream'
  const bare = type.split(';')[0].trim().toLowerCase()
  const name = native && !/\.pdf$/i.test(p.n) ? `${p.n}.pdf` : p.n
  const inline = INLINE_TYPES.has(bare)
  const headers = new Headers({
    'content-type': type,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${rfc5987(name)}`,
    'cache-control': 'private, max-age=600',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  // PDF는 크롬 내장 뷰어가 sandbox CSP 아래서 열리지 않는다 — PDF 외에는 스크립트 실행을 원천 차단
  if (bare !== 'application/pdf') {
    headers.set('content-security-policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox")
  }
  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers })
}

// ── 확정 복사 §7.5 ────────────────────────────────────────────────────
/**
 * 승인된 버전을 06_발주처공유로 복사한 **뒤에만** final. 같은 버전의 복사본이 이미 있으면 재사용(재시도 멱등).
 * 원본이 Drive 파일이 아니거나(Phase 4 이전 자리표시) Drive에서 사라졌으면 복사 없이 마감한다(로그로 남김) —
 * 영원히 approved에 묶이지 않게. 복사가 실패하면 3회(지수 백오프) 후 approved 유지 + 실패 로그 → 스캔이 재시도.
 */
export async function snapshotAndFinalize(ctx: DriveCtx, api: DriveApi, t: SnapshotTarget): Promise<'final' | 'skipped' | 'failed'> {
  if (!looksLikeDriveFileId(t.drive_file_id)) {
    await ctx.store.finalizeApproved(t.deliverable_id, null)
    return 'skipped'
  }
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const src = await api.getFile(t.drive_file_id, 'id,trashed')
      if (!src || src.trashed) {
        await ctx.store.finalizeApproved(t.deliverable_id, null)
        await ctx.store.log(t.project.id, 'drive.snapshot_source_missing', 'deliverable', t.deliverable_id, { version_id: t.version_id })
        return 'skipped'
      }
      const { rootId } = await ensureProjectRoot(api, ctx.store, driveRoot(ctx), t.project)
      const shareId = await ensurePartPath(api, rootId, [PART.share])
      const existing = await api.list(
        `'${qEscape(shareId)}' in parents and appProperties has { key='${APP_SNAPSHOT_KEY}' and value='${qEscape(t.version_id)}' } and trashed = false`,
        undefined,
        5,
      )
      const copyId =
        existing.files?.[0]?.id ??
        (
          await api.copy(t.drive_file_id, {
            name: sanitizeName(t.file_name, 200),
            parents: [shareId],
            appProperties: { [APP_SNAPSHOT_KEY]: t.version_id },
          })
        ).id
      await ctx.store.finalizeApproved(t.deliverable_id, copyId)
      return 'final'
    } catch (e) {
      lastErr = e
      if (attempt < 2) await ctx.sleep(400 * 3 ** attempt)
    }
  }
  await ctx.store.log(t.project.id, 'drive.snapshot_failed', 'deliverable', t.deliverable_id, {
    version_id: t.version_id,
    message: message(lastErr).slice(0, 300),
  })
  return 'failed'
}

export async function clientFinalizeOp(ctx: DriveCtx, token: unknown, approvalId: unknown): Promise<{ status: 'noop' | 'final' | 'pending' }> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new DriveError(404, 'not_found', '유효하지 않은 링크입니다.')
  const target = await ctx.store.clientSnapshotTarget(token, str(approvalId, '컨펌 요청 id', 100))
  if (!target) return { status: 'noop' }
  // env에서 Drive 설정 자체가 빠졌으면(운영자가 걷어냄) 승인이 매달리지 않도록 복사 없이 마감
  if (!driveConfigured(ctx.env)) {
    await ctx.store.finalizeApproved(target.deliverable_id, null)
    return { status: 'final' }
  }
  const r = await snapshotAndFinalize(ctx, driveApiFor(ctx), target)
  return { status: r === 'failed' ? 'pending' : 'final' }
}

// ── 인박스 감지 §7.3 (행사 폴더 목록 비교 — 설계서 v2.9 이탈: Changes API 대신) ─────────
export interface ScanResult {
  skipped?: 'not_configured' | 'no_tree' | 'tree_missing'
  added: number
  removed: number
  finalized: number
  failed: number
  scanned: number
}

export async function scanOp(ctx: DriveCtx, user: CallerIdentity, projectId: string): Promise<ScanResult> {
  await requireMember(ctx, user, projectId)
  const empty = { added: 0, removed: 0, finalized: 0, failed: 0, scanned: 0 }
  if (!driveConfigured(ctx.env)) return { ...empty, skipped: 'not_configured' }
  const project = await mustProject(ctx, projectId)
  if (!project.drive_root_folder_id) return { ...empty, skipped: 'no_tree' }
  const api = driveApiFor(ctx)
  const rootFolder = await api.getFile(project.drive_root_folder_id, 'id,mimeType,trashed')
  if (!rootFolder || rootFolder.trashed) return { ...empty, skipped: 'tree_missing' }

  const known = await ctx.store.knownFileIds(projectId)
  const seen = new Set<string>()
  const fresh: { drive_file_id: string; file_name: string; detected_folder: string }[] = []
  const queue: { id: string; path: string }[] = [{ id: rootFolder.id, path: '' }]
  let folders = 0
  let complete = true
  while (queue.length > 0) {
    if (folders >= SCAN_MAX_FOLDERS) {
      complete = false
      break
    }
    const { id, path } = queue.shift()!
    folders++
    const children = await api.listAll(`'${qEscape(id)}' in parents and trashed = false`, 2000)
    for (const f of children) {
      if (f.mimeType === FOLDER_MIME) {
        if (path === '' && SCAN_EXCLUDED_PARTS.includes(f.name)) continue
        queue.push({ id: f.id, path: path ? `${path}/${f.name}` : f.name })
        continue
      }
      if (f.mimeType === SHORTCUT_MIME || f.appProperties?.[APP_SNAPSHOT_KEY]) continue
      seen.add(f.id)
      if (known.has(f.id)) continue
      const inflight = f.appProperties?.[APP_UPLOAD_KEY] && Date.parse(f.createdTime ?? '') > ctx.now() - INFLIGHT_GRACE_MS
      if (inflight) continue
      fresh.push({ drive_file_id: f.id, file_name: f.name, detected_folder: path || '(행사 폴더)' })
    }
  }
  const added = await ctx.store.insertInbox(projectId, fresh)
  // 목록을 끝까지 본 경우에만 사라진 파일을 인박스에서 내린다(부분 스캔으로 멀쩡한 행을 지우지 않게)
  let removed = 0
  if (complete) {
    const gone = (await ctx.store.openInbox(projectId)).filter((r) => !seen.has(r.drive_file_id)).map((r) => r.id)
    await ctx.store.dismissInbox(gone)
    removed = gone.length
  }
  let finalized = 0
  let failed = 0
  for (const t of await ctx.store.pendingSnapshots(projectId)) {
    const r = await snapshotAndFinalize(ctx, api, t)
    if (r === 'failed') failed++
    else finalized++
  }
  return { added, removed, finalized, failed, scanned: seen.size }
}

// ── 견적 스프레드시트 저장 폴더 (Phase 4.2 연동) ────────────────────────
/** 명시 env(GOOGLE_QUOTE_FOLDER_ID)가 있으면 그것, 없으면 저장소 루트의 00_견적서(없으면 만든다) */
export async function quoteFolderFor(ctx: DriveCtx, api: DriveApi): Promise<string> {
  const explicit = (ctx.env as DriveEnv & { GOOGLE_QUOTE_FOLDER_ID?: string }).GOOGLE_QUOTE_FOLDER_ID
  if (explicit) return explicit
  return ensureChildFolder(api, driveRoot(ctx), QUOTE_FOLDER)
}
