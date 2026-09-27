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
  syntheticQuoteA,
  syntheticQuoteB,
  syntheticQuoteC,
  syntheticQuoteD,
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
    expect(map.map((m) => m.bucket)).toEqual([
      's1', 's2', 's2', 'recruit', 's3', 's4', 'custom', 'custom',
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

  it('버킷 매핑: Add-ons는 custom — v2.18부터 영문 키워드(add-ons)도 규칙표에 있어 확신 배정(저신뢰 0)', () => {
    const map = mapSectionsToBuckets(doc)
    expect(map.map((m) => m.bucket)).toEqual(['s1', 's2', 's3', 's4', 'custom', 's5', 'recruit'])
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
