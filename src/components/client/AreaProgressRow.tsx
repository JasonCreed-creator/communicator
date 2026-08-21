// S8 영역별 진행률 1행 — 얇은 바(gray-200 트랙 / gray-900 채움) + 'n/m 확정' 라벨.
import { AREA_LABELS } from '../../lib/labels'
import type { AreaProgress } from '../../types'

export default function AreaProgressRow({ progress }: { progress: AreaProgress }) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-900">{AREA_LABELS[progress.area]}</span>
        <span className="text-gray-500">
          {progress.done}/{progress.total} 확정
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-gray-200">
        <div className="h-2 rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
