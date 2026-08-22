// S8 발주처 현황 (/c/:token/status) — 읽기 전용: 영역별 진행률·마일스톤·최근 확정본.
import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import AreaProgressRow from '../components/client/AreaProgressRow'
import ClientMessage from '../components/client/ClientMessage'
import FinalItemRow from '../components/client/FinalItemRow'
import MilestoneRow from '../components/client/MilestoneRow'
import { useClientData } from '../components/client/useClientData'
import EmptyState from '../components/internal/EmptyState'
import { ddayLabel, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'

export default function ClientStatusPage() {
  const { token = '' } = useParams()
  const provider = getDataProvider()
  const fetcher = useCallback(() => provider.getClientStatus(token), [provider, token])
  const { data, loading, errorKind, error } = useClientData(fetcher)

  if (errorKind === 'gone') {
    return <ClientMessage tone="gone" title="링크가 만료되었습니다" body="담당자에게 새 링크를 요청하세요." />
  }
  if (errorKind === 'not_found') {
    return <ClientMessage tone="error" title="유효하지 않은 링크입니다" />
  }
  if (errorKind === 'other') {
    return (
      <ClientMessage
        tone="error"
        title="오류가 발생했습니다"
        body={error instanceof Error ? error.message : undefined}
      />
    )
  }

  if (loading && !data) {
    return <p className="px-4 py-12 text-center text-sm text-ink-cap">불러오는 중입니다...</p>
  }
  if (!data) return null

  return (
    <div className="pb-10">
      <div className="border-b border-border bg-card px-4 py-4">
        <p className="t-caption">{data.project_name}</p>
        <h1 className="mt-0.5 t-section-title">진행 현황</h1>
        {data.event_date && (
          <p className="mt-1 text-sm text-ink-sub">
            행사일 {formatDate(data.event_date)} · {ddayLabel(data.event_date)}
          </p>
        )}
      </div>

      <div className="space-y-6 px-4 py-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-sub">영역별 진행률</h2>
          <div className="ui-card space-y-3 p-4">
            {data.area_progress.map((p) => (
              <AreaProgressRow key={p.area} progress={p} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-sub">마일스톤</h2>
          {data.milestones.length === 0 ? (
            <div className="ui-card px-4">
              <EmptyState message="등록된 마일스톤이 없습니다" />
            </div>
          ) : (
            <ul className="ui-card overflow-hidden">
              {data.milestones.map((m) => (
                <MilestoneRow key={m.id} milestone={m} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-sub">최근 확정본</h2>
          {data.recent_finals.length === 0 ? (
            <div className="ui-card px-4">
              <EmptyState message="아직 확정된 산출물이 없습니다" />
            </div>
          ) : (
            <ul className="ui-card overflow-hidden">
              {data.recent_finals.map((f) => (
                <FinalItemRow key={f.version_id} item={f} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
