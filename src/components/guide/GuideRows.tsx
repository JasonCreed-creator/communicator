// 운영가이드 표 섹션 공용 부품 (설계서 v2.13 §23.5 · 디자인지시서 §7-2.13) — 칸 정의 하나로 읽기 표와 편집 표를 함께 그린다.
// 표 규칙은 §7-1.3 규칙 11: 짧은 칸(시각·인원·무전)만 nowrap, 전 칸 상단 정렬, 좌측 패딩으로 머리와 기준선 맞춤.
import type { ReactNode } from 'react'

export interface GuideColumn<R> {
  key: keyof R & string
  label: string
  /** number = 숫자 칸(오른쪽 정렬 · 빈 칸 null) */
  kind?: 'text' | 'number'
  /** 짧은 칸 — 줄바꿈 없이 */
  short?: boolean
  width?: string
  placeholder?: string
  /** 읽기 표에서 칸 내용을 바꿔 그릴 때 */
  render?: (row: R) => ReactNode
}

const TD = 'px-3 py-2 align-top text-sm text-ink'

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function GuideRowsView<R>({
  columns,
  rows,
  empty,
}: {
  columns: GuideColumn<R>[]
  rows: readonly R[]
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-ink-sub">{empty}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`ui-th ${c.kind === 'number' ? 'text-right' : ''}`} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-track">
              {columns.map((c) => {
                const raw = (row as Record<string, unknown>)[c.key]
                const content = c.render ? c.render(row) : cellText(raw) || <span className="text-ink-cap">—</span>
                return (
                  <td
                    key={c.key}
                    className={`${TD} ${c.short || c.kind === 'number' ? 'whitespace-nowrap' : ''} ${c.kind === 'number' ? 'ui-num text-right' : ''}`}
                  >
                    {content}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseCount(text: string): number | null {
  const t = text.replace(/[,\s명]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** 편집 표 — 칸마다 입력, 행 끝 위로·아래로·빼기, 표 아래 행 추가. 바뀐 배열을 통째로 돌려준다 */
export function GuideRowsEditor<R>({
  columns,
  rows,
  onChange,
  newRow,
  addLabel,
  rowLabel,
}: {
  columns: GuideColumn<R>[]
  rows: readonly R[]
  onChange: (next: R[]) => void
  newRow: () => R
  addLabel: string
  /** 접근 이름에 쓰는 행 이름('1행' 대신 '영상 장애' 같은) — 없으면 n행 */
  rowLabel?: (row: R, index: number) => string
}) {
  const set = (i: number, key: string, value: unknown) =>
    onChange(rows.map((r, j) => (j === i ? ({ ...r, [key]: value } as R) : r)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i))
  const name = (row: R, i: number) => rowLabel?.(row, i) || `${i + 1}행`

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="ui-th" style={c.width ? { width: c.width } : undefined}>
                  {c.label}
                </th>
              ))}
              <th className="ui-th w-[112px]">
                <span className="sr-only">행 동작</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-track">
                {columns.map((c) => {
                  const raw = (row as Record<string, unknown>)[c.key]
                  return (
                    <td key={c.key} className="px-2 py-1.5 align-top">
                      <input
                        value={cellText(raw)}
                        placeholder={c.placeholder}
                        inputMode={c.kind === 'number' ? 'numeric' : undefined}
                        onChange={(e) => set(i, c.key, c.kind === 'number' ? parseCount(e.target.value) : e.target.value)}
                        aria-label={`${name(row, i)} ${c.label}`}
                        className={`ui-input w-full text-sm ${c.kind === 'number' ? 'ui-input-num' : ''}`}
                      />
                    </td>
                  )
                })}
                <td className="whitespace-nowrap px-2 py-1.5 align-top">
                  <div className="flex items-center gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`${name(row, i)} 위로`}
                      className="btn btn-ghost btn-sm px-2 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label={`${name(row, i)} 아래로`}
                      className="btn btn-ghost btn-sm px-2 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={`${name(row, i)} 빼기`}
                      className="btn btn-ghost-negative btn-sm px-2"
                    >
                      빼기
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onChange([...rows, newRow()])} className="text-sm font-medium text-accent-deep underline underline-offset-2">
        ＋ {addLabel}
      </button>
    </div>
  )
}

/** 한 줄 목록 편집(시설 규정 메모·지휘 흐름·기프트 메모) */
export function GuideLinesEditor({
  label,
  lines,
  onChange,
  addLabel,
}: {
  label: string
  lines: readonly string[]
  onChange: (next: string[]) => void
  addLabel: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="t-caption mb-1">{label}</legend>
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={line}
            onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
            aria-label={`${label} ${i + 1}`}
            className="ui-input w-full text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            aria-label={`${label} ${i + 1} 빼기`}
            className="btn btn-ghost-negative btn-sm px-2"
          >
            빼기
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lines, ''])} className="text-sm font-medium text-accent-deep underline underline-offset-2">
        ＋ {addLabel}
      </button>
    </fieldset>
  )
}

/** 읽기 목록(메모) */
export function GuideLinesView({ title, lines }: { title: string; lines: readonly string[] }) {
  const kept = lines.map((l) => l.trim()).filter(Boolean)
  if (kept.length === 0) return null
  return (
    <div className="rounded-md bg-canvas px-4 py-3">
      <p className="mb-1 text-sm font-semibold text-ink">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-sub">
        {kept.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}
