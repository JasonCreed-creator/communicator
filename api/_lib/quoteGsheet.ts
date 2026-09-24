// 견적서 → 구글 스프레드시트 생성(2026-09-10 사용자 지시 "구글스프레드시트로 생성도 가능하고 엑셀로도 다운받을 수 있게").
// Vercel Function(api/quote-gsheet.ts)이 이 순수 핸들러를 감싼다.
//
// 흐름: ① 사용자 JWT 검증 → profiles.app_role admin·sales 확인(견적 금액 지면 — §6.1·DoD 25)
//       ② 클라이언트가 만든 xlsx(= provider.exportQuoteXlsx와 같은 파일)를 받아
//       ③ Drive에 **스프레드시트로 변환 업로드**(mimeType=application/vnd.google-apps.spreadsheet)
//       ④ (서비스 계정 경로일 때만) 요청자 이메일에 편집 권한을 걸어(best-effort) 링크를 돌려준다.
// 자격증명 2경로(v2.9 · 2026-09-24):
//   ⓐ 저장소 Drive(Phase 5 — api/drive와 같은 연결): DRIVE_ROOT_FOLDER_ID + OAuth 연결(또는 공유 드라이브 서비스 계정).
//      저장 폴더 = GOOGLE_QUOTE_FOLDER_ID가 있으면 그것, 없으면 저장소 루트의 00_견적서. 파일은 회사 폴더 권한을 그대로
//      물려받으므로 요청자 개별 공유를 하지 않는다(GOOGLE_QUOTE_SHARE_WITH_REQUESTER=true로만 켠다).
//   ⓑ 4.2 서비스 계정 경로: GOOGLE_SHEETS_SA_JSON + GOOGLE_QUOTE_FOLDER_ID(공유 드라이브 폴더여야 한다 — 서비스 계정은 저장
//      용량이 없어 내 드라이브 폴더에는 파일을 만들 수 없다. Google 공식 문서, 2026-09-24 확인).
// 둘 다 없으면 503으로 "아직 준비되지 않음"을 사실대로 알린다 — 데모 값으로 흉내 내지 않는다.
// 금액 비노출(§12): 이 경로는 admin·sales 로그인 사용자만 부르고, 산출물은 서비스 계정 폴더 + 요청자에게만 공유된다.
// "anyone with link" 권한은 어떤 경우에도 만들지 않는다(CLAUDE.md §6).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { driveAccessToken, driveAuthMode, driveConfigured, refreshTokenFor, type DriveAuthEnv } from './drive/auth.js'
import { DriveError } from './drive/errors.js'
import { DriveApi } from './drive/googleDrive.js'
import { ensureChildFolder, QUOTE_FOLDER } from './drive/tree.js'
import { googleAccessToken, type ServiceAccount } from './sheets.js'

export interface GsheetRequest {
  /** 내려받기 파일명(…​.xlsx) — 스프레드시트 제목은 확장자를 뗀 값 */
  file_name: string
  /** ExcelJS가 만든 xlsx 바이너리(base64) */
  xlsx_base64: string
}

export interface GsheetResult {
  url: string
  spreadsheet_id: string
  file_name: string
  /** 편집 권한을 건 요청자 이메일(실패·미설정이면 null) */
  shared_with: string | null
}

export interface GsheetEnv extends DriveAuthEnv {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** 구글 서비스 계정 JSON 전문(client_email·private_key) — 등록 시트 읽기와 공유 */
  GOOGLE_SHEETS_SA_JSON?: string
  /** 견적 스프레드시트를 만들 Drive 폴더 id */
  GOOGLE_QUOTE_FOLDER_ID?: string
  /**
   * 요청자 개별 공유. 서비스 계정 경로는 기본 켜짐('false'로 끔), 저장소 Drive(OAuth) 경로는 기본 꺼짐('true'로 켬) —
   * OAuth 경로의 파일은 회사 폴더 권한을 그대로 물려받는다.
   */
  GOOGLE_QUOTE_SHARE_WITH_REQUESTER?: string
}

export class GsheetError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'validation' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message)
  }
}

