// S8 영역별 진행률 1행 — 얇은 바(track 트랙 / accent 채움) + 'n/m 확정' 라벨은 바 아래 줄에 배치(겹침 금지).
// 시안: 우측에 '확정 대기 n건'(컨펌 큐 집계) — 내부 태스크 수는 쓰지 않는다.
import { AREA_LABELS } from '../../lib/labels'
import type { AreaProgress } from '../../types'

export default function AreaProgressRow({
  progress,
  pending = 0,
}: {
  progress: AreaProgress
  /** 이 영역에서 고객사 컨펌을 기다리는 건수 */
  pending?: number
}) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{AREA_LABELS[progress.area]}</span>
        <span className="text-xs text-ink-sub">확정 대기 {pending}건</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-[3px] bg-track">
        <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 t-caption">
        {progress.done}/{progress.total} 확정
      </div>
    </div>
  )
}
