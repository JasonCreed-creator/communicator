// v2.21 §27.4 (Phase 6.11 PR-C) — 사람 고르기(인라인 카드 목록). WBS 담당자 칸 · 태스크 추가/편집 폼 · R&R 사람 편집이 같은 부품을 쓴다.
// MembersEditor(Phase 3.22)의 인물 카드 문법(머리 글자 · 이름 · 직함 · 역할 도트)을 재사용한다 — 끌어놓기는 없다(표 안에서는 누르기가 맞다).
// 팝오버가 아니라 인라인이다 — 표(.ui-table)는 overflow-x:auto 안이라 떠 있는 층이 잘린다.
// 배정 ≠ 권한(R-M6): 여기서 고른 사람은 표시·'내 차례' 판정에만 쓰인다. 권한은 역할 칸(행사 설정 ②)이 정한다.
import { initialOf } from '../settings/MembersEditor'
import { ROLE_BAR_CLASSES, ROLE_LABELS } from '../../lib/labels'
import { sortRoles } from '../../lib/roles'
import type { MemberRole } from '../../types/enums'
import type { UUID } from '../../types/entities'
import type { MemberWithProfile, PersonWithAssignments } from '../../types/views'

export interface PersonChoice {
  id: UUID
  name: string
  title: string | null
  /** 이 행사에서 가진 역할 — 주소록 후보(R&R)는 [] */
  roles: MemberRole[]
}

/** 행사 멤버 → 후보(한 사람 = 한 장 · 역할 합집합) */
export function choicesFromMembers(members: readonly MemberWithProfile[]): PersonChoice[] {
  const map = new Map<UUID, PersonChoice>()
  for (const m of members) {
    const c = map.get(m.user_id)
    if (c) c.roles = sortRoles([...c.roles, m.role])
    else map.set(m.user_id, { id: m.user_id, name: m.profile.name, title: m.profile.title ?? null, roles: [m.role] })
  }
  return [...map.values()]
}

/** 주소록 → 후보(R&R 사람 — 행사 멤버가 아니어도 됨 · 영업·모객 담당이 그렇다) */
export function choicesFromPeople(people: readonly PersonWithAssignments[]): PersonChoice[] {
  return people.map((p) => ({ id: p.id, name: p.name, title: p.title ?? null, roles: [] }))
}

export default function AssigneePicker({
  label,
  choices,
  value,
  onPick,
  onClear,
  disabled = false,
  emptyHint = '고를 사람이 없습니다.',
}: {
  /** 접근성 이름 — 예: '1.1 담당자 고르기' */
  label: string
  choices: readonly PersonChoice[]
  value: UUID | null
  onPick: (id: UUID) => void
  /** 있으면 '배정 해제' 단추(값이 있을 때만) */
  onClear?: () => void
  disabled?: boolean
  emptyHint?: string
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      {choices.length === 0 ? (
        <p className="text-xs text-ink-cap">{emptyHint}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {choices.map((c) => {
            const selected = value === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${c.name}${selected ? ' (지금 담당)' : ''}`}
                  disabled={disabled}
                  onClick={() => onPick(c.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                    selected ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:border-border-strong'
                  }`}
                >
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-track text-sm font-semibold text-brown"
                  >
                    {initialOf(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                      {c.roles.map((r) => (
                        <span
                          key={r}
                          aria-hidden
                          title={ROLE_LABELS[r]}
                          className={`inline-block size-2 shrink-0 rounded-full ${ROLE_BAR_CLASSES[r]}`}
                        />
                      ))}
                    </span>
                    <span className="block truncate text-xs text-ink-sub">
                      {c.title || (c.roles.length ? c.roles.map((r) => ROLE_LABELS[r]).join(' · ') : ' ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {value && onClear && (
        <button type="button" onClick={onClear} disabled={disabled} className="btn btn-ghost btn-sm">
          배정 해제
        </button>
      )}
    </div>
  )
}
