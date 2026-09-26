import { useEffect, useRef, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { SCENARIO_KIND_LABELS } from '../../lib/labels'
import { isSpokenKind } from '../../lib/scenarioScript'
import { SCENARIO_BLOCK_KINDS } from '../../types/enums'
import type { ProgramSession } from '../../types/entities'
import type { ScenarioBlockFormValues } from './scenarioFormValues'

/**
 * 진행 블록 추가/고치기 공용 폼 (v2.13 §23.6 원고형) — 위: 세션·시각·구분 / 가운데: 괄호 지시문 /
 * 아래: 멘트(크게). 영상·전환·지시 블록은 멘트 대신 '지시 내용'이고, 비상 예비 멘트는 세션·시각 없이
 * '상황'과 멘트만 받는다.
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
  focusScript = false,
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
  /** '멘트 쓰기'로 열었을 때 멘트 칸에 바로 초점 */
  focusScript?: boolean
}) {
  const scriptRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusScript) scriptRef.current?.focus()
  }, [focusScript])

  const emergency = values.kind === 'emergency'
  const spoken = isSpokenKind(values.kind)

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="진행 블록">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 t-caption">
          구분
          <select
            value={values.kind}
            onChange={(e) => onChange({ kind: e.target.value as ScenarioBlockFormValues['kind'] })}
            className="ui-input ui-select w-28 text-xs"
          >
            {SCENARIO_BLOCK_KINDS.map((k) => (
              <option key={k} value={k}>
                {SCENARIO_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {!emergency && (
          <>
            <label className="flex flex-col gap-1 t-caption">
              세션
              <select
                value={values.session_id}
                onChange={(e) => onChange({ session_id: e.target.value })}
                className="ui-input ui-select w-48 text-xs"
              >
                <option value="">세션 밖 진행</option>
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
          </>
        )}
      </div>

      <label className="flex flex-col gap-1 t-caption">
        {emergency ? '상황' : '지시문'}
        <input
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder={emergency ? '예: 영상 장애' : '괄호로 보이는 무대 지시 — 예: 무대 조명 업 · 타이틀 화면 전환 후'}
          className="ui-input text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 t-caption">
        {spoken ? '멘트' : '지시 내용'}
        <textarea
          ref={scriptRef}
          value={values.script}
          onChange={(e) => onChange({ script: e.target.value })}
          rows={spoken ? 4 : 2}
          placeholder={
            spoken
              ? 'MC가 읽는 문장 그대로 — 빈 줄로 문단을 나눕니다. 모르는 연사는 [연사 이름]처럼 비워 두세요'
              : '무엇이 일어나는지 — 큐 표기는 M-02·C-11처럼 적으면 큐시트로 보낼 때 인식됩니다'
          }
          className={`ui-input ${spoken ? 'text-base leading-[1.8]' : 'text-sm'}`}
        />
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ErrorAlert message={error} />
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost">
            취소
          </button>
        )}
        <button type="submit" disabled={pending} className="btn btn-sm btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
