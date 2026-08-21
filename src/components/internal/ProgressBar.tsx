/** 얇은 진행률 바 — gray-200 트랙 + gray-900 채움, 옆에 "n/m" 카운트 */
export default function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div className="h-2 rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs text-gray-500">
        {done}/{total}
      </span>
    </div>
  )
}
