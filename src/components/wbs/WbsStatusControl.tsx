import ErrorAlert from '../internal/ErrorAlert'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { WbsTask } from '../../types/entities'
import type { WbsStatus } from '../../types/enums'
import { WBS_STATUS_LABELS, nextWbsStatus, wbsTaskLevel } from './wbsFormat'

const provider = getDataProvider()

/**
 * 상태 순환 토글(todo→doing→done→todo). 권한(담당 역할+pm)은 provider가 강제 —
 * 그 외 사용자가 눌러도 버튼은 항상 뜨고, 403이면 ErrorAlert로 그대로 노출한다(§6.1).
 *
 * 표시는 패턴 기준 시트 §03 WBS 계열 5단계(미착수/진행/마감 임박/완료/지연) —
 * 마감에서 파생되는 '마감 임박'·'지연'이 저장 상태보다 앞선다. 클릭이 바꾸는 값은 언제나
 * 저장 상태(todo·doing·done)뿐이라, 다음 값이 무엇인지는 title로 알린다.
 */
export default function WbsStatusControl({
  task,
  today,
  onChanged,
}: {
  task: WbsTask
  today: string
  onChanged: () => void
}) {
  const update = useMutation((next: WbsStatus) => provider.updateWbsTask(task.id, { status: next }))
  const { level, label } = wbsTaskLevel(task, today)
  const next = nextWbsStatus(task.status)

  const handleClick = async () => {
    const result = await update.run(next)
    if (result) onChanged()
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={update.pending}
        title={`상태 변경: ${WBS_STATUS_LABELS[task.status]} → ${WBS_STATUS_LABELS[next]}`}
        className="inline-flex disabled:opacity-50"
      >
        <LevelBadge level={level} label={label} />
      </button>
      <ErrorAlert message={update.error} />
    </div>
  )
}
