import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ActionMenu from '../internal/ActionMenu'
import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { SCENARIO_KIND_CHIP_CLASSES, SCENARIO_KIND_LABELS } from '../../lib/labels'
import { cueTokensIn } from '../../lib/scenario'
import { fillSpeakerSlots, hasSpeakerSlot, isSpokenKind, scriptParagraphs } from '../../lib/scenarioScript'
import type { ProgramSession, ScenarioBlock } from '../../types/entities'
import ScenarioBlockForm from './ScenarioBlockForm'
import { toFormValues, type ScenarioBlockFormValues } from './scenarioFormValues'

/**
 * 시나리오 원고의 블록 1개 (설계서 v2.13 §23.6 · 디자인지시서 §7-2.14).
 * 왼쪽 = 시각 + 구분 배지(비상 예비 멘트는 상황 이름) / 가운데 = 괄호 지시문 → 멘트(크게, 문단) /
 * 오른쪽 = ⋯ 메뉴(고치기·옮기기·지우기). 영상·전환·지시 블록의 내용은 읽는 말이 아니라 괄호 지시문으로 보인다.
 * 멘트가 비었으면 점선 자리 + '멘트 쓰기', 연사 자리가 남았으면 '연사 확인 대기'(프로그램표에 연사가
 * 들어왔으면 그 값으로 채우기).
 */
