import { useState } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import PhaseFilterBar from './PhaseFilterBar'
import RoleCharterGrid from './RoleCharterGrid'
import WbsChecklist from './WbsChecklist'
import WbsGantt from './WbsGantt'
import { phaseOptionsFrom } from './wbsFormat'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

type ViewMode = 'checklist' | 'gantt'

/** S5 상단 — WBS 체크리스트/간트 + 하단 R&R 카드 그리드 (설계서 v1.4 §10 S5) */
export default function WbsBoard() {
  const [phase, setPhase] = useState<number | 'all'>('all')
  const [view, setView] = useState<ViewMode>('checklist')

  const project = useAsync(() => provider.getProject(PROJECT_ID), [])
  const wbsTasks = useAsync(() => provider.listWbsTasks(PROJECT_ID), [])
  const roleCharters = useAsync(() => provider.listRoleCharters(PROJECT_ID), [])
  const deliverables = useAsync(() => provider.listDeliverables(PROJECT_ID), [])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const isPm = currentUser.data?.role === 'pm'
  const reexpand = useMutation(() => provider.expandWbs(PROJECT_ID))

  const allTasks = wbsTasks.data ?? []
  const phases = phaseOptionsFrom(allTasks)
  const filteredTasks = phase === 'all' ? allTasks : allTasks.filter((t) => t.phase_no === phase)

  const handleReexpand = async () => {
    const confirmed = window.confirm(
      '템플릿을 재전개하면 행사 유형·행사일 변경분이 반영됩니다. 기존 진행 상태·메모·산출물 연결은 코드 기준으로 보존됩니다. 계속할까요?',
    )
    if (!confirmed) return
    const result = await reexpand.run()
    if (result) wbsTasks.reload()
  }

  return (
    <div className="space-y-6">
      <Card
        title="WBS"
        action={
          isPm ? (
            <button
              type="button"
              onClick={handleReexpand}
              disabled={reexpand.pending}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              템플릿 재전개
            </button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <ErrorAlert message={wbsTasks.error} />
          <ErrorAlert message={reexpand.error} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <PhaseFilterBar phases={phases} value={phase} onChange={setPhase} />
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setView('checklist')}
                className={`rounded px-2.5 py-1 font-medium ${
                  view === 'checklist' ? 'bg-gray-900 text-white' : 'text-gray-600'
                }`}
              >
                체크리스트
              </button>
              <button
                type="button"
                onClick={() => setView('gantt')}
                className={`rounded px-2.5 py-1 font-medium ${
                  view === 'gantt' ? 'bg-gray-900 text-white' : 'text-gray-600'
                }`}
              >
                간트
              </button>
            </div>
          </div>

          {wbsTasks.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}

          {view === 'checklist' ? (
            <WbsChecklist
              tasks={filteredTasks}
              deliverables={deliverables.data ?? []}
              isPm={!!isPm}
              onChanged={wbsTasks.reload}
            />
          ) : (
            <WbsGantt tasks={filteredTasks} eventDate={project.data?.event_date ?? null} />
          )}
        </div>
      </Card>

      <Card title="R&R">
        <ErrorAlert message={roleCharters.error} />
        <RoleCharterGrid charters={roleCharters.data ?? []} />
      </Card>
    </div>
  )
}
