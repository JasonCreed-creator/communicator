import { useMemo, useState } from 'react'
import Card from '../components/internal/Card'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import { activityActionLabel, activityActorLabel } from '../components/internal/activityLabels'
import HomeSummaryTiles, { type SummaryTile } from '../components/home/HomeSummaryTiles'
import TodayListCard from '../components/home/TodayListCard'
import UpcomingCard, { type UpcomingEntry } from '../components/home/UpcomingCard'
import { buildTodayRows, waitingDays } from '../components/home/todayItems'
import { groupHostTasks } from '../components/partner/partnerBoardUtils'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { addDays, toIsoDate } from '../lib/wbs'
import {
  AREA_LABELS,
  WBS_DIRECTION_LABELS,
  daysUntil,
  eventDayLabel,
  formatDateTime,
  formatDateWeekday,
} from '../lib/labels'
import { getNotifyGateway } from '../lib/notify/notifyGateway'
import { getDataProvider } from '../providers'
import type { MemberRole } from '../types/enums'

const provider = getDataProvider()

/**
 * 리마인드·독촉(Phase 6 §9) — 실서버는 이 행사 Slack 채널로 목록을 보낸다(같은 대상은 한 시간에 한 번 — 서버가 막는다).
 * mock은 보내는 흉내를 내지 않고 사실을 알린다(무음 실패·가짜 성공 금지). 이메일 리마인드는 Phase 6b.
 */
export const REMIND_MOCK_NOTICE = '데모(mock)에서는 알림을 보내지 않습니다 — 실서버에서는 이 행사의 Slack 채널로 리마인드가 갑니다.'

/** '다가오는 2주' 창 — 오늘부터 14일 */
const UPCOMING_DAYS = 14
const UPCOMING_LIMIT = 8

/**
 * S1 홈 — 디자인지시서 v1.4 §7-2.5 (Phase 3.23 PR-2).
 * 위에서 아래로: 행사 정체(D-day) → 요약 5칸 → '오늘 할 일' 한 목록(급한 순, 행마다 바로 하기) →
 * 다가오는 2주 · 영역별 확정 · 최근 활동. 흩어져 있던 큐 3개·경보 띠·인박스·받은 가이드·마일스톤 카드를 목록 하나로 합쳤다.
 */
