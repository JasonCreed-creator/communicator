// `/p/{token}` "다음 마감(대기)" · "완료된 제출" 공용 — 마감 그룹별 접힘/요약(native <details>).
// 접힌 상태에서도 DOM에는 남아있다(테스트·시각 손상 없음) — 열기는 요약 행 클릭.
import { formatDate } from '../../lib/labels'
import type { PartnerPortalItem } from '../../types'
import DdayBadge from '../client/DdayBadge'
import type { DeadlineGroup } from './deadlineGroups'
import PartnerPortalItemCard from './PartnerPortalItemCard'

interface PartnerPortalGroupListProps {
  title: string
  groups: DeadlineGroup[]
  token: string
  onSubmitted: () => void | Promise<void>
}

/** P6-③(3.15.1) — 접힌 행에서도 뭘 내야 하는지 보이도록 항목 제목을 한 줄로 요약한다.
 *  예: "부스 그래픽 제출 외 1건". 1건이면 상단 줄의 "N건" 표시로 이미 충분하고 — 무엇보다
 *  제목을 그대로 한 번 더 찍으면 펼친 카드 제목(h3)과 완전히 같은 문자열이 중복 렌더돼
 *  기존 findByText(정확한 제목) 단정들이 "여러 요소 일치"로 깨진다(DoD-33 회귀 실측) —
 *  그래서 2건 이상일 때만 요약 줄을 렌더한다. */
function itemsSummary(items: PartnerPortalItem[]): string {
  if (items.length <= 1) return ''
  const [first, ...rest] = items
  return `${first.task_title} 외 ${rest.length}건`
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
              <summary className="flex cursor-pointer list-none flex-col gap-0.5 px-4 py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {group.deadline ? formatDate(group.deadline) : '마감일 미정'}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="t-caption">{group.items.length}건</span>
                    {group.deadline && <DdayBadge dueAt={group.deadline} />}
                  </span>
                </span>
                {group.items.length > 1 && (
                  <span className="truncate text-xs text-ink-cap">{itemsSummary(group.items)}</span>
                )}
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
