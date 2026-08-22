import { STATUS_BADGE_CLASSES, STATUS_LABELS } from '../../lib/labels'
import type { DeliverableStatus } from '../../types/enums'

/** S9 전용 상태 뱃지 — src/lib/labels.ts의 STATUS_LABELS·STATUS_BADGE_CLASSES를 정본으로 사용한다 */
export default function StatusPill({ status }: { status: DeliverableStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
