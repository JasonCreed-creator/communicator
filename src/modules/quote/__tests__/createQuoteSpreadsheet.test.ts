// 견적서 → 구글 스프레드시트 클라이언트 헬퍼 계약: 토큰 없음(mock)은 서버를 부르지 않고 안내 오류,
// 있으면 같은 xlsx를 base64로 POST하고 `{error:{code,message}}`의 한국어 메시지를 그대로 전한다.
import { describe, expect, it, vi } from 'vitest'
import {
  blobToBase64,
  createQuoteSpreadsheet,
  GSHEET_NEEDS_SERVER_MSG,
  QuoteSpreadsheetError,
} from '../export/createQuoteSpreadsheet'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createQuoteSpreadsheet', () => {
  const blob = new Blob(['PK-fake-xlsx-bytes'], { type: XLSX_MIME })

  it('blobToBase64 — 바이너리를 그대로 base64로', async () => {
    const b64 = await blobToBase64(blob)
    expect(atob(b64)).toBe('PK-fake-xlsx-bytes')
  })

  it('토큰이 없으면(mock 공급자) 서버를 부르지 않고 안내 오류', async () => {
    const fetchImpl = vi.fn()
    await expect(createQuoteSpreadsheet(blob, 'a.xlsx', null, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      code: 'forbidden',
      message: GSHEET_NEEDS_SERVER_MSG,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POST {apiBase}/quote-gsheet — Bearer·file_name·xlsx_base64 → 결과 매핑', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return jsonResponse(200, {
        url: 'https://docs.google.com/spreadsheets/d/abc/edit',
        spreadsheet_id: 'abc',
        file_name: '리멤버견적서_X_260910',
        shared_with: 'sales@example.com',
      })
    }) as unknown as typeof fetch
    const result = await createQuoteSpreadsheet(blob, '리멤버견적서_X_260910.xlsx', 'tok', { apiBase: '/api', fetchImpl })
    expect(result).toEqual({
      url: 'https://docs.google.com/spreadsheets/d/abc/edit',
      spreadsheet_id: 'abc',
      file_name: '리멤버견적서_X_260910',
      shared_with: 'sales@example.com',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/quote-gsheet')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    const body = JSON.parse(String(calls[0].init.body)) as { file_name: string; xlsx_base64: string }
    expect(body.file_name).toBe('리멤버견적서_X_260910.xlsx')
    expect(atob(body.xlsx_base64)).toBe('PK-fake-xlsx-bytes')
  })

  it('503(자격증명 미설정) → unavailable + 서버의 한국어 메시지 그대로', async () => {
    const fetchImpl = (async () => jsonResponse(503, { error: { code: 'validation', message: '구글 스프레드시트 생성이 아직 준비되지 않았습니다 — …' } })) as unknown as typeof fetch
    await expect(createQuoteSpreadsheet(blob, 'a.xlsx', 'tok', { fetchImpl })).rejects.toMatchObject({
      code: 'unavailable',
      message: '구글 스프레드시트 생성이 아직 준비되지 않았습니다 — …',
    })
  })

  it('403 → forbidden · 네트워크 실패 → network', async () => {
    const forbidden = (async () => jsonResponse(403, { error: { code: 'forbidden', message: '견적 메뉴는 영업·관리자 권한이 필요합니다.' } })) as unknown as typeof fetch
    await expect(createQuoteSpreadsheet(blob, 'a.xlsx', 'tok', { fetchImpl: forbidden })).rejects.toBeInstanceOf(QuoteSpreadsheetError)
    await expect(createQuoteSpreadsheet(blob, 'a.xlsx', 'tok', { fetchImpl: forbidden })).rejects.toMatchObject({ code: 'forbidden' })
    const down = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(createQuoteSpreadsheet(blob, 'a.xlsx', 'tok', { fetchImpl: down })).rejects.toMatchObject({ code: 'network' })
  })
})
