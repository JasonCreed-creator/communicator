import type { ReactNode } from 'react'

export type SortDirection = 'asc' | 'desc'

/** 표 헤더 정렬 버튼 — 패턴 기준 시트 §05 규칙 05: 비활성 `↕` / 활성 `↓ ↑`.
 *  **조건 3: 정렬 가능한 열에만** 붙인다 — 큐시트처럼 순서 자체가 의미인 표에는 쓰지 않는다. */
export default function SortableTh({
  children,
  active,
  direction,
  onSort,
  className = '',
  numeric = false,
}: {
  children: ReactNode
  active: boolean
  direction: SortDirection
  onSort: () => void
  className?: string
  /** 숫자·금액 열이면 우측정렬(§05 규칙 03) */
  numeric?: boolean
}) {
  const glyph = !active ? '↕' : direction === 'asc' ? '↑' : '↓'
  return (
    <th
      className={`ui-th ${numeric ? 'text-right' : ''} ${className}`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-1 ${
          numeric ? 'flex-row-reverse' : ''
        } ${active ? 'text-ink' : 'text-ink-cap'} hover:text-ink`}
      >
        {children}
        <span aria-hidden className="text-[11px]">
          {glyph}
        </span>
      </button>
    </th>
  )
}
