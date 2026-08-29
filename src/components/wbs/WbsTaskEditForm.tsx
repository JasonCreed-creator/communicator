import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { ROLE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import { MEMBER_ROLES, type MemberRole } from '../../types/enums'
import type { Deliverable, WbsTask } from '../../types/entities'
import type { WbsTaskPatch } from '../../types/views'

const provider = getDataProvider()

/** pm 전용 인라인 편집 — 제목·시작/종료일·역할·메모·산출물 연결(§6.1: status 외 필드는 pm 전용) */
export default function WbsTaskEditForm({
  task,
  deliverables,
  onSaved,
  onCancel,
}: {
  task: WbsTask
  deliverables: Deliverable[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [startDate, setStartDate] = useState(task.start_date ?? '')
  const [endDate, setEndDate] = useState(task.end_date ?? '')
  const [role, setRole] = useState<MemberRole>(task.role)
  const [note, setNote] = useState(task.note ?? '')
  const [linkedId, setLinkedId] = useState(task.linked_deliverable_id ?? '')
  const save = useMutation((patch: WbsTaskPatch) => provider.updateWbsTask(task.id, patch))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      save.setError('태스크명은 필수입니다.')
      return
    }
    const result = await save.run({
      title,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      role,
      note: note.trim() || null,
      linked_deliverable_id: linkedId || null,
    })
    if (result) onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-md bg-canvas p-3">
      <label className="flex flex-col gap-1 t-caption">
        태스크명
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="ui-input w-48" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        시작일
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="ui-input"
        />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        종료일
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ui-input" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        담당 역할
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className="ui-input ui-select">
          {MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 t-caption">
        메모
        <input value={note} onChange={(e) => setNote(e.target.value)} className="ui-input w-40" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        연결 산출물
        <select value={linkedId} onChange={(e) => setLinkedId(e.target.value)} className="ui-input ui-select w-48">
          <option value="">연결 없음</option>
          {deliverables.map((d) => (
            <option key={d.id} value={d.id}>
              [{d.category}] {d.title}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={save.pending} className="btn btn-primary">
          저장
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          취소
        </button>
      </div>
      <div className="w-full">
        <ErrorAlert message={save.error} />
      </div>
    </form>
  )
}
