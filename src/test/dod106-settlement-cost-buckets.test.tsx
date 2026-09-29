/** @vitest-environment jsdom */
// DoD 106 (Phase 6.18 · 설계서 v2.22.2 §19.1 · §19.2 · §19.9 · §22.4) — 정산 RSVP 원가 버킷 + 견적·정산 금액 불일치 정정.
// 기획자님 2026-09-28 #7 "정산에서 RSVP에 소요되는 비용도 발주처럼 만들어줄 것" · #8b "견적서 금액과 정산금액이 일치하지 않는 부분도 있는데 다 바로잡아줄 것".
// 운영 실측(로컬 · 레포 0): 세부 산출내역서(A형) 보드의 버킷 합이 공급가보다 대행료(총액 블록에만 있는 25%)만큼 작았고,
// 워킹버짓(P형) 행사는 수입 − 지출을 볼 자리가 없었다.
//   ① quoteBucketSpec: rc(RSVP 운영비)는 원가 버킷 · 원가 없는 기본 버킷은 s5·ld 둘 · ld만 마진 밖
//   ② buildImportedBreakdown(순수): 총액 블록 대행료(+절사)는 섹션 매핑에 s5가 없을 때만 s5 · 섹션에 기획료가 있으면(매핑 s5) 더하지 않음 · 분할·custom 그대로
//   ③ mock 가져오기 → 확정 → 정산 기준(A형): s5 = 대행료 + 절사 · 버킷 합 = 공급가(총액 − 부가세) · rc 버킷에 발주 항목이 들어간다(422 아님)
//   ④ 옛 임포트(breakdown에 s5 0으로 남은 견적)도 '기준 견적 갱신'이 가져오기 기록에서 다시 계산한다
//   ⑤ 협력사 견적서 버킷 제안: 모객·RSVP 행 → rc(원가 버킷) · 리드젠 행은 제안 없음
//   ⑥ 화면: 주최형 행사에 '주최형 손익' 카드(수입 = 파트너 계약액 · 지출 예산 = 버킷 견적 합 · 손익) · 대행형에는 없음 · rc 행이 원가 버킷 표에
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { A_EXPECTED, syntheticQuoteA } from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import { buildImportedBreakdown } from '../modules/quote/import/importedBreakdown'
import type { ParsedQuoteDoc, ParsedQuoteSection, ParsedQuoteTotals, SectionMapping } from '../modules/quote/import/types'
import { hostProfit, quoteBucketSpec } from '../lib/settlement'
import { suggestBucket } from '../lib/vendorQuote'
import { PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import type { Quote, SettlementBucket } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const SUBTOTAL = A_EXPECTED.grandTotal - A_EXPECTED.vat // 111,818,182 — 공급가(부가세 전)
const FEE_WITH_ROUNDING = A_EXPECTED.agencyFee + A_EXPECTED.rounding // 21,818,182

function doc(overrides: Partial<ParsedQuoteTotals> = {}, sections: ParsedQuoteSection[] = []): ParsedQuoteDoc {
  const totals: ParsedQuoteTotals = { items_sum: 1_000_000, agency_fee: 250_000, agency_fee_rate: 0.25, rounding: -10_000, vat: 124_000, grand_total: 1_364_000, ...overrides }
  return { format: 'A', header: { vat_mode: 'excluded' }, sections, totals, checks: [], warnings: [] }
}

const SEC = (name: string, order: number, subtotal: number, items: { title: string; spec?: string }[] = []): ParsedQuoteSection => ({
  name,
  order,
  subtotal,
  items: items.map((it) => ({ title: it.title, spec: it.spec, amount: 0 })),
})

describe('DoD 106 ① 버킷 플래그 — RSVP 운영비는 원가 버킷', () => {
  it('rc has_cost=true · 원가 없는 기본 버킷은 s5·ld · 마진 밖은 ld뿐', () => {
    const rows = quoteBucketSpec({ s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, options: 6, attendee: 7 }, { rsvpPkg: 8, showup: 9 })
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]))
    expect(byCode.rc).toMatchObject({ label: 'RSVP 운영비', quote_amount: 8, has_cost: true, is_margin_base: true })
    expect(rows.filter((r) => !r.has_cost).map((r) => r.code)).toEqual(['s5', 'ld'])
    expect(rows.filter((r) => !r.is_margin_base).map((r) => r.code)).toEqual(['ld'])
  })
})

