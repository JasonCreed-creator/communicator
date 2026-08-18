// 오류 규약 — 설계서 §8: 오류는 {error: {code, message}}. CLAUDE.md §6 에러 응답 포맷 통일.

export type ErrorCode =
  | 'validation' // 400 — 입력·발송 조건 위반 (예: 미리보기 포맷 아님, 코멘트 누락)
  | 'forbidden' // 403 — 역할·영역 불일치 (예: pm 아닌 컨펌 발송)
  | 'not_found' // 404
  | 'conflict' // 409 — §5 전이표 밖 상태 전이
  | 'gone' // 410 — 만료·회수 토큰

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
}

export class ProviderError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } }
  }
}

export function isProviderError(e: unknown): e is ProviderError {
  return e instanceof ProviderError
}
