// 마스터 시트 내보내기 서버 — POST /api/master-sheet (설계서 v2.21 §27.5 · Phase 6.11 PR-G).
// 순서: ① 로그인(JWT) ② 행사 멤버(전역 admin = pm — Phase 6.8 규칙) ③ Drive 설정·연결 확인(없으면 503 — 흉내 내지 않는다)
//       ④ 사용자 JWT로 RLS 아래 읽기(reader) → 조립(src/lib/masterSheet/build — 견적·정산 탭은 pm·admin만 R-M3)
//       ⑤ 행사 폴더 04_WBS·운영계획에 빈 스프레드시트(Drive 네이티브 · 앱 산출물 표식 — 인박스 제외) ⑥ Sheets API로 탭·값 채우기
//          (실패하면 빈 파일을 휴지통으로 — 반쪽 파일을 남기지 않는다) ⑦ 로그 `master_sheet.exported`(파일 이름·탭 이름만) ⑧ 링크 응답.
// GET은 `{ready}`(Drive env 설정 여부)만 — 자격증명 값은 어떤 경우에도 내보내지 않는다. 앱은 이 시트를 다시 읽지 않는다(R-M1).
import { buildMasterSheet } from '../../../src/lib/masterSheet/build.js'
import type { MasterSheetResult } from '../../../src/lib/masterSheet/types'
import { driveAccessToken, driveAuthMode, driveConfigured, NOT_CONFIGURED_MESSAGE, NOT_CONNECTED_MESSAGE, refreshTokenFor } from '../drive/auth.js'
import { DriveError, errorResponse, json, notReady } from '../drive/errors.js'
import { driveApiFor, requireMember, requireUser, type DriveCtx, type DriveEnv } from '../drive/service.js'
import { supabaseDriveStore, type DriveStore, type ProjectRow } from '../drive/store.js'
import { APP_EXPORT_KEY, ensurePartPath, ensureProjectRoot, PART } from '../drive/tree.js'
import { supabaseMasterSheetReader, type MasterSheetReader } from './reader.js'
import { fillSpreadsheet } from './sheets.js'

export const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const UUID_RE = /^[0-9a-f-]{36}$/i

export interface MasterSheetDeps {
  store?: DriveStore
  /** 사용자 JWT → 읽기(테스트는 메모리 구현) */
  reader?: (jwt: string) => MasterSheetReader
  fetchImpl?: typeof fetch
  now?: () => number
}

function bearer(request: Request): string {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new DriveError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

/** KST 기준 오늘(YYYY-MM-DD) — 파일 이름·지연 판정 */
export function kstToday(nowMs: number): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`
}

function makeCtx(env: DriveEnv, deps: MasterSheetDeps): DriveCtx {
  let store: DriveStore | null = deps.store ?? null
  return {
    env,
    fetchImpl: deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args)),
    now: deps.now ?? (() => Date.now()),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    get store(): DriveStore {
      if (!store) store = supabaseDriveStore(env)
      return store
    },
  }
}

export async function createMasterSheet(ctx: DriveCtx, jwt: string, projectId: string, readerFor: (jwt: string) => MasterSheetReader): Promise<MasterSheetResult> {
  const user = await requireUser(ctx, jwt)
  const role = await requireMember(ctx, user, projectId)
  if (!driveConfigured(ctx.env)) throw notReady(NOT_CONFIGURED_MESSAGE)
  if (driveAuthMode(ctx.env) === 'oauth' && !(await refreshTokenFor(ctx.env, ctx.store))) throw notReady(NOT_CONNECTED_MESSAGE)

  const includeMoney = role === 'pm' || user.appRole === 'admin'
  const reader = readerFor(jwt)
  const source = await reader.read(projectId, { include_money: includeMoney })
  if (!source) throw new DriveError(404, 'not_found', '행사를 찾을 수 없습니다.')
  const sheet = buildMasterSheet(source, { today: kstToday(ctx.now()), include_money: includeMoney })

  const api = driveApiFor(ctx)
  const token = await driveAccessToken(ctx.env, ctx.store, ctx.fetchImpl, ctx.now())
  const p = source.project
  const row: ProjectRow = { id: p.id, code: p.code, name: p.name, organizer: p.organizer, event_date: p.event_date, status: p.status, drive_root_folder_id: p.drive_root_folder_id }
  const { rootId } = await ensureProjectRoot(api, ctx.store, ctx.env.DRIVE_ROOT_FOLDER_ID!, row)
  const folderId = await ensurePartPath(api, rootId, [PART.plan])
  const file = await api.createFile(sheet.title, GSHEET_MIME, folderId, { [APP_EXPORT_KEY]: 'master_sheet', communicator_project_id: p.id })
  try {
    await fillSpreadsheet(ctx.fetchImpl, token, file.id, sheet)
  } catch (e) {
    // 반쪽 파일을 남기지 않는다 — 휴지통(best-effort) 뒤 원래 오류를 그대로
    await api.update(file.id, { trashed: true }).catch(() => undefined)
    throw e
  }
  const tabs = sheet.tabs.map((t) => t.title)
  await reader.log(projectId, `user:${user.profileId}`, { file_name: sheet.title, tabs }).catch(() => undefined)
  return { url: spreadsheetUrl(file.id), spreadsheet_id: file.id, file_name: sheet.title, tabs }
}

export async function handleMasterSheetRequest(request: Request, env: DriveEnv, deps: MasterSheetDeps = {}): Promise<Response> {
  const ctx = makeCtx(env, deps)
  try {
    if (request.method === 'GET') return json(200, { ready: driveConfigured(env) })
    if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'GET·POST만 허용됩니다.' } })
    const jwt = bearer(request)
    const body = ((await request.json().catch(() => null)) ?? {}) as { project_id?: unknown }
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : ''
    if (!UUID_RE.test(projectId)) throw new DriveError(400, 'validation', 'project_id가 필요합니다.')
    const readerFor = deps.reader ?? ((token: string) => supabaseMasterSheetReader(env, token))
    return json(200, await createMasterSheet(ctx, jwt, projectId, readerFor))
  } catch (e) {
    return errorResponse(e)
  }
}
