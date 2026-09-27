/** @vitest-environment jsdom */
// DoD 94 (Phase 6.9 · 설계서 v2.20.2 §22.1 R형 · §22.2 · §19.2) — 우리 리멤버 견적서(견적 컨피규레이터 내보내기)를 가져오기가 그대로 읽는다.
// 실사용 2026-09-27 "인식률이 너무 떨어진다": 우리 서식이 파서에서 5곳 무너졌다 — 섹션 1 제목(⚠️ 안내 줄이 되짚기를 끊음) ·
// 머리 '베뉴' · 총액 줄("총 견적금액(VAT별도)"가 부가세로 읽혀 총액 2배) · 섹션 4(운영/등록 키워드 충돌 → custom) ·
// 정산보드 모객이 0(rc·ld를 엔진 입력에서 다시 계산 — 가져온 견적은 입력이 비어 있다). 이어서 왕복에서 3곳 더 —
// "추가옵션 제외(VAT별도)" 줄이 부가세로 · 머리 "KPI 달성선 (85% 인정)"이 기획료 85%로 · 영문 'Date'가 행사일로.
//   ① 내보내기 → 파서 왕복(국문·영문·옵션 없음): 섹션 이름·매핑 전부 확신·총액 = 엔진 · 검산 전부 통과 · 모객 분할 = 엔진 rsvpPkg·showup
//   ② R형 골든(옛 Configurator 모양 — 라벨 둘인 총액 줄 · ⚠️ 줄 · 할인 0원 줄)
//   ③ 섹션 이름 → 버킷: 우리 제목(꼬리 무시) · 남의 영문 Add-ons는 custom · 두 규칙에 걸려도 적중이 뚜렷이 많으면 그쪽 · 비슷하면 custom 저신뢰
//   ④ splitRecruit — 쇼업/리드젠 표기 = ld, 그 밖 = rc · 항목 없으면 소계 전부 rc · 소계 나머지 rc · 모객 섹션 없으면 null
//   ⑤ 정산보드(mock): 가져오기 → 확정 → 정산 기준이면 rc·ld = 분할 · 옛 임포트(분할 기록 없음)도 가져오기 기록에서 다시 나눔 · 기록조차 없으면 0(지어내지 않음)
import { describe, expect, it } from 'vitest'
import { calcEstimate } from '../modules/quote/engine/calcEstimate'
import { exportEstimate } from '../modules/quote/export/exportEstimate'
import { R_EXPECTED, syntheticQuoteR } from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import { mapSectionName, mapSectionsToBuckets } from '../modules/quote/import/buckets'
import { parseQuoteWorkbook } from '../modules/quote/import/parser'
import { splitRecruit } from '../modules/quote/import/recruitSplit'
import type { ParsedQuoteDoc } from '../modules/quote/import/types'
import type { Quote } from '../types/entities'
import { mockProvider } from './testUtils'

// 견적 컨피규레이터 샘플 조건(가상 행사) — exportEstimate.test.ts와 같은 값
const CFG: Record<string, unknown> = {
  projectTitle: '샘플 테크 컨퍼런스 2026',
  target: 300,
  guarantee: 80,
  venueType: '5star',
  venueRegion: '서울 강남',
  venueName: '가상컨벤션센터 3F 그랜드볼룸',
  venueRental: 36_000_000,
  displayType: 'led',
  options: { souvenir: true, emcee: true, video: true },
  boothCount: 3,
}

async function exported(cfg: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  const p = calcEstimate(cfg as never)
  const { blob } = await exportEstimate(cfg as never, p, { download: false, ...opts } as never)
  const buf = await blob.arrayBuffer()
  return { p, buf, doc: parseQuoteWorkbook(buf, '리멤버_견적서.xlsx') }
}
const itemCount = (doc: ParsedQuoteDoc) => doc.sections.reduce((n, s) => n + s.items.length, 0)
const bucketOf = (doc: ParsedQuoteDoc) => mapSectionsToBuckets(doc).map((m) => m.bucket)
const lowCount = (doc: ParsedQuoteDoc) => mapSectionsToBuckets(doc).filter((m) => m.confidence === 'low').length

