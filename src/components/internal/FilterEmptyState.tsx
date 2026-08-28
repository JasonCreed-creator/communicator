import type { ReactNode } from 'react'

export interface AppliedFilter {
  /** 필터 이름(예: '단계') */
  label: string
  /** 적용된 값(예: '제작') */
  value: string
}

/** 빈 상태 ③ 필터 결과 없음 — 패턴 기준 시트 §06.
 *  데이터는 있는데 필터가 걸러낸 경우다. **② 데이터 없음과 반드시 구분**해야 하므로
 *  전체 건수 + 적용된 필터 칩 + 초기화를 함께 보여준다. */
export default function FilterEmptyState({
  totalCount,
  filters,
  onReset,
  unit = '건',
  extra,
}: {
  /** 필터를 걷어냈을 때 남는 전체 건수 */
  totalCount: number
  filters: AppliedFilter[]
  onReset: () => void
  unit?: string
  extra?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-ink-sub">
        조건에 맞는 항목이 없습니다. 전체 {totalCount}
        {unit} 중 0{unit}.
      </p>
      {filters.length > 0 && (
        <ul className="flex flex-wrap items-center justify-center gap-1.5">
          {filters.map((f) => (
            <li
              key={`${f.label}:${f.value}`}
              className="inline-flex items-center gap-1 rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub"
            >
              <span className="text-ink-cap">{f.label}</span>
              {f.value}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onReset} className="btn btn-ghost btn-sm">
        필터 초기화
      </button>
      {extra}
    </div>
  )
}
