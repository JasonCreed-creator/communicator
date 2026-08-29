// 행사 설정 ② 담당자 탭 — 주최형에서 발주처 연락처·토큰 표를 대체하는 파트너 탭
// (설계서 v2.4 §10.1 표시 규칙). 추가·등급/상태 수정·철회(withdrawn)·제출 링크 발급·회수·복사.
// removePartner(하드 삭제)는 제출 이력이 있으면 409가 나므로 여기서는 쓰지 않는다 — 철회로 대신한다.
// 계약 관련 금액은 이 컴포넌트 어디에도 렌더하지 않는다(§21.2 R-H3).
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { PARTNER_STATUS_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { UUID } from '../../types/entities'
import type { PartnerWithProgress } from '../../types/views'
import { PARTNER_LINK_STATUS_CLASSES, partnerLinkStatus } from './partnerBoardUtils'

const provider = getDataProvider()

const PARTNER_STATUS_CLASSES: Record<PartnerWithProgress['status'], string> = {
  active: 'bg-positive-tint text-positive',
  withdrawn: 'bg-track text-ink-sub',
}

export default function PartnerRosterEditor({
  projectId,
  readOnly = false,
}: {
  projectId: UUID
  readOnly?: boolean
}) {
  const partners = useAsync(() => provider.listPartners(projectId), [projectId])
  const tiers = useAsync(() => provider.listPartnerTiers(projectId), [projectId])
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const reloadAll = () => {
    partners.reload()
  }

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/p/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1500)
    } catch {
      setCopiedToken(null)
    }
  }

  return (
    <div className="space-y-3">
      <ErrorAlert message={partners.error} />
      <ErrorAlert message={tiers.error} />
      {partners.data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr>
                <th className="ui-th">파트너</th>
                <th className="ui-th">등급</th>
                <th className="ui-th">참여 상태</th>
                <th className="ui-th">제출 링크</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {partners.data.map((p) => (
                <PartnerRow
                  key={p.id}
                  partner={p}
                  tiers={tiers.data ?? []}
                  readOnly={readOnly}
                  copied={copiedToken}
                  onCopy={handleCopy}
                  onChanged={reloadAll}
                />
              ))}
              {partners.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-xs text-ink-cap">
                    등록된 파트너가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && <AddPartnerForm projectId={projectId} tiers={tiers.data ?? []} onCreated={reloadAll} />}
    </div>
  )
}

function PartnerRow({
  partner,
  tiers,
  readOnly,
  copied,
  onCopy,
  onChanged,
}: {
  partner: PartnerWithProgress
  tiers: import('../../types/entities').PartnerTier[]
  readOnly: boolean
  copied: string | null
  onCopy: (token: string) => void
  onChanged: () => void
}) {
  const linkStatus = partnerLinkStatus(partner.token)
  const updateTier = useMutation((tierId: string) =>
    provider.updatePartner(partner.id, { tier_id: tierId || null }),
  )
  const toggleStatus = useMutation((next: 'active' | 'withdrawn') =>
    provider.updatePartner(partner.id, { status: next }),
  )
  const issue = useMutation(() =>
    provider.issuePartnerToken(partner.id, {
      contact_name: `${partner.name} 담당자`,
      contact_email: `contact+${partner.id}@example.com`,
    }),
  )
  const revoke = useMutation((token: string) => provider.revokePartnerToken(token))

  const handleTierChange = async (tierId: string) => {
    const result = await updateTier.run(tierId)
    if (result) onChanged()
  }

  const handleToggleStatus = async () => {
    const next = partner.status === 'active' ? 'withdrawn' : 'active'
    if (next === 'withdrawn' && !window.confirm(`'${partner.name}'을(를) 철회 처리하시겠습니까? 제출 이력은 보존됩니다.`)) return
    const result = await toggleStatus.run(next)
    if (result) onChanged()
  }

  const handleIssue = async () => {
    const result = await issue.run()
    if (result) onChanged()
  }

  const handleRevoke = async () => {
    if (!partner.token) return
    if (!window.confirm('이 제출 링크를 회수하시겠습니까? 회수 후에는 즉시 무효화됩니다.')) return
    const result = await revoke.run(partner.token.token)
    if (result) onChanged()
  }

  return (
    <tr>
      <td className="py-2 pr-4 align-top text-ink">{partner.name}</td>
      <td className="py-2 pr-4 align-top">
        {readOnly ? (
          <span className="text-ink-sub">{partner.tier?.name ?? '미배정'}</span>
        ) : (
          <select
            value={partner.tier_id ?? ''}
            onChange={(e) => handleTierChange(e.target.value)}
            disabled={updateTier.pending}
            className="ui-input ui-select min-h-8 py-1 text-xs"
          >
            <option value="">미배정</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="py-2 pr-4 align-top">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PARTNER_STATUS_CLASSES[partner.status]}`}
          >
            {PARTNER_STATUS_LABELS[partner.status]}
          </span>
          {!readOnly && (
            <button type="button" onClick={handleToggleStatus} disabled={toggleStatus.pending} className="btn btn-ghost btn-sm">
              {partner.status === 'active' ? '철회' : '재활성화'}
            </button>
          )}
        </div>
      </td>
      <td className="py-2 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PARTNER_LINK_STATUS_CLASSES[linkStatus]}`}
          >
            {linkStatus}
          </span>
          {partner.token && linkStatus === '발급됨' && (
            <button type="button" onClick={() => onCopy(partner.token!.token)} className="btn btn-ghost btn-sm">
              {copied === partner.token.token ? '복사됨' : '링크 복사'}
            </button>
          )}
          {!readOnly && partner.token && linkStatus === '발급됨' && (
            <button type="button" onClick={handleRevoke} disabled={revoke.pending} className="btn btn-ghost-negative btn-sm">
              회수
            </button>
          )}
          {!readOnly && linkStatus !== '발급됨' && (
            <button type="button" onClick={handleIssue} disabled={issue.pending} className="btn btn-ghost btn-sm">
              발급
            </button>
          )}
        </div>
        <ErrorAlert message={issue.error ?? revoke.error ?? toggleStatus.error ?? updateTier.error} />
      </td>
    </tr>
  )
}

function AddPartnerForm({
  projectId,
  tiers,
  onCreated,
}: {
  projectId: UUID
  tiers: import('../../types/entities').PartnerTier[]
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [tierId, setTierId] = useState('')
  const create = useMutation(() => provider.createPartner(projectId, { name, tier_id: tierId || null }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const result = await create.run()
    if (result) {
      setName('')
      setTierId('')
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
      <label className="flex flex-col gap-1 t-caption">
        파트너명
        <input value={name} onChange={(e) => setName(e.target.value)} className="ui-input w-40" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        등급
        <select value={tierId} onChange={(e) => setTierId(e.target.value)} className="ui-input ui-select w-32">
          <option value="">미배정</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={create.pending} className="btn btn-primary btn-sm">
        파트너 추가
      </button>
      <ErrorAlert message={create.error} />
    </form>
  )
}
