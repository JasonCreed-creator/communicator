// 판매형 견적(매출) 계산 — v2.6 §25.1 권한 ②. **주최형(DMS·전시회) 전용**이다.
//
// 대행형 컨퍼런스의 비용형 견적(calcEstimate.ts)과는 방향이 반대다: 저쪽은 우리가 쓸 돈을 쌓아
// 발주처에 청구할 금액을 만들고, 이쪽은 파트너에게 팔 등급을 정의해 들어올 돈을 만든다.
// 그래서 **파일을 분리했다** — calcEstimate.ts·kpiRules.ts·quoteMode.ts는 이 증분에서 손대지
// 않는다(§25.8 · 골든 벡터 0원 일치 보호).
//
// MVP 범위: 등급·정원·단가 정의 + Σ(정원 × 단가). 할인·묶음·부가세는 아직 모델에 없다 —
// 필요해지면 설계서 개정과 함께 넣는다(추측 구현 금지).
//
// ★ 금액 비노출: 여기의 어떤 결과도 포털(`/p/*`)·발주처(`/c/*`)·랜딩·운영계획서로 나가지
//   않는다(§25.8·§21.2 R-H3). 호출부는 내부 화면(판매 플래너)뿐이다.

/** 계산에 필요한 등급 최소 형태 — PartnerTier에서 필요한 필드만 뽑아 쓴다(엔티티 의존 없음) */
export interface RevenueTier {
  id: string
  code: string
  name: string
  /** 정원 — null=무제한. 무제한 등급은 목표액 산정에서 제외한다(상한이 없어 Σ가 발산한다) */
  capacity: number | null
  /** 판매 단가 — null=미정 */
  price: number | null
}

export interface RevenueTierLine {
  tier_id: string
  code: string
  name: string
  capacity: number | null
  price: number | null
  /** 판매 완료 수(파트너 배정 수) */
  sold: number
  /** capacity × price — capacity·price 중 하나라도 없으면 null(합계에서 제외) */
  target_amount: number | null
  /** sold × price — price가 없으면 null */
  sold_amount: number | null
  /** sold ÷ capacity (0~1). capacity가 null이면 null(진행률을 정의할 수 없다) */
  fill_rate: number | null
  /** 정원 초과 판매 — 실수는 막지 않고 드러낸다(계약이 이미 성립했을 수 있다) */
  oversold: boolean
}

export interface RevenuePlan {
  lines: RevenueTierLine[]
  /** Σ target_amount — 전 등급 만석 기준 매출 */
  target_total: number
  /** Σ sold_amount — 현재 확정된 매출 */
  sold_total: number
  /** sold_total ÷ target_total (0~1). target_total=0이면 null */
  achievement: number | null
  /** 단가 미정이라 목표 합계에서 빠진 등급 코드 — 화면이 "왜 합계가 낮은지" 설명할 수 있게 한다 */
  unpriced_codes: string[]
  /** 정원 무제한이라 목표 합계에서 빠진 등급 코드 */
  uncapped_codes: string[]
}

/**
 * 등급별 판매 계획을 계산한다.
 *
 * @param tiers 등급 정의
 * @param soldByTierId 등급별 판매 완료 수(보통 활성 파트너 수). 없는 키는 0으로 본다
 */
export function calcRevenue(
  tiers: readonly RevenueTier[],
  soldByTierId: Readonly<Record<string, number>> = {},
): RevenuePlan {
  const lines: RevenueTierLine[] = tiers.map((t) => {
    const sold = soldByTierId[t.id] ?? 0
    const priced = t.price != null && t.price >= 0
    const capped = t.capacity != null && t.capacity >= 0
    return {
      tier_id: t.id,
      code: t.code,
      name: t.name,
      capacity: t.capacity,
      price: t.price,
      sold,
      target_amount: priced && capped ? t.capacity! * t.price! : null,
      sold_amount: priced ? sold * t.price! : null,
      fill_rate: capped ? (t.capacity! === 0 ? null : sold / t.capacity!) : null,
      oversold: capped && sold > t.capacity!,
    }
  })

  const target_total = lines.reduce((sum, l) => sum + (l.target_amount ?? 0), 0)
  const sold_total = lines.reduce((sum, l) => sum + (l.sold_amount ?? 0), 0)

  return {
    lines,
    target_total,
    sold_total,
    achievement: target_total > 0 ? sold_total / target_total : null,
    unpriced_codes: lines.filter((l) => l.price == null).map((l) => l.code),
    uncapped_codes: lines.filter((l) => l.capacity == null).map((l) => l.code),
  }
}

/** 등급별 판매 수를 파트너 목록에서 센다 — 철회(withdrawn) 파트너는 판매로 치지 않는다 */
export function countSoldByTier(
  partners: readonly { tier_id: string | null; status: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of partners) {
    if (p.status !== 'active' || !p.tier_id) continue
    counts[p.tier_id] = (counts[p.tier_id] ?? 0) + 1
  }
  return counts
}

/** 세션 슬롯 수요 — 등급이 파는 발표 세션의 총수(트랙 편성이 감당해야 할 최소 세션 수) */
export function totalSessionSlots(
  tiers: readonly { id: string; session_slots: number }[],
  soldByTierId: Readonly<Record<string, number>> = {},
): number {
  return tiers.reduce((sum, t) => sum + t.session_slots * (soldByTierId[t.id] ?? 0), 0)
}
