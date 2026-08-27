// `/p/{token}` 파트너 제출 포털 (v2.4 §10.1 화면 C) — Phase 3.15c(에이전트 AC).
// 슬림 다크 상단 바(행사명+등급 배지+파트너명) → 이번 마감(고정) → 다음 마감(대기, 접힘) →
// 완료된 제출(접힘) → 주최 측 안내(읽기 전용) → 하단 격리 고지. 무로그인 파트너 토큰 경로 —
// 만료·회수는 발주처(/c/*)와 같은 관례로 410 안내(§6.2 화이트리스트).
import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import ClientMessage from '../components/client/ClientMessage'
import { useClientData } from '../components/client/useClientData'
import EmptyState from '../components/internal/EmptyState'
import PartnerPortalDeadlineSection from '../components/partner-portal/PartnerPortalDeadlineSection'
import { groupByDeadline, splitGroups } from '../components/partner-portal/deadlineGroups'
import PartnerPortalGroupList from '../components/partner-portal/PartnerPortalGroupList'
import PartnerPortalHeader from '../components/partner-portal/PartnerPortalHeader'
import PartnerPortalNoticeList from '../components/partner-portal/PartnerPortalNoticeList'
import { formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

export default function PartnerPortalPage() {
  const { token = '' } = useParams()
  const fetcher = useCallback(() => provider.getPartnerPortal(token), [token])
  const { data, loading, errorKind, error, reload } = useClientData(fetcher)

  const groups = data ? groupByDeadline(data.submission_items) : []
  const { current, upcoming, done } = splitGroups(groups)
  const hasNothing = !current && upcoming.length === 0 && done.length === 0

  return (
    <div className="min-h-screen bg-canvas">
      <PartnerPortalHeader
        projectName={data?.project_name ?? null}
        tierName={data?.tier_name ?? null}
        partnerName={data?.partner_name ?? null}
      />

      <main className="mx-auto max-w-3xl px-4 py-6">
        {errorKind === 'gone' && (
          <ClientMessage tone="gone" title="링크가 만료되었습니다" body="담당자에게 새 링크를 요청하세요." />
        )}
        {errorKind === 'not_found' && <ClientMessage tone="error" title="유효하지 않은 링크입니다" />}
        {errorKind === 'other' && (
          <ClientMessage
            tone="error"
            title="오류가 발생했습니다"
            body={error instanceof Error ? error.message : undefined}
          />
        )}

        {!errorKind && loading && !data && (
          <p className="py-12 text-center text-sm text-ink-cap">불러오는 중입니다...</p>
        )}

        {!errorKind && data && (
          <div className="space-y-6 pb-10">
            <div>
              <p className="t-caption">{data.partner_name}</p>
              <h1 className="mt-0.5 t-section-title">제출 현황</h1>
              {data.event_date && (
                <p className="mt-1 text-sm text-ink-sub">
                  행사일 {formatDate(data.event_date)}
                  {data.venue ? ` · ${data.venue}` : ''}
                </p>
              )}
            </div>

            {current && <PartnerPortalDeadlineSection group={current} token={token} onSubmitted={reload} />}
            <PartnerPortalGroupList title="다음 마감 (대기)" groups={upcoming} token={token} onSubmitted={reload} />
            <PartnerPortalGroupList title="완료된 제출" groups={done} token={token} onSubmitted={reload} />

            {hasNothing && (
              <div className="ui-card px-4">
                <EmptyState message="아직 등록된 제출 항목이 없습니다" />
              </div>
            )}

            <PartnerPortalNoticeList notices={data.notices} />

            <p className="border-t border-border pt-4 text-xs text-ink-cap">
              이 링크는 귀사의 제출 현황만 표시합니다. 다른 파트너사의 정보는 이 화면에 포함되지 않습니다.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
