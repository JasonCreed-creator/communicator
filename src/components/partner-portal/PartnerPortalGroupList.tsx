// `/p/{token}` "다음 마감(대기)" · "완료된 제출" 공용 — 마감 그룹별 접힘/요약(native <details>).
// 접힌 상태에서도 DOM에는 남아있다(테스트·시각 손상 없음) — 열기는 요약 행 클릭.
import { formatDate } from '../../lib/labels'
import DdayBadge from '../client/DdayBadge'
import type { DeadlineGroup } from './deadlineGroups'
import PartnerPortalItemCard from './PartnerPortalItemCard'

interface PartnerPortalGroupListProps {
  title: string
  groups: DeadlineGroup[]
  token: string
  onSubmitted: () => void | Promise<void>
}

export default function PartnerPortalGroupList({ title, groups, token, onSubmitted }: PartnerPortalGroupListProps) {
  if (groups.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink-sub">{title}</h2>
      <ul className="space-y-2">
        {groups.map((group) => (
          <li key={group.deadline ?? 'no-deadline'} className="ui-card overflow-hidden">
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm font-medium text-ink">
                  {group.deadline ? formatDate(group.deadline) : '마감일 미정'}
                </span>
                <span className="flex items-center gap-2">
                  <span className="t-caption">{group.items.length}건</span>
                  {group.deadline && <DdayBadge dueAt={group.deadline} />}
                </span>
              </summary>
              <ul className="space-y-3 border-t border-border px-4 py-3">
                {group.items.map((item) => (
                  <li key={item.deliverable_id}>
                    <PartnerPortalItemCard item={item} token={token} onSubmitted={onSubmitted} />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
