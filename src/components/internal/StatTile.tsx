/** KPI 스탯 타일 — §6 S1: 숫자 31/650(tabular) + 캡션 라벨. tone으로 지연(negative)·임박(accent) 강조 */
export default function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'accent' | 'negative'
}) {
  const valueClass =
    tone === 'negative' ? 'kpi-num text-negative' : tone === 'accent' ? 'kpi-num text-accent-deep' : 'kpi-num'
  return (
    <div className="ui-card p-5">
      <div className={valueClass}>{value}</div>
      <div className="t-caption mt-1.5">{label}</div>
    </div>
  )
}
