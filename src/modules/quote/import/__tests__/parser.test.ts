/** @vitest-environment jsdom */
// DoD 34 / §22.2 — 파서 골든 테스트. 가상 픽스처 3종(A·B·C형)을 exceljs로 그 자리에서 만들어
// 서식 판정·섹션/항목 수·헤더 필드·검산·버킷 매핑(저신뢰 플래그)을 고정한다(R-Q4: 실파일 미커밋).
import { beforeAll, describe, expect, it } from 'vitest'
import { ProviderError } from '../../../../lib/errors'
import { mapSectionsToBuckets } from '../buckets'
import { parseQuoteWorkbook } from '../parser'
import type { ParsedQuoteDoc } from '../types'
import {
  A_EXPECTED,
  B_EXPECTED,
  C_EXPECTED,
  D_EXPECTED,
  E_EXPECTED,
  F_EXPECTED,
  P_EXPECTED,
  syntheticBudgetP,
  syntheticQuoteA,
  syntheticQuoteB,
  syntheticQuoteC,
  syntheticQuoteD,
  syntheticQuoteE,
  syntheticQuoteF,
} from './fixtures/syntheticQuotes'

const itemCount = (doc: ParsedQuoteDoc) => doc.sections.reduce((sum, s) => sum + s.items.length, 0)
const checkOf = (doc: ParsedQuoteDoc, needle: string) => doc.checks.find((c) => c.name.includes(needle))
const lowCount = (doc: ParsedQuoteDoc) => mapSectionsToBuckets(doc).filter((m) => m.confidence === 'low').length

describe('A형(단가·수량·일수) 골든', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticQuoteA(), '가상견적_A형.xlsx')
  })

  it('서식을 A형으로 판정하고 섹션 8·항목 21건을 읽는다', () => {
    expect(doc.format).toBe('A')
    expect(doc.sections).toHaveLength(A_EXPECTED.sections)
    expect(itemCount(doc)).toBe(A_EXPECTED.items)
    expect(doc.sections[0].name).toBe('1. 장소 대관료')
    expect(doc.sections[0].subtotal).toBe(19_000_000)
    expect(doc.sections[0].items[2]).toMatchObject({
      title: '그랜드홀 앞 로비',
      unit_price: 1_000_000,
      qty: 1,
      days: 2,
      amount: 2_000_000,
    })
  })

  it('헤더 6필드를 라벨 사전으로 모두 인식한다(공백 낀 "행 사 명" 포함)', () => {
    expect(doc.header.event_name).toBe('가상 커머스 서밋 2027')
    expect(doc.header.client).toBe('가상커머스')
    expect(doc.header.date_range).toBe('2027.03.10(설치) ~ 03.11(본행사)')
    expect(doc.header.venue).toBe('가상컨벤션센터 그랜드홀 전관')
    expect(doc.header.quoted_at).toBe('2027. 01. 15')
    expect(doc.header.manager).toContain('김기획')
  })

  it('총액 블록: 항목합 → 대행료 25%(만원 절사) → 절사(음수) → VAT → VAT 포함 총액', () => {
    expect(doc.totals.items_sum).toBe(A_EXPECTED.itemsSum)
    expect(doc.totals.agency_fee).toBe(A_EXPECTED.agencyFee)
    expect(doc.totals.agency_fee_rate).toBeCloseTo(0.25, 10)
    expect(doc.totals.rounding).toBe(A_EXPECTED.rounding)
    expect(doc.totals.vat).toBe(A_EXPECTED.vat)
    expect(doc.totals.grand_total).toBe(A_EXPECTED.grandTotal)
    // 대표 금액은 문서에 인쇄된 그대로 + 포함/별도 표기
    expect(doc.header.total_amount).toBe(A_EXPECTED.grandTotal)
    expect(doc.header.vat_mode).toBe('included')
  })

  it('검산이 전부 통과하고 경고가 없다 (섹션 소계 8 + 항목합 + 대행료율 + VAT + 총액 체인 + 단가검산)', () => {
    expect(doc.checks.every((c) => c.ok)).toBe(true)
    expect(checkOf(doc, '대행료 25%')).toMatchObject({ expected: 22_500_000, actual: 22_500_000, ok: true })
    expect(checkOf(doc, '총액 체인')).toMatchObject({ expected: 123_000_000, actual: 123_000_000, ok: true })
    expect(checkOf(doc, '단가×수량×일수')).toMatchObject({ expected: 21, actual: 21, ok: true })
    expect(doc.warnings).toEqual([])
  })

  it('버킷 매핑: 키워드 1개 규칙만 맞으면 high, 무매칭은 custom + 저신뢰 1건', () => {
    const map = mapSectionsToBuckets(doc)
    // v2.22.1 — '4. 현장 등록 · 명찰 발급'은 참관객 관리(at · 원가 있음)다. 전에는 등록 키워드가 모객(rc · 원가 없음)이라 명찰 협력사 발주가 막혔다
    expect(map.map((m) => m.bucket)).toEqual([
      's1', 's2', 's2', 'attendee', 's3', 's4', 'custom', 'custom',
    ])
    expect(lowCount(doc)).toBe(1)
    expect(map[7]).toMatchObject({ section: '8. 행사 기록 · 홍보', bucket: 'custom', confidence: 'low' })
    // 기념품·웰컴은 규칙표에 있으므로 custom이어도 확신 있는 배정이다
    expect(map[6].confidence).toBe('high')
  })
})

