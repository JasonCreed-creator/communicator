// 담당자 배정 보드 — 행사 설정(S6) ②탭과 온보딩(S0) ②단계가 공용으로 쓴다(설계서 v1.5 §10).
// Phase 3.22(2026-09-24, 사용자 지시 "미리 배치하지 말고 인물카드를 만들어서 클릭하거나 드래그앤드랍으로"):
//   역할 칸 4개(PM·디자인·운영·등록) = 이 행사의 배정 현황, 주소록 인물 카드 = 배정 후보.
//   배정은 ①카드를 눌러 역할 고르기 ②카드를 역할 칸으로 끌어놓기 — 저장은 addMember 하나(DataProvider 불변).
//   미리 배치하지 않는다 — 새 행사에는 만든 사람(PM)만 있다(설계서 §8).
// addMember·removeMember는 pm 전용(서버 assertPm) — readOnly=true(비 pm)면 역할 칸만 읽기로 보여 준다.
// 주소록에 없는 사람은 ②직접 입력 ③전자명함 붙여넣기로 넣는다(Phase 3.20) — 셋 다 addMember로 모인다
// (이메일로 같은 사람을 알아보고 프로필을 재사용).
import { useId, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../internal/EmptyState'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { parseContactCards, type ParsedContact } from '../../lib/contactCard'
import { ROLE_BAR_CLASSES, ROLE_BORDER_CLASSES, ROLE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { MemberRole } from '../../types/enums'
import type { UUID } from '../../types/entities'
import type { MemberInput, MemberWithProfile, PersonWithAssignments } from '../../types/views'

const provider = getDataProvider()

const ROLES: MemberRole[] = ['pm', 'design', 'ops', 'reg']
const DEFAULT_ROLE: MemberRole = 'design'

/** 끌어놓기 데이터 형식 — 역할 칸은 주소록 카드만 받는다(파일·글자를 끌어와도 반응하지 않는다) */
export const PERSON_DRAG_TYPE = 'application/x-communicator-person'

/** 역할은 형태로만 — 8px 도트(디자인지시서 §7-1.2: 역할에 pill 배지를 쓰지 않는다) */
function RoleDot({ role }: { role: MemberRole }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${ROLE_BAR_CLASSES[role]}`} />
}

/** 카드 머리 글자 — 성(첫 글자)으로 사람을 빠르게 알아본다. 이미지 자산을 두지 않는다 */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function carriesPerson(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(PERSON_DRAG_TYPE)
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
  // 주소록(전역 담당자 마스터) — 배정 후보의 원천. 배정·빼기로 후보가 바뀌므로 멤버와 함께 재조회한다.
  const people = useAsync(() => provider.listPeople(), [])
  // removeMember는 void 반환 — useMutation 성공 판정(반환값 존재)을 위해 true로 감싼다
  const remove = useMutation(async (memberId: UUID) => {
    await provider.removeMember(projectId, memberId)
    return true
  })
  const assign = useMutation((person: PersonWithAssignments, role: MemberRole) =>
    provider.addMember(projectId, {
      display_name: person.name,
      email: person.email ?? '',
      role,
      // 주소록에 적힌 직함·전화를 그대로 들고 간다 — 행사마다 다시 묻지 않는 것이 목적이다
      title: person.title ?? null,
      phone: person.phone ?? null,
    }),
  )
  // 끌고 있는 카드 — 역할 칸이 받을 준비가 됐다는 표시(점선)를 켠다
  const [draggingId, setDraggingId] = useState<UUID | null>(null)

  const reloadAll = () => {
    members.reload()
    // 직접 입력·전자명함으로 추가한 사람도 주소록에 올라가므로 후보 목록을 함께 새로 읽는다
    people.reload()
    onChanged?.()
  }

  const handleRemove = async (memberId: UUID, name: string) => {
    if (!window.confirm(`${name} 님을 이 행사 담당에서 뺄까요? 담당자 목록(주소록)에는 그대로 남습니다.`)) return
    assign.setError(null)
    const ok = await remove.run(memberId)
    if (ok) reloadAll() // 뺀 사람은 다시 후보 카드가 된다
  }

  const assignedIds = new Set((members.data ?? []).map((m) => m.user_id))
  const assignedEmails = new Set(
    (members.data ?? [])
      .map((m) => m.profile.email?.toLowerCase())
      .filter((e): e is string => Boolean(e)),
  )
  // 이미 배정된 사람은 addMember가 409로 막는다 — 고를 수 없는 카드를 두지 않는다.
  // 이메일이 없는 프로필도 뺀다: 이메일이 사람의 신원 키라 배정 자체가 성립하지 않는다.
  const candidates = (people.data ?? []).filter(
    (p) => Boolean(p.email) && !assignedIds.has(p.id) && !assignedEmails.has(p.email!.toLowerCase()),
  )

  const handleAssign = async (person: PersonWithAssignments, role: MemberRole): Promise<boolean> => {
    remove.setError(null)
    const created = await assign.run(person, role)
    if (created) reloadAll()
    return Boolean(created)
  }

  const handleDropPerson = (personId: string, role: MemberRole) => {
    setDraggingId(null)
    const person = candidates.find((p) => p.id === personId)
    // 이미 배정됐거나(다른 탭에서 먼저 배정) 주소록에서 사라진 카드 — 조용히 무시하지 않고 사실을 알린다
    if (!person) {
      assign.setError('그 담당자는 이미 배정됐거나 주소록에 없습니다. 목록을 새로 확인하세요.')
      reloadAll()
      return
    }
    void handleAssign(person, role)
  }

  const busy = assign.pending || remove.pending

  return (
    // @container — 열 수를 화면 폭이 아니라 이 편집기가 놓인 칸의 폭으로 정한다
    // (행사 설정 ②는 좁은 왼쪽 열, 온보딩 ②는 넓은 본문 — 같은 컴포넌트가 두 폭에 놓인다)
    <div className="@container space-y-3">
      <ErrorAlert message={members.error} />
      {members.data && (
        <RoleLanes
          members={members.data}
          readOnly={readOnly}
          dragging={draggingId !== null}
          busy={busy}
          onDropPerson={handleDropPerson}
          onRemove={handleRemove}
        />
      )}
      <ErrorAlert message={remove.error} />
      <ErrorAlert message={assign.error} />

      {!readOnly && (
        <>
          <ErrorAlert message={people.error} />
          {members.data && people.data && (
            <PeoplePool
              candidates={candidates}
              directoryEmpty={people.data.length === 0}
              busy={busy}
              onAssign={handleAssign}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
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

/**
 * 역할 칸 4개 = 이 행사의 배정 현황 (Phase 3.22 — 표를 대체).
 *
 * 칸마다 배정된 사람의 이름·직함·이메일·전화를 보여 준다(3.18.1 §2 — 직함·전화는 발주처 화면에도
 * 그대로 나가는 값이라 여기서 눈으로 확인된다). 주소록 카드를 끌어와 놓으면 그 역할로 배정된다.
 * 배정된 카드는 끌 수 없다 — 역할을 바꾸려면 빼고 다시 배정한다(빼기·배정 두 동작이 각각 보인다).
 */
function RoleLanes({
  members,
  readOnly,
  dragging,
  busy,
  onDropPerson,
  onRemove,
}: {
  members: MemberWithProfile[]
  readOnly: boolean
  dragging: boolean
  busy: boolean
  onDropPerson: (personId: string, role: MemberRole) => void
  onRemove: (memberId: UUID, name: string) => void
}) {
  const [overRole, setOverRole] = useState<MemberRole | null>(null)
  const accepts = (e: DragEvent) => !readOnly && !busy && carriesPerson(e)

  return (
    <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-4" data-testid="role-lanes">
      {ROLES.map((role) => {
        const laneMembers = members.filter((m) => m.role === role)
        const over = overRole === role
        return (
          <section
            key={role}
            aria-label={`${ROLE_LABELS[role]} 담당`}
            data-role-lane={role}
            onDragEnter={(e) => {
              if (!accepts(e)) return
              e.preventDefault()
              setOverRole(role)
            }}
            onDragOver={(e) => {
              if (!accepts(e)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverRole((r) => (r === role ? null : r))
              }
            }}
            onDrop={(e) => {
              setOverRole(null)
              if (!accepts(e)) return
              e.preventDefault()
              const personId = e.dataTransfer.getData(PERSON_DRAG_TYPE)
              if (personId) onDropPerson(personId, role)
            }}
            className={`flex min-h-[120px] flex-col rounded-lg border-2 p-2.5 transition-colors ${
              over
                ? 'border-accent bg-accent-tint'
                : dragging && !readOnly
                  ? 'border-dashed border-border-strong bg-canvas'
                  : 'border-transparent bg-canvas'
            }`}
          >
            <header className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-ink">
                <RoleDot role={role} />
                {ROLE_LABELS[role]}
              </span>
              <span className="t-caption whitespace-nowrap text-ink-cap">{laneMembers.length}명</span>
            </header>
            {laneMembers.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {laneMembers.map((m) => (
                  <li
                    key={m.user_id}
                    data-member-card={m.user_id}
                    className={`rounded-md border border-l-4 border-border ${ROLE_BORDER_CLASSES[role]} bg-card px-2.5 py-2 shadow-card`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink" title={m.profile.name}>
                          {m.profile.name}
                        </p>
                        {m.profile.title && (
                          <p className="truncate text-xs text-ink-sub" title={m.profile.title}>
                            {m.profile.title}
                          </p>
                        )}
                        {m.profile.email && (
                          <p className="truncate text-xs text-ink-cap" title={m.profile.email}>
                            {m.profile.email}
                          </p>
                        )}
                        {m.profile.phone && (
                          <p className="truncate text-xs text-ink-cap" title={m.profile.phone}>
                            {m.profile.phone}
                          </p>
                        )}
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onRemove(m.user_id, m.profile.name)}
                          disabled={busy}
                          aria-label={`${m.profile.name} 빼기`}
                          className="shrink-0 whitespace-nowrap text-xs text-negative underline"
                        >
                          빼기
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-ink-cap">
                {readOnly ? '배정 없음' : over ? '여기에 놓으면 배정됩니다' : '카드를 여기로 끌어놓기'}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * 주소록 인물 카드 = 배정 후보 (Phase 3.22 — 셀렉트 피커를 대체).
 *
 * 같은 사람을 행사마다 다시 타이핑하면 오타가 이메일에 그대로 꽂히고 연락처가 행사별로 갈라진다.
 * 그래서 고르는 경로를 직접 입력보다 **위에** 둔다(Phase 3.20). 카드를 누르면 역할 버튼 4개가 열리고,
 * 카드를 끌어 역할 칸에 놓아도 된다 — 끌기가 안 되는 터치·키보드 환경은 누르기로 같은 일을 한다.
 */
function PeoplePool({
  candidates,
  directoryEmpty,
  busy,
  onAssign,
  onDragStart,
  onDragEnd,
}: {
  candidates: PersonWithAssignments[]
  /** 후보 0명의 두 사정을 가른다: 주소록 자체가 빈 것 vs 이 행사에 전원 배정된 것 */
  directoryEmpty: boolean
  busy: boolean
  onAssign: (person: PersonWithAssignments, role: MemberRole) => Promise<boolean>
  onDragStart: (personId: UUID) => void
  onDragEnd: () => void
}) {
  const [openId, setOpenId] = useState<UUID | null>(null)

  if (candidates.length === 0) {
    return (
      <div className="space-y-2 border-t border-border pt-3">
        <p className="t-caption text-ink-sub">주소록</p>
        <EmptyState
          message={
            directoryEmpty
              ? '등록된 담당자가 없습니다 — 담당자 화면에서 먼저 등록하면 다음부터 카드로 골라서 배정할 수 있습니다.'
              : '주소록의 모든 담당자가 이 행사에 배정됐습니다.'
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
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-caption text-ink-sub">
          주소록 {candidates.length}명 — 카드를 눌러 역할을 고르거나, 위의 역할 칸으로 끌어놓으세요.
        </p>
        <Link to="/people" className="t-caption text-ink-cap underline">
          담당자 목록 관리
        </Link>
      </div>
      <ul className="grid grid-cols-1 items-start gap-2 @sm:grid-cols-2 @2xl:grid-cols-3" aria-label="배정할 수 있는 담당자">
        {candidates.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            open={openId === person.id}
            busy={busy}
            onToggle={() => setOpenId((id) => (id === person.id ? null : person.id))}
            onAssign={async (role) => {
              if (await onAssign(person, role)) setOpenId(null)
            }}
            onDragStart={() => {
              setOpenId(null)
              onDragStart(person.id)
            }}
            onDragEnd={onDragEnd}
          />
        ))}
      </ul>
    </div>
  )
}

function PersonCard({
  person,
  open,
  busy,
  onToggle,
  onAssign,
  onDragStart,
  onDragEnd,
}: {
  person: PersonWithAssignments
  open: boolean
  busy: boolean
  onToggle: () => void
  onAssign: (role: MemberRole) => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const groupId = useId()
  // 머리는 <button>이 아니라 role="button"이다 — <button> 위에서 시작한 끌기가 부모의 draggable로
  // 이어지지 않는 브라우저 문제(파이어폭스로 알려짐 — 실측은 크롬만)를 피해, 누르는 곳과 끄는 곳을 같게 둔다.
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!busy) onToggle()
    }
  }
  return (
    <li
      draggable={!busy}
      data-person-card={person.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(PERSON_DRAG_TYPE, person.id)
        e.dataTransfer.setData('text/plain', person.name)
        e.dataTransfer.effectAllowed = 'copy'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`rounded-lg border bg-card px-3 py-2 shadow-card transition-colors ${
        open ? 'border-accent' : 'border-border hover:border-border-strong'
      } ${busy ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-expanded={open}
        aria-controls={open ? groupId : undefined}
        aria-disabled={busy || undefined}
        aria-label={`${person.name} 역할 고르기`}
        onClick={() => {
          if (!busy) onToggle()
        }}
        onKeyDown={handleKey}
        className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-track text-sm font-semibold text-brown"
        >
          {initialOf(person.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
          <span className="block truncate text-xs text-ink-sub">{person.title || person.email}</span>
        </span>
      </div>
      {open && (
        <div id={groupId} role="group" aria-label={`${person.name} 역할`} className="mt-2 flex flex-wrap gap-1.5">
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => onAssign(role)}
              disabled={busy}
              aria-label={`${person.name} ${ROLE_LABELS[role]}으로 배정`}
              className="btn btn-ghost btn-sm gap-1.5"
            >
              <RoleDot role={role} />
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      )}
    </li>
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
