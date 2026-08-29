// 보드 상태 범례 — 3.17b 시안(`디자인 · 운영 보드`) 정렬.
// 옛 구조는 상태 7개를 그냥 나열해 "무엇이 급한 상태인지"가 안 읽혔다. 패턴 기준 시트 §03의
// **의미 4단계 + 중립**으로 묶고, 각 묶음 옆에 단계 이름(중립·진행·주의·정상·차단)을 단다.
// 계열이 하나(컨펌)뿐인 화면이라 접두 라벨은 붙이지 않는다(§03 규칙).
import { BADGE_BASE } from '../internal/StatusBadge'
import {
  DELIVERABLE_STATUS_LEVEL,
  STATUS_BADGE_CLASSES,
  STATUS_DOT_STATUSES,
  STATUS_LABELS,
  STATUS_LEVELS,
  STATUS_LEVEL_LABELS,
  STATUS_LEVEL_PRINT_GLYPHS,
} from '../../lib/labels'
import { STATUS_HELP } from '../../lib/helpTexts'
import type { DeliverableStatus } from '../../types/enums'

const ALL_STATUSES = Object.keys(STATUS_LABELS) as DeliverableStatus[]

export default function BoardStatusLegend() {
  return (
    <div className="print-hidden flex flex-wrap items-center gap-x-3.5 gap-y-2" aria-label="상태 범례">
      <span className="t-caption">상태 범례</span>
      {STATUS_LEVELS.map((level) => {
        const statuses = ALL_STATUSES.filter((s) => DELIVERABLE_STATUS_LEVEL[s] === level)
        if (statuses.length === 0) return null
        return (
          <span key={level} className="flex items-center gap-1.5" data-legend-level={level}>
            {statuses.map((s) => (
              <span
                key={s}
                title={STATUS_HELP[s]}
                data-level={level}
                data-print-glyph={STATUS_LEVEL_PRINT_GLYPHS[level]}
                className={`${BADGE_BASE} ${STATUS_BADGE_CLASSES[s]}`}
              >
                {STATUS_DOT_STATUSES.includes(s) && (
                  <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                )}
                {STATUS_LABELS[s]}
              </span>
            ))}
            {/* 단계 이름 — 색만으로 급함을 읽게 하지 않는다 */}
            <span className="text-[11px] text-ink-cap">{STATUS_LEVEL_LABELS[level]}</span>
          </span>
        )
      })}
    </div>
  )
}
