// 컨펌 기한 D-day 뱃지 — 라벨 텍스트는 lib/labels.ts의 ddayLabel(정본)을 그대로 사용하고,
// 색조만 라벨 문자열을 파싱해 결정한다(날짜 계산 로직 중복 방지). 색은 §3: 지연=negative·임박=accent.
import { ddayLabel } from '../../lib/labels'

function toneFor(label: string): string {
  if (label === 'D-day' || label.startsWith('D+')) return 'bg-negative-tint text-negative'
  const remaining = Number(label.slice(2))
  if (!Number.isNaN(remaining) && remaining <= 3) return 'bg-accent-tint text-accent-deep'
  return 'bg-track text-ink-sub'
}

export default function DdayBadge({ dueAt }: { dueAt: string }) {
  const label = ddayLabel(dueAt)
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${toneFor(label)}`}
    >
      {label}
    </span>
  )
}
