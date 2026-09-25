// 홈 '오늘 할 일' — 흩어져 있던 큐(지연·임박·미결 컨펌·파트너 검토·정산 초과·미등록 파일·받은 가이드)를
// 한 목록으로 모으는 순수 파생 로직 (디자인지시서 v1.4 §7-2.5 · 캔버스 "커뮤니케이터 UX 개편" 홈).
// provider·상태 머신은 건드리지 않는다 — 이미 받아온 데이터를 표시용 행으로 옮길 뿐이다.
// 금액 키는 이 파일이 다루는 어떤 값에도 없다(정산 행은 버킷 이름만 싣는다 — 금액은 정산보드에서).
import { AREA_LABELS, daysUntil, formatDate, type StatusLevel } from '../../lib/labels'
import type { Deliverable, Milestone, UnregisteredFile, WbsTask } from '../../types/entities'
import type { MemberRole } from '../../types/enums'
import type { PendingApprovalItem } from '../../types/views'

export type TodayKind = 'delayed' | 'milestone' | 'approval' | 'partner' | 'settlement' | 'inbox' | 'guide' | 'imminent'

/** 급한 순 — 늦은 일 → 남의 답을 기다리는 일 → 돈 → 정리할 파일 → 받은 가이드 → 곧 마감 */
const KIND_ORDER: Record<TodayKind, number> = {
  delayed: 0,
  milestone: 0,
  approval: 1,
  partner: 1,
  settlement: 2,
  inbox: 3,
  guide: 4,
  imminent: 5,
}

export interface TodayRow {
  key: string
  kind: TodayKind
  /** 상태 배지 글자 */
  status: string
  level: StatusLevel
  /** '내 행동을 기다림' 도트 — 발주처·파트너 답을 기다리는 행에만(패턴 §03) */
  dot: boolean
  /** WBS 코드 등 식별 접두. 없으면 렌더하지 않는다 */
  code: string | null
  title: string
  sub: string | null
  /** 역할은 형태로만 — 이름 앞 8px 도트 */
  role: MemberRole | null
  /** 담당 표시명(모르면 null — 지어내지 않는다) */
  owner: string | null
  /** 기한(ISO) — 라벨·정렬·'지연' 칩에 쓴다 */
  due: string | null
  /** 기한이 아닌 날짜 글자(미등록 파일 '9월 24일 올라옴') */
  dueText: string | null
  /** 이 사용자가 처리할 행인가('내 차례' 칩) */
  mine: boolean
  /** 누르면 갈 곳 — 없으면 행 안에서 처리(미등록 파일 연결) */
  to: string | null
  action: string
  inboxId: string | null
}

export type TodayFilter = 'all' | 'mine' | 'late' | 'review'

export interface TodayInput {
  delayed: WbsTask[]
  /** 기한이 지났는데 아직 안 끝난 마일스톤 */
  lateMilestones: Milestone[]
  imminent: WbsTask[]
  approvals: PendingApprovalItem[]
  partnerPending: { deliverable: Deliverable; partnerName: string }[]
  /** 견적 초과 버킷 — 이름만(금액 금지) */
  overBudget: { id: string; label: string }[]
  inbox: UnregisteredFile[]
  /** 받은 가이드(dashboard.my_requested — 이미 '내 것') */
  guides: Deliverable[]
  myRole: MemberRole | null
  roleOf: (userId: string | null) => MemberRole | null
  nameOf: (userId: string | null) => string | null
  now?: Date
}

/** 컨펌 대기 일수 — 요청 시각 기준(음수 방지). */
export function waitingDays(requestedAt: string, now: Date = new Date()): number {
  const diff = Math.floor((now.getTime() - new Date(requestedAt).getTime()) / 86_400_000)
  return diff < 0 ? 0 : diff
}

/** 태스크에 연결된 산출물이 있으면 그 상세로, 없으면 일정으로 보낸다. */
export function wbsTaskTo(task: WbsTask): string {
  return task.linked_deliverable_id ? `/items/${task.linked_deliverable_id}` : '/schedule'
}

function taskRow(task: WbsTask, kind: 'delayed' | 'imminent', myRole: MemberRole | null): TodayRow {
  return {
    key: `${kind}:${task.id}`,
    kind,
    status: kind === 'delayed' ? '지연' : '임박',
    level: kind === 'delayed' ? 'blocked' : 'attention',
    dot: false,
    code: task.code,
    title: task.title,
    sub: task.phase_name ? `일정 · ${task.phase_name}` : '일정',
    role: task.role,
    // WBS 태스크는 담당 '역할'만 갖는다(개인 배정 필드 없음) — 이름은 지어내지 않는다.
    owner: null,
    due: task.end_date,
    dueText: null,
    mine: myRole !== null && task.role === myRole,
    to: wbsTaskTo(task),
    action: '열기',
    inboxId: null,
  }
}