describe('DoD 94 ① 내보내기 → 파서 왕복', () => {
  it('국문: 섹션 7(우리 제목) · 매핑 전부 확신 · 총액·부가세·기획료 = 엔진 · 검산 전부 통과 · 모객 분할 = rsvpPkg·showup', async () => {
    const { p, doc } = await exported(CFG)
    expect(doc.sections.map((s) => s.name)).toEqual([
      '1. 베뉴 사용료',
      '2. 시스템 구축',
      '3. 디자인·브랜딩',
      '4. 운영인력·등록·보험 (300명 기준)',
      '5. 추가옵션',
      '6. PCO 기획료',
      '7. 리멤버 모객 솔루션 [게런티 80명]',
    ])
    expect(bucketOf(doc)).toEqual(['s1', 's2', 's3', 's4', 'options', 's5', 'recruit'])
    expect(lowCount(doc)).toBe(0)
    expect(doc.sections.map((s) => s.subtotal)).toEqual([p.s1, p.s2, p.s3, p.s4, p.ot, p.s5, p.rsvpPkg + p.showup])
    expect(doc.sections[0].items).toHaveLength(1) // ⚠️ 안내 줄·F&B 안내 줄은 항목이 아니다
    expect(doc.header).toMatchObject({ event_name: '샘플 테크 컨퍼런스 2026', venue: '가상컨벤션센터 3F 그랜드볼룸', total_amount: p.pk, vat_mode: 'excluded' })
    expect(doc.totals).toEqual({ items_sum: p.pk, agency_fee: p.s5, vat: Math.round(p.pk * 0.1), grand_total: Math.round(p.pk * 1.1) })
    expect(doc.totals.agency_fee_rate).toBeUndefined() // 머리 "KPI 달성선 (85% 인정)"은 기획료 비율이 아니다
    expect(doc.checks.filter((c) => !c.ok)).toEqual([])
    expect(doc.warnings.filter((w) => w.includes('총액') || w.includes('부가세') || w.includes('기획료'))).toEqual([])
    expect(splitRecruit(doc, mapSectionsToBuckets(doc))).toEqual({ rsvp: p.rsvpPkg, showup: p.showup })
  })

  it('영문(lang=en): 같은 버킷 · "5. Add-ons"는 options · 총액 = 부가세 전(Total (VAT excl.)) · "Date"는 견적일이지 행사일이 아니다', async () => {
    const { p, doc } = await exported(CFG, { lang: 'en' })
    expect(doc.sections.map((s) => s.name)).toEqual([
      '1. Venue Rental',
      '2. System / AV',
      '3. Design / Branding',
      '4. Operations · Staff · Insurance (300 pax)',
      '5. Add-ons',
      '6. PCO Planning Fee',
      '7. Audience Recruitment [Guarantee 80]',
    ])
    expect(bucketOf(doc)).toEqual(['s1', 's2', 's3', 's4', 'options', 's5', 'recruit'])
    expect(lowCount(doc)).toBe(0)
    expect(doc.header).toMatchObject({ total_amount: p.pk, vat_mode: 'excluded' })
    expect(doc.header.date_range).toBeUndefined()
    expect(doc.header.quoted_at).toBeTruthy()
    expect(doc.header.currency).toBeUndefined() // KRW 표기 = 원화 — 통화 경고 없음
    expect(doc.totals).toEqual({ items_sum: p.pk, agency_fee: p.s5, vat: Math.round(p.pk * 0.1), grand_total: Math.round(p.pk * 1.1) })
    expect(doc.checks.filter((c) => !c.ok)).toEqual([])
    expect(splitRecruit(doc, mapSectionsToBuckets(doc))).toEqual({ rsvp: p.rsvpPkg, showup: p.showup })
  })

  it('옵션 없음(둘째 총액 줄 없음) + 자동 산정 베뉴: 섹션 6 · 번호가 당겨진 PCO·모객도 그대로', async () => {
    const { p, doc } = await exported({ ...CFG, venueRental: undefined, options: {}, boothCount: 0 })
    expect(doc.sections).toHaveLength(6)
    expect(bucketOf(doc)).toEqual(['s1', 's2', 's3', 's4', 's5', 'recruit'])
    expect(lowCount(doc)).toBe(0)
    expect(doc.totals).toEqual({ items_sum: p.pk, agency_fee: p.s5, vat: Math.round(p.pk * 0.1), grand_total: Math.round(p.pk * 1.1) })
    expect(doc.checks.filter((c) => !c.ok)).toEqual([])
    expect(splitRecruit(doc, mapSectionsToBuckets(doc))).toEqual({ rsvp: p.rsvpPkg, showup: p.showup })
  })
})

