// S7 처리 완료 이력 1행 — 상태 뱃지는 공용 StatusBadge를 그대로 재사용
// (ApprovalDecision 'approved'|'changes_requested'는 DeliverableStatus 키와 값이 겹쳐 그대로 대입 가능).
// 목록 안에서는 border-b border-border 구분선으로만 분리한다.
import StatusBadge from '../internal/StatusBadge'
import { formatDateTime } from '../../lib/labels'
import type { ClientHistoryItem } from '../../types'

export default function HistoryRow({ item }: { item: ClientHistoryItem }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{item.title}</p>
        <p className="text-xs text-ink-cap">{formatDateTime(item.decided_at)}</p>
      </div>
      <StatusBadge status={item.decision} />
    </li>
  )
}
