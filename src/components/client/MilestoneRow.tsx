// S8 마일스톤 1행 — done이면 체크 표시 + 흐리게. 목록 안에서는 border-b border-border 구분선으로만 분리한다.
import { formatDate } from '../../lib/labels'
import type { Milestone } from '../../types'

export default function MilestoneRow({ milestone }: { milestone: Milestone }) {
  return (
    <li
      className={`flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${
        milestone.done ? 'opacity-50' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
            milestone.done
              ? 'border-positive bg-positive text-white'
              : 'border-border-strong bg-border-strong text-transparent'
          }`}
        >
          ✓
        </span>
        <span className="truncate text-sm text-ink">{milestone.title}</span>
      </div>
      <span className="shrink-0 text-xs text-ink-cap">{formatDate(milestone.due_date)}</span>
    </li>
  )
}