describe('DoD 106 ② buildImportedBreakdown — 총액 블록의 대행료는 s5', () => {
  it('섹션 매핑에 s5가 없으면 agency_fee + rounding이 s5 · 공급가 = grand_total − vat · 버킷 합 = 공급가', () => {
    const parsed = doc({}, [SEC('1. 장소', 1, 600_000), SEC('2. 운영', 2, 400_000)])
    const mapping: SectionMapping[] = [
      { section: '1. 장소', bucket: 's1', confidence: 'high' },
      { section: '2. 운영', bucket: 's4', confidence: 'high' },
    ]
    const { breakdown, total_amount } = buildImportedBreakdown(parsed, mapping)
    expect(breakdown.s5).toBe(240_000)
    expect(breakdown).toMatchObject({ s1: 600_000, s4: 400_000, subtotal: 1_240_000, vat: 124_000, total: 1_364_000 })
    expect(total_amount).toBe(1_240_000)
    expect(breakdown.s1 + breakdown.s4 + breakdown.s5).toBe(breakdown.subtotal)
  })

  it('섹션에 기획료가 있으면(매핑 s5) 총액 블록 대행료를 더하지 않는다(이중 계상 0) · 대행료가 없는 문서는 s5 = 섹션 값만', () => {
    const parsed = doc({ items_sum: 1_250_000, agency_fee: 250_000, rounding: undefined, vat: 125_000, grand_total: 1_375_000 }, [SEC('1. 장소', 1, 1_000_000), SEC('2. 기획료', 2, 250_000)])
    const mapping: SectionMapping[] = [
      { section: '1. 장소', bucket: 's1', confidence: 'high' },
      { section: '2. 기획료', bucket: 's5', confidence: 'high' },
    ]
    expect(buildImportedBreakdown(parsed, mapping).breakdown.s5).toBe(250_000)

    const noFee = doc({ items_sum: 1_000_000, agency_fee: undefined, agency_fee_rate: undefined, rounding: undefined, vat: 100_000, grand_total: 1_100_000 }, [SEC('1. 장소', 1, 1_000_000)])
    expect(buildImportedBreakdown(noFee, [{ section: '1. 장소', bucket: 's1', confidence: 'high' }]).breakdown.s5).toBe(0)
  })

  it('모객 분할(rc·ld)과 custom 섹션은 그대로 기록된다', () => {
    const parsed = doc({ items_sum: 900_000, agency_fee: undefined, rounding: undefined, vat: 90_000, grand_total: 990_000 }, [
      SEC('1. 모객', 1, 500_000, [{ title: 'RSVP 콜', spec: '300명' }, { title: '쇼업 보장', spec: '리드젠' }]),
      SEC('2. 기념품', 2, 400_000),
    ])
    const { breakdown } = buildImportedBreakdown(parsed, [
      { section: '1. 모객', bucket: 'recruit', confidence: 'high' },
      { section: '2. 기념품', bucket: 'custom', confidence: 'low' },
    ])
    expect(breakdown.recruit).toBe(500_000)
    expect(breakdown.recruit_rsvp).toBe(500_000) // 항목에 금액이 없으면 소계 전부 rc(지어내지 않는다 §19.2)
    expect(breakdown.recruit_showup).toBe(0)
    expect(breakdown.custom_sections).toEqual([{ code: 'custom:2. 기념품', label: '2. 기념품', amount: 400_000 }])
  })
})

