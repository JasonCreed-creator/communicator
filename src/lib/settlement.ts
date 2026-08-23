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
    //
    // 실제로 항등식이 어긋나는 조건은 하나뿐이다 — **has_cost=true + is_margin_base=false**
    // 버킷에 실비가 들어간 때. 그 실비는 totalActual에는 더해지지만 finalMargin에는 반영되지
    // 않는다. (has_cost=false 버킷은 bucketActual이 항상 0이라 애초에 항등식을 깨뜨릴 수 없다.)
    //
    // 반대로 **항등식이 구조적으로 못 잡는** 조작도 하나 있다 — 금액이 든 버킷의 has_cost를
    // 끄는 것. totalActual과 finalMargin이 같은 크기로 함께 줄어 상쇄되므로 여기서는 조용히
    // 통과한다. 그건 이 식으로 잡을 수 없고, `updateSettlementBucket`이 409로 막는다.
    // **막는 곳을 옮기려고 이 식을 고치지 말 것** — 마진 식 변경은 금지 항목이다(§19.1 · R-S10).
    identityOk: marginBase - totalActual === finalMargin,
  }
}

/** 부가세 포함으로 받은 값을 별도로 분리한다(§19.4). 원 단위 반올림 */
export function toVatExcluded(amount: number, vatIncluded: boolean): number {
  return vatIncluded ? Math.round(amount / 1.1) : amount
}

// ── 견적 → 버킷 스냅숏 매핑 (§19.2) ──────────────────────────────────
//
// `recruit`를 rc(RSVP 운영비)·ld(리드젠)로 쪼개는 것이 유일한 비자명 매핑이며,
// 값은 견적 input에서 재유도하지 않고 **엔진 산출값(rsvpPkg·showup)을 그대로** 쓴다.
// provider(스냅숏)·픽스처(시드)·화면(기준 갱신 차이 미리보기)이 같은 표를 봐야 하므로
// 정의는 여기 한 곳뿐이다.
export interface BucketSpecRow {
  code: string
  label: string
  quote_amount: number
  has_cost: boolean
  is_margin_base: boolean
}

export function quoteBucketSpec(
  breakdown: { s1: number; s2: number; s3: number; s4: number; s5: number; options: number; attendee: number },
  engine: { rsvpPkg: number; showup: number },
): BucketSpecRow[] {
  return [
    { code: 's1', label: '베뉴 사용료', quote_amount: breakdown.s1, has_cost: true, is_margin_base: true },
    { code: 's2', label: '시스템 구축', quote_amount: breakdown.s2, has_cost: true, is_margin_base: true },
    { code: 's3', label: '디자인·브랜딩', quote_amount: breakdown.s3, has_cost: true, is_margin_base: true },
    { code: 's4', label: '운영·등록·보험', quote_amount: breakdown.s4, has_cost: true, is_margin_base: true },
    { code: 'ot', label: '추가옵션', quote_amount: breakdown.options, has_cost: true, is_margin_base: true },
    { code: 'at', label: '참관객 관리', quote_amount: breakdown.attendee, has_cost: true, is_margin_base: true },
    { code: 's5', label: 'PCO 기획료', quote_amount: breakdown.s5, has_cost: false, is_margin_base: true },
    { code: 'rc', label: 'RSVP 운영비', quote_amount: engine.rsvpPkg, has_cost: false, is_margin_base: true },
    // 리드젠(쇼업 보장)은 외부 매체비 성격이라 마진 기준 계약액에서 뺀다(§19.1)
    { code: 'ld', label: '리드젠(쇼업 보장)', quote_amount: engine.showup, has_cost: false, is_margin_base: false },
  ]
}
