// DoD 83 (Phase 4.8 · 설계서 v2.14 §19.5b) — AI(Claude)로 협력사 견적서 PDF·사진 읽기: 서버·순수 함수.
// 가짜 사용 기록 저장소·가짜 읽기 함수로 돈다(실 DB의 권한·한도 판정은 supabase:check 'AI 한도' 13항목). Claude는 부르지 않는다 —
// SDK 경로는 가짜 fetch가 스트림(SSE)을 돌려주는 방식으로 요청 모양·응답 해석·오류 분류를 본다.
//   ① 스키마·규칙: 구조화 출력 규약(모든 객체 additionalProperties:false + 모든 키 required · 숫자 범위 제약 없음) · 개인정보 칸 0 ·
//      규칙 문장(추측 금지 · 개인정보 금지 · 합계 계산 금지)
//   ② 결과 검사·변환: 정수 금액·자릿수·비율·개수 · 총액 미포함 줄 → 확인 큐에서 기본 제외 · 검산은 우리 코드(어긋나면 경고, 막지 않음) ·
//      적혀 있지 않은 합계는 검산하지 않음 · 'AI가 읽음' 경고 · 확인 큐(buildVendorQuote)에 reader 표시
//   ③ 핸들러: 키 없음 503(한도 안 씀) · 로그인 401 · 형식·크기·내용 서명은 한도 전에 · 한도·권한 오류 그대로 · Claude 오류 = failed(한도 제외) ·
//      거절·길이 초과·견적서 아님·항목 없음 = unreadable · 모양 틀림 = failed · 성공 = ok + 토큰 · GET = 준비 상태만
//   ④ SDK 경로: 문서가 글보다 먼저 · 스키마 · 모델 · 스트림 해석 · 401/429/529/400 분류
//   ⑤ 앱 쪽: 파일 준비(사진 줄이기·3MB 상한) · aiClient(Bearer · 429 문구 그대로)
//   ⑥ 비밀·경계: 키는 서버 전용(VITE_ 판 없음 · 실키 패턴 0) · SDK는 api/에서만 · 로그에 파일 이름·금액 0
import { describe, expect, it, vi } from 'vitest'
import { AiUpstreamError, createClaudeReader, vendorQuoteRequest, type AiReadOutput, type VendorQuoteReader } from '../../api/_lib/ai/claude'
import {
  AI_NOT_READY_MESSAGE,
  AiError,
  aiDailyLimit,
  claimError,
  handleAiRequest,
  matchesSignature,
  type AiEnv,
  type AiUsageStatus,
  type AiUsageStore,
} from '../../api/_lib/ai/handler'
import { createAiClient } from '../lib/ai/aiClient'
import { bytesToBase64, prepareAiFile } from '../lib/ai/prepareAiFile'
import { buildVendorQuote, supplyCheck } from '../lib/vendorQuote'
import {
  AI_FILE_TOO_LARGE_MESSAGE,
  AI_MAX_BYTES,
  AI_READ_WARNING,
  AI_VENDOR_QUOTE_SCHEMA,
  AI_VENDOR_QUOTE_SYSTEM,
  aiMediaTypeFor,
  docFromAiVendorQuote,
  validateAiVendorQuote,
  type AiVendorQuoteResult,
} from '../lib/vendorQuoteAi'
import type { SettlementBucket } from '../types/entities'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const ENV: AiEnv = {
  ANTHROPIC_API_KEY: 'test-key-not-real',
  SUPABASE_URL: 'https://db.example.com',
  SUPABASE_SECRET_KEY: 'server-secret',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable',
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')

/** 가상 음향 협력사 견적서를 AI가 읽은 결과(가상 명칭·가상 금액) — 부가세 줄 있음 · 할인 음수 · 총액 미포함 옵션 1줄 */
function goodResult(over: Partial<AiVendorQuoteResult> = {}): AiVendorQuoteResult {
  return {
    readable: true,
    unreadable_reason: null,
    quoted_at: '2026. 9. 20',
    vat_mode: 'excluded',
    sections: [
      {
        name: '음향',
        subtotal: 7_000_000,
        items: [
          { title: '메인 스피커', spec: 'L/R 2식', qty: 2, unit_price: 2_500_000, amount: 5_000_000, note: null, in_total: true },
          { title: '무선 마이크', spec: '핸드 4', qty: 4, unit_price: 500_000, amount: 2_000_000, note: null, in_total: true },
        ],
      },
      {
        name: '조명',
        subtotal: null,
        items: [
          { title: '무빙 라이트', spec: null, qty: 8, unit_price: 500_000, amount: 4_000_000, note: null, in_total: true },
          { title: '패키지 할인', spec: null, qty: null, unit_price: null, amount: -1_000_000, note: null, in_total: true },
          { title: '추가 안개 효과', spec: null, qty: 1, unit_price: 300_000, amount: 300_000, note: '선택', in_total: false },
        ],
      },
    ],
    totals: { items_sum: 10_000_000, agency_fee: null, agency_fee_rate: null, rounding: null, vat: 1_000_000, grand_total: 11_000_000 },
    ...over,
  }
}

function bucket(code: string, label: string, has_cost = true): SettlementBucket {
  return { id: `b-${code}`, board_id: 'board', code, label, has_cost, source: 'quote', sort_order: 0 } as unknown as SettlementBucket
}
const BUCKETS = [bucket('s1', '공간·설치'), bucket('s2', '시스템 구축'), bucket('s5', 'PCO 기획료', false), bucket('ot', '옵션')]

// ── 가짜 저장소·읽기 ──────────────────────────────────────────────────

interface Finish {
  id: string
  status: AiUsageStatus
  model: string | null
  input: number
  output: number
  error: string | null
}

function fakeStore(claimImpl?: () => Promise<{ id: string; used: number; limit: number }>) {
  const claims: { token: string; project: string; feature: string; limit: number }[] = []
  const finishes: Finish[] = []
  const store: AiUsageStore = {
    async claim(token, project, feature, limit) {
      claims.push({ token, project, feature, limit })
      return claimImpl ? claimImpl() : { id: 'use-1', used: 3, limit }
    },
    async finish(id, status, model, input, output, error) {
      finishes.push({ id, status, model, input, output, error })
    },
  }
  return { store, claims, finishes }
}

function reader(out: Partial<AiReadOutput> | Error): { read: VendorQuoteReader; calls: number } {
  const box = { calls: 0, read: (async () => undefined) as unknown as VendorQuoteReader }
  box.read = async () => {
    box.calls += 1
    if (out instanceof Error) throw out
    return { json: goodResult(), stop_reason: 'end_turn', model: 'claude-sonnet-5', input_tokens: 4200, output_tokens: 900, ...out }
  }
  return box
}

function post(body: unknown, { token = 'jwt-1', action = 'vendor-quote' }: { token?: string | null; action?: string } = {}) {
  return new Request(`https://app.example.com/api/ai?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

const pdfBody = (over: Record<string, unknown> = {}) => ({
  project_id: PROJECT,
  file_name: '가상음향_견적.pdf',
  media_type: 'application/pdf',
  data_base64: b64(PDF),
  ...over,
})

async function call(body: unknown, deps: { store?: AiUsageStore; reader?: VendorQuoteReader } = {}, env: AiEnv = ENV, opts = {}) {
  const res = await handleAiRequest(post(body, opts), env, deps)
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

// ── ① 스키마·규칙 ─────────────────────────────────────────────────────

describe('DoD 83 · ① 구조화 출력 스키마·규칙', () => {
  it('모든 객체 = additionalProperties:false + 모든 키 required · 숫자 범위 제약 없음', () => {
    const objects: Record<string, any>[] = []
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return
      if (n.type === 'object') objects.push(n)
      for (const v of Object.values(n)) walk(v)
    }
    walk(AI_VENDOR_QUOTE_SCHEMA)
    expect(objects.length).toBe(4) // 최상위 · 섹션 · 항목 · 합계
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false)
      expect([...o.required].sort()).toEqual(Object.keys(o.properties).sort())
    }
    const raw = JSON.stringify(AI_VENDOR_QUOTE_SCHEMA)
    for (const k of ['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern']) expect(raw).not.toContain(`"${k}"`)
  })

  it('개인정보 칸이 없다(담당자·전화·이메일·계좌·사업자번호) — 돌려줄 자리 자체가 없다', () => {
    const keys: string[] = []
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return
      if (n.properties) keys.push(...Object.keys(n.properties))
      for (const v of Object.values(n)) walk(v)
    }
    walk(AI_VENDOR_QUOTE_SCHEMA)
    for (const k of ['manager', 'contact', 'phone', 'email', 'account', 'biz_no', 'address', 'vendor_name', 'event_name']) expect(keys).not.toContain(k)
  })

  it('규칙 문장: 추측 금지 · 개인정보 금지 · 합계 계산 금지 · 총액 미포함 = in_total false', () => {
    expect(AI_VENDOR_QUOTE_SYSTEM).toContain('추측하지 말고 null')
    expect(AI_VENDOR_QUOTE_SYSTEM).toContain('전화번호·이메일·계좌번호·사업자등록번호')
    expect(AI_VENDOR_QUOTE_SYSTEM).toContain('계산하지 말고 null')
    expect(AI_VENDOR_QUOTE_SYSTEM).toContain('in_total=false')
  })

  it('파일 형식: PDF·JPG·PNG·WEBP만 AI · 엑셀·HEIC는 아님', () => {
    expect(aiMediaTypeFor('a.PDF')).toBe('application/pdf')
    expect(aiMediaTypeFor('a.jpeg')).toBe('image/jpeg')
    expect(aiMediaTypeFor('a.jpg')).toBe('image/jpeg')
    expect(aiMediaTypeFor('a.png')).toBe('image/png')
    expect(aiMediaTypeFor('a.webp')).toBe('image/webp')
    expect(aiMediaTypeFor('a.xlsx')).toBeNull()
    expect(aiMediaTypeFor('a.heic')).toBeNull()
    expect(aiMediaTypeFor('pdf')).toBeNull()
  })
})

// ── ② 검사·변환 ───────────────────────────────────────────────────────

describe('DoD 83 · ② 결과 검사 · 확인 큐 입력으로 변환', () => {
  it('정상 결과는 그대로 · 공백 정리 · 빈 품명·섹션 이름은 자리표시', () => {
    const r = goodResult()
    r.sections[0].name = '  '
    r.sections[0].items[0].title = '   '
    r.sections[0].items[1].spec = '  핸드 4  '
    const v = validateAiVendorQuote(JSON.parse(JSON.stringify(r)))
    expect(v.sections[0].name).toBe('항목')
    expect(v.sections[0].items[0].title).toBe('(품명 없음)')
    expect(v.sections[0].items[1].spec).toBe('핸드 4')
    expect(v.totals.vat).toBe(1_000_000)
  })

  it('틀린 모양은 거부: 소수 금액 · 1조 이상 · 비율 1 초과 · in_total 없음 · 항목 600 초과 · 모르는 vat_mode', () => {
    const bad = (mut: (r: any) => void) => {
      const r: any = JSON.parse(JSON.stringify(goodResult()))
      mut(r)
      return () => validateAiVendorQuote(r)
    }
    expect(bad((r) => (r.sections[0].items[0].amount = 12.5))).toThrow(/정수/)
    expect(bad((r) => (r.sections[0].items[0].amount = 1_000_000_000_000))).toThrow(/자릿수/)
    expect(bad((r) => (r.totals.agency_fee_rate = 10))).toThrow(/비율/)
    expect(bad((r) => delete r.sections[0].items[0].in_total)).toThrow(/in_total/)
    expect(bad((r) => (r.sections[0].items = Array.from({ length: 601 }, () => r.sections[0].items[0])))).toThrow(/너무 많/)
    expect(bad((r) => (r.vat_mode = 'maybe'))).toThrow(/vat_mode/)
    expect(() => validateAiVendorQuote(null)).toThrow()
  })

  it('변환: format ai · 총액 미포함 줄은 비고로 · 검산(섹션 소계 · 항목 합계 · 총액)은 우리 코드 · AI 경고', () => {
    const doc = docFromAiVendorQuote(goodResult())
    expect(doc.format).toBe('ai')
    expect(doc.header).toEqual({ quoted_at: '2026. 9. 20', vat_mode: 'excluded' })
    expect(doc.sections[1].items[2].note).toBe('선택 · 총액 미포함')
    expect(doc.checks).toEqual([
      { name: '음향 소계', expected: 7_000_000, actual: 7_000_000, ok: true },
      { name: '항목 합계', expected: 10_000_000, actual: 10_000_000, ok: true },
      { name: '총액', expected: 11_000_000, actual: 11_000_000, ok: true },
    ])
    expect(doc.warnings).toEqual([AI_READ_WARNING])
  })

  it('어긋나면 경고(막지 않음) · 적혀 있지 않은 합계는 검산하지 않는다(지어내지 않는다)', () => {
    const r = goodResult()
    r.sections[0].items[1].amount = 200_000 // 2,000,000을 잘못 읽음
    const doc = docFromAiVendorQuote(r)
    // 총액 검산은 적힌 공급가액 + 부가세 = 총액(문서 자체의 합계) — 줄을 잘못 읽은 것은 소계·항목 합계가 잡는다
    expect(doc.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(['음향 소계', '항목 합계'])
    expect(doc.warnings.some((w) => w.startsWith('음향 소계이(가) 맞지 않습니다'))).toBe(true)

    const bare = docFromAiVendorQuote(
      goodResult({ totals: { items_sum: null, agency_fee: null, agency_fee_rate: null, rounding: null, vat: null, grand_total: 11_000_000 } }),
    )
    // 소계 1개만 — 항목 합계·총액(부가세 모름)은 검산하지 않는다
    expect(bare.checks.map((c) => c.name)).toEqual(['음향 소계'])
    expect(bare.totals).toEqual({ grand_total: 11_000_000 })
  })

  it('확인 큐: AI 결과도 같은 규칙(총액 미포함 기본 제외 · 원가 버킷만 · 부가세 줄 = 별도 확실) + reader 표시 · 공급가 대조', () => {
    const { parsed, questions } = buildVendorQuote(docFromAiVendorQuote(goodResult()), BUCKETS, { kind: 'ai', model: 'claude-sonnet-5' })
    expect(parsed.format).toBe('ai')
    expect(parsed.reader).toEqual({ kind: 'ai', model: 'claude-sonnet-5' })
    expect(parsed.rows).toHaveLength(5)
    expect(parsed.rows.find((r) => r.title === '추가 안개 효과')!.include).toBe(false)
    expect(parsed.rows.every((r) => r.bucket_code !== 's5')).toBe(true)
    expect(parsed.vat).toMatchObject({ suggested: false, certain: true })
    expect(parsed.warnings).toContain(AI_READ_WARNING)
    expect(supplyCheck(parsed)).toEqual({ expected: 10_000_000, actual: 10_000_000, ok: true })
    expect(questions).not.toContain('vat')
    // 엑셀 경로는 reader 없음(저장 모양 불변)
    expect('reader' in buildVendorQuote(docFromAiVendorQuote(goodResult()), BUCKETS).parsed).toBe(false)
  })
})

// ── ③ 핸들러 ──────────────────────────────────────────────────────────

describe('DoD 83 · ③ api/ai 핸들러', () => {
  it('GET = 준비 상태만(키 값 없음) · 한도 env · 모델 기본 claude-sonnet-5', async () => {
    const res = await handleAiRequest(new Request('https://app.example.com/api/ai'), ENV)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ enabled: true, model: 'claude-sonnet-5', daily_limit: 30 })
    expect(text).not.toContain('test-key-not-real')
    const off = await (await handleAiRequest(new Request('https://x/api/ai'), { ...ENV, ANTHROPIC_API_KEY: ' ' })).json()
    expect(off.enabled).toBe(false)
    expect(aiDailyLimit({ AI_DAILY_LIMIT: '5' })).toBe(5)
    expect(aiDailyLimit({ AI_DAILY_LIMIT: 'abc' })).toBe(30)
    expect(aiDailyLimit({ AI_DAILY_LIMIT: '0' })).toBe(30)
    expect(aiDailyLimit({ AI_DAILY_LIMIT: '9999' })).toBe(500)
    const withModel = await (await handleAiRequest(new Request('https://x/api/ai'), { ...ENV, ANTHROPIC_MODEL: 'claude-opus-5' })).json()
    expect(withModel.model).toBe('claude-opus-5')
  })

  it('키 없음 = 503(엑셀 안내) · 한도·Claude 둘 다 안 씀 · 모르는 동작 400 · 로그인 없음 401', async () => {
    const s = fakeStore()
    const r = reader({})
    const noKey = await call(pdfBody(), { store: s.store, reader: r.read }, { ...ENV, ANTHROPIC_API_KEY: '' })
    expect(noKey).toEqual({ status: 503, body: { error: { code: 'unavailable', message: AI_NOT_READY_MESSAGE } } })
    expect(AI_NOT_READY_MESSAGE).toContain('엑셀(.xlsx) 견적서는 지금도')
    expect((await call(pdfBody(), { store: s.store, reader: r.read }, ENV, { action: 'plan-review' })).status).toBe(400)
    expect((await call(pdfBody(), { store: s.store, reader: r.read }, ENV, { token: null })).status).toBe(401)
    expect(s.claims).toHaveLength(0)
    expect(r.calls).toBe(0)
  })

  it('형식·크기·내용 서명은 한도를 쓰기 전에 거른다(400·413)', async () => {
    const s = fakeStore()
    const r = reader({})
    const cases: [Record<string, unknown>, number, RegExp][] = [
      [{ project_id: 'not-a-uuid' }, 400, /행사 id/],
      [{ media_type: 'image/heic' }, 400, /PDF·JPG·PNG·WEBP/],
      [{ media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, 400, /PDF·JPG·PNG·WEBP/],
      [{ data_base64: '' }, 400, /빈 파일/],
      [{ data_base64: b64(PNG) }, 400, /PDF이\(가\) 아닙니다/],
      [{ media_type: 'image/jpeg', data_base64: b64(PDF) }, 400, /JPEG 사진이\(가\) 아닙니다/],
      [{ data_base64: Buffer.alloc(AI_MAX_BYTES + 10, 0x25).toString('base64') }, 413, /3MB/],
    ]
    for (const [over, status, msg] of cases) {
      const res = await call(pdfBody(over), { store: s.store, reader: r.read })
      expect(res.status, JSON.stringify(over).slice(0, 60)).toBe(status)
      expect(res.body.error.message).toMatch(msg)
    }
    expect(s.claims).toHaveLength(0)
    expect(r.calls).toBe(0)
    expect(matchesSignature('image/png', PNG)).toBe(true)
    expect(matchesSignature('image/jpeg', JPEG)).toBe(true)
    expect(matchesSignature('image/webp', WEBP)).toBe(true)
    expect(matchesSignature('image/webp', PNG)).toBe(false)
  })

  it('권한·한도는 SQL 판정 그대로(429 · 403 · 409) — Claude를 부르지 않는다 · 오류 코드 변환', async () => {
    const r = reader({})
    const limited = fakeStore(async () => {
      throw claimError({ code: 'P0429', message: 'LIMIT: 오늘 AI 읽기 30회를 모두 썼습니다 — 내일(한국 시각 0시) 다시 쓸 수 있습니다. 엑셀 견적서는 한도 없이 불러올 수 있습니다.' })
    })
    const res = await call(pdfBody(), { store: limited.store, reader: r.read })
    expect(res.status).toBe(429)
    expect(res.body.error).toEqual({ code: 'rate_limited', message: expect.stringMatching(/^오늘 AI 읽기 30회를 모두 썼습니다/) })
    expect(r.calls).toBe(0)
    expect(limited.claims[0]).toMatchObject({ token: 'jwt-1', project: PROJECT, feature: 'vendor_quote', limit: 30 })

    expect(claimError({ code: 'P0403', message: 'FORBIDDEN: PM 전용 기능입니다.' })).toMatchObject({ status: 403, message: 'PM 전용 기능입니다.' })
    expect(claimError({ code: 'P0409', message: 'CONFLICT: 종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.' })).toMatchObject({ status: 409 })
    expect(claimError({ code: 'P0404', message: 'NOT_FOUND: 프로젝트를 찾을 수 없습니다.' })).toMatchObject({ status: 404 })
    expect(claimError({ code: 'PGRST301', message: 'JWT expired' })).toMatchObject({ status: 401, message: '로그인이 필요합니다.' })
    expect(claimError({ code: '08006', message: 'connection failure' })).toMatchObject({ status: 503 })
    // 한도 env가 SQL에 그대로 간다
    const s = fakeStore()
    await call(pdfBody(), { store: s.store, reader: r.read }, { ...ENV, AI_DAILY_LIMIT: '7' })
    expect(s.claims[0].limit).toBe(7)
  })

  it('Claude 쪽 오류 = failed(한도에서 뺀다) + 사람 말 · 키 문제는 관리자 안내', async () => {
    const cases: [AiUpstreamError, number, RegExp][] = [
      [new AiUpstreamError('auth', 401, 'auth'), 503, /ANTHROPIC_API_KEY/],
      [new AiUpstreamError('rate_limit', 429, 'rate_limit'), 503, /1분쯤 뒤.*세지 않습니다/],
      [new AiUpstreamError('overloaded', 529, 'x'), 503, /세지 않습니다/],
      [new AiUpstreamError('bad_request', 400, 'x'), 422, /100쪽/],
      [new AiUpstreamError('connection', null, 'x'), 503, /연결하지 못했습니다/],
    ]
    for (const [err, status, msg] of cases) {
      const s = fakeStore()
      const res = await call(pdfBody(), { store: s.store, reader: reader(err).read })
      expect(res.status).toBe(status)
      expect(res.body.error.message).toMatch(msg)
      expect(s.finishes).toEqual([expect.objectContaining({ id: 'use-1', status: 'failed' })])
    }
  })

  it('읽었지만 못 쓰는 결과 = unreadable(한도에 센다): 거절 · 길이 초과 · 견적서 아님(이유 전달) · 항목 없음', async () => {
    const cases: [Partial<AiReadOutput>, RegExp, string][] = [
      [{ json: null, stop_reason: 'refusal' }, /읽지 않았습니다/, 'refusal'],
      [{ json: null, stop_reason: 'max_tokens' }, /나눠 올려/, 'max_tokens'],
      [{ json: goodResult({ readable: false, unreadable_reason: '식당 영수증입니다', sections: [] }) }, /견적서로 읽지 못했습니다 — 식당 영수증입니다/, 'not a quote'],
      [{ json: goodResult({ sections: [{ name: '음향', subtotal: null, items: [] }] }) }, /항목 줄을 찾지 못했습니다/, 'no items'],
    ]
    for (const [out, msg, error] of cases) {
      const s = fakeStore()
      const res = await call(pdfBody(), { store: s.store, reader: reader(out).read })
      expect(res.status).toBe(422)
      expect(res.body.error.message).toMatch(msg)
      expect(s.finishes).toEqual([expect.objectContaining({ status: 'unreadable', error, input: 4200, output: 900 })])
    }
  })

  it('모양이 틀린 응답 = failed(502 · 한도에서 뺀다)', async () => {
    const s = fakeStore()
    const res = await call(pdfBody(), { store: s.store, reader: reader({ json: { readable: true, sections: 'x' } }).read })
    expect(res.status).toBe(502)
    expect(res.body.error.message).toContain('세지 않습니다')
    expect(s.finishes[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('shape') })
  })

  it('성공 = ok + 토큰 기록 · doc(format ai · 검산 · 경고) · 모델 · 오늘 사용/한도 · 저장은 하지 않는다', async () => {
    const s = fakeStore()
    const r = reader({})
    const res = await call(pdfBody({ media_type: 'image/png', data_base64: b64(PNG), file_name: '견적.png' }), { store: s.store, reader: r.read })
    expect(res.status).toBe(200)
    expect(res.body.model).toBe('claude-sonnet-5')
    expect(res.body.usage).toEqual({ used: 3, limit: 30 })
    expect(res.body.doc.format).toBe('ai')
    expect(res.body.doc.sections).toHaveLength(2)
    expect(res.body.doc.warnings[0]).toBe(AI_READ_WARNING)
    expect(s.finishes).toEqual([{ id: 'use-1', status: 'ok', model: 'claude-sonnet-5', input: 4200, output: 900, error: null }])
    expect(Object.keys(res.body).sort()).toEqual(['doc', 'model', 'usage'])
  })

  it('서버 로그에 파일 이름·금액이 실리지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const out of [new AiUpstreamError('overloaded', 529, 'x'), { json: { bad: true } }] as const) {
      await call(pdfBody({ file_name: '비밀협력사_견적.pdf' }), { store: fakeStore().store, reader: reader(out as never).read })
    }
    const logged = JSON.stringify(warn.mock.calls)
    expect(warn).toHaveBeenCalled()
    expect(logged).not.toContain('비밀협력사')
    expect(logged).not.toMatch(/5000000|5,000,000/)
    warn.mockRestore()
  })
})

// ── ④ SDK 경로 ────────────────────────────────────────────────────────

function sse(events: [string, unknown][]): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')
}

function streamOf(text: string, stop_reason = 'end_turn'): string {
  return sse([
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3100, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, 20) } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(20) } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 777 } }],
    ['message_stop', { type: 'message_stop' }],
  ])
}

function fakeAnthropic(respond: () => Response) {
  const calls: { url: string; body: any; headers: Headers }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) })
    return respond()
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('DoD 83 · ④ SDK 경로(가짜 fetch · 스트림)', () => {
  it('요청 모양: 문서(PDF)가 글보다 먼저 · 사진은 image · 구조화 출력 스키마 · 모델 · max_tokens · 고정 사고 예산 없음', () => {
    const req = vendorQuoteRequest('claude-sonnet-5', { media_type: 'application/pdf', data_base64: 'QUJD' })
    const content = req.messages[0].content as any[]
    expect(content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } })
    expect(content[1].type).toBe('text')
    expect(req.output_config?.format).toEqual({ type: 'json_schema', schema: AI_VENDOR_QUOTE_SCHEMA })
    expect(req).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 16_000, system: AI_VENDOR_QUOTE_SYSTEM })
    expect(JSON.stringify(req)).not.toContain('budget_tokens')
    const img = vendorQuoteRequest('claude-sonnet-5', { media_type: 'image/webp', data_base64: 'QUJD' })
    expect((img.messages[0].content as any[])[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'QUJD' } })
  })

  it('스트림을 끝까지 받아 JSON 한 덩어리로 · 모델·토큰 · 키는 헤더로만', async () => {
    const json = JSON.stringify(goodResult())
    const f = fakeAnthropic(() => new Response(streamOf(json), { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    const read = createClaudeReader('test-key-not-real', 'claude-sonnet-5', { fetch: f.fetchImpl, maxRetries: 0 })
    const out = await read({ media_type: 'application/pdf', data_base64: b64(PDF) })
    expect(out).toEqual({ json: goodResult(), stop_reason: 'end_turn', model: 'claude-sonnet-5', input_tokens: 3100, output_tokens: 777 })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(f.calls[0].body.stream).toBe(true)
    expect(f.calls[0].body.output_config.format.type).toBe('json_schema')
    expect(f.calls[0].headers.get('x-api-key')).toBe('test-key-not-real')
    expect(JSON.stringify(f.calls[0].body)).not.toContain('test-key-not-real')
  })

  it('거절·길이 초과는 json 없이 stop_reason만', async () => {
    for (const reason of ['refusal', 'max_tokens']) {
      const f = fakeAnthropic(() => new Response(streamOf('{"readable":', reason), { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      const out = await createClaudeReader('k', 'claude-sonnet-5', { fetch: f.fetchImpl, maxRetries: 0 })({ media_type: 'application/pdf', data_base64: 'QQ==' })
      expect(out).toMatchObject({ json: null, stop_reason: reason })
    }
  })

  it('HTTP 오류 분류: 401 auth · 429 rate_limit · 529 overloaded · 400 bad_request', async () => {
    const err = (status: number, type: string) => () =>
      new Response(JSON.stringify({ type: 'error', error: { type, message: 'x' } }), { status, headers: { 'content-type': 'application/json' } })
    for (const [status, type, kind] of [
      [401, 'authentication_error', 'auth'],
      [429, 'rate_limit_error', 'rate_limit'],
      [529, 'overloaded_error', 'overloaded'],
      [400, 'invalid_request_error', 'bad_request'],
    ] as const) {
      const f = fakeAnthropic(err(status, type))
      const read = createClaudeReader('k', 'claude-sonnet-5', { fetch: f.fetchImpl, maxRetries: 0 })
      const e = await read({ media_type: 'application/pdf', data_base64: 'QQ==' }).catch((x: unknown) => x)
      expect(e).toBeInstanceOf(AiUpstreamError)
      expect((e as AiUpstreamError).kind).toBe(kind)
    }
  })
})

// ── ⑤ 앱 쪽 ───────────────────────────────────────────────────────────

describe('DoD 83 · ⑤ 앱 쪽 — 파일 준비 · aiClient', () => {
  it('PDF는 그대로 base64 · 사진이 크면 줄여 JPEG로 · 줄이기 불가면 원본 · 3MB 넘으면 보내지 않는다', async () => {
    const pdf = await prepareAiFile('a.pdf', PDF.buffer.slice(0) as ArrayBuffer)
    expect(pdf).toEqual({ media_type: 'application/pdf', data_base64: b64(PDF), bytes: PDF.length, resized: false })

    const big = new Uint8Array(2_000_000).fill(7)
    big.set(PNG)
    const shrink = vi.fn(async () => new Blob([JPEG], { type: 'image/jpeg' }))
    const small = await prepareAiFile('사진.png', big.buffer, shrink)
    expect(shrink).toHaveBeenCalledWith(expect.any(Blob), 2000)
    expect(small).toMatchObject({ media_type: 'image/jpeg', data_base64: b64(JPEG), resized: true })

    const same = await prepareAiFile('사진.png', big.buffer, async () => null)
    expect(same).toMatchObject({ media_type: 'image/png', resized: false, bytes: big.length })

    const huge = new Uint8Array(AI_MAX_BYTES + 1)
    await expect(prepareAiFile('큰.pdf', huge.buffer)).rejects.toMatchObject({ code: 'validation', message: AI_FILE_TOO_LARGE_MESSAGE })
    await expect(prepareAiFile('a.heic', PNG.buffer)).rejects.toMatchObject({ code: 'validation' })
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID')
  })

  it('aiClient: Bearer로 POST · 결과 그대로 · 로그인 없음 forbidden · 429 문구 그대로(conflict) · 연결 실패 문구', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const ok = { doc: docFromAiVendorQuote(goodResult()), model: 'claude-sonnet-5', usage: { used: 1, limit: 30 } }
    const client = createAiClient({
      apiBase: '/leadgen/communicator/api',
      accessToken: async () => 'jwt-9',
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response(JSON.stringify(ok), { status: 200 })
      }) as unknown as typeof fetch,
    })
    const input = { project_id: PROJECT, file_name: 'a.pdf', media_type: 'application/pdf' as const, data_base64: 'QQ==' }
    expect(await client.readVendorQuote(input)).toEqual(ok)
    expect(calls[0].url).toBe('/leadgen/communicator/api/ai?action=vendor-quote')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer jwt-9')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input)

    const anon = createAiClient({ apiBase: '/api', accessToken: async () => null, fetchImpl: vi.fn() as unknown as typeof fetch })
    await expect(anon.readVendorQuote(input)).rejects.toMatchObject({ code: 'forbidden', message: '로그인이 필요합니다.' })

    const limited = createAiClient({
      apiBase: '/api',
      accessToken: async () => 't',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { code: 'rate_limited', message: '오늘 AI 읽기 30회를 모두 썼습니다' } }), { status: 429 })) as unknown as typeof fetch,
    })
    await expect(limited.readVendorQuote(input)).rejects.toMatchObject({ code: 'conflict', message: '오늘 AI 읽기 30회를 모두 썼습니다' })

    const down = createAiClient({ apiBase: '/api', accessToken: async () => 't', fetchImpl: (async () => Promise.reject(new TypeError('x'))) as unknown as typeof fetch })
    await expect(down.readVendorQuote(input)).rejects.toMatchObject({ message: expect.stringContaining('연결할 수 없습니다') })
  })
})

// ── ⑥ 비밀·경계 ───────────────────────────────────────────────────────

describe('DoD 83 · ⑥ 키는 서버 전용 · SDK는 api/에서만', () => {
  it('앱 소스(src, 테스트 제외)에 VITE_ANTHROPIC·import.meta.env.ANTHROPIC·SDK import 0 · 레포에 실키 패턴 0 · env 예시에 VITE_ 판 없음', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, resolve } = await import('node:path')
    const ROOT = resolve(__dirname, '../..')
    const collect = (dir: string, skipTest: boolean) => {
      const out: string[] = []
      const walk = (d: string) => {
        for (const name of readdirSync(d)) {
          const p = join(d, name)
          if (statSync(p).isDirectory()) {
            if (!(skipTest && name === 'test') && name !== 'node_modules') walk(p)
          } else if (/\.(ts|tsx|mjs|sql)$/.test(name)) out.push(p)
        }
      }
      walk(dir)
      return out
    }
    const app = collect(resolve(ROOT, 'src'), true)
    expect(app.filter((f) => /VITE_ANTHROPIC|import\.meta\.env\.ANTHROPIC|@anthropic-ai\/sdk/.test(readFileSync(f, 'utf8')))).toEqual([])
    const everywhere = [...collect(resolve(ROOT, 'src'), false), ...collect(resolve(ROOT, 'api'), false), ...collect(resolve(ROOT, 'scripts'), false), ...collect(resolve(ROOT, 'supabase'), false)]
    expect(everywhere.filter((f) => /sk-ant-[A-Za-z0-9_-]{8,}/.test(readFileSync(f, 'utf8')))).toEqual([])
    // SDK를 부르는 곳은 api/_lib/ai/claude.ts 하나
    const sdkUsers = collect(resolve(ROOT, 'api'), false).filter((f) => /from '@anthropic-ai\/sdk'/.test(readFileSync(f, 'utf8')))
    expect(sdkUsers.map((f) => f.slice(ROOT.length + 1))).toEqual(['api/_lib/ai/claude.ts'])
    for (const file of ['.env.production.example', '.env.example']) {
      const text = readFileSync(resolve(ROOT, file), 'utf8')
      expect(text).toMatch(/^ANTHROPIC_API_KEY=$/m)
      expect(text).not.toMatch(/VITE_ANTHROPIC|VITE_AI_/)
    }
    expect(new AiError(429, 'rate_limited', 'x').status).toBe(429)
  })
})
