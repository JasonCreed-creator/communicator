// api/drive HTTP 라우터 — Web 표준 Request → Response. 액션 표는 service.ts 머리말.
//   GET  (파라미터 없음)          → {configured} — 자격증명 값은 절대 내보내지 않는다
//   GET  ?code&state | ?error&state → OAuth 콜백(구글 동의 후 복귀) → /settings?drive=… 로 302
//   GET  ?action=stream&t=…       → 서명 URL 파일 스트림(§7.4)
//   PUT  ?action=upload-chunk     → 조각 중계(헤더 x-upload-ticket · content-range, 본문 = 바이트 ≤ 4MB)
//   PUT  ?action=settlement-file  → v15 협력사 견적서 원본 보관(Bearer · import_id · name, 본문 = 바이트 ≤ 4MB)
//   POST {action, …}              → JSON 액션(로그인 필요한 것은 Authorization: Bearer <Supabase 액세스 토큰>)
import { driveConfigured } from './auth.js'
import { DriveError, errorResponse, json } from './errors.js'
import {
  adoptFolderOp,
  archiveItemOp,
  archiveProjectOp,
  clientFileUrlsOp,
  clientFinalizeOp,
  disconnect,
  driveStatus,
  ensureTreeOp,
  fileUrlsOp,
  linkOp,
  oauthCallback,
  oauthStart,
  requireUser,
  scanOp,
  settlementFileOp,
  streamOp,
  uploadChunkOp,
  uploadCommitOp,
  uploadStartOp,
  uploadStatusOp,
  type DriveCtx,
  type DriveEnv,
} from './service.js'
import { supabaseDriveStore, type DriveStore } from './store.js'

export interface DriveDeps {
  store?: DriveStore
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

function bearer(request: Request): string {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new DriveError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

function makeCtx(env: DriveEnv, deps: DriveDeps): DriveCtx {
  let store = deps.store ?? null
  return {
    env,
    fetchImpl: deps.fetchImpl ?? fetch,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
    // DB 클라이언트는 필요한 액션에서만 만든다 — GET {configured}는 Supabase env 없이도 답한다
    get store(): DriveStore {
      if (!store) store = supabaseDriveStore(env)
      return store
    },
  }
}

export async function handleDriveRequest(request: Request, env: DriveEnv, deps: DriveDeps = {}): Promise<Response> {
  const url = new URL(request.url)
  const action = url.searchParams.get('action') ?? ''
  const ctx = makeCtx(env, deps)
  try {
    if (request.method === 'GET') {
      if (url.searchParams.has('state') && (url.searchParams.has('code') || url.searchParams.has('error'))) {
        return await oauthCallback(ctx, request.url)
      }
      if (action === 'stream') return await streamOp(ctx, url.searchParams.get('t'), request.headers.get('range'))
      return json(200, { configured: driveConfigured(env) })
    }

    if (request.method === 'PUT') {
      if (action === 'settlement-file') {
        // v15(§19.5) 협력사 견적서 원본 — 로그인 세션 + 쿼리(import_id·name), 본문 = 파일 바이트(4MB 이하)
        const jwt = bearer(request)
        await requireUser(ctx, jwt)
        const bytes = new Uint8Array(await request.arrayBuffer())
        return json(
          200,
          await settlementFileOp(
            ctx,
            jwt,
            url.searchParams.get('import_id') ?? '',
            url.searchParams.get('name') ?? '',
            request.headers.get('content-type') ?? 'application/octet-stream',
            bytes,
          ),
        )
      }
      if (action !== 'upload-chunk') return json(405, { error: { code: 'validation', message: '허용되지 않는 요청입니다.' } })
      const bytes = new Uint8Array(await request.arrayBuffer())
      return json(200, await uploadChunkOp(ctx, request.headers.get('x-upload-ticket'), request.headers.get('content-range'), bytes))
    }

    if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'GET·POST·PUT만 허용됩니다.' } })
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const op = typeof body.action === 'string' ? body.action : ''

    // 토큰·티켓 경로(로그인 없음) — 발주처 링크 · 업로드 재개 위치 조회
    if (op === 'client-file-urls') return json(200, await clientFileUrlsOp(ctx, body.token))
    if (op === 'client-finalize') return json(200, await clientFinalizeOp(ctx, body.token, body.approval_id))
    if (op === 'upload-status') return json(200, await uploadStatusOp(ctx, String(body.ticket ?? '')))

    const jwt = bearer(request)
    const user = await requireUser(ctx, jwt)
    switch (op) {
      case 'status':
        return json(200, await driveStatus(ctx, user, request.url))
      case 'oauth-start':
        return json(200, await oauthStart(ctx, user, request.url))
      case 'disconnect':
        return json(200, await disconnect(ctx, user))
      case 'ensure-tree':
        return json(200, await ensureTreeOp(ctx, user, String(body.project_id ?? '')))
      case 'adopt-folder':
        return json(200, await adoptFolderOp(ctx, user, String(body.project_id ?? ''), String(body.url ?? '')))
      case 'archive-project':
        return json(200, await archiveProjectOp(ctx, user, String(body.folder_id ?? ''), String(body.project_name ?? '')))
      case 'archive-item':
        return json(200, await archiveItemOp(ctx, user, body))
      case 'upload-start':
        return json(200, await uploadStartOp(ctx, jwt, user, body))
      case 'upload-commit':
        return json(200, await uploadCommitOp(ctx, jwt, user, body))
      case 'link':
        return json(200, await linkOp(ctx, jwt, body))
      case 'file-urls':
        return json(200, await fileUrlsOp(ctx, jwt, body.version_ids))
      case 'scan':
        return json(200, await scanOp(ctx, user, String(body.project_id ?? '')))
      default:
        return json(400, { error: { code: 'validation', message: `알 수 없는 작업입니다: ${op || '(없음)'}` } })
    }
  } catch (e) {
    return errorResponse(e)
  }
}
