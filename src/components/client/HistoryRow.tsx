// S7 처리 완료 이력 1행 — 결정 뱃지는 lib/labels.ts 정본 매핑 재사용
// (ApprovalDecision 'approved'|'changes_requested'는 DeliverableStatus 키와 값이 겹쳐 그대로 대입 가능).
import { STATUS_BADGE_CLASSES, STATUS_LABELS, formatDateTime } from '../../lib/labels'
import type { ClientHistoryItem } from '../../types'

export default function HistoryRow({ item }: { item: ClientHistoryItem }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
        <p className="text-xs text-gray-400">{formatDateTime(item.decided_at)}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[item.decision]}`}
      >
        {STATUS_LABELS[item.decision]}
      </span>
    </li>
  )
}
