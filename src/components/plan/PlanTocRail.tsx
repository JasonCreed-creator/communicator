// S9 좌측 고정 목차 레일(188px) — 8개 섹션 + 상태 도트 + 전체 진행률 + 페이지 경계 토글.
// 옛 PlanProgressSummary(6칸 그리드)를 대체한다: 진행률 요약이 인쇄에서 사라지는 관리 위젯이라
// 이동 수단으로 못 쓰던 문제를 목차 레일 한 곳으로 합쳤다. 관리 위젯이므로 인쇄에서는 빠진다.
import type { PlanSectionKey } from '../../types/views'
import PrintExcludedChip from './PrintExcludedChip'
import { PLAN_TOTAL_PAGES } from './planDocMeta'
import {
  PLAN_SECTION_STATE_DOT,
  PLAN_SECTION_STATE_LABELS,
  planSectionAnchor,
  type PlanSectionState,
  type PlanSectionStatus,
} from './planSections'

const STATE_ORDER: PlanSectionState[] = ['complete', 'writing', 'empty']

export default function PlanTocRail({
  statuses,
  activeKey,
  onSelect,
  overall,
  showPageBreaks,
  onTogglePageBreaks,
}: {
  statuses: PlanSectionStatus[]
  activeKey: PlanSectionKey
  onSelect: (key: PlanSectionKey) => void
  overall: { done: number; total: number; pct: number }
  showPageBreaks: boolean
  onTogglePageBreaks: (next: boolean) => void
}) {
  const counts = STATE_ORDER.map((state) => ({
    state,
    count: statuses.filter((s) => s.state === state).length,
  }))

  return (
    <div className="print-hidden hidden w-[188px] shrink-0 flex-col gap-3 lg:sticky lg:top-6 lg:flex">
      <nav aria-label="운영계획서 목차" className="ui-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
          <span className="text-xs font-semibold tracking-[.02em] text-ink">목차</span>
          <PrintExcludedChip />
        </div>
        <ul className="py-1.5">
          {statuses.map((s) => {
            const active = s.key === activeKey
            const empty = s.state === 'empty'
            return (
              <li key={s.key}>
                <a
                  href={`#${planSectionAnchor(s.key)}`}
                  onClick={() => onSelect(s.key)}
                  aria-current={active ? 'true' : undefined}
                  className={`relative flex items-center gap-2 px-3.5 py-2 text-[13px] ${
                    empty
                      ? 'bg-negative-tint text-negative'
                      : active
                        ? 'bg-accent-tint font-medium text-ink'
                        : 'text-ink-sub hover:bg-canvas'
                  }`}
                >
                  {active && !empty && (
                    <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-accent" />
                  )}
                  <span
                    className={`shrink-0 text-[11px] font-semibold tracking-[.04em] ${
                      empty ? 'text-negative' : 'text-brown'
                    }`}
                  >
                    {s.meta.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.meta.title}</span>
                  <span
                    aria-hidden
                    className={`size-[7px] shrink-0 rounded-full ${PLAN_SECTION_STATE_DOT[s.state]}`}
                  />
                  <span className="sr-only">{PLAN_SECTION_STATE_LABELS[s.state]}</span>
                </a>
              </li>
            )
          })}
        </ul>
        <div className="border-t border-border px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="t-caption">전체</span>
            <span className="text-[13px] font-semibold text-ink">{overall.pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
            <div
              className={`h-1.5 rounded-[3px] ${overall.total > 0 && overall.done >= overall.total ? 'bg-positive' : 'bg-accent'}`}
              style={{ width: `${overall.pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-sub">
            {overall.done}/{overall.total} 항목
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {counts.map(({ state, count }) => (
              <span key={state} className="inline-flex items-center gap-1.5 text-[11px] text-ink-cap">
                <span aria-hidden className={`size-[7px] rounded-full ${PLAN_SECTION_STATE_DOT[state]}`} />
                {PLAN_SECTION_STATE_LABELS[state]} {count}
              </span>
            ))}
          </div>
        </div>
      </nav>

      <div className="ui-card px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-ink" id="plan-page-break-label">
            페이지 경계 보기
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showPageBreaks}
            aria-labelledby="plan-page-break-label"
            onClick={() => onTogglePageBreaks(!showPageBreaks)}
            className={`relative inline-flex h-3.5 w-[26px] shrink-0 rounded-full transition-colors ${
              showPageBreaks ? 'bg-accent' : 'bg-track'
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-px size-3 rounded-full bg-card shadow-card transition-all ${
                showPageBreaks ? 'right-px' : 'left-px'
              }`}
            />
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-cap">
          A4 기준 {PLAN_TOTAL_PAGES}쪽 · 여백 16/14mm
        </p>
      </div>
    </div>
  )
}
