// api/drive 호출(클라이언트 측) — 설계서 v2.9 §7 · Phase 5.
// Supabase 세션 액세스 토큰을 Bearer로 싣는다(발주처 `/c` 토큰 경로·업로드 조각은 토큰 없이 서명 티켓으로).
// 쓰는 곳: SupabaseProvider(업로드·링크 등록·파일 URL·발주처 파일·확정 복사·인박스 스캔·행사 폴더)와
// 행사 설정 ③ Drive 카드(연결 상태·연결하기·행사 폴더). DataProvider 인터페이스 밖의 연동 층이다 —
// 4.2 견적 시트(modules/quote/export/createQuoteSpreadsheet)와 같은 자리매김.
// 데모 아티팩트에는 싣지 않는다(외부 요청 0건 가드) — vite.demo.config.ts가 스텁으로 갈음한다.
import { defaultApiBase as apiBaseFor } from '../basePath'
import { ProviderError, type ErrorCode } from '../errors'
import { humanizeStatusCodes } from '../labels'
import type { Version } from '../../types/entities'

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

export interface DriveFolderResult {
  folder_id: string
  folder_url: string
  created: boolean
}

export interface DriveScanResult {
  skipped?: 'not_configured' | 'no_tree' | 'tree_missing'
  added: number
  removed: number
  finalized: number
  failed: number
  scanned: number
}

export interface DriveUploadParams {
  deliverableId: string
  file: Blob
  /** 규약 파일명(§7.2 — 호출자가 buildVersionFileName으로 만든다) */
  fileName: string
  originalFileName: string
  note?: string
  onProgress?: (sent: number, total: number) => void
}

export interface DriveClientOptions {
  accessToken: () => Promise<string | null>
  apiBase?: string
  fetchImpl?: typeof fetch
  /** 조각 재시도 대기(테스트 주입) */
  sleep?: (ms: number) => Promise<void>
}

const CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']

/** VITE_API_BASE가 없으면 `{기본 경로}api` — 루트 배포면 '/api'(Phase 4.4) */
function defaultApiBase(): string {
  return apiBaseFor(import.meta.env?.VITE_API_BASE as string | undefined)
}

type Progress = { done: false; received: number } | { done: true; file_id: string }

