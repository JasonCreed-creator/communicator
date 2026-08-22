import SectionProgressBar from './SectionProgressBar'
import { PLAN_SECTION_META, PLAN_SECTION_ORDER } from './planSections'
import type { PlanSectionProgress } from '../../types/views'

/** 문서 상단 섹션별 진행률 요약 — 6개 섹션 전부 항상 표시(빈 데이터도 0/0으로) */
export default function PlanProgressSummary({ sections }: { sections: PlanSectionProgress[] }) {
  const byKey = new Map(sections.map((s) => [s.key, s]))

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {PLAN_SECTION_ORDER.map((key) => {
        const meta = PLAN_SECTION_META[key]
        const progress = byKey.get(key) ?? { key, done: 0, total: 0 }
        return (
          <div key={key} className="min-w-0">
            <p className="truncate text-xs text-gray-500">
              {meta.number} {meta.title}
            </p>
            <div className="mt-1">
              <SectionProgressBar done={progress.done} total={progress.total} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
