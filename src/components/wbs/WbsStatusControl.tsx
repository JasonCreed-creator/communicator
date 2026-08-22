import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { WbsStatus } from '../../types/enums'
import { WBS_STATUS_BADGE_CLASSES, WBS_STATUS_LABELS, nextWbsStatus } from './wbsFormat'

const provider = getDataProvider()

/**
 * 상태 순환 토글(todo→doing→done→todo). 권한(담당 역할+pm)은 provider가 강제 —
 * 그 외 사용자가 눌러도 버튼은 항상 뜨고, 403이면 ErrorAlert로 그대로 노출한다(§6.1).
 */
export default function WbsStatusControl({
  taskId,
  status,
  onChanged,
}: {
  taskId: string
  status: WbsStatus
  onChanged: () => void
}) {
  const update = useMutation((next: WbsStatus) => provider.updateWbsTask(taskId, { status: next }))

  const handleClick = async () => {
    const result = await update.run(nextWbsStatus(status))
    if (result) onChanged()
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={update.pending}
        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${WBS_STATUS_BADGE_CLASSES[status]}`}
      >
        {WBS_STATUS_LABELS[status]}
      </button>
      <ErrorAlert message={update.error} />
    </div>
  )
}
