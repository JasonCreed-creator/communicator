import { useState, type FormEvent } from 'react'
import Card from '../components/internal/Card'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync, useMutation } from '../hooks/useAsync'
import { ROLE_LABELS, formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { ClientContact, ClientToken, Project } from '../types/entities'
import type { EventType } from '../types/enums'

const provider = getDataProvider()

function tokenStatus(t: ClientToken): '활성' | '회수됨' | '만료됨' {
  if (t.revoked_at) return '회수됨'
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return '만료됨'
  return '활성'
}

const TOKEN_STATUS_CLASSES: Record<ReturnType<typeof tokenStatus>, string> = {
  활성: 'bg-positive-tint text-positive',
  회수됨: 'bg-track text-ink-sub',
  만료됨: 'bg-negative-tint text-negative',
}

export default function SettingsPage() {
  const currentUser = useAsync(() => provider.getCurrentUser(), [])

  if (currentUser.loading) {
    return (
      <section className="p-6">
        <p className="text-sm text-ink-cap">불러오는 중…</p>
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
        <PageHeader caption="S6 · 설정" title="프로젝트 설정" />
        <p className="mt-4 text-sm text-ink-sub">이 화면은 PM 전용입니다.</p>
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
      <PageHeader caption="S6 · 설정" title="프로젝트 설정" />

      {project.data && <EventBasicsCard project={project.data} onReload={project.reload} />}

      <Card title="멤버">
        <ErrorAlert message={members.error} />
        {members.data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="ui-th">이름</th>
                <th className="ui-th">이메일</th>
                <th className="ui-th">역할</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.data.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-ink">{m.profile.name}</td>
                  <td className="py-2 pr-4 text-ink-sub">{m.profile.email ?? '-'}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
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
              <tr>
                <th className="ui-th">이름</th>
                <th className="ui-th">소속</th>
                <th className="ui-th">이메일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.data.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 text-ink">{c.name}</td>
                  <td className="py-2 pr-4 text-ink-sub">{c.org ?? '-'}</td>
                  <td className="py-2 text-ink-sub">{c.email ?? '-'}</td>
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
                <tr>
                  <th className="ui-th">연락처</th>
                  <th className="ui-th">상태</th>
                  <th className="ui-th">만료일</th>
                  <th className="ui-th">최근 접속</th>
                  <th className="ui-th">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
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
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-ink-cap">
          미연결 — Phase 5에서 이식 예정
        </div>
      </Card>

      <Card title="Slack Webhook">
        <ErrorAlert message={project.error} />
        <p className="mb-2 text-sm text-ink-sub">{project.data?.slack_webhook_url ?? '미등록'}</p>
        <input
          value=""
          placeholder="https://hooks.slack.com/services/..."
          disabled
          className="ui-input w-full max-w-lg disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-ink-cap">Phase 6에서 이식 예정</p>
      </Card>
    </section>
  )
}

/** 행사 기본정보 편집 (S0 온보딩 ①·②와 동일 필드) — S6는 pm 전용이므로 별도 role 게이팅 없이 재사용 */
function EventBasicsCard({ project, onReload }: { project: Project; onReload: () => void }) {
  const [name, setName] = useState(project.name)
  const [eventDate, setEventDate] = useState(project.event_date ?? '')
  const [eventType, setEventType] = useState<EventType>(project.event_type)
  const save = useMutation(async () => {
    await provider.updateProject(PROJECT_ID, {
      name: name.trim(),
      event_date: eventDate || null,
      event_type: eventType,
    })
    return true
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      save.setError('행사명은 비울 수 없습니다.')
      return
    }
    const ok = await save.run()
    if (ok) onReload()
  }

  return (
    <Card title="행사 기본정보">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 t-caption">
          행사명
          <input value={name} onChange={(e) => setName(e.target.value)} className="ui-input w-56" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          행사일
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="ui-input"
          />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          행사 유형
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
            className="ui-input"
          >
            <option value="general">일반형</option>
            <option value="recruiting">모객형</option>
          </select>
        </label>
        <button type="submit" disabled={save.pending} className="btn btn-primary">
          저장
        </button>
      </form>
      <ErrorAlert message={save.error} />
      <p className="mt-2 text-xs text-ink-cap">
        행사 유형을 바꿔도 등록 데이터는 삭제되지 않습니다(표시 계층만 전환). WBS 재전개는 일정 화면에서
        실행하세요.
      </p>
    </Card>
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
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
      <label className="flex flex-col gap-1 t-caption">
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} required className="ui-input w-36" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        소속
        <input value={org} onChange={(e) => setOrg(e.target.value)} className="ui-input w-40" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        이메일
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ui-input w-48" />
      </label>
      <button type="submit" disabled={create.pending} className="btn btn-primary">
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
      <td className="py-2 pr-4 text-ink">{contactName}</td>
      <td className="py-2 pr-4">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TOKEN_STATUS_CLASSES[status]}`}
        >
          {status}
        </span>
      </td>
      <td className="py-2 pr-4 text-ink-sub">{token.expires_at ? formatDateTime(token.expires_at) : '-'}</td>
      <td className="py-2 pr-4 text-ink-sub">{token.last_seen_at ? formatDateTime(token.last_seen_at) : '-'}</td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleCopy} className="btn btn-ghost btn-sm">
            {copied ? '복사됨' : '링크 복사'}
          </button>
          {status !== '회수됨' && (
            <button type="button" onClick={handleRevoke} disabled={revoke.pending} className="btn btn-ghost-negative btn-sm">
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
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
      <label className="flex flex-col gap-1 t-caption">
        연락처
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="ui-input w-48">
          <option value="">연락처 선택…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.org ? `(${c.org})` : ''}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={issue.pending} className="btn btn-primary">
        토큰 발급
      </button>
      <ErrorAlert message={issue.error} />
    </form>
  )
}
