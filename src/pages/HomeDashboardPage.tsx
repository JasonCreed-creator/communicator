import { useState } from 'react'
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

  const reloadAll = () => {
    dashboard.reload()
    inbox.reload()
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="S1 · 홈" title="홈 대시보드" />

      <ErrorAlert message={dashboard.error} />

      {dashboard.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="미결 컨펌" value={dashboard.data.pending_approvals.length} />
          <StatTile label="지연 태스크" value={dashboard.data.wbs_delayed.length} tone="negative" />
          <StatTile label="임박" value={dashboard.data.wbs_imminent.length} tone="accent" />
          <StatTile
            label="행사 D-day"
            value={dashboard.data.project.event_date ? ddayLabel(dashboard.data.project.event_date) : '미정'}
          />
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
