/** 도넛 — 패턴 기준 시트 §07: 지름 96 · 두께 12. **단일 비율 1개만**, 다항목 비교 금지.
 *  외부 의존 없이 conic-gradient로 그린다(차트 라이브러리 도입 금지). */
export default function Donut({
  done,
  total,
  label,
  size = 96,
  thickness = 12,
}: {
  done: number
  total: number
  /** 가운데 캡션 — 없으면 퍼센트만 */
  label?: string
  size?: number
  thickness?: number
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const complete = total > 0 && done >= total
  const fill = complete ? 'var(--positive)' : 'var(--accent)'
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ? `${label} ` : ''}진행률 ${pct}%`}
    >
      <div
        className="size-full rounded-full"
        style={{ background: `conic-gradient(${fill} 0 ${pct}%, var(--track) ${pct}% 100%)` }}
      />
      <div
        className="absolute rounded-full bg-card"
        style={{ inset: thickness }}
        aria-hidden
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-ink">{pct}%</span>
        {label && <span className="t-caption mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
