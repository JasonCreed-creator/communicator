// S1 홈 — 3분할 액션 큐(지연·임박·미결)가 공유하는 순수 파생 로직 (시안: 홈 대시보드.dc.html).
// provider·상태 머신은 건드리지 않는다 — 이미 받아온 대시보드 데이터를 표시용 형태로 옮길 뿐이다.
// 금액 키는 이 파일이 다루는 어떤 값에도 없다.
import type { HostTaskGroup } from '../partner/partnerBoardUtils'
import { toIsoDate } from '../../lib/wbs'
import type { Deliverable, WbsTask } from '../../types/entities'
import type { MemberRole } from '../../types/enums'
import type { PendingApprovalItem } from '../../types/views'

/** 큐 한 줄이 렌더에 필요로 하는 최소 형태 — 히어로 블록과 기한순 행이 같은 재료를 쓴다. */
export interface QueueItem {
  key: string
  /** WBS 코드 등 식별 접두. 없으면 렌더하지 않는다 */
  code: string | null
  title: string
  /** 제목 아래 한 줄(카테고리·파트너명 등) */
  subtitle: string | null
  /** 역할은 형태로만 — 이름 앞 8px 도트 (패턴 §04) */
  role: MemberRole | null
  /** 담당자 표시명(알 수 없으면 null — 지어내지 않는다) */
  owner: string | null
  /** DdayBadge·마감 표기에 쓰는 ISO 날짜(또는 datetime) */
  dueDate: string | null
  /** 마감 줄에 덧붙일 보조 문구(예: '발주처 대기 3일째') */
  dueNote: string | null
  to: string
}

/** 태스크에 연결된 산출물이 있으면 그 상세로, 없으면 일정(S5)으로 보낸다. */
export function wbsTaskTo(task: WbsTask): string {
  return task.linked_deliverable_id ? `/items/${task.linked_deliverable_id}` : '/schedule'
}

export function wbsTaskToQueueItem(task: WbsTask): QueueItem {
  return {
    key: task.id,
    code: task.code,
    title: task.title,
    subtitle: null,
    role: task.role,
    // WBS 태스크는 담당 '역할'만 갖는다(개인 배정 필드 없음) — 이름은 지어내지 않는다.
    owner: null,
    dueDate: task.end_date,
    dueNote: null,
    to: wbsTaskTo(task),
  }
}

/** 컨펌 대기 일수 — 요청 시각 기준(음수 방지). */
export function waitingDays(requestedAt: string, now: Date = new Date()): number {
  const started = new Date(requestedAt).getTime()
  const diff = Math.floor((now.getTime() - started) / 86_400_000)
  return diff < 0 ? 0 : diff
}

export function approvalToQueueItem(
  { approval, deliverable }: PendingApprovalItem,
  roleOf: (userId: string | null) => MemberRole | null,
  nameOf: (userId: string | null) => string | null,
  now: Date = new Date(),
): QueueItem {
  const days = waitingDays(approval.requested_at, now)
  return {
    key: approval.id,
    code: null,
    title: deliverable.title,
    subtitle: deliverable.category,
    role: roleOf(deliverable.assignee_id),
    owner: nameOf(deliverable.assignee_id),
    dueDate: approval.due_at,
    dueNote: `발주처 대기 ${days}일째`,
    to: `/items/${deliverable.id}`,
  }
}

export function partnerItemToQueueItem(
  deliverable: Deliverable,
  partnerName: string,
): QueueItem {
  return {
    key: deliverable.id,
    code: null,
    title: partnerName,
    subtitle: deliverable.title,
    role: null,
    owner: null,
    dueDate: deliverable.due_date,
    dueNote: null,
    to: `/partners?partner=${deliverable.partner_id ?? ''}`,
  }
}

/** 마감 타임라인 스트립에 실을 구간 — 지난 마감 최근 2건 + 오늘 이후 6건.
 *  전체(37건)를 다 밀어 넣으면 가로 스크롤이 무의미해진다. 클립하지 않고 잘라 보여준다. */
export function deadlineWindow(
  groups: HostTaskGroup[],
  today: string = toIsoDate(new Date()),
  pastCount = 2,
  aheadCount = 6,
): HostTaskGroup[] {
  const past = groups.filter((g) => (g.end_date ?? '9999') < today)
  const ahead = groups.filter((g) => (g.end_date ?? '9999') >= today)
  return [...past.slice(-pastCount), ...ahead.slice(0, aheadCount)]
}
