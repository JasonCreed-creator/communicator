// Drive 서버 함수 공용 오류·응답 — 설계서 §8 오류 규약 {error:{code,message}}.
// code는 프론트 ProviderError와 같은 5종만 쓴다(HTTP 상태는 503·413·502처럼 더 세밀할 수 있다).

export type DriveErrorCode = 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'gone'

export class DriveError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: DriveErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DriveError'
  }
}

export function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

export function errorResponse(e: unknown): Response {
  if (e instanceof DriveError) return json(e.status, { error: { code: e.code, message: e.message } })
  const message = e instanceof Error ? e.message : '알 수 없는 오류'
  console.error('[drive] unexpected error:', message)
  return json(500, { error: { code: 'validation', message: `Drive 처리 중 오류가 발생했습니다 — ${message}` } })
}

/** "Drive 연결 전" 안내 — 데모 값으로 흉내 내지 않고 사실대로 503(설계서 §2.1 자격증명 최후 원칙) */
export function notReady(message: string): DriveError {
  return new DriveError(503, 'validation', message)
}
