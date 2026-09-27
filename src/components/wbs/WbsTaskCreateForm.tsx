// v2.21 §27.4 (Phase 6.11 PR-C) — 행사별 태스크 추가 폼(pm). 단계 · 묶음(Lv2) · 제목 · 기간 · 역할 · 담당자 · 소통 대상 · 메모.
// 코드(`C-{n}`)·오프셋·정렬은 provider가 매긴다 — 폼은 실날짜만 받는다. 마스터 시트의 "행사마다 다른 줄"이 들어오는 자리.
import { useId, useState, type FormEvent } from 'react'
import AssigneePicker, { choicesFromMembers } from './AssigneePicker'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { useMutation } from '../../hooks/useAsync'
import { ROLE_LABELS } from '../../lib/labels'
import { groupNamesOf, phaseChoices } from '../../lib/wbsCustom'
import { getDataProvider } from '../../providers'
import { MEMBER_ROLES, type MemberRole } from '../../types/enums'
import type { Project, UUID, WbsTask } from '../../types/entities'
import type { CreateWbsTaskInput, MemberWithProfile } from '../../types/views'

const provider = getDataProvider()

export default function WbsTaskCreateForm({
  project,
  tasks,
  members,
  onCreated,
  onCancel,
}: {
  project: Project
  tasks: WbsTask[]
  members: MemberWithProfile[]
  onCreated: () => void
  onCancel: () => void
}) {
  const ids = useId()
  const phases = phaseChoices(project, tasks)
  const groups = groupNamesOf(tasks)
  const [phaseNo, setPhaseNo] = useState<number>(phases[0]?.phase_no ?? 1)
  const [groupName, setGroupName] = useState('')
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [role, setRole] = useState<MemberRole>('ops')
  const [assigneeId, setAssigneeId] = useState<UUID | null>(null)
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const create = useMutation((input: CreateWbsTaskInput) => provider.createWbsTask(project.id, input))
  const choices = choicesFromMembers(members)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      create.setError('태스크 제목은 필수입니다.')
      return
    }
    if (!startDate || !endDate) {
      create.setError('시작일·종료일을 입력하세요.')
      return
    }
    if (endDate < startDate) {
      create.setError('종료일은 시작일보다 앞설 수 없습니다.')
      return
    }
    const result = await create.run({
      phase_no: phaseNo,
      group_name: groupName.trim() || null,
      title: title.trim(),
      start_date: startDate,
      end_date: endDate,
      role,
      assignee_id: assigneeId,
      target: target.trim() || null,
      note: note.trim() || null,
    })
    if (result) onCreated()
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="태스크 추가"
      data-testid="wbs-create-form"
      className="space-y-4 rounded-md bg-canvas p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">태스크 추가</h3>
        <span className="t-caption">행사별 태스크 — 코드는 C-1, C-2… 순으로 매겨지고 템플릿 재전개가 건드리지 않습니다</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field id={`${ids}-phase`} label="단계" required>
          <select
            id={`${ids}-phase`}
            value={phaseNo}
            onChange={(e) => setPhaseNo(Number(e.target.value))}
            className="ui-input ui-select w-full"
          >
            {phases.map((p) => (
              <option key={p.phase_no} value={p.phase_no}>
                {p.phase_no}. {p.phase_name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${ids}-group`} label="묶음" hint="단계 안에서 함께 보일 이름(Lv2) — 비우면 묶음 없음">
          <input
            id={`${ids}-group`}
            list={`${ids}-groups`}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="ui-input w-full"
          />
          <datalist id={`${ids}-groups`}>
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field id={`${ids}-title`} label="태스크명" required span="lg:col-span-1">
          <input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} className="ui-input w-full" />
        </Field>
        <Field id={`${ids}-start`} label="시작일" required>
          <input
            id={`${ids}-start`}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="ui-input w-full"
          />
        </Field>
        <Field id={`${ids}-end`} label="종료일" required>
          <input
            id={`${ids}-end`}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="ui-input w-full"
          />
        </Field>
        <Field id={`${ids}-role`} label="담당 역할" required hint="상태 체크 권한은 역할이 정합니다(배정 ≠ 권한)">
          <select
            id={`${ids}-role`}
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="ui-input ui-select w-full"
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${ids}-target`} label="소통 대상" hint="예: 고객사 · 협력사 · 내부">
          <input id={`${ids}-target`} value={target} onChange={(e) => setTarget(e.target.value)} className="ui-input w-full" />
        </Field>
        <Field id={`${ids}-note`} label="메모" span="sm:col-span-2">
          <input id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} className="ui-input w-full" />
        </Field>
      </div>
      <div>
        <p className="t-caption mb-1.5">담당자 — 이 행사 멤버 가운데 한 사람(비우면 역할만)</p>
        <AssigneePicker
          label="새 태스크 담당자 고르기"
          choices={choices}
          value={assigneeId}
          onPick={(id) => setAssigneeId((cur) => (cur === id ? null : id))}
          onClear={() => setAssigneeId(null)}
          emptyHint="이 행사에 담당자가 없습니다 — 행사 설정 ②에서 먼저 배정하세요."
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={create.pending} className="btn btn-primary">
          추가
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          취소
        </button>
      </div>
      <ErrorAlert message={create.error} />
    </form>
  )
}
