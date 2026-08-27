// `/p/{token}` "이번 마감" 섹션 — §10.1: 가장 가까운 미완료 마감 그룹을 상단(문서 순서 최상단)에
// 펼친 채로 고정한다. 그룹이 없으면(모든 항목이 final/approved) 렌더하지 않는다 — 부모가 판단.
import { formatDate } from '../../lib/labels'
import DdayBadge from '../client/DdayBadge'
import type { DeadlineGroup } from './deadlineGroups'
import PartnerPortalItemCard from './PartnerPortalItemCard'

interface PartnerPortalDeadlineSectionProps {
  group: DeadlineGroup
  token: string
  onSubmitted: () => void | Promise<void>
}

export default function PartnerPortalDeadlineSection({
  group,
  token,
  onSubmitted,
}: PartnerPortalDeadlineSectionProps) {
  return (
    <section className="ui-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-section-title">이번 마감</h2>
        {group.deadline && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-sub">{formatDate(group.deadline)}</span>
            <DdayBadge dueAt={group.deadline} />
          </div>
        )}
      </div>
      <ul className="mt-3 space-y-3">
        {group.items.map((item) => (
          <li key={item.deliverable_id}>
            <PartnerPortalItemCard item={item} token={token} onSubmitted={onSubmitted} />
          </li>
        ))}
      </ul>
    </section>
  )
}