export default function ScenarioScriptBlock({
  block,
  session,
  sessions,
  canEdit,
  isFirst,
  isLast,
  onMove,
  onSave,
  onDelete,
  onChanged,
}: {
  block: ScenarioBlock
  /** 블록이 걸린 프로그램표 세션 — 연사 자리 채우기에 쓴다 */
  session: ProgramSession | null
  sessions: ProgramSession[]
  /** pm·ops만 true — false면 읽기 전용(메뉴·쓰기·채우기 없음) */
  canEdit: boolean
  isFirst: boolean
  isLast: boolean
  onMove: (dir: -1 | 1) => void
  onSave: (blockId: string, values: ScenarioBlockFormValues) => Promise<unknown>
  onDelete: (blockId: string) => Promise<unknown>
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<false | 'all' | 'script'>(false)
  const [values, setValues] = useState<ScenarioBlockFormValues>(() => toFormValues(block))
  const update = useMutation((v: ScenarioBlockFormValues) => onSave(block.id, v))
  const remove = useMutation(() => onDelete(block.id))

  const emergency = block.kind === 'emergency'
  const spoken = isSpokenKind(block.kind)
  const label = SCENARIO_KIND_LABELS[block.kind]
  const script = block.script ?? ''
  const paragraphs = scriptParagraphs(script)
  const tokens = cueTokensIn(script)
  const speakerPending = spoken && hasSpeakerSlot(script)
  const filledFromProgram = speakerPending && session ? fillSpeakerSlots(script, session) : null

  const openEdit = (mode: 'all' | 'script') => {
    setValues(toFormValues(block))
    setEditing(mode)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await update.run(values)
    if (result) {
      setEditing(false)
      onChanged()
    }
  }

  const handleFill = async () => {
    if (!filledFromProgram) return
    const result = await update.run({ ...toFormValues(block), script: filledFromProgram })
    if (result) onChanged()
  }

  const handleDelete = async () => {
    const name = emergency ? block.note || label : `${block.time ? `${block.time} ` : ''}${label}`
    if (!window.confirm(`'${name}' 블록을 지울까요?`)) return
    const result = await remove.run()
    if (result !== undefined) onChanged()
  }

  const badge = emergency ? block.note || label : label
  const badgeClass = emergency ? 'bg-track text-ink-sub' : SCENARIO_KIND_CHIP_CLASSES[block.kind]

  return (
    <div
      data-testid="scenario-block"
      className="grid grid-cols-[76px_minmax(0,1fr)_28px] gap-x-4 border-t border-border py-3.5 first:border-t-0 print:break-inside-avoid"
    >
      <div className="flex flex-col items-start gap-1.5 pt-0.5">
        {!emergency && (
          <span className="text-sm font-semibold tabular-nums text-ink-sub">{block.time ?? '—'}</span>
        )}
        <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
          {badge}
        </span>
      </div>

      <div className="min-w-0 space-y-2.5">
        {editing ? (
          <div className="plan-print-hidden rounded-lg bg-canvas p-3">
            <ScenarioBlockForm
              values={values}
              onChange={(p) => setValues((v) => ({ ...v, ...p }))}
              onSubmit={handleSubmit}
              onCancel={() => setEditing(false)}
              submitLabel="저장"
              pending={update.pending}
              error={update.error}
              sessions={sessions}
              focusScript={editing === 'script'}
            />
          </div>
        ) : (
          <>
            {!emergency && block.note && <p className="text-sm leading-relaxed text-ink-sub">({block.note})</p>}

            {spoken ? (
              paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <p key={i} className="whitespace-pre-line text-base leading-[1.8] text-ink">
                    {p}
                  </p>
                ))
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-[1.5px] border-dashed border-border-strong px-4 py-3">
                  <span className="text-sm text-ink-cap">멘트가 비어 있습니다</span>
                  {canEdit && (
                    <button type="button" onClick={() => openEdit('script')} className="plan-print-hidden btn btn-ghost btn-sm">
                      멘트 쓰기
                    </button>
                  )}
                </div>
              )
            ) : (
              script.trim() && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-sub">({script.trim()})</p>
            )}

            {!spoken && !script.trim() && !block.note && <p className="text-sm text-ink-cap">—</p>}

            {tokens.length > 0 && (
              <p>
                <span className="inline-flex items-center whitespace-nowrap rounded bg-steel-tint px-1.5 py-0.5 text-[11px] font-semibold text-steel">
                  큐 {tokens.join(' · ')}
                </span>
              </p>
            )}

            {speakerPending && (
              <div
                data-testid="speaker-pending"
                className="flex flex-wrap items-center gap-2.5 rounded-lg bg-accent-tint px-3 py-2.5"
              >
                <span className="inline-flex whitespace-nowrap rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-accent-deep">
                  연사 확인 대기
                </span>
                <span className="min-w-0 text-sm text-ink-sub">
                  {filledFromProgram
                    ? '프로그램표에 연사 정보가 들어왔습니다'
                    : '프로그램표에 연사가 아직 없어 이름·직함 자리를 비워 두었습니다'}
                </span>
                <span className="plan-print-hidden ml-auto">
                  {filledFromProgram && canEdit ? (
                    <button type="button" onClick={handleFill} disabled={update.pending} className="btn btn-ghost btn-sm">
                      프로그램표 연사로 채우기
                    </button>
                  ) : (
                    <Link to="/plan" className="text-sm text-accent-deep hover:underline">
                      프로그램표 열기
                    </Link>
                  )}
                </span>
              </div>
            )}
            <ErrorAlert message={remove.error ?? (editing ? null : update.error)} />
          </>
        )}
      </div>

      <div className="plan-print-hidden">
        {canEdit && !editing && (
          <ActionMenu
            label={`블록 메뉴 ${emergency ? badge : `${block.time ?? ''} ${label}`.trim()}`}
            items={[
              { label: spoken ? '멘트 고치기' : '이 블록 고치기', onSelect: () => openEdit(spoken ? 'script' : 'all') },
              { label: '위로 옮기기', onSelect: () => onMove(-1), disabled: isFirst, reason: '맨 위라 안 됨' },
              { label: '아래로 옮기기', onSelect: () => onMove(1), disabled: isLast, reason: '맨 아래라 안 됨' },
              { label: '블록 지우기', onSelect: () => void handleDelete(), danger: true },
            ]}
          />
        )}
      </div>
    </div>
  )
}