describe('B형(금액 단식) 골든', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticQuoteB(), '가상견적_B형.xlsx')
  })

  it('서식 B형 · 섹션 8(5-1 소수 번호 포함) · 항목 16건', () => {
    expect(doc.format).toBe('B')
    expect(doc.sections).toHaveLength(B_EXPECTED.sections)
    expect(itemCount(doc)).toBe(B_EXPECTED.items)
    expect(doc.sections.map((s) => s.name)).toContain('5-1. 선택 옵션 (총액 미포함)')
    // 섹션 제목이 열 헤더 행보다 위에 오는 서식 — 1번 섹션이 잘리지 않아야 한다
    expect(doc.sections[0].name).toBe('1. 베뉴 사용료')
    expect(doc.sections[0].items).toHaveLength(2)
  })

  it('인식 실패 필드는 빈 값으로 두고 확인 큐로 넘긴다(추정 금지)', () => {
    expect(doc.header.event_name).toBe('가상 AI 서밋 2027')
    expect(doc.header.venue).toBe('가상컨벤션센터 볼룸 전관 + 로비')
    expect(doc.header.quoted_at).toBe('2027. 01. 20')
    expect(doc.header.manager).toBe('박매니저')
    expect(doc.header.client).toBeUndefined()
    expect(doc.header.date_range).toBeUndefined()
    expect(doc.warnings.some((w) => w.includes('인식하지 못한 헤더 항목'))).toBe(true)
  })

  it('총액 체계: 최종 견적(VAT 별도) + 부가세 → grand_total은 VAT 포함으로 정규화된다', () => {
    expect(doc.header.total_amount).toBe(B_EXPECTED.itemsSum)
    expect(doc.header.vat_mode).toBe('excluded')
    expect(doc.totals.items_sum).toBe(B_EXPECTED.itemsSum)
    expect(doc.totals.vat).toBe(B_EXPECTED.vat)
    expect(doc.totals.grand_total).toBe(B_EXPECTED.grandTotal)
    // 기획료가 섹션 안에 있는 서식 — 총액 체인에서 이중 계상하지 않는다
    expect(doc.totals.agency_fee).toBe(B_EXPECTED.agencyFee)
    expect(checkOf(doc, '총액 체인')).toMatchObject({ expected: 140_250_000, actual: 140_250_000, ok: true })
  })

  it('"(총액 미포함)" 옵션 행은 항목으로 담되 섹션 합계 검산에서 빠지고 경고로 남는다', () => {
    const optional = doc.sections.find((s) => s.name.startsWith('5-1'))!
    expect(optional.items).toHaveLength(1)
    expect(optional.items[0].amount).toBe(2_000_000)
    expect(optional.subtotal).toBe(0)
    expect(checkOf(doc, '5-1')).toMatchObject({ expected: 0, actual: 0, ok: true })
    expect(doc.warnings.some((w) => w.includes('총액 미포함'))).toBe(true)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
  })

  it('섹션 안 기획료 25%(직접비 기준)를 인식한다', () => {
    expect(doc.totals.agency_fee_rate).toBeCloseTo(0.25, 10)
    expect(checkOf(doc, '기획료 25%')).toMatchObject({ expected: 17_500_000, actual: 17_500_000, ok: true })
  })

  it('버킷 매핑: 선택 옵션 섹션만 저신뢰', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2', 's3', 's4', 's4', 'custom', 's5', 'recruit'])
    expect(lowCount(doc)).toBe(1)
    expect(map[5].confidence).toBe('low')
  })
})