describe('DoD 94 ② R형 골든(옛 Configurator 모양)', () => {
  it('라벨 둘인 총액 줄 · ⚠️ 줄 · "[예상치 · 확정 아님]" 꼬리 · 할인 0원 줄 — 섹션 6 · 항목 12 · 총액·부가세 · 매핑 전부 확신 · 분할', async () => {
    const doc = parseQuoteWorkbook(await syntheticQuoteR(), '가상_리멤버견적서.xlsx')
    expect(doc.sections).toHaveLength(R_EXPECTED.sections)
    expect(itemCount(doc)).toBe(R_EXPECTED.items)
    expect(doc.sections[0].name).toBe('1. 베뉴 사용료 [예상치 · 확정 아님]')
    expect(doc.sections[0].items.map((i) => i.title)).toEqual(['장소 사용료'])
    expect(doc.sections[1].items.map((i) => i.amount)).toEqual([2_000_000, 1_500_000, 0])
    expect(doc.header).toMatchObject({
      event_name: '가상 리더십 서밋 2026',
      venue: '가상호텔 2F 볼룸',
      total_amount: R_EXPECTED.itemsSum,
      vat_mode: 'excluded',
    })
    expect(doc.header.quoted_at).toBeTruthy()
    expect(doc.totals).toEqual({
      items_sum: R_EXPECTED.itemsSum,
      agency_fee: R_EXPECTED.agencyFee,
      vat: R_EXPECTED.vat,
      grand_total: R_EXPECTED.grandTotal,
    })
    expect(bucketOf(doc)).toEqual(['s1', 's2', 's3', 's4', 's5', 'recruit'])
    expect(lowCount(doc)).toBe(0)
    // 검산 — 소계·항목 합·부가세·총액 체인 전부 통과. 단가×수량 검산만 할인 0원 줄 1건으로 어긋나고 경고로 알린다
    const failed = doc.checks.filter((c) => !c.ok)
    expect(failed.map((c) => c.name)).toEqual(['항목 단가×수량×일수 = 금액'])
    expect(doc.warnings.some((w) => w.includes('단가×수량과 금액이 다른 행 1건') && w.includes('4K 스케일러/KVM'))).toBe(true)
    expect(splitRecruit(doc, mapSectionsToBuckets(doc))).toEqual({ rsvp: R_EXPECTED.rsvp, showup: R_EXPECTED.showup })
  })
})

describe('DoD 94 ③ 섹션 이름 → 버킷', () => {
  it('우리 제목은 꼬리를 무시하고 확신 · 남의 영문 Add-ons는 custom(확신) · 적중 차 2 이상이면 많은 쪽 · 비슷하면 custom 저신뢰', () => {
    expect(mapSectionName('4. 운영인력·등록·보험 (300명 기준)')).toEqual({ bucket: 's4', confidence: 'high' })
    expect(mapSectionName('4. Operations · Staff · Insurance (120 pax)')).toEqual({ bucket: 's4', confidence: 'high' })
    expect(mapSectionName('1. 베뉴 사용료 [예상치 · 확정 아님]')).toEqual({ bucket: 's1', confidence: 'high' })
    expect(mapSectionName('7. 리멤버 모객 솔루션 [게런티 40명]')).toEqual({ bucket: 'recruit', confidence: 'high' })
    expect(mapSectionName('6. 참가인원 관리')).toEqual({ bucket: 'attendee', confidence: 'high' })
    expect(mapSectionName('5. PCO 기획료')).toEqual({ bucket: 's5', confidence: 'high' })
    expect(mapSectionName('5. Add-ons')).toEqual({ bucket: 'options', confidence: 'high' })
    expect(mapSectionName('5. 추가 옵션 (Add-ons)')).toEqual({ bucket: 'options', confidence: 'high' })
    expect(mapSectionName('5. Optional Add-ons (not included in total)')).toEqual({ bucket: 'custom', confidence: 'high' })
    // 키워드 규칙 — 두 규칙에 걸려도 한쪽 적중이 2개 이상 많으면 그쪽
    expect(mapSectionName('무대 음향 조명 LED 시스템 등록')).toEqual({ bucket: 's2', confidence: 'high' })
    // 적중 차가 1이면 여전히 사람 확인(저신뢰)
    expect(mapSectionName('운영 인력 및 등록 지원')).toEqual({ bucket: 'custom', confidence: 'low' })
    expect(mapSectionName('기타')).toEqual({ bucket: 'custom', confidence: 'low' })
  })
})

