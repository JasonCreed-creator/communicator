// 발주처 연락처+토큰 통합 표 — 행사 설정(S6) ②탭과 온보딩(S0) ②단계가 공용으로 쓴다.
// 기존 SettingsPage의 연락처·토큰 카드 기능(추가·발급·회수·링크 복사)을 한 컴포넌트로 흡수한다.
// createClientContact·issueClientToken·revokeClientToken은 pm 전용(서버 assertPm) —
// readOnly=true(비 pm)면 추가 폼·발급/회수 버튼을 숨기고 표시(조회·복사)만 남긴다.
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { ClientToken, UUID } from '../../types/entities'

const provider = getDataProvider()

type TokenStatus = '활성' | '회수됨' | '만료됨' | '미발급'

function statusOf(token: ClientToken | undefined): TokenStatus {
  if (!token) return '미발급'
  if (token.revoked_at) return '회수됨'
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) return '만료됨'
  return '활성'
}

const STATUS_CLASSES: Record<TokenStatus, string> = {
  활성: 'bg-positive-tint text-positive',
  회수됨: 'bg-track text-ink-sub',
  만료됨: 'bg-track text-ink-sub',
  미발급: 'bg-track text-ink-sub',
}

/** 3.10.1 R3 — 뱃지 아래 만료 캡션용 단축 날짜(월/일). 반폭 카드에서 한 줄 유지가 목적 */
function shortDateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function latestTokenOf(tokens: ClientToken[], contactId: UUID): ClientToken | undefined {
  return tokens
    .filter((t) => t.contact_id === contactId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

export default function ClientContactsEditor({
  projectId,
  readOnly = false,
}: {
  projectId: UUID
  readOnly?: boolean
}) {
  const contacts = useAsync(() => provider.listClientContacts(projectId), [projectId])
  const tokens = useAsync(() => provider.listClientTokens(projectId), [projectId])
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const reloadAll = () => {
    contacts.reload()
    tokens.reload()
  }

  const issue = useMutation((contactId: UUID) => provider.issueClientToken({ project_id: projectId, contact_id: contactId }))
  const revoke = useMutation((token: string) => provider.revokeClientToken(token))

  const handleIssue = async (contactId: UUID) => {
    const token = await issue.run(contactId)
    if (token) reloadAll()
  }

  const handleRevoke = async (token: ClientToken) => {
    if (!window.confirm('이 토큰을 회수하시겠습니까? 회수 후에는 링크가 즉시 무효화됩니다.')) return
    const result = await revoke.run(token.token)
    if (result) reloadAll()
  }

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/c/${token}`
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
      <ErrorAlert message={contacts.error} />
      <ErrorAlert message={tokens.error} />
      {contacts.data && tokens.data && (
        <div className="overflow-x-auto">
          {/* 3.10.1 R3 — 열 규격: 이름 72 nowrap·소속 96 truncate·이메일 truncate·상태 뱃지+만료 캡션·액션 140.
              반폭 카드에서 셀이 세로 1글자씩 깨지던 문제 — 폭 부족 시 컨테이너 가로 스크롤로 수납 */}
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr>
                <th className="ui-th min-w-[72px] whitespace-nowrap">이름</th>
                <th className="ui-th min-w-[96px]">소속</th>
                <th className="ui-th">이메일</th>
                <th className="ui-th whitespace-nowrap">토큰 상태</th>
                <th className="ui-th w-[140px] whitespace-nowrap">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.data.map((c) => {
                const latest = latestTokenOf(tokens.data ?? [], c.id)
                const status = statusOf(latest)
                return (
                  <tr key={c.id}>
                    <td className="min-w-[72px] whitespace-nowrap py-2 pr-4 align-top text-ink">{c.name}</td>
                    <td className="min-w-[96px] max-w-[160px] truncate py-2 pr-4 align-top text-ink-sub" title={c.org ?? undefined}>
                      {c.org ?? '-'}
                    </td>
                    <td className="max-w-[180px] truncate py-2 pr-4 align-top text-ink-sub">{c.email ?? '-'}</td>
                    <td className="py-2 pr-4 align-top">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
                        {status}
                      </span>
                      {latest?.expires_at && (
                        <span className="mt-0.5 block whitespace-nowrap text-xs text-ink-cap">
                          만료 {shortDateLabel(latest.expires_at)}
                        </span>
                      )}
                    </td>
                    <td className="w-[140px] whitespace-nowrap py-2 align-top">
                      <div className="flex flex-nowrap items-center gap-2">
                        {status === '활성' && latest ? (
                          <>
                            <button type="button" onClick={() => handleCopy(latest.token)} className="btn btn-ghost btn-sm">
                              {copiedToken === latest.token ? '복사됨' : '링크 복사'}
                            </button>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => handleRevoke(latest)}
                                disabled={revoke.pending}
                                className="btn btn-ghost-negative btn-sm"
                              >
                                회수
                              </button>
                            )}
                          </>
                        ) : (
                          !readOnly && (
                            <button
                              type="button"
                              onClick={() => handleIssue(c.id)}
                              disabled={issue.pending}
                              className="btn btn-ghost btn-sm"
                            >
                              발급
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {contacts.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-xs text-ink-cap">
                    등록된 발주처 연락처가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <ErrorAlert message={issue.error} />
      <ErrorAlert message={revoke.error} />

      {!readOnly && <AddContactForm projectId={projectId} onCreated={reloadAll} />}
    </div>
  )
}

function AddContactForm({ projectId, onCreated }: { projectId: UUID; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [email, setEmail] = useState('')
  // §10-C — 이름 미입력은 그 줄에서 말한다(전에는 조용히 무시했다). 블록은 서버 거절 자리다
  const [nameError, setNameError] = useState<string | null>(null)
  const create = useMutation(() =>
    provider.createClientContact({ project_id: projectId, name, org: org || undefined, email: email || undefined }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('이름을 입력하세요.')
      return
    }
    setNameError(null)
    const result = await create.run()
    if (result) {
      setName('')
      setOrg('')
      setEmail('')
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
      <Field label="이름" required error={nameError}>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (nameError) setNameError(null)
          }}
          aria-invalid={nameError ? true : undefined}
          className={`ui-input w-32${nameError ? ' ui-input-error' : ''}`}
        />
      </Field>
      <Field label="소속">
        <input value={org} onChange={(e) => setOrg(e.target.value)} className="ui-input w-32" />
      </Field>
      <Field label="이메일">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ui-input w-44" />
      </Field>
      <button type="submit" disabled={create.pending} className="btn btn-ghost btn-sm">
        연락처 추가
      </button>
      <ErrorAlert message={create.error} />
    </form>
  )
}
