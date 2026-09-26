// 큐시트 표의 큐 1행 — 디자인지시서 v1.4 §7-2.8 (캔버스 큐시트). 보기 · 인라인 편집 2모드.
// 칸마다 버튼(↑·↓·편집·삭제)을 늘어놓던 옛 액션 열을 행 끝 ⋯ 메뉴 하나로 모았다. 순서는 행을 끌어 옮기거나
// 메뉴의 위/아래로(끌기를 못 쓰는 키보드·터치). 대본은 '대본'을 누르면 표 아래 대본 칸에 뜬다.
import { useEffect, useState, type DragEvent, type FormEvent } from 'react'
import ActionMenu from '../internal/ActionMenu'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Cue } from '../../types/entities'
import CueFieldsForm from './CueFieldsForm'
import { summaryLine, toFormValues, toInput, type CueFormValues } from './cueFormValues'

const provider = getDataProvider()

/** 끌어 옮기기 데이터 형식 — 파일·글자 끌기에는 행이 반응하지 않는다 */
export const CUE_DRAG_TYPE = 'application/x-communicator-cue'

export const isCueDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes(CUE_DRAG_TYPE)

export interface CueRowProps {
  cue: Cue
  /** 편집 가능할 때 열 수(손잡이·⋯ 포함) — 편집 폼 colSpan */
  colCount: number
  canEdit: boolean
  isFirst: boolean
  isLast: boolean
  selected: boolean
  editing: boolean
  /** 끌어 놓을 자리 표시 — 이 행의 위/아래 */
  dropHint: 'before' | 'after' | null
  onSelect: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onMove: (dir: -1 | 1) => void
  /** 지우기 — 확인·오류 표시는 표(부모)가 한다 */
  onDelete: () => void
  onDragStart: () => void
  onDragOverRow: (position: 'before' | 'after') => void
  onDropRow: (fromId: string, position: 'before' | 'after') => void
  onDragEnd: () => void
  onChanged: () => void
}

function ConsoleText({ value }: { value: string | null }) {
  if (!value) return <span className="text-ink-cap">—</span>
  return (
    <span className="block truncate text-brown" title={value}>
      {value}
    </span>
  )
}

export default function CueRow({
  cue,
  colCount,
  canEdit,
  isFirst,
  isLast,
  selected,
  editing,
  dropHint,
  onSelect,
  onEdit,
  onCancelEdit,
  onMove,
  onDelete,
  onDragStart,
  onDragOverRow,
  onDropRow,
  onDragEnd,
  onChanged,
}: CueRowProps) {
  const [values, setValues] = useState<CueFormValues>(() => toFormValues(cue))
  const update = useMutation((input: ReturnType<typeof toInput>) => provider.updateCue(cue.id, input))
  const name = cue.cue_no ?? cue.segment ?? '이 큐'
  // 편집을 열 때마다 지금 값으로 채운다(목록이 새로 읽힌 뒤에도 옛 값이 남지 않게)
  useEffect(() => {
    if (editing) setValues(toFormValues(cue))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, cue.id])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await update.run(toInput(values))
    if (result) {
      onCancelEdit()
      onChanged()
    }
  }

  if (editing) {
    return (
      <tr data-testid="cue-edit-row">
        <td colSpan={colCount} className="ui-cell-wrap bg-canvas py-3">
          <CueFieldsForm
            values={values}
            onChange={(p) => setValues((v) => ({ ...v, ...p }))}
            onSubmit={handleSubmit}
            onCancel={() => {
              setValues(toFormValues(cue))
              onCancelEdit()
            }}
            submitLabel="저장"
            pending={update.pending}
            error={update.error}
          />
        </td>
      </tr>
    )
  }

  const position = (e: DragEvent<HTMLTableRowElement>): 'before' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const hintClass =
    dropHint === 'before' ? 'shadow-[inset_0_2px_0_var(--accent)]' : dropHint === 'after' ? 'shadow-[inset_0_-2px_0_var(--accent)]' : ''

  return (
    <tr
      data-testid="cue-row"
      data-cue-id={cue.id}
      aria-selected={selected}
      draggable={canEdit}
      onDragStart={(e) => {
        if (!canEdit) return
        e.dataTransfer.setData(CUE_DRAG_TYPE, cue.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => {
        if (!canEdit || !isCueDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverRow(position(e))
      }}
      onDrop={(e) => {
        if (!canEdit || !isCueDrag(e)) return
        e.preventDefault()
        const fromId = e.dataTransfer.getData(CUE_DRAG_TYPE)
        if (fromId) onDropRow(fromId, position(e))
      }}
      onDragEnd={onDragEnd}
      className={`h-[52px] ${selected ? 'bg-accent-tint/50' : ''} ${hintClass}`}
    >
      {canEdit && (
        <td
          aria-hidden
          title="끌어서 순서 바꾸기"
          className="static w-9 cursor-grab border-r-0 px-0 text-center text-border-strong"
        >
          <svg viewBox="0 0 24 24" className="mx-auto size-4" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </td>
      )}
      {/* Phase 3.24 PR-B — 현장 큐시트 표기 순서: 시각 · 큐 · 구분 · MC·진행 · 조명 · 영상 · 음향(데이터 칸은 그대로) */}
      <td className={`ui-num text-left text-ink-sub ${canEdit ? 'static border-r-0' : ''}`}>{cue.time_at ?? '—'}</td>
      <td className="font-semibold">{cue.cue_no ?? '—'}</td>
      <td className="text-ink-sub">{cue.segment ?? '—'}</td>
      <td>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate" title={summaryLine(cue.body)}>
            {summaryLine(cue.body)}
          </span>
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="shrink-0 text-xs font-medium text-steel underline-offset-2 hover:underline"
          >
            대본
          </button>
        </span>
      </td>
      <td>
        <ConsoleText value={cue.console_light} />
      </td>
      <td>
        <ConsoleText value={cue.console_screen} />
      </td>
      <td>
        <ConsoleText value={cue.console_audio} />
      </td>
      {canEdit && (
        <td className="px-0 text-center">
          <ActionMenu
            label={`큐 메뉴 ${name}`}
            items={[
              { label: '이 큐 고치기', onSelect: onEdit },
              {
                label: '대본 편집',
                onSelect: () => {
                  onSelect()
                  onEdit()
                },
              },
              { label: '위로 옮기기', onSelect: () => onMove(-1), disabled: isFirst, reason: '맨 위라 안 됨' },
              { label: '아래로 옮기기', onSelect: () => onMove(1), disabled: isLast, reason: '맨 아래라 안 됨' },
              { label: '큐 지우기', onSelect: onDelete, danger: true },
            ]}
          />
        </td>
      )}
    </tr>
  )
}
