import { STATUS_BADGE_CLASSES, STATUS_LABELS } from '../../lib/labels'
import type { DeliverableStatus } from '../../types/enums'

// 상태 뱃지 — 디자인지시서 v1 §3. pending_approval(컨펌요청)만 좌측 도트를 동반한다.
export default function StatusBadge({ status }: { status: DeliverableStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {status === 'pending_approval' && (
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}
