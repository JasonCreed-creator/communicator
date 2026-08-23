// ── 정산 집계 정본 (설계서 v2.2 §19.1) ───────────────────────────────
//
// 마진 식은 **실물 내부정산 2건에서 원 단위 일치를 검산한 값**이다. 임의 변형 금지
// (CLAUDE.md §4 Phase 3.14 금지 항목 · 설계서 §4-24 R-S10).
//
//   항목 마크업(bucket) = quote_amount − Σ actual_amount   … has_cost=true 버킷만
//   최종 마진           = Σ 항목 마크업                     … is_margin_base=true 버킷만
//                         (has_cost=false 버킷은 마크업 = quote_amount 전액)
//   마진 기준 계약액     = Σ quote_amount                   … is_margin_base=true 버킷 전체
//   마진율              = 최종 마진 ÷ 마진 기준 계약액
//
// 항등식: `마진 기준 계약액 − Σ실집행 = 최종 마진`. 어긋나면 버킷 플래그가 잘못된 것이므로
// 화면 상단에 경고를 띄운다(§19.1).
//
// 순수 함수만 둔다 — 화면·provider와 분리해 단위 테스트로 먼저 잠근다.
import type { SettlementBucket, SettlementItem } from '../types/entities'

/** 집계에서 제외 — 취소 항목은 보존하되 숫자에 넣지 않는다(§19.3) */
export function isCounted(item: SettlementItem): boolean {
  return item.status !== 'cancelled'
}

/** 버킷의 실집행 합 — has_cost=false면 항상 0 (입력 자체가 막혀 있다) */
export function bucketActual(bucket: SettlementBucket, items: SettlementItem[]): number {
  if (!bucket.has_cost) return 0
  return items
    .filter((i) => i.bucket_id === bucket.id && isCounted(i))
    .reduce((sum, i) => sum + (i.actual_amount ?? 0), 0)
}

/** 버킷의 발주 합 — 표시용. 마진 식에는 쓰지 않는다(실비만 마진에 반영) */
export function bucketOrdered(bucket: SettlementBucket, items: SettlementItem[]): number {
  if (!bucket.has_cost) return 0
  return items
    .filter((i) => i.bucket_id === bucket.id && isCounted(i))
    .reduce((sum, i) => sum + (i.ordered_amount ?? 0), 0)
}

/**
 * 항목 마크업. `has_cost=false` 버킷(PCO 기획료·RSVP 운영비·리드젠)은 원가가 없으므로
 * 견적액 전체가 마크업이다 — 실물 시트의 실집행 합계 수식이 그 섹션들을 아예 더하지 않는다.
 */
export function bucketMarkup(bucket: SettlementBucket, items: SettlementItem[]): number {
  return bucket.quote_amount - bucketActual(bucket, items)
}

/** 마크업률 — 견적액이 0이면(신규 custom 버킷) null. 0으로 나누지 않는다 */
export function bucketMarkupRate(bucket: SettlementBucket, items: SettlementItem[]): number | null {
  if (bucket.quote_amount === 0) return null
  return bucketMarkup(bucket, items) / bucket.quote_amount
}

/** 견적 초과 — 실집행이 견적을 넘었다. 막지 않고 알리기만 한다(R-S8) */
export function isOverBudget(bucket: SettlementBucket, items: SettlementItem[]): boolean {
  return bucket.has_cost && bucketActual(bucket, items) > bucket.quote_amount
}

export interface SettlementTotals {
  /** is_margin_base 버킷의 견적 합 */
  marginBase: number
  /** has_cost 버킷의 실집행 합 */
  totalActual: number
  /** has_cost 버킷의 발주 합 (표시용) */
  totalOrdered: number
  /** = Σ bucketMarkup, is_margin_base 버킷만 */
  finalMargin: number
  /** finalMargin ÷ marginBase. marginBase가 0이면 null */
  marginRate: number | null
  /** 마진 구성 3분할 — 변동(항목 마크업) / 고정(원가 없는 버킷의 견적액) */
  variableMarkup: number
  fixedByBucket: { code: string; label: string; amount: number }[]
  /** 마진 기준에서 빠진 버킷(리드젠) — 화면에 회색으로 남긴다 */
  excluded: { code: string; label: string; amount: number }[]
  overBudgetCount: number
  /** marginBase − totalActual === finalMargin */
  identityOk: boolean
}

export function computeTotals(
  buckets: SettlementBucket[],
  items: SettlementItem[],
): SettlementTotals {
  const inBase = buckets.filter((b) => b.is_margin_base)

  const marginBase = inBase.reduce((s, b) => s + b.quote_amount, 0)
  const totalActual = buckets.reduce((s, b) => s + bucketActual(b, items), 0)
  const totalOrdered = buckets.reduce((s, b) => s + bucketOrdered(b, items), 0)
  const finalMargin = inBase.reduce((s, b) => s + bucketMarkup(b, items), 0)

  const variableMarkup = inBase
    .filter((b) => b.has_cost)
    .reduce((s, b) => s + bucketMarkup(b, items), 0)
  const fixedByBucket = inBase
    .filter((b) => !b.has_cost)
    .map((b) => ({ code: b.code, label: b.label, amount: b.quote_amount }))
  const excluded = buckets
    .filter((b) => !b.is_margin_base)
    .map((b) => ({ code: b.code, label: b.label, amount: b.quote_amount }))

  return {
    marginBase,
    totalActual,
    totalOrdered,
    finalMargin,
    marginRate: marginBase === 0 ? null : finalMargin / marginBase,
    variableMarkup,
    fixedByBucket,
    excluded,
    overBudgetCount: buckets.filter((b) => isOverBudget(b, items)).length,
    // 리드젠은 마진 기준에서 빠지지만 원가도 없으므로 항등식은 그대로 성립한다.
    // 어긋나는 경우는 has_cost=false인데 is_margin_base=false가 아닌 버킷에 실비가
    // 들어간 때뿐이고, 그건 R-S4가 막는다.
    identityOk: marginBase - totalActual === finalMargin,
  }
}

/** 부가세 포함으로 받은 값을 별도로 분리한다(§19.4). 원 단위 반올림 */
export function toVatExcluded(amount: number, vatIncluded: boolean): number {
  return vatIncluded ? Math.round(amount / 1.1) : amount
}
