// S-1 행사 목록 — 설계서 v1.5 §10. 프로젝트 셀렉터의 전체 목록 보기 대상 화면.
// 진행 중 카드 그리드 + 종료 섹션(접힘 기본). 세팅 미완료 카드는 행사 설정으로 유도한다.
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import { useProject } from '../context/ProjectContext'
import { useMutation } from '../hooks/useAsync'
import { EVENT_TYPE_LABELS, ddayLabel, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { ProjectSummary } from '../types/views'

const provider = getDataProvider()

export default function ProjectListPage() {
  const { projectId, setProject, summaries, reloadSummaries } = useProject()
  const navigate = useNavigate()
  const [showClosed, setShowClosed] = useState(false)
  const createMutation = useMutation(() => provider.createProject({}))

  const active = summaries.filter((s) => s.status === 'active')
  const closed = summaries.filter((s) => s.status === 'closed')

  const handleCreate = async () => {
    const created = await createMutation.run()
    if (!created) return
    reloadSummaries()
    setProject(created.id)
    navigate('/onboarding')
  }

  const openActive = (s: ProjectSummary) => {
    setProject(s.id)
    navigate(s.onboarded ? '/' : '/settings')
  }

  const openClosed = (s: ProjectSummary) => {
    setProject(s.id)
    navigate('/')
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="S-1 · 행사 목록"
        title="내 행사"
        action={
          <button
            type="button"
            onClick={handleCreate}
            disabled={createMutation.pending}
            className="btn btn-accent"
          >
            ＋ 새 행사 만들기
          </button>
        }
      />
      <ErrorAlert message={createMutation.error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((s) => (
          <ProjectCard
            key={s.id}
            summary={s}
            isCurrent={s.id === projectId}
            onOpen={() => openActive(s)}
            reloadSummaries={reloadSummaries}
          />
        ))}

        <button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.pending}
          className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border p-5 text-center text-sm font-semibold text-accent-deep"
        >
          ＋ 새 행사 만들기
        </button>
      </div>

      {closed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="btn btn-ghost btn-sm"
          >
            {showClosed ? '접기' : `종료 ${closed.length}`}
          </button>

          {showClosed && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {closed.map((s) => (
                <ProjectCard
                  key={s.id}
                  summary={s}
                  isCurrent={s.id === projectId}
                  closedSection
                  onOpen={() => openClosed(s)}
                  reloadSummaries={reloadSummaries}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ProjectCard({
  summary,
  isCurrent,
  closedSection = false,
  onOpen,
  reloadSummaries,
}: {
  summary: ProjectSummary
  isCurrent: boolean
  closedSection?: boolean
  onOpen: () => void
  reloadSummaries: () => void
}) {
  const closeMutation = useMutation((closed: boolean) => provider.closeProject(summary.id, closed))

  const handleToggleClosed = async (e: MouseEvent, closed: boolean) => {
    e.stopPropagation()
    const result = await closeMutation.run(closed)
    if (result) reloadSummaries()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={`ui-card relative cursor-pointer p-5 ${isCurrent ? 'border-2 border-accent' : ''} ${
        closedSection ? 'opacity-70' : ''
      }`}
    >
      <div className="absolute right-4 top-4">
        {closedSection ? (
          <button
            type="button"
            onClick={(e) => handleToggleClosed(e, false)}
            disabled={closeMutation.pending}
            className="btn btn-ghost btn-sm"
          >
            재개
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => handleToggleClosed(e, true)}
            disabled={closeMutation.pending}
            className="btn btn-ghost btn-sm"
          >
            종료
          </button>
        )}
      </div>

      <p className="t-caption pr-16">
        {EVENT_TYPE_LABELS[summary.event_type]} · {summary.event_date ? formatDate(summary.event_date) : '일정 미정'} ·{' '}
        {summary.venue ?? '미정'}
      </p>
      <h3 className="t-card-title mt-1 pr-16">{summary.name}</h3>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {closedSection ? (
          <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">종료</span>
        ) : (
          <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-deep">
            {summary.event_date ? ddayLabel(summary.event_date) : '일정 미정'}
          </span>
        )}
        <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
          PM {summary.pm_name ?? '미지정'}
        </span>
        {summary.expected_headcount != null && (
          <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
            예상 {summary.expected_headcount}명
          </span>
        )}
        {!summary.onboarded && (
          <>
            <span className="rounded-full bg-negative-tint px-2 py-0.5 text-xs font-medium text-negative">
              세팅 미완료
            </span>
            <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
              온보딩 {summary.onboarding_steps_done}/3
            </span>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-ink-sub">
          미결 컨펌 <span className="font-semibold text-ink">{summary.pending_approvals}</span>
        </span>
        <span className="text-ink-sub">
          지연{' '}
          <span className={`font-semibold ${summary.delayed_tasks > 0 ? 'text-negative' : 'text-ink'}`}>
            {summary.delayed_tasks}
          </span>
        </span>
        <span className="text-ink-sub">
          확정{' '}
          <span className="font-semibold text-ink">
            {summary.finals}/{summary.deliverable_total}
          </span>
        </span>
      </div>

      <div className="mt-3">
        {summary.onboarded ? (
          <ProgressBar done={summary.finals} total={summary.deliverable_total} />
        ) : (
          <p className="text-xs text-ink-cap">행사 설정에서 이어서 입력</p>
        )}
      </div>

      <ErrorAlert message={closeMutation.error} />
    </div>
  )
}
