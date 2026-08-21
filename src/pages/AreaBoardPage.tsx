import { useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import StatusBadge from '../components/internal/StatusBadge'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, STATUS_LABELS, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'
import type { DeliverableArea, DeliverableStatus } from '../types/enums'
import NotFoundPage from './NotFoundPage'

const provider = getDataProvider()
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

interface BoardRow {
  deliverable: Deliverable
  latestVersionNo: number
}

export default function AreaBoardPage() {
  const { area } = useParams<{ area: string }>()
  if (!area || !BOARD_AREAS.includes(area as DeliverableArea)) return <NotFoundPage />
  return <AreaBoard area={area as DeliverableArea} />
}

function AreaBoard({ area }: { area: DeliverableArea }) {
  const [statusFilter, setStatusFilter] = useState<DeliverableStatus | ''>('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(PROJECT_ID), [])

  const board = useAsync<BoardRow[]>(async () => {
    const items = await provider.listDeliverables(PROJECT_ID, {
      area,
      status: statusFilter || undefined,
      assignee_id: assigneeFilter || undefined,
    })
    return Promise.all(
      items.map(async (deliverable) => {
        const detail = await provider.getDeliverable(deliverable.id)
        return { deliverable, latestVersionNo: detail.versions[0]?.version_no ?? 0 }
      }),
    )
  }, [area, statusFilter, assigneeFilter])

  const memberName = (userId: string | null) =>
    members.data?.find((m) => m.user_id === userId)?.profile.name ?? '미배정'

  const canWrite = currentUser.data && (currentUser.data.role === 'pm' || currentUser.data.role === area)

  const grouped = new Map<string, BoardRow[]>()
  for (const row of board.data ?? []) {
    const list = grouped.get(row.deliverable.category) ?? []
    list.push(row)
    grouped.set(row.deliverable.category, list)
  }

  return (
    <section className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs text-gray-400">S2</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{AREA_LABELS[area]} 보드</h1>
      </div>

      <ErrorAlert message={board.error} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          상태
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeliverableStatus | '')}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700"
          >
            <option value="">전체</option>
            {(Object.keys(STATUS_LABELS) as DeliverableStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          담당
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700"
          >
            <option value="">전체</option>
            {members.data?.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {board.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {board.data && board.data.length === 0 && (
        <p className="text-sm text-gray-400">조건에 맞는 항목이 없습니다.</p>
      )}

      <div className="space-y-6">
        {[...grouped.entries()].map(([category, rows]) => (
          <Card key={category} title={category}>
            <ul className="divide-y divide-gray-100">
              {rows.map(({ deliverable, latestVersionNo }) => (
                <BoardRowItem
                  key={deliverable.id}
                  deliverable={deliverable}
                  latestVersionNo={latestVersionNo}
                  assigneeName={memberName(deliverable.assignee_id)}
                  canWrite={!!canWrite}
                  onChanged={board.reload}
                />
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {canWrite ? (
        <CreateDeliverableForm area={area} onCreated={board.reload} />
      ) : currentUser.data ? (
        <p className="text-sm text-gray-400">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
      ) : null}
    </section>
  )
}

function BoardRowItem({
  deliverable,
  latestVersionNo,
  assigneeName,
  canWrite,
  onChanged,
}: {
  deliverable: Deliverable
  latestVersionNo: number
  assigneeName: string
  canWrite: boolean
  onChanged: () => void
}) {
  const transition = useMutation(() => provider.transitionStatus(deliverable.id, 'internal_review'))

  const handleTransition = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const result = await transition.run()
    if (result) onChanged()
  }

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <Link to={`/items/${deliverable.id}`} className="flex flex-wrap items-center gap-3 hover:opacity-70">
        <StatusBadge status={deliverable.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{deliverable.title}</span>
        <span className="shrink-0 text-xs text-gray-500">
          {latestVersionNo > 0 ? `v${latestVersionNo}` : '버전 없음'}
        </span>
        <span className="shrink-0 text-xs text-gray-500">{assigneeName}</span>
        {deliverable.due_date ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
            {formatDate(deliverable.due_date)}
            <DdayBadge isoDate={deliverable.due_date} />
          </span>
        ) : (
          <span className="shrink-0 text-xs text-gray-400">마감 미정</span>
        )}
        {canWrite && deliverable.status === 'draft' && (
          <button
            type="button"
            onClick={handleTransition}
            disabled={transition.pending}
            className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            내부검토 요청
          </button>
        )}
      </Link>
      <ErrorAlert message={transition.error} />
    </li>
  )
}

function CreateDeliverableForm({ area, onCreated }: { area: DeliverableArea; onCreated: () => void }) {
  const members = useAsync(() => provider.listMembers(PROJECT_ID), [])
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const create = useMutation(() =>
    provider.createDeliverable({
      project_id: PROJECT_ID,
      area,
      category,
      title,
      assignee_id: assigneeId || undefined,
      due_date: dueDate || undefined,
    }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await create.run()
    if (result) {
      setCategory('')
      setTitle('')
      setAssigneeId('')
      setDueDate('')
      onCreated()
    }
  }

  return (
    <Card title="새 항목 생성">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          카테고리
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            placeholder="예: 배너"
            className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          제목
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="항목 제목"
            className="w-48 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          담당
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-36 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">미배정</option>
            {members.data?.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          마감
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <button
          type="submit"
          disabled={create.pending}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          생성
        </button>
      </form>
      <ErrorAlert message={create.error} />
    </Card>
  )
}
