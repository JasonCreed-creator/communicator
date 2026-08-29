// S-10 버킷 안 발주 항목 표 + 입력 폼 (설계서 v2.2 §19.3 · Phase 3.14c)
//
// 입력 단위는 **발주 항목 하나**다. 협력사 단위로 묶어서 넣는 UI는 만들지 않는다(§19.3) —
// 견적 항목과 1:1로 맞아야 버킷 마크업이 견적 대비 ±로 읽히기 때문이다.
//
// 금액은 전부 부가세 별도로 저장한다. 포함으로 받은 값은 저장 직전에 분리하고,
// 사용자에게는 "받은 금액 → 저장 금액"을 그대로 보여준다(§19.4 · R-S3).
//
// 금액 칸은 MoneyField다 — 자릿수 한 자리가 마진을 열 배로 틀리므로 저장 값을 `number | null`로
// 잡고(빈 칸 = 미정, 0과 구분) 한글 에코로 사람 눈이 자릿수를 검산하게 한다.
import { useState } from 'react'
import MoneyField from '../internal/MoneyField'
import { toVatExcluded } from '../../lib/settlement'
import type { SettlementItem, SettlementItemStatus, Vendor } from '../../types/entities'
import type { MemberWithProfile } from '../../types/views'
import type { SettlementBucketView } from '../../types/views'
import type { SettlementItemInput } from '../../providers/DataProvider'

const STATUS_LABEL: Record<SettlementItemStatus, string> = {
  planned: '계획',
  ordered: '발주',
  settled: '정산완료',
  cancelled: '취소',
}

const STATUS_PILL: Record<SettlementItemStatus, string> = {
  planned: 'bg-track text-ink-sub',
  ordered: 'bg-accent-tint text-accent-deep',
  settled: 'bg-positive-tint text-positive',
  cancelled: 'bg-track text-ink-cap line-through',
}

function krw(n: number | null): string {
  return n == null ? '—' : `${n.toLocaleString('ko-KR')}원`
}

/** 부가세 토글 미리보기 — "받은 금액 1,320,000(포함) → 저장 1,200,000(별도)" */
function VatPreview({ amount, vatIncluded }: { amount: number | null; vatIncluded: boolean }) {
  if (amount == null) return null
  return (
    <p className="text-xs text-ink-sub" data-testid="vat-preview">
      받은 금액 {amount.toLocaleString('ko-KR')}({vatIncluded ? '포함' : '별도'}) → 저장{' '}
      <span className="font-semibold text-ink">
        {toVatExcluded(amount, vatIncluded).toLocaleString('ko-KR')}
      </span>
      (별도)
    </p>
  )
}

interface AmountFormValue {
  ordered: number | null
  actual: number | null
  vatIncluded: boolean
  status: SettlementItemStatus
  evidence: string
}

function amountFormOf(item: SettlementItem): AmountFormValue {
  return {
    ordered: item.ordered_amount,
    actual: item.actual_amount,
    vatIncluded: false,
    status: item.status,
    evidence: item.evidence ?? '',
  }
}

function VendorPicker({
  vendors,
  value,
  freeName,
  onChange,
}: {
  vendors: Vendor[]
  value: string
  freeName: string
  onChange: (next: { value: string; freeName: string }) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <select
        aria-label="협력사"
        className="ui-input ui-select"
        value={value}
        onChange={(e) => onChange({ value: e.target.value, freeName })}
      >
        <option value="">협력사 없음</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
        <option value="__new__">＋ 새 협력사 직접 입력</option>
      </select>
      {value === '__new__' && (
        <input
          aria-label="새 협력사명"
          className="ui-input"
          placeholder="협력사명"
          value={freeName}
          onChange={(e) => onChange({ value, freeName: e.target.value })}
        />
      )}
    </div>
  )
}

interface ItemDraft {
  title: string
  spec: string
  vendor: string
  vendorName: string
  assignee: string
  ordered: number | null
  actual: number | null
  vatIncluded: boolean
}

export interface SettlementItemsProps {
  view: SettlementBucketView
  vendors: Vendor[]
  members: MemberWithProfile[]
  /** pm 여부 — 항목 생성·삭제 권한 */
  isPm: boolean
  /** 금액 입력 가능한 사용자 id (pm이 아니면 본인 담당 항목만) */
  currentUserId: string
  /** 종료된 행사는 읽기 전용 */
  readOnly: boolean
  onCreate: (input: SettlementItemInput) => Promise<unknown>
  onUpdate: (itemId: string, patch: Partial<SettlementItemInput>) => Promise<unknown>
  onDelete: (itemId: string) => Promise<unknown>
  /** 자유 입력한 협력사를 마스터로 승격 → 새 id를 돌려준다 */
  onPromoteVendor: (name: string) => Promise<string | null>
}

