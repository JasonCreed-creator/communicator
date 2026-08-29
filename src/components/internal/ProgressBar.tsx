/** 진행률 바 — 패턴 기준 시트 §07: 트랙 --track, 필 --accent, 높이 6, r3.
 *  **100%는 --positive**로 채운다. 수치 라벨은 항상 바 아래 줄 우측(겹침 재발 금지). */
export default function ProgressBar({
  done,
  total,
  hideValue = false,
}: {
  done: number
  total: number
  /** 셀 내 막대처럼 수치를 별도로 배치할 때만 끈다(§05 규칙 10은 바 아래 줄 수치가 기본) */
  hideValue?: boolean
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const complete = total > 0 && done >= total
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
        <div
          className={`h-1.5 rounded-[3px] ${complete ? 'bg-positive' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!hideValue && (
        <div className="mt-1 text-right text-xs text-ink-sub">
          {done}/{total}
        </div>
      )}
    </div>
  )
}
