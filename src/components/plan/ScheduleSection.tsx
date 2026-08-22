import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'
import { AREA_LABELS, formatDate } from '../../lib/labels'
import type { Milestone } from '../../types/entities'

/** ⑥일정 — 마일스톤 목록(기한·완료 여부·영역) */
export default function ScheduleSection({
  milestones,
  progress,
}: {
  milestones: Milestone[]
  progress: SectionProgressData
}) {
  return (
    <PlanSection number={PLAN_SECTION_META.schedule.number} title={PLAN_SECTION_META.schedule.title} progress={progress}>
      {milestones.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 마일스톤이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    m.done ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-400'
                  }`}
                >
                  {m.done ? '✓' : ''}
                </span>
                <span className={m.done ? 'text-gray-400 line-through' : 'text-gray-900'}>{m.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                <span>{formatDate(m.due_date)}</span>
                <span>{m.area ? AREA_LABELS[m.area] : '전체'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PlanSection>
  )
}