export default function SettlementItems({
  view,
  vendors,
  members,
  isPm,
  currentUserId,
  readOnly,
  onCreate,
  onUpdate,
  onDelete,
  onPromoteVendor,
}: SettlementItemsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AmountFormValue | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<ItemDraft>({
    title: '',
    spec: '',
    vendor: '',
    vendorName: '',
    assignee: '',
    ordered: null,
    actual: null,
    vatIncluded: false,
  })
  const [busy, setBusy] = useState(false)

  const hasCost = view.bucket.has_cost
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name ?? '—'
  const memberName = (id: string | null) =>
    members.find((m) => m.user_id === id)?.profile.name ?? '—'

  const canEditAmount = (item: SettlementItem) =>
    !readOnly && (isPm || (item.assignee_id != null && item.assignee_id === currentUserId))

  const startEdit = (item: SettlementItem) => {
    setEditingId(item.id)
    setForm(amountFormOf(item))
  }

  const saveEdit = async (item: SettlementItem) => {
    if (!form) return
    setBusy(true)
    const patch: Partial<SettlementItemInput> = {
      status: form.status,
      evidence: form.evidence.trim() === '' ? null : form.evidence.trim(),
    }
    if (hasCost) {
      patch.ordered_amount = form.ordered
      patch.actual_amount = form.actual
      patch.vat_included_input = form.vatIncluded
    }
    const ok = await onUpdate(item.id, patch)
    setBusy(false)
    if (ok !== undefined) {
      setEditingId(null)
      setForm(null)
    }
  }

  const submitDraft = async () => {
    setBusy(true)
    let vendorId: string | null = draft.vendor === '' || draft.vendor === '__new__' ? null : draft.vendor
    if (draft.vendor === '__new__' && draft.vendorName.trim() !== '') {
      vendorId = await onPromoteVendor(draft.vendorName.trim())
    }
    const input: SettlementItemInput = {
      title: draft.title,
      spec: draft.spec.trim() === '' ? null : draft.spec.trim(),
      vendor_id: vendorId,
      assignee_id: draft.assignee === '' ? null : draft.assignee,
    }
    if (hasCost) {
      input.ordered_amount = draft.ordered
      input.actual_amount = draft.actual
      input.vat_included_input = draft.vatIncluded
    }
    const created = await onCreate(input)
    setBusy(false)
    if (created !== undefined) {
      setAdding(false)
      setDraft({ title: '', spec: '', vendor: '', vendorName: '', assignee: '', ordered: null, actual: null, vatIncluded: false })
    }
  }

  // 이 패널은 버킷 표(.ui-table)의 펼침 행 안쪽에 들어가지만, 표 정본 선택자가 직계 자식으로
  // 좁혀져 있어 중첩된 항목 표에는 규칙이 흘러들지 않는다(되돌리는 유틸리티가 필요 없다).
  return (
    <div className="bg-canvas px-4 py-3">
      {!hasCost && (
        <p className="mb-2 text-sm text-ink-sub">
          원가가 없는 버킷입니다 — 견적액 전체가 마진으로 잡히므로 발주·실비를 넣지 않습니다.
        </p>
      )}

      {view.items.length === 0 ? (
        <p className="text-sm text-ink-sub">아직 등록된 발주 항목이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="ui-th">항목</th>
              <th className="ui-th">협력사</th>
              <th className="ui-th">담당</th>
              <th className="ui-th text-right">발주액</th>
              <th className="ui-th text-right">실집행</th>
              <th className="ui-th">상태</th>
              <th className="ui-th" />
            </tr>
          </thead>
          <tbody>
            {view.items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <span className="font-medium text-ink">{item.title}</span>
                  {item.spec && <span className="block text-xs text-ink-sub">{item.spec}</span>}
                  {item.evidence && <span className="block text-xs text-ink-cap">{item.evidence}</span>}
                </td>
                <td className="px-3 py-2 text-ink-sub">{vendorName(item.vendor_id)}</td>
                <td className="px-3 py-2 text-ink-sub">{memberName(item.assignee_id)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-sub">{krw(item.ordered_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">
                  {krw(item.actual_amount)}
                  {item.vat_included_input && item.input_amount_raw != null && (
                    <span className="block text-xs font-normal text-ink-cap">
                      부가세 포함 {item.input_amount_raw.toLocaleString('ko-KR')} 입력
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_PILL[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {canEditAmount(item) && editingId !== item.id && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => startEdit(item)}>
                      입력
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 금액 입력 폼 — 행을 열어 편집한다 */}
      {editingId && form && (
        <div className="ui-card mt-3 p-4">
          <p className="t-caption">
            {view.items.find((i) => i.id === editingId)?.title} · 금액 입력
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {hasCost && (
              <MoneyField
                label="발주액"
                value={form.ordered}
                onChange={(next) => setForm({ ...form, ordered: next })}
              />
            )}
            {hasCost && (
              <MoneyField
                label="실집행"
                value={form.actual}
                onChange={(next) => setForm({ ...form, actual: next })}
              />
            )}
            <label className="flex flex-col gap-1">
              <span className="t-caption">상태</span>
              <select
                className="ui-input ui-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as SettlementItemStatus })}
              >
                {(Object.keys(STATUS_LABEL) as SettlementItemStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-caption">증빙</span>
              <input
                className="ui-input"
                placeholder="세금계산서 발행 / 카드전표"
                value={form.evidence}
                onChange={(e) => setForm({ ...form, evidence: e.target.value })}
              />
            </label>
          </div>
          {hasCost && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="ui-check-row text-sm text-ink-sub">
                <input
                  type="checkbox"
                  className="ui-check"
                  checked={form.vatIncluded}
                  onChange={(e) => setForm({ ...form, vatIncluded: e.target.checked })}
                />
                부가세 포함 금액으로 입력
              </label>
              <VatPreview amount={form.actual ?? form.ordered} vatIncluded={form.vatIncluded} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                const item = view.items.find((i) => i.id === editingId)
                if (item) void saveEdit(item)
              }}
            >
              저장
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditingId(null)
                setForm(null)
              }}
            >
              취소
            </button>
            {isPm && (
              <button
                type="button"
                className="btn btn-ghost-negative ml-auto"
                disabled={busy}
                onClick={async () => {
                  if (!editingId) return
                  setBusy(true)
                  await onDelete(editingId)
                  setBusy(false)
                  setEditingId(null)
                  setForm(null)
                }}
              >
                항목 삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* 항목 추가 — pm만 (§6.1) */}
      {isPm && !readOnly && (
        adding ? (
          <div className="ui-card mt-3 p-4">
            <p className="t-caption">{view.bucket.label} · 발주 항목 추가</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="t-caption">항목명</span>
                <input
                  className="ui-input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-caption">규격</span>
                <input
                  className="ui-input"
                  value={draft.spec}
                  onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="t-caption">협력사</span>
                <VendorPicker
                  vendors={vendors}
                  value={draft.vendor}
                  freeName={draft.vendorName}
                  onChange={(next) => setDraft({ ...draft, vendor: next.value, vendorName: next.freeName })}
                />
              </div>
              <label className="flex flex-col gap-1">
                <span className="t-caption">담당</span>
                <select
                  className="ui-input ui-select"
                  value={draft.assignee}
                  onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                >
                  <option value="">담당 미지정</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profile.name}
                    </option>
                  ))}
                </select>
              </label>
              {hasCost && (
                <MoneyField
                  label="발주액"
                  value={draft.ordered}
                  onChange={(next) => setDraft({ ...draft, ordered: next })}
                />
              )}
              {hasCost && (
                <MoneyField
                  label="실집행"
                  value={draft.actual}
                  onChange={(next) => setDraft({ ...draft, actual: next })}
                />
              )}
            </div>
            {hasCost && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="ui-check-row text-sm text-ink-sub">
                  <input
                    type="checkbox"
                    className="ui-check"
                    checked={draft.vatIncluded}
                    onChange={(e) => setDraft({ ...draft, vatIncluded: e.target.checked })}
                  />
                  부가세 포함 금액으로 입력
                </label>
                <VatPreview amount={draft.actual ?? draft.ordered} vatIncluded={draft.vatIncluded} />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitDraft()}>
                추가
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost mt-3" onClick={() => setAdding(true)}>
            ＋ 발주 항목 추가
          </button>
        )
      )}
    </div>
  )
}
