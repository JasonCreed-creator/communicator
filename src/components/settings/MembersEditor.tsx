// 담당자 목록·추가·삭제 — 행사 설정(S6) ②탭과 온보딩(S0) ②단계가 공용으로 쓴다(설계서 v1.5 §10).
// addMember·removeMember는 pm 전용(서버 assertPm) — readOnly=true(비 pm)면 추가 행·삭제 버튼을 숨긴다.
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { ROLE_BAR_CLASSES, ROLE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { MemberRole } from '../../types/enums'
import type { UUID } from '../../types/entities'

const provider = getDataProvider()

const ROLES: MemberRole[] = ['pm', 'design', 'ops', 'reg']

function RolePill({ role }: { role: MemberRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BAR_CLASSES[role]} ${
        role === 'reg' ? 'text-ink' : 'text-white'
      }`}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

export default function MembersEditor({
  projectId,
  onChanged,
  readOnly = false,
}: {
  projectId: UUID
  onChanged?: () => void
  readOnly?: boolean
}) {
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  // removeMember는 void 반환 — useMutation 성공 판정(반환값 존재)을 위해 true로 감싼다
  const remove = useMutation(async (memberId: UUID) => {
    await provider.removeMember(projectId, memberId)
    return true
  })

  const handleRemove = async (memberId: UUID, name: string) => {
    if (!window.confirm(`${name} 담당자를 삭제하시겠습니까?`)) return
    const ok = await remove.run(memberId)
    if (ok) {
      members.reload()
      onChanged?.()
    }
  }

  return (
    <div className="space-y-3">
      <ErrorAlert message={members.error} />
      {members.data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="ui-th">이름</th>
                <th className="ui-th">이메일</th>
                <th className="ui-th">역할</th>
                {!readOnly && <th className="ui-th">삭제</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.data.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-ink">{m.profile.name}</td>
                  <td className="py-2 pr-4 text-ink-sub">{m.profile.email ?? '-'}</td>
                  <td className="py-2 pr-4">
                    <RolePill role={m.role} />
                  </td>
                  {!readOnly && (
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => handleRemove(m.user_id, m.profile.name)}
                        disabled={remove.pending}
                        className="text-xs text-negative underline"
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ErrorAlert message={remove.error} />

      {!readOnly && <AddMemberForm projectId={projectId} onCreated={() => { members.reload(); onChanged?.() }} />}

      <p className="text-xs text-ink-cap">
        PM은 최소 1명 필수. 같은 사람이 여러 행사에 다른 역할로 참여할 수 있습니다(행사별 역할). Phase
        4에서 이메일 초대로 전환.
      </p>
    </div>
  )
}

function AddMemberForm({ projectId, onCreated }: { projectId: UUID; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('design')
  const add = useMutation(() => provider.addMember(projectId, { display_name: name, email, role }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      add.setError('이름과 이메일은 필수입니다.')
      return
    }
    const created = await add.run()
    if (created) {
      setName('')
      setEmail('')
      setRole('design')
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
      <label className="flex flex-col gap-1 t-caption">
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} className="ui-input w-32" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        이메일
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ui-input w-44" />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        역할
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className="ui-input w-28">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={add.pending} className="btn btn-primary btn-sm">
        추가
      </button>
      <ErrorAlert message={add.error} />
    </form>
  )
}
