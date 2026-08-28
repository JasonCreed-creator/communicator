// S8 진척 헤더 — 시안: 전체 진행률 도넛(단일 비율 1개) + 행사 D-day.
// 산출물 확정 수 기준이다. 내부 태스크 수·WBS는 넘기지 않는다.
import Donut from '../internal/Donut'
import { ddayLabel, formatDate } from '../../lib/labels'

export default function ClientProgressHeader({
  done,
  total,
  eventDate,
}: {
  done: number
  total: number
  eventDate: string | null
}) {
  return (
    <div className="ui-card p-4">
      <div className="flex items-center gap-4">
        <Donut done={done} total={total} />
        <div className="min-w-0">
          <p className="t-caption">전체 진행률</p>
          <p className="mt-1 text-sm text-ink-sub">
            산출물 {done}/{total} 확정
          </p>
        </div>
      </div>
      {eventDate && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm text-ink-sub">행사일 {formatDate(eventDate)}</span>
          <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-dark px-3 text-[15px] font-semibold text-dark-ink">
            {ddayLabel(eventDate)}
          </span>
        </div>
      )}
    </div>
  )
}
