/** 스택 막대 — 패턴 기준 시트 §07: 12px · r999 · **accent 3단**(accent-deep → accent → role-reg).
 *  **구성 비율 전용**이며 3단 초과 금지. 4번째 구성이 불가피하면 accent 램프를 늘리지 말고
 *  `restLabel`로 중립(track) 잔여 구간을 쓴다 — 램프를 늘리면 §07 규격이 깨진다. */
const RAMP = ['bg-accent-deep', 'bg-accent', 'bg-role-reg'] as const

export interface StackedSegment {
  label: string
  value: number
}

export default function StackedBar({
  segments,
  rest,
  formatValue,
}: {
  /** 최대 3개 — accent 3단에 1:1 대응 */
  segments: StackedSegment[]
  /** 나머지 구성(중립 track) — 4번째 이상을 묶어 넣는 자리 */
  rest?: StackedSegment
  formatValue?: (value: number, pct: number) => string
}) {
  const shown = segments.slice(0, RAMP.length)
  const all = rest ? [...shown, rest] : shown
  const total = all.reduce((sum, s) => sum + s.value, 0)
  const pct = (v: number) => (total === 0 ? 0 : (v / total) * 100)

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-track">
        {all.map((s, i) => (
          <div
            key={s.label}
            className={i < shown.length ? RAMP[i] : 'bg-track'}
            style={{ width: `${pct(s.value)}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {all.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs text-ink-sub">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${
                i < shown.length ? RAMP[i] : 'bg-border-strong'
              }`}
            />
            {s.label}
            <span className="text-ink-cap">
              {formatValue
                ? formatValue(s.value, Math.round(pct(s.value)))
                : `${Math.round(pct(s.value))}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
