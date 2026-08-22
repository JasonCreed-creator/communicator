import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { ProgramSession } from '../../types/entities'
import type { ProgramSessionInput } from '../../types/views'
import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'

const provider = getDataProvider()

interface ProgramSectionProps {
  sessions: ProgramSession[]
  progress: SectionProgressData
  /** pm·ops만 true — §6.1 프로그램표 편집 권한 */
  canEdit: boolean
  onChanged: () => void
}

function groupBySection(sessions: ProgramSession[]): [string, ProgramSession[]][] {
  const map = new Map<string, ProgramSession[]>()
  for (const s of sessions) {
    const key = s.section?.trim() || '기타'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return [...map.entries()]
}

function timeRangeLabel(s: ProgramSession): string {
  if (!s.start_time && !s.end_time) return '시간 미정'
  return `${s.start_time ?? '—'}–${s.end_time ?? '—'}`
}

function speakerLabel(s: ProgramSession): string {
  if (!s.speaker_name) return '—'
  const meta = [s.speaker_title, s.speaker_org].filter(Boolean).join('·')
  return meta ? `${s.speaker_name} (${meta})` : s.speaker_name
}

export default function ProgramSection({ sessions, progress, canEdit, onChanged }: ProgramSectionProps) {
  const grouped = groupBySection(sessions)

  return (
    <PlanSection number={PLAN_SECTION_META.program.number} title={PLAN_SECTION_META.program.title} progress={progress}>
      {sessions.length === 0 && <p className="text-xs text-gray-400">등록된 세션이 없습니다.</p>}
      <div className="space-y-5">
        {grouped.map(([section, rows]) => (
          <div key={section}>
            <h3 className="mb-2 text-xs font-semibold text-gray-500">{section}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-1.5 pr-3 font-medium">시간</th>
                    <th className="py-1.5 pr-3 font-medium">제목</th>
                    <th className="py-1.5 pr-3 font-medium">연사</th>
                    <th className="py-1.5 pr-3 font-medium">비고</th>
                    {canEdit && <th className="plan-print-hidden py-1.5 pr-3 font-medium">관리</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((s) => (
                    <ProgramRow key={s.id} session={s} canEdit={canEdit} onChanged={onChanged} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {canEdit && <ProgramAddForm onCreated={onChanged} />}
    </PlanSection>
  )
}

interface ProgramFormValues {
  section: string
  start_time: string
  end_time: string
  title: string
  speaker_name: string
  speaker_title: string
  speaker_org: string
  note: string
}

function toFormValues(s?: ProgramSession | null): ProgramFormValues {
  return {
    section: s?.section ?? '',
    start_time: s?.start_time ?? '',
    end_time: s?.end_time ?? '',
    title: s?.title ?? '',
    speaker_name: s?.speaker_name ?? '',
    speaker_title: s?.speaker_title ?? '',
    speaker_org: s?.speaker_org ?? '',
    note: s?.note ?? '',
  }
}

function toInput(v: ProgramFormValues): ProgramSessionInput {
  return {
    section: v.section,
    start_time: v.start_time,
    end_time: v.end_time,
    title: v.title,
    speaker_name: v.speaker_name,
    speaker_title: v.speaker_title,
    speaker_org: v.speaker_org,
    note: v.note,
  }
}

function ProgramFieldsForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
}: {
  values: ProgramFormValues
  onChange: (patch: Partial<ProgramFormValues>) => void
  onSubmit: (e: FormEvent) => void
  onCancel?: () => void
  submitLabel: string
  pending: boolean
  error: string | null
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        섹션
        <input
          value={values.section}
          onChange={(e) => onChange({ section: e.target.value })}
          placeholder="오전"
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        시작
        <input
          type="time"
          value={values.start_time}
          onChange={(e) => onChange({ start_time: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        종료
        <input
          type="time"
          value={values.end_time}
          onChange={(e) => onChange({ end_time: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-gray-500">
        제목
        <input
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
          required
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        연사명
        <input
          value={values.speaker_name}
          onChange={(e) => onChange({ speaker_name: e.target.value })}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        직함
        <input
          value={values.speaker_title}
          onChange={(e) => onChange({ speaker_title: e.target.value })}
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        소속
        <input
          value={values.speaker_org}
          onChange={(e) => onChange({ speaker_org: e.target.value })}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        비고
        <input
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {submitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
        >
          취소
        </button>
      )}
      <ErrorAlert message={error} />
    </form>
  )
}

function ProgramRow({
  session,
  canEdit,
  onChanged,
}: {
  session: ProgramSession
  canEdit: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<ProgramFormValues>(() => toFormValues(session))
  const update = useMutation((input: ProgramSessionInput) => provider.updateProgramSession(session.id, input))
  const remove = useMutation(() => provider.deleteProgramSession(session.id))

  const handleEdit = () => {
    setValues(toFormValues(session))
    setEditing(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await update.run(toInput(values))
    if (result) {
      setEditing(false)
      onChanged()
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`'${session.title}' 세션을 삭제하시겠습니까?`)) return
    const result = await remove.run()
    if (result !== undefined) onChanged()
  }

  if (editing) {
    return (
      <tr className="plan-print-hidden">
        <td colSpan={canEdit ? 5 : 4} className="py-2">
          <ProgramFieldsForm
            values={values}
            onChange={(p) => setValues((v) => ({ ...v, ...p }))}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(false)}
            submitLabel="저장"
            pending={update.pending}
            error={update.error}
          />
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="py-2 pr-3 align-top text-gray-700">{timeRangeLabel(session)}</td>
      <td className="py-2 pr-3 align-top font-medium text-gray-900">{session.title}</td>
      <td className="py-2 pr-3 align-top text-gray-700">{speakerLabel(session)}</td>
      <td className="py-2 pr-3 align-top text-gray-500">
        {session.note && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{session.note}</span>
        )}
      </td>
      {canEdit && (
        <td className="plan-print-hidden py-2 pr-3 align-top">
          <div className="flex gap-2">
            <button type="button" onClick={handleEdit} className="text-xs text-gray-600 underline">
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={remove.pending}
              className="text-xs text-red-600 underline disabled:opacity-50"
            >
              삭제
            </button>
          </div>
          <ErrorAlert message={remove.error} />
        </td>
      )}
    </tr>
  )
}

function ProgramAddForm({ onCreated }: { onCreated: () => void }) {
  const [values, setValues] = useState<ProgramFormValues>(() => toFormValues(null))
  const create = useMutation((input: ProgramSessionInput) => provider.createProgramSession(PROJECT_ID, input))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.title.trim()) return
    const result = await create.run(toInput(values))
    if (result) {
      setValues(toFormValues(null))
      onCreated()
    }
  }

  return (
    <div className="plan-print-hidden mt-4 border-t border-gray-100 pt-4">
      <p className="mb-2 text-xs font-semibold text-gray-500">세션 추가</p>
      <ProgramFieldsForm
        values={values}
        onChange={(p) => setValues((v) => ({ ...v, ...p }))}
        onSubmit={handleSubmit}
        submitLabel="추가"
        pending={create.pending}
        error={create.error}
      />
    </div>
  )
}
