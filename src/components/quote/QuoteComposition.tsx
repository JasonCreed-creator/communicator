// 견적 구성 스택 막대 — 3.17b 시안 정렬('랜딩보드 · 견적.dc.html' 선택 버전 요약).
// 요약 8행 금액 나열 위에 "어디서 비용이 났는가"를 먼저 보여준다.
//
// ⚠ 패턴 기준 시트 §07: 스택 막대는 **accent 3단 초과 금지**다.
// 구성 그룹은 4개지만 램프를 4단으로 늘리지 않고, 네 번째(모객·참관객)를 StackedBar의
// `rest`(중립 track 구간)로 넣고 범례에 이름을 밝힌다.
//
// 그룹 정의(엔진 breakdown 8키를 남김없이 덮는다 — 합 = subtotal):
//   공간·시공   = s1
//   제작·운영   = s2 + s3 + s4 + options
//   기획료      = s5
//   모객·참관객 = recruit + attendee   ← rest(중립)
// 금액 자체는 §07 규격상 막대에 싣지 않고 비율(%)만 범례에 붙인다 — 금액은 아래 8행이 정본이다.
import StackedBar from '../internal/StackedBar'
import type { QuoteBreakdown } from '../../types/entities'

export interface CompositionGroups {
  space: number
  production: number
  planning: number
  recruiting: number
}

export function compositionGroups(b: QuoteBreakdown): CompositionGroups {
  return {
    space: b.s1,
    production: b.s2 + b.s3 + b.s4 + b.options,
    planning: b.s5,
    recruiting: b.recruit + b.attendee,
  }
}

export default function QuoteComposition({ breakdown }: { breakdown: QuoteBreakdown }) {
  const g = compositionGroups(breakdown)
  return (
    <div data-testid="quote-composition">
      <p className="t-caption mb-2">구성</p>
      <StackedBar
        segments={[
          { label: '공간·시공', value: g.space },
          { label: '제작·운영', value: g.production },
          { label: '기획료', value: g.planning },
        ]}
        rest={{ label: '모객·참관객', value: g.recruiting }}
      />
    </div>
  )
}
