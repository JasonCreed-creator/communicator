// DoD 89 (Phase 6.4 PR-2 · 설계서 v2.18 §22.5) — 견적서(국문·영문) PDF·사진을 AI(Claude)로 읽어 견적서 가져오기 확인 큐에 넣는다.
// 가짜 사용 기록 저장소·가짜 읽기 함수로 돈다(실 DB의 권한·한도 판정은 supabase:check 'AI 한도 quote_import' 4항목). Claude는 부르지 않는다.
//   ① 스키마·규칙: 구조화 출력 규약(모든 객체 additionalProperties:false + 모든 키 required · 숫자 범위 제약 없음) · 개인정보 칸 0(담당자 칸 없음) ·
//      규칙 문장(국/영문 · 추측 금지 · 환산 금지 · 개인정보 금지 · 합계 계산 금지)
//   ② 결과 검사·변환: 정수 금액·자릿수·비율·통화 코드·개수 · ParsedQuoteDoc(format 'ai') · 헤더 5필드 + 대표 총액 · 검산은 우리 코드(외화는 부가세 10% 검산 없음) ·
//      총액 미포함 줄 비고 · 경고(AI 읽음 · 통화 · 담당자 미인식 · 못 읽은 헤더) · 버킷 매핑이 그대로 돈다
//   ③ 핸들러 action=quote-import: 키 없음 503 · 로그인 401 · 형식·크기·서명은 한도 전에 · 선점 = (null 행사, 'quote_import') · Claude 오류 failed ·
//      거절·길이·견적서 아님·항목 없음 unreadable · 모양 틀림 failed · 성공 = ok + doc(format ai) · 저장 0 · 로그에 파일 이름·금액 0
//   ④ SDK 요청 모양: 문서가 글보다 먼저 · 견적서 스키마 · 지시문
//   ⑤ 앱: aiClient.readQuoteImport(Bearer · 경로 · format ai 검사 · 오류 문구) · mock importQuoteFile은 PDF에 사실 안내(저장 0)
import { describe, expect, it, vi } from 'vitest'
import { quoteImportRequest, type AiReadOutput, type VendorQuoteReader } from '../../api/_lib/ai/claude'
import { AI_NOT_READY_MESSAGE, handleAiRequest, type AiEnv, type AiUsageStatus, type AiUsageStore } from '../../api/_lib/ai/handler'
import { createAiClient } from '../lib/ai/aiClient'
import {
  AI_QUOTE_IMPORT_SCHEMA,
  AI_QUOTE_IMPORT_SYSTEM,
  QUOTE_IMPORT_AI_MOCK_MESSAGE,
  QUOTE_IMPORT_AI_NO_MANAGER_NOTE,
  QUOTE_IMPORT_AI_READ_WARNING,
  docFromAiQuoteImport,
  validateAiQuoteImport,
  type AiQuoteImportResult,
} from '../lib/quoteImportAi'
import { mapSectionsToBuckets } from '../modules/quote/import/buckets'
import { quoteImportFormatLabel } from '../modules/quote/import/types'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

const ENV: AiEnv = {
  ANTHROPIC_API_KEY: 'test-key-not-real',
  SUPABASE_URL: 'https://db.example.com',
  SUPABASE_SECRET_KEY: 'server-secret',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable',
}
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46])
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')

/** 가상 영문 견적서(USD)를 AI가 읽은 결과 — 검산이 떨어지는 값 · 총액 미포함 옵션 1줄 · 담당자 칸 없음 */
function goodResult(over: Partial<AiQuoteImportResult> = {}): AiQuoteImportResult {
  return {
    readable: true,
    unreadable_reason: null,
    language: 'en',
    currency: 'USD',
    header: {
      event_name: 'Virtual Global Tech Summit 2027',
      client: 'Virtual Overseas Corp.',
      date_range: '10-11 March 2027',
      venue: 'Virtual Convention Center, Hall B',
      quoted_at: '15 January 2027',
      total_amount: 126_500,
      vat_mode: 'included',
    },
    sections: [
      {
        name: '1. Venue Rental',
        subtotal: 45_000,
        items: [{ title: 'Hall B rental', spec: 'Main hall, 2 days', unit_price: 22_500, qty: 2, days: null, amount: 45_000, note: null, in_total: true }],
      },
      {
        name: '2. Stage & AV',
        subtotal: 55_000,
        items: [
          { title: 'LED screen', spec: '12m x 4m', unit_price: 15_000, qty: 1, days: null, amount: 15_000, note: null, in_total: true },
          { title: 'Sound system', spec: null, unit_price: 40_000, qty: 1, days: null, amount: 40_000, note: null, in_total: true },
          { title: 'Gobo lighting', spec: 'Logo projection', unit_price: 2_000, qty: 1, days: null, amount: 2_000, note: 'Optional', in_total: false },
        ],
      },
    ],
    totals: { items_sum: 100_000, agency_fee: 15_000, agency_fee_rate: 0.15, rounding: null, vat: 11_500, grand_total: 126_500 },
    ...over,
  }
}