describe('C형(패키지·UNIT PRICE/QTY/AMOUNT/SELECT) 골든', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticQuoteC(), '가상견적_C형.xlsx')
  })

  it('서식 C형(일수 열 없음 · SELECT 열 있음) · 섹션 7 · 항목 13건', () => {
    expect(doc.format).toBe('C')
    expect(doc.sections).toHaveLength(C_EXPECTED.sections)
    expect(itemCount(doc)).toBe(C_EXPECTED.items)
  })

  it('영문 라벨 헤더도 사전 매칭된다', () => {
    expect(doc.header.event_name).toBe('가상 테크 서밋 2027')
    expect(doc.header.client).toBe('가상테크')
    expect(doc.header.date_range).toBe('2027-05-20 ~ 2027-05-21')
    expect(doc.header.venue).toBe('가상컨벤션센터 홀 A')
    expect(doc.header.quoted_at).toBe('2027-04-01')
    expect(doc.header.manager).toBe('이담당')
    expect(doc.header.vat_mode).toBe('excluded')
    expect(doc.header.total_amount).toBe(C_EXPECTED.itemsSum)
  })

  it('Add-ons의 미선택(X) 행은 담되 합계에서 제외 — 검산은 전부 통과', () => {
    const addons = doc.sections.find((s) => s.name.startsWith('5.'))!
    expect(addons.items).toHaveLength(2)
    expect(addons.items[1].note).toContain('미선택')
    expect(addons.subtotal).toBe(3_000_000)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
    expect(doc.totals.grand_total).toBe(C_EXPECTED.grandTotal)
    expect(checkOf(doc, '기획료 25%')).toMatchObject({ expected: 9_500_000, actual: 9_500_000, ok: true })
    expect(checkOf(doc, '단가×수량×일수')).toMatchObject({ expected: 13, actual: 13, ok: true })
  })

  it('버킷 매핑: "추가 옵션 (Add-ons)"은 options(ot) — v2.20.2 우리 견적서 제목표가 국문 "추가 옵션"을 먼저 잡는다(저신뢰 0)', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2', 's3', 's4', 'options', 's5', 'recruit'])
    expect(lowCount(doc)).toBe(0)
  })
})

describe('입력 방어', () => {
  it('xlsx가 아니면 validation 오류 — provider가 400으로 전파한다', () => {
    expect(() => parseQuoteWorkbook(new ArrayBuffer(0), 'empty.xlsx')).toThrow(ProviderError)
    try {
      parseQuoteWorkbook(new TextEncoder().encode('not a workbook').buffer as ArrayBuffer, 'x.csv')
      expect.unreachable('오류가 나야 한다')
    } catch (e) {
      expect((e as ProviderError).status).toBe(400)
    }
  })

  it('항목 표를 못 찾으면 진행하지 않고 오류로 알린다', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('메모')
    ws.getCell('A1').value = '메모만 있는 시트'
    const buf = await wb.xlsx.writeBuffer()
    const ab = new ArrayBuffer((buf as ArrayBuffer).byteLength)
    new Uint8Array(ab).set(new Uint8Array(buf as ArrayBuffer))
    expect(() => parseQuoteWorkbook(ab, '메모.xlsx')).toThrow(/항목 표/)
  })
})