export default function HomeDashboardPage() {
  const { projectId } = useProject()
  const dashboard = useAsync(() => provider.getDashboard(projectId), [projectId])
  const inbox = useAsync(() => provider.listInbox(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId), [projectId])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const me = useAsync(() => provider.getCurrentUser(), [projectId])
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  // v2.2 §19.1 — 견적 초과는 막지 않고 알린다. 금액은 싣지 않고 버킷 이름만(정산보드에서 확인).
  const settlement = useAsync(() => provider.getSettlementBoard(projectId), [projectId])
  // v2.4 §10.1 — 주최형이면 발주처 컨펌 대신 '파트너 검토 대기'가 목록에 들어온다.
  const isHost = dashboard.data?.project.kind === 'host'
  const partners = useAsync(
    () => (isHost ? provider.listPartners(projectId) : Promise.resolve([])),
    [projectId, isHost],
  )

  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.user_id, m])), [members.data])

  const partnerPending = useMemo(() => {
    if (!isHost) return []
    const nameById = new Map((partners.data ?? []).map((p) => [p.id, p.name]))
    return (deliverables.data ?? [])
      .filter((d) => d.partner_id && d.status === 'pending_approval')
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
      .map((d) => ({ deliverable: d, partnerName: nameById.get(d.partner_id as string) ?? '알 수 없음' }))
  }, [isHost, deliverables.data, partners.data])

  const overBudget = useMemo(
    () =>
      (settlement.data?.buckets ?? [])
        .filter((b) => b.over_budget)
        .map((b) => ({ id: b.bucket.id, label: b.bucket.label })),
    [settlement.data],
  )

  const today = toIsoDate(new Date())
  const lateMilestones = useMemo(
    () => (dashboard.data?.upcoming_milestones ?? []).filter((m) => !m.done && m.due_date < today),
    [dashboard.data, today],
  )

  const rows = useMemo(() => {
    const roleOf = (userId: string | null): MemberRole | null => (userId && memberById.get(userId)?.role) || null
    const nameOf = (userId: string | null): string | null => (userId && memberById.get(userId)?.profile.name) || null
    return buildTodayRows({
      delayed: dashboard.data?.wbs_delayed ?? [],
      lateMilestones,
      imminent: dashboard.data?.wbs_imminent ?? [],
      approvals: isHost ? [] : (dashboard.data?.pending_approvals ?? []),
      partnerPending,
      overBudget,
      inbox: inbox.data ?? [],
      guides: dashboard.data?.my_requested ?? [],
      myRole: me.data?.role ?? null,
      roleOf,
      nameOf,
    })
    // 멤버가 늦게 와도 이름·역할만 채워질 뿐 목록은 즉시 렌더된다
  }, [dashboard.data, lateMilestones, isHost, partnerPending, overBudget, inbox.data, me.data, memberById])

  const upcoming = useMemo<UpcomingEntry[]>(() => {
    const until = addDays(today, UPCOMING_DAYS)
    const inWindow = (d: string | null) => !!d && d >= today && d <= until
    const tasks = groupHostTasks(wbsTasks.data ?? [], deliverables.data ?? [])
      .filter((g) => !g.done && inWindow(g.end_date))
      .map<UpcomingEntry>((g) => ({
        key: `wbs:${g.code}`,
        date: g.end_date as string,
        title: `${g.code} ${g.title}`,
        kind: isHost ? WBS_DIRECTION_LABELS[g.direction] : '일정',
        mark: g.direction,
      }))
    const milestones = (dashboard.data?.upcoming_milestones ?? [])
      .filter((m) => !m.done && inWindow(m.due_date))
      .map<UpcomingEntry>((m) => ({
        key: `ms:${m.id}`,
        date: m.due_date,
        title: m.title,
        kind: `마일스톤 · ${m.area ? AREA_LABELS[m.area] : '전체'}`,
        mark: 'milestone',
      }))
    return [...milestones, ...tasks]
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || (a.mark === 'milestone' ? -1 : 0) - (b.mark === 'milestone' ? -1 : 0),
      )
      .slice(0, UPCOMING_LIMIT)
  }, [wbsTasks.data, deliverables.data, dashboard.data, isHost, today])

  const areaTotals = (dashboard.data?.area_progress ?? []).reduce(
    (acc, p) => ({ done: acc.done + p.done, total: acc.total + p.total }),
    { done: 0, total: 0 },
  )

  const tiles = useMemo<SummaryTile[]>(() => {
    const delayed = dashboard.data?.wbs_delayed ?? []
    const imminent = dashboard.data?.wbs_imminent ?? []
    const approvals = dashboard.data?.pending_approvals ?? []
    const oldest = delayed[0]?.end_date
    const waiting: SummaryTile = isHost
      ? {
          key: 'waiting',
          label: '파트너 검토 대기',
          value: partnerPending.length,
          note:
            partnerPending.length === 0
              ? '없음'
              : partnerPending.length === 1
                ? partnerPending[0].partnerName
                : `${partnerPending[0].partnerName} 외 ${partnerPending.length - 1}곳`,
        }
      : {
          key: 'waiting',
          label: '발주처 답 대기',
          value: approvals.length,
          note: approvals[0]
            ? `${approvals[0].deliverable.title} · ${waitingDays(approvals[0].approval.requested_at)}일째`
            : '없음',
        }
    return [
      {
        key: 'delayed',
        label: '지연',
        value: delayed.length,
        note: oldest ? `가장 오래 ${-daysUntil(oldest)}일 지남` : '없음',
        alertWhenPositive: true,
      },
      { key: 'imminent', label: '마감 임박', value: imminent.length, note: imminent.length ? '3일 안 마감' : '없음' },
      waiting,
      {
        key: 'settlement',
        label: '정산 확인',
        value: overBudget.length,
        note: !settlement.data ? '정산보드 없음' : overBudget.length ? '견적 초과 버킷' : '초과 없음',
      },
      { key: 'inbox', label: '미등록 파일', value: (inbox.data ?? []).length, note: 'Drive에 직접 올린 파일' },
    ]
  }, [dashboard.data, isHost, partnerPending, overBudget, settlement.data, inbox.data])

  // 리마인드(지연 전부) · 독촉(컨펌 대기 전부) — 결과·안내는 목록 머리 아래 한 곳에
  const [remindNotice, setRemindNotice] = useState<string | null>(null)
  const [remindBusy, setRemindBusy] = useState(false)
  const remind = async (target: 'delayed' | 'approval') => {
    const gateway = getNotifyGateway()
    if (gateway.mode !== 'server') {
      setRemindNotice(REMIND_MOCK_NOTICE)
      return
    }
    setRemindBusy(true)
    setRemindNotice(null)
    try {
      const r = await gateway.client.remind(projectId, target)
      setRemindNotice(
        r.sent
          ? `Slack으로 보냈습니다 — ${target === 'delayed' ? '지연 태스크' : '컨펌 대기'} ${r.total}건.`
          : `보낼 ${target === 'delayed' ? '지연 태스크' : '컨펌 대기'}가 없습니다.`,
      )
    } catch (e) {
      setRemindNotice(e instanceof Error ? e.message : '리마인드를 보내지 못했습니다.')
    } finally {
      setRemindBusy(false)
    }
  }

  const reloadInbox = () => {
    dashboard.reload()
    inbox.reload()
  }

  const project = dashboard.data?.project
  const listLoading = dashboard.loading && !dashboard.data

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="운영"
        title="홈 대시보드"
        action={
          project && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-ink">{project.name}</p>
                <p className="t-caption mt-0.5">
                  {[
                    project.event_date ? formatDateWeekday(project.event_date) : null,
                    project.venue,
                    `확정 ${areaTotals.done}/${areaTotals.total}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {/* 행사 D-day — 매일 보는 유일한 상수. 헤더 우측 단일 pill */}
              <span
                data-testid="event-dday"
                className="inline-flex h-11 shrink-0 items-center rounded-full bg-dark px-[18px] text-[20px] font-semibold tracking-[-0.01em] text-dark-ink"
              >
                {project.event_date ? eventDayLabel(project.event_date) : '일정 미정'}
              </span>
            </div>
          )
        }
      />

      <ErrorAlert message={dashboard.error} />
      <ErrorAlert message={inbox.error} />

      <HomeSummaryTiles tiles={tiles} />

      <TodayListCard
        projectId={projectId}
        rows={rows}
        loading={listLoading}
        isHost={isHost}
        deliverables={deliverables.data ?? []}
        onInboxChanged={reloadInbox}
        onRemind={(t) => void remind(t)}
        remindBusy={remindBusy}
        remindNotice={remindNotice}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UpcomingCard entries={upcoming} />
        </div>

        <div className="space-y-4">
          <Card title="영역별 확정">
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
            <ul className="space-y-2.5">
              {dashboard.data?.recent_activity.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5">
                  <span className="text-[13px] leading-[18px] text-ink">
                    <span className="font-semibold">{activityActorLabel(entry.actor)}</span>{' '}
                    {activityActionLabel(entry.action)}
                  </span>
                  <span className="t-caption">{formatDateTime(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </section>
  )
}
