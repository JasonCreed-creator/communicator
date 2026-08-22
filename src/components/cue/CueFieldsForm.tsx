import type { FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import type { CueFormValues } from './cueFormValues'

/** 큐 행 추가/편집 공용 필드 폼 — CuesheetEditor의 행 추가 폼과 CueRow의 인라인 편집이 공유한다 */
export default function CueFieldsForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
}: {
  values: CueFormValues
  onChange: (patch: Partial<CueFormValues>) => void
  onSubmit: (e: FormEvent) => void
  onCancel?: () => void
  submitLabel: string
  pending: boolean
  error: string | null
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        큐번호
        <input
          value={values.cue_no}
          onChange={(e) => onChange({ cue_no: e.target.value })}
          placeholder="C05"
          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        시간
        <input
          value={values.time_at}
          onChange={(e) => onChange({ time_at: e.target.value })}
          placeholder="HH:MM"
          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        구분
        <input
          value={values.segment}
          onChange={(e) => onChange({ segment: e.target.value })}
          placeholder="MC"
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-gray-500">
        내용(대본)
        <textarea
          value={values.body}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={2}
          placeholder="큐 내용·대본 전문(마크다운 — ### 헤더, - 불릿 지원)"
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        음향
        <input
          value={values.console_audio}
          onChange={(e) => onChange({ console_audio: e.target.value })}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        조명
        <input
          value={values.console_light}
          onChange={(e) => onChange({ console_light: e.target.value })}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        스크린
        <input
          value={values.console_screen}
          onChange={(e) => onChange({ console_screen: e.target.value })}
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
