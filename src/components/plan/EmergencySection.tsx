import { Link } from 'react-router-dom'
import EmptyState from '../internal/EmptyState'
import { renderLiteMarkdown } from './markdown'
import PlanSection from './PlanSection'
import { type SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanEmergencySection } from '../../types/views'

/**
 * v2.5 §23 — 07 비상 대응. 첫 운영가이드 항목의 emergency 섹션을 조립해 읽기 전용으로 렌더한다
 * (편집은 운영가이드 빌더에서). 정렬(v2.5.2): **전용 장**으로 승격 — 새 A4 장에서 시작하고
 * 2px negative 경고 면·solid 번호 배지·옆면 색인 탭을 두른다(PlanSection variant='emergency').
 * 비어 있으면 빈 상태 ②(아이콘 + 한 줄 + ghost 액션 1개)로 다음 행동을 제시한다 — 이 섹션이
 * 비어 있으면 발행 게이트가 컨펌 발송을 잠근다.
 */
export default function EmergencySection({
  emergency,
  progress,
}: {
  emergency: PlanEmergencySection | null
  progress: SectionProgressData
}) {
  return (
    <PlanSection sectionKey="emergency" progress={progress} variant="emergency">
      {!emergency ? (
        <div className="rounded-lg border border-border bg-canvas">
          <EmptyState
            message="등록된 운영가이드 항목이 없습니다."
            action={
              <>
                <p className="max-w-[420px] text-xs leading-relaxed text-ink-cap">
                  운영가이드 빌더의 &lsquo;비상 대응&rsquo; 섹션을 만들면 이 자리에 자동으로 들어옵니다. 이
                  섹션이 비어 있으면 컨펌 발송이 막힙니다.
                </p>
                <Link to="/board/ops" className="btn btn-ghost print-hidden">
                  운영가이드에서 작성
                </Link>
              </>
            }
          />
        </div>
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