describe('DoD 106 ③④ mock 정산보드 — 가져온 견적의 대행료·버킷 합·rc 발주', () => {
  async function importA() {
    const provider = mockProvider()
    provider.switchUser('usr-pm')
    provider.setAppRole('sales')
    const buf = await syntheticQuoteA()
    const imported = await provider.importQuoteFile('가상_세부산출내역서.xlsx', buf)
    expect(imported.mapping.some((m) => m.bucket === 's5')).toBe(false) // 대행료는 총액 블록에만 있다(A형)
    const quote = await provider.confirmQuoteImport(imported.id, { mapping: imported.mapping })
    await provider.finalizeQuote(quote.id) // 위저드 ③ 정산 기준 = 확정 뒤 분배(mock은 확정 견적만 받는다)
    return { provider, imported, quote }
  }

  it('③ 확정 breakdown.s5 = 대행료 + 절사 · 정산보드 버킷 합 = 공급가 · rc 버킷은 발주 항목을 받는다', async () => {
    const { provider, imported, quote } = await importA()
    expect(quote.breakdown.s5).toBe(FEE_WITH_ROUNDING)
    expect(quote.total_amount).toBe(SUBTOTAL)

    const result = await provider.distributeQuoteImport(imported.id, { project_prefill: true, settlement_base: true })
    const projectId = result.project_id!
    const board = (await provider.getSettlementBoard(projectId))!
    const sum = board.buckets.reduce((s, b) => s + b.bucket.quote_amount, 0)
    expect(sum).toBe(SUBTOTAL)
    const s5 = board.buckets.find((b) => b.bucket.code === 's5')!.bucket
    expect(s5).toMatchObject({ quote_amount: FEE_WITH_ROUNDING, has_cost: false })
    // 검산: 마진 기준 계약액 − 실집행 = 최종 마진 (실집행 0 → 마진 = 계약액)
    expect(board.totals.identityOk).toBe(true)
    expect(board.totals.marginBase).toBe(SUBTOTAL)

    const rc = board.buckets.find((b) => b.bucket.code === 'rc')!.bucket
    expect(rc.has_cost).toBe(true)
    const item = await provider.createSettlementItem(projectId, rc.id, { title: 'RSVP 콜센터', ordered_amount: 1_000_000, actual_amount: null, status: 'ordered' })
    expect(item.ordered_amount).toBe(1_000_000)
    const after = (await provider.getSettlementBoard(projectId))!
    expect(after.buckets.find((b) => b.bucket.code === 'rc')!.ordered).toBe(1_000_000)
    // 원가 없는 버킷은 여전히 422
    await expect(
      provider.createSettlementItem(projectId, s5.id, { title: 'x', ordered_amount: 1, actual_amount: null, status: 'ordered' }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('④ 옛 임포트(breakdown에 대행료가 빠진 견적)도 기준 견적 갱신이 가져오기 기록에서 다시 계산한다 — 버킷 합 = 공급가', async () => {
    const { provider, imported, quote } = await importA()
    const result = await provider.distributeQuoteImport(imported.id, { project_prefill: true, settlement_base: true })
    const projectId = result.project_id!
    // 옛 규칙으로 확정된 견적을 흉내 낸다 — breakdown.s5 = 0 (버킷 합이 공급가보다 대행료만큼 작았던 운영 보드)
    const state = (provider as unknown as { state: { quotes: Quote[] } }).state
    const stored = state.quotes.find((q) => q.id === quote.id)!
    stored.breakdown = { ...stored.breakdown, s5: 0 }
    const s5Bucket = (await provider.getSettlementBoard(projectId))!.buckets.find((b) => b.bucket.code === 's5')!.bucket
    await provider.updateSettlementBucket(s5Bucket.id, { quote_amount: 0 })
    const before = (await provider.getSettlementBoard(projectId))!
    expect(before.buckets.reduce((s, b) => s + b.bucket.quote_amount, 0)).toBe(SUBTOTAL - FEE_WITH_ROUNDING)

    await provider.rebaseSettlementBoard(projectId, quote.id)
    const after = (await provider.getSettlementBoard(projectId))!
    expect(after.buckets.find((b) => b.bucket.code === 's5')!.bucket.quote_amount).toBe(FEE_WITH_ROUNDING)
    expect(after.buckets.reduce((s, b) => s + b.bucket.quote_amount, 0)).toBe(SUBTOTAL)
  })
})

describe('DoD 106 ⑤ 협력사 견적서 버킷 제안', () => {
  it('모객·RSVP 행 → rc(원가 버킷) · 리드젠 행은 제안 없음 · 원가 없는 s5는 제안 없음', () => {
    const all = quoteBucketSpec({ s1: 1, s2: 1, s3: 1, s4: 1, s5: 1, options: 1, attendee: 1 }, { rsvpPkg: 1, showup: 1 }).map(
      (r, i) => ({ ...r, id: `b-${i}`, board_id: 'board', source: 'quote', sort_order: i, created_at: '' }) as SettlementBucket,
    )
    expect(suggestBucket('모객', 'RSVP 콜센터', all)).toEqual({ bucket_code: 'rc', confidence: 'high' })
    expect(suggestBucket('리드젠', '쇼업 보장', all).bucket_code).toBeNull()
    expect(suggestBucket('기획료', 'PCO 기획료', all).bucket_code).toBeNull()
  })
})

describe('DoD 106 ⑥ 화면 — 주최형 손익 카드 · rc 원가 버킷 행', () => {
  it('hostProfit(순수): 철회 파트너 제외 · 지출 예산 = 버킷 합 · 손익 2종', () => {
    const p = hostProfit(
      [
        { contract_amount: 80_000_000, status: 'active' },
        { contract_amount: 40_000_000, status: 'withdrawn' },
        { contract_amount: 15_000_000, status: 'active' },
      ],
      [{ quote_amount: 60_000_000 }, { quote_amount: 5_000_000 }],
      { totalActual: 20_000_000 },
    )
    expect(p).toEqual({ partnerCount: 2, revenue: 95_000_000, budget: 65_000_000, actual: 20_000_000, profitPlanned: 30_000_000, profitActual: 75_000_000 })
  })

  it('주최형 행사의 정산보드에 주최형 손익 카드 — 수입 = 파트너 계약액 합 · 지출 예산 = 버킷 견적 합 · 손익 · 예산 기준 캡션', async () => {
    const provider = mockProvider()
    provider.switchUser('usr-pm')
    provider.setAppRole('sales')
    const buf = await syntheticQuoteA()
    const imported = await provider.importQuoteFile('가상_워킹버짓_지출.xlsx', buf)
    const quote = await provider.confirmQuoteImport(imported.id, { mapping: imported.mapping })
    await provider.finalizeQuote(quote.id)
    const result = await provider.distributeQuoteImport(imported.id, { link_project_id: PROJECT_ID_HOST, settlement_base: true })
    expect(result.project_id).toBe(PROJECT_ID_HOST)
    const partners = await provider.listPartners(PROJECT_ID_HOST)
    const revenue = partners.filter((p) => p.status !== 'withdrawn').reduce((s, p) => s + (p.contract_amount ?? 0), 0)
    expect(revenue).toBeGreaterThan(0)

    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/settlement')
    const card = await screen.findByTestId('host-profit')
    expect(within(card).getByTestId('host-profit-revenue').textContent).toBe(`${revenue.toLocaleString('ko-KR')}원`)
    expect(within(card).getByTestId('host-profit-budget').textContent).toBe(`${SUBTOTAL.toLocaleString('ko-KR')}원`)
    expect(within(card).getByTestId('host-profit-actual').textContent).toBe('0원')
    expect(within(card).getByTestId('host-profit-result').textContent).toBe(`${revenue.toLocaleString('ko-KR')}원`)
    expect(within(card).getByTestId('host-profit-note').textContent).toContain(`예산 기준 손익 ${(revenue - SUBTOTAL).toLocaleString('ko-KR')}원`)
    expect(within(card).getByTestId('host-profit-basis').textContent).toBe(`파트너 ${partners.length}곳 계약액 기준 · 내부 전용`)
    // KPI 4장은 그대로(마진 식 무접촉)
    expect(screen.getByTestId('settlement-kpis')).toBeTruthy()
  })

  it('대행형(샘플 행사)에는 카드가 없고 rc 행이 원가 버킷 표(그룹행 위)에 있다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settlement')
    await screen.findByTestId('settlement-kpis')
    expect(screen.queryByTestId('host-profit')).toBeNull()
    const rc = screen.getByTestId('bucket-row-rc')
    expect(within(rc).getByText('RSVP 운영비')).toBeTruthy()
    // 원가 없는 항목 그룹행보다 앞에 있다(문서 순서) — 펼침 단추가 있다(원가 버킷)
    const group = screen.getByTestId('no-cost-group')
    expect(rc.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(rc).getByRole('button', { name: 'RSVP 운영비' }).getAttribute('aria-expanded')).toBe('false')
  })
})
