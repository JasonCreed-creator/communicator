// '이전 버전 대비' 블록 — 3.17b 시안 정렬('랜딩보드 · 견적.dc.html' 선택 버전 요약).
// 증감액 · 증감률 · 사유를 한 자리에 남긴다.
//
// ⚠ 사유는 스키마에 없다(quotes에 변경 사유 필드가 없음). **지어내지 않고 '미기재'로 표시**한다.
//    대신 입력 스냅숏(input)에서 사실로 확인되는 변경점(인원·베뉴·모객 포함 여부)만 덧붙인다 —
//    이건 추정이 아니라 두 버전의 저장값 차이다.
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

export default function QuoteVersionDelta({
  current,
  previous,
}: {
  current: Quote
  previous: Quote | null
}) {
  if (!previous) {
    return (
      <div className="rounded-md border border-border bg-canvas px-3.5 py-3" data-testid="quote-version-delta">
        <p className="t-caption">이전 버전 대비</p>
        <p className="mt-1.5 text-xs text-ink-cap">첫 버전입니다 — 비교할 이전 버전이 없습니다.</p>
      </div>
    )
  }

  const diff = current.total_amount - previous.total_amount
  const rate = previous.total_amount === 0 ? null : (diff / previous.total_amount) * 100
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±'
  // 증감 방향은 부호 글리프로 먼저 읽히게 하고(색만으로 구분 금지) 색은 보조로만 쓴다
  const tone = diff > 0 ? 'text-positive' : diff < 0 ? 'text-negative' : 'text-ink-sub'
  const changes = inputChanges(previous, current)

  return (
    <div className="rounded-md border border-border bg-canvas px-3.5 py-3" data-testid="quote-version-delta">
      <p className="t-caption">이전 버전 대비</p>
      <div className="mt-1.5 flex justify-between gap-3 text-[13px]">
        <span className="text-ink-sub">
          v{previous.version} → v{current.version}
        </span>
        <span className={`font-semibold ${tone}`} data-testid="quote-delta-amount">
          {sign}
          {fmtWon(Math.abs(diff), false)}
          {rate !== null && ` (${sign}${Math.abs(rate).toFixed(1)}%)`}
        </span>
      </div>
      {changes.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-cap" data-testid="quote-delta-changes">
          변경점 {changes.join(' · ')}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-ink-cap">
        사유 <span data-testid="quote-delta-reason">미기재</span>
      </p>
    </div>
  )
}
