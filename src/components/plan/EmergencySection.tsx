import { renderLiteMarkdown } from './markdown'
import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanEmergencySection } from '../../types/views'

/**
 * v2.5 §23 — ⑦비상 대응. 첫 운영가이드 항목의 emergency 섹션을 조립해 읽기 전용으로 렌더한다
 * (편집은 운영가이드 빌더에서). 운영가이드 항목이 아직 없거나 emergency 섹션이 없으면 빈 상태
 * 문구만 보여준다 — 다른 섹션(존별 운영 등)의 빈 상태 관례와 동일.
 */
export default function EmergencySection({
  emergency,
  progress,
}: {
  emergency: PlanEmergencySection | null
  progress: SectionProgressData
}) {
  return (
    <PlanSection
      number={PLAN_SECTION_META.emergency.number}
      title={PLAN_SECTION_META.emergency.title}
      progress={progress}
    >
      {!emergency ? (
        <p className="text-xs text-ink-cap">등록된 운영가이드 항목이 없습니다.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{emergency.title}</h3>
            <StatusPill status={emergency.status} />
          </div>
          {emergency.content?.trim() ? (
            <div className="text-sm text-ink-sub">{renderLiteMarkdown(emergency.content)}</div>
          ) : (
            <p className="text-xs text-ink-cap">본문 미작성</p>
          )}
        </>
      )}
    </PlanSection>
  )
}
