// S-1 행사 목록 — 설계서 v1.5 §10. 프로젝트 셀렉터의 전체 목록 보기 대상 화면.
// 진행 중 카드 그리드 + 종료 섹션(접힘 기본). 세팅 미완료 카드는 행사 설정으로 유도한다.
//
// Phase 3.17 시안 정렬(행사 설정 · 행사 목록.dc.html §행사 목록):
//  · 배지 5개 한 줄 → 3층 — ①정체(유형·일자·장소) ②D-day pill + 진행률 ③주의 신호.
//    주의가 없으면 positive '주의 없음' 한 칩만 남긴다(조용한 행사는 조용하게).
//  · 세팅 미완료 카드는 canvas 면 + negative 보더로 갈라, 남은 필수 항목·온보딩 진행률·
//    액션 버튼을 카드 안에 넣는다.
//  · 현재 행사는 2px accent 보더 + '현재' 배지.
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import { LevelBadge } from '../components/internal/StatusBadge'
import { missingRequired } from '../components/settings/requiredFields'
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
    navigate(s.onboarded ? '/home' : '/settings')
  }

  const openClosed = (s: ProjectSummary) => {
    setProject(s.id)
    navigate('/home')
  }

  const continueOnboarding = (s: ProjectSummary) => {
    setProject(s.id)
    navigate('/onboarding')
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
            onContinueOnboarding={() => continueOnboarding(s)}
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
                  onContinueOnboarding={() => continueOnboarding(s)}
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
  onContinueOnboarding,
  reloadSummaries,
}: {
  summary: ProjectSummary
  isCurrent: boolean
  closedSection?: boolean
  onOpen: () => void
  onContinueOnboarding: () => void
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

  const needsSetup = !summary.onboarded && !closedSection
  const missing = missingRequired(summary)
  const dday = summary.event_date ? ddayLabel(summary.event_date) : null
  // D-day pill: 지난 기한은 negative, 30일 이내는 dark(눈에 걸리게), 그 밖은 중립 track면
  const overdue = !!dday && dday.startsWith('D+')
  const near = !!dday && !overdue && (dday === 'D-day' || Number(dday.slice(2)) <= 30)
  const ddayTone = closedSection
    ? 'bg-track text-ink-sub'
    : overdue
      ? 'bg-negative-tint text-negative'
      : near
        ? 'bg-dark text-dark-ink'
        : 'bg-track text-ink-sub'

  const quiet = summary.pending_approvals === 0 && summary.delayed_tasks === 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      data-testid="project-card"
      data-project-id={summary.id}
      data-needs-setup={needsSetup ? 'true' : 'false'}
      className={`ui-card relative flex cursor-pointer flex-col gap-3.5 p-5 ${
        isCurrent ? 'border-2 border-accent' : needsSetup ? 'border-negative' : ''
      } ${needsSetup ? 'bg-canvas' : ''} ${closedSection ? 'opacity-70' : ''}`}
    >
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        {isCurrent && (
          <span
            data-testid="current-badge"
            className="inline-flex shrink-0 items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white"
          >
            현재
          </span>
        )}
        <button
          type="button"
          onClick={(e) => handleToggleClosed(e, !closedSection)}
          disabled={closeMutation.pending}
          className="btn btn-ghost btn-sm"
        >
          {closedSection ? '재개' : '종료'}
        </button>
      </div>

      {/* ① 정체 — 유형 · 일자 · 장소 + 행사명 */}
      <div>
        <p className="t-caption pr-28">
          {EVENT_TYPE_LABELS[summary.event_type]} ·{' '}
          {summary.event_date ? formatDate(summary.event_date) : '일정 미정'} ·{' '}
          {summary.venue ?? '미정'}
        </p>
        <h3 className="t-card-title mt-1.5 pr-28">{summary.name}</h3>
      </div>

      {needsSetup ? (
        /* 세팅 미완료 — 남은 필수 항목 + 온보딩 진행률 + 액션 (시안: canvas 면 위 흰 인셋) */
        <>
          <div data-testid="setup-panel" className="rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <LevelBadge level="blocked" label="세팅 미완료" />
              <span className="text-xs text-ink-sub">온보딩 {summary.onboarding_steps_done}/3</span>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
              <div
                className="h-1.5 rounded-[3px] bg-negative"
                style={{ width: `${Math.round((summary.onboarding_steps_done / 3) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-cap">
              {missing.length > 0
                ? `필수 ${missing.length}개 남음 — ${missing.map((f) => f.label).join(' · ')}`
                : '필수 항목은 모두 입력됨 — 담당자·유형 확인만 남았습니다'}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onContinueOnboarding()
            }}
            className="btn btn-primary w-full"
          >
            온보딩 이어서 하기
          </button>
        </>
      ) : (
        <>
          {/* ② D-day pill + 진행률 */}
          <div className="flex items-center gap-2.5">
            <span
              data-testid="card-dday"
              className={`inline-flex h-[30px] shrink-0 items-center rounded-full px-3 text-[15px] font-semibold ${ddayTone}`}
            >
              {closedSection ? '종료' : (dday ?? '일정 미정')}
            </span>
            <div className="min-w-0 flex-1">
              <ProgressBar done={summary.finals} total={summary.deliverable_total} hideValue />
              <p className="mt-1 text-right text-xs text-ink-sub">
                확정 {summary.finals}/{summary.deliverable_total}
              </p>
            </div>
          </div>

          {/* ③ 주의 신호 — 없으면 positive 한 칩 */}
          <div
            data-testid="card-signals"
            className="flex flex-wrap gap-1.5 border-t border-border pt-3"
          >
            {quiet ? (
              <LevelBadge level="positive" label="주의 없음" />
            ) : (
              <>
                {summary.pending_approvals > 0 && (
                  <LevelBadge level="attention" label={`미결 컨펌 ${summary.pending_approvals}`} dot />
                )}
                {summary.delayed_tasks > 0 && (
                  <LevelBadge level="blocked" label={`지연 ${summary.delayed_tasks}`} />
                )}
              </>
            )}
          </div>
        </>
      )}

      <p className="t-caption">
        PM {summary.pm_name ?? '미지정'}
        {summary.expected_headcount != null && ` · 예상 ${summary.expected_headcount}명`}
      </p>

      <ErrorAlert message={closeMutation.error} />
    </div>
  )
}