// ── v2.18 §22.2-0 영문 견적서(해외 인바운드) — 라벨 사전 국/영문 · 통화 경고 · 단어 단위 키워드 ──
describe('D형(영문 · USD) 골든 — v2.18', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticQuoteD(), 'virtual_quotation_en.xlsx')
  })

  it('영문 열 라벨(ITEM·DESCRIPTION·UNIT PRICE·QTY·AMOUNT)을 읽고 섹션 5·항목 8건 — Subtotal 행이 소계', () => {
    expect(doc.format).toBe('C')
    expect(doc.sections).toHaveLength(D_EXPECTED.sections)
    expect(itemCount(doc)).toBe(D_EXPECTED.items)
    expect(doc.sections[0]).toMatchObject({ name: '1. Venue Rental', subtotal: 45_000 })
    expect(doc.sections[0].items[0]).toMatchObject({ title: 'Hall B rental', spec: 'Main hall, 2 days', unit_price: 22_500, qty: 2, amount: 45_000 })
    expect(doc.sections[3].items[0]).toMatchObject({ title: 'Registration staff', unit_price: 500, qty: 20, amount: 10_000 })
  })

  it('영문 헤더 6필드 — Event가 Event Date를 삼키지 않고(단어 단위) Contact가 담당자', () => {
    expect(doc.header.event_name).toBe('Virtual Global Tech Summit 2027')
    expect(doc.header.client).toBe('Virtual Overseas Corp.')
    expect(doc.header.date_range).toBe('10-11 March 2027')
    expect(doc.header.venue).toBe('Virtual Convention Center, Hall B')
    expect(doc.header.quoted_at).toBe('15 January 2027')
    expect(doc.header.manager).toBe('Jane Planner')
  })

  it('총액 블록 — Sub Total → Agency Fee 15% → VAT → Grand Total (VAT included) · 대표 금액 = 포함 총액', () => {
    expect(doc.totals.items_sum).toBe(D_EXPECTED.itemsSum)
    expect(doc.totals.agency_fee).toBe(D_EXPECTED.agencyFee)
    expect(doc.totals.agency_fee_rate).toBeCloseTo(0.15, 10)
    expect(doc.totals.vat).toBe(D_EXPECTED.vat)
    expect(doc.totals.grand_total).toBe(D_EXPECTED.grandTotal)
    expect(doc.header.total_amount).toBe(D_EXPECTED.grandTotal)
    expect(doc.header.vat_mode).toBe('included')
  })

  it('통화 = USD를 적고 경고만 남긴다(환산 없음) · 외화는 대행료 검산에 만원 절사를 쓰지 않는다 · 검산 전부 통과', () => {
    expect(doc.header.currency).toBe('USD')
    expect(doc.warnings.some((w) => w.includes('USD') && w.includes('환산 없음'))).toBe(true)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
    const fee = checkOf(doc, '대행료 15%')!
    expect(fee.name).not.toContain('절사')
    expect(fee).toMatchObject({ expected: 15_000, actual: 15_000, ok: true })
    expect(checkOf(doc, '총액 체인')).toMatchObject({ expected: 126_500, actual: 126_500, ok: true })
    expect(checkOf(doc, '단가×수량×일수')).toMatchObject({ expected: 8, actual: 8, ok: true })
    // "Optional - not included" 항목은 섹션 합계 검산에서 빠진다
    expect(doc.warnings.some((w) => w.includes("'총액 미포함' 표기 항목 1건"))).toBe(true)
  })

  it('버킷 매핑 — 영문 키워드 단어 단위: Venue Rental→s1 · Stage & AV→s2 · Design & Signage→s3 · Operation Staff→s4 · Optional Add-ons→custom(확신)', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2', 's3', 's4', 'custom'])
    expect(map.every((m) => m.confidence === 'high')).toBe(true)
  })

  it('국문 문서는 통화 경고가 없다(A형) — 원화 표기가 있으면 원화 문서', async () => {
    const ko = parseQuoteWorkbook(await syntheticQuoteA(), '가상견적_A형.xlsx')
    expect(ko.header.currency).toBeUndefined()
    expect(ko.warnings.some((w) => w.includes('통화'))).toBe(false)
  })
})

describe('단어 단위 키워드(v2.18) — 영문 부분 문자열 오탐 방지', () => {
  it("'av'는 'Travel & Accommodation'을 삼키지 않고, 'lead'는 'Leadership Session'을 삼키지 않는다", async () => {
    const { matchesKeyword, mapSectionName } = await import('../buckets')
    expect(matchesKeyword('travel & accommodation', 'av')).toBe(false)
    expect(matchesKeyword('stage & av', 'av')).toBe(true)
    expect(matchesKeyword('leadership session', 'lead')).toBe(false)
    expect(matchesKeyword('lead generation', 'lead')).toBe(true)
    expect(mapSectionName('6. Travel & Accommodation')).toMatchObject({ bucket: 'custom', confidence: 'low' })
    expect(mapSectionName('2. 무대 시스템')).toMatchObject({ bucket: 's2', confidence: 'high' })
  })
})

