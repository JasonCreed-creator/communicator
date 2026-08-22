// S0 ③단계 — 담당자 확인(수정은 S6 안내) + 발주처 연락처·토큰(선택, 건너뛰기 가능) + 온보딩 완료.
// completeOnboarding은 pm 전용 — 비pm은 버튼을 비활성화하고 안내 문구를 보여준다.
import { useState, type FormEvent } from 'react'
import Card from '../internal/Card'
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
      <Card title="③ 담당자 확인">
        <ErrorAlert message={members.error} />
        {members.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
        {members.data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-2 pr-4 font-medium">이름</th>
                <th className="pb-2 font-medium">역할</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.data.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-gray-900">{m.profile.name}</td>
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
        <p className="mt-3 text-xs text-gray-400">담당자 구성 변경은 완료 후 설정(S6) 화면에서 할 수 있습니다.</p>
      </Card>

      <Card title="발주처 연락처·토큰 (선택)">
        <ErrorAlert message={contacts.error} />
        {contacts.data && contacts.data.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm text-gray-700">
            {contacts.data.map((c) => (
              <li key={c.id}>
                {c.name} {c.org ? `(${c.org})` : ''}
              </li>
            ))}
          </ul>
        )}
        <ContactAndTokenForm contacts={contacts.data ?? []} onContactCreated={contacts.reload} />
        <p className="mt-2 text-xs text-gray-400">
          이 단계는 건너뛰어도 됩니다 — 연락처·토큰은 나중에 설정(S6)에서 추가할 수 있습니다.
        </p>
      </Card>

      <Card title="온보딩 완료">
        <p className="text-sm text-gray-600">
          완료하면 선택한 행사 유형에 맞는 WBS 일정이 행사일 기준으로 자동 전개되고, 역할별 R&R 카드가
          생성됩니다.
        </p>
        {!currentUser.loading && !isPm && (
          <p className="mt-2 text-xs text-red-600">
            온보딩 완료는 PM만 실행할 수 있습니다. PM 계정으로 로그인해 완료해 주세요.
          </p>
        )}
        <ErrorAlert message={complete.error} />
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            이전
          </button>
          <button
            type="button"
            onClick={handleComplete}
            disabled={!isPm || complete.pending}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            온보딩 완료
          </button>
        </div>
      </Card>
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
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <form onSubmit={handleCreateContact} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          소속
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          이메일
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-44 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <button
          type="submit"
          disabled={createContact.pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          연락처 추가
        </button>
      </form>
      <ErrorAlert message={createContact.error} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          토큰 발급 대상
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
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
          type="button"
          onClick={handleIssueToken}
          disabled={issueToken.pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          토큰 발급
        </button>
      </div>
      <ErrorAlert message={issueToken.error} />
      {issuedUrl && <p className="text-xs text-gray-600">발급됨: {issuedUrl}</p>}
    </div>
  )
}
