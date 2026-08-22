import { useState } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import PhaseFilterBar from './PhaseFilterBar'
import RoleCharterGrid from './RoleCharterGrid'
import WbsChecklist from './WbsChecklist'
import WbsGantt from './WbsGantt'
import { GANTT_AXIS_MAX, GANTT_AXIS_MIN, diffDays, offsetLabel, phaseOptionsFrom } from './wbsFormat'
import { useProject } from '../../context/ProjectContext'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { toIsoDate } from '../../lib/wbs'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

type ViewMode = 'checklist' | 'gantt'

/** S5 상단 — WBS 체크리스트/간트 + 하단 R&R 카드 그리드 (설계서 v1.4 §10 S5) */
export default function WbsBoard() {
  const { projectId } = useProject()
  const [phase, setPhase] = useState<number | 'all'>('all')
  const [view, setView] = useState<ViewMode>('checklist')

  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  const roleCharters = useAsync(() => provider.listRoleCharters(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId), [projectId])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const isPm = currentUser.data?.role === 'pm'
  const reexpand = useMutation(() => provider.expandWbs(projectId))

  const allTasks = wbsTasks.data ?? []
  const phases = phaseOptionsFrom(allTasks)
  const filteredTasks = phase === 'all' ? allTasks : allTasks.filter((t) => t.phase_no === phase)

  // 3.10.1 R2 — 오늘이 간트 축(D-42~D+30) 밖이면 안내 캡션을 토글 왼쪽에 표시(축 행은 눈금만)
  const todayOffset = project.data?.event_date ? diffDays(toIsoDate(new Date()), project.data.event_date) : null
  const todayOutOfAxis = todayOffset !== null && (todayOffset < GANTT_AXIS_MIN || todayOffset > GANTT_AXIS_MAX)

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
            <button type="button" onClick={handleReexpand} disabled={reexpand.pending} className="btn btn-ghost btn-sm">
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
            <div className="flex shrink-0 items-center gap-3">
              {view === 'gantt' && todayOutOfAxis && (
                <span className="t-caption whitespace-nowrap">
                  오늘 {offsetLabel(todayOffset as number)} · 축 범위 밖
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setView('checklist')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    view === 'checklist' ? 'bg-dark text-white' : 'text-ink-sub'
                  }`}
                >
                  체크리스트
                </button>
                <button
                  type="button"
                  onClick={() => setView('gantt')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    view === 'gantt' ? 'bg-dark text-white' : 'text-ink-sub'
                  }`}
                >
                  간트
                </button>
              </div>
            </div>
          </div>

          {wbsTasks.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

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
