// S-11 파트너 표 (§10.1) — 등급 배지·링크 상태·이번 마감 상태·참여 상태. 행 클릭 = 상세 패널.
// 계약 관련 금액 필드는 어떤 열에도 없다(§21.2 R-H3 — grep 가드 범위 대상 디렉터리).
import { HOST_STATUS_LABELS, PARTNER_STATUS_LABELS, STATUS_BADGE_CLASSES } from '../../lib/labels'
import type { Deliverable } from '../../types/entities'
import type { PartnerWithProgress } from '../../types/views'
import {
  currentSubmitGroup,
  partnerLinkStatus,
  PARTNER_LINK_STATUS_CLASSES,
  type HostTaskGroup,
} from './partnerBoardUtils'

const PARTNER_STATUS_CLASSES: Record<PartnerWithProgress['status'], string> = {
  active: 'bg-positive-tint text-positive',
  withdrawn: 'bg-track text-ink-sub',
}

function CurrentDeadlineCell({
  partner,
  current,
  deliverablesById,
}: {
  partner: PartnerWithProgress
  current: HostTaskGroup | null
  deliverablesById: Map<string, Deliverable>
}) {
  if (!current) return <span className="text-xs text-ink-cap">-</span>
  const mine = current.instances.find((t) => t.partner_id === partner.id)
  const deliverable = mine?.linked_deliverable_id ? deliverablesById.get(mine.linked_deliverable_id) : undefined
  if (!deliverable) return <span className="text-xs text-ink-cap">해당 없음</span>
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[deliverable.status]}`}
    >
      {HOST_STATUS_LABELS[deliverable.status]}
    </span>
  )
}

export default function PartnerTable({
  partners,
  groups,
  deliverablesById,
  selectedId,
  onSelect,
}: {
  partners: PartnerWithProgress[]
  groups: HostTaskGroup[]
  deliverablesById: Map<string, Deliverable>
  selectedId: string | null
  onSelect: (partnerId: string) => void
}) {
  const current = currentSubmitGroup(groups)

  if (partners.length === 0) {
    return <p className="text-sm text-ink-cap">등록된 파트너가 없습니다.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr>
            <th className="ui-th">파트너</th>
            <th className="ui-th">등급</th>
            <th className="ui-th">링크 상태</th>
            <th className="ui-th">이번 마감</th>
            <th className="ui-th">참여 상태</th>
            {/* P3(3.15.1) — 클릭 가능한 행이라는 것을 알리는 우측 표시(›) 전용 빈 헤더 */}
            <th className="ui-th w-6" aria-hidden="true" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {partners.map((p) => {
            const linkStatus = partnerLinkStatus(p.token)
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`h-11 cursor-pointer ${selectedId === p.id ? 'bg-accent-tint/40' : 'hover:bg-accent-tint/20'}`}
              >
                <td className="py-2 pr-4 font-medium text-ink">{p.name}</td>
                <td className="py-2 pr-4 text-ink-sub">{p.tier?.name ?? '미배정'}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PARTNER_LINK_STATUS_CLASSES[linkStatus]}`}
                  >
                    {linkStatus}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <CurrentDeadlineCell partner={p} current={current} deliverablesById={deliverablesById} />
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PARTNER_STATUS_CLASSES[p.status]}`}
                  >
                    {PARTNER_STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="w-6 py-2 text-right text-ink-cap" aria-hidden="true">
                  ›
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