// ── v2.22.1 §22.1 E·F·P형(Phase 6.19 — 실파일 5종 실측 · 기획자님 #8 "다양한 견적서 형태를 파악하고 뿌릴 수 있도록") ──
describe('E형(다자 발주 · [발주 구분] 태그 섹션 · 상단 요약표 · V.A.T 포함) 골든 — v2.22.1', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticQuoteE(), '가상견적_E형.xlsx')
  })

  it('[태그] N. 제목이 섹션이고 발주 건마다 번호가 다시 시작해도 섹션 5 · 항목 7 — 첫 열이 빈 항목 줄은 세부 내용이 제목', () => {
    expect(doc.format).toBe('A')
    expect(doc.sections.map((s) => s.name)).toEqual([
      '[총괄사] 1. 행사장 사용료',
      '[총괄사] 2. 행사장 조성',
      '[총괄사] 3. 등록 · 명찰',
      '[발주처 ①] 1. 전시부스 (상향 사양)',
      '[발주처 ②] 1. LED 영상장비',
    ])
    expect(itemCount(doc)).toBe(E_EXPECTED.items)
    expect(doc.sections.map((s) => s.subtotal)).toEqual([10_000_000, 24_000_000, 1_600_000, 15_000_000, 13_400_000])
    expect(doc.sections[1].items.map((i) => i.title)).toEqual(['부스', '휴게공간 조성'])
    // 끝의 ※ 구조 안내표(금액 없음)는 항목이 아니다
    expect(doc.sections[4].items).toHaveLength(2)
  })

  it('헤더 6필드 · 대표 금액 = "견적금액" 한글 금액 줄(1.1억) · "총 사업비 (V.A.T 포함)"로 부가세 포함 판정', () => {
    expect(doc.header).toMatchObject({
      event_name: '가상 교육 축제 2027 행사 위탁운영',
      client: '가상교육청 창의과',
      venue: '가상호텔 본관 2층 전관',
      manager: '김기획',
      total_amount: E_EXPECTED.headline,
      vat_mode: 'included',
    })
    expect(doc.totals.items_sum).toBe(E_EXPECTED.itemsSum)
    expect(doc.totals.grand_total).toBe(E_EXPECTED.headline)
  })

  it('총액 블록(발주 건별 정액)과 항목 표가 다른 기준 — 역산 부가세가 10%가 아니라는 사실을 검산·경고로 남기고 막지 않는다', () => {
    expect(checkOf(doc, '부가세 10%')?.ok).toBe(false)
    expect(doc.warnings.some((w) => w.includes('역산한 부가세'))).toBe(true)
    expect(doc.checks.filter((c) => c.name.startsWith('섹션 소계')).every((c) => c.ok)).toBe(true)
    expect(checkOf(doc, '단가×수량×일수')).toMatchObject({ expected: 7, actual: 7, ok: true })
    expect(doc.warnings.some((w) => w.includes('인식하지 못한 헤더'))).toBe(false)
  })

  it('버킷 매핑은 [발주 구분] 태그를 떼고 본다 — 행사장 사용료 s1 · 등록·명찰 at · 부스·LED s2 · 행사장 조성만 저신뢰', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 'custom', 'attendee', 's2', 's2'])
    expect(lowCount(doc)).toBe(1)
    expect(map[1].confidence).toBe('low')
  })
})

