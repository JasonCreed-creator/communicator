import { useEffect, useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

/**
 * §10.2 "큐시트로 내보내기" 액션 — 대상 큐시트(category='큐시트') 항목을 골라 exportScenarioToCues를
 * 호출한다. 큐시트가 없으면 선택 UI 대신 안내 문구만 노출(§10.2 "큐시트가 없으면 안내 문구").
 */
export default function ScenarioExportPanel({
  deliverableId,
  projectId,
}: {
  deliverableId: string
  projectId: string | null
}) {
  const cuesheets = useAsync(
    () => (projectId ? provider.listDeliverables(projectId, { area: 'ops' }) : Promise.resolve([])),
    [projectId],
  )
  const list = (cuesheets.data ?? []).filter((d) => d.category === '큐시트')
  const [targetId, setTargetId] = useState('')
  const [resultCount, setResultCount] = useState<number | null>(null)
  const exportMutation = useMutation((targetDeliverableId: string) =>
    provider.exportScenarioToCues(deliverableId, targetDeliverableId),
  )

  useEffect(() => {
    // 목록이 로드되면 첫 큐시트를 기본 선택(이미 고른 값이 있으면 존중)
    if (!targetId && list.length > 0) setTargetId(list[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length])

  const handleExport = async () => {
    if (!targetId) return
    setResultCount(null)
    const result = await exportMutation.run(targetId)
    if (result) setResultCount(result.length)
  }

  if (cuesheets.loading) {
    return <span className="text-sm text-ink-cap">큐시트 목록 확인 중…</span>
  }

  if (list.length === 0) {
    return <span className="text-sm text-ink-cap">같은 행사에 큐시트 항목이 없습니다 — 큐시트를 먼저 만들어 주세요.</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={targetId}
        onChange={(e) => {
          setTargetId(e.target.value)
          setResultCount(null)
        }}
        aria-label="대상 큐시트"
        className="ui-input ui-select w-auto text-xs"
      >
        {list.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleExport}
        disabled={exportMutation.pending || !targetId}
        className="btn btn-sm btn-primary"
      >
        내보내기
      </button>
      <ErrorAlert message={exportMutation.error} />
      {resultCount !== null && (
        <p className="t-caption text-positive">
          {resultCount > 0
            ? `큐 ${resultCount}개를 후미에 추가했습니다(기존 큐 보존).`
            : '내보낼 큐 후보(영상·전환 블록의 큐 표기)가 없습니다.'}
        </p>
      )}
    </div>
  )
}