export interface GsheetDeps {
  userClient: (accessToken: string) => SupabaseClient
  adminClient: () => SupabaseClient
  fetchImpl: typeof fetch
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet'
/** 업로드 상한(디코딩 후) — 견적서는 ~100KB, 여유 있게 4MB(Vercel 본문 한도 4.5MB 아래) */
export const MAX_XLSX_BYTES = 4 * 1024 * 1024

export function depsFromEnv(env: GsheetEnv, fetchImpl: typeof fetch = fetch): GsheetDeps {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !secret || !publishable) {
    throw new GsheetError(500, 'validation', '서버 자격증명이 설정되지 않았습니다 (SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY).')
  }
  return {
    userClient: (token) =>
      createClient(url, publishable, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    adminClient: () => createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
    fetchImpl,
  }
}

export function parseBearer(header: string | null | undefined): string {
  const m = (header ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new GsheetError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

/** 파일명 정리 — 경로 구분자·제어문자 제거, 확장자 .xlsx 보장 */
export function safeFileName(name: string): string {
  const base = String(name ?? '')
    .replace(/[\\/\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  const stem = base.replace(/\.xlsx$/i, '') || '견적서'
  return `${stem}.xlsx`
}

export function spreadsheetTitle(fileName: string): string {
  return safeFileName(fileName).replace(/\.xlsx$/i, '')
}

/** 자격증명 유무 — 화면이 버튼 상태를 미리 알 수 있도록 GET으로도 노출한다(연결 여부는 POST에서 사실대로 판정) */
export function gsheetReady(env: GsheetEnv): boolean {
  return driveConfigured(env) || Boolean(env.GOOGLE_SHEETS_SA_JSON && env.GOOGLE_QUOTE_FOLDER_ID)
}

/** 저장소 Drive의 갱신 토큰(Vault) 읽기·연결 오류 기록 — api/drive와 같은 service RPC */
function vaultTokenStore(admin: SupabaseClient) {
  return {
    async readRefreshToken(): Promise<string | null> {
      const { data, error } = await admin.rpc('drive_token_read')
      if (error) throw new Error(error.message)
      return (data as string | null) ?? null
    },
    async recordConnectionError(message: string): Promise<void> {
      await admin.rpc('drive_connection_error', { p_message: message.slice(0, 500) })
    },
  }
}

function fromDriveError(e: unknown): never {
  if (e instanceof DriveError) throw new GsheetError(e.status, e.code === 'gone' ? 'validation' : e.code, e.message)
  throw e
}

function multipartBody(boundary: string, metadata: Record<string, unknown>, bytes: Uint8Array): Uint8Array {
  const enc = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`,
  )
  const tail = enc.encode(`\r\n--${boundary}--`)
  const out = new Uint8Array(head.length + bytes.length + tail.length)
  out.set(head, 0)
  out.set(bytes, head.length)
  out.set(tail, head.length + bytes.length)
  return out
}

export async function createQuoteSpreadsheetOnDrive(
  body: GsheetRequest,
  accessToken: string,
  env: GsheetEnv,
  deps: GsheetDeps,
): Promise<GsheetResult> {
  if (!body || typeof body.file_name !== 'string' || typeof body.xlsx_base64 !== 'string' || !body.xlsx_base64) {
    throw new GsheetError(400, 'validation', '요청 형식이 올바르지 않습니다 (file_name·xlsx_base64).')
  }
  // ① 사용자 확인 + app_role 게이트(§6.1) — 금액 지면
  const user = deps.userClient(accessToken)
  const { data: authData, error: authErr } = await user.auth.getUser(accessToken)
  if (authErr || !authData.user) throw new GsheetError(401, 'forbidden', '로그인이 필요합니다.')
  const admin = deps.adminClient()
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('id, app_role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()
  if (pErr || !profile) throw new GsheetError(403, 'forbidden', '프로필이 없습니다 — 다시 로그인하세요.')
  if (profile.app_role !== 'admin' && profile.app_role !== 'sales') {
    throw new GsheetError(403, 'forbidden', '견적 메뉴는 영업·관리자 권한이 필요합니다.')
  }

  // ② 자격증명 — 저장소 Drive(ⓐ) → 4.2 서비스 계정(ⓑ) 순. 둘 다 없으면 사실대로 503
  const tokenStore = vaultTokenStore(admin)
  const storageDrive =
    driveConfigured(env) && (driveAuthMode(env) === 'service_account' || Boolean(await refreshTokenFor(env, tokenStore)))
  const legacySa = Boolean(env.GOOGLE_SHEETS_SA_JSON && env.GOOGLE_QUOTE_FOLDER_ID)
  if (!storageDrive && !legacySa) {
    throw new GsheetError(
      503,
      'validation',
      driveConfigured(env)
        ? '구글 스프레드시트 생성은 Drive 연결 후에 가능합니다 — 관리자가 행사 설정 ③에서 Drive를 연결하세요. 지금은 Excel로 내려받을 수 있습니다.'
        : '구글 스프레드시트 생성이 아직 준비되지 않았습니다 — 서버 env(Drive 저장소 또는 GOOGLE_SHEETS_SA_JSON·GOOGLE_QUOTE_FOLDER_ID)를 설정하세요. 지금은 Excel로 내려받을 수 있습니다.',
    )
  }
  let sa: ServiceAccount | null = null
  if (!storageDrive) {
    try {
      sa = JSON.parse(env.GOOGLE_SHEETS_SA_JSON!) as ServiceAccount
      if (!sa.client_email || !sa.private_key) throw new Error('missing fields')
    } catch {
      throw new GsheetError(500, 'validation', 'GOOGLE_SHEETS_SA_JSON 형식이 올바르지 않습니다 (client_email·private_key).')
    }
  }

  // ③ xlsx 디코드 + 상한
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(Buffer.from(body.xlsx_base64, 'base64'))
  } catch {
    throw new GsheetError(400, 'validation', 'xlsx_base64를 해독할 수 없습니다.')
  }
  if (bytes.length === 0) throw new GsheetError(400, 'validation', '빈 파일입니다.')
  if (bytes.length > MAX_XLSX_BYTES) throw new GsheetError(413, 'validation', '파일이 너무 큽니다 (최대 4MB).')

  // ④ Drive 업로드 + 스프레드시트 변환
  let token: string
  let folderId: string
  if (storageDrive) {
    try {
      token = await driveAccessToken(env, tokenStore, deps.fetchImpl, Date.now())
      folderId =
        env.GOOGLE_QUOTE_FOLDER_ID ||
        (await ensureChildFolder(new DriveApi(async () => token, deps.fetchImpl), env.DRIVE_ROOT_FOLDER_ID!, QUOTE_FOLDER))
    } catch (e) {
      fromDriveError(e)
    }
  } else {
    token = await googleAccessToken(sa!, deps.fetchImpl, DRIVE_SCOPE)
    folderId = env.GOOGLE_QUOTE_FOLDER_ID!
  }
  const title = spreadsheetTitle(body.file_name)
  const boundary = `communicator-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const metadata = { name: title, mimeType: GSHEET_MIME, parents: [folderId] }
  const upload = await deps.fetchImpl(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body: multipartBody(boundary, metadata, bytes),
    },
  )
  if (upload.status === 403 || upload.status === 404) {
    throw new GsheetError(
      403,
      'forbidden',
      storageDrive
        ? `견적서 폴더(${env.GOOGLE_QUOTE_FOLDER_ID ? 'GOOGLE_QUOTE_FOLDER_ID' : QUOTE_FOLDER})에 쓸 수 없습니다 — Drive 연결 계정의 폴더 권한을 확인하세요.`
        : '저장 폴더에 쓸 수 없습니다 — GOOGLE_QUOTE_FOLDER_ID 폴더에 서비스 계정을 편집자로 초대했는지 확인하세요.',
    )
  }
  if (!upload.ok) throw new GsheetError(502, 'validation', `구글 드라이브 업로드 실패 (${upload.status}).`)
  const created = (await upload.json()) as { id: string; name?: string; webViewLink?: string }
  if (!created?.id) throw new GsheetError(502, 'validation', '구글 드라이브가 파일 id를 돌려주지 않았습니다.')
  const url = created.webViewLink ?? `https://docs.google.com/spreadsheets/d/${created.id}/edit`

  // ⑤ 요청자 공유(best-effort) — 특정 사용자에게만. "링크가 있는 모든 사용자" 권한은 만들지 않는다.
  //   서비스 계정 경로(파일 주인이 서비스 계정)만 기본 공유 — OAuth 저장소 경로는 회사 폴더 권한을 물려받는다
  let sharedWith: string | null = null
  const requester = authData.user.email ?? null
  const saOwned = !storageDrive || driveAuthMode(env) === 'service_account'
  const shareWanted = saOwned ? env.GOOGLE_QUOTE_SHARE_WITH_REQUESTER !== 'false' : env.GOOGLE_QUOTE_SHARE_WITH_REQUESTER === 'true'
  if (requester && shareWanted) {
    try {
      const perm = await deps.fetchImpl(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(created.id)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: requester }),
        },
      )
      if (perm.ok) sharedWith = requester
      else console.warn(`[quote-gsheet] share with requester failed (${perm.status})`)
    } catch (e) {
      console.warn('[quote-gsheet] share with requester failed:', e instanceof Error ? e.message : e)
    }
  }
  return { url, spreadsheet_id: created.id, file_name: `${created.name ?? title}`, shared_with: sharedWith }
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

/** Web 표준 Request → Response. GET은 준비 상태만(자격증명 값은 절대 돌려주지 않는다) */
export async function handleGsheetRequest(request: Request, env: GsheetEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method === 'GET') return json(200, { ready: gsheetReady(env) })
  if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'POST만 허용됩니다.' } })
  try {
    const accessToken = parseBearer(request.headers.get('authorization'))
    const body = (await request.json().catch(() => null)) as GsheetRequest | null
    if (!body) throw new GsheetError(400, 'validation', 'JSON 본문이 필요합니다.')
    const deps = depsFromEnv(env, fetchImpl)
    const result = await createQuoteSpreadsheetOnDrive(body, accessToken, env, deps)
    return json(200, result)
  } catch (e) {
    if (e instanceof GsheetError) return json(e.status, { error: { code: e.code, message: e.message } })
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return json(500, { error: { code: 'validation', message } })
  }
}
