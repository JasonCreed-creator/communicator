// 정산 집계 단위 테스트 — 설계서 §19.1 마진 식을 코드보다 먼저 잠근다.
//
// 핵심은 실물 검산 2건이다. 이 두 케이스가 깨지면 마진 식이 변형된 것이므로
// 어떤 사유로도 머지하지 않는다(§4-24 R-S10 · CLAUDE.md §4 Phase 3.14 금지).
import { describe, expect, it } from 'vitest'
import {
  bucketActual,
  bucketMarkup,
  bucketMarkupRate,
  computeTotals,
  isOverBudget,
  toVatExcluded,
} from '../lib/settlement'
import type { SettlementBucket, SettlementItem } from '../types/entities'

let seq = 0
function bucket(
  code: string,
  quote_amount: number,
  opts: Partial<Pick<SettlementBucket, 'has_cost' | 'is_margin_base'>> = {},
): SettlementBucket {
  return {
    id: `bkt-${code}-${++seq}`,
    board_id: 'brd-1',
    code,
    label: code,
    quote_amount,
    has_cost: opts.has_cost ?? true,
    is_margin_base: opts.is_margin_base ?? true,
    source: 'quote',
    sort_order: seq,
    created_at: '2026-08-23T00:00:00.000Z',
  }
}

function item(
  bucket_id: string,
  actual: number | null,
  over: Partial<SettlementItem> = {},
): SettlementItem {
  return {
    id: `itm-${++seq}`,
    board_id: 'brd-1',
    bucket_id,
    title: '항목',
    spec: null,
    vendor_id: null,
    assignee_id: null,
    ordered_amount: actual,
    actual_amount: actual,
    input_amount_raw: null,
    vat_included_input: false,
    status: 'settled',
    evidence: null,
    import_id: null,
    note: null,
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  }
}

describe('정산 집계 (a) 실물 검산 — §19.1', () => {
  // 실물 내부정산 2건. 고객사명·계약 상세는 담지 않고 금액 구조만 재현한다.
  // 항목 마크업 + PCO 기획료 + RSVP 운영비 = 파일의 마진, 리드젠은 제외.
  it('84.0M 규모 — 계산값이 파일의 마진 27,943,409와 일치한다', () => {
    // 원가 있는 버킷: 견적 − 실집행 = 13,899,909
    const cost = bucket('s1', 60_000_000)
    const pco = bucket('s5', 10_043_500, { has_cost: false })
    const rsvp = bucket('rc', 4_000_000, { has_cost: false })
    const lead = bucket('ld', 21_000_000, { has_cost: false, is_margin_base: false })
    const items = [item(cost.id, 46_100_091)]

    const t = computeTotals([cost, pco, rsvp, lead], items)
    expect(bucketMarkup(cost, items)).toBe(13_899_909)
    expect(t.finalMargin).toBe(27_943_409)
    expect(t.identityOk).toBe(true)
  })

  it('16.6M 규모 — 계산값이 파일의 마진 9,415,136과 일치한다', () => {
    const cost = bucket('s1', 14_000_000)
    const pco = bucket('s5', 1_830_000, { has_cost: false })
    const rsvp = bucket('rc', 760_000, { has_cost: false })
    const items = [item(cost.id, 7_174_864)]

    const t = computeTotals([cost, pco, rsvp], items)
    expect(bucketMarkup(cost, items)).toBe(6_825_136)
    expect(t.finalMargin).toBe(9_415_136)
    expect(t.identityOk).toBe(true)
  })
})

describe('정산 집계 (b) 버킷 플래그', () => {
  it('원가 없는 버킷은 견적액 전체가 마크업이고 실집행은 0이다', () => {
    const b = bucket('s5', 5_000_000, { has_cost: false })
    // 입력이 막혀 있지만, 설령 항목이 붙어도 집계에 들어가지 않는다
    const items = [item(b.id, 999_999)]
    expect(bucketActual(b, items)).toBe(0)
    expect(bucketMarkup(b, items)).toBe(5_000_000)
  })

  it('리드젠은 마진 기준 계약액에서 빠지되 목록에는 남는다', () => {
    const cost = bucket('s1', 10_000_000)
    const lead = bucket('ld', 7_000_000, { has_cost: false, is_margin_base: false })
    const items = [item(cost.id, 6_000_000)]

    const t = computeTotals([cost, lead], items)
    expect(t.marginBase).toBe(10_000_000) // 리드젠 7,000,000 제외
    expect(t.finalMargin).toBe(4_000_000)
    expect(t.excluded.map((e) => e.code)).toEqual(['ld'])
    expect(t.excluded[0].amount).toBe(7_000_000)
  })

  it('마진 구성 3분할 — 변동(마크업)과 고정(원가 없는 버킷)이 갈린다', () => {
    const cost = bucket('s1', 10_000_000)
    const pco = bucket('s5', 3_000_000, { has_cost: false })
    const rsvp = bucket('rc', 1_000_000, { has_cost: false })
    const items = [item(cost.id, 8_000_000)]

    const t = computeTotals([cost, pco, rsvp], items)
    expect(t.variableMarkup).toBe(2_000_000)
    expect(t.fixedByBucket.map((f) => [f.code, f.amount])).toEqual([
      ['s5', 3_000_000],
      ['rc', 1_000_000],
    ])
    expect(t.variableMarkup + t.fixedByBucket.reduce((s, f) => s + f.amount, 0)).toBe(t.finalMargin)
  })
})

describe('정산 집계 (c) 취소·초과·0원', () => {
  it('취소 항목은 집계에서 빠진다', () => {
    const b = bucket('s1', 10_000_000)
    const items = [item(b.id, 3_000_000), item(b.id, 5_000_000, { status: 'cancelled' })]
    expect(bucketActual(b, items)).toBe(3_000_000)
  })

  it('견적 초과는 막지 않고 표시만 한다 — 마크업이 음수로 잡힌다', () => {
    const b = bucket('s1', 5_000_000)
    const items = [item(b.id, 6_500_000)]
    expect(isOverBudget(b, items)).toBe(true)
    expect(bucketMarkup(b, items)).toBe(-1_500_000)
    expect(computeTotals([b], items).overBudgetCount).toBe(1)
  })

  it('견적 0원 custom 버킷은 마크업률이 null이다 (0으로 나누지 않는다)', () => {
    const b = bucket('custom-1', 0)
    const items = [item(b.id, 800_000)]
    expect(bucketMarkupRate(b, items)).toBeNull()
    expect(bucketMarkup(b, items)).toBe(-800_000)
  })

  it('빈 보드에서도 마진율이 null이고 항등식이 성립한다', () => {
    const t = computeTotals([], [])
    expect(t.marginRate).toBeNull()
    expect(t.identityOk).toBe(true)
  })
})

describe('정산 집계 (d) 부가세 분리 — §19.4', () => {
  it('포함으로 받은 값은 round(v/1.1)로 별도 저장된다', () => {
    expect(toVatExcluded(1_320_000, true)).toBe(1_200_000)
    expect(toVatExcluded(23_320_000, true)).toBe(21_200_000)
  })

  it('별도로 받은 값은 그대로 둔다', () => {
    expect(toVatExcluded(1_200_000, false)).toBe(1_200_000)
  })

  it('원 단위로 반올림한다', () => {
    // 1,000,000 / 1.1 = 909,090.909…
    expect(toVatExcluded(1_000_000, true)).toBe(909_091)
  })
})
