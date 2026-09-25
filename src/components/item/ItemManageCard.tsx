// Phase 4.5(2026-09-25) — 항목 고치기·지우기. 사용자 지시 "이미 등록한 항목을 수정/삭제하는 기능도 만들어야 함 —
// 지금은 항목추가로 쌓이기만 해".
//   · 고치기 = PM·해당 영역 담당(업로드 권한과 같다). 제목·카테고리·마감은 둘 다, 담당·제작 가이드는 PM만.
//     큐시트·시나리오·운영가이드는 종류를 바꿀 수 없다(빌더 데이터가 카테고리에 매여 있다 — 서버도 409).
//     상태는 여기서 바꾸지 않는다(§5 전이표 경로 = 다음 단계 카드).
//   · 지우기 = PM만 · 모든 상태 · 항목 이름 입력 확인(DeleteItemDialog).
// Phase 3.23 PR-4(디자인지시서 v1.4 §7-2.7) — 여는 자리는 본문 카드('항목 관리')에서 머리의 ⋯ 메뉴(ItemMenu)로 옮겼다.
// 이 파일은 권한 판정 · 편집 폼(고치기를 고르면 본문 맨 위에 카드로 열린다) · 지운 뒤 돌아갈 자리만 가진다.
import { useState, type FormEvent } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { CategoryPicker } from '../board/DeliverableAddForm'
import { useMutation } from '../../hooks/useAsync'
import { areaPreset } from '../../lib/boardPresets'
import { AREA_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import { STRUCTURED_DOC_CATEGORIES, isStructuredDocCategory, type MemberRole } from '../../types/enums'
import type { DeliverableDetail, MemberWithProfile, UpdateDeliverableInput } from '../../types/views'

const provider = getDataProvider()

/** 지운 뒤 돌아갈 자리 — 디자인·운영 항목은 그 보드, 공통 항목은 홈 */
export function boardPathFor(area: DeliverableDetail['area']): { path: string; label: string } {
  if (area === 'design' || area === 'ops') return { path: `/board/${area}`, label: `${AREA_LABELS[area]} 보드로` }
  return { path: '/home', label: '홈으로' }
}

/** 고치기 = PM·해당 영역 담당 / 지우기 = PM만 (권한이 없으면 메뉴 자체를 그리지 않는다) */
export function itemManageRights(
  d: Pick<DeliverableDetail, 'area'>,
  role: MemberRole | undefined,
): { canEdit: boolean; canDelete: boolean; isPm: boolean } {
  const isPm = role === 'pm'
  const canEdit = isPm || ((role === 'design' || role === 'ops') && d.area === role)
  return { canEdit, canDelete: isPm, isPm }
}

/** 고치기 카드 — ⋯ 메뉴에서 '고치기'를 고르면 본문 맨 위에 열린다 */
export function ItemEditCard(props: {
  deliverable: DeliverableDetail
  isPm: boolean
  members: MemberWithProfile[] | undefined
  onSaved: () => void
  onCancel: () => void
}) {
  return (
    <Card title="항목 고치기">
      <ItemEditForm {...props} />
    </Card>
  )
}

/** 편집 중 값 — 입력 칸은 문자열로 들고, 저장 직전에 바뀐 키만 patch로 만든다(보낸 키만 바뀐다 — §8) */
interface Draft {
  title: string
  category: string
  due_date: string
  assignee_id: string
  brief: string
  brief_refs: string
  spec_size: string
  spec_qty: string
  spec_location: string
  spec_type: string
}

function draftOf(d: DeliverableDetail): Draft {
  return {
    title: d.title,
    category: d.category,
    due_date: d.due_date ?? '',
    assignee_id: d.assignee_id ?? '',
    brief: d.brief ?? '',
    brief_refs: (d.brief_refs ?? []).join('\n'),
    spec_size: d.spec_size ?? '',
    spec_qty: d.spec_qty == null ? '' : String(d.spec_qty),
    spec_location: d.spec_location ?? '',
    spec_type: d.spec_type ?? '',
  }
}

/** 바뀐 키만 — 빈 칸은 null(비우기). 검증 실패는 한국어 메시지로 던진다 */
export function buildPatch(d: DeliverableDetail, v: Draft, isPm: boolean): UpdateDeliverableInput {
  const patch: UpdateDeliverableInput = {}
  const title = v.title.trim()
  if (!title) throw new Error('제목은 비울 수 없습니다.')
  if (title !== d.title) patch.title = title
  const category = v.category.trim()
  if (!category) throw new Error('카테고리는 비울 수 없습니다.')
  if (category !== d.category) patch.category = category
  const due = v.due_date || null
  if (due !== d.due_date) patch.due_date = due
  if (!isPm) return patch

  const assignee = v.assignee_id || null
  if (assignee !== d.assignee_id) patch.assignee_id = assignee
  const text = (s: string) => s.trim() || null
  if (text(v.brief) !== d.brief) patch.brief = text(v.brief)
  const refs = v.brief_refs
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (JSON.stringify(refs.length > 0 ? refs : null) !== JSON.stringify(d.brief_refs ?? null)) {
    patch.brief_refs = refs.length > 0 ? refs : null
  }
  if (text(v.spec_size) !== d.spec_size) patch.spec_size = text(v.spec_size)
  let qty: number | null = null
  if (v.spec_qty.trim() !== '') {
    qty = Number(v.spec_qty)
    if (!Number.isInteger(qty) || qty < 0) throw new Error('수량은 0 이상의 정수로 입력하세요.')
  }
  if (qty !== d.spec_qty) patch.spec_qty = qty
  if (text(v.spec_location) !== d.spec_location) patch.spec_location = text(v.spec_location)
  if (text(v.spec_type) !== d.spec_type) patch.spec_type = text(v.spec_type)
  return patch
}

export function ItemEditForm({
  deliverable: d,
  isPm,
  members,
  onSaved,
  onCancel,
}: {
  deliverable: DeliverableDetail
  isPm: boolean
  members: MemberWithProfile[] | undefined
  onSaved: () => void
  onCancel: () => void
}) {
  const [v, setV] = useState<Draft>(() => draftOf(d))
  const hasGuide = !!d.brief || !!d.spec_size || d.spec_qty != null || !!d.spec_location || !!d.spec_type
  const [showGuide, setShowGuide] = useState(hasGuide)
  const set = (k: keyof Draft) => (value: string) => setV((cur) => ({ ...cur, [k]: value }))
  const lockedCategory = isStructuredDocCategory(d.category)
  const labels = areaPreset(d.area).specLabels

  const save = useMutation(async () => {
    const patch = buildPatch(d, v, isPm)
    if (Object.keys(patch).length === 0) return true
    await provider.updateDeliverable(d.id, patch)
    return true
  })
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (await save.run()) onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="item-edit-form">
      <label className="flex flex-col gap-1 t-caption">
        제목
        <input value={v.title} onChange={(e) => set('title')(e.target.value)} required className="ui-input w-full" />
      </label>
      <label className="flex flex-col gap-1 t-caption" htmlFor="item-edit-category">
        카테고리
        {lockedCategory ? (
          <span className="text-sm text-ink">
            {d.category}
            <span className="t-caption ml-2">— 큐시트·시나리오·운영가이드는 종류를 바꿀 수 없습니다(새 항목으로 만드세요)</span>
          </span>
        ) : (
          <CategoryPicker
            area={d.area}
            value={v.category}
            onChange={set('category')}
            id="item-edit-category"
            exclude={STRUCTURED_DOC_CATEGORIES}
          />
        )}
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 t-caption">
          마감
          <input type="date" value={v.due_date} onChange={(e) => set('due_date')(e.target.value)} className="ui-input" />
        </label>
        {isPm && (
          <label className="flex flex-col gap-1 t-caption">
            담당
            <select
              value={v.assignee_id}
              onChange={(e) => set('assignee_id')(e.target.value)}
              className="ui-input ui-select w-36"
            >
              <option value="">미배정</option>
              {members?.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isPm && !hasGuide && (
        <label className="ui-check-row items-center text-sm text-ink-sub">
          <input
            type="checkbox"
            checked={showGuide}
            onChange={(e) => setShowGuide(e.target.checked)}
            className="ui-check"
          />
          제작 가이드 추가
        </label>
      )}
      {isPm && showGuide && (
        <>
          <label className="flex flex-col gap-1 t-caption">
            가이드 내용
            <textarea value={v.brief} onChange={(e) => set('brief')(e.target.value)} rows={6} className="ui-input w-full" />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            참고 링크 (한 줄에 하나씩)
            <textarea
              value={v.brief_refs}
              onChange={(e) => set('brief_refs')(e.target.value)}
              rows={2}
              placeholder={'https://…'}
              className="ui-input w-full"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 t-caption">
              {labels.size}
              <input value={v.spec_size} onChange={(e) => set('spec_size')(e.target.value)} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1 t-caption">
              {labels.qty}
              <input
                type="number"
                min="0"
                value={v.spec_qty}
                onChange={(e) => set('spec_qty')(e.target.value)}
                className="ui-input ui-input-num"
              />
            </label>
            <label className="flex flex-col gap-1 t-caption">
              {labels.location}
              <input value={v.spec_location} onChange={(e) => set('spec_location')(e.target.value)} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1 t-caption">
              {labels.type}
              <input value={v.spec_type} onChange={(e) => set('spec_type')(e.target.value)} className="ui-input" />
            </label>
          </div>
        </>
      )}

      <ErrorAlert message={save.error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={save.pending} className="btn btn-primary btn-sm">
          저장
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          취소
        </button>
      </div>
    </form>
  )
}
