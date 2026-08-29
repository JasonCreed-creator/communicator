import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ActionQueueCard from '../components/home/ActionQueueCard'
import DeadlineStripCard from '../components/home/DeadlineStripCard'
import {
  approvalToQueueItem,
  deadlineWindow,
  partnerItemToQueueItem,
  wbsTaskToQueueItem,
  type QueueItem,
} from '../components/home/queueItems'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import TableSkeleton from '../components/internal/TableSkeleton'
import { activityActionLabel, activityActorLabel } from '../components/internal/activityLabels'
import { groupHostTasks } from '../components/partner/partnerBoardUtils'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, formatDate, formatDateTime, ddayLabel } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'
import type { MemberRole } from '../types/enums'

const provider = getDataProvider()

/** 알림 발송(리마인드·독촉)은 Phase 6 범위 — 버튼을 숨기지 않고 무엇이 준비 중인지 알린다. */
const REMIND_NOTICE = '알림 발송은 준비 중입니다(Slack·이메일 연동 예정) — 지금은 담당자에게 직접 전달해 주세요.'

export default function HomeDashboardPage() {
  const { projectId } = useProject()
  const dashboard = useAsync(() => provider.getDashboard(projectId), [projectId])
  const inbox = useAsync(() => provider.listInbox(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId), [projectId])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  // D-day 스트립 재료 — 마감 타임라인은 WBS 태스크를 code 단위로 묶어 그린다(S-11 컴포넌트 재사용).
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  // v2.2 §19.1 — 견적 초과는 막지 않고 알린다. 홈에서 먼저 눈에 띄어야 대응이 빨라진다.
  const settlement = useAsync(() => provider.getSettlementBoard(projectId), [projectId])
  // v2.4 §10.1 — 주최형이면 미결 큐가 '파트너 검토 대기'로 대체된다(승인 큐와 무관한 경로라
  // approvals 기반 dashboard.pending_approvals에는 잡히지 않는다).
  const isHost = dashboard.data?.project.kind === 'host'
  const partners = useAsync(
    () => (isHost ? provider.listPartners(projectId) : Promise.resolve([])),
    [projectId, isHost],
  )
  const partnerNameById = useMemo(
    () => new Map((partners.data ?? []).map((p) => [p.id, p.name])),
    [partners.data],
  )
  const partnerPendingItems = useMemo<QueueItem[]>(() => {
    if (!isHost) return []
    return (deliverables.data ?? [])
      .filter((d) => d.partner_id && d.status === 'pending_approval')
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
      .map((d) => partnerItemToQueueItem(d, partnerNameById.get(d.partner_id as string) ?? '알 수 없음'))
  }, [isHost, deliverables.data, partnerNameById])

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.user_id, m])),
    [members.data],
  )
  const roleOf = (userId: string | null): MemberRole | null =>
    (userId && memberById.get(userId)?.role) || null
  const nameOf = (userId: string | null): string | null =>
    (userId && memberById.get(userId)?.profile.name) || null

  const delayedItems = useMemo<QueueItem[]>(
    () => (dashboard.data?.wbs_delayed ?? []).map(wbsTaskToQueueItem),
    [dashboard.data],
  )
  const imminentItems = useMemo<QueueItem[]>(
    () => (dashboard.data?.wbs_imminent ?? []).map(wbsTaskToQueueItem),
    [dashboard.data],
  )
  const approvalItems = useMemo<QueueItem[]>(
    () => (dashboard.data?.pending_approvals ?? []).map((p) => approvalToQueueItem(p, roleOf, nameOf)),
    // memberById가 늦게 도착해도 이름·역할만 채워질 뿐 목록 자체는 즉시 렌더된다
    [dashboard.data, memberById],
  )

  const deadlineGroups = useMemo(
    () => deadlineWindow(groupHostTasks(wbsTasks.data ?? [], deliverables.data ?? [])),
    [wbsTasks.data, deliverables.data],
  )

  const areaTotals = (dashboard.data?.area_progress ?? []).reduce(
    (acc, p) => ({ done: acc.done + p.done, total: acc.total + p.total }),
    { done: 0, total: 0 },
  )

  // 어느 큐에서 눌렀는지 기억해 그 히어로 안에만 안내를 띄운다(같은 문구가 두 곳에 겹치지 않게).
  const [remindTarget, setRemindTarget] = useState<'delayed' | 'approval' | null>(null)
  const noticeFor = (target: 'delayed' | 'approval') =>
    remindTarget === target ? (
      <p
        role="status"
        className="mt-2.5 rounded-md border border-border bg-steel-tint px-2.5 py-2 text-xs text-steel"
      >
        {REMIND_NOTICE}
      </p>
    ) : null

  const reloadAll = () => {
    dashboard.reload()
    inbox.reload()
  }

  const project = dashboard.data?.project

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="S1 · 홈"
        title="홈 대시보드"
        action={
          project && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="t-caption">
                  {project.name}
                  {project.event_date ? ` · ${formatDate(project.event_date)}` : ''}
                </p>
                <p className="mt-1 text-sm text-ink-sub">
                  전체 진행{' '}
                  <span className="font-semibold text-ink">
                    {areaTotals.done}/{areaTotals.total}
                  </span>
                </p>
              </div>
              {/* 행사 D-day — 매일 보는 유일한 상수. 헤더 우측 단일 pill로 승격(시안) */}
              <span
                data-testid="event-dday"
                className="inline-flex h-11 shrink-0 items-center rounded-full bg-dark px-[18px] text-[20px] font-semibold tracking-[-0.01em] text-dark-ink"
              >
                {project.event_date ? ddayLabel(project.event_date) : '일정 미정'}
              </span>
            </div>
          )
        }
      />

      <ErrorAlert message={dashboard.error} />

      {/* 정산 초과 경보 — 금액은 싣지 않고 건수만 알린다(S-10에서 확인) */}
      {settlement.data && settlement.data.totals.overBudgetCount > 0 && (
        <Link
          to="/settlement"
          className="flex items-center justify-between gap-3 rounded-[12px] border border-negative bg-negative-tint px-4 py-3"
        >
          <span className="text-sm font-medium text-negative">
            정산 · 견적 초과 버킷 {settlement.data.totals.overBudgetCount}건
          </span>
          <span className="text-xs text-negative">정산보드에서 보기 →</span>
        </Link>
      )}

      {/* 3분할 액션 큐 — 숫자 나열(KPI 4타일) 대신 처리 가능한 큐. 건수는 각 헤더 배지가 말한다 */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <ActionQueueCard
          title="지연"
          tone="negative"
          badgeLevel="blocked"
          items={delayedItems}
          loading={dashboard.loading}
          emptyMessage="지연된 태스크가 없습니다."
          heroActions={
            <>
              {/* 화면 전체에서 유일한 accent CTA — 가장 오래된 지연 건 (패턴 §05) */}
              <button
                type="button"
                onClick={() => setRemindTarget('delayed')}
                className="btn btn-accent flex-1"
              >
                담당에게 리마인드
              </button>
              <Link to={delayedItems[0]?.to ?? '/schedule'} className="btn btn-ghost">
                열기
              </Link>
            </>
          }
          heroNotice={noticeFor('delayed')}
          moreTo="/schedule"
          moreLabel="일정에서 전체 보기"
        />

        <ActionQueueCard
          title="임박"
          tone="accent"
          badgeLevel="attention"
          items={imminentItems}
          loading={dashboard.loading}
          emptyMessage="마감이 임박한 태스크가 없습니다."
          heroActions={
            <Link to={imminentItems[0]?.to ?? '/schedule'} className="btn btn-ghost flex-1">
              열기
            </Link>
          }
          moreTo="/schedule"
          moreLabel="일정에서 전체 보기"
        />

        {/* 세 번째 큐는 행사 성격(kind)에 따라 갈린다 — 성격을 알기 전에 잘못된 제목을 잠깐
            보여주지 않도록 대시보드 로드 전에는 스켈레톤을 세운다(패턴 §06 ①) */}
        {!dashboard.data ? (
          <div className="ui-card p-5">
            <TableSkeleton rows={4} columns={2} />
          </div>
        ) : isHost ? (
          <ActionQueueCard
            title="파트너 검토 대기"
            tone="neutral"
            badgeLevel="attention"
            badgeDot
            items={partnerPendingItems}
            loading={partners.loading || deliverables.loading}
            emptyMessage="검토 대기 중인 파트너 제출이 없습니다."
            heroActions={
              <Link
                to={partnerPendingItems[0]?.to ?? '/partners'}
                className="btn btn-ghost flex-1"
              >
                검토 열기
              </Link>
            }
            moreTo="/partners"
            moreLabel="파트너 보드에서 전체 보기"
          />
        ) : (
          <ActionQueueCard
            title="미결 컨펌"
            tone="neutral"
            badgeLevel="attention"
            badgeDot
            items={approvalItems}
            loading={dashboard.loading}
            emptyMessage="대기 중인 컨펌이 없습니다."
            heroActions={
              <>
                <button
                  type="button"
                  onClick={() => setRemindTarget('approval')}
                  className="btn btn-ghost flex-1"
                >
                  컨펌 독촉
                </button>
                <Link to={approvalItems[0]?.to ?? '/board/design'} className="btn btn-ghost">
                  열기
                </Link>
              </>
            }
            heroNotice={noticeFor('approval')}
            moreTo="/board/design"
            moreLabel="디자인 보드에서 전체 보기"
          />
        )}
      </div>

      {/* D-day 스트립 — 전체 폭. S-11 마감 타임라인 재사용(overflow-x:auto 유지) */}
      <DeadlineStripCard groups={deadlineGroups} />

      {/* 보조 3열 — 큐 아래로 내린다 */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <Card title="영역별 진행률">
          <div className="space-y-4">
            {dashboard.data?.area_progress.map((p) => (
              <div key={p.area}>
                <p className="t-caption mb-1.5">{AREA_LABELS[p.area]}</p>
                <ProgressBar done={p.done} total={p.total} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="최근 활동">
          {dashboard.data && dashboard.data.recent_activity.length === 0 && (
            <EmptyState message="활동 내역이 없습니다." />
          )}
          <ul className="divide-y divide-border">
            {dashboard.data?.recent_activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 truncate text-sm text-ink-sub">
                  <span className="text-ink-cap">{activityActorLabel(entry.actor)} · </span>
                  {activityActionLabel(entry.action)}
                </span>
                <span className="shrink-0 text-xs text-ink-cap">{formatDateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <InboxCard
          inbox={inbox.data ?? []}
          loading={inbox.loading}
          error={inbox.error}
          deliverables={deliverables.data ?? []}
          onChanged={reloadAll}
        />

        {dashboard.data && dashboard.data.my_requested.length > 0 && (
          <Card title="받은 가이드">
            <ul className="divide-y divide-border">
              {dashboard.data.my_requested.map((d) => (
                <li key={d.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link to={`/items/${d.id}`} className="flex items-center justify-between gap-3 hover:opacity-70">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{d.title}</span>
                      <span className="text-xs text-ink-cap">{d.category}</span>
                    </span>
                    {d.due_date ? (
                      <DdayBadge isoDate={d.due_date} />
                    ) : (
                      <span className="text-xs text-ink-cap">마감 미정</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="다가오는 마일스톤">
          {dashboard.data && dashboard.data.upcoming_milestones.length === 0 && (
            <EmptyState message="예정된 마일스톤이 없습니다." />
          )}
          <ul className="divide-y divide-border">
            {dashboard.data?.upcoming_milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{m.title}</span>
                  <span className="text-xs text-ink-cap">{m.area ? AREA_LABELS[m.area] : '전체'}</span>
                </span>
                <DdayBadge isoDate={m.due_date} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  )
}

interface InboxCardProps {
  inbox: import('../types/entities').UnregisteredFile[]
  loading: boolean
  error: string | null
  deliverables: Deliverable[]
  onChanged: () => void
}

function InboxCard({ inbox, loading, error, deliverables, onChanged }: InboxCardProps) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const link = useMutation((inboxId: string, deliverableId: string) =>
    provider.linkInboxFile(inboxId, deliverableId),
  )
  const dismiss = useMutation((inboxId: string) => provider.dismissInboxFile(inboxId))

  const handleLink = async (inboxId: string) => {
    const deliverableId = selected[inboxId]
    if (!deliverableId) {
      link.setError('연결할 항목을 선택하세요.')
      return
    }
    const result = await link.run(inboxId, deliverableId)
    if (result) onChanged()
  }

  const handleDismiss = async (inboxId: string) => {
    const result = await dismiss.run(inboxId)
    if (result !== undefined) onChanged()
  }

  return (
    <Card
      title="미등록 인박스"
      action={
        <span className="inline-flex shrink-0 items-center rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
          {inbox.length}
        </span>
      }
    >
      <ErrorAlert message={error} />
      <ErrorAlert message={link.error} />
      <ErrorAlert message={dismiss.error} />
      {loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
      {!loading && inbox.length === 0 && <EmptyState message="미등록 파일이 없습니다." />}
      <ul className="space-y-3">
        {inbox.map((f) => (
          <li key={f.id} className="rounded-lg border border-border bg-canvas p-3">
            <p className="truncate text-sm font-medium text-ink">{f.file_name ?? '(파일명 없음)'}</p>
            <p className="text-xs text-ink-cap">{f.detected_folder ?? '위치 미상'}</p>
            <div className="mt-2 flex items-center gap-2">
              <select
                className="ui-input ui-select min-w-0 flex-1 text-xs"
                value={selected[f.id] ?? ''}
                onChange={(e) => setSelected((s) => ({ ...s, [f.id]: e.target.value }))}
              >
                <option value="">항목 선택…</option>
                {deliverables.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{AREA_LABELS[d.area]}] {d.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleLink(f.id)}
                disabled={link.pending}
                className="btn btn-primary btn-sm shrink-0"
              >
                연결
              </button>
              <button
                type="button"
                onClick={() => handleDismiss(f.id)}
                disabled={dismiss.pending}
                className="btn btn-ghost btn-sm shrink-0"
              >
                무시
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
