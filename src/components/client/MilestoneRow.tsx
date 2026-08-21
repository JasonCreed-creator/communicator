// S8 마일스톤 1행 — done이면 체크 표시 + 흐리게.
import { formatDate } from '../../lib/labels'
import type { Milestone } from '../../types'

export default function MilestoneRow({ milestone }: { milestone: Milestone }) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 ${
        milestone.done ? 'opacity-50' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
            milestone.done
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-gray-300 text-transparent'
          }`}
        >
          ✓
        </span>
        <span className="truncate text-sm text-gray-900">{milestone.title}</span>
      </div>
      <span className="shrink-0 text-xs text-gray-500">{formatDate(milestone.due_date)}</span>
    </li>
  )
}
