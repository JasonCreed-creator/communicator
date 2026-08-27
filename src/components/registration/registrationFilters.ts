// P5-① S4 등록 스케일 — 검색·상태 필터·페이지네이션 순수 로직(RSVP·참관객 공용).
// 서버 페이지네이션이 없는 mock 계층에서는 클라이언트 필터+슬라이스로 처리한다.
import type { RsvpContact } from '../../types/entities'
import type { InviteStatus } from '../../types/enums'
import type { AttendeeWithRsvp } from '../../types/views'

export const REGISTRATION_PAGE_SIZE = 50

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

/** 이름·이메일·소속 부분 일치(대소문자 무관). 검색어가 비어 있으면 전부 통과 */
export function matchesSearch(fields: (string | null)[], query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  return fields.some((f) => !!f && f.toLowerCase().includes(q))
}

export type RsvpStatusFilter = 'all' | InviteStatus

export function filterRsvps(list: RsvpContact[], search: string, status: RsvpStatusFilter): RsvpContact[] {
  return list.filter(
    (r) => matchesSearch([r.name, r.email, r.org], search) && (status === 'all' || r.invite_status === status),
  )
}

export type CheckinFilter = 'all' | 'checked' | 'not_checked'

export function filterAttendees(
  list: AttendeeWithRsvp[],
  search: string,
  checkin: CheckinFilter,
): AttendeeWithRsvp[] {
  return list.filter((a) => {
    if (!matchesSearch([a.name, a.email, a.org], search)) return false
    if (checkin === 'all') return true
    return checkin === 'checked' ? !!a.checked_in_at : !a.checked_in_at
  })
}

export interface Page<T> {
  items: T[]
  /** 요청 page가 범위를 벗어나면 클램프된 값(1~totalPages) */
  page: number
  totalPages: number
  totalCount: number
}

/** page는 1-based. totalCount=0이면 totalPages=1(빈 목록도 "1/1"로 표기) */
export function paginate<T>(list: T[], page: number, pageSize = REGISTRATION_PAGE_SIZE): Page<T> {
  const totalCount = list.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const clamped = Math.min(Math.max(1, page), totalPages)
  const start = (clamped - 1) * pageSize
  return { items: list.slice(start, start + pageSize), page: clamped, totalPages, totalCount }
}
