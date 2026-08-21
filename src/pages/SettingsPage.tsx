import { useState, type FormEvent } from 'react'
import Card from '../components/internal/Card'
import ErrorAlert from '../components/internal/ErrorAlert'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync, useMutation } from '../hooks/useAsync'
import { ROLE_LABELS, formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { ClientContact, ClientToken } from '../types/entities'

const provider = getDataProvider()

function tokenStatus(t: ClientToken): '활성' | '회수됨' | '만료됨' {
  if (t.revoked_at) return '회수됨'
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return '만료됨'
  return '활성'
}

const TOKEN_STATUS_CLASSES: Record<ReturnType<typeof tokenStatus>, string> = {
  활성: 'bg-emerald-50 text-emerald-800',
  회수됨: 'bg-gray-100 text-gray-600',
  만료됨: 'bg-red-50 text-red-700',
}

export default function SettingsPage() {
  const currentUser = useAsync(() => provider.getCurrentUser(), [])

  if (currentUser.loading) {
    return (
      <section className="p-6">
        <p className="text-sm text-gray-400">불러오는 중…</p>
      </section>
    )
  }

  if (currentUser.error) {
    return (
      <section className="p-6">
        <ErrorAlert message={currentUser.error} />
      </section>
    )
  }

  if (currentUser.data?.role !== 'pm') {
    return (
      <section className="space-y-2 p-6">
        <p className="font-mono text-xs text-gray-400">S6</p>
        <h1 className="text-2xl font-bold text-gray-900">프로젝트 설정</h1>
        <p className="mt-4 text-sm text-gray-500">이 화면은 PM 전용입니다.</p>
      </section>
    )
  }

  return <SettingsBody />
}

function SettingsBody() {
  const project = useAsync(() => provider.getProject(PROJECT_ID), [])
  const members = useAsync(() => provider.listMembers(PROJECT_ID), [])
  const contacts = useAsync(() => provider.listClientContacts(PROJECT_ID), [])
  const tokens = useAsync(() => provider.listClientTokens(PROJECT_ID), [])

  return (
    <section className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs text-gray-400">S6</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">프로젝트 설정</h1>
      </div>

      <Card title="멤버">
        <ErrorAlert message={members.error} />
        {members.data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-2 pr-4 font-medium">이름</th>
                <th className="pb-2 pr-4 font-medium">이메일</th>
                <th className="pb-2 font-medium">역할</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.data.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-gray-900">{m.profile.name}</td>
                  <td className="py-2 pr-4 text-gray-700">{m.profile.email ?? '-'}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="발주처 연락처">
        <ErrorAlert message={contacts.error} />
        {contacts.data && (
          <table className="mb-4 w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-2 pr-4 font-medium">이름</th>
                <th className="pb-2 pr-4 font-medium">소속</th>
                <th className="pb-2 font-medium">이메일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.data.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 text-gray-900">{c.name}</td>
                  <td className="py-2 pr-4 text-gray-700">{c.org ?? '-'}</td>
                  <td className="py-2 text-gray-700">{c.email ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ClientContactForm onCreated={contacts.reload} />
      </Card>

      <Card title="발주처 토큰">
        <ErrorAlert message={tokens.error} />
        {tokens.data && tokens.data.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="pb-2 pr-4 font-medium">연락처</th>
                  <th className="pb-2 pr-4 font-medium">상태</th>
                  <th className="pb-2 pr-4 font-medium">만료일</th>
                  <th className="pb-2 pr-4 font-medium">최근 접속</th>
                  <th className="pb-2 font-medium">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tokens.data.map((t) => (
                  <TokenRow
                    key={t.token}
                    token={t}
                    contactName={contacts.data?.find((c) => c.id === t.contact_id)?.name ?? '-'}
                    onChanged={tokens.reload}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <IssueTokenForm contacts={contacts.data ?? []} onCreated={tokens.reload} />
      </Card>

      <Card title="Drive 연결">
        <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          미연결 — Phase 5에서 이식 예정
        </div>
      </Card>

      <Card title="Slack Webhook">
        <ErrorAlert message={project.error} />
        <p className="mb-2 text-sm text-gray-700">{project.data?.slack_webhook_url ?? '미등록'}</p>
        <input
          value=""
          placeholder="https://hooks.slack.com/services/..."
          disabled
          className="w-full max-w-lg rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-400"
        />
        <p className="mt-1 text-xs text-gray-400">Phase 6에서 이식 예정</p>
      </Card>
    </section>
  )
}

function ClientContactForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [email, setEmail] = useState('')
  const create = useMutation(() =>
    provider.createClientContact({ project_id: PROJECT_ID, name, org: org || undefined, email: email || undefined }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const result = await create.run()
    if (result) {
      setName('')
      setOrg('')
      setEmail('')
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        이름
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-36 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        소속
        <input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        이메일
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-48 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        />
      </label>
      <button
        type="submit"
        disabled={create.pending}
        className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        연락처 추가
      </button>
      <ErrorAlert message={create.error} />
    </form>
  )
}

function TokenRow({
  token,
  contactName,
  onChanged,
}: {
  token: ClientToken
  contactName: string
  onChanged: () => void
}) {
  const [copied, setCopied] = useState(false)
  const revoke = useMutation(() => provider.revokeClientToken(token.token))
  const status = tokenStatus(token)

  const handleCopy = async () => {
    const url = `${window.location.origin}/c/${token.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const handleRevoke = async () => {
    if (!window.confirm('이 토큰을 회수하시겠습니까? 회수 후에는 링크가 즉시 무효화됩니다.')) return
    const result = await revoke.run()
    if (result) onChanged()
  }

  return (
    <tr>
      <td className="py-2 pr-4 text-gray-900">{contactName}</td>
      <td className="py-2 pr-4">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TOKEN_STATUS_CLASSES[status]}`}
        >
          {status}
        </span>
      </td>
      <td className="py-2 pr-4 text-gray-700">{token.expires_at ? formatDateTime(token.expires_at) : '-'}</td>
      <td className="py-2 pr-4 text-gray-700">{token.last_seen_at ? formatDateTime(token.last_seen_at) : '-'}</td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {copied ? '복사됨' : '링크 복사'}
          </button>
          {status !== '회수됨' && (
            <button
              type="button"
              onClick={handleRevoke}
              disabled={revoke.pending}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              회수
            </button>
          )}
        </div>
        <ErrorAlert message={revoke.error} />
      </td>
    </tr>
  )
}

function IssueTokenForm({ contacts, onCreated }: { contacts: ClientContact[]; onCreated: () => void }) {
  const [contactId, setContactId] = useState('')
  const issue = useMutation(() =>
    provider.issueClientToken({ project_id: PROJECT_ID, contact_id: contactId }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!contactId) {
      issue.setError('토큰을 발급할 연락처를 선택하세요.')
      return
    }
    const result = await issue.run()
    if (result) {
      setContactId('')
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        연락처
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          className="w-48 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        >
          <option value="">연락처 선택…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.org ? `(${c.org})` : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={issue.pending}
        className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        토큰 발급
      </button>
      <ErrorAlert message={issue.error} />
    </form>
  )
}
