// S-1 행사 목록 — 설계서 v1.5 §10 · 디자인지시서 v1.4 §7-2.9 (Phase 3.23 PR-5 · 캔버스 행사 목록).
// 진단 "행사가 많아지면 무엇부터 봐야 할지 안 보인다" → 세 묶음:
//   ① 먼저 확인할 행사 — 세팅이 덜 끝난 행사(이어서 세팅하기) · 행사일이 지났는데 진행 중인 행사(종료하기)
//   ② 진행 중 — 행사일이 가까운 순 카드(정체 · D-day + 확정 진행률 · 확인할 것 · PM)
//   ③ 종료된 행사 — 접힘 기본
// 드물게 쓰는 동작(행사 설정 열기 · 종료 · 재개 · 삭제)은 카드의 ⋯ 메뉴로 모았다(카드 머리의 버튼 줄 대신).
// 삭제 권한 = 전역 app_role='admin'(v2.8 §4-1c) — admin이 아니면 메뉴에 삭제가 없다(행사 설정 ③이 사유와 함께 잠김을 보인다).
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import ActionMenu, { type ActionMenuItem } from '../components/internal/ActionMenu'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import { LevelBadge } from '../components/internal/StatusBadge'
import DeleteProjectDialog, { canDeleteProject } from '../components/settings/DeleteProjectDialog'
import { missingRequired } from '../components/settings/requiredFields'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { EVENT_TYPE_LABELS, STATUS_LEVEL_STRIP_CLASSES, daysUntil, eventDayLabel, formatDateWeekday } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { ProjectSummary } from '../types/views'

const provider = getDataProvider()

/** 행사일이 가까운 순 — 날짜 없는 행사는 뒤, 같으면 이름 순 */
function byEventDate(a: ProjectSummary, b: ProjectSummary): number {
  const da = a.event_date ?? '9999-12-31'
  const db = b.event_date ?? '9999-12-31'
  return da !== db ? (da < db ? -1 : 1) : a.name.localeCompare(b.name, 'ko')
}

