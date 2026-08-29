// S8 발주처 현황 (/c/:token/status) — 읽기 전용.
// 시안 「발주처 보드」 정본: 전체 진행률 도넛 + 행사 D-day → '지금 필요한 것' 2장 →
// 영역별 진행률 → 다가오는 일정(고객사 관여 날짜만) → 최근 확정본.
// 넘어가지 않는 것: 금액 일체 · WBS 코드 · 역할 컬러 · 파트너사명 · 지연 태스크 목록.
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import AreaProgressRow from '../components/client/AreaProgressRow'
import ClientActionCard from '../components/client/ClientActionCard'
import ClientContactCard, { type ClientContactPerson } from '../components/client/ClientContactCard'
import ClientMessage from '../components/client/ClientMessage'
import ClientProgressHeader from '../components/client/ClientProgressHeader'
import ClientScheduleRow from '../components/client/ClientScheduleRow'
import FinalItemRow from '../components/client/FinalItemRow'
import { useClientData } from '../components/client/useClientData'
import {
  areaPending,
  deriveClientMaterials,
  deriveClientSchedule,
  earliestDueAt,
} from '../components/client/clientDerive'
import EmptyState from '../components/internal/EmptyState'
import { LevelBadge } from '../components/internal/StatusBadge'
import { ddayLabel } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { MemberRole } from '../types/enums'

/** 발주처 지면의 역할 표기 — 내부 약칭(ROLE_LABELS) 대신 "누구에게 연락하면 되는지"가 읽히는 말로 적는다. */
const CLIENT_ROLE_LABELS: Record<MemberRole, string> = {
  pm: '담당 PM',
  design: '디자인 담당',
  ops: '운영 담당',
  reg: '등록 담당',
}

export default function ClientStatusPage() {
  const { token = '' } = useParams()
  const provider = getDataProvider()
  // 같은 토큰의 두 계약을 함께 읽는다 — '지금 필요한 것'·'확정 대기 n건'·컨펌 기한 일정의 출처.
  const fetcher = useCallback(
    async () => {
      const [status, queue] = await Promise.all([
        provider.getClientStatus(token),
        provider.getClientQueue(token),
      ])
      return { status, queue }
    },
    [provider, token],
  )
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

  const { status, queue } = data
  const totalDone = status.area_progress.reduce((s, p) => s + p.done, 0)
  const totalAll = status.area_progress.reduce((s, p) => s + p.total, 0)
  const confirmCount = queue.queue.length
  const materials = deriveClientMaterials(queue, status)
  const schedule = deriveClientSchedule(queue, status)
  const nextDue = earliestDueAt(queue)
  const nextDueLabel = nextDue ? ddayLabel(nextDue) : null
  // 담당자는 발주처 지면에서 가리지 않는다(Phase 3.18.1 §2) — 이름·직함·이메일·전화를 그대로 적는다.
  // 이 링크를 받은 발주처 담당자를 맨 위에 두고 내부 스태프(PM→디자인→운영→등록)를 잇는다.
  // 마스킹은 참가자 명단(§24)의 규칙이지 담당자 표기의 규칙이 아니다 — 두 규칙을 섞지 않는다.
  const contacts: ClientContactPerson[] = [
    ...(status.client_contact
      ? [
          {
            id: 'client-contact',
            name: status.client_contact.name,
            role: '발주처 담당자',
            org: status.client_contact.org,
            email: status.client_contact.email,
          },
        ]
      : []),
    ...status.staff.map((person) => ({
      id: person.user_id,
      name: person.display_name,
      role: CLIENT_ROLE_LABELS[person.role],
      org: person.title,
      email: person.email,
      phone: person.phone,
    })),
  ]

  return (
    <div className="px-4 py-4 pb-10">
      <div className="space-y-6">
        <ClientProgressHeader done={totalDone} total={totalAll} eventDate={status.event_date} />

        <section>
          <h2 className="mb-2.5 text-sm font-semibold text-ink-sub">지금 필요한 것</h2>
          <div className="flex flex-col gap-2.5">
            <ClientActionCard
              tone={confirmCount > 0 ? 'accent' : 'neutral'}
              title={`컨펌 요청 ${confirmCount}건`}
              body={
                confirmCount > 0
                  ? queue.queue.map((i) => i.title).join(' · ')
                  : '확인을 기다리는 항목이 없습니다.'
              }
              badge={
                nextDueLabel ? (
                  <LevelBadge
                    level={nextDueLabel.startsWith('D-') ? 'attention' : 'blocked'}
                    label={`가장 빠른 기한 ${nextDueLabel}`}
                  />
                ) : undefined
              }
              actionLabel={confirmCount > 0 ? '컨펌하러 가기' : '컨펌 요청 보기'}
              to={`/c/${token}`}
            />
            <ClientActionCard
              tone="neutral"
              title={`보내주실 자료 ${materials.length}건`}
              body={
                materials.length > 0
                  ? materials.map((m) => m.title).join(' · ')
                  : '아직 요청된 자료가 없습니다.'
              }
              actionLabel="제출 자료 보기"
              to={`/c/${token}/materials`}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-semibold text-ink-sub">영역별 진행률</h2>
          <div className="ui-card space-y-4 p-4">
            {status.area_progress.map((p) => (
              <AreaProgressRow key={p.area} progress={p} pending={areaPending(queue, p.area)} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-semibold text-ink-sub">다가오는 일정</h2>
          {schedule.length === 0 ? (
            <div className="ui-card px-4">
              <EmptyState message="예정된 일정이 없습니다" />
            </div>
          ) : (
            <ul className="ui-card overflow-hidden">
              {schedule.map((entry) => (
                <ClientScheduleRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs leading-relaxed text-ink-cap">
            지난 일정은 완료 표시와 함께 흐리게 남습니다. 내부 작업 일정은 표시하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-semibold text-ink-sub">최근 확정본</h2>
          {status.recent_finals.length === 0 ? (
            <div className="ui-card px-4">
              <EmptyState message="아직 확정된 산출물이 없습니다" />
            </div>
          ) : (
            <ul className="ui-card overflow-hidden">
              {status.recent_finals.map((f) => (
                <FinalItemRow key={f.version_id} item={f} />
              ))}
            </ul>
          )}
        </section>

        {contacts.length > 0 && (
          <section>
            <h2 className="mb-2.5 text-sm font-semibold text-ink-sub">담당자</h2>
            <ClientContactCard people={contacts} />
          </section>
        )}

        <p className="rounded-md border border-steel/20 bg-steel-tint px-3 py-2 text-xs leading-relaxed text-steel">
          문의 사항은 담당 PM에게 알려주세요. 이 링크는 담당 PM이 회수하기 전까지 유효합니다.{' '}
          <Link to={`/c/${token}`} className="underline">
            컨펌 요청 보기
          </Link>
        </p>
      </div>
    </div>
  )
}