export function createDriveClient(opts: DriveClientOptions) {
  const apiBase = (opts.apiBase ?? defaultApiBase()).replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const endpoint = `${apiBase}/drive`

  async function parse<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => null)) as (T & { error?: undefined }) | { error?: { code?: string; message?: string } } | null
    if (!res.ok) {
      const err = body && typeof body === 'object' && 'error' in body ? body.error : undefined
      const code = CODES.includes(err?.code as ErrorCode) ? (err!.code as ErrorCode) : res.status === 404 ? 'not_found' : 'validation'
      // Phase 4.3.1 — 서버 SQL 가드 문구의 영문 상태 코드는 화면 이름으로
      throw new ProviderError(code, err?.message ? humanizeStatusCodes(err.message) : `Drive 요청에 실패했습니다 (${res.status}).`)
    }
    return body as T
  }

  async function send(init: RequestInit & { url?: string }): Promise<Response> {
    try {
      return await fetchImpl(init.url ?? endpoint, init)
    } catch {
      throw new ProviderError('validation', 'Drive 서버에 연결할 수 없습니다 — 잠시 후 다시 시도하세요.')
    }
  }

  async function post<T>(body: Record<string, unknown>, auth = true): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (auth) {
      const token = await opts.accessToken()
      if (!token) throw new ProviderError('forbidden', '로그인이 필요합니다.')
      headers.authorization = `Bearer ${token}`
    }
    return parse<T>(await send({ method: 'POST', headers, body: JSON.stringify(body) }))
  }

  function streamUrl(token: string): string {
    return `${endpoint}?action=stream&t=${encodeURIComponent(token)}`
  }

  function toUrls(tokens: Record<string, string | null>): Record<string, string | null> {
    const out: Record<string, string | null> = {}
    for (const [id, t] of Object.entries(tokens)) out[id] = t ? streamUrl(t) : null
    return out
  }

  async function putChunk(ticket: string, blob: Blob, offset: number, total: number): Promise<Progress> {
    const range = total === 0 ? 'bytes */0' : `bytes ${offset}-${offset + blob.size - 1}/${total}`
    const res = await send({
      url: `${endpoint}?action=upload-chunk`,
      method: 'PUT',
      headers: { 'x-upload-ticket': ticket, 'content-range': range, 'content-type': 'application/octet-stream' },
      body: blob,
    })
    return parse<Progress>(res)
  }

  /** 네트워크·Drive 일시 오류면 수신 위치를 서버에 물어 이어서 보낸다(최대 3회) */
  async function putChunkWithRetry(ticket: string, blob: Blob, offset: number, total: number): Promise<Progress> {
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await putChunk(ticket, blob, offset, total)
      } catch (e) {
        lastErr = e
        // 만료·권한·형식 오류는 다시 보내도 같다
        if (e instanceof ProviderError && e.code !== 'validation') throw e
        await sleep(500 * 2 ** attempt)
        try {
          const at = await post<Progress>({ action: 'upload-status', ticket }, false)
          if (at.done || at.received !== offset) return at
        } catch {
          /* 상태 조회도 실패 — 같은 조각을 다시 보낸다 */
        }
      }
    }
    throw lastErr
  }

  return {
    streamUrl,

    status: () => post<DriveStatus>({ action: 'status' }),
    oauthStart: () => post<{ url: string; redirect_uri: string }>({ action: 'oauth-start' }),
    disconnect: () => post<{ disconnected: true }>({ action: 'disconnect' }),
    ensureTree: (projectId: string) => post<DriveFolderResult>({ action: 'ensure-tree', project_id: projectId }),
    adoptFolder: (projectId: string, url: string) => post<DriveFolderResult>({ action: 'adopt-folder', project_id: projectId, url }),
    archiveProject: (folderId: string, projectName: string) =>
      post<{ archived: boolean }>({ action: 'archive-project', folder_id: folderId, project_name: projectName }),
    scan: (projectId: string) => post<DriveScanResult>({ action: 'scan', project_id: projectId }),

    async fileUrls(versionIds: string[]): Promise<Record<string, string | null>> {
      if (versionIds.length === 0) return {}
      const r = await post<{ tokens: Record<string, string | null> }>({ action: 'file-urls', version_ids: versionIds })
      return toUrls(r.tokens)
    },

    async clientFileUrls(token: string): Promise<Record<string, string | null>> {
      const r = await post<{ tokens: Record<string, string> }>({ action: 'client-file-urls', token }, false)
      return toUrls(r.tokens)
    },

    clientFinalize: (token: string, approvalId: string) =>
      post<{ status: 'noop' | 'final' | 'pending' }>({ action: 'client-finalize', token, approval_id: approvalId }, false),

    async link(deliverableId: string, url: string, note?: string): Promise<Version> {
      const r = await post<{ version: Version }>({ action: 'link', deliverable_id: deliverableId, url, note: note ?? null })
      return r.version
    },

    /** 4MB 조각 중계 업로드 → 커밋(버전 등록). 진행률은 onProgress(보낸 바이트, 전체) */
    async upload(p: DriveUploadParams): Promise<Version> {
      const start = await post<{ ticket: string; chunk_bytes: number; size: number }>({
        action: 'upload-start',
        deliverable_id: p.deliverableId,
        file_name: p.fileName,
        original_file_name: p.originalFileName,
        mime_type: p.file.type || 'application/octet-stream',
        size: p.file.size,
      })
      const total = p.file.size
      p.onProgress?.(0, total)
      let offset = 0
      let stalled = 0
      let fileId: string | null = null
      while (fileId === null) {
        const end = Math.min(offset + start.chunk_bytes, total)
        const res = await putChunkWithRetry(start.ticket, p.file.slice(offset, end), offset, total)
        if (res.done) {
          fileId = res.file_id
          p.onProgress?.(total, total)
        } else {
          // Google이 일부만 받았으면 받은 위치부터 다시 보낸다. 제자리걸음이 3번 이어지면 무한 반복 대신 멈춘다
          stalled = res.received === offset ? stalled + 1 : 0
          if (stalled >= 3) throw new ProviderError('validation', '파일 조각이 저장되지 않았습니다 — 다시 올려 주세요.')
          offset = res.received
          p.onProgress?.(offset, total)
        }
      }
      return post<Version>({ action: 'upload-commit', ticket: start.ticket, file_id: fileId, note: p.note ?? null })
    },
  }
}

export type DriveClient = ReturnType<typeof createDriveClient>
