// S-11 파트너 보드 (설계서 v2.4 §10.1·§21) — 주최형 전용. 확정 계약액 등 금액은 어디에도 없다
// (§21.2 R-H3 — grep 가드 범위에 src/pages/Partner*·src/components/partner 포함).
import { useMemo, useState } from 'react'
import Card from '../components/internal/Card'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import StatTile from '../components/internal/StatTile'
import PartnerDeadlineTimeline from '../components/partner/PartnerDeadlineTimeline'
import PartnerDetailPanel from '../components/partner/PartnerDetailPanel'
import PartnerTable from '../components/partner/PartnerTable'
import { currentSubmitGroup, groupHostTasks } from '../components/partner/partnerBoardUtils'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

export default function PartnerBoardPage() {
  const { projectId } = useProject()
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const me = useAsync(() => provider.getCurrentUser(), [])
  const partners = useAsync(() => provider.listPartners(projectId), [projectId])
  const wbsTasks = useAsync(() => provider.listWbsTasks(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId), [projectId])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)

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

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="운영 · S-11" title="파트너 보드" />
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
        <StatTile label="파트너 수" value={partnerList.length} />
        <StatTile
          label="이번 마감 제출"
          value={current ? `${current.submitted}/${current.total}` : '-'}
          tone={current && current.submitted < current.total ? 'accent' : 'default'}
        />
        <StatTile label="검토 대기" value={reviewPending} tone={reviewPending > 0 ? 'accent' : 'default'} />
        <StatTile
          label="수정요청 미회신"
          value={unresolvedChanges}
          tone={unresolvedChanges > 0 ? 'negative' : 'default'}
        />
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
        <Card title={`파트너 상세 — ${selectedPartner.name}`}>
          <PartnerDetailPanel
            partner={selectedPartner}
            groups={groups}
            currentRole={me.data?.role ?? null}
            onChanged={reloadAll}
          />
        </Card>
      )}
    </section>
  )
}
