import {
  STATUS_BADGE_CLASSES,
  STATUS_DOT_STATUSES,
  STATUS_LABELS,
  STATUS_LEVEL_CLASSES,
  STATUS_LEVEL_PRINT_GLYPHS,
  DELIVERABLE_STATUS_LEVEL,
  type StatusLevel,
} from '../../lib/labels'
import type { DeliverableStatus } from '../../types/enums'

/** 배지 공용 규격 — 패턴 기준 시트 §03: inline-flex · rounded-full · px-2 py-0.5 · text-xs font-medium */
export const BADGE_BASE =
  'ui-badge inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium'

/** 의미 4단계 + 중립 배지 — 계열(컨펌·WBS·파트너·정산·시트)은 색이 아니라 접두 라벨로 구분한다.
 *  색만으로 구분하지 않으므로 label은 필수다. dot은 '내 행동을 기다리는' 상태에만 붙인다(§03). */
export function LevelBadge({
  level,
  label,
  prefix,
  dot = false,
  className = '',
}: {
  level: StatusLevel
  label: string
  /** 한 화면에 여러 계열이 섞일 때만 붙이는 접두 라벨(열 헤더가 계열을 말하면 생략) */
  prefix?: string
  dot?: boolean
  className?: string
}) {
  return (
    <span
      data-level={level}
      data-print-glyph={STATUS_LEVEL_PRINT_GLYPHS[level]}
      className={`${BADGE_BASE} ${STATUS_LEVEL_CLASSES[level]} ${className}`}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {prefix ? `${prefix} ${label}` : label}
    </span>
  )
}

// 컨펌 계열 상태 뱃지 — 디자인지시서 v1 §3 / 패턴 기준 시트 §03.
// pending_approval(컨펌대기)만 좌측 도트를 동반한다.
export default function StatusBadge({ status }: { status: DeliverableStatus }) {
  const level = DELIVERABLE_STATUS_LEVEL[status]
  return (
    <span
      data-level={level}
      data-print-glyph={STATUS_LEVEL_PRINT_GLYPHS[level]}
      className={`${BADGE_BASE} ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_DOT_STATUSES.includes(status) && (
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}
