import { ddayLabel } from '../../lib/labels'

/** 날짜 기반 D-day 뱃지 — 지난 기한(D+n)만 잉크 레드로 강조, 그 외는 중립 톤 */
export default function DdayBadge({ isoDate }: { isoDate: string }) {
  const label = ddayLabel(isoDate)
  const overdue = label.startsWith('D+')
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        overdue ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </span>
  )
}
