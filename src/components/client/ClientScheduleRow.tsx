// S8 다가오는 일정 1행 — 고객사가 관여하는 날짜만 들어온다(파생 규칙은 clientDerive.ts).
// 지난·완료 일정은 목록에서 지우지 않고 완료 표시와 함께 흐리게 남긴다.
import DdayBadge from './DdayBadge'
import { formatDate } from '../../lib/labels'
import type { ClientScheduleEntry } from './clientDerive'

export default function ClientScheduleRow({ entry }: { entry: ClientScheduleEntry }) {
  return (
    <li
      className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0 ${
        entry.done ? 'opacity-60' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
            entry.done
              ? 'border-positive bg-positive text-white'
              : 'border-border-strong bg-border-strong text-transparent'
          }`}
        >
          ✓
        </span>
        <span
          className={`truncate text-sm text-ink ${entry.kind === 'event' ? 'font-semibold' : ''}`}
        >
          {entry.title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="text-xs text-ink-cap">{formatDate(entry.date)}</span>
        {entry.done ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-positive-tint px-2 py-0.5 text-xs font-medium text-positive">
            완료
          </span>
        ) : (
          <DdayBadge dueAt={entry.date} />
        )}
      </div>
    </li>
  )
}
