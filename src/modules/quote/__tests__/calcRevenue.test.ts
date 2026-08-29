// v2.6 §25.1 권한 ② — 판매형 견적 엔진. 비용형(calcEstimate)과 완전히 분리된 파일이라
// 골든 벡터에 영향을 주지 않는다는 것이 이 테스트의 전제이자 계약이다.
import { describe, expect, it } from 'vitest'
import { calcRevenue, countSoldByTier, totalSessionSlots, type RevenueTier } from '../engine/calcRevenue'

const TIERS: RevenueTier[] = [
  { id: 't1', code: 'diamond', name: 'DIAMOND', capacity: 1, price: 80_000_000 },
  { id: 't2', code: 'gold', name: 'GOLD', capacity: 3, price: 40_000_000 },
  { id: 't3', code: 'silver', name: 'SILVER', capacity: null, price: 15_000_000 },
]

describe('calcRevenue (v2.6 §25)', () => {
  it('목표액은 Σ(정원 × 단가)이고, 정원 무제한 등급은 합계에서 빠진다', () => {
    const plan = calcRevenue(TIERS)
    // 1×80,000,000 + 3×40,000,000 = 200,000,000 (실버는 상한이 없어 발산하므로 제외)
    expect(plan.target_total).toBe(200_000_000)
    expect(plan.uncapped_codes).toEqual(['silver'])
    expect(plan.lines.find((l) => l.code === 'silver')?.target_amount).toBeNull()
  })

  it('판매액은 Σ(판매수 × 단가) — 정원 없는 등급도 실판매는 그대로 잡힌다', () => {
    const plan = calcRevenue(TIERS, { t1: 1, t2: 1, t3: 3 })
    expect(plan.sold_total).toBe(80_000_000 + 40_000_000 + 45_000_000)
    expect(plan.achievement).toBeCloseTo(165_000_000 / 200_000_000, 10)
  })

  it('단가 미정 등급은 합계에서 빠지고 코드로 드러난다 — 합계가 낮은 이유를 화면이 설명할 수 있게', () => {
    const plan = calcRevenue([{ id: 't9', code: 'bronze', name: 'BRONZE', capacity: 5, price: null }])
    expect(plan.target_total).toBe(0)
    expect(plan.unpriced_codes).toEqual(['bronze'])
    expect(plan.achievement).toBeNull()
  })

  it('정원 초과 판매는 막지 않고 표시한다 — 계약이 이미 성립했을 수 있다', () => {
    const plan = calcRevenue(TIERS, { t1: 2 })
    const line = plan.lines.find((l) => l.code === 'diamond')!
    expect(line.oversold).toBe(true)
    expect(line.fill_rate).toBe(2)
    expect(line.sold_amount).toBe(160_000_000)
  })

  it('철회한 파트너는 판매로 세지 않는다', () => {
    const counts = countSoldByTier([
      { tier_id: 't1', status: 'active' },
      { tier_id: 't2', status: 'active' },
      { tier_id: 't2', status: 'withdrawn' },
      { tier_id: null, status: 'active' },
    ])
    expect(counts).toEqual({ t1: 1, t2: 1 })
  })

  it('세션 슬롯 수요 = Σ(등급 세션수 × 판매수) — 트랙 편성이 감당해야 할 최소 세션 수', () => {
    const tiers = [
      { id: 't1', session_slots: 2 },
      { id: 't2', session_slots: 1 },
      { id: 't3', session_slots: 0 },
    ]
    expect(totalSessionSlots(tiers, { t1: 1, t2: 3, t3: 5 })).toBe(5)
    expect(totalSessionSlots(tiers)).toBe(0)
  })

  it('빈 등급 목록은 0을 낸다 — 판매 플래너 첫 진입(상품 미정의) 상태', () => {
    const plan = calcRevenue([])
    expect(plan).toMatchObject({ target_total: 0, sold_total: 0, achievement: null })
    expect(plan.lines).toHaveLength(0)
  })
})
