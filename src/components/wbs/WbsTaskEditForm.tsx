import { useId, useState, type FormEvent } from 'react'
import AssigneePicker, { choicesFromMembers } from './AssigneePicker'
import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { ROLE_LABELS } from '../../lib/labels'
import { groupNamesOf } from '../../lib/wbsCustom'
import { getDataProvider } from '../../providers'
import { MEMBER_ROLES, type MemberRole } from '../../types/enums'
import type { Deliverable, UUID, WbsTask } from '../../types/entities'
import type { MemberWithProfile, WbsTaskPatch } from '../../types/views'

const provider = getDataProvider()

/** pm 전용 인라인 편집 — 제목·시작/종료일·역할·메모·산출물 연결(§6.1: status 외 필드는 pm 전용).
 *  v2.21 §27.4 — 묶음(Lv2)·소통 대상·담당자(행사 멤버 카드 피커) + 행사별(custom) 태스크 지우기. 템플릿 태스크는 지우지 못한다(완료 처리로). */
export default function WbsTaskEditForm({
  task,
  deliverables,
  members = [],
  siblings = [],
  onSaved,
  onCancel,
  onDeleted,
}: {
  task: WbsTask
  deliverables: Deliverable[]
  /** 담당자 후보 = 이 행사 멤버 */
  members?: MemberWithProfile[]
  /** 묶음 이름 자동완성용 — 이 행사의 태스크 */
  siblings?: WbsTask[]
  onSaved: () => void
  onCancel: () => void
  onDeleted?: () => void
}) {
  const ids = useId()
  const [title, setTitle] = useState(task.title)
  const [startDate, setStartDate] = useState(task.start_date ?? '')
  const [endDate, setEndDate] = useState(task.end_date ?? '')
  const [role, setRole] = useState<MemberRole>(task.role)
  const [note, setNote] = useState(task.note ?? '')
  const [linkedId, setLinkedId] = useState(task.linked_deliverable_id ?? '')
  const [groupName, setGroupName] = useState(task.group_name ?? '')
  const [target, setTarget] = useState(task.target ?? '')
  const [assigneeId, setAssigneeId] = useState<UUID | null>(task.assignee_id)
  const save = useMutation((patch: WbsTaskPatch) => provider.updateWbsTask(task.id, patch))
  const remove = useMutation(async () => {
    await provider.deleteWbsTask(task.id)
    return true
  })
  const groups = groupNamesOf(siblings)

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
      group_name: groupName.trim() || null,
      target: target.trim() || null,
      assignee_id: assigneeId,
    })
    if (result) onSaved()
  }

  const handleDelete = async () => {
    if (!window.confirm(`태스크 '${task.title}'을(를) 지울까요? 되돌릴 수 없습니다.`)) return
    const result = await remove.run()
    if (result) onDeleted?.()
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
        묶음
        <input
          list={`${ids}-groups`}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Lv2 — 비우면 없음"
          className="ui-input w-36"
        />
        <datalist id={`${ids}-groups`}>
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 t-caption">
        소통 대상
        <input value={target} onChange={(e) => setTarget(e.target.value)} className="ui-input w-32" />
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
      <div className="w-full">
        <p className="t-caption mb-1.5">담당자 — 이 행사 멤버 가운데 한 사람(배정은 표시·오늘 할 일용 — 권한은 역할이 정한다)</p>
        <AssigneePicker
          label={`${task.code} 담당자 고르기`}
          choices={choicesFromMembers(members)}
          value={assigneeId}
          onPick={(id) => setAssigneeId((cur) => (cur === id ? null : id))}
          onClear={() => setAssigneeId(null)}
          emptyHint="이 행사에 담당자가 없습니다 — 행사 설정 ②에서 먼저 배정하세요."
        />
      </div>
      <div className="flex w-full flex-wrap items-center gap-2">
        <button type="submit" disabled={save.pending} className="btn btn-primary">
          저장
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          취소
        </button>
        {task.source === 'custom' ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={remove.pending}
            className="btn btn-ghost ml-auto text-negative"
            data-testid={`wbs-delete-${task.id}`}
          >
            이 태스크 지우기
          </button>
        ) : (
          <span className="t-caption ml-auto">템플릿 태스크는 지우지 않아요 — 완료 처리로 정리하세요(재전개가 되살립니다)</span>
        )}
      </div>
      <div className="w-full">
        <ErrorAlert message={save.error ?? remove.error} />
      </div>
    </form>
  )
}
