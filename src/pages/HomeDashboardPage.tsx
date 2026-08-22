import { useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import ProgressBar from '../components/internal/ProgressBar'
import StatTile from '../components/internal/StatTile'
import { activityActionLabel, activityActorLabel } from '../components/internal/activityLabels'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, formatDateTime, ddayLabel } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'

const provider = getDataProvider()

export default function HomeDashboardPage() {
  const dashboard = useAsync(() => provider.getDashboard(PROJECT_ID), [])
  const inbox = useAsync(() => provider.listInbox(PROJECT_ID), [])
  const deliverables = useAsync(() => provider.listDeliverables(PROJECT_ID), [])

  const reloadAll = () => {
    dashboard.reload()
    inbox.reload()
  }

  return (
    <section className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs text-gray-400">S1</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">홈 대시보드</h1>
      </div>

      <ErrorAlert message={dashboard.error} />

      {dashboard.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="행사 D-day"
            value={dashboard.data.project.event_date ? ddayLabel(dashboard.data.project.event_date) : '미정'}
          />
          <StatTile label="미결 컨펌" value={dashboard.data.pending_approvals.length} />
          <StatTile label="인박스" value={dashboard.data.inbox_count} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {dashboard.data &&
            (dashboard.data.wbs_delayed.length > 0 || dashboard.data.wbs_imminent.length > 0) && (
              <Card title="지연/임박 태스크">
                <div className="mb-3 flex flex-wrap items-center gap-4">
                  <span className="text-sm font-medium text-red-700">
                    지연 {dashboard.data.wbs_delayed.length}건
                  </span>
                  <span className="text-sm font-medium text-amber-700">
                    임박 {dashboard.data.wbs_imminent.length}건
                  </span>
                  <Link to="/schedule" className="ml-auto text-xs text-blue-600 hover:underline">
                    일정에서 보기
                  </Link>
                </div>
                <ul className="divide-y divide-gray-100">
                  {[...dashboard.data.wbs_delayed, ...dashboard.data.wbs_imminent].slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <span className="min-w-0 truncate text-sm text-gray-900">
                        <span className="mr-1.5 font-mono text-xs text-gray-400">{t.code}</span>
                        {t.title}
                      </span>
                      {t.end_date && <DdayBadge isoDate={t.end_date} />}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

          {dashboard.data && dashboard.data.my_requested.length > 0 && (
            <Card title="받은 지시">
              <ul className="divide-y divide-gray-100">
                {dashboard.data.my_requested.map((d) => (
                  <li key={d.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link to={`/items/${d.id}`} className="flex items-center justify-between gap-3 hover:opacity-70">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{d.title}</span>
                        <span className="text-xs text-gray-500">{d.category}</span>
                      </span>
                      {d.due_date ? (
                        <DdayBadge isoDate={d.due_date} />
                      ) : (
                        <span className="text-xs text-gray-400">마감 미정</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="미결 컨펌 (기한순)">
            {dashboard.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
            {dashboard.data && dashboard.data.pending_approvals.length === 0 && (
              <p className="text-sm text-gray-400">대기 중인 컨펌이 없습니다.</p>
            )}
            <ul className="divide-y divide-gray-100">
              {dashboard.data?.pending_approvals.map(({ approval, deliverable }) => (
                <li key={approval.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    to={`/items/${deliverable.id}`}
                    className="flex items-center justify-between gap-3 hover:opacity-70"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {deliverable.title}
                      </span>
                      <span className="text-xs text-gray-500">{deliverable.category}</span>
                    </span>
                    {approval.due_at ? (
                      <DdayBadge isoDate={approval.due_at} />
                    ) : (
                      <span className="text-xs text-gray-400">기한 미정</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="다가오는 마일스톤">
            {dashboard.data && dashboard.data.upcoming_milestones.length === 0 && (
              <p className="text-sm text-gray-400">예정된 마일스톤이 없습니다.</p>
            )}
            <ul className="divide-y divide-gray-100">
              {dashboard.data?.upcoming_milestones.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{m.title}</span>
                    <span className="text-xs text-gray-500">{m.area ? AREA_LABELS[m.area] : '전체'}</span>
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

          <Card title="영역별 진행률">
            <div className="space-y-4">
              {dashboard.data?.area_progress.map((p) => (
                <div key={p.area}>
                  <p className="mb-1 text-xs text-gray-500">{AREA_LABELS[p.area]}</p>
                  <ProgressBar done={p.done} total={p.total} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="최근 활동">
        {dashboard.data && dashboard.data.recent_activity.length === 0 && (
          <p className="text-sm text-gray-400">활동 내역이 없습니다.</p>
        )}
        <ul className="divide-y divide-gray-100">
          {dashboard.data?.recent_activity.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="text-sm text-gray-700">
                <span className="text-gray-400">{activityActorLabel(entry.actor)} · </span>
                {activityActionLabel(entry.action)}
              </span>
              <span className="shrink-0 text-xs text-gray-400">{formatDateTime(entry.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
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
      {loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {!loading && inbox.length === 0 && (
        <p className="text-sm text-gray-400">미등록 파일이 없습니다.</p>
      )}
      <ul className="space-y-3">
        {inbox.map((f) => (
          <li key={f.id} className="rounded-md border border-gray-100 p-3">
            <p className="truncate text-sm font-medium text-gray-900">{f.file_name ?? '(파일명 없음)'}</p>
            <p className="text-xs text-gray-500">{f.detected_folder ?? '위치 미상'}</p>
            <div className="mt-2 flex items-center gap-2">
              <select
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
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
                className="shrink-0 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                연결
              </button>
              <button
                type="button"
                onClick={() => handleDismiss(f.id)}
                disabled={dismiss.pending}
                className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 disabled:opacity-50"
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
