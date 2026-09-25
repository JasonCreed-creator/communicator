import { daysUntil, dueLabel } from '../../lib/labels'

/** 날짜 기반 기한 뱃지 — 지난 기한('n일 지남')만 negative로 강조, 그 외는 중립 톤 (§3 · §7-2.2) */
export default function DdayBadge({ isoDate }: { isoDate: string }) {
  const overdue = daysUntil(isoDate) < 0
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        overdue ? 'bg-negative-tint text-negative' : 'bg-track text-ink-sub'
      }`}
    >
      {dueLabel(isoDate)}
    </span>
  )
}
