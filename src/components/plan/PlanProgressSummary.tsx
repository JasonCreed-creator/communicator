import SectionProgressBar from './SectionProgressBar'
import { PLAN_SECTION_META, PLAN_SECTION_ORDER } from './planSections'
import type { PlanSectionProgress } from '../../types/views'

/** 문서 상단 도구 영역(진행률 요약) — 7개 섹션 전부 항상 표시(빈 데이터도 0/0으로).
 *  시트 안 캔버스 인셋 패널로 분리(§5 카드 안 카드 금지) + 인쇄 시 숨김(관리용 요약이지 문서
 *  본문이 아니므로 plan-print-hidden). */
export default function PlanProgressSummary({ sections }: { sections: PlanSectionProgress[] }) {
  const byKey = new Map(sections.map((s) => [s.key, s]))

  return (
    <div className="plan-print-hidden grid grid-cols-1 gap-4 rounded-lg bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {PLAN_SECTION_ORDER.map((key) => {
        const meta = PLAN_SECTION_META[key]
        const progress = byKey.get(key) ?? { key, done: 0, total: 0 }
        return (
          <div key={key} className="min-w-0">
            <p className="t-caption truncate">
              {meta.number} {meta.title}
            </p>
            <div className="mt-1.5">
              <SectionProgressBar done={progress.done} total={progress.total} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
