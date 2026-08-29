// 보드 그룹 헤딩 — 3.17b 시안(`디자인 · 운영 보드`) 정렬.
// 건수만으로는 진척이 안 보여서 **진행 막대(88px) + '확정 n/m'**을 붙였다.
// 막대 규격은 패턴 기준 시트 §07 정본(6px · r3 · track/accent, 100%는 positive) — ProgressBar 재사용.
import ProgressBar from '../internal/ProgressBar'

export default function BoardGroupHeading({
  label,
  count,
  doneCount,
}: {
  label: string
  count: number
  /** 확정(final) 건수 */
  doneCount: number
}) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="text-xs font-medium tracking-wide text-brown">{label}</span>
      <span className="text-xs text-ink-cap">{count}건</span>
      <span data-testid="board-group-progress" className="w-[88px] shrink-0">
        <ProgressBar done={doneCount} total={count} hideValue />
      </span>
      <span className="text-[11px] text-ink-cap">
        확정 {doneCount}/{count}
      </span>
    </div>
  )
}
