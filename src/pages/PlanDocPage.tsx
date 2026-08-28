// S9 운영계획서 — 설계서 v1.2 §10 S9. 7개 섹션 자동 조립 + 섹션별 진행률 + 인라인 편집(pm·ops) + 인쇄(A4).
// 디자인지시서 v1 §6 S9 — 종이 메타포: 캔버스 위 중앙 white 시트(.plan-doc) + 상단 오렌지 헤어라인.
import ErrorAlert from '../components/internal/ErrorAlert'
import CuesheetSection from '../components/plan/CuesheetSection'
import EmergencySection from '../components/plan/EmergencySection'
import OverviewSection from '../components/plan/OverviewSection'
import PlanProgressSummary from '../components/plan/PlanProgressSummary'
import ProductionSection from '../components/plan/ProductionSection'
import ProgramSection from '../components/plan/ProgramSection'
import RegistrationSection from '../components/plan/RegistrationSection'
import ScheduleSection from '../components/plan/ScheduleSection'
import ZonesSection from '../components/plan/ZonesSection'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'
import type { PlanSectionKey, PlanSectionProgress } from '../types/views'

const provider = getDataProvider()

function progressFor(list: PlanSectionProgress[], key: PlanSectionKey): PlanSectionProgress {
  return list.find((p) => p.key === key) ?? { key, done: 0, total: 0 }
}

export default function PlanDocPage() {
  const { projectId } = useProject()
  const plan = useAsync(() => provider.getPlan(projectId), [projectId])
  const user = useAsync(() => provider.getCurrentUser(), [])

  const canEdit = user.data?.role === 'pm' || user.data?.role === 'ops'

  return (
    <section className="plan-doc mx-auto max-w-[880px] overflow-hidden rounded-b-xl border border-border bg-card shadow-card">
      {/* 상단 오렌지 4px 헤어라인 — 인쇄에서도 시트 최상단에 남는다 */}
      <div aria-hidden className="h-1 bg-accent" />

      <div className="space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="plan-print-hidden t-caption">S9</p>
            <h1 className="t-page-title mt-1">운영계획서</h1>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-ghost plan-print-hidden shrink-0"
          >
            인쇄
          </button>
        </div>

        <ErrorAlert message={plan.error} />
        <ErrorAlert message={user.error} />
        {plan.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

        {plan.data && (
          <>
            <PlanProgressSummary sections={plan.data.section_progress} />

            <OverviewSection
              project={plan.data.project}
              progress={progressFor(plan.data.section_progress, 'overview')}
              canEdit={canEdit}
              onSaved={plan.reload}
            />

            <ProgramSection
              sessions={plan.data.program_sessions}
              progress={progressFor(plan.data.section_progress, 'program')}
              canEdit={canEdit}
              onChanged={plan.reload}
              scenario={plan.data.scenario}
            />

            <CuesheetSection
              cuesheet={plan.data.cuesheet}
              progress={progressFor(plan.data.section_progress, 'cuesheet')}
            />

            <ZonesSection
              zones={plan.data.zones}
              progress={progressFor(plan.data.section_progress, 'zones')}
              guideZone={plan.data.guide_zone}
            />

            <ProductionSection
              items={plan.data.production_items}
              progress={progressFor(plan.data.section_progress, 'production')}
            />

            <RegistrationSection
              stats={plan.data.registration_stats}
              progress={progressFor(plan.data.section_progress, 'registration')}
            />

            <EmergencySection
              emergency={plan.data.emergency}
              progress={progressFor(plan.data.section_progress, 'emergency')}
            />

            <ScheduleSection
              milestones={plan.data.milestones}
              progress={progressFor(plan.data.section_progress, 'schedule')}
            />
          </>
        )}
      </div>
    </section>
  )
}
