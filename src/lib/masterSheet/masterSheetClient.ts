// api/master-sheet 호출(클라이언트 측) — 설계서 v2.21 §27.5 · Phase 6.11 PR-G.
// 쓰는 곳: S9 운영계획서 발행 줄 '마스터 시트 만들기'. DataProvider 인터페이스 밖의 연동 층(driveClient·notifyClient·intakeClient와 같은
// 자리 — quote-gsheet 전례). 앱은 만든 시트를 다시 읽지 않는다(R-M1). 데모 아티팩트에는 싣지 않는다(vite.demo.config.ts 스텁).
import { defaultApiBase as apiBaseFor } from '../basePath'
import { ProviderError, type ErrorCode } from '../errors'
import type { MasterSheetResult } from './types'

export interface MasterSheetClientOptions {
  accessToken: () => Promise<string | null>
  apiBase?: string
  fetchImpl?: typeof fetch
}

const CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']

function codeFor(status: number, code: unknown): ErrorCode {
  if (CODES.includes(code as ErrorCode)) return code as ErrorCode
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409 || status === 429) return 'conflict'
  return 'validation'
}

export function createMasterSheetClient(opts: MasterSheetClientOptions) {
  const base = `${(opts.apiBase ?? apiBaseFor(import.meta.env?.VITE_API_BASE as string | undefined)).replace(/\/$/, '')}/master-sheet`
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  return {
    /** Drive env가 설정돼 있는가(연결 여부는 만들 때 사실대로 판정) */
    async status(): Promise<{ ready: boolean }> {
      const res = await fetchImpl(base, { method: 'GET' })
      if (!res.ok) throw new ProviderError('conflict', `마스터 시트 서버 오류(${res.status})`)
      const data = (await res.json()) as Partial<{ ready: boolean }>
      return { ready: Boolean(data.ready) }
    },
    /** 행사 하나 → 새 스프레드시트(행사 폴더 04_WBS·운영계획) · 링크 */
    async create(projectId: string): Promise<MasterSheetResult> {
      const token = await opts.accessToken()
      if (!token) throw new ProviderError('forbidden', '로그인이 필요합니다.')
      let res: Response
      try {
        res = await fetchImpl(base, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_id: projectId }),
        })
      } catch {
        throw new ProviderError('validation', '마스터 시트 서버에 연결할 수 없습니다 — 잠시 후 다시 시도하세요.')
      }
      const data = (await res.json().catch(() => null)) as (MasterSheetResult & { error?: undefined }) | { error?: { code?: string; message?: string } } | null
      if (!res.ok) {
        const err = data && typeof data === 'object' && 'error' in data ? data.error : undefined
        throw new ProviderError(codeFor(res.status, err?.code), err?.message || `마스터 시트 서버 오류(${res.status}).`)
      }
      if (!data || !('url' in data) || typeof data.url !== 'string') throw new ProviderError('validation', '서버 응답에 시트 링크가 없습니다.')
      return { url: data.url, spreadsheet_id: data.spreadsheet_id, file_name: data.file_name, tabs: Array.isArray(data.tabs) ? data.tabs : [] }
    },
  }
}

export type MasterSheetClient = ReturnType<typeof createMasterSheetClient>