describe('F형(우리 견적서 변형 · O/X 선택 열 · 대표 총액 줄 둘 · 대행 수수료 섹션) 골든 — v2.22.1', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticQuoteF(), '가상견적_F형.xlsx')
  })

  it("국문 '선택' 열은 선택 열(C형 판정) · 섹션 5 · 항목 10 — X 행은 담되 '(미선택 — 총액 미포함)' · [프로그램] 묶음 줄은 항목이 아니다", () => {
    expect(doc.format).toBe('C')
    expect(doc.sections).toHaveLength(F_EXPECTED.sections)
    expect(itemCount(doc)).toBe(F_EXPECTED.items)
    const venue = doc.sections[0]
    expect(venue.items.map((i) => i.amount)).toEqual([9_000_000, 0])
    expect(venue.items[1].note).toContain('미선택')
    const optional = doc.sections[3]
    expect(optional.name).toBe('4. 선택 항목 (Optional)')
    expect(optional.items.map((i) => i.title)).toEqual(['◎ 참석 회신 접수·리마인드 지원', '전문 진행자', '포토월 (고급형)'])
    expect(optional.subtotal).toBe(1_200_000)
  })

  it('대표 총액 줄이 둘이면 본문 합과 맞는 "선택 항목 포함" 줄이 대표 — 순서와 무관 · 그 줄의 VAT 포함 값이 총액', () => {
    expect(doc.header.total_amount).toBe(F_EXPECTED.itemsSum)
    expect(doc.header.vat_mode).toBe('excluded')
    expect(doc.totals).toEqual({
      items_sum: F_EXPECTED.itemsSum,
      agency_fee: F_EXPECTED.agencyFee,
      agency_fee_rate: 0.15,
      vat: F_EXPECTED.vat,
      grand_total: F_EXPECTED.grandTotal,
    })
    expect(doc.header.total_amount).not.toBe(F_EXPECTED.withoutOptions)
  })

  it("검산 전부 통과 — 조건부 안내('… 시 별도 견적')는 제외 표기가 아니고, X 행은 단가×수량 검산 대상이 아니며, 수수료 기준은 문서의 실행비 셀", () => {
    expect(doc.checks.filter((c) => !c.ok)).toEqual([])
    expect(checkOf(doc, '2. 영상·음향·조명 장비')).toMatchObject({ expected: 4_200_000, actual: 4_200_000, ok: true })
    expect(checkOf(doc, '기획료 15%')).toMatchObject({ expected: 2_430_000, actual: 2_430_000, ok: true })
    expect(checkOf(doc, '단가×수량×일수')).toMatchObject({ expected: 6, actual: 6, ok: true })
    expect(checkOf(doc, '총액 체인')).toMatchObject({ expected: F_EXPECTED.grandTotal, actual: F_EXPECTED.grandTotal, ok: true })
    expect(doc.warnings.some((w) => w.includes("'총액 미포함' 표기 항목 3건"))).toBe(true)
    expect(doc.warnings.some((w) => w.includes('단가×수량과 금액이 다른'))).toBe(false)
  })

  it('버킷 매핑 전부 확신 — 장소 s1 · 장비 s2 · 운영인력·등록·보험 s4 · 선택 항목 ot · 대행 수수료 s5', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2', 's4', 'options', 's5'])
    expect(lowCount(doc)).toBe(0)
  })
})

