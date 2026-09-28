// 역할 집합 판정 — Phase 6.6 담당자 중복 배정(설계서 v2.19 §4-2·§6.1).
// 한 사람이 한 행사에서 여러 역할을 가질 수 있다(project_members 키 = 행사·사람·역할). 권한은 **역할 합집합**이다 —
// 디자인+운영이면 두 영역을 다 쓴다. `CurrentUser.role`은 대표 역할(pm > design > ops > reg — 옛 단일 역할 소비자용)이고
// `CurrentUser.roles`가 정본이다. 화면·provider 2종·SQL(app.member_roles)이 같은 우선순위·같은 규칙을 쓴다.
import type { DeliverableArea, MemberRole } from '../types/enums'

/** 대표 역할 우선순위 — SQL `app.member_role()`의 order by와 같다 */
export const ROLE_PRECEDENCE: readonly MemberRole[] = ['pm', 'design', 'ops', 'reg']

/** 역할 집합 → 대표 역할(없으면 null) */
export function primaryRole(roles: readonly MemberRole[]): MemberRole | null {
  for (const r of ROLE_PRECEDENCE) if (roles.includes(r)) return r
  return null
}

/**
 * 현재 사용자의 역할 집합 — `roles`가 있으면(빈 배열 포함) 그것이 정본, 없는 옛 값(단일 role)만 그 하나로 본다.
 * Phase 6.16 — 담당이 아닌 행사를 열람하는 사용자는 roles=[]·role='reg'(자리표시)라 **권한 0**이어야 한다.
 * 전에는 빈 배열을 [role]로 되돌려 열람자가 등록 권한(reg)을 가진 것처럼 판정했다.
 */
export function rolesOf(user: { role: MemberRole; roles?: readonly MemberRole[] } | null | undefined): MemberRole[] {
  if (!user) return []
  return user.roles ? [...user.roles] : [user.role]
}

/** Phase 6.16 — 지금 보는 행사의 담당자인가(역할이 하나라도 있거나 전역 admin). 아니면 열람자 */
export function isMemberOf(user: { role: MemberRole; roles?: readonly MemberRole[]; is_member?: boolean } | null | undefined): boolean {
  if (!user) return false
  if (user.is_member !== undefined) return user.is_member
  return rolesOf(user).length > 0
}

export function hasRole(
  user: { role: MemberRole; roles?: readonly MemberRole[] } | null | undefined,
  ...roles: readonly MemberRole[]
): boolean {
  const mine = rolesOf(user)
  return roles.some((r) => mine.includes(r))
}

export function isPm(user: { role: MemberRole; roles?: readonly MemberRole[] } | null | undefined): boolean {
  return hasRole(user, 'pm')
}

/** §6.1 역할-영역 일치: pm = 전 영역 · design/ops = 자기 영역 · reg·common = 쓰기 불가(mock·ctx.assertAreaRole과 같은 규칙) */
export function canWriteArea(roles: readonly MemberRole[], area: DeliverableArea): boolean {
  if (roles.includes('pm')) return true
  return (area === 'design' || area === 'ops') && roles.includes(area)
}

/** 역할 집합을 우선순위대로 정렬(화면 칩·저장 순서) */
export function sortRoles(roles: readonly MemberRole[]): MemberRole[] {
  return ROLE_PRECEDENCE.filter((r) => roles.includes(r))
}