export default function ProjectListPage() {
  const { projectId, setProject, summaries, reloadSummaries } = useProject()
  const navigate = useNavigate()
  const [showClosed, setShowClosed] = useState(false)
  const createMutation = useMutation(() => provider.createProject({}))
  const closeMutation = useMutation((args: { id: string; closed: boolean }) => provider.closeProject(args.id, args.closed))
  // 권한은 화면에서 한 번만 읽어 카드에 내린다 — 카드마다 getCurrentUser()를 부르면 행사 수만큼 같은 조회가 반복된다
  const me = useAsync(() => provider.getCurrentUser(), [])
  const canDelete = !!me.data && canDeleteProject(me.data)
  // 열린 삭제 모달은 화면이 하나만 붙든다
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)

  const { setup, past, upcoming, closed } = useMemo(() => {
    const active = summaries.filter((s) => s.status === 'active')
    return {
      setup: active.filter((s) => !s.onboarded).sort(byEventDate),
      past: active.filter((s) => s.onboarded && !!s.event_date && daysUntil(s.event_date) < 0).sort(byEventDate),
      upcoming: active.filter((s) => s.onboarded && !(s.event_date && daysUntil(s.event_date) < 0)).sort(byEventDate),
      closed: summaries.filter((s) => s.status === 'closed').sort(byEventDate),
    }
  }, [summaries])

  const handleCreate = async () => {
    const created = await createMutation.run()
    if (!created) return
    reloadSummaries()
    setProject(created.id)
    navigate('/onboarding')
  }

  const open = (s: ProjectSummary) => {
    setProject(s.id)
    navigate(s.status === 'active' && !s.onboarded ? '/settings' : '/home')
  }
  const openSettings = (s: ProjectSummary) => {
    setProject(s.id)
    navigate('/settings')
  }
  const continueSetup = (s: ProjectSummary) => {
    setProject(s.id)
    navigate('/onboarding')
  }
  const setClosed = async (s: ProjectSummary, value: boolean) => {
    if (await closeMutation.run({ id: s.id, closed: value })) reloadSummaries()
  }

  const menuFor = (s: ProjectSummary): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [{ label: '행사 설정 열기', onSelect: () => openSettings(s) }]
    items.push(
      s.status === 'closed'
        ? { label: '재개하기', onSelect: () => void setClosed(s, false) }
        : { label: '종료하기', onSelect: () => void setClosed(s, true) },
    )
    if (canDelete) {
      items.push({ label: '삭제…', onSelect: () => setPendingDelete(s), danger: true, note: '관리자만 · 되돌릴 수 없음', testId: 'card-delete' })
    }
    return items
  }

  const attention = [...setup, ...past]

  return (
    <section className="space-y-7 p-6">
      <PageHeader
        caption="전체"
        title="행사 목록"
        action={
          <>
            <span className="t-caption">가까운 날짜 순</span>
            <button type="button" onClick={handleCreate} disabled={createMutation.pending} className="btn btn-accent">
              ＋ 새 행사 만들기
            </button>
          </>
        }
      />
      <ErrorAlert message={createMutation.error ?? closeMutation.error} />

      {attention.length > 0 && (
        <section aria-label="먼저 확인할 행사" className="space-y-2.5">
          <GroupHeading title="먼저 확인할 행사" count={attention.length} />
          <div className="ui-card overflow-hidden">
            {setup.map((s) => (
              <AttentionRow
                key={s.id}
                summary={s}
                kind="setup"
                isCurrent={s.id === projectId}
                onOpen={() => open(s)}
                action={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      continueSetup(s)
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    이어서 세팅하기
                  </button>
                }
              />
            ))}
            {past.map((s) => (
              <AttentionRow
                key={s.id}
                summary={s}
                kind="past"
                isCurrent={s.id === projectId}
                onOpen={() => open(s)}
                action={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void setClosed(s, true)
                    }}
                    disabled={closeMutation.pending}
                    className="btn btn-ghost btn-sm"
                  >
                    종료하기
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="진행 중" className="space-y-2.5">
        <GroupHeading title="진행 중" count={upcoming.length} note="행사일이 가까운 순" />
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-cap">
            진행 중인 행사가 없습니다{attention.length > 0 ? ' — 위의 먼저 확인할 행사를 정리하면 여기에 옵니다.' : '.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((s) => (
              <ProjectCard key={s.id} summary={s} isCurrent={s.id === projectId} onOpen={() => open(s)} menu={menuFor(s)} />
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section aria-label="종료된 행사" className="space-y-3">
          <button type="button" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed} className="btn btn-ghost btn-sm">
            {showClosed ? '종료된 행사 접기' : `종료된 행사 ${closed.length}`}
          </button>
          {/* 종료 행사도 지울 수 있다 — 종료는 삭제의 선행 조건이 아니다(§4-1c 결정 2) */}
          {showClosed && (
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {closed.map((s) => (
                <ProjectCard key={s.id} summary={s} isCurrent={s.id === projectId} closed onOpen={() => open(s)} menu={menuFor(s)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 삭제 확인은 모달이 전담한다(행사명 타이핑·오류 표시 포함). 성공 후 목록만 다시 읽는다 —
          지운 행사가 현재 행사였거나 마지막 행사였어도 ProjectContext가 스스로 되잡는다. */}
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

function GroupHeading({ title, count, note }: { title: string; count: number; note?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="t-card-title">{title}</h2>
      <span className="t-caption">
        {count}
        {note ? ` · ${note}` : ''}
      </span>
    </div>
  )
}

/** 카드·줄 전체가 행사로 들어가는 자리 — Enter·Space도 같다 */
function openKeys(onOpen: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
}

/** 행사 한 줄 정체 — 유형 · 요일 날짜 · 장소 · PM */
function identity(s: ProjectSummary): string {
  return [
    EVENT_TYPE_LABELS[s.event_type],
    s.event_date ? formatDateWeekday(s.event_date) : '일정 미정',
    s.venue ?? '장소 미정',
    `PM ${s.pm_name ?? '미지정'}`,
  ].join(' · ')
}

// ── 먼저 확인할 행사 한 줄 ─────────────────────────────────────────────────
function AttentionRow({
  summary: s,
  kind,
  isCurrent,
  onOpen,
  action,
}: {
  summary: ProjectSummary
  kind: 'setup' | 'past'
  isCurrent: boolean
  onOpen: () => void
  action: ReactNode
}) {
  const missing = missingRequired(s)
  const days = s.event_date ? daysUntil(s.event_date) : null
  const description =
    kind === 'setup'
      ? missing.length > 0
        ? `필수 ${missing.length}개 남음 — ${missing.map((f) => f.label).join(' · ')}`
        : '필수 항목은 다 들어 있습니다 — 담당자 배정과 유형 확인이 남았어요.'
      : '행사가 끝났다면 종료해서 진행 목록에서 내리세요. 종료해도 자료는 그대로 남습니다.'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={openKeys(onOpen)}
      data-testid={kind === 'setup' ? 'setup-row' : 'past-row'}
      data-project-id={s.id}
      className="relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-3.5 pl-[17px] pr-5 last:border-b-0 hover:bg-canvas"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_LEVEL_STRIP_CLASSES[kind === 'setup' ? 'attention' : 'neutral']}`}
      />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {kind === 'setup' ? (
            <LevelBadge level="attention" label={`세팅 ${s.onboarding_steps_done}/3단계`} />
          ) : (
            <LevelBadge level="neutral" label="행사일 지남" />
          )}
          <span className="text-sm font-semibold text-ink">{s.name}</span>
          {isCurrent && <LevelBadge level="attention" label="지금 보는 행사" />}
          <span className="t-caption">{identity(s)}</span>
        </div>
        <p className="text-sm text-ink-sub">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        {days !== null && (
          <span
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
              days < 0 ? 'bg-negative-tint text-negative' : 'bg-track text-ink-sub'
            }`}
          >
            {eventDayLabel(s.event_date!)}
          </span>
        )}
        {action}
      </div>
    </div>
  )
}

// ── 진행 중 · 종료 카드 ──────────────────────────────────────────────────
function ProjectCard({
  summary: s,
  isCurrent,
  closed = false,
  onOpen,
  menu,
}: {
  summary: ProjectSummary
  isCurrent: boolean
  closed?: boolean
  onOpen: () => void
  menu: ActionMenuItem[]
}) {
  const dday = s.event_date ? eventDayLabel(s.event_date) : '일정 미정'
  const quiet = s.pending_approvals === 0 && s.delayed_tasks === 0
  const waitingLabel = s.kind === 'host' ? '검토 대기' : '발주처 답 대기'
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={openKeys(onOpen)}
      data-testid="project-card"
      data-project-id={s.id}
      aria-current={isCurrent ? 'true' : undefined}
      className={`ui-card flex cursor-pointer flex-col gap-3 px-5 py-[18px] transition-shadow hover:shadow-md ${
        isCurrent ? 'border-accent ring-1 ring-accent' : ''
      } ${closed ? 'opacity-75' : ''}`}
    >
      <div className="flex h-7 items-center justify-between gap-2">
        <span className="t-caption truncate">
          {EVENT_TYPE_LABELS[s.event_type]} · {s.event_date ? formatDateWeekday(s.event_date) : '일정 미정'}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isCurrent && (
            <span data-testid="current-badge">
              <LevelBadge level="attention" label="지금 보는 행사" />
            </span>
          )}
          <ActionMenu label={`행사 메뉴 ${s.name}`} items={menu} width={212} />
        </span>
      </div>
      <div className="space-y-0.5">
        <h3 className="t-card-title">{s.name}</h3>
        <p className="t-caption text-ink-sub">
          {s.venue ?? '장소 미정'}
          {s.expected_headcount != null && ` · 예상 ${s.expected_headcount.toLocaleString('ko-KR')}명`}
        </p>
      </div>
      <div className="flex items-center gap-3.5">
        <span
          data-testid="card-dday"
          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[15px] font-bold leading-5 ${
            closed ? 'bg-track text-ink-sub' : 'bg-dark text-dark-ink'
          }`}
        >
          {closed ? '종료' : dday}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <ProgressBar done={s.finals} total={s.deliverable_total} hideValue />
          <p className="t-caption">
            확정 {s.finals}/{s.deliverable_total}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span data-testid="card-signals" className="flex flex-wrap gap-1.5">
          {quiet ? (
            <LevelBadge level="neutral" label="확인할 것 없음" />
          ) : (
            <>
              {s.pending_approvals > 0 && <LevelBadge level="attention" label={`${waitingLabel} ${s.pending_approvals}`} dot />}
              {s.delayed_tasks > 0 && <LevelBadge level="blocked" label={`지연 ${s.delayed_tasks}`} />}
            </>
          )}
        </span>
        <span className="t-caption shrink-0">PM {s.pm_name ?? '미지정'}</span>
      </div>
    </article>
  )
}