function fakeStore(over: Partial<AiUsageStore> = {}) {
  const claims: [string, string | null, string, number][] = []
  const finishes: [AiUsageStatus, string | null, number, number, string | null][] = []
  const store: AiUsageStore = {
    async claim(token, projectId, feature, limit) {
      claims.push([token, projectId, feature, limit])
      return { id: 'usage-1', used: 1, limit }
    },
    async finish(_id, status, model, i, o, error) {
      finishes.push([status, model, i, o, error])
    },
    ...over,
  }
  return { store, claims, finishes }
}

const readerOf = (json: unknown, stop: string | null = 'end_turn'): VendorQuoteReader =>
  async () => ({ json, stop_reason: stop, model: 'claude-sonnet-5', input_tokens: 1200, output_tokens: 400 }) satisfies AiReadOutput

function post(body: unknown, action = 'quote-import', auth = 'Bearer jwt-sales') {
  return new Request(`https://app.example.com/api/ai?action=${action}`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const pdfBody = { file_name: 'quotation_en.pdf', media_type: 'application/pdf', data_base64: b64(PDF) }

function walk(schema: unknown, visit: (node: Record<string, unknown>) => void) {
  if (!schema || typeof schema !== 'object') return
  const node = schema as Record<string, unknown>
  visit(node)
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((x) => walk(x, visit))
    else if (v && typeof v === 'object') walk(v, visit)
  }
}

describe('DoD 89 · ① 스키마·규칙', () => {
  it('모든 객체 = additionalProperties:false + 모든 키 required · 숫자 범위 제약 없음', () => {
    let objects = 0
    walk(AI_QUOTE_IMPORT_SCHEMA, (node) => {
      if (node.type === 'object') {
        objects++
        expect(node.additionalProperties).toBe(false)
        expect((node.required as string[]).sort()).toEqual(Object.keys(node.properties as object).sort())
      }
      for (const k of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems']) expect(k in node).toBe(false)
    })
    expect(objects).toBe(5) // 응답 · header · section · item · totals
  })

  it('개인정보 칸이 없다 — 담당자·전화·이메일·계좌·사업자번호 · 규칙 문장에 국/영문·환산 금지·개인정보 금지', () => {
    const text = JSON.stringify(AI_QUOTE_IMPORT_SCHEMA)
    for (const k of ['manager', 'phone', 'email', 'account', 'business', 'contact']) expect(text.includes(`"${k}"`)).toBe(false)
    expect(AI_QUOTE_IMPORT_SYSTEM).toContain('영어 그대로')
    expect(AI_QUOTE_IMPORT_SYSTEM).toContain('환산하지 않습니다')
    expect(AI_QUOTE_IMPORT_SYSTEM).toContain('사람 이름')
    expect(AI_QUOTE_IMPORT_SYSTEM).toContain('계산하지 말고')
    expect(AI_QUOTE_IMPORT_SYSTEM).toContain('readable=false')
  })
})

describe('DoD 89 · ② 결과 검사 · ParsedQuoteDoc 변환', () => {
  it('정상 결과 통과 · 통화 코드 대문자 · 공백 정리 · 빈 섹션 이름은 전체', () => {
    const r = validateAiQuoteImport({ ...goodResult(), currency: 'usd', sections: [{ name: '  ', subtotal: null, items: [] }] })
    expect(r.currency).toBe('USD')
    expect(r.sections[0].name).toBe('전체')
  })

  it('틀린 모양 거부: 소수 금액 · 1조 이상 · 비율 1 초과 · 통화 코드 아님 · 모르는 language · vat_mode · in_total 없음 · 항목 600 초과', () => {
    const bad = (mut: (r: AiQuoteImportResult) => unknown) => expect(() => validateAiQuoteImport(mut(goodResult()))).toThrow()
    bad((r) => ({ ...r, sections: [{ ...r.sections[0], items: [{ ...r.sections[0].items[0], amount: 1.5 }] }] }))
    bad((r) => ({ ...r, totals: { ...r.totals, grand_total: 1_000_000_000_000 } }))
    bad((r) => ({ ...r, totals: { ...r.totals, agency_fee_rate: 1.5 } }))
    bad((r) => ({ ...r, currency: 'dollars' }))
    bad((r) => ({ ...r, language: 'fr' }))
    bad((r) => ({ ...r, header: { ...r.header, vat_mode: 'maybe' } }))
    bad((r) => ({ ...r, sections: [{ ...r.sections[0], items: [{ ...r.sections[0].items[0], in_total: undefined }] }] }))
    bad((r) => ({
      ...r,
      sections: [{ name: 'x', subtotal: null, items: Array.from({ length: 601 }, () => r.sections[0].items[0]) }],
    }))
  })

  it('변환: format ai · 헤더 5필드 + 대표 총액 + 통화 · 총액 미포함 줄은 비고 · 검산 전부 우리 코드(외화 = 부가세 10% 검산 없음) · 경고', () => {
    const doc = docFromAiQuoteImport(goodResult())
    expect(doc.format).toBe('ai')
    expect(doc.header).toMatchObject({
      event_name: 'Virtual Global Tech Summit 2027',
      client: 'Virtual Overseas Corp.',
      date_range: '10-11 March 2027',
      venue: 'Virtual Convention Center, Hall B',
      quoted_at: '15 January 2027',
      total_amount: 126_500,
      vat_mode: 'included',
      currency: 'USD',
    })
    expect(doc.header.manager).toBeUndefined()
    expect(doc.sections[1].items[2].note).toContain('총액 미포함')
    expect(doc.sections[1].items[2].note).toContain('Optional')
    expect(doc.totals).toEqual({ items_sum: 100_000, agency_fee: 15_000, agency_fee_rate: 0.15, vat: 11_500, grand_total: 126_500 })
    const names = doc.checks.map((c) => c.name)
    expect(names).toEqual(['섹션 소계 — 1. Venue Rental', '섹션 소계 — 2. Stage & AV', '항목 합계 = Σ 섹션 소계', '대행료 15%', '총액 체인 (항목합+대행료+절사+부가세)'])
    expect(doc.checks.every((c) => c.ok)).toBe(true)
    expect(doc.warnings[0]).toBe(QUOTE_IMPORT_AI_READ_WARNING)
    expect(doc.warnings.some((w) => w.includes('USD') && w.includes('환산 없음'))).toBe(true)
    expect(doc.warnings).toContain(QUOTE_IMPORT_AI_NO_MANAGER_NOTE)
    expect(doc.warnings.some((w) => w.includes("'총액 미포함' 표기 항목 1건"))).toBe(true)
    expect(quoteImportFormatLabel(doc.format)).toBe('AI 읽음')
  })

  it('원화(통화 없음)면 부가세 10% 검산이 붙고 · 어긋나면 경고(막지 않음) · 적혀 있지 않은 합계는 검산하지 않는다 · 못 읽은 헤더는 경고', () => {
    const ko = goodResult({
      currency: null,
      language: 'ko',
      header: { event_name: '가상 서밋', client: null, date_range: null, venue: '가상홀', quoted_at: null, total_amount: null, vat_mode: 'excluded' },
      totals: { items_sum: 100_000, agency_fee: null, agency_fee_rate: null, rounding: null, vat: 9_000, grand_total: null },
    })
    const doc = docFromAiQuoteImport(ko)
    const vat = doc.checks.find((c) => c.name === '부가세 10%')!
    expect(vat).toMatchObject({ expected: 10_000, actual: 9_000, ok: false })
    expect(doc.checks.some((c) => c.name.startsWith('총액 체인'))).toBe(false)
    expect(doc.checks.some((c) => c.name.startsWith('대행료'))).toBe(false)
    expect(doc.warnings.some((w) => w.includes("'부가세 10%'") && w.includes('10,000원'))).toBe(true)
    expect(doc.warnings.some((w) => w.includes('인식하지 못한 헤더 항목: 고객명, 일시, 견적일'))).toBe(true)
    expect(doc.header.total_amount).toBeUndefined()
    expect(doc.header.currency).toBeUndefined()
  })

  it('버킷 매핑이 AI 결과에도 그대로 돈다(영문 단어 단위) — Venue Rental s1 · Stage & AV s2', () => {
    const map = mapSectionsToBuckets(docFromAiQuoteImport(goodResult()))
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2'])
    expect(map.every((m) => m.confidence === 'high')).toBe(true)
  })
})

describe('DoD 89 · ③ api/ai ?action=quote-import', () => {
  it('키 없음 = 503(엑셀 안내) · 한도·Claude 둘 다 안 씀 · 로그인 없음 401', async () => {
    const { store, claims } = fakeStore()
    const reader = vi.fn(readerOf(goodResult()))
    const res = await handleAiRequest(post(pdfBody), { ...ENV, ANTHROPIC_API_KEY: '' }, { store, quoteReader: reader })
    expect(res.status).toBe(503)
    expect((await res.json()).error.message).toBe(AI_NOT_READY_MESSAGE)
    expect(claims).toHaveLength(0)
    expect(reader).not.toHaveBeenCalled()
    const noAuth = await handleAiRequest(post(pdfBody, 'quote-import', ''), ENV, { store, quoteReader: reader })
    expect(noAuth.status).toBe(401)
  })

  it('형식·크기·서명은 한도를 쓰기 전에 거른다 · 선점은 (null 행사 · quote_import · 한도)', async () => {
    const { store, claims } = fakeStore()
    const reader = vi.fn(readerOf(goodResult()))
    const xlsx = await handleAiRequest(post({ ...pdfBody, media_type: 'application/vnd.ms-excel' }), ENV, { store, quoteReader: reader })
    expect(xlsx.status).toBe(400)
    const fake = await handleAiRequest(post({ ...pdfBody, data_base64: b64(new Uint8Array([1, 2, 3, 4, 5])) }), ENV, { store, quoteReader: reader })
    expect(fake.status).toBe(400)
    expect((await fake.json()).error.message).toContain('PDF이(가) 아닙니다')
    expect(claims).toHaveLength(0)
    expect(reader).not.toHaveBeenCalled()

    const ok = await handleAiRequest(post(pdfBody), { ...ENV, AI_DAILY_LIMIT: '7' }, { store, quoteReader: reader })
    expect(ok.status).toBe(200)
    expect(claims).toEqual([['jwt-sales', null, 'quote_import', 7]])
  })

  it('성공 = ok + 토큰 · doc(format ai · 헤더 · 검산 · 경고) · 모델 · 사용량 · 저장은 하지 않는다', async () => {
    const { store, finishes } = fakeStore()
    const res = await handleAiRequest(post(pdfBody), ENV, { store, quoteReader: readerOf(goodResult()) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['doc', 'model', 'usage'])
    expect(body.doc.format).toBe('ai')
    expect(body.doc.header.event_name).toBe('Virtual Global Tech Summit 2027')
    expect(body.doc.sections).toHaveLength(2)
    expect(body.model).toBe('claude-sonnet-5')
    expect(body.usage).toEqual({ used: 1, limit: 30 })
    expect(finishes).toEqual([['ok', 'claude-sonnet-5', 1200, 400, null]])
  })

  it('Claude 오류 = failed(한도 제외) · 거절·길이·견적서 아님·항목 없음 = 422 unreadable · 모양 틀림 = 502 failed', async () => {
    const { AiUpstreamError } = await import('../../api/_lib/ai/claude')
    const cases: [VendorQuoteReader, number, AiUsageStatus, RegExp][] = [
      [async () => { throw new AiUpstreamError('overloaded', 529, 'x') }, 503, 'failed', /몰렸습니다/],
      [readerOf(null, 'refusal'), 422, 'unreadable', /읽지 않았습니다/],
      [readerOf(null, 'max_tokens'), 422, 'unreadable', /나눠 올려/],
      [readerOf(goodResult({ readable: false, unreadable_reason: '계약서입니다' })), 422, 'unreadable', /계약서입니다/],
      [readerOf(goodResult({ sections: [{ name: '전체', subtotal: null, items: [] }] })), 422, 'unreadable', /항목 줄을 찾지/],
      [readerOf({ readable: true }), 502, 'failed', /해석하지 못했습니다/],
    ]
    for (const [reader, status, usage, msg] of cases) {
      const { store, finishes } = fakeStore()
      const res = await handleAiRequest(post(pdfBody), ENV, { store, quoteReader: reader })
      expect(res.status).toBe(status)
      expect((await res.json()).error.message).toMatch(msg)
      expect(finishes[0][0]).toBe(usage)
    }
  })

  it('권한·한도 오류는 SQL 판정 그대로(403 · 429) — Claude를 부르지 않는다 · 로그에 파일 이름·금액 0', async () => {
    const { claimError } = await import('../../api/_lib/ai/handler')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reader = vi.fn(readerOf(goodResult()))
    const { store } = fakeStore({
      async claim() {
        throw claimError({ code: 'P0403', message: 'FORBIDDEN: 견적 메뉴는 영업·관리자 권한이 필요합니다.' })
      },
    })
    const res = await handleAiRequest(post(pdfBody), ENV, { store, quoteReader: reader })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('견적 메뉴는 영업·관리자 권한이 필요합니다.')
    expect(reader).not.toHaveBeenCalled()
    const { store: s2 } = fakeStore({
      async claim() {
        throw claimError({ code: 'P0429', message: 'LIMIT: 오늘 AI 읽기 30회를 모두 썼습니다.' })
      },
    })
    expect((await handleAiRequest(post(pdfBody), ENV, { store: s2, quoteReader: reader })).status).toBe(429)
    // 실패 경로 로그에도 파일 이름·금액 없음
    const { store: s3 } = fakeStore()
    await handleAiRequest(post(pdfBody), ENV, { store: s3, quoteReader: readerOf({ readable: true }) })
    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).not.toContain('quotation_en.pdf')
    expect(logged).not.toContain('126500')
    warn.mockRestore()
  })
})

describe('DoD 89 · ④ SDK 요청 모양', () => {
  it('문서(PDF)가 글보다 먼저 · 견적서 스키마·규칙 · 지시문 · 구조화 출력', () => {
    const req = quoteImportRequest('claude-sonnet-5', { media_type: 'application/pdf', data_base64: b64(PDF) })
    const content = req.messages[0].content as { type: string; text?: string }[]
    expect(content[0].type).toBe('document')
    expect(content[1]).toMatchObject({ type: 'text', text: expect.stringContaining('헤더·섹션·항목·합계') })
    expect(req.system).toBe(AI_QUOTE_IMPORT_SYSTEM)
    expect((req as unknown as { output_config: { format: { schema: unknown } } }).output_config.format.schema).toEqual(AI_QUOTE_IMPORT_SCHEMA)
    expect(req.model).toBe('claude-sonnet-5')
  })
})

describe('DoD 89 · ⑤ 앱 — aiClient.readQuoteImport · mock 사실 안내', () => {
  it('Bearer로 ?action=quote-import에 POST · 결과 그대로 · format ai가 아니면 거부 · 오류 문구 그대로', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const doc = docFromAiQuoteImport(goodResult())
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ doc, model: 'claude-sonnet-5', usage: { used: 2, limit: 30 } }), { status: 200 })
    }) as unknown as typeof fetch
    const client = createAiClient({ accessToken: async () => 'jwt', apiBase: '/api', fetchImpl })
    const out = await client.readQuoteImport({ file_name: 'q.pdf', media_type: 'application/pdf', data_base64: b64(PDF) })
    expect(out.doc.format).toBe('ai')
    expect(out.usage).toEqual({ used: 2, limit: 30 })
    expect(calls[0].url).toBe('/api/ai?action=quote-import')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer jwt')

    const bad = createAiClient({
      accessToken: async () => 'jwt',
      apiBase: '/api',
      fetchImpl: (async () => new Response(JSON.stringify({ doc: { ...doc, format: 'A' }, model: 'm', usage: { used: 1, limit: 1 } }), { status: 200 })) as unknown as typeof fetch,
    })
    await expect(bad.readQuoteImport({ file_name: 'q.pdf', media_type: 'application/pdf', data_base64: b64(PDF) })).rejects.toThrow(/해석하지/)

    const limited = createAiClient({
      accessToken: async () => 'jwt',
      apiBase: '/api',
      fetchImpl: (async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: '오늘 AI 읽기 30회를 모두 썼습니다.' } }), { status: 429 })) as unknown as typeof fetch,
    })
    await expect(limited.readQuoteImport({ file_name: 'q.pdf', media_type: 'application/pdf', data_base64: b64(PDF) })).rejects.toMatchObject({
      code: 'conflict',
      message: '오늘 AI 읽기 30회를 모두 썼습니다.',
    })
  })

  it('mock importQuoteFile: PDF·사진은 사실 안내(AI 흉내 없음 · 저장 0) · 엑셀은 그대로', async () => {
    const provider = getDataProvider() as MockProvider
    provider.setAppRole('sales')
    await expect(provider.importQuoteFile('견적서.pdf', PDF.buffer.slice(0) as ArrayBuffer)).rejects.toThrow(QUOTE_IMPORT_AI_MOCK_MESSAGE)
    await expect(provider.importQuoteFile('견적서.png', PDF.buffer.slice(0) as ArrayBuffer)).rejects.toThrow(QUOTE_IMPORT_AI_MOCK_MESSAGE)
  })
})
