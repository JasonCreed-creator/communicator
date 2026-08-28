// S-11 파트너 보드 — **PM 접수 대장** (시안 '파트너 보드.dc.html' · Phase 3.17b).
//
// 전제 변경: 파트너는 커뮤니케이터에 로그인하지 않는다. 제출물은 메일·메신저·유선으로 들어오고
// PM이 접수를 기록한다 — 그래서 화면의 동사가 '링크 발송·독촉'에서 **'접수 기록 · 요청 메일'**로,
// 라벨이 제출→접수 / 검토 대기→검토 필요 / 수정요청 미회신→재요청 미회신으로 바뀐다.
// 다만 제출 포털(`/p`)은 현행 유지이므로 이 보드는 포털을 대체하지 않는다 — 포털 제출분과
// PM 접수분이 같은 표에 공존하고, 수신 경로에 '포털'이 한 값으로 들어간다.
// 확정 계약액 등 금액은 이 화면 어디에도 없다(§21.2 R-H3 — grep 가드 범위에 src/pages/Partner*·
// src/components/partner 포함).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import FilterEmptyState from '../components/internal/FilterEmptyState'
import InfoTip from '../components/internal/InfoTip'
import LoadFailedState from '../components/internal/LoadFailedState'
import PageHeader from '../components/internal/PageHeader'
import StatTile from '../components/internal/StatTile'
import TableSkeleton from '../components/internal/TableSkeleton'
import { LevelBadge } from '../components/internal/StatusBadge'
import PartnerDeadlineTimeline from '../components/partner/PartnerDeadlineTimeline'
import PartnerDetailPanel from '../components/partner/PartnerDetailPanel'
import PartnerTable, { partnerBoardStatus } from '../components/partner/PartnerTable'
import { currentSubmitGroup, groupHostTasks } from '../components/partner/partnerBoardUtils'
import { buildMailto } from '../components/partner/partnerReceipt'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { BOARD_HELP, PARTNER_KPI_HELP } from '../lib/helpTexts'
import { PARTNER_STATUS_LABELS, ddayLabel, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { PartnerStatus } from '../types/enums'

const provider = getDataProvider()

type StatusFilter = 'all' | PartnerStatus

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

/** 일 단위 경과 — '가장 오래된 건 n일째'(KPI 보조 수치 1줄, §07) */
function daysSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const detailRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(
    () => groupHostTasks(wbsTasks.data ?? [], deliverables.data ?? []),
    [wbsTasks.data, deliverables.data],
  )
  const current = currentSubmitGroup(groups)

  const partnerList = partners.data ?? []
  const reviewPending = partnerList.reduce((sum, p) => sum + p.submission_counts.pending_approval, 0)
  const unresolvedChanges = partnerList.reduce((sum, p) => sum + p.submission_counts.changes_requested, 0)
  const activeCount = partnerList.filter((p) => p.status === 'active').length
  const withdrawnCount = partnerList.length - activeCount
  const unansweredNames = partnerList
    .filter((p) => p.submission_counts.changes_requested > 0)
    .map((p) => p.name)

  /** 파트너별 최근 접수 — 접수·검토로 상태가 마지막으로 움직인 제출 항목의 갱신 시각 */
  const lastReceiptAt = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of deliverables.data ?? []) {
      if (!d.partner_id || d.status === 'requested') continue
      const cur = map.get(d.partner_id)
      if (!cur || d.updated_at > cur) map.set(d.partner_id, d.updated_at)
    }
    return map
  }, [deliverables.data])

  /** 검토 필요 중 가장 오래 기다린 건 — KPI 보조 수치 */
  const oldestPendingDays = useMemo(() => {
    const pending = (deliverables.data ?? []).filter(
      (d) => d.partner_id && d.status === 'pending_approval',
    )
    if (pending.length === 0) return null
    return Math.max(...pending.map((d) => daysSince(d.updated_at)))
  }, [deliverables.data])

  const reloadAll = () => {
    partners.reload()
    wbsTasks.reload()
    deliverables.reload()
  }

  const selectedPartner = partnerList.find((p) => p.id === selectedPartnerId) ?? null
  const shownPartners = partnerList.filter((p) => statusFilter === 'all' || p.status === statusFilter)

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

  const projectName = project.data?.name ?? ''

  /** 미접수처 일괄 요청 메일 — 앱이 보내지 않고 사용자의 메일 프로그램을 연다(bcc로 분리 발송) */
  const bulkMailto = useMemo(() => {
    const targets = partnerList.filter(
      (p) => p.status === 'active' && p.submission_counts.requested > 0 && p.token,
    )
    if (targets.length === 0) return null
    return buildMailto({
      bcc: targets.map((p) => p.token!.contact_email),
      subject: `[${projectName}] 미접수 제출 자료 요청`,
      body: `안녕하세요, ${projectName} 사무국입니다.\n\n아직 접수되지 않은 제출 자료가 있어 안내드립니다.\n마감 전 회신 부탁드립니다.\n\n감사합니다.`,
    })
  }, [partnerList, projectName])

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="운영 · S-11" title="파트너 보드" action={<InfoTip text={BOARD_HELP.partner} />} />
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
          <StatTile
            label="파트너 수"
            value={partnerList.length}
            support={`참여 중 ${activeCount} · ${PARTNER_STATUS_LABELS.withdrawn} ${withdrawnCount}`}
          />
        </KpiTileWithHelp>
        <KpiTileWithHelp help={PARTNER_KPI_HELP.currentDue}>
          <StatTile
            label="이번 마감 접수"
            value={current ? `${current.submitted}/${current.total}` : '-'}
            tone={current && current.submitted < current.total ? 'accent' : 'default'}
            support={
              current ? (
                <span className="block truncate">
                  {current.code} {current.title}
                  {current.end_date ? ` · ${ddayLabel(current.end_date)}` : ''}
                </span>
              ) : (
                '전개된 제출 마감이 없습니다'
              )
            }
          />
        </KpiTileWithHelp>
        <KpiTileWithHelp help={PARTNER_KPI_HELP.reviewPending}>
          {/* P3(3.15.1) — 클릭 시 검토 필요 항목이 있는 첫 파트너를 선택하고 상세로 스크롤한다. */}
          <button
            type="button"
            onClick={handleReviewPendingClick}
            disabled={reviewPending === 0}
            className="block w-full border-0 bg-transparent p-0 text-left disabled:cursor-default"
          >
            <StatTile
              label="접수 후 검토 필요"
              value={reviewPending}
              tone={reviewPending > 0 ? 'accent' : 'default'}
              support={
                oldestPendingDays == null
                  ? '검토를 기다리는 건이 없습니다'
                  : `가장 오래된 건 ${oldestPendingDays}일째`
              }
            />
          </button>
        </KpiTileWithHelp>
        <KpiTileWithHelp help={PARTNER_KPI_HELP.changesUnanswered}>
          <StatTile
            label="재요청 미회신"
            value={unresolvedChanges}
            tone={unresolvedChanges > 0 ? 'negative' : 'default'}
            support={
              unansweredNames.length === 0 ? (
                '미회신 없음'
              ) : (
                <span className="block truncate">{unansweredNames.join(' · ')}</span>
              )
            }
          />
        </KpiTileWithHelp>
      </div>

      <Card title="마감 타임라인">
        {wbsTasks.loading && <TableSkeleton rows={2} columns={5} />}
        {!wbsTasks.loading && <PartnerDeadlineTimeline groups={groups} />}
      </Card>

      <Card
        title="파트너"
        action={
          <div className="flex flex-wrap items-center gap-2 print-hidden">
            <label className="sr-only" htmlFor="partner-status-filter">
              참여 상태 필터
            </label>
            <select
              id="partner-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="ui-input h-7 min-h-0 py-0 text-xs"
            >
              <option value="all">전체 상태</option>
              <option value="active">{PARTNER_STATUS_LABELS.active}</option>
              <option value="withdrawn">{PARTNER_STATUS_LABELS.withdrawn}</option>
            </select>
            {bulkMailto ? (
              <a href={bulkMailto} className="btn btn-ghost btn-sm">
                미접수처 일괄 요청 메일
              </a>
            ) : (
              <button type="button" disabled className="btn btn-ghost btn-sm" title="미접수 파트너가 없습니다">
                미접수처 일괄 요청 메일
              </button>
            )}
          </div>
        }
      >
        {/* ① 로딩 = 표 스켈레톤(스피너 금지) · ⑤ 로드 실패 = 원문 + 재시도 */}
        {partners.loading && <TableSkeleton rows={5} columns={7} />}
        {!partners.loading && partners.error && (
          <LoadFailedState message={partners.error} onRetry={partners.reload} />
        )}
        {!partners.loading && !partners.error && partnerList.length === 0 && (
          <EmptyState message="등록된 파트너가 없습니다 — 행사 설정 ② 담당자에서 파트너를 추가하세요." />
        )}
        {!partners.loading && !partners.error && partnerList.length > 0 && shownPartners.length === 0 && (
          <FilterEmptyState
            totalCount={partnerList.length}
            filters={[
              {
                label: '참여 상태',
                value:
                  statusFilter === 'active'
                    ? PARTNER_STATUS_LABELS.active
                    : PARTNER_STATUS_LABELS.withdrawn,
              },
            ]}
            onReset={() => setStatusFilter('all')}
          />
        )}
        {!partners.loading && !partners.error && shownPartners.length > 0 && (
          <PartnerTable
            partners={shownPartners}
            lastReceiptAt={lastReceiptAt}
            selectedId={selectedPartnerId}
            onSelect={(id) => setSelectedPartnerId((cur) => (cur === id ? null : id))}
          />
        )}
      </Card>

      {selectedPartner && (
        <div ref={detailRef}>
          <Card
            title={`파트너 상세 — ${selectedPartner.name}`}
            action={
              <div className="flex items-center gap-2">
                {(() => {
                  const s = partnerBoardStatus(selectedPartner)
                  return <LevelBadge level={s.level} label={s.label} />
                })()}
                {selectedPartner.next_deadline?.end_date && (
                  <span className="t-caption">
                    다음 마감 {formatDate(selectedPartner.next_deadline.end_date)}
                  </span>
                )}
              </div>
            }
          >
            <PartnerDetailPanel
              partner={selectedPartner}
              groups={groups}
              projectName={projectName}
              currentRole={me.data?.role ?? null}
              onChanged={reloadAll}
            />
          </Card>
        </div>
      )}
    </section>
  )
}
