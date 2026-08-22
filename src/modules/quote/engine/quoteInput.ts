// QuoteInput(quotes.input jsonb — §4-18) ↔ 엔진(CalcConfig) 변환 글루.
// 엔진(calcEstimate)은 무변경 — 변환은 여기서만 수행한다. breakdown·total_amount 산출의 단일 출처:
// provider(mock·supabase)는 저장 시 반드시 computeQuoteOutputs로 재계산해 저장한다(§8 — 클라이언트 값 불신).
import type { QuoteAdjustment, QuoteBreakdown, QuoteInput } from '../../../types/entities'
import {
  applyAdjustments,
  calcEstimate,
  type CalcConfig,
  type EstimateResult,
} from './calcEstimate'
import { effectiveAdjust } from './quoteMode'
import { clampVenueIndex, selectedVenueRental, type VenueEntry } from './venueOptions'

/** 후보 표기명 — §16: 홀이 있으면 `이름 · 홀` */
export function venueDisplayName(v: { name: string; hall?: string | null }): string {
  return v.hall ? `${v.name} · ${v.hall}` : v.name
}

/** QuoteInput → 엔진 CalcConfig (+ Excel용 venues/venueSelected) */
export function toEngineConfig(input: QuoteInput): CalcConfig & { venues: VenueEntry[]; venueSelected: number } {
  const venues: VenueEntry[] = (input.venues ?? []).map((v) => ({
    name: venueDisplayName(v),
    date: v.date ?? '',
    rental: Number(v.rental) || 0,
  }))
  const idx = clampVenueIndex(venues, input.selected_venue?.index ?? 0)
  return {
    projectTitle: input.event_name,
    target: input.headcount,
    guarantee: input.guarantee,
    venues,
    venueSelected: idx,
    venueRental: venues.length > 0 ? selectedVenueRental(venues, idx) : null,
    venueName: venues[idx]?.name || '',
    displayType: input.display_type,
    options: { ...(input.options ?? {}) },
    boothCount: input.booth_count ?? 0,
    boothPremiumCount: input.booth_premium_count ?? 0,
    boothUnitPrice: input.booth_unit_price ?? '',
    boothPremiumUnitPrice: input.booth_premium_unit_price ?? '',
    souvenirPrice: input.souvenir_price ?? '',
    souvenirQty: input.souvenir_qty ?? '',
    genAttendees: input.gen_attendees ?? 0,
    manager: input.manager ?? '',
  }
}

/** adjustments[] → 엔진 applyAdjustments/exportEstimate 델타 레코드 (+memo) */
export function adjustmentDeltas(
  adjustments: QuoteAdjustment[] | null | undefined,
): Record<string, number> & { memo?: Record<string, string> } {
  const out: Record<string, number> & { memo?: Record<string, string> } = {}
  const memo: Record<string, string> = {}
  for (const a of adjustments ?? []) {
    const n = Math.round(Number(a.delta) || 0)
    if (n === 0) continue
    out[a.key] = (out[a.key] ?? 0) + n
    if (a.memo) memo[a.key] = a.memo
  }
  if (Object.keys(memo).length > 0) out.memo = memo
  return out
}

export interface QuoteOutputs {
  /** 조정 반영 최종 엔진 결과 */
  result: EstimateResult
  breakdown: QuoteBreakdown
  /** = breakdown.subtotal (VAT 별도) */
  total_amount: number
}

/** 입력 스냅샷 → 산출 스냅샷 — quotes.breakdown·total_amount의 정본 산식 */
export function computeQuoteOutputs(input: QuoteInput): QuoteOutputs {
  const cfg = toEngineConfig(input)
  const base = calcEstimate(input.include_leads ? cfg : { ...cfg, guarantee: 0 })
  const deltas = effectiveAdjust(
    adjustmentDeltas(input.adjustments) as Record<string, number>,
    input.include_leads,
  )
  const p = applyAdjustments(base, deltas)
  const vat = Math.round(p.pk * 0.1)
  const breakdown: QuoteBreakdown = {
    s1: p.s1,
    s2: p.s2,
    s3: p.s3,
    s4: p.s4,
    s5: p.s5,
    options: p.ot,
    recruit: input.include_leads ? p.leadPkg : 0,
    attendee: p.genManage,
    subtotal: p.pk,
    vat,
    total: p.pk + vat,
  }
  return { result: p, breakdown, total_amount: p.pk }
}
