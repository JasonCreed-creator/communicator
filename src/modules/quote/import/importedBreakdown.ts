// v2.22.2(Phase 6.18) — 가져온 견적의 확정 매핑 → 견적 breakdown(engine-shape). provider 2종(mock·supabase)이 **같은 함수**를 쓴다 —
// 확정(confirmQuoteImport)과 정산 스냅숏(breakdownForSnapshot — 기준 견적 갱신)이 같은 규칙으로 계산해야 버킷 합 = 공급가가 유지된다.
//   · engine-shape 8키(s1~s5·options·recruit·attendee) + custom_sections(§22.4 — 'custom'은 섹션별로 분리 보존)
//   · 부가세 별도 총액은 grand_total − vat 우선, vat가 없으면 §19.4와 같은 round(v/1.1) 역산, 둘 다 없으면 items_sum(예산 워크북 P형) → 매핑 합
//   · (v2.22.2) A형처럼 대행료·기획료가 항목 표 밖 총액 블록에만 있으면(섹션 매핑에 s5가 없다) 그 금액(+절사)을 s5에 —
//     실사용 2026-09-28: 세부 산출내역서의 25% 대행료가 breakdown에 없어 정산보드 버킷 합이 공급가보다 대행료만큼 작았다(§19.2)
//   · (v2.20.2) 모객 섹션은 항목 표기로 rc·ld로 나눠 기록(recruitSplit)
import { toVatExcluded } from '../../../lib/settlement'
import type { QuoteBreakdown } from '../../../types/entities'
import { splitRecruit } from './recruitSplit'
import type { ParsedQuoteDoc, SectionMapping } from './types'

const STANDARD = ['s1', 's2', 's3', 's4', 's5', 'options', 'recruit', 'attendee'] as const
type StandardKey = (typeof STANDARD)[number]

export function buildImportedBreakdown(
  parsed: ParsedQuoteDoc,
  mapping: readonly SectionMapping[],
): { breakdown: QuoteBreakdown; total_amount: number } {
  const sums: Record<StandardKey, number> = { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, options: 0, recruit: 0, attendee: 0 }
  const customByCode = new Map<string, { code: string; label: string; amount: number }>()

  for (const row of mapping) {
    const section = parsed.sections.find((s) => s.name === row.section)
    if (!section) continue
    const amount = section.subtotal ?? section.items.reduce((s, it) => s + (it.amount || 0), 0)
    if ((STANDARD as readonly string[]).includes(row.bucket)) {
      sums[row.bucket as StandardKey] += amount
    } else {
      // 'custom' 자체는 여러 섹션이 공유하는 잠정 배정일 수 있어 섹션별로 분리 보존한다
      const code = row.bucket === 'custom' ? `custom:${section.name}` : row.bucket
      const prev = customByCode.get(code)
      customByCode.set(code, { code, label: section.name, amount: (prev?.amount ?? 0) + amount })
    }
  }

  // v2.22.2 — 총액 블록의 대행료·기획료(+절사)는 s5. 기획료가 섹션 안에 있는 서식(B·C·R형)은 매핑에 s5가 있어 더하지 않는다(이중 계상 방지)
  const totals = parsed.totals
  const feeOutsideItems = totals.agency_fee !== undefined && !mapping.some((m) => m.bucket === 's5')
  if (feeOutsideItems) sums.s5 += (totals.agency_fee ?? 0) + (totals.rounding ?? 0)

  const mappedTotal =
    Object.values(sums).reduce((s, v) => s + v, 0) + [...customByCode.values()].reduce((s, v) => s + v.amount, 0)
  const subtotal =
    totals.grand_total != null
      ? totals.vat != null
        ? totals.grand_total - totals.vat
        : toVatExcluded(totals.grand_total, true)
      : (totals.items_sum ?? mappedTotal)
  const vat = Math.round(subtotal * 0.1)

  const breakdown: QuoteBreakdown = {
    s1: sums.s1,
    s2: sums.s2,
    s3: sums.s3,
    s4: sums.s4,
    s5: sums.s5,
    options: sums.options,
    recruit: sums.recruit,
    attendee: sums.attendee,
    subtotal,
    vat,
    total: subtotal + vat,
    custom_sections: [...customByCode.values()],
  }
  // v2.20.2 — 모객 섹션을 rc·ld로 나눠 기록(정산보드 스냅숏이 엔진 값 대신 쓴다)
  const split = splitRecruit(parsed, mapping)
  if (split) {
    breakdown.recruit_rsvp = split.rsvp
    breakdown.recruit_showup = split.showup
  }
  return { breakdown, total_amount: subtotal }
}
