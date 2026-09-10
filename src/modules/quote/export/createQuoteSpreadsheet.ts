// 견적서 → 구글 스프레드시트 생성(클라이언트 측) — 2026-09-10 사용자 지시.
// provider.exportQuoteXlsx가 만든 **같은 xlsx blob**을 서버 함수(POST /api/quote-gsheet)에 넘기고, 서버가 서비스 계정으로
// Drive에 스프레드시트로 변환 업로드한 뒤 링크를 돌려준다. DataProvider 인터페이스(125메서드)는 손대지 않는다 —
// 시트 생성은 "내보내기의 저장 방식" 하나가 늘어난 것이라 saveQuoteFile과 같은 층(modules/quote/export)에 둔다.
// mock 공급자에는 세션 토큰이 없어(accessToken=null) 실서버 모드에서만 동작한다 — 화면은 그 사실을 문구로 알린다.

export interface QuoteSpreadsheetResult {
  url: string
  spreadsheet_id: string
  file_name: string
  shared_with: string | null
}

export type QuoteSpreadsheetErrorCode = 'unavailable' | 'forbidden' | 'validation' | 'network'

export class QuoteSpreadsheetError extends Error {
  constructor(
    public readonly code: QuoteSpreadsheetErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'QuoteSpreadsheetError'
  }
}

export const GSHEET_NEEDS_SERVER_MSG =
  '구글 스프레드시트 생성은 실서버(로그인) 모드에서만 가능합니다 — 지금은 Excel로 내려받으세요.'

/** Blob → base64 (FileReader 없이 — 테스트·워커 환경 공통) */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function defaultApiBase(): string {
  const base = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api'
  return base.replace(/\/$/, '')
}

export interface CreateQuoteSpreadsheetOptions {
  apiBase?: string
  fetchImpl?: typeof fetch
}

/**
 * xlsx blob을 구글 스프레드시트로 만든다. accessToken이 없으면(mock 공급자) 즉시 안내 오류.
 * 서버 오류 본문 `{error:{code,message}}`의 한국어 메시지를 그대로 전달한다.
 */
export async function createQuoteSpreadsheet(
  blob: Blob,
  fileName: string,
  accessToken: string | null,
  options: CreateQuoteSpreadsheetOptions = {},
): Promise<QuoteSpreadsheetResult> {
  if (!accessToken) throw new QuoteSpreadsheetError('forbidden', GSHEET_NEEDS_SERVER_MSG)
  const apiBase = options.apiBase ?? defaultApiBase()
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = `${apiBase}/quote-gsheet`
  const xlsx_base64 = await blobToBase64(blob)
  let res: Response
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ file_name: fileName, xlsx_base64 }),
    })
  } catch {
    throw new QuoteSpreadsheetError('network', '견적 서버에 연결할 수 없습니다 — 잠시 후 다시 시도하세요.')
  }
  const json = (await res.json().catch(() => null)) as
    | (QuoteSpreadsheetResult & { error?: undefined })
    | { error?: { code?: string; message?: string } }
    | null
  if (!res.ok) {
    const message = json && 'error' in json && json.error?.message ? json.error.message : `구글 스프레드시트 생성에 실패했습니다 (${res.status}).`
    const code: QuoteSpreadsheetErrorCode = res.status === 503 ? 'unavailable' : res.status === 401 || res.status === 403 ? 'forbidden' : 'validation'
    throw new QuoteSpreadsheetError(code, message)
  }
  if (!json || !('url' in json) || typeof json.url !== 'string') {
    throw new QuoteSpreadsheetError('validation', '서버 응답에 스프레드시트 링크가 없습니다.')
  }
  return { url: json.url, spreadsheet_id: json.spreadsheet_id, file_name: json.file_name, shared_with: json.shared_with ?? null }
}
