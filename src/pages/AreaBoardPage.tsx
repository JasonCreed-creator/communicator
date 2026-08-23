import { useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import StatusBadge from '../components/internal/StatusBadge'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, STATUS_LABELS, STATUS_STRIP_CLASSES, formatDate } from '../lib/labels'
import { areaPreset, categoryPreset } from '../lib/boardPresets'
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
  const { projectId, summaries } = useProject()
  const [statusFilter, setStatusFilter] = useState<DeliverableStatus | ''>('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])

  const board = useAsync<BoardRow[]>(async () => {
    const items = await provider.listDeliverables(projectId, {
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
  }, [projectId, area, statusFilter, assigneeFilter])

  const memberName = (userId: string | null) =>
    members.data?.find((m) => m.user_id === userId)?.profile.name ?? '미배정'

  // v1.5 §8: 종료 행사는 읽기 전용 — provider가 쓰기 API를 409로 막으므로 생성 폼도 내린다.
  // (폼이 남아 있으면 지난 행사를 참고 자료로 열람할 때 아직 쓸 수 있는 것처럼 읽힌다.)
  const isClosed = summaries.find((s) => s.id === projectId)?.status === 'closed'
  const canWrite =
    !isClosed && currentUser.data && (currentUser.data.role === 'pm' || currentUser.data.role === area)
  const isPm = !isClosed && currentUser.data?.role === 'pm'

  const grouped = new Map<string, BoardRow[]>()
  for (const row of board.data ?? []) {
    const list = grouped.get(row.deliverable.category) ?? []
    list.push(row)
    grouped.set(row.deliverable.category, list)
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption={`S2 · ${AREA_LABELS[area]} 보드`} title={`${AREA_LABELS[area]} 보드`} />

      <ErrorAlert message={board.error} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-sub">
          상태
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeliverableStatus | '')}
            className="ui-input"
          >
            <option value="">전체</option>
            {(Object.keys(STATUS_LABELS) as DeliverableStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-sub">
          담당
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="ui-input"
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

      {board.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
      {board.data && board.data.length === 0 && <EmptyState message="조건에 맞는 항목이 없습니다." />}

      <div className="space-y-6">
        {[...grouped.entries()].map(([category, rows]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-baseline gap-2 px-1">
              <span className="text-xs font-medium tracking-wide text-brown">{category}</span>
              <span className="text-xs text-ink-cap">{rows.length}건</span>
            </div>
            <ul className="space-y-2">
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
          </div>
        ))}
      </div>

      {canWrite ? (
        <CreateDeliverableForm area={area} onCreated={board.reload} />
      ) : isClosed ? (
        <p className="text-sm text-ink-cap">종료된 행사입니다 — 열람만 가능합니다.</p>
      ) : currentUser.data ? (
        <p className="text-sm text-ink-cap">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
      ) : null}

      {isPm && <IssueBriefForm area={area} onCreated={board.reload} />}
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
    <li className="ui-card relative overflow-hidden">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STRIP_CLASSES[deliverable.status]}`} />
      <Link
        to={`/items/${deliverable.id}`}
        className="flex flex-wrap items-center gap-3 py-3 pr-4 pl-5 hover:opacity-70"
      >
        <StatusBadge status={deliverable.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{deliverable.title}</span>
        <span className="shrink-0 text-xs text-ink-sub">
          {latestVersionNo > 0 ? `v${latestVersionNo}` : '버전 없음'}
        </span>
        <span className="shrink-0 text-xs text-ink-sub">{assigneeName}</span>
        {deliverable.due_date ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-sub">
            {formatDate(deliverable.due_date)}
            <DdayBadge isoDate={deliverable.due_date} />
          </span>
        ) : (
          <span className="shrink-0 text-xs text-ink-cap">마감 미정</span>
        )}
        {canWrite && deliverable.status === 'draft' && (
          <button type="button" onClick={handleTransition} disabled={transition.pending} className="btn btn-ghost btn-sm shrink-0">
            내부검토 요청
          </button>
        )}
      </Link>
      {transition.error && (
        <div className="px-5 pb-3">
          <ErrorAlert message={transition.error} />
        </div>
      )}
    </li>
  )
}

/**
 * 영역별 카테고리 선택 — 프리셋 목록 + '직접 입력'.
 * 자유 입력을 막지 않되, 기본값은 그 보드에 맞는 항목만 보이게 한다(src/lib/boardPresets.ts 정본).
 */
function CategoryPicker({
  area,
  value,
  onChange,
  id,
}: {
  area: DeliverableArea
  value: string
  onChange: (next: string) => void
  id: string
}) {
  const preset = areaPreset(area)
  const known = preset.categories.some((c) => c.name === value)
  // 값이 비었거나 프리셋에 있으면 select 모드, 사용자가 직접 입력을 고르면 자유 입력 모드
  const [freeform, setFreeform] = useState(false)
  const asSelect = !freeform && (value === '' || known)

  if (asSelect) {
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setFreeform(true)
            onChange('')
            return
          }
          onChange(e.target.value)
        }}
        required
        className="ui-input w-36"
      >
        <option value="">항목 선택…</option>
        {preset.categories.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
        <option value="__custom__">직접 입력…</option>
      </select>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder="항목명"
        className="ui-input w-28"
      />
      <button
        type="button"
        onClick={() => {
          setFreeform(false)
          onChange('')
        }}
        className="text-xs text-steel hover:underline"
      >
        목록
      </button>
    </span>
  )
}

function CreateDeliverableForm({ area, onCreated }: { area: DeliverableArea; onCreated: () => void }) {
  const { projectId } = useProject()
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const create = useMutation(() =>
    provider.createDeliverable({
      project_id: projectId,
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
        <label className="flex flex-col gap-1 t-caption" htmlFor="create-category">
          카테고리
          <CategoryPicker area={area} value={category} onChange={setCategory} id="create-category" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          제목
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="항목 제목"
            className="ui-input w-48"
          />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          담당
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="ui-input w-36"
          >
            <option value="">미배정</option>
            {members.data?.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 t-caption">
          마감
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="ui-input"
          />
        </label>
        <button type="submit" disabled={create.pending} className="btn btn-primary">
          생성
        </button>
      </form>
      <ErrorAlert message={create.error} />
    </Card>
  )
}

// ── (v1.2) PM 전용 가이드 발행 폼 ────────────────────────────────────────
// 기존 CreateDeliverableForm(항목 셀프 생성, status='draft')과는 별도 폼 —
// brief·스펙을 넣어 provider.createDeliverable을 호출하면 status='requested'로 발행된다.
function IssueBriefForm({ area, onCreated }: { area: DeliverableArea; onCreated: () => void }) {
  const { projectId } = useProject()
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [brief, setBrief] = useState('')
  const [briefRefsText, setBriefRefsText] = useState('')
  const [specSize, setSpecSize] = useState('')
  const [specQty, setSpecQty] = useState('')
  const [specLocation, setSpecLocation] = useState('')
  const [specType, setSpecType] = useState('')

  const preset = areaPreset(area)
  const hints = categoryPreset(area, category)?.specHints ?? {}

  /**
   * 카테고리를 고르면 그 항목의 가이드 초안을 채운다.
   * 사용자가 이미 쓴 내용은 덮지 않는다 — 비어 있거나 직전 템플릿 그대로일 때만 교체한다.
   */
  const pickCategory = (next: string) => {
    const prevTemplate = categoryPreset(area, category)?.briefTemplate ?? ''
    const nextTemplate = categoryPreset(area, next)?.briefTemplate ?? ''
    setCategory(next)
    setBrief((cur) => (cur.trim() === '' || cur === prevTemplate ? nextTemplate : cur))
  }

  const issue = useMutation(() => {
    if (!assigneeId) throw new Error('가이드에는 담당자 지정이 필요합니다.')
    if (!brief.trim()) throw new Error('가이드 내용을 입력하세요.')
    const brief_refs = briefRefsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    return provider.createDeliverable({
      project_id: projectId,
      area,
      category,
      title,
      assignee_id: assigneeId,
      due_date: dueDate || undefined,
      brief,
      brief_refs: brief_refs.length > 0 ? brief_refs : undefined,
      spec_size: specSize || undefined,
      spec_qty: specQty ? Number(specQty) : undefined,
      spec_location: specLocation || undefined,
      spec_type: specType || undefined,
    })
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await issue.run()
    if (result) {
      setCategory('')
      setTitle('')
      setAssigneeId('')
      setDueDate('')
      setBrief('')
      setBriefRefsText('')
      setSpecSize('')
      setSpecQty('')
      setSpecLocation('')
      setSpecType('')
      onCreated()
    }
  }

  return (
    <Card title="가이드 발행">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 t-caption" htmlFor="brief-category">
            카테고리
            <CategoryPicker area={area} value={category} onChange={pickCategory} id="brief-category" />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="항목 제목"
              className="ui-input w-48"
            />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            담당자
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              required
              className="ui-input w-36"
            >
              <option value="">담당자 선택…</option>
              {members.data?.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 t-caption">
            마감일
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="ui-input"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 t-caption">
          가이드 내용
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            required
            rows={3}
            placeholder="담당자에게 전달할 가이드 내용을 입력하세요"
            className="ui-input w-full"
          />
        </label>

        <label className="flex flex-col gap-1 t-caption">
          참고 링크 (선택, 한 줄에 하나씩)
          <textarea
            value={briefRefsText}
            onChange={(e) => setBriefRefsText(e.target.value)}
            rows={2}
            placeholder={'https://…'}
            className="ui-input w-full"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 t-caption">
            {preset.specLabels.size} (선택)
            <input
              value={specSize}
              onChange={(e) => setSpecSize(e.target.value)}
              placeholder={hints.size ? `예: ${hints.size}` : ''}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            {preset.specLabels.qty} (선택)
            <input
              type="number"
              min="0"
              placeholder={hints.qty ?? ''}
              value={specQty}
              onChange={(e) => setSpecQty(e.target.value)}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            {preset.specLabels.location} (선택)
            <input
              value={specLocation}
              onChange={(e) => setSpecLocation(e.target.value)}
              placeholder={hints.location ? `예: ${hints.location}` : ''}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            {preset.specLabels.type} (선택)
            <input
              value={specType}
              onChange={(e) => setSpecType(e.target.value)}
              placeholder={hints.type ? `예: ${hints.type}` : ''}
              className="ui-input"
            />
          </label>
        </div>

        <button type="submit" disabled={issue.pending} className="btn btn-accent">
          가이드 발행
        </button>
      </form>
      <ErrorAlert message={issue.error} />
    </Card>
  )
}
