// 발주처 지면(/c) 파생 규칙 — 시안 「발주처 보드」 정본.
// 원칙: 이 지면은 provider의 발주처 계약(getClientQueue·getClientStatus)이 이미 주는 데이터에서만
// 조립한다. 새 provider 메서드·새 픽스처를 만들지 않는다(DataProvider v9 동결).
// 넘어가지 않는 것: 금액 일체 · WBS 코드 · 역할 컬러 · 파트너사명 · 지연 태스크 목록.
import type { ClientQueue, ClientStatusData } from '../../types'
import type { DeliverableArea } from '../../types/enums'

/** 고객사가 관여하는 날짜 1건 — 내부 공정(시공·발주·리허설)은 애초에 만들지 않는다 */
export interface ClientScheduleEntry {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  kind: 'confirm' | 'shared' | 'event'
  done: boolean
}

/** 고객사가 보내주셔야 할 자료 1건 */
export interface ClientMaterialRequest {
  id: string
  title: string
  note: string | null
  /** YYYY-MM-DD | null(기한 미정) */
  due_date: string | null
  /** 접수 완료 = 흐리게 + '접수 완료' 배지 */
  received: boolean
  received_note: string | null
  /** 메일 회신용 mailto — 담당자 주소가 없으면 null */
  mailto: string | null
}

/** 영역별 '확정 대기 n건' — 컨펌 큐를 영역으로 집계한다(내부 태스크 수는 쓰지 않는다) */
export function pendingByArea(queue: ClientQueue | null): Record<string, number> {
  const map: Record<string, number> = {}
  for (const item of queue?.queue ?? []) {
    map[item.area] = (map[item.area] ?? 0) + 1
  }
  return map
}

export function areaPending(queue: ClientQueue | null, area: DeliverableArea): number {
  return pendingByArea(queue)[area] ?? 0
}

/** 컨펌 큐에서 가장 빠른 기한(YYYY-MM-DDTHH:mm) — 없으면 null */
export function earliestDueAt(queue: ClientQueue | null): string | null {
  const dues = (queue?.queue ?? []).map((i) => i.due_at).filter((d): d is string => !!d)
  if (dues.length === 0) return null
  return dues.reduce((a, b) => (a <= b ? a : b))
}

/**
 * 다가오는 일정 — **고객사가 관여하는 날짜만**.
 *  ① 컨펌 회신 기한(컨펌 큐 due_at) — 고객사가 직접 해야 하는 일
 *  ② 전 영역 공통 마일스톤(area=null) — 킥오프·초청장 발송처럼 양측이 함께 관여하는 날
 *  ③ 행사일
 * 영역 한정 마일스톤(design·ops·reg)은 내부 공정이라 넘기지 않는다.
 */
export function deriveClientSchedule(
  queue: ClientQueue | null,
  status: ClientStatusData,
  today: Date = new Date(),
): ClientScheduleEntry[] {
  const todayIso = toIsoDate(today)
  const entries: ClientScheduleEntry[] = []

  for (const item of queue?.queue ?? []) {
    if (!item.due_at) continue
    entries.push({
      id: `confirm-${item.approval_id}`,
      title: `${item.title} 컨펌 회신`,
      date: item.due_at.slice(0, 10),
      kind: 'confirm',
      done: false,
    })
  }

  for (const m of status.milestones) {
    if (m.area !== null) continue
    entries.push({
      id: `milestone-${m.id}`,
      title: m.title,
      date: m.due_date,
      kind: 'shared',
      done: m.done,
    })
  }

  if (status.event_date) {
    entries.push({
      id: 'event-date',
      title: `${status.project_name} 개최`,
      date: status.event_date,
      kind: 'event',
      done: status.event_date < todayIso,
    })
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 제출 자료(고객사가 보내주셔야 할 것).
 *
 * 지금은 **항상 빈 배열**이다 — 발주처 계약(ClientQueue·ClientStatusData) 어디에도
 * "고객사가 우리에게 보낼 항목"을 가리키는 필드가 없기 때문이다. 컨펌 큐는 고객사가 *확인할* 것,
 * 확정본은 우리가 *보낸* 것, 마일스톤은 날짜일 뿐이다. 없는 데이터를 제목 문자열로 추측해
 * 채우지 않는다(가짜 데이터 금지). 서버 계약에 인바운드 요청 항목이 생기면 그 매핑을 여기에만 둔다.
 */
export function deriveClientMaterials(
  _queue: ClientQueue | null,
  _status: ClientStatusData | null,
): ClientMaterialRequest[] {
  return []
}

function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
