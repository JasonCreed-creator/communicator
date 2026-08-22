// S0 ③단계 — 담당자 확인(수정은 S6 안내) + 발주처 연락처·토큰(선택, 건너뛰기 가능) + 온보딩 완료.
// completeOnboarding은 pm 전용 — 비pm은 버튼을 비활성화하고 안내 문구를 보여준다.
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { ROLE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { ClientContact } from '../../types/entities'

const provider = getDataProvider()

export default function AssigneesStep({ onPrev, onComplete }: { onPrev: () => void; onComplete: () => void }) {
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(PROJECT_ID), [])
  const contacts = useAsync(() => provider.listClientContacts(PROJECT_ID), [])
  const isPm = currentUser.data?.role === 'pm'

  const complete = useMutation(async () => {
    await provider.completeOnboarding(PROJECT_ID)
    return true
  })

  const handleComplete = async () => {
    const ok = await complete.run()
    if (ok) onComplete()
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-canvas p-4">
        <h2 className="t-card-title mb-3">③ 담당자 확인</h2>
        <ErrorAlert message={members.error} />
        {members.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
        {members.data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pb-2 pr-4 t-caption font-medium">이름</th>
                <th className="pb-2 t-caption font-medium">역할</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.data.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-ink">{m.profile.name}</td>
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
        <p className="mt-3 text-xs text-ink-cap">담당자 구성 변경은 완료 후 설정(S6) 화면에서 할 수 있습니다.</p>
      </section>

      <section className="rounded-lg bg-canvas p-4">
        <h2 className="t-card-title mb-3">발주처 연락처·토큰 (선택)</h2>
        <ErrorAlert message={contacts.error} />
        {contacts.data && contacts.data.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm text-ink-sub">
            {contacts.data.map((c) => (
              <li key={c.id}>
                {c.name} {c.org ? `(${c.org})` : ''}
              </li>
            ))}
          </ul>
        )}
        <ContactAndTokenForm contacts={contacts.data ?? []} onContactCreated={contacts.reload} />
        <p className="mt-2 text-xs text-ink-cap">
          이 단계는 건너뛰어도 됩니다 — 연락처·토큰은 나중에 설정(S6)에서 추가할 수 있습니다.
        </p>
      </section>

      <section className="rounded-lg bg-canvas p-4">
        <h2 className="t-card-title mb-3">온보딩 완료</h2>
        <p className="text-sm text-ink-sub">
          완료하면 선택한 행사 유형에 맞는 WBS 일정이 행사일 기준으로 자동 전개되고, 역할별 R&R 카드가
          생성됩니다.
        </p>
        {!currentUser.loading && !isPm && (
          <p className="mt-2 text-xs text-negative">
            온보딩 완료는 PM만 실행할 수 있습니다. PM 계정으로 로그인해 완료해 주세요.
          </p>
        )}
        <ErrorAlert message={complete.error} />
        <div className="mt-4 flex justify-between">
          <button type="button" onClick={onPrev} className="btn btn-ghost">
            이전
          </button>
          <button type="button" onClick={handleComplete} disabled={!isPm || complete.pending} className="btn btn-accent">
            온보딩 완료
          </button>
        </div>
      </section>
    </div>
  )
}

function ContactAndTokenForm({
  contacts,
  onContactCreated,
}: {
  contacts: ClientContact[]
  onContactCreated: () => void
}) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [email, setEmail] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null)

  const createContact = useMutation(() =>
    provider.createClientContact({ project_id: PROJECT_ID, name, org: org || undefined, email: email || undefined }),
  )
  const issueToken = useMutation((contactId: string) =>
    provider.issueClientToken({ project_id: PROJECT_ID, contact_id: contactId }),
  )

  const handleCreateContact = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const created = await createContact.run()
    if (created) {
      setName('')
      setOrg('')
      setEmail('')
      setSelectedContactId(created.id)
      onContactCreated()
    }
  }

  const handleIssueToken = async () => {
    if (!selectedContactId) {
      issueToken.setError('토큰을 발급할 연락처를 먼저 선택하세요.')
      return
    }
    const token = await issueToken.run(selectedContactId)
    if (token) setIssuedUrl(`${window.location.origin}/c/${token.token}`)
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <form onSubmit={handleCreateContact} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 t-caption">
          이름
          <input value={name} onChange={(e) => setName(e.target.value)} className="ui-input w-32" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          소속
          <input value={org} onChange={(e) => setOrg(e.target.value)} className="ui-input w-32" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          이메일
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ui-input w-44" />
        </label>
        <button type="submit" disabled={createContact.pending} className="btn btn-ghost btn-sm">
          연락처 추가
        </button>
      </form>
      <ErrorAlert message={createContact.error} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 t-caption">
          토큰 발급 대상
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="ui-input w-48"
          >
            <option value="">연락처 선택…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.org ? `(${c.org})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleIssueToken} disabled={issueToken.pending} className="btn btn-ghost btn-sm">
          토큰 발급
        </button>
      </div>
      <ErrorAlert message={issueToken.error} />
      {issuedUrl && <p className="text-xs text-ink-sub">발급됨: {issuedUrl}</p>}
    </div>
  )
}
