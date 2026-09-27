import { useState } from 'react'
import RoleCharterEditor from './RoleCharterEditor'
import { ROLE_BORDER_CLASSES, ROLE_LABELS } from '../../lib/labels'
import type { RoleCharter, UUID } from '../../types/entities'
import type { PersonWithAssignments } from '../../types/views'

/** S5 하단 R&R 카드 그리드 — 역할 라벨·카드 타이틀·책임 불릿·origin_role 태그.
 *  좌측 보더 4px = 역할 컬러(디자인지시서 v1 §6 S5).
 *  v2.21 §27.4 — 사람 칩(이름 · 표시 역할)과 pm 편집(제목·책임·사람). 권한 역할은 바꾸지 않는다(R-M6). */
export default function RoleCharterGrid({
  charters,
  people = [],
  isPm = false,
  onChanged,
}: {
  charters: RoleCharter[]
  /** 주소록 — 사람 칩의 이름과 편집 피커의 후보 */
  people?: PersonWithAssignments[]
  isPm?: boolean
  onChanged?: () => void
}) {
  const [editingId, setEditingId] = useState<UUID | null>(null)
  if (charters.length === 0) {
    return <p className="text-sm text-ink-cap">등록된 R&amp;R이 없습니다.</p>
  }
  const nameOf = (id: UUID) => people.find((p) => p.id === id)?.name ?? null
  // v2.0: 컴플라이언스 카드와 좌우 배치(반폭)되면서 4열이 뭉개져 2열 고정 (§6 의미 유지)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {charters.map((c) => {
        const chips = (c.people ?? []).flatMap((p) => {
          const name = nameOf(p.person_id)
          return name ? [{ ...p, name }] : []
        })
        return (
          <div
            key={c.id}
            data-testid={`rr-card-${c.role}`}
            className={`ui-card overflow-hidden border-l-4 p-4 ${ROLE_BORDER_CLASSES[c.role]}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-dark px-2 py-0.5 text-xs font-medium text-white">
                {ROLE_LABELS[c.role]}
              </span>
              {c.origin_role && (
                <span className="inline-flex items-center rounded bg-track px-1.5 py-0.5 text-[10px] font-medium text-ink-cap">
                  {c.origin_role}
                </span>
              )}
              {isPm && onChanged && (
                <button
                  type="button"
                  onClick={() => setEditingId((cur) => (cur === c.id ? null : c.id))}
                  aria-expanded={editingId === c.id}
                  aria-label={`${c.title} 편집`}
                  className="btn btn-ghost btn-sm ml-auto print-hidden"
                >
                  {editingId === c.id ? '닫기' : '편집'}
                </button>
              )}
            </div>
            <h4 className="mb-2 t-card-title">{c.title}</h4>
            {/* v2.21 §27.4 — 사람 칩: 이름 · 표시 역할(권한 역할과 다를 수 있다 — 영업·모객처럼 멤버가 아닌 사람도) */}
            {chips.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={`${c.title} 사람`} data-testid={`rr-people-${c.role}`}>
                {chips.map((p) => (
                  <li
                    key={p.person_id}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-track px-2 py-0.5 text-xs"
                  >
                    <span className="font-medium text-ink">{p.name}</span>
                    {p.display_role && <span className="text-ink-cap">· {p.display_role}</span>}
                  </li>
                ))}
              </ul>
            )}
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-sub">
              {c.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {editingId === c.id && onChanged && (
              <RoleCharterEditor
                charter={c}
                people={people}
                onSaved={() => {
                  setEditingId(null)
                  onChanged()
                }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
