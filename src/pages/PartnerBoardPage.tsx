// S-11 파트너 보드 (설계서 v2.4 §10.1·§21) — 주최형 전용. 확정 계약액 등 금액은 어디에도 없다
// (§21.2 R-H3 — grep 가드 범위에 src/pages/Partner*·src/components/partner 포함).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import ErrorAlert from '../components/internal/ErrorAlert'
import InfoTip from '../components/internal/InfoTip'
import PageHeader from '../components/internal/PageHeader'
import StatTile from '../components/internal/StatTile'
import PartnerDeadlineTimeline from '../components/partner/PartnerDeadlineTimeline'
import PartnerDetailPanel from '../components/partner/PartnerDetailPanel'
import PartnerTable from '../components/partner/PartnerTable'
import { currentSubmitGroup, groupHostTasks } from '../components/partner/partnerBoardUtils'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { BOARD_HELP, PARTNER_KPI_HELP } from '../lib/helpTexts'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

/** P8(3.15.1) — KPI 타일 우상단에 도움말을 얹는 얇은 래퍼. StatTile 자체는 손대지 않는다
 *  (이 스킬의 편집 범위 밖) — 별도 relative 컨테이너로 InfoTip을 겹쳐 그린다. */
function KpiTileWithHelp({ help, children }: { help: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <InfoTip text={help} className="absolute right-3 top-3" />
    </div>
  )
}

export default function PartnerBoardPage() {
  const { projectId } = useProject()
  const [searchParams] = useSearchParams()
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const me = useAsync(() => provider.getCurrentUser(), [])
  const partners = useAsync(() => provider.listPartners(projectId), [projectId])
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId), [projectId])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const deliverablesById = useMemo(
    () => new Map((deliverables.data ?? []).map((d) => [d.id, d])),
    [deliverables.data],
  )
  const groups = useMemo(
    () => groupHostTasks(wbsTasks.data ?? [], deliverables.data ?? []),
    [wbsTasks.data, deliverables.data],
  )
  const current = currentSubmitGroup(groups)

  const partnerList = partners.data ?? []
  const reviewPending = partnerList.reduce((sum, p) => sum + p.submission_counts.pending_approval, 0)
  const unresolvedChanges = partnerList.reduce((sum, p) => sum + p.submission_counts.changes_requested, 0)

  const reloadAll = () => {
    partners.reload()
    wbsTasks.reload()
    deliverables.reload()
  }

  const selectedPartner = partnerList.find((p) => p.id === selectedPartnerId) ?? null

  // P3(3.15.1) — 홈 '파트너 검토 대기' 위젯에서 ?partner={id}로 들어오면 해당 파트너를 자동 선택한다.
  useEffect(() => {
    const partnerParam = searchParams.get('partner')
    if (partnerParam && partnerList.some((p) => p.id === partnerParam)) {
      setSelectedPartnerId(partnerParam)
    }
    // partnerList는 partners.data에서 매 렌더 새로 파생되므로 그 원본만 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, partners.data])

  // 선택이 바뀌면(쿼리 진입·KPI 타일 클릭·표 클릭 무관) 상세 패널로 스크롤한다.
  // jsdom엔 scrollIntoView가 없어 테스트 환경에서 undefined일 수 있다 — 선택적 호출로 방어.
  useEffect(() => {
    if (selectedPartnerId) {
      detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedPartnerId])

  const handleReviewPendingClick = () => {
    const target = partnerList.find((p) => p.submission_counts.pending_approval > 0)
    if (target) setSelectedPartnerId(target.id)
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="운영 · S-11" title="파트너 보드" action={<InfoTip text={BOARD_HELP.partner} />} />
      <ErrorAlert message={partners.error} />
      <ErrorAlert message={wbsTasks.error} />
      <ErrorAlert message={deliverables.error} />

      {project.data && project.data.kind !== 'host' && (
        <div className="rounded-md border border-accent/30 bg-accent-tint px-3 py-2 text-xs text-accent-deep">
          이 행사는 대행형입니다 — 행사 설정 ③ 유형·연동에서 주최형으로 전환하면 이 화면이 의미를
          갖습니다.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileWithHelp help={PARTNER_KPI_HELP.count}>
          <StatTile label="파트너 수" value={partnerList.length} />
        </KpiTileWithHelp>
        <KpiTileWithHelp help={PARTNER_KPI_HELP.currentDue}>
          <StatTile
            label="이번 마감 제출"
            value={current ? `${current.submitted}/${current.total}` : '-'}
            tone={current && current.submitted < current.total ? 'accent' : 'default'}
          />
        </KpiTileWithHelp>
        <KpiTileWithHelp help={PARTNER_KPI_HELP.reviewPending}>
          {/* P3(3.15.1) — 클릭 시 검토 대기 항목이 있는 첫 파트너를 선택하고 상세로 스크롤한다. */}
          <button
            type="button"
            onClick={handleReviewPendingClick}
            disabled={reviewPending === 0}
            className="block w-full border-0 bg-transparent p-0 text-left disabled:cursor-default"
          >
            <StatTile label="검토 대기" value={reviewPending} tone={reviewPending > 0 ? 'accent' : 'default'} />
          </button>
        </KpiTileWithHelp>
        <KpiTileWithHelp help={PARTNER_KPI_HELP.changesUnanswered}>
          <StatTile
            label="수정요청 미회신"
            value={unresolvedChanges}
            tone={unresolvedChanges > 0 ? 'negative' : 'default'}
          />
        </KpiTileWithHelp>
      </div>

      <Card title="마감 타임라인">
        {wbsTasks.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
        {!wbsTasks.loading && <PartnerDeadlineTimeline groups={groups} />}
      </Card>

      <Card title="파트너">
        {partners.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
        {!partners.loading && (
          <PartnerTable
            partners={partnerList}
            groups={groups}
            deliverablesById={deliverablesById}
            selectedId={selectedPartnerId}
            onSelect={(id) => setSelectedPartnerId((cur) => (cur === id ? null : id))}
          />
        )}
      </Card>

      {selectedPartner && (
        <div ref={detailRef}>
          <Card title={`파트너 상세 — ${selectedPartner.name}`}>
            <PartnerDetailPanel
              partner={selectedPartner}
              groups={groups}
              currentRole={me.data?.role ?? null}
              onChanged={reloadAll}
            />
          </Card>
        </div>
      )}
    </section>
  )
}