describe('P형(예산 워크북 · 주최형 워킹버짓) 골든 — v2.22.1', () => {
  let doc: ParsedQuoteDoc
  beforeAll(async () => {
    doc = parseQuoteWorkbook(await syntheticBudgetP(), '가상_워킹버짓.xlsx')
  })

  it("시트 4장 중 섹션 구조가 있는 '지출' 시트를 고른다 — 기준안 열이 금액 · 구분 A~J가 섹션 · 'A. 베뉴 소계' 줄이 이름 · 항목 10", () => {
    expect(doc.format).toBe('P')
    expect(doc.kind).toBe('budget')
    expect(doc.sections.map((s) => s.name)).toEqual([
      'A. 베뉴', 'B. 연출·진행', 'C. 등록·참관객', 'D. 부스·제작물', 'H. 모객·리드젠 (계약 이행)', 'J. 예비비',
    ])
    expect(doc.sections.map((s) => s.code)).toEqual(['A', 'B', 'C', 'D', 'H', 'J'])
    expect(itemCount(doc)).toBe(P_EXPECTED.items)
    expect(doc.sections[0].items[0]).toMatchObject({ title: '행사장 대관 (계약)', amount: 17_920_000, note: '대관계약 원본' })
    // 계산되지 않은 소계(캐시값 0)는 소계로 쓰지 않는다 — 항목 합으로 파생
    expect(doc.sections.every((s) => s.subtotal === undefined)).toBe(true)
    expect(doc.warnings.some((w) => w.includes("'지출' 시트를 읽었습니다"))).toBe(true)
  })

  it('총액 = 지출 합(VAT 별도) · 부가세·총액 체인은 비워 둔다(확정은 items_sum이 공급가) · 수입 표 3건은 기록만', () => {
    expect(doc.totals).toEqual({ items_sum: P_EXPECTED.itemsSum })
    expect(doc.header.total_amount).toBe(P_EXPECTED.itemsSum)
    expect(doc.header.vat_mode).toBe('excluded')
    expect(doc.revenue).toHaveLength(P_EXPECTED.revenue)
    expect(doc.revenue?.map((r) => r.title)).toEqual(['가상파트너A · DIAMOND', '가상파트너B · GOLD + Add-on', '가상파트너C · SILVER'])
    expect(doc.revenue?.reduce((s, r) => s + r.amount, 0)).toBe(P_EXPECTED.revenueSum)
    expect(doc.warnings.some((w) => w.includes('예산 워크북'))).toBe(true)
    expect(doc.warnings.some((w) => w.includes('파트너 계약 매출 3건'))).toBe(true)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
  })

  it('버킷 매핑 — 베뉴 s1 · 연출 s2 · 등록·참관객 at · 모객·리드젠 rc · 예비비 custom(확신) · 부스·제작물만 저신뢰', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2', 'attendee', 'custom', 'recruit', 'custom'])
    expect(lowCount(doc)).toBe(1)
    expect(map[3]).toMatchObject({ section: 'D. 부스·제작물', confidence: 'low' })
  })

  it('견적서(A형)는 kind·revenue가 없다', async () => {
    const quote = parseQuoteWorkbook(await syntheticQuoteA(), '가상견적_A형.xlsx')
    expect(quote.kind).toBeUndefined()
    expect(quote.revenue).toBeUndefined()
  })
})

describe('섹션 이름 → 버킷 (v2.22.1 추가 규칙)', () => {
  it("[발주 구분] 태그 무시 · 등록·명찰 = at · 수수료 = s5 · '선택 항목 (Optional)' = ot · '(총액 미포함)' 선택 옵션은 여전히 custom 저신뢰", async () => {
    const { mapSectionName } = await import('../buckets')
    expect(mapSectionName('[총괄사] 1. 행사장 사용료')).toEqual({ bucket: 's1', confidence: 'high' })
    expect(mapSectionName('[발주처 ②] 1. LED 영상장비')).toEqual({ bucket: 's2', confidence: 'high' })
    expect(mapSectionName('4. 현장 등록 · 명찰 발급 (확정 견적 No.1)')).toEqual({ bucket: 'attendee', confidence: 'high' })
    expect(mapSectionName('C. 등록·참관객')).toEqual({ bucket: 'attendee', confidence: 'high' })
    expect(mapSectionName('6. 대행 수수료 (실행비의 15%)')).toEqual({ bucket: 's5', confidence: 'high' })
    expect(mapSectionName('6. 기획료 (PCO 기획료)')).toEqual({ bucket: 's5', confidence: 'high' })
    expect(mapSectionName('5. 선택 항목 (Optional)')).toEqual({ bucket: 'options', confidence: 'high' })
    expect(mapSectionName('5-1. 선택 옵션 (총액 미포함)')).toEqual({ bucket: 'custom', confidence: 'low' })
    expect(mapSectionName('5. 기록·기념품 (필수) 및 선택 옵션')).toEqual({ bucket: 'custom', confidence: 'high' })
    expect(mapSectionName('2. 공간 연출·시스템 구축')).toEqual({ bucket: 's2', confidence: 'high' })
    expect(mapSectionName('3. 디자인·영상·제작물')).toEqual({ bucket: 's3', confidence: 'high' })
    expect(mapSectionName('H. 모객·리드젠 (계약 이행)')).toEqual({ bucket: 'recruit', confidence: 'high' })
    // 모객(rc)에는 더 이상 '등록'이 없다 — 등록만 있는 제목은 참관객 관리
    expect(mapSectionName('7. 등록')).toEqual({ bucket: 'attendee', confidence: 'high' })
  })
})
