import { STATUS_BADGE_CLASSES, STATUS_LABELS } from '../../lib/labels'
import type { DeliverableStatus } from '../../types/enums'

export default function StatusBadge({ status }: { status: DeliverableStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