describe('DoD 94 ④ splitRecruit', () => {
  const doc = (sections: ParsedQuoteDoc['sections']) => ({ sections })
  const sec = (name: string, items: { title: string; amount: number; spec?: string }[], subtotal?: number) => ({ name, order: 1, items, subtotal })

  it('쇼업·리드젠·show-up 표기 = ld(showup) · 그 밖 = rc(rsvp) · 항목 없으면 소계 전부 rc · 소계 나머지 rc · 모객 섹션 없으면 null', () => {
    const mapping = [{ section: '6. 모객', bucket: 'recruit', confidence: 'high' as const }, { section: '1. 베뉴', bucket: 's1', confidence: 'high' as const }]
    expect(
      splitRecruit(
        doc([
          sec('1. 베뉴', [{ title: '대관', amount: 9_000_000 }], 9_000_000),
          sec('6. 모객', [{ title: 'RSVP 운영비', amount: 1_600_000 }, { title: '쇼업 보장', amount: 14_000_000 }, { title: 'Lead-gen boost', amount: 1_000_000 }, { title: '참석 보장 추가', amount: 500_000 }], 17_100_000),
        ]),
        mapping,
      ),
    ).toEqual({ rsvp: 1_600_000, showup: 15_500_000 })
    // 표기는 규격에 있어도 된다
    expect(splitRecruit(doc([sec('6. 모객', [{ title: '패키지', amount: 3_000_000, spec: 'Show-up guarantee 30' }])]), mapping)).toEqual({ rsvp: 0, showup: 3_000_000 })
    // 항목 줄 없이 소계만 → 전부 rc(비율을 지어내지 않는다)
    expect(splitRecruit(doc([sec('6. 모객', [], 5_000_000)]), mapping)).toEqual({ rsvp: 5_000_000, showup: 0 })
    // 소계가 항목 합보다 크면 차이는 rc
    expect(splitRecruit(doc([sec('6. 모객', [{ title: '쇼업 보장', amount: 4_000_000 }], 4_300_000)]), mapping)).toEqual({ rsvp: 300_000, showup: 4_000_000 })
    // 모객 섹션이 없으면 null(엔진 값 그대로)
    expect(splitRecruit(doc([sec('1. 베뉴', [{ title: '대관', amount: 1 }])]), [{ section: '1. 베뉴', bucket: 's1', confidence: 'high' }])).toBeNull()
  })
})

describe('DoD 94 ⑤ 정산보드 — 가져온 견적의 rc·ld', () => {
  it('가져오기 → 확정 → 정산 기준: rc = RSVP 운영비 · ld = 쇼업 보장 · 옛 임포트(분할 기록 없음)도 가져오기 기록에서 다시 나눔 · 기록조차 없으면 0', async () => {
    const provider = mockProvider()
    provider.switchUser('usr-pm')
    provider.setAppRole('sales')
    const { p, buf } = await exported(CFG)
    const imported = await provider.importQuoteFile('리멤버_견적서.xlsx', buf)
    expect(imported.mapping.every((m) => m.confidence === 'high')).toBe(true)
    const quote = await provider.confirmQuoteImport(imported.id, { mapping: imported.mapping })
    expect(quote.breakdown).toMatchObject({ s1: p.s1, s2: p.s2, s3: p.s3, s4: p.s4, s5: p.s5, options: p.ot, recruit: p.rsvpPkg + p.showup, recruit_rsvp: p.rsvpPkg, recruit_showup: p.showup })
    expect(quote.total_amount).toBe(p.pk)
    await provider.finalizeQuote(quote.id)
    const result = await provider.distributeQuoteImport(imported.id, { project_prefill: true, settlement_base: true })
    const projectId = result.project_id!
    const amounts = async () => {
      const board = (await provider.getSettlementBoard(projectId))!
      return Object.fromEntries(board.buckets.map((b) => [b.bucket.code, b.bucket.quote_amount]))
    }
    expect(await amounts()).toMatchObject({ s1: p.s1, s2: p.s2, s3: p.s3, s4: p.s4, ot: p.ot, s5: p.s5, rc: p.rsvpPkg, ld: p.showup, at: 0 })

    // 옛 임포트 — 분할이 기록되기 전에 만든 견적(breakdown에 recruit_rsvp 없음): 기준 견적 갱신이 가져오기 기록에서 다시 나눈다
    const state = (provider as unknown as { state: { quotes: Quote[]; quote_imports: { quote_id: string | null }[] } }).state
    const stored = state.quotes.find((q) => q.id === quote.id)!
    delete (stored.breakdown as { recruit_rsvp?: number }).recruit_rsvp
    delete (stored.breakdown as { recruit_showup?: number }).recruit_showup
    await provider.rebaseSettlementBoard(projectId, quote.id)
    expect(await amounts()).toMatchObject({ rc: p.rsvpPkg, ld: p.showup })

    // 가져오기 기록마저 없으면 값을 지어내지 않는다 — 엔진 값(0) · 화면에서 버킷 견적 금액을 손으로 고친다(§19.2)
    const imp = state.quote_imports.find((x) => x.quote_id === quote.id)!
    imp.quote_id = null
    await provider.rebaseSettlementBoard(projectId, quote.id)
    expect(await amounts()).toMatchObject({ rc: 0, ld: 0, s1: p.s1 })
    imp.quote_id = quote.id
  })
})
