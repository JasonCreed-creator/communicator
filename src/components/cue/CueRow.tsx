import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { renderLiteMarkdown } from '../plan/markdown'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Cue } from '../../types/entities'
import CueFieldsForm from './CueFieldsForm'
import { summaryLine, toFormValues, toInput, type CueFormValues } from './cueFormValues'

const provider = getDataProvider()

/** 큐번호·시간·구분·내용·음향·조명·스크린·액션 = 8열 (편집 폼·대본 패널이 colSpan으로 펼쳐질 때 기준) */
const COLS = 8

interface CueRowProps {
  cue: Cue
  /** pm·ops만 true — 그 외 역할은 대본 열람만 가능한 읽기 전용 표 */
  canEdit: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onChanged: () => void
}

/** 콘솔 채널 값 — 값이 있으면 t-caption 톤의 칩, 없으면 대시 (§6 S3: 콘솔 3채널 칩은 t-caption 톤) */
function ConsoleChip({ value }: { value: string | null }) {
  if (!value) return <span className="text-ink-cap">—</span>
  return <span className="t-caption inline-flex items-center rounded-full bg-canvas px-2 py-0.5">{value}</span>
}

/** S3 큐시트 에디터 — 큐 1행. 보기/인라인 편집/대본 전문 패널 3모드를 오간다 */
export default function CueRow({ cue, canEdit, isFirst, isLast, onMoveUp, onMoveDown, onChanged }: CueRowProps) {
  const [editing, setEditing] = useState(false)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [values, setValues] = useState<CueFormValues>(() => toFormValues(cue))
  const update = useMutation((input: ReturnType<typeof toInput>) => provider.updateCue(cue.id, input))
  const remove = useMutation(() => provider.deleteCue(cue.id))

  const handleEdit = () => {
    setValues(toFormValues(cue))
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
    if (!window.confirm(`큐 '${cue.cue_no ?? cue.segment ?? '이 행'}'을(를) 삭제하시겠습니까?`)) return
    const result = await remove.run()
    if (result !== undefined) onChanged()
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={COLS} className="py-2">
          <CueFieldsForm
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
    <>
      <tr className="h-11 hover:bg-accent-tint/30">
        <td className="py-2 pr-3 align-top font-medium text-ink">{cue.cue_no ?? '—'}</td>
        <td className="py-2 pr-3 align-top text-ink-sub">{cue.time_at ?? '—'}</td>
        <td className="py-2 pr-3 align-top text-ink-sub">{cue.segment ?? '—'}</td>
        <td className="py-2 pr-3 align-top text-ink-sub">{summaryLine(cue.body)}</td>
        <td className="py-2 pr-3 align-top">
          <ConsoleChip value={cue.console_audio} />
        </td>
        <td className="py-2 pr-3 align-top">
          <ConsoleChip value={cue.console_light} />
        </td>
        <td className="py-2 pr-3 align-top">
          <ConsoleChip value={cue.console_screen} />
        </td>
        <td className="py-2 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setScriptOpen((v) => !v)}
              aria-expanded={scriptOpen}
              className="text-xs font-medium text-steel underline underline-offset-2"
            >
              대본
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={isFirst}
                  aria-label="위로"
                  title="위로"
                  className="btn btn-sm btn-ghost"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={isLast}
                  aria-label="아래로"
                  title="아래로"
                  className="btn btn-sm btn-ghost"
                >
                  ↓
                </button>
                <button type="button" onClick={handleEdit} className="btn btn-sm btn-ghost">
                  편집
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={remove.pending}
                  className="btn btn-sm btn-ghost-negative"
                >
                  삭제
                </button>
              </>
            )}
          </div>
          <ErrorAlert message={remove.error} />
        </td>
      </tr>
      {scriptOpen && (
        <tr>
          <td colSpan={COLS} className="px-3 py-3">
            {/* 카드 안 카드 금지 — 면 분리는 canvas 인셋으로 (§ absolute rule 5) */}
            <div className="rounded-lg bg-canvas p-3">
              <p className="mb-1 text-xs font-semibold text-ink-sub">
                대본 전문 — {cue.cue_no ?? cue.segment ?? ''}
              </p>
              {cue.body ? renderLiteMarkdown(cue.body) : <p className="text-xs text-ink-cap">작성된 대본이 없습니다.</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
