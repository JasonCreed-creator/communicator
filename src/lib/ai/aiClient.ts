// api/ai 호출(클라이언트 측) — 설계서 v2.14 §19.5b · Phase 4.8.
// Supabase 세션 액세스 토큰을 Bearer로 싣는다. 쓰는 곳 = SupabaseProvider의 협력사 견적서 불러오기(PDF·사진 분기)뿐 —
// DataProvider 인터페이스 밖의 연동 층(driveClient·notifyClient와 같은 자리매김). 데모 아티팩트에는 SupabaseProvider째 싣지 않는다.
// 키(ANTHROPIC_API_KEY)는 서버에만 있다 — 이 파일은 키를 모르고, Claude를 직접 부르지 않는다.
import { defaultApiBase as apiBaseFor } from '../basePath'
import { ProviderError, type ErrorCode } from '../errors'
import type { AiMediaType, VendorQuoteSourceDoc } from '../vendorQuoteAi'

export interface AiVendorQuoteRead {
  doc: VendorQuoteSourceDoc
  model: string
  /** 오늘 쓴 횟수(이번 포함)·하루 한도 */
  usage: { used: number; limit: number }
}

export interface AiClientOptions {
  accessToken: () => Promise<string | null>
  apiBase?: string
  fetchImpl?: typeof fetch
}

const CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']

function codeFor(status: number, code: unknown): ErrorCode {
  if (CODES.includes(code as ErrorCode)) return code as ErrorCode
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  // 429(하루 한도) = 지금은 더 할 수 없는 상태 — 화면은 문구만 쓴다
  if (status === 409 || status === 429) return 'conflict'
  return 'validation'
}

export function createAiClient(opts: AiClientOptions) {
  const apiBase = (opts.apiBase ?? apiBaseFor(import.meta.env?.VITE_API_BASE as string | undefined)).replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  return {
    async readVendorQuote(input: {
      project_id: string
      file_name: string
      media_type: AiMediaType
      data_base64: string
    }): Promise<AiVendorQuoteRead> {
      const token = await opts.accessToken()
      if (!token) throw new ProviderError('forbidden', '로그인이 필요합니다.')
      let res: Response
      try {
        res = await fetchImpl(`${apiBase}/ai?action=vendor-quote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(input),
        })
      } catch {
        throw new ProviderError('validation', 'AI 서버에 연결할 수 없습니다 — 잠시 후 다시 시도하세요.')
      }
      const body = (await res.json().catch(() => null)) as (AiVendorQuoteRead & { error?: undefined }) | { error?: { code?: string; message?: string } } | null
      if (!res.ok) {
        const err = body && typeof body === 'object' && 'error' in body ? body.error : undefined
        throw new ProviderError(codeFor(res.status, err?.code), err?.message || `AI 읽기에 실패했습니다 (${res.status}).`)
      }
      const ok = body as AiVendorQuoteRead | null
      if (!ok || !ok.doc || !Array.isArray(ok.doc.sections)) throw new ProviderError('validation', 'AI 응답을 해석하지 못했습니다 — 다시 시도하세요.')
      return ok
    },
  }
}

export type AiClient = ReturnType<typeof createAiClient>
