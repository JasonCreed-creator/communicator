// v2.21 §27.4 (Phase 6.11 PR-C) — R&R 카드 편집(pm). 제목 · 책임(줄마다 하나) · 사람(주소록 카드 피커 + 표시 역할 자유 문구).
// 권한 역할(card.role — PM·디자인·운영·등록)은 여기서 바꾸지 않는다 — 사람과 표시 역할은 표시·조직도용이고 권한은 행사 설정 ②의 몫(R-M6).
import { useId, useState, type FormEvent } from 'react'
import AssigneePicker, { choicesFromPeople } from './AssigneePicker'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { RoleCharter, RoleCharterPerson, UUID } from '../../types/entities'
import type { PersonWithAssignments, RoleCharterPatch } from '../../types/views'

const provider = getDataProvider()

export default function RoleCharterEditor({
  charter,
  people,
  onSaved,
  onCancel,
}: {
  charter: RoleCharter
  /** 주소록 전체 — 행사 멤버가 아니어도 고를 수 있다(영업·모객 담당) */
  people: PersonWithAssignments[]
  onSaved: () => void
  onCancel: () => void
}) {
  const ids = useId()
  const [title, setTitle] = useState(charter.title)
  const [itemsText, setItemsText] = useState(charter.items.join('\n'))
  const [rows, setRows] = useState<RoleCharterPerson[]>(charter.people ?? [])
  const [picking, setPicking] = useState(false)
  const save = useMutation((patch: RoleCharterPatch) => provider.updateRoleCharter(charter.id, patch))
  const nameOf = (id: UUID) => people.find((p) => p.id === id)?.name ?? '(주소록에 없음)'
  const choices = choicesFromPeople(people).filter((c) => !rows.some((r) => r.person_id === c.id))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      save.setError('R&R 카드 제목은 필수입니다.')
      return
    }
    const result = await save.run({
      title: title.trim(),
      items: itemsText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      people: rows.length ? rows.map((r) => ({ person_id: r.person_id, display_role: r.display_role.trim() })) : null,
    })
    if (result) onSaved()
  }

  return (
    <form onSubmit={handleSubmit} aria-label={`${charter.title} 편집`} className="mt-3 space-y-3 rounded-md bg-canvas p-3">
      <Field id={`${ids}-title`} label="카드 제목" required>
        <input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} className="ui-input w-full" />
      </Field>
      <Field id={`${ids}-items`} label="책임" hint="줄마다 하나">
        <textarea
          id={`${ids}-items`}
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          rows={Math.max(3, Math.min(8, itemsText.split('\n').length + 1))}
          className="ui-input w-full"
        />
      </Field>
      <div className="space-y-2">
        <p className="t-caption">사람 — 이름 옆에 표시 역할(영업 · 모객 · 총괄 PM · Sub PM · 현장 지원 등 자유롭게)</p>
        {rows.length === 0 && <p className="text-xs text-ink-cap">아직 사람이 없습니다.</p>}
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.person_id} className="flex flex-wrap items-center gap-2" data-testid={`rr-person-row-${r.person_id}`}>
              <span className="text-sm font-medium text-ink">{nameOf(r.person_id)}</span>
              <input
                aria-label={`${nameOf(r.person_id)} 표시 역할`}
                value={r.display_role}
                placeholder="표시 역할"
                onChange={(e) =>
                  setRows((cur) => cur.map((x, j) => (j === i ? { ...x, display_role: e.target.value } : x)))
                }
                className="ui-input w-40"
              />
              <button
                type="button"
                onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
                aria-label={`${nameOf(r.person_id)} 빼기`}
                className="btn btn-ghost btn-sm"
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          className="btn btn-ghost btn-sm"
        >
          ＋ 사람 추가
        </button>
        {picking && (
          <AssigneePicker
            label={`${charter.title} 사람 고르기`}
            choices={choices}
            value={null}
            onPick={(id) => {
              setRows((cur) => [...cur, { person_id: id, display_role: '' }])
              setPicking(false)
            }}
            emptyHint="주소록의 모든 사람이 이미 들어 있습니다."
          />
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={save.pending} className="btn btn-primary btn-sm">
          저장
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          취소
        </button>
      </div>
      <ErrorAlert message={save.error} />
    </form>
  )
}
