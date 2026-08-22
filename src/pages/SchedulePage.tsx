import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import WbsBoard from '../components/wbs/WbsBoard'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, formatDate, formatDateTime } from '../lib/labels'
import { offsetToDate } from '../lib/wbs'
import { getDataProvider } from '../providers'
import type { Milestone } from '../types/entities'
import type { DeliverableArea } from '../types/enums'
import type { PendingApprovalItem } from '../types/views'

const provider = getDataProvider()

type AreaFilter = 'all' | DeliverableArea
const FILTER_OPTIONS: { value: AreaFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'design', label: '디자인' },
  { value: 'ops', label: '운영' },
  { value: 'common', label: '공통' },
]

function milestoneAreaLabel(area: DeliverableArea | null): string {
  return area ? AREA_LABELS[area] : '전체'
}

function matchesFilter(area: DeliverableArea | null, filter: AreaFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'common') return area === 'common' || area === null
  return area === filter
}

type TimelineEntry =
  | { kind: 'milestone'; date: string; milestone: Milestone }
  | { kind: 'approval'; date: string; item: PendingApprovalItem }

export default function SchedulePage() {
  const { projectId } = useProject()
  const [filter, setFilter] = useState<AreaFilter>('all')
  const milestones = useAsync(() => provider.listMilestones(projectId), [projectId])
  const dashboard = useAsync(() => provider.getDashboard(projectId), [projectId])
  // v1.5 §5: 행사일 변경 후 WBS 미재전개 감지 — project·wbs 태스크는 여기서 별도 조회한다
  // (WbsBoard 내부 조회와는 독립적으로, 배너 판정 전용).
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  const needsReexpand =
    !!project.data?.event_date &&
    (wbsTasks.data?.length ?? 0) > 0 &&
    wbsTasks.data!.some((t) => t.start_date !== offsetToDate(project.data!.event_date!, t.offset_start))

  const filteredMilestones = (milestones.data ?? []).filter((m) => matchesFilter(m.area, filter))
  const filteredApprovals = (dashboard.data?.pending_approvals ?? []).filter((p) =>
    matchesFilter(p.deliverable.area, filter),
  )

  const entries: TimelineEntry[] = [
    ...filteredMilestones.map((m) => ({
      kind: 'milestone' as const,
      date: `${m.due_date}T00:00:00`,
      milestone: m,
    })),
    ...filteredApprovals
      .filter((p) => !!p.approval.due_at)
      .map((p) => ({ kind: 'approval' as const, date: p.approval.due_at as string, item: p })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const reloadAll = () => {
    milestones.reload()
    dashboard.reload()
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="S5" title="일정·WBS·R&R" />

      {needsReexpand && (
        <div className="rounded-md border border-accent/30 bg-accent-tint px-3 py-2 text-xs text-accent-deep">
          행사일이 변경되었습니다 — 템플릿 재전개로 일정을 갱신하세요.
        </div>
      )}

      <WbsBoard />

      <div>
        <h2 className="t-section-title mb-3">마일스톤·컨펌 기한</h2>

        <ErrorAlert message={milestones.error} />
        <ErrorAlert message={dashboard.error} />

        <div className="mb-4 flex items-center gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                filter === opt.value
                  ? 'bg-dark text-white'
                  : 'border border-border text-ink-sub hover:bg-track'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          <Card title="타임라인">
            {milestones.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
            {!milestones.loading && entries.length === 0 && (
              <p className="text-sm text-ink-cap">표시할 일정이 없습니다.</p>
            )}
            <ul className="divide-y divide-border">
              {entries.map((entry) =>
                entry.kind === 'milestone' ? (
                  <MilestoneRow key={`m-${entry.milestone.id}`} milestone={entry.milestone} onChanged={reloadAll} />
                ) : (
                  <ApprovalOverlayRow key={`a-${entry.item.approval.id}`} item={entry.item} />
                ),
              )}
            </ul>
          </Card>

          <MilestoneForm onCreated={reloadAll} />
        </div>
      </div>
    </section>
  )
}

function MilestoneRow({ milestone, onChanged }: { milestone: Milestone; onChanged: () => void }) {
  const toggleDone = useMutation((done: boolean) => provider.updateMilestone(milestone.id, { done }))
  const remove = useMutation(() => provider.deleteMilestone(milestone.id))

  const handleToggle = async (e: ChangeEvent<HTMLInputElement>) => {
    const result = await toggleDone.run(e.target.checked)
    if (result) onChanged()
  }

  const handleDelete = async () => {
    if (!window.confirm(`'${milestone.title}' 마일스톤을 삭제하시겠습니까?`)) return
    const result = await remove.run()
    if (result !== undefined) onChanged()
  }

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <input type="checkbox" checked={milestone.done} onChange={handleToggle} disabled={toggleDone.pending} />
        <span className="shrink-0 text-xs text-ink-cap">{formatDate(milestone.due_date)}</span>
        <DdayBadge isoDate={milestone.due_date} />
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            milestone.done ? 'text-ink-cap line-through' : 'text-ink'
          }`}
        >
          {milestone.title}
        </span>
        <span className="shrink-0 text-xs text-ink-cap">{milestoneAreaLabel(milestone.area)}</span>
        <button type="button" onClick={handleDelete} disabled={remove.pending} className="btn btn-ghost-negative btn-sm shrink-0">
          삭제
        </button>
      </div>
      <ErrorAlert message={toggleDone.error} />
      <ErrorAlert message={remove.error} />
    </li>
  )
}

function ApprovalOverlayRow({ item }: { item: PendingApprovalItem }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <Link to={`/items/${item.deliverable.id}`} className="flex flex-wrap items-center gap-3 hover:opacity-70">
        <span className="inline-flex shrink-0 items-center rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-deep">
          컨펌 기한
        </span>
        {item.approval.due_at && (
          <>
            <span className="shrink-0 text-xs text-ink-cap">{formatDateTime(item.approval.due_at)}</span>
            <DdayBadge isoDate={item.approval.due_at} />
          </>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.deliverable.title}</span>
        <span className="shrink-0 text-xs text-ink-cap">{AREA_LABELS[item.deliverable.area]}</span>
      </Link>
    </li>
  )
}

function MilestoneForm({ onCreated }: { onCreated: () => void }) {
  const { projectId } = useProject()
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<AreaFilter>('all')
  const [dueDate, setDueDate] = useState('')
  const create = useMutation(() =>
    provider.createMilestone(projectId, {
      title,
      area: area === 'all' ? null : area,
      due_date: dueDate,
    }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !dueDate) return
    const result = await create.run()
    if (result) {
      setTitle('')
      setArea('all')
      setDueDate('')
      onCreated()
    }
  }

  return (
    <Card title="마일스톤 추가">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 t-caption">
          제목
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="마일스톤 제목"
            className="ui-input w-48"
          />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          영역
          <select value={area} onChange={(e) => setArea(e.target.value as AreaFilter)} className="ui-input w-32">
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 t-caption">
          날짜
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="ui-input"
          />
        </label>
        <button type="submit" disabled={create.pending} className="btn btn-primary">
          추가
        </button>
      </form>
      <ErrorAlert message={create.error} />
    </Card>
  )
}
