// 홈 '다가오는 2주' (디자인지시서 v1.4 §7-2.5) — 오늘부터 14일 안의 일정·마일스톤을 날짜순 한 줄씩.
// 지난 것은 여기에 두지 않는다('오늘 할 일'의 지연 행이 맡는다). 표지는 형태로: ◆ 마름모 색 = 구분.
import { Link } from 'react-router-dom'
import EmptyState from '../internal/EmptyState'
import { dueLabel, formatDateWeekday } from '../../lib/labels'

export type UpcomingMark = 'milestone' | 'partner_submit' | 'host_notice' | 'internal'

export interface UpcomingEntry {
  key: string
  /** ISO date */
  date: string
  title: string
  /** '일정' · '마일스톤 · 디자인' · 방향 라벨 등 */
  kind: string
  mark: UpcomingMark
}

const MARK_CLASSES: Record<UpcomingMark, string> = {
  milestone: 'bg-accent',
  partner_submit: 'bg-accent',
  host_notice: 'bg-steel',
  internal: 'bg-border-strong',
}

export default function UpcomingCard({ entries }: { entries: UpcomingEntry[] }) {
  return (
    <section className="ui-card" aria-labelledby="upcoming-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 id="upcoming-title" className="t-card-title">
          다가오는 2주
        </h2>
        <Link to="/schedule" className="text-[13px] font-medium text-accent-deep hover:underline">
          일정 전체 보기
        </Link>
      </div>
      {entries.length === 0 ? (
        <EmptyState message="2주 안에 마감이 없습니다." />
      ) : (
        <ul className="px-5 py-2">
          {entries.map((e) => (
            <li
              key={e.key}
              data-testid="upcoming-row"
              className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-3 border-b border-track py-2.5 last:border-b-0"
            >
              <span className="text-xs font-medium text-brown">{formatDateWeekday(e.date)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={`size-2 shrink-0 rotate-45 ${MARK_CLASSES[e.mark]}`} />
                <span className="truncate text-sm text-ink">{e.title}</span>
                <span className="shrink-0 text-xs text-ink-cap">{e.kind}</span>
              </span>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
                {dueLabel(e.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
