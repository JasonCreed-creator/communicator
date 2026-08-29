import { Fragment, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import FilterEmptyState from '../components/internal/FilterEmptyState'
import LoadFailedState from '../components/internal/LoadFailedState'
import PageHeader from '../components/internal/PageHeader'
import SortableTh, { type SortDirection } from '../components/internal/SortableTh'
import { LevelBadge } from '../components/internal/StatusBadge'
import TableSkeleton from '../components/internal/TableSkeleton'
import WbsBoard from '../components/wbs/WbsBoard'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, ddayLabel, formatDate, formatDateTime } from '../lib/labels'
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

/** 표 정본 §05 규칙 08 — 그룹 헤더행은 '월' 단위(시안: 일정 · WBS 보드 마일스톤 표) */
function monthKey(date: string): string {
  return date.slice(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${Number(y)}년 ${Number(m)}월`
}

interface MonthGroup {
  key: string
  entries: TimelineEntry[]
}

function groupByMonth(entries: TimelineEntry[]): MonthGroup[] {
  const map = new Map<string, TimelineEntry[]>()
  for (const e of entries) {
    const key = monthKey(e.date)
    const list = map.get(key)
    if (list) list.push(e)
    else map.set(key, [e])
  }
  return [...map.entries()].map(([key, list]) => ({ key, entries: list }))
}

export default function SchedulePage() {
  const { projectId } = useProject()
  const [filter, setFilter] = useState<AreaFilter>('all')
  // 날짜 열만 정렬 가능(§05 조건 3) — 그룹 헤더행(월)도 같은 방향을 따른다
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const milestones = useAsync(() => provider.listMilestones(projectId), [projectId])
  const dashboard = useAsync(() => provider.getDashboard(projectId), [projectId])
  // v1.5 §5: 행사일 변경 후 WBS 미재전개 감지 — project·wbs 태스크는 여기서 별도 조회한다
  // (WbsBoard 내부 조회와는 독립적으로, 배너 판정 전용).
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  // 재전개가 필요한(전개 날짜가 현재 행사일과 어긋난) 태스크 수 — 배너에 영향 범위로 함께 보여준다
  const staleTaskCount =
    project.data?.event_date && wbsTasks.data
      ? wbsTasks.data.filter((t) => t.start_date !== offsetToDate(project.data!.event_date!, t.offset_start)).length
      : 0
  const needsReexpand = !!project.data?.event_date && (wbsTasks.data?.length ?? 0) > 0 && staleTaskCount > 0

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
  ].sort((a, b) => a.date.localeCompare(b.date) * (sortDir === 'asc' ? 1 : -1))

  // ③ 필터 결과 없음에 쓰는 '전체 건수' — 필터를 걷어냈을 때 남는 수(② 데이터 없음과 구분)
  const totalEntryCount =
    (milestones.data?.length ?? 0) +
    (dashboard.data?.pending_approvals ?? []).filter((p) => !!p.approval.due_at).length
  const monthGroups = groupByMonth(entries)
  const timelineFailed = !!milestones.error || !!dashboard.error

  const reloadAll = () => {
    milestones.reload()
    dashboard.reload()
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="S5" title="일정·WBS·R&R" />

      {needsReexpand && (
        <div className="rounded-md border border-accent/30 bg-accent-tint px-3 py-2 text-xs text-accent-deep">
          행사일이 변경되었습니다 — 템플릿 재전개로 일정을 갱신하세요.{' '}
          <span className="text-ink-cap">태스크 {staleTaskCount}건 영향</span>
        </div>
      )}

      <WbsBoard />

      <div>
        <h2 className="t-section-title mb-3">마일스톤·컨펌 기한</h2>

        <div className="print-hidden mb-4 flex items-center gap-2">
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
            {/* 빈 상태 5종(§06): ⑤ 로드 실패 → 원문+재시도 · ① 로딩 → 스켈레톤 ·
                ② 데이터 없음과 ③ 필터 결과 없음을 구분한다 */}
            {timelineFailed ? (
              <LoadFailedState message={milestones.error ?? dashboard.error ?? ''} onRetry={reloadAll} />
            ) : milestones.loading || dashboard.loading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : entries.length === 0 ? (
              filter === 'all' ? (
                <EmptyState message="등록된 마일스톤·컨펌 기한이 없습니다. 아래에서 첫 마일스톤을 추가하세요." />
              ) : (
                <FilterEmptyState
                  totalCount={totalEntryCount}
                  filters={[{ label: '영역', value: FILTER_OPTIONS.find((o) => o.value === filter)!.label }]}
                  onReset={() => setFilter('all')}
                />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="ui-table min-w-[760px] text-sm">
                  <thead>
                    <tr>
                      <th className="ui-th w-[92px]">완료</th>
                      <SortableTh
                        active
                        direction={sortDir}
                        onSort={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                        className="w-[132px]"
                      >
                        날짜
                      </SortableTh>
                      <th className="ui-th w-[104px]">구분</th>
                      <th className="ui-th">제목</th>
                      <th className="ui-th w-[88px]">영역</th>
                      <th className="ui-th ui-num w-[84px]">D-day</th>
                      <th className="ui-th print-hidden w-[76px]">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthGroups.map((group) => (
                      <Fragment key={group.key}>
                        {/* 그룹 헤더행 — canvas 면(§05 규칙 08). 스티키 첫 열 규칙(background:inherit)이
                            행 배경을 덮어쓰므로 면은 tr 인라인 배경(토큰 값)으로 고정한다. */}
                        <tr className="ui-table-group" style={{ background: 'var(--canvas)' }}>
                          <td colSpan={7}>
                            {monthLabel(group.key)}{' '}
                            <span className="font-normal text-ink-cap">{group.entries.length}건</span>
                          </td>
                        </tr>
                        {group.entries.map((entry) =>
                          entry.kind === 'milestone' ? (
                            <MilestoneRow
                              key={`m-${entry.milestone.id}`}
                              milestone={entry.milestone}
                              onChanged={reloadAll}
                            />
                          ) : (
                            <ApprovalOverlayRow key={`a-${entry.item.approval.id}`} item={entry.item} />
                          ),
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
    <tr>
      <td>
        <label className="inline-flex items-center gap-2 text-xs text-ink-cap">
          <input
            type="checkbox"
            checked={milestone.done}
            onChange={handleToggle}
            disabled={toggleDone.pending}
            aria-label={`${milestone.title} 완료`}
          />
          {milestone.done ? '완료' : ''}
        </label>
        <ErrorAlert message={toggleDone.error} />
      </td>
      <td className="text-xs text-ink-sub">{formatDate(milestone.due_date)}</td>
      <td>
        <LevelBadge level="neutral" label="마일스톤" />
      </td>
      <td className={milestone.done ? 'text-ink-cap line-through' : 'text-ink'} title={milestone.title}>
        {milestone.title}
      </td>
      <td className="text-xs text-ink-cap">{milestoneAreaLabel(milestone.area)}</td>
      <td className="ui-num">
        {milestone.done ? (
          <span className="text-xs text-ink-cap">{ddayLabel(milestone.due_date)}</span>
        ) : (
          <DdayBadge isoDate={milestone.due_date} />
        )}
      </td>
      <td className="print-hidden">
        <button type="button" onClick={handleDelete} disabled={remove.pending} className="btn btn-ghost-negative btn-sm">
          삭제
        </button>
        <ErrorAlert message={remove.error} />
      </td>
    </tr>
  )
}

function ApprovalOverlayRow({ item }: { item: PendingApprovalItem }) {
  const dueAt = item.approval.due_at as string
  return (
    <tr>
      <td className="text-xs text-ink-cap">—</td>
      <td className="text-xs text-ink-sub">{formatDateTime(dueAt)}</td>
      <td>
        {/* 컨펌 기한 = 내 행동을 기다리는 주의 단계(§03). 도트는 컨펌대기 배지 한 곳에만 붙인다. */}
        <LevelBadge level="attention" label="컨펌 기한" />
      </td>
      <td title={item.deliverable.title}>
        <Link to={`/items/${item.deliverable.id}`} className="text-ink hover:text-accent-deep">
          {item.deliverable.title}
        </Link>
      </td>
      <td className="text-xs text-ink-cap">{AREA_LABELS[item.deliverable.area]}</td>
      <td className="ui-num">
        <DdayBadge isoDate={dueAt} />
      </td>
      <td className="print-hidden" />
    </tr>
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