export function buildTodayRows(input: TodayInput): TodayRow[] {
  const now = input.now ?? new Date()
  const isPm = input.myRole === 'pm'
  const rows: TodayRow[] = []

  for (const t of input.delayed) rows.push(taskRow(t, 'delayed', input.myRole))

  for (const m of input.lateMilestones) {
    const role: MemberRole | null = m.area === 'design' || m.area === 'ops' ? m.area : null
    rows.push({
      key: `milestone:${m.id}`,
      kind: 'milestone',
      status: '지연',
      level: 'blocked',
      dot: false,
      code: null,
      title: m.title,
      sub: `마일스톤 · ${m.area ? AREA_LABELS[m.area] : '전체'}`,
      role,
      owner: null,
      due: m.due_date,
      dueText: null,
      // 영역 마일스톤은 그 영역 담당, 전체 마일스톤은 pm이 챙긴다
      mine: role ? input.myRole === role : isPm,
      to: '/schedule',
      action: '열기',
      inboxId: null,
    })
  }

  for (const { approval, deliverable } of input.approvals) {
    rows.push({
      key: `approval:${approval.id}`,
      kind: 'approval',
      status: '컨펌대기',
      level: 'attention',
      dot: true,
      code: null,
      title: deliverable.title,
      sub: `${deliverable.category} · 발주처 답 기다린 지 ${waitingDays(approval.requested_at, now)}일`,
      role: input.roleOf(deliverable.assignee_id),
      owner: input.nameOf(deliverable.assignee_id),
      due: approval.due_at,
      dueText: null,
      // 발주처에게 다시 알리는 일은 pm의 몫이다(컨펌 발송·독촉 = pm)
      mine: isPm,
      to: `/items/${deliverable.id}`,
      action: '열기',
      inboxId: null,
    })
  }

  for (const { deliverable, partnerName } of input.partnerPending) {
    rows.push({
      key: `partner:${deliverable.id}`,
      kind: 'partner',
      status: '검토 대기',
      level: 'attention',
      dot: true,
      code: null,
      title: partnerName,
      sub: deliverable.title,
      role: null,
      owner: null,
      due: deliverable.due_date,
      dueText: null,
      mine: isPm,
      to: `/partners?partner=${deliverable.partner_id ?? ''}`,
      action: '검토 열기',
      inboxId: null,
    })
  }

  for (const b of input.overBudget) {
    rows.push({
      key: `settlement:${b.id}`,
      kind: 'settlement',
      status: '정산 확인',
      level: 'attention',
      dot: false,
      code: null,
      title: `${b.label} — 견적 초과`,
      sub: '정산 · 실집행이 견적을 넘었습니다 — 정산보드에서 사유를 남겨 주세요',
      role: 'pm',
      owner: null,
      due: null,
      dueText: '—',
      mine: isPm,
      to: '/settlement',
      action: '정산보드에서 보기',
      inboxId: null,
    })
  }

  for (const f of input.inbox) {
    rows.push({
      key: `inbox:${f.id}`,
      kind: 'inbox',
      status: '미등록 파일',
      level: 'attention',
      dot: false,
      code: null,
      title: f.file_name ?? '(파일명 없음)',
      sub: `Drive ${f.detected_folder ?? '위치 미상'} — 항목에 연결하거나 무시`,
      role: null,
      owner: null,
      due: null,
      dueText: `${formatDate(f.detected_at.slice(0, 10))} 올라옴`,
      mine: isPm,
      to: null,
      action: '항목에 연결',
      inboxId: f.id,
    })
  }

  for (const d of input.guides) {
    rows.push({
      key: `guide:${d.id}`,
      kind: 'guide',
      status: '가이드됨',
      level: 'attention',
      dot: false,
      code: null,
      title: d.title,
      sub: `${d.category} · 받은 가이드`,
      role: input.roleOf(d.assignee_id),
      owner: input.nameOf(d.assignee_id),
      due: d.due_date,
      dueText: null,
      mine: true,
      to: `/items/${d.id}`,
      action: '첫 시안 올리기',
      inboxId: null,
    })
  }

  for (const t of input.imminent) rows.push(taskRow(t, 'imminent', input.myRole))

  return rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      a.title.localeCompare(b.title, 'ko'),
  )
}

/** 칩 필터 — '지연'은 기한이 지난 모든 행(지연 태스크 + 기한 넘긴 컨펌·가이드) */
export function matchesTodayFilter(row: TodayRow, filter: TodayFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'mine':
      return row.mine
    case 'late':
      return row.due !== null && daysUntil(row.due) < 0
    case 'review':
      return row.kind === 'approval' || row.kind === 'partner' || row.kind === 'settlement'
  }
}
