// 담당자 목록·추가·삭제 — 행사 설정(S6) ②탭과 온보딩(S0) ②단계가 공용으로 쓴다(설계서 v1.5 §10).
// addMember·removeMember는 pm 전용(서버 assertPm) — readOnly=true(비 pm)면 추가 행·삭제 버튼을 숨긴다.
import { useId, useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { parseContactCards, type ParsedContact } from '../../lib/contactCard'
import { ROLE_BAR_CLASSES, ROLE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { MemberRole } from '../../types/enums'
import type { UUID } from '../../types/entities'
import type { MemberInput } from '../../types/views'

const provider = getDataProvider()

const ROLES: MemberRole[] = ['pm', 'design', 'ops', 'reg']
const DEFAULT_ROLE: MemberRole = 'design'

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

  const reloadMembers = () => {
    members.reload()
    onChanged?.()
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
                {/* 3.18.1 §2 — 직함·전화는 저장되는 값이다. 내부·발주처(/c) 지면 모두에 그대로 나간다 */}
                <th className="ui-th">직함</th>
                <th className="ui-th">이메일</th>
                <th className="ui-th">전화</th>
                <th className="ui-th">역할</th>
                {!readOnly && <th className="ui-th">삭제</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.data.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-ink">{m.profile.name}</td>
                  <td className="py-2 pr-4 text-ink-sub">{m.profile.title || '-'}</td>
                  <td className="py-2 pr-4 text-ink-sub">{m.profile.email ?? '-'}</td>
                  <td className="py-2 pr-4 text-ink-sub">{m.profile.phone || '-'}</td>
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

      {!readOnly && (
        <>
          <AddMemberForm projectId={projectId} onCreated={reloadMembers} />
          <ContactCardImport projectId={projectId} onCreated={reloadMembers} />
        </>
      )}

      <p className="text-xs text-ink-cap">
        PM은 최소 1명 필수. 같은 사람이 여러 행사에 다른 역할로 참여할 수 있습니다(행사별 역할). Phase
        4에서 이메일 초대로 전환.
      </p>
    </div>
  )
}

function AddMemberForm({ projectId, onCreated }: { projectId: UUID; onCreated: () => void }) {
  const uid = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<MemberRole>(DEFAULT_ROLE)
  const add = useMutation(() =>
    provider.addMember(projectId, {
      display_name: name,
      email,
      role,
      title: title.trim() || null,
      phone: phone.trim() || null,
    }),
  )

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
      setTitle('')
      setPhone('')
      setRole(DEFAULT_ROLE)
      onCreated()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
      <Field id={`${uid}-name`} label="이름" required>
        <input
          id={`${uid}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="ui-input w-32"
        />
      </Field>
      <Field id={`${uid}-title`} label="직함">
        <input
          id={`${uid}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="ui-input w-32"
        />
      </Field>
      <Field id={`${uid}-email`} label="이메일" required>
        <input
          id={`${uid}-email`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="ui-input w-44"
        />
      </Field>
      {/* 전화는 하이픈이 든 표기 문자열이라 숫자 컨트롤(ui-input-num)이 아니다 */}
      <Field id={`${uid}-phone`} label="전화">
        <input
          id={`${uid}-phone`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="ui-input w-36"
        />
      </Field>
      <Field id={`${uid}-role`} label="역할">
        <select
          id={`${uid}-role`}
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className="ui-input ui-select w-28"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={add.pending} className="btn btn-ghost btn-sm">
        추가
      </button>
      <ErrorAlert message={add.error} />
    </form>
  )
}

/** 확인 표의 한 행 — 파싱 결과에 역할·키만 얹은 화면 상태다(저장 전이라 provider에 존재하지 않는다). */
interface DraftRow extends ParsedContact {
  key: string
  role: MemberRole
}

const PASTE_PLACEHOLDER = [
  '홍길동 / 기획팀 팀장',
  '가상이벤트(주)',
  'hong@example.com',
  '010-0000-0000',
].join('\n')

const UNPARSED_HINT = '인식 실패 — 직접 입력'

/**
 * 전자명함·메일 서명 텍스트 임포트 (Phase 3.18.1 §2).
 *
 * 담당자 5~6명을 손으로 옮겨 적는 자리라 오타가 이메일에 직접 꽂힌다. 그래서 붙여넣기를 받되
 * **파싱 결과를 바로 저장하지 않고** 확인 표를 한 번 거친다 — 인식이 틀린 칸은 그 자리에서 고친다.
 * 저장 경로는 기존 addMember 그대로다(DataProvider 120메서드 불변).
 */
function ContactCardImport({ projectId, onCreated }: { projectId: UUID; onCreated: () => void }) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  // null = 아직 인식 전, [] = 인식했지만 건진 것이 없음 — 두 상태의 안내 문구가 다르다
  const [rows, setRows] = useState<DraftRow[] | null>(null)
  const [seq, setSeq] = useState(0)
  const add = useMutation((input: MemberInput) => provider.addMember(projectId, input))

  const recognize = () => {
    const parsed = parseContactCards(text)
    setRows(parsed.map((c, i) => ({ ...c, key: `${seq}-${i}`, role: DEFAULT_ROLE })))
    setSeq((s) => s + 1)
    add.setError(null)
  }

  const patchField = (key: string, field: keyof ParsedContact, value: string) => {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, [field]: value } : r)) ?? prev)
  }

  const handleAdd = async (row: DraftRow) => {
    // 3.18.1 §2 — 확인 표에서 사람이 고친 값을 그대로 저장한다(직함·전화 포함).
    // 소속(company)은 아직 담을 필드가 없어 저장되지 않는다 — 안내 문구가 그 사실을 밝힌다.
    const created = await add.run({
      display_name: row.name.trim(),
      email: row.email.trim(),
      role: row.role,
      title: row.title.trim() || null,
      phone: row.phone.trim() || null,
    })
    if (!created) return
    setRows((prev) => prev?.filter((r) => r.key !== row.key) ?? prev)
    onCreated()
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="btn btn-ghost btn-sm"
      >
        전자명함 붙여넣기
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <Field
            id={`${uid}-text`}
            label="명함·서명 텍스트"
            hint="여러 장은 빈 줄 두 줄로 구분합니다. 인식 결과는 아래 표에서 고칠 수 있습니다."
          >
            <textarea
              id={`${uid}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={PASTE_PLACEHOLDER}
              className="ui-input w-full"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={recognize}
              disabled={!text.trim()}
              className="btn btn-ghost btn-sm"
            >
              인식
            </button>
            {rows?.length === 0 && (
              <span className="text-[11px] text-ink-cap">
                인식된 명함이 없습니다 — 텍스트를 확인하거나 담당자를 직접 입력하세요.
              </span>
            )}
          </div>

          {rows && rows.length > 0 && (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="ui-table min-w-[860px] text-sm">
                  <thead>
                    <tr>
                      <th className="ui-th w-[112px]">이름</th>
                      <th className="ui-th w-[148px]">직함</th>
                      <th className="ui-th w-[160px]">소속</th>
                      <th className="ui-th w-[200px]">이메일</th>
                      <th className="ui-th w-[140px]">전화</th>
                      <th className="ui-th w-[108px]">역할</th>
                      <th className="ui-th w-[72px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const ready = row.name.trim() !== '' && row.email.trim() !== ''
                      return (
                        <tr key={row.key}>
                          <td>
                            <input
                              aria-label={`${i + 1}번째 이름`}
                              value={row.name}
                              onChange={(e) => patchField(row.key, 'name', e.target.value)}
                              placeholder={UNPARSED_HINT}
                              className="ui-input min-h-8 w-full"
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${i + 1}번째 직함`}
                              value={row.title}
                              onChange={(e) => patchField(row.key, 'title', e.target.value)}
                              placeholder={UNPARSED_HINT}
                              className="ui-input min-h-8 w-full"
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${i + 1}번째 소속`}
                              value={row.company}
                              onChange={(e) => patchField(row.key, 'company', e.target.value)}
                              placeholder={UNPARSED_HINT}
                              className="ui-input min-h-8 w-full"
                            />
                          </td>
                          <td>
                            <input
                              type="email"
                              aria-label={`${i + 1}번째 이메일`}
                              value={row.email}
                              onChange={(e) => patchField(row.key, 'email', e.target.value)}
                              placeholder={UNPARSED_HINT}
                              className="ui-input min-h-8 w-full"
                            />
                          </td>
                          <td>
                            {/* 전화는 하이픈이 든 표기 문자열이라 숫자 컨트롤(ui-input-num)이 아니다 */}
                            <input
                              aria-label={`${i + 1}번째 전화`}
                              value={row.phone}
                              onChange={(e) => patchField(row.key, 'phone', e.target.value)}
                              placeholder={UNPARSED_HINT}
                              className="ui-input min-h-8 w-full"
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`${i + 1}번째 역할`}
                              value={row.role}
                              onChange={(e) =>
                                setRows(
                                  (prev) =>
                                    prev?.map((r) =>
                                      r.key === row.key
                                        ? { ...r, role: e.target.value as MemberRole }
                                        : r,
                                    ) ?? prev,
                                )
                              }
                              className="ui-input ui-select min-h-8 w-full"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleAdd(row)}
                              disabled={!ready || add.pending}
                              aria-label={`${i + 1}번째 담당자 추가`}
                              className="btn btn-ghost btn-sm"
                            >
                              추가
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-cap">
                이름·이메일이 있어야 추가할 수 있습니다. 직함·전화는 담당자 정보로 함께 저장되며 발주처
                화면의 담당자 안내에도 그대로 표시됩니다. 소속은 아직 저장 자리가 없어 확인용으로만
                보여 줍니다.
              </p>
            </div>
          )}

          <ErrorAlert message={add.error} />
        </div>
      )}
    </div>
  )
}
