// '이전 버전 대비' 블록 — 디자인지시서 v1.4 §7-2.10(PR-6 · 캔버스 견적 목록 요약 패널).
// 한 문장으로 읽힌다: 'v2보다 1,750,000원 줄었습니다 (−1.3%)' + '바뀐 것: 게런티 100 → 80명 · 추가옵션 2 → 3종'.
//
// ⚠ 바꾼 이유는 스키마에 없다(quotes에 변경 사유 필드가 없음) — 지어내지 않는다. 캔버스의 '이유 적기'는
//    저장할 곳이 없어 구현하지 않았고, 이유를 말하는 줄도 두지 않는다(할 수 있는 동작이 없는 안내라서).
//    대신 입력 스냅숏(input)에서 사실로 확인되는 변경점만 적는다 — 추정이 아니라 두 버전의 저장값 차이다.
//    증감은 좋고 나쁨이 아니라 사실이라 색을 입히지 않는다(빨강은 지연 전용 — §7-2).
import { fmtWon } from './quoteFormState'
import { venueDisplayName } from '../../modules/quote/engine/quoteInput'
import type { Quote } from '../../types/entities'

/** 같은 계열(같은 행사 연결 / 둘 다 미연결) 안에서 바로 앞 버전을 찾는다 */
export function previousVersion(quotes: Quote[], current: Quote): Quote | null {
  const sameGroup = quotes.filter(
    (q) => q.project_id === current.project_id && q.version < current.version,
  )
  if (sameGroup.length === 0) return null
  return sameGroup.reduce((best, q) => (q.version > best.version ? q : best))
}

/** 입력 스냅숏에서 사실로 확인되는 변경점만 뽑는다(사유 아님 — 변경점) */
export function inputChanges(prev: Quote, cur: Quote): string[] {
  const out: string[] = []
  if (prev.input.headcount !== cur.input.headcount) {
    out.push(`인원 ${prev.input.headcount} → ${cur.input.headcount}명`)
  }
  const venueOf = (q: Quote) => (q.input.selected_venue ? venueDisplayName(q.input.selected_venue) : null)
  if (venueOf(prev) !== venueOf(cur)) {
    out.push(`베뉴 ${venueOf(prev) ?? '미정'} → ${venueOf(cur) ?? '미정'}`)
  }
  if (prev.input.include_leads !== cur.input.include_leads) {
    out.push(`모객 ${prev.input.include_leads ? '포함' : '제외'} → ${cur.input.include_leads ? '포함' : '제외'}`)
  }
  if (cur.input.include_leads && prev.input.guarantee !== cur.input.guarantee) {
    out.push(`게런티 ${prev.input.guarantee} → ${cur.input.guarantee}명`)
  }
  const optionCount = (q: Quote) => Object.values(q.input.options ?? {}).filter(Boolean).length
  if (optionCount(prev) !== optionCount(cur)) {
    out.push(`추가옵션 ${optionCount(prev)} → ${optionCount(cur)}종`)
  }
  return out
}

/** 증감 문장 — 'v2보다 1,750,000원 줄었습니다' · 'v2보다 …원 늘었습니다' · '금액은 v2 그대로입니다' */
export function deltaSentence(prev: Quote, cur: Quote): { text: string; rate: string | null } {
  const diff = cur.total_amount - prev.total_amount
  if (diff === 0) return { text: `금액은 v${prev.version} 그대로입니다`, rate: null }
  const rate = prev.total_amount === 0 ? null : (diff / prev.total_amount) * 100
  return {
    text: `v${prev.version}보다 ${fmtWon(Math.abs(diff), false)} ${diff < 0 ? '줄었습니다' : '늘었습니다'}`,
    rate: rate === null ? null : `(${diff < 0 ? '−' : '+'}${Math.abs(rate).toFixed(1)}%)`,
  }
}

export default function QuoteVersionDelta({
  current,
  previous,
}: {
  current: Quote
  previous: Quote | null
}) {
  if (!previous) {
    return (
      <div className="flex flex-col gap-1 rounded-[10px] bg-canvas px-3.5 py-3" data-testid="quote-version-delta">
        <p className="text-sm font-semibold text-ink">첫 버전입니다</p>
        <p className="t-caption">비교할 이전 버전이 없습니다.</p>
      </div>
    )
  }

  const { text, rate } = deltaSentence(previous, current)
  const changes = inputChanges(previous, current)

  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-canvas px-3.5 py-3" data-testid="quote-version-delta">
      <p className="text-sm font-semibold text-ink" data-testid="quote-delta-amount">
        {text}
        {rate && (
          <>
            {' '}
            <span className="font-medium text-ink-sub">{rate}</span>
          </>
        )}
      </p>
      {changes.length > 0 && (
        <p className="t-caption text-ink-sub" data-testid="quote-delta-changes">
          바뀐 것: {changes.join(' · ')}
        </p>
      )}
    </div>
  )
}
