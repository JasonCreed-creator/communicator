// S9 운영계획서 — 설계서 v1.2 §10 S9 + v2.5.2 정렬(시안 정본 '운영계획서.dc.html').
// 구성: 좌측 고정 목차 레일(188px, 인쇄 제외) + 발행 게이트 한 줄 + A4 7쪽 시트(표지 1 + 본문 6).
// 섹션 8종(01~08)은 planSections.ts가 정본 순서·번호를 갖고, 쪽 배치는 planDocMeta.PLAN_PAGES가 갖는다.
// 종이 메타포: 캔버스 위 white 시트(.plan-doc) + 상단 오렌지 헤어라인 + 쪽마다 러닝 헤더/푸터.
import { useMemo, useState } from 'react'
import ErrorAlert from '../components/internal/ErrorAlert'
import CuesheetSection from '../components/plan/CuesheetSection'
import EmergencySection from '../components/plan/EmergencySection'
import OverviewSection from '../components/plan/OverviewSection'
import PlanCover from '../components/plan/PlanCover'
import PlanPage from '../components/plan/PlanPage'
import PlanPublishGate from '../components/plan/PlanPublishGate'
import PlanTocRail from '../components/plan/PlanTocRail'
import ProductionSection from '../components/plan/ProductionSection'
import ProgramSection from '../components/plan/ProgramSection'
import RegistrationSection from '../components/plan/RegistrationSection'
import ScheduleSection from '../components/plan/ScheduleSection'
import ZonesSection from '../components/plan/ZonesSection'
import {
  PLAN_PAGES,
  PLAN_TOTAL_PAGES,
  formatPrintedAt,
  planOverallProgress,
  planPageSectionLabel,
  planPublishState,
  planVersionLabel,
} from '../components/plan/planDocMeta'
import { planSectionStatuses } from '../components/plan/planSections'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { ROLE_LABELS } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { PlanData, PlanSectionKey, PlanSectionProgress } from '../types/views'

const provider = getDataProvider()

function progressFor(list: PlanSectionProgress[], key: PlanSectionKey): PlanSectionProgress {
  return list.find((p) => p.key === key) ?? { key, done: 0, total: 0 }
}

export default function PlanDocPage() {
  const { projectId } = useProject()
  const plan = useAsync(() => provider.getPlan(projectId), [projectId])
  const user = useAsync(() => provider.getCurrentUser(), [])
  const [activeKey, setActiveKey] = useState<PlanSectionKey>('overview')
  const [showPageBreaks, setShowPageBreaks] = useState(true)
  // 출력일시는 이 화면을 연 시각으로 고정한다(리렌더마다 흔들리면 표지·푸터 값이 어긋난다)
  const printedAt = useMemo(() => formatPrintedAt(new Date()), [])

  const canEdit = user.data?.role === 'pm' || user.data?.role === 'ops'
  const authorLabel = user.data
    ? `${user.data.name} · ${ROLE_LABELS[user.data.role]}`
    : '—'
  // 운영계획서는 아직 스냅숏 대상 항목이 아니라 조립 뷰다 — 버전 번호를 지어내지 않고 '초안'으로 표기한다
  const versionLabel = planVersionLabel(null)

  const statuses = plan.data ? planSectionStatuses(plan.data.section_progress) : []
  const publish = planPublishState(statuses)
  const overall = planOverallProgress(statuses)

  return (
    <div className="flex items-start gap-5">
      {plan.data && (
        <PlanTocRail
          statuses={statuses}
          activeKey={activeKey}
          onSelect={setActiveKey}
          overall={overall}
          showPageBreaks={showPageBreaks}
          onTogglePageBreaks={setShowPageBreaks}
        />
      )}

      <div className="min-w-0 flex-1 space-y-3">
        {plan.data && (
          <PlanPublishGate
            docStateLabel={publish.docStateLabel}
            locked={publish.locked}
            blocking={publish.blocking}
            versionLabel={versionLabel}
            printedAt={printedAt}
            authorLabel={authorLabel}
            onPrint={() => window.print()}
          />
        )}

        <section className="plan-doc overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {/* 상단 오렌지 4px 헤어라인 — 인쇄에서도 시트 최상단에 남는다 */}
          <div aria-hidden className="h-1 bg-accent" />

          <div className="space-y-2 p-6 sm:p-8">
            <ErrorAlert message={plan.error} />
            <ErrorAlert message={user.error} />
            {plan.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

            {plan.data && (
              <PlanSheet
                plan={plan.data}
                canEdit={canEdit}
                onChanged={plan.reload}
                versionLabel={versionLabel}
                printedAt={printedAt}
                authorLabel={authorLabel}
                showPageBreaks={showPageBreaks}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function PlanSheet({
  plan,
  canEdit,
  onChanged,
  versionLabel,
  printedAt,
  authorLabel,
  showPageBreaks,
}: {
  plan: PlanData
  canEdit: boolean
  onChanged: () => void
  versionLabel: string
  printedAt: string
  authorLabel: string
  showPageBreaks: boolean
}) {
  const eventName = plan.project.name

  const renderSection = (key: PlanSectionKey) => {
    const progress = progressFor(plan.section_progress, key)
    switch (key) {
      case 'overview':
        return <OverviewSection key={key} project={plan.project} progress={progress} />
      case 'program':
        return (
          <ProgramSection
            key={key}
            sessions={plan.program_sessions}
            progress={progress}
            canEdit={canEdit}
            onChanged={onChanged}
            scenario={plan.scenario}
          />
        )
      case 'cuesheet':
        return <CuesheetSection key={key} cuesheet={plan.cuesheet} progress={progress} />
      case 'zones':
        return (
          <ZonesSection
            key={key}
            zones={plan.zones}
            progress={progress}
            guideZone={plan.guide_zone}
          />
        )
      case 'production':
        return <ProductionSection key={key} items={plan.production_items} progress={progress} />
      case 'registration':
        return (
          <RegistrationSection
            key={key}
            stats={plan.registration_stats}
            progress={progress}
            guaranteePax={plan.project.guarantee_pax}
          />
        )
      case 'emergency':
        return <EmergencySection key={key} emergency={plan.emergency} progress={progress} />
      case 'schedule':
        return <ScheduleSection key={key} milestones={plan.milestones} progress={progress} />
      default:
        return null
    }
  }

  return (
    <>
      {PLAN_PAGES.map((page) => {
        const cover = page.sections.length === 0
        return (
          <PlanPage
            key={page.no}
            pageNo={page.no}
            totalPages={PLAN_TOTAL_PAGES}
            eventName={eventName}
            sectionLabel={cover ? null : planPageSectionLabel(page.sections)}
            versionLabel={versionLabel}
            printedAt={printedAt}
            showBoundary={showPageBreaks}
            boundaryNote={cover ? '표지' : page.sections[0] === 'registration' ? '07 비상 대응 전용 장' : undefined}
          >
            {cover ? (
              <PlanCover
                project={plan.project}
                versionLabel={versionLabel}
                printedAt={printedAt}
                authorLabel={authorLabel}
              />
            ) : (
              page.sections.map(renderSection)
            )}
          </PlanPage>
        )
      })}
    </>
  )
}
