// S-1 행사 목록 — 설계서 v1.5 §10. 프로젝트 셀렉터의 전체 목록 보기 대상 화면.
// 진행 중 카드 그리드 + 종료 섹션(접힘 기본). 세팅 미완료 카드는 행사 설정으로 유도한다.
//
// Phase 3.17 시안 정렬(행사 설정 · 행사 목록.dc.html §행사 목록):
//  · 배지 5개 한 줄 → 3층 — ①정체(유형·일자·장소) ②D-day pill + 진행률 ③주의 신호.
//    주의가 없으면 positive '주의 없음' 한 칩만 남긴다(조용한 행사는 조용하게).
//  · 세팅 미완료 카드는 canvas 면 + negative 보더로 갈라, 남은 필수 항목·온보딩 진행률·
//    액션 버튼을 카드 안에 넣는다.
//  · 현재 행사는 2px accent 보더 + '현재' 배지.
//
// v2.8 §4-1c — 카드 액션 행에 삭제가 붙는다(권한 = 전역 app_role='admin').
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import { LevelBadge } from '../components/internal/StatusBadge'
import DeleteProjectDialog, { canDeleteProject } from '../components/settings/DeleteProjectDialog'
import { missingRequired } from '../components/settings/requiredFields'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { EVENT_TYPE_LABELS, ddayLabel, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { ProjectSummary } from '../types/views'

const provider = getDataProvider()

export default function ProjectListPage() {
  const { projectId, setProject, summaries, reloadSummaries } = useProject()
  const navigate = useNavigate()
  const [showClosed, setShowClosed] = useState(false)
  const createMutation = useMutation(() => provider.createProject({}))
  // 권한은 화면에서 한 번만 읽어 카드에 내린다 — 카드마다 getCurrentUser()를 부르면
  // 행사 수만큼 같은 조회가 반복된다(사이드바 견적 게이트와 같은 관용구).
  const me = useAsync(() => provider.getCurrentUser(), [])
  const canDelete = !!me.data && canDeleteProject(me.data)
  // 열린 삭제 모달은 화면이 하나만 붙든다 — 카드마다 상태를 두면 두 카드가 동시에 열 수 있다.
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)

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
            canDelete={canDelete}
            onRequestDelete={() => setPendingDelete(s)}
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

          {/* 종료 행사도 지울 수 있다 — 종료는 삭제의 선행 조건이 아니고(§4-1c 결정 2),
              끝난 행사를 치우는 것이 오히려 정상 동선이다. 그래서 canDelete를 그대로 내린다. */}
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
                  canDelete={canDelete}
                  onRequestDelete={() => setPendingDelete(s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 삭제 확인은 모달이 전담한다(행사명 타이핑·오류 표시 포함). 여기서는 성공 후
          목록만 다시 읽는다 — 지운 행사가 현재 행사였거나 마지막 행사였어도
          ProjectContext가 스스로 되잡는다(죽은 저장값 정리 / 행사 0건 빈 화면). */}
      {pendingDelete && (
        <DeleteProjectDialog
          projectId={pendingDelete.id}
          projectName={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onDeleted={() => {
            setPendingDelete(null)
            reloadSummaries()
          }}
        />
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
  canDelete,
  onRequestDelete,
}: {
  summary: ProjectSummary
  isCurrent: boolean
  closedSection?: boolean
  onOpen: () => void
  onContinueOnboarding: () => void
  reloadSummaries: () => void
  /** 전역 app_role='admin'인지 — 화면에서 한 번 판정해 내려온다(카드는 조회하지 않는다) */
  canDelete: boolean
  /** 삭제 모달 열기 — 열린 모달은 화면이 하나만 붙든다 */
  onRequestDelete: () => void
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
  const actionGutter = canDelete ? 'pr-40' : 'pr-28'

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
        {/* 삭제 — admin이 아니면 여기서는 버튼 자체를 숨긴다.
            §10 진입점 원칙은 "게이트된 **화면**은 메뉴에 사유와 함께 남긴다"는 규칙인데,
            이건 카드 안 여러 액션 중 하나다. 사유를 붙인 비활성 상태는 행사 설정 ③ 탭이
            보여주므로, 진입점 둘 중 하나가 스스로 설명한다 — 원칙을 지키면서 모든 카드에
            영구히 죽은 버튼을 박아 두지 않는 자리다. */}
        {canDelete && (
          <button
            type="button"
            data-testid="card-delete"
            onClick={(e) => {
              // 카드 자체가 role="button"이라 멈추지 않으면 삭제를 누른 순간 행사로 진입한다
              e.stopPropagation()
              onRequestDelete()
            }}
            className="btn btn-ghost-negative btn-sm"
          >
            삭제
          </button>
        )}
      </div>

      {/* ① 정체 — 유형 · 일자 · 장소 + 행사명
           우측 여백은 절대배치된 액션 행을 피하는 값 — 삭제 버튼이 붙는 admin 화면에서는
           행이 한 칸 더 길어지므로 함께 넓힌다(글자와 버튼이 겹치지 않게). */}
      <div>
        <p className={`t-caption ${actionGutter}`}>
          {EVENT_TYPE_LABELS[summary.event_type]} ·{' '}
          {summary.event_date ? formatDate(summary.event_date) : '일정 미정'} ·{' '}
          {summary.venue ?? '미정'}
        </p>
        <h3 className={`t-card-title mt-1.5 ${actionGutter}`}>{summary.name}</h3>
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
