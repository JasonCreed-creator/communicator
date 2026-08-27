import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ProgressBar from '../components/internal/ProgressBar'
import StatTile from '../components/internal/StatTile'
import { activityActionLabel, activityActorLabel } from '../components/internal/activityLabels'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, formatDateTime, ddayLabel } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'

const provider = getDataProvider()

export default function HomeDashboardPage() {
  const { projectId } = useProject()
  const dashboard = useAsync(() => provider.getDashboard(projectId), [projectId])
  const inbox = useAsync(() => provider.listInbox(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId), [projectId])
  // v2.2 §19.1 — 견적 초과는 막지 않고 알린다. 홈에서 먼저 눈에 띄어야 대응이 빨라진다.
  const settlement = useAsync(() => provider.getSettlementBoard(projectId), [projectId])
  // v2.4 §10.1 — 주최형이면 미결 위젯에 파트너 검토 대기를 추가 집계한다(승인 큐와 무관한 경로라
  // approvals 기반 dashboard.pending_approvals에는 잡히지 않는다).
  const isHost = dashboard.data?.project.kind === 'host'
  const partners = useAsync(
    () => (isHost ? provider.listPartners(projectId) : Promise.resolve([])),
    [projectId, isHost],
  )
  const partnerReviewPending = (partners.data ?? []).reduce(
    (sum, p) => sum + p.submission_counts.pending_approval,
    0,
  )
  // v2.4.1 감수 M3 — 홈 미결 위젯을 '파트너 검토 대기' 목록으로 대체할 재료(파트너명·항목명·마감).
  // deliverables는 이미 이 화면이 인박스용으로 불러오던 목록이라 추가 호출 없이 파생한다.
  const partnerNameById = useMemo(
    () => new Map((partners.data ?? []).map((p) => [p.id, p.name])),
    [partners.data],
  )
  const partnerPendingItems = useMemo(() => {
    if (!isHost) return []
    return (deliverables.data ?? [])
      .filter((d) => d.partner_id && d.status === 'pending_approval')
      .map((d) => ({ deliverable: d, partnerId: d.partner_id as string }))
      .sort((a, b) => (a.deliverable.due_date ?? '9999').localeCompare(b.deliverable.due_date ?? '9999'))
  }, [isHost, deliverables.data])

  const reloadAll = () => {
    dashboard.reload()
    inbox.reload()
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="S1 · 홈" title="홈 대시보드" />

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

      {dashboard.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* v2.4.1 감수 M3 — 주최형은 '미결 컨펌'(발주처 큐 전용 개념) 대신 '파트너 검토 대기'를
              쓴다. 5타일 어색 배치 해소 — 대행형/주최형 둘 다 항상 4타일. */}
          {!isHost && <StatTile label="미결 컨펌" value={dashboard.data.pending_approvals.length} />}
          <StatTile label="지연 태스크" value={dashboard.data.wbs_delayed.length} tone="negative" />
          <StatTile label="임박" value={dashboard.data.wbs_imminent.length} tone="accent" />
          <StatTile
            label="행사 D-day"
            value={dashboard.data.project.event_date ? ddayLabel(dashboard.data.project.event_date) : '미정'}
          />
          {isHost && (
            <Link to="/partners" className="block">
              <StatTile
                label="파트너 검토 대기"
                value={partnerReviewPending}
                tone={partnerReviewPending > 0 ? 'accent' : 'default'}
              />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {dashboard.data &&
            (dashboard.data.wbs_delayed.length > 0 || dashboard.data.wbs_imminent.length > 0) && (
              <Card title="지연/임박 태스크">
                <div className="mb-3 flex flex-wrap items-center gap-4">
                  <span className="text-sm font-medium text-negative">
                    지연 {dashboard.data.wbs_delayed.length}건
                  </span>
                  <span className="text-sm font-medium text-accent-deep">
                    임박 {dashboard.data.wbs_imminent.length}건
                  </span>
                  <Link to="/schedule" className="ml-auto text-xs text-steel hover:underline">
                    일정에서 보기
                  </Link>
                </div>
                <ul className="divide-y divide-border">
                  {[...dashboard.data.wbs_delayed, ...dashboard.data.wbs_imminent].slice(0, 5).map((t) => {
                    const isDelayed = dashboard.data!.wbs_delayed.some((d) => d.id === t.id)
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-ink">
                          {isDelayed && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-negative" />}
                          <span className="mr-1 font-mono text-xs text-ink-cap">{t.code}</span>
                          {t.title}
                        </span>
                        {t.end_date && <DdayBadge isoDate={t.end_date} />}
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )}

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

          {!isHost && (
            <Card title="미결 컨펌 (기한순)">
              {dashboard.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
              {dashboard.data && dashboard.data.pending_approvals.length === 0 && (
                <p className="text-sm text-ink-cap">대기 중인 컨펌이 없습니다.</p>
              )}
              <ul className="divide-y divide-border">
                {dashboard.data?.pending_approvals.map(({ approval, deliverable }) => (
                  <li key={approval.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      to={`/items/${deliverable.id}`}
                      className="flex items-center justify-between gap-3 hover:opacity-70"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {deliverable.title}
                        </span>
                        <span className="text-xs text-ink-cap">{deliverable.category}</span>
                      </span>
                      {approval.due_at ? (
                        <DdayBadge isoDate={approval.due_at} />
                      ) : (
                        <span className="text-xs text-ink-cap">기한 미정</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isHost && (
            <Card title="파트너 검토 대기">
              {partners.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
              {!partners.loading && partnerPendingItems.length === 0 && (
                <p className="text-sm text-ink-cap">검토 대기 중인 파트너 제출이 없습니다.</p>
              )}
              <ul className="divide-y divide-border">
                {partnerPendingItems.map(({ deliverable, partnerId }) => (
                  <li key={deliverable.id} className="py-2.5 first:pt-0 last:pb-0">
                    {/* P3(3.15.1) — 항목 클릭 시 /partners로 이동하며 해당 파트너 상세가 자동
                        선택되도록 ?partner={id} 쿼리로 전달한다(PartnerBoardPage가 읽어 선택·스크롤). */}
                    <Link
                      to={`/partners?partner=${partnerId}`}
                      className="flex items-center justify-between gap-3 hover:opacity-70"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {partnerNameById.get(partnerId) ?? '알 수 없음'}
                        </span>
                        <span className="block truncate text-xs text-ink-cap">{deliverable.title}</span>
                      </span>
                      {deliverable.due_date ? (
                        <DdayBadge isoDate={deliverable.due_date} />
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
              <p className="text-sm text-ink-cap">예정된 마일스톤이 없습니다.</p>
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

        <div className="space-y-6">
          <InboxCard
            inbox={inbox.data ?? []}
            loading={inbox.loading}
            error={inbox.error}
            deliverables={deliverables.data ?? []}
            onChanged={reloadAll}
          />

          <Card title="최근 활동">
            {dashboard.data && dashboard.data.recent_activity.length === 0 && (
              <p className="text-sm text-ink-cap">활동 내역이 없습니다.</p>
            )}
            <ul className="divide-y divide-border">
              {dashboard.data?.recent_activity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm text-ink-sub">
                    <span className="text-ink-cap">{activityActorLabel(entry.actor)} · </span>
                    {activityActionLabel(entry.action)}
                  </span>
                  <span className="shrink-0 text-xs text-ink-cap">{formatDateTime(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="영역별 진행률">
            <div className="space-y-4">
              {dashboard.data?.area_progress.map((p) => (
                <div key={p.area}>
                  <p className="t-caption mb-1">{AREA_LABELS[p.area]}</p>
                  <ProgressBar done={p.done} total={p.total} />
                </div>
              ))}
            </div>
          </Card>
        </div>
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
    <Card title="미등록 인박스">
      <ErrorAlert message={error} />
      <ErrorAlert message={link.error} />
      <ErrorAlert message={dismiss.error} />
      {loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
      {!loading && inbox.length === 0 && (
        <p className="text-sm text-ink-cap">미등록 파일이 없습니다.</p>
      )}
      <ul className="space-y-3">
        {inbox.map((f) => (
          <li key={f.id} className="rounded-lg bg-canvas p-3">
            <p className="truncate text-sm font-medium text-ink">{f.file_name ?? '(파일명 없음)'}</p>
            <p className="text-xs text-ink-cap">{f.detected_folder ?? '위치 미상'}</p>
            <div className="mt-2 flex items-center gap-2">
              <select
                className="ui-input min-w-0 flex-1 text-xs"
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
