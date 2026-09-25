// 견적 옵션 금액 읽기 — 옵션 단계의 묶음 합계('2개 고름 · 400만원')·옆 요약의 '고른 옵션'·'옵션으로 +n'.
// 디자인지시서 v1.4 §7-2.10(PR-6).
//
// ⚠ 단가를 여기서 다시 적지 않는다 — 엔진(calcEstimate)이 단일 출처다(DoD 21·22). 옵션 집합만 바꿔
//   엔진을 여러 번 돌리고 그 차이로 옵션별 금액을 읽는다. 엔진 파일은 import만 한다.
import { calcPkExcludingOptions } from '../../modules/quote/engine/calcEstimate'
import { computeQuoteOutputs, type QuoteOutputs } from '../../modules/quote/engine/quoteInput'
import type { QuoteInput } from '../../types/entities'
import { OPT_CATALOG } from './quoteFormState'

export interface PickedOption {
  /** 카탈로그 id — 카탈로그 밖의 옛 키가 남긴 금액은 '_other' 하나로 모은다 */
  id: string
  amount: number
}

export interface OptionAmounts {
  /** 고른 옵션(카탈로그 순) — 합 = 엔진 옵션 합계(부스·조정 제외) */
  picked: PickedOption[]
  /** 부스 두 종의 금액(수량 × 단가 — 단가 덮어쓰기 반영) */
  boothStd: number
  boothPremium: number
  /** 옵션이 없을 때의 합계(VAT 별도)와 PCO 기획료 — '옵션으로 +n' · 'PCO 588 → 708만원' */
  pkWithoutOptions: number
  pcoWithoutOptions: number
}

/** 옵션 합계(ot)만 읽는다 — 조정은 빼고(원가 기준), 부스 수는 인자로 */
function optionTotal(input: QuoteInput, options: Record<string, boolean>, booth: [number, number]): number {
  return computeQuoteOutputs({
    ...input,
    options,
    booth_count: booth[0],
    booth_premium_count: booth[1],
    adjustments: [],
  }).result.ot
}

/**
 * 고른 옵션마다 금액 — 카탈로그 순서로 하나씩 더해 가며 늘어난 만큼을 그 옵션 몫으로 잡는다.
 * 그래서 합이 엔진의 옵션 합계와 정확히 같고, 다른 옵션 위에 얹히는 것(온라인중계 = 화면중계 + 150만)은
 * 앞 옵션 다음의 증분으로 잡힌다(카탈로그 표기 '+150만원'과 같다).
 */
export function pickedOptionAmounts(input: QuoteInput): PickedOption[] {
  const on = input.options ?? {}
  const out: PickedOption[] = []
  const acc: Record<string, boolean> = {}
  let prev = optionTotal(input, {}, [0, 0])
  for (const o of OPT_CATALOG) {
    if (!on[o.id]) continue
    acc[o.id] = true
    const next = optionTotal(input, { ...acc }, [0, 0])
    out.push({ id: o.id, amount: next - prev })
    prev = next
  }
  // 카탈로그 밖의 옛 키(예: 구 견적의 scaler4k)가 과금되면 그 차이를 한 줄로 드러낸다 — 합이 어긋나지 않게
  const all = optionTotal(input, Object.fromEntries(Object.entries(on).filter(([, v]) => !!v)) as Record<string, boolean>, [0, 0])
  if (all !== prev) out.push({ id: '_other', amount: all - prev })
  return out
}

export function optionAmounts(input: QuoteInput, outputs: QuoteOutputs): OptionAmounts {
  const p = outputs.result
  const pkWithoutOptions = calcPkExcludingOptions(p)
  // calcPkExcludingOptions = pk − ot − (s5 − s5′) 이므로 옵션 없는 PCO s5′는 엔진 값만으로 되짚는다
  const pcoWithoutOptions = p.isCustom ? 0 : p.s5 - (p.pk - p.ot - pkWithoutOptions)
  return {
    picked: pickedOptionAmounts(input),
    boothStd: optionTotal(input, {}, [input.booth_count ?? 0, 0]),
    boothPremium: optionTotal(input, {}, [0, input.booth_premium_count ?? 0]),
    pkWithoutOptions,
    pcoWithoutOptions,
  }
}
