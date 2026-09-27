// 홈 '오늘 할 일' — 흩어져 있던 큐(지연·임박·미결 컨펌·파트너 검토·정산 초과·미등록 파일·받은 가이드)를
// 한 목록으로 모으는 순수 파생 로직 (디자인지시서 v1.4 §7-2.5 · 캔버스 "커뮤니케이터 UX 개편" 홈).
// provider·상태 머신은 건드리지 않는다 — 이미 받아온 데이터를 표시용 행으로 옮길 뿐이다.
// 금액 키는 이 파일이 다루는 어떤 값에도 없다(정산 행은 버킷 이름만 싣는다 — 금액은 정산보드에서).
import { MESSAGING_CHANNEL_LABELS } from '../../lib/guideStructured'
import { AREA_LABELS, daysUntil, formatDate, waitingDays, type StatusLevel } from '../../lib/labels'
import { toIsoDate } from '../../lib/wbs'
import type { Deliverable, GuideMessagingRow, Milestone, UnregisteredFile, WbsTask } from '../../types/entities'
import type { MemberRole } from '../../types/enums'
import type { PendingApprovalItem } from '../../types/views'

export type TodayKind = 'delayed' | 'milestone' | 'approval' | 'partner' | 'messaging' | 'settlement' | 'inbox' | 'guide' | 'imminent'

/** 급한 순 — 늦은 일 → 남의 답을 기다리는 일·오늘 보낼 안내 → 돈 → 정리할 파일 → 받은 가이드 → 곧 마감 */
const KIND_ORDER: Record<TodayKind, number> = {
  delayed: 0,
  milestone: 0,
  approval: 1,
  partner: 1,
  messaging: 1,
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
  /** v2.21 §27.2 — 참가자 안내 가운데 발송일이 오늘이거나 지났는데 아직 발송 완료가 아닌 단계(운영가이드 messaging 섹션). 원고는 싣지 않는다 */
  messaging?: TodayMessagingRow[]
  /** v16.1 — 내 역할 전부(한 사람이 여러 역할 · 합집합으로 '내 차례' 판정). 비멤버는 [] */
  myRoles: readonly MemberRole[]
  roleOf: (userId: string | null) => MemberRole | null
  nameOf: (userId: string | null) => string | null
  now?: Date
}

export interface TodayMessagingRow {
  /** 운영가이드 항목 — 누르면 원고가 있는 곳으로 */
  deliverableId: string
  sectionId: string
  index: number
  row: GuideMessagingRow
}

/** 태스크에 연결된 산출물이 있으면 그 상세로, 없으면 일정으로 보낸다. */
export function wbsTaskTo(task: WbsTask): string {
  return task.linked_deliverable_id ? `/items/${task.linked_deliverable_id}` : '/schedule'
}

function taskRow(task: WbsTask, kind: 'delayed' | 'imminent', myRoles: readonly MemberRole[]): TodayRow {
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
    mine: myRoles.includes(task.role),
    to: wbsTaskTo(task),
    action: '열기',
    inboxId: null,
  }
}

export function buildTodayRows(input: TodayInput): TodayRow[] {
  const now = input.now ?? new Date()
  const isPm = input.myRoles.includes('pm')
  const rows: TodayRow[] = []

  for (const t of input.delayed) rows.push(taskRow(t, 'delayed', input.myRoles))

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
      mine: role ? input.myRoles.includes(role) : isPm,
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

  // v2.21 §27.2 — 참가자 안내 발송일(오늘·지남). 발송은 앱 밖이라 여기서는 원고를 열어 보내라고만 — '내 차례' = pm·reg
  const todayIso = toIsoDate(now)
  for (const m of input.messaging ?? []) {
    const past = !!m.row.send_on && m.row.send_on < todayIso
    rows.push({
      key: `messaging:${m.sectionId}:${m.index}`,
      kind: 'messaging',
      status: past ? '발송 지남' : '오늘 발송',
      level: past ? 'blocked' : 'attention',
      dot: false,
      code: null,
      title: `참가자 안내 · ${m.row.stage || `${m.index + 1}단계`}`,
      sub: `${MESSAGING_CHANNEL_LABELS[m.row.channel] ?? m.row.channel}${m.row.audience ? ` · ${m.row.audience}` : ''}${m.row.send_at ? ` · ${m.row.send_at}` : ''} — 발송 도구에서 보낸 뒤 상태를 '발송 완료'로`,
      role: 'reg',
      owner: null,
      due: m.row.send_on,
      dueText: null,
      mine: isPm || input.myRoles.includes('reg'),
      to: `/items/${m.deliverableId}`,
      action: '원고 열기',
      inboxId: null,
    })
  }

  for (const t of input.imminent) rows.push(taskRow(t, 'imminent', input.myRoles))

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
