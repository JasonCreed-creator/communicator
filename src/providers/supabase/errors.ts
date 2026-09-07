// PostgREST·RPC·Auth 오류 → ProviderError(설계서 §8 {error:{code,message}}) 매핑.
// 프론트는 provider가 던지는 ProviderError만 보므로, mock과 같은 code·한국어 메시지로 맞춘다.
import { ProviderError, type ErrorCode } from '../../lib/errors'

export interface PgErrorLike {
  code?: string | null
  message?: string
  details?: string | null
  hint?: string | null
  status?: number
}

/** RPC가 `raise exception 'CODE: message'`로 던진 접두 코드 → ProviderError code */
const PREFIX_CODES: Record<string, ErrorCode> = {
  VALIDATION: 'validation',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  GONE: 'gone',
  STATUS_TRANSITION_NOT_ALLOWED: 'conflict',
  QUOTE_LOCKED: 'conflict',
  ONBOARDED_AT_IMMUTABLE: 'conflict',
  PROJECT_CLOSED: 'conflict',
  SETTLEMENT_BUCKET_HAS_NO_COST: 'validation',
  AUTH_DOMAIN_NOT_ALLOWED: 'forbidden',
}

/** SQLSTATE → ProviderError code. 앱 정의 P04xx는 HTTP 상태를 그대로 담는다(1300 트리거·1600 RPC) */
const SQLSTATE_CODES: Record<string, ErrorCode> = {
  P0400: 'validation',
  P0403: 'forbidden',
  P0404: 'not_found',
  P0409: 'conflict',
  P0410: 'gone',
  P0422: 'validation',
  '42501': 'forbidden', // insufficient_privilege — RLS 정책 위반·컬럼 권한
  '23505': 'conflict', // unique_violation
  '23503': 'validation', // foreign_key_violation
  '23514': 'validation', // check_violation
  '23502': 'validation', // not_null_violation
  '22P02': 'not_found', // invalid_text_representation — 잘못된 uuid(예: 존재하지 않는 토큰 문자열)
  PGRST116: 'not_found', // .single() 결과 0행
}

function stripPrefix(message: string): { code?: ErrorCode; message: string } {
  const m = message.match(/^([A-Z_]+):\s*(.*)$/s)
  if (m && PREFIX_CODES[m[1]]) return { code: PREFIX_CODES[m[1]], message: m[2] || message }
  return { message }
}

export function mapPgError(err: PgErrorLike | null | undefined, fallback = 'validation' as ErrorCode): ProviderError {
  if (!err) return new ProviderError(fallback, '알 수 없는 오류가 발생했습니다.')
  const raw = err.message ?? ''
  const { code: prefixCode, message } = stripPrefix(raw)
  const byState = err.code ? SQLSTATE_CODES[err.code] : undefined
  const code = prefixCode ?? byState ?? (/row-level security|permission denied/i.test(raw) ? 'forbidden' : fallback)
  const friendly =
    code === 'forbidden' && /row-level security|permission denied/i.test(raw)
      ? '이 작업을 수행할 권한이 없습니다.'
      : message
  return new ProviderError(code, friendly || raw || '요청을 처리하지 못했습니다.')
}

/** PostgREST 응답 {data, error} → data (error면 ProviderError) */
export function unwrap<T>(res: { data: T | null; error: PgErrorLike | null }, notFoundMessage?: string): T {
  if (res.error) {
    const mapped = mapPgError(res.error)
    if (mapped.code === 'not_found' && notFoundMessage) throw new ProviderError('not_found', notFoundMessage)
    throw mapped
  }
  if (res.data === null || res.data === undefined) {
    throw new ProviderError('not_found', notFoundMessage ?? '대상을 찾을 수 없습니다.')
  }
  return res.data
}
