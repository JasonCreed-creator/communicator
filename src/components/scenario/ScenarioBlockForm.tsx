import type { FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { SCENARIO_KIND_LABELS } from '../../lib/labels'
import { SCENARIO_BLOCK_KINDS } from '../../types/enums'
import type { ProgramSession } from '../../types/entities'
import type { ScenarioBlockFormValues } from './scenarioFormValues'

/**
 * 진행 블록 추가/편집 공용 필드 폼 — ScenarioBuilder의 행 추가 폼과 ScenarioBlockRow의 인라인
 * 편집이 공유한다(CueFieldsForm과 동일한 역할 분담, §5 패턴 정본 준용).
 */
export default function ScenarioBlockForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
  sessions,
}: {
  values: ScenarioBlockFormValues
  onChange: (patch: Partial<ScenarioBlockFormValues>) => void
  onSubmit: (e: FormEvent) => void
  onCancel?: () => void
  submitLabel: string
  pending: boolean
  error: string | null
  /** 세션 선택 옵션 — 프로그램표 연동(§10.2) */
  sessions: ProgramSession[]
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 t-caption">
        세션
        <select
          value={values.session_id}
          onChange={(e) => onChange({ session_id: e.target.value })}
          className="ui-input ui-select w-44 text-xs"
        >
          <option value="">공통/수동 블록</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.start_time ? ` (${s.start_time})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 t-caption">
        시각
        <input
          value={values.time}
          onChange={(e) => onChange({ time: e.target.value })}
          placeholder="HH:MM"
          className="ui-input w-20 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        구분
        <select
          value={values.kind}
          onChange={(e) => onChange({ kind: e.target.value as ScenarioBlockFormValues['kind'] })}
          className="ui-input ui-select w-24 text-xs"
        >
          {SCENARIO_BLOCK_KINDS.map((k) => (
            <option key={k} value={k}>
              {SCENARIO_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 t-caption">
        대본
        <textarea
          value={values.script}
          onChange={(e) => onChange({ script: e.target.value })}
          rows={2}
          placeholder="진행 대본(마크다운) — 큐 표기는 M-02·C-11처럼 적으면 내보내기에서 인식됩니다"
          className="ui-input text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        비고
        <input
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="ui-input w-40 text-xs"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-sm btn-primary">
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost">
          취소
        </button>
      )}
      <ErrorAlert message={error} />
    </form>
  )
}
