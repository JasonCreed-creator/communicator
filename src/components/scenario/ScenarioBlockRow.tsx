import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { renderLiteMarkdown } from '../plan/markdown'
import { useMutation } from '../../hooks/useAsync'
import { SCENARIO_KIND_LABELS } from '../../lib/labels'
import type { ProgramSession, ScenarioBlock } from '../../types/entities'
import ScenarioBlockForm from './ScenarioBlockForm'
import { toFormValues, type ScenarioBlockFormValues } from './scenarioFormValues'

/** 시각·구분·대본·비고·액션 = 5열 (편집 폼·대본 전문 패널이 colSpan으로 펼쳐질 때 기준) */
const COLS = 5

interface ScenarioBlockRowProps {
  block: ScenarioBlock
  /** 편집 폼의 세션 select 옵션 */
  sessions: ProgramSession[]
  /** pm·ops만 true — §8.2 scenario-blocks 쓰기 권한. false면 대본 열람만 가능한 읽기 전용 행 */
  canEdit: boolean
  /** 같은 그룹(세션) 안에서의 첫/마지막 여부 — ↑/↓ 정렬은 그룹 내부에서만 동작한다 */
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  /** 부모(ScenarioBuilder)가 로컬 배열을 재조립해 saveScenarioBlocks로 벌크 저장한다 */
  onSave: (blockId: string, values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onDelete: (blockId: string) => Promise<ScenarioBlock[]>
  onChanged: () => void
  /** 대본 전문 패널 펼침 여부 — 인쇄 시 전 블록을 펼쳐야 하므로 부모(ScenarioBuilder)가 관리한다 */
  scriptOpen: boolean
  onToggleScript: () => void
}

/** 시나리오 빌더 — 진행 블록 1행. 보기/인라인 편집/대본 전문 패널 3모드를 오간다(CueRow 패턴 준용). */
export default function ScenarioBlockRow({
  block,
  sessions,
  canEdit,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
  onChanged,
  scriptOpen,
  onToggleScript,
}: ScenarioBlockRowProps) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<ScenarioBlockFormValues>(() => toFormValues(block))
  const update = useMutation((v: ScenarioBlockFormValues) => onSave(block.id, v))
  const remove = useMutation(() => onDelete(block.id))

  const handleEdit = () => {
    setValues(toFormValues(block))
    setEditing(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await update.run(values)
    if (result) {
      setEditing(false)
      onChanged()
    }
  }

  const handleDelete = async () => {
    const label = block.note || SCENARIO_KIND_LABELS[block.kind]
    if (!window.confirm(`진행 블록 '${label}'을(를) 삭제하시겠습니까?`)) return
    const result = await remove.run()
    if (result !== undefined) onChanged()
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={COLS} className="py-2">
          <ScenarioBlockForm
            values={values}
            onChange={(p) => setValues((v) => ({ ...v, ...p }))}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(false)}
            submitLabel="저장"
            pending={update.pending}
            error={update.error}
            sessions={sessions}
          />
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr className="h-11 hover:bg-accent-tint/30">
        <td className="py-2 pr-3 align-top text-ink-sub whitespace-nowrap">{block.time ?? '—'}</td>
        <td className="py-2 pr-3 align-top">
          <span className="t-caption inline-block whitespace-nowrap rounded-full bg-canvas px-2 py-0.5">
            {SCENARIO_KIND_LABELS[block.kind]}
          </span>
        </td>
        <td className="py-2 pr-3 align-top text-ink-sub">
          {block.script ? (
            <button
              type="button"
              onClick={onToggleScript}
              aria-expanded={scriptOpen}
              className="text-xs font-medium text-steel underline underline-offset-2"
            >
              대본
            </button>
          ) : (
            <span className="text-ink-cap">—</span>
          )}
        </td>
        <td className="py-2 pr-3 align-top text-ink-sub">{block.note ?? <span className="text-ink-cap">—</span>}</td>
        <td className="py-2 align-top whitespace-nowrap plan-print-hidden">
          {canEdit && (
            <div className="flex flex-nowrap items-center gap-1">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                aria-label="위로"
                title="위로"
                className="btn btn-sm btn-ghost w-7 px-0"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                aria-label="아래로"
                title="아래로"
                className="btn btn-sm btn-ghost w-7 px-0"
              >
                ↓
              </button>
              <button type="button" onClick={handleEdit} className="btn btn-sm btn-ghost px-1.5">
                편집
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={remove.pending}
                className="btn btn-sm btn-ghost-negative px-1.5"
              >
                삭제
              </button>
            </div>
          )}
          <ErrorAlert message={remove.error} />
        </td>
      </tr>
      {scriptOpen && (
        <tr>
          <td colSpan={COLS} className="px-3 py-3">
            {/* 카드 안 카드 금지 — 면 분리는 canvas 인셋으로 */}
            <div className="rounded-lg bg-canvas p-3">
              <p className="mb-1 text-xs font-semibold text-ink-sub">
                대본 전문 — {block.note ?? SCENARIO_KIND_LABELS[block.kind]}
              </p>
              {block.script ? renderLiteMarkdown(block.script) : <p className="text-xs text-ink-cap">작성된 대본이 없습니다.</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
