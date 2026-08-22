// S8 영역별 진행률 1행 — 얇은 바(track 트랙 / accent 채움) + 'n/m 확정' 라벨은 바 아래 줄에 배치(겹침 금지).
import { AREA_LABELS } from '../../lib/labels'
import type { AreaProgress } from '../../types'

export default function AreaProgressRow({ progress }: { progress: AreaProgress }) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  return (
    <div>
      <span className="text-sm font-medium text-ink">{AREA_LABELS[progress.area]}</span>
      <div className="mt-1.5 h-1.5 w-full rounded-[3px] bg-track">
        <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 t-caption">
        {progress.done}/{progress.total} 확정
      </div>
    </div>
  )
}
