// 견적 옵션 카탈로그(OPT_CATALOG)의 표시 단가가 엔진 상수와 어긋나지 않는지 잠근다.
//
// 왜 필요한가 — LED↔중계 분리(#45) 때 `fullRecording`의 국문만 350만 → 100만으로 갱신되고
// **영문 라벨은 KRW 3,500,000으로 남아** 있었다. 엔진(`FULL_RECORDING_PRICE = 1_000_000`)·
// Excel·국문 UI는 전부 정상이라 테스트도 화면도 아무것도 잡지 못했다. 영문으로 보는 발주처에게는
// 3.5배 틀린 금액이 그대로 나갔을 상황이다.
//
// 두 축을 검사한다.
//  ① 같은 항목의 국문 표시 단가 == 영문 표시 단가 (언어별로 갈라지지 않는다)
//  ② 엔진 상수를 갖는 항목은 그 상수와도 일치 (표시가 산식에서 떨어져 나가지 않는다)
import { describe, expect, it } from 'vitest'
import { OPT_CATALOG } from '../components/quote/quoteFormState'
import {
  BOOTH_PREMIUM_UNIT_PRICE,
  BOOTH_UNIT_PRICE,
  FULL_RECORDING_PRICE,
  LED_OPERATING_PRICE,
  ONLINE_RELAY_ADDON_PRICE,
  SCREEN_RELAY_PRICE,
  SOUVENIR_UNIT_PRICE,
} from '../modules/quote/engine/calcEstimate'

/** '250만원' · '+150만원' → 2_500_000 · 1_500_000 (부호 없는 크기만 본다) */
function wonFromKo(price: string): number | null {
  const m = price.match(/([\d,]+)\s*만원/)
  return m ? Number(m[1].replace(/,/g, '')) * 10_000 : null
}

/** 'KRW 2,500,000' · '+KRW 1,500,000' · 'KRW 50,000/pax' → 숫자 */
function wonFromEn(price: string): number | null {
  const m = price.match(/KRW\s*([\d,]+)/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/** 엔진 상수와 1:1로 묶이는 항목만 — 나머지는 카탈로그가 단일 출처다 */
const ENGINE_BACKED: Record<string, number> = {
  souvenir: SOUVENIR_UNIT_PRICE,
  ledOperating: LED_OPERATING_PRICE,
  screenRelay: SCREEN_RELAY_PRICE,
  onlineRelay: ONLINE_RELAY_ADDON_PRICE,
  fullRecording: FULL_RECORDING_PRICE,
}

describe('견적 옵션 카탈로그 — 표시 단가 정합', () => {
  it('카탈로그가 비어 있지 않다 (import 경로 오타로 0건 통과 방지)', () => {
    expect(OPT_CATALOG.length).toBeGreaterThan(10)
  })

  it('국문·영문 표시 단가가 항목마다 일치한다', () => {
    const mismatches: string[] = []
    for (const opt of OPT_CATALOG) {
      const ko = wonFromKo(opt.ko.price)
      const en = wonFromEn(opt.en.price)
      if (ko === null || en === null) continue // 정액이 아닌 표기(구간·별도 협의 등)는 대상 아님
      if (ko !== en) mismatches.push(`${opt.id}: ko=${ko} en=${en}`)
    }
    expect(mismatches).toEqual([])
  })

  it('엔진 상수를 갖는 항목은 표시 단가가 그 상수와 같다', () => {
    const mismatches: string[] = []
    for (const [id, expected] of Object.entries(ENGINE_BACKED)) {
      const opt = OPT_CATALOG.find((o) => o.id === id)
      if (!opt) {
        mismatches.push(`${id}: 카탈로그에 없음`)
        continue
      }
      const ko = wonFromKo(opt.ko.price)
      if (ko !== expected) mismatches.push(`${id}: 표시=${ko} 엔진=${expected}`)
    }
    expect(mismatches).toEqual([])
  })

  it('부스 단가는 엔진 상수를 그대로 쓴다 (카탈로그 밖 입력 필드)', () => {
    // 부스는 카탈로그가 아니라 수량 입력 UI라 상수 자체만 확인한다
    expect(BOOTH_UNIT_PRICE).toBe(1_000_000)
    expect(BOOTH_PREMIUM_UNIT_PRICE).toBe(2_000_000)
  })
})
