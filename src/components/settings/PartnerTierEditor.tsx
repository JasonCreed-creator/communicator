// 행사 설정 ③ 파트너 등급 편집 블록 (설계서 v2.4 §10.1) — 주최형 선택 시만 노출.
// 명칭·설명·정원 편집 + 등급 추가. 삭제는 그 등급을 쓰는 파트너가 있으면 provider가 409.
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { PartnerTier, UUID } from '../../types/entities'

const provider = getDataProvider()

export default function PartnerTierEditor({
  projectId,
  readOnly = false,
}: {
  projectId: UUID
  readOnly?: boolean
}) {
  const tiers = useAsync(() => provider.listPartnerTiers(projectId), [projectId])

  return (
    <div className="space-y-3">
      <ErrorAlert message={tiers.error} />
      {tiers.data && (
        <ul className="space-y-2">
          {tiers.data.map((t) => (
            <TierRow key={t.id} tier={t} readOnly={readOnly} onChanged={tiers.reload} />
          ))}
          {tiers.data.length === 0 && (
            <li className="text-xs text-ink-cap">등록된 등급이 없습니다 — 아래에서 추가하세요.</li>
          )}
        </ul>
      )}
      {!readOnly && <AddTierForm projectId={projectId} nextSort={(tiers.data?.length ?? 0) + 1} onCreated={tiers.reload} />}
    </div>
  )
}

function TierRow({
  tier,
  readOnly,
  onChanged,
}: {
  tier: PartnerTier
  readOnly: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tier.name)
  const [description, setDescription] = useState(tier.description ?? '')
  const [capacity, setCapacity] = useState(tier.capacity != null ? String(tier.capacity) : '')

  const save = useMutation(() =>
    provider.upsertPartnerTier(tier.project_id, {
      code: tier.code,
      name,
      description: description.trim() || null,
      capacity: capacity === '' ? null : Number(capacity),
      sort: tier.sort,
    }),
  )
  const remove = useMutation(() => provider.deletePartnerTier(tier.id))

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const result = await save.run()
    if (result) {
      setEditing(false)
      onChanged()
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`'${tier.name}' 등급을 삭제하시겠습니까? 이 등급을 쓰는 파트너가 있으면 삭제할 수 없습니다.`)) return
    const ok = await remove.run()
    if (ok !== undefined) onChanged()
  }

  if (editing) {
    return (
      <li className="rounded-md border border-accent/30 bg-canvas p-3">
        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 t-caption">
            명칭
            <input value={name} onChange={(e) => setName(e.target.value)} className="ui-input w-32" />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            설명
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="ui-input w-56" />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            정원
            <input
              type="number"
              min={0}
              placeholder="무제한"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="ui-input w-24"
            />
          </label>
          <button type="submit" disabled={save.pending} className="btn btn-primary btn-sm">
            저장
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
            취소
          </button>
        </form>
        <ErrorAlert message={save.error} />
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{tier.name}</span>
          <span className="rounded-full bg-track px-2 py-0.5 font-mono text-[11px] text-ink-cap">{tier.code}</span>
        </div>
        {tier.description && <p className="mt-0.5 truncate text-xs text-ink-sub">{tier.description}</p>}
        <p className="mt-0.5 text-xs text-ink-cap">정원 {tier.capacity != null ? `${tier.capacity}` : '무제한'}</p>
      </div>
      {!readOnly && (
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
            편집
          </button>
          <button type="button" onClick={handleDelete} disabled={remove.pending} className="btn btn-ghost-negative btn-sm">
            삭제
          </button>
        </div>
      )}
      <ErrorAlert message={remove.error} />
    </li>
  )
}

function AddTierForm({
  projectId,
  nextSort,
  onCreated,
}: {
  projectId: UUID
  nextSort: number
  onCreated: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const create = useMutation(() =>
    provider.upsertPartnerTier(projectId, { code: code.trim(), name: name.trim(), sort: nextSort }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !name.trim()) {
      create.setError('등급 코드와 명칭은 필수입니다.')
      return
    }
    const result = await create.run()
    if (result) {
      setCode('')
      setName('')
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="flex flex-col gap-1 t-caption">
        코드
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="platinum" className="ui-input w-28" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        명칭
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="PLATINUM" className="ui-input w-32" />
      </label>
      <button type="submit" disabled={create.pending} className="btn btn-primary btn-sm">
        등급 추가
      </button>
      <ErrorAlert message={create.error} />
    </form>
  )
}
