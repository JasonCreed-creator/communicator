// 데모 아티팩트 전용 스텁 — 견적서 → 구글 스프레드시트 생성은 서버 함수(/api/quote-gsheet)를 부르는 경로라
// 단일 파일 아티팩트(외부 요청 0건 · fetch 호출부 1건 가드)에는 싣지 않는다. 데모는 mock 공급자라 화면이 이 함수를
// 부르기 전에 "실서버 모드에서만 가능" 안내로 끝난다(useQuoteSpreadsheet). 실제 앱 빌드(vite.config.ts)는 alias가 없다.
export type QuoteSpreadsheetResult = { url: string; spreadsheet_id: string; file_name: string; shared_with: string | null }
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

export async function blobToBase64(): Promise<string> {
  throw new Error('데모 아티팩트는 mock 공급자 전용입니다 — 구글 스프레드시트 생성은 앱 빌드(실서버 모드)에서만 유효합니다.')
}

export async function createQuoteSpreadsheet(): Promise<QuoteSpreadsheetResult> {
  throw new QuoteSpreadsheetError('forbidden', GSHEET_NEEDS_SERVER_MSG)
}
