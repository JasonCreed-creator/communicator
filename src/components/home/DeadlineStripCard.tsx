// S1 홈 — D-day 스트립 (시안: 홈 대시보드.dc.html / 패턴 §07).
// S-11 파트너 보드의 PartnerDeadlineTimeline을 그대로 재사용하고, 방향 범례만 카드 헤더로 올린다.
// overflow-x:auto는 타임라인 컴포넌트가 유지한다(클립 금지).
import Card from '../internal/Card'
import EmptyState from '../internal/EmptyState'
import PartnerDeadlineTimeline from '../partner/PartnerDeadlineTimeline'
import type { HostTaskGroup } from '../partner/partnerBoardUtils'
import { WBS_DIRECTION_LABELS } from '../../lib/labels'
import type { WbsDirection } from '../../types/enums'

const DIRECTION_DOT: Record<WbsDirection, string> = {
  partner_submit: 'bg-accent',
  host_notice: 'bg-steel',
  internal: 'bg-ink-cap',
}

const LEGEND_ORDER: WbsDirection[] = ['partner_submit', 'host_notice', 'internal']

export default function DeadlineStripCard({ groups }: { groups: HostTaskGroup[] }) {
  return (
    <Card
      title="마감 타임라인"
      action={
        <div className="flex flex-wrap items-center gap-3.5">
          {LEGEND_ORDER.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-cap"
            >
              <span aria-hidden className={`size-1.5 rounded-full ${DIRECTION_DOT[d]}`} />
              {WBS_DIRECTION_LABELS[d]}
            </span>
          ))}
        </div>
      }
    >
      {groups.length === 0 ? (
        <EmptyState message="표시할 마감이 없습니다." />
      ) : (
        <PartnerDeadlineTimeline groups={groups} />
      )}
    </Card>
  )
}
