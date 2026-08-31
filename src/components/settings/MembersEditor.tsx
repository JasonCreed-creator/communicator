// 담당자 목록·배정·추가·삭제 — 행사 설정(S6) ②탭과 온보딩(S0) ②단계가 공용으로 쓴다(설계서 v1.5 §10).
// addMember·removeMember는 pm 전용(서버 assertPm) — readOnly=true(비 pm)면 배정·추가 행·삭제 버튼을 숨긴다.
// Phase 3.20 — 배정 경로가 셋이다: ①주소록에서 고르기(기본) ②직접 입력 ③전자명함 붙여넣기.
// 셋 다 저장은 addMember 하나로 모인다(이메일로 같은 사람을 알아보고 프로필을 재사용).
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../internal/EmptyState'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { parseContactCards, type ParsedContact } from '../../lib/contactCard'
import { ROLE_BAR_CLASSES, ROLE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { MemberRole } from '../../types/enums'
import type { UUID } from '../../types/entities'
import type { MemberInput, PersonWithAssignments } from '../../types/views'

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
  // 주소록(전역 담당자 마스터) — 배정 후보의 원천. 배정·삭제로 후보가 바뀌므로 멤버와 함께 재조회한다.
  const people = useAsync(() => provider.listPeople(), [])
  // removeMember는 void 반환 — useMutation 성공 판정(반환값 존재)을 위해 true로 감싼다
  const remove = useMutation(async (memberId: UUID) => {
    await provider.removeMember(projectId, memberId)
    return true
  })

  const reloadAll = () => {
    members.reload()
    // 직접 입력·전자명함으로 추가한 사람도 주소록에 올라가므로 후보 목록을 함께 새로 읽는다
    people.reload()
    onChanged?.()
  }

  const handleRemove = async (memberId: UUID, name: string) => {
    if (!window.confirm(`${name} 담당자를 삭제하시겠습니까?`)) return
    const ok = await remove.run(memberId)
    if (ok) reloadAll() // 배정에서 빠진 사람은 다시 후보가 된다
  }

  const assignedIds = new Set((members.data ?? []).map((m) => m.user_id))
  const assignedEmails = new Set(
    (members.data ?? [])
      .map((m) => m.profile.email?.toLowerCase())
      .filter((e): e is string => Boolean(e)),
  )
  // 이미 배정된 사람은 addMember가 409로 막는다 — 고를 수 없는 것을 목록에 두지 않는다.
  // 이메일이 없는 프로필도 뺀다: 이메일이 사람의 신원 키라 배정 자체가 성립하지 않는다.
  const candidates = (people.data ?? []).filter(
    (p) => Boolean(p.email) && !assignedIds.has(p.id) && !assignedEmails.has(p.email!.toLowerCase()),
  )

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
          <ErrorAlert message={people.error} />
          {members.data && people.data && (
            <AssignFromDirectory
              projectId={projectId}
              candidates={candidates}
              directoryEmpty={people.data.length === 0}
              onAssigned={reloadAll}
            />
          )}
          <AddMemberForm projectId={projectId} onCreated={reloadAll} />
          <ContactCardImport projectId={projectId} onCreated={reloadAll} />
        </>
      )}

      <p className="text-xs text-ink-cap">
        PM은 최소 1명 필수. 같은 사람이 여러 행사에 다른 역할로 참여할 수 있습니다(행사별 역할). Phase
        4에서 이메일 초대로 전환.
      </p>
    </div>
  )
}

/** 셀렉트 한 줄로 사람을 알아보게 — 동명이인은 직함·이메일로 갈린다 */
function personOptionLabel(person: PersonWithAssignments): string {
  return [person.name, person.title, person.email].filter(Boolean).join(' \u00b7 ')
}

/**
 * 등록된 담당자에서 배정 (Phase 3.20).
 *
 * 같은 사람을 행사마다 다시 타이핑하면 오타가 이메일에 그대로 꽂히고 연락처가 행사별로 갈라진다.
 * 그래서 고르는 경로를 직접 입력보다 **위에** 둔다. 저장은 기존 addMember 그대로 —
 * 이메일로 같은 사람을 알아보고 프로필을 재사용하므로 배정 전용 메서드가 필요 없다.
 */
function AssignFromDirectory({
  projectId,
  candidates,
  directoryEmpty,
  onAssigned,
}: {
  projectId: UUID
  candidates: PersonWithAssignments[]
  /** 후보 0명의 두 사정을 가른다: 주소록 자체가 빈 것 vs 이 행사에 전원 배정된 것 */
  directoryEmpty: boolean
  onAssigned: () => void
}) {
  const uid = useId()
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<MemberRole>(DEFAULT_ROLE)
  const assign = useMutation((person: PersonWithAssignments) =>
    provider.addMember(projectId, {
      display_name: person.name,
      email: person.email ?? '',
      role,
      // 주소록에 적힌 직함·전화를 그대로 들고 간다 — 행사마다 다시 묻지 않는 것이 목적이다
      title: person.title ?? null,
      phone: person.phone ?? null,
    }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const person = candidates.find((p) => p.id === personId)
    if (!person) {
      assign.setError('배정할 담당자를 선택하세요.')
      return
    }
    const created = await assign.run(person)
    if (created) {
      setPersonId('')
      onAssigned()
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="space-y-2 border-t border-border pt-3">
        <p className="t-caption text-ink-sub">등록된 담당자에서 배정</p>
        <EmptyState
          message={
            directoryEmpty
              ? '등록된 담당자가 없습니다 — 담당자 화면에서 먼저 등록하면 다음부터 골라서 배정할 수 있습니다.'
              : '이 행사에 배정할 수 있는 사람이 모두 배정됐습니다.'
          }
          action={
            <Link to="/people" className="btn btn-ghost btn-sm">
              담당자 화면 열기
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 border-t border-border pt-3"
    >
      <Field
        id={`${uid}-person`}
        label="등록된 담당자"
        hint="이미 이 행사에 배정된 사람은 목록에 없습니다."
      >
        <select
          id={`${uid}-person`}
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="ui-input ui-select w-72"
        >
          <option value="">담당자 선택</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {personOptionLabel(p)}
            </option>
          ))}
        </select>
      </Field>
      {/* 라벨을 '배정 역할'로 둔다 — 아래 직접 입력 폼의 '역할'과 이름이 겹치면 무엇을 고르는 칸인지 흐려진다 */}
      <Field id={`${uid}-assign-role`} label="배정 역할">
        <select
          id={`${uid}-assign-role`}
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
      <button
        type="submit"
        disabled={assign.pending || personId === ''}
        className="btn btn-ghost btn-sm"
      >
        배정
      </button>
      <Link to="/people" className="t-caption text-ink-cap underline">
        담당자 목록 관리
      </Link>
      <ErrorAlert message={assign.error} />
    </form>
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
      <p className="w-full text-xs text-ink-cap">
        주소록에 없는 사람을 여기서 바로 넣을 수 있습니다. 여기서 추가한 사람도 담당자 목록에
        등록되어 다음 행사에서는 골라서 배정할 수 있습니다.
      </p>
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
