import type { ReactNode } from 'react'

/** KPI 스탯 타일 — 패턴 기준 시트 §07: 숫자 31/650(tabular) + 캡션 + **보조 수치 1줄(구분선 위)**.
 *  tone으로 지연(negative)·임박(accent) 강조. support를 주면 구분선 아래 한 줄이 붙는다. */
export default function StatTile({
  label,
  value,
  tone = 'default',
  support,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'accent' | 'negative'
  /** 보조 수치 1줄 — 산식·대비율·분해값 등. 없으면 구분선도 렌더하지 않는다. */
  support?: ReactNode
}) {
  const valueClass =
    tone === 'negative'
      ? 'kpi-num text-negative'
      : tone === 'accent'
        ? 'kpi-num text-accent-deep'
        : 'kpi-num'
  return (
    <div className="ui-card p-5">
      <div className={valueClass}>{value}</div>
      <div className="t-caption mt-1.5">{label}</div>
      {support != null && (
        <div className="mt-3 border-t border-border pt-2.5 text-xs text-ink-sub">{support}</div>
      )}
    </div>
  )
}
