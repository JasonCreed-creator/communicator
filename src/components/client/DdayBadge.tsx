// 컨펌 기한 D-day 뱃지 — 라벨 텍스트는 lib/labels.ts의 ddayLabel(정본)을 그대로 사용하고,
// 색조만 라벨 문자열을 파싱해 결정한다(날짜 계산 로직 중복 방지).
import { ddayLabel } from '../../lib/labels'

function toneFor(label: string): string {
  if (label === 'D-day' || label.startsWith('D+')) return 'bg-red-50 text-red-800'
  const remaining = Number(label.slice(2))
  if (!Number.isNaN(remaining) && remaining <= 3) return 'bg-amber-50 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

export default function DdayBadge({ dueAt }: { dueAt: string }) {
  const label = ddayLabel(dueAt)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${toneFor(label)}`}
    >
      {label}
    </span>
  )
}
