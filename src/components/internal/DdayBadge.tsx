import { ddayLabel } from '../../lib/labels'

/** 날짜 기반 D-day 뱃지 — 지난 기한(D+n)만 negative로 강조, 그 외는 중립 톤 (§3) */
export default function DdayBadge({ isoDate }: { isoDate: string }) {
  const label = ddayLabel(isoDate)
  const overdue = label.startsWith('D+')
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        overdue ? 'bg-negative-tint text-negative' : 'bg-track text-ink-sub'
      }`}
    >
      {label}
    </span>
  )
}
