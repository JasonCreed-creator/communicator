// 홈 요약 타일 5칸 (디자인지시서 v1.4 §7-2.5) — 숫자 하나 + 한 줄 설명. 판단은 아래 '오늘 할 일' 목록이 한다.
// 빨강은 지연에만(§7-2 진단 2 — 강조는 굵기로).

export interface SummaryTile {
  key: string
  label: string
  value: number
  note: string
  /** 지연처럼 0이 아니면 빨강으로 읽어야 하는 수 */
  alertWhenPositive?: boolean
}

export default function HomeSummaryTiles({ tiles }: { tiles: SummaryTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.key} data-testid={`home-tile-${t.key}`} className="ui-card flex min-w-0 flex-col gap-1 px-4 py-3.5">
          <span className="t-caption">{t.label}</span>
          <span
            className={`text-2xl font-bold leading-[30px] tabular-nums ${
              t.alertWhenPositive && t.value > 0 ? 'text-negative' : 'text-ink'
            }`}
          >
            {t.value}
          </span>
          <span className="truncate text-xs text-ink-sub" title={t.note}>
            {t.note}
          </span>
        </div>
      ))}
    </div>
  )
}
