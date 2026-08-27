// `/p/{token}` 포털 전용 — 마감(deadline)별 그룹핑 순수 함수. provider가 이미 task.end_date
// 오름차순(null은 맨 뒤)으로 정렬해 내려주므로, 여기서는 정렬하지 않고 연속 구간만 묶는다.
import type { PartnerPortalItem } from '../../types'

export interface DeadlineGroup {
  deadline: string | null
  items: PartnerPortalItem[]
}

function isDone(status: PartnerPortalItem['status']): boolean {
  return status === 'final' || status === 'approved'
}

export function groupByDeadline(items: PartnerPortalItem[]): DeadlineGroup[] {
  const groups: DeadlineGroup[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.deadline === item.deadline) {
      last.items.push(item)
    } else {
      groups.push({ deadline: item.deadline, items: [item] })
    }
  }
  return groups
}

export interface SplitGroups {
  /** 가장 가까운, final이 아닌 항목이 남은 그룹 — §10.1 "이번 마감" 상단 고정 대상 */
  current: DeadlineGroup | null
  /** current 이후의 미완료 그룹 — "다음 마감(대기)" */
  upcoming: DeadlineGroup[]
  /** 그룹 내 전 항목이 final/approved — "완료된 제출" */
  done: DeadlineGroup[]
}

export function splitGroups(groups: DeadlineGroup[]): SplitGroups {
  let current: DeadlineGroup | null = null
  const upcoming: DeadlineGroup[] = []
  const done: DeadlineGroup[] = []
  for (const group of groups) {
    if (group.items.every((item) => isDone(item.status))) {
      done.push(group)
    } else if (!current) {
      current = group
    } else {
      upcoming.push(group)
    }
  }
  return { current, upcoming, done }
}
