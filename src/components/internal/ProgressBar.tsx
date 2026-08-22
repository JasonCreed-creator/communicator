/** 진행률 바 — §5: 트랙 --track, 필 --accent, 높이 6, r3.
 *  수치 라벨은 항상 바 아래 줄(겹침 재발 금지). */
export default function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
        <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-right text-xs text-ink-sub">
        {done}/{total}
      </div>
    </div>
  )
}
