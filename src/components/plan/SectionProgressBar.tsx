import type { SectionProgressData } from './planSections'

/** 섹션 진행률 바 — total=0이면 0%로 표기(가드) */
export default function SectionProgressBar({ done, total }: SectionProgressData) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-gray-200">
        <div className="h-1.5 rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-xs text-gray-500">
        {done}/{total} ({pct}%)
      </span>
    </div>
  )
}
