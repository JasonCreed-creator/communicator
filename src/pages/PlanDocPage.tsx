// S9 운영계획서 — 설계서 v1.2 §10 S9. 6개 섹션 자동 조립 + 섹션별 진행률 + 인라인 편집(pm·ops) + 인쇄(A4).
import ErrorAlert from '../components/internal/ErrorAlert'
import CuesheetSection from '../components/plan/CuesheetSection'
import OverviewSection from '../components/plan/OverviewSection'
import PlanProgressSummary from '../components/plan/PlanProgressSummary'
import ProductionSection from '../components/plan/ProductionSection'
import ProgramSection from '../components/plan/ProgramSection'
import RegistrationSection from '../components/plan/RegistrationSection'
import ScheduleSection from '../components/plan/ScheduleSection'
import ZonesSection from '../components/plan/ZonesSection'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'
import type { PlanSectionKey, PlanSectionProgress } from '../types/views'

const provider = getDataProvider()

function progressFor(list: PlanSectionProgress[], key: PlanSectionKey): PlanSectionProgress {
  return list.find((p) => p.key === key) ?? { key, done: 0, total: 0 }
}

export default function PlanDocPage() {
  const plan = useAsync(() => provider.getPlan(PROJECT_ID), [])
  const user = useAsync(() => provider.getCurrentUser(), [])

  const canEdit = user.data?.role === 'pm' || user.data?.role === 'ops'

  return (
    <section className="plan-doc mx-auto max-w-[210mm] space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="plan-print-hidden font-mono text-xs text-gray-400">S9</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">운영계획서</h1>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="plan-print-hidden h-9 shrink-0 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:opacity-90"
        >
          인쇄
        </button>
      </div>

      <ErrorAlert message={plan.error} />
      <ErrorAlert message={user.error} />
      {plan.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}

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
          />

          <CuesheetSection
            cuesheet={plan.data.cuesheet}
            progress={progressFor(plan.data.section_progress, 'cuesheet')}
          />

          <ZonesSection zones={plan.data.zones} progress={progressFor(plan.data.section_progress, 'zones')} />

          <ProductionSection
            items={plan.data.production_items}
            progress={progressFor(plan.data.section_progress, 'production')}
          />

          <RegistrationSection
            stats={plan.data.registration_stats}
            progress={progressFor(plan.data.section_progress, 'registration')}
          />

          <ScheduleSection
            milestones={plan.data.milestones}
            progress={progressFor(plan.data.section_progress, 'schedule')}
          />
        </>
      )}
    </section>
  )
}
