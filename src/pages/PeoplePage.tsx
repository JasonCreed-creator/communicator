// S-13 담당자 마스터 (Phase 3.20) — **행사와 무관한 전역 주소록**.
//
// 사람은 행사보다 오래 산다. 행사마다 이름·이메일을 다시 치면 같은 사람이 행사별로 갈라지고
// 연락처가 어디에 맞는지 아무도 모르게 된다. 그래서 사람은 여기 한 번 등록하고,
// 배정(누가 어느 행사의 무슨 역할인가)은 각 행사의 **행사 설정 ② 담당자**에서 고른다.
//
// 사용자 결정 2건(3.20): ① 별도 화면 + 행사 설정엔 피커 · ② 삭제는 차단하고 어디에 배정됐는지 보여준다.
// 삭제 차단 사유(어느 행사인지)는 provider의 409 메시지에 그대로 담겨 오므로 화면은 삼키지 않고 그대로 띄운다.
import { useState, type FormEvent } from 'react'
import Card from '../components/internal/Card'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import Field from '../components/internal/Field'
import LoadFailedState from '../components/internal/LoadFailedState'
import PageHeader from '../components/internal/PageHeader'
import PermissionNotice from '../components/internal/PermissionNotice'
import TableSkeleton from '../components/internal/TableSkeleton'
import { useAsync, useMutation } from '../hooks/useAsync'
import { ROLE_BAR_CLASSES, ROLE_LABELS } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { UUID } from '../types/entities'
import type { PersonAssignment, PersonWithAssignments } from '../types/views'

const provider = getDataProvider()

/** 44 행 리듬을 지키려고 칩은 3개까지만 세우고 나머지는 +n으로 접는다.
 *  잘린 값은 셀 title로 전부 확인된다(패턴 §05 조건 2). 삭제 차단 메시지도 전 행사를 다 말한다. */
const MAX_CHIPS = 3

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub'

function assignmentText(a: PersonAssignment): string {
  return `${a.project_name} · ${ROLE_LABELS[a.role]}`
}

function AssignmentChips({ assignments }: { assignments: PersonAssignment[] }) {
  if (assignments.length === 0) return <span className="text-ink-cap">없음</span>
  const shown = assignments.slice(0, MAX_CHIPS)
  const rest = assignments.length - shown.length
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={assignments.map(assignmentText).join(', ')}
    >
      {shown.map((a) => (
        <span key={`${a.project_id}:${a.role}`} className={CHIP_CLASS} title={assignmentText(a)}>
          {/* 역할은 면이 아니라 형태 — 4px 좌측 바(패턴 §04) */}
          <span aria-hidden className={`h-3 w-1 shrink-0 rounded-full ${ROLE_BAR_CLASSES[a.role]}`} />
          {a.project_name}
        </span>
      ))}
      {rest > 0 && (
        <span data-testid="assignment-overflow" className={CHIP_CLASS}>
          +{rest}
        </span>
      )}
    </span>
  )
}

interface EditDraft {
  name: string
  email: string
  title: string
  phone: string
}

const EMPTY_DRAFT: EditDraft = { name: '', email: '', title: '', phone: '' }

export default function PeoplePage() {
  const people = useAsync(() => provider.listPeople(), [])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const isPm = currentUser.data?.role === 'pm'

  const [editingId, setEditingId] = useState<UUID | null>(null)
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT)
  const [draftError, setDraftError] = useState<{ name?: string; email?: string }>({})

  const update = useMutation((personId: UUID, patch: EditDraft) =>
    provider.updatePerson(personId, {
      name: patch.name.trim(),
      email: patch.email.trim(),
      title: patch.title.trim() || null,
      phone: patch.phone.trim() || null,
    }),
  )
  // removePerson은 void라 성공/실패를 반환값으로 못 가른다 — true를 얹어 호출부가 판단하게 한다
  const remove = useMutation(async (personId: UUID) => {
    await provider.removePerson(personId)
    return true
  })

  const rows = people.data ?? []

  const startEdit = (p: PersonWithAssignments) => {
    update.setError(null)
    remove.setError(null)
    setDraftError({})
    setEditingId(p.id)
    setDraft({ name: p.name, email: p.email ?? '', title: p.title ?? '', phone: p.phone ?? '' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setDraftError({})
    update.setError(null)
  }

  const saveEdit = async (personId: UUID) => {
    const errors: { name?: string; email?: string } = {}
    if (!draft.name.trim()) errors.name = '이름을 입력하세요.'
    if (!draft.email.trim()) errors.email = '이메일을 입력하세요.'
    setDraftError(errors)
    if (errors.name || errors.email) return
    const saved = await update.run(personId, draft)
    if (saved) {
      setEditingId(null)
      setDraft(EMPTY_DRAFT)
      people.reload()
    }
  }

  const handleRemove = async (p: PersonWithAssignments) => {
    if (!window.confirm(`'${p.name}' 담당자를 주소록에서 삭제할까요? 되돌릴 수 없습니다.`)) return
    update.setError(null)
    const ok = await remove.run(p.id)
    if (ok) people.reload()
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="전역 · S-13"
        title="담당자"
        action={
          people.data ? (
            <span className="inline-flex items-center rounded-full bg-track px-3 py-1 text-xs font-medium text-ink-sub">
              {people.data.length}명
            </span>
          ) : undefined
        }
      />

      <p className="max-w-3xl text-sm leading-relaxed text-ink-sub">
        이 목록은 <span className="font-medium text-ink">행사와 무관한 주소록</span>입니다. 여기서 한
        번 등록해 두면 각 행사의 <span className="font-medium text-ink">행사 설정 ② 담당자</span>에서
        골라 배정합니다 — 행사마다 이름·연락처를 다시 입력하지 않습니다.
      </p>

      <ErrorAlert message={currentUser.error} />

      {currentUser.data && !isPm && (
        <PermissionNotice
          reason="담당자 등록·수정·삭제는 PM만 할 수 있습니다."
          howToRequest="목록은 그대로 보실 수 있습니다. 추가·수정이 필요하면 행사 PM에게 요청하세요."
        />
      )}

      <Card title="담당자 목록">
        {/* 수정 전에 파급 범위를 먼저 말한다 — 고친 값이 다른 행사에서 튀어나오면 놀란다 */}
        <p data-testid="propagation-notice" className="mb-3 text-xs leading-relaxed text-ink-cap">
          여기서 고친 이름·직함·연락처는 이 사람이 올라간{' '}
          <span className="font-medium text-ink-sub">모든 행사와 발주처 화면</span>에 함께 반영됩니다.
        </p>

        <ErrorAlert message={update.error} />
        <ErrorAlert message={remove.error} />

        {people.loading && <TableSkeleton rows={4} columns={5} />}

        {people.error && <LoadFailedState message={people.error} onRetry={people.reload} />}

        {people.data && rows.length === 0 && (
          <EmptyState message="등록된 담당자가 없습니다. 아래에서 첫 담당자를 등록하세요." />
        )}

        {people.data && rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="ui-table min-w-[880px] text-sm" aria-label="담당자 목록">
              <thead>
                <tr>
                  <th className="ui-th w-[132px]">이름</th>
                  <th className="ui-th w-[148px]">직함</th>
                  <th className="ui-th w-[196px]">이메일</th>
                  <th className="ui-th w-[140px]">전화</th>
                  <th className="ui-th">배정된 행사</th>
                  {isPm && <th className="ui-th w-[136px]">관리</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) =>
                  editingId === p.id ? (
                    <tr key={p.id} data-testid={`person-row-${p.id}`} data-editing="true">
                      <td className="ui-cell-wrap">
                        <input
                          aria-label="이름"
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                          aria-invalid={draftError.name ? true : undefined}
                          className={`ui-input min-h-8 w-full${draftError.name ? ' ui-input-error' : ''}`}
                        />
                        {draftError.name && (
                          <span className="mt-1 block text-[11px] text-negative">{draftError.name}</span>
                        )}
                      </td>
                      <td className="ui-cell-wrap">
                        <input
                          aria-label="직함"
                          value={draft.title}
                          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                          className="ui-input min-h-8 w-full"
                        />
                      </td>
                      <td className="ui-cell-wrap">
                        <input
                          type="email"
                          aria-label="이메일"
                          value={draft.email}
                          onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                          aria-invalid={draftError.email ? true : undefined}
                          className={`ui-input min-h-8 w-full${draftError.email ? ' ui-input-error' : ''}`}
                        />
                        {draftError.email && (
                          <span className="mt-1 block text-[11px] text-negative">{draftError.email}</span>
                        )}
                      </td>
                      <td className="ui-cell-wrap">
                        <input
                          aria-label="전화"
                          value={draft.phone}
                          onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                          className="ui-input min-h-8 w-full"
                        />
                      </td>
                      <td className="text-ink-sub">
                        <AssignmentChips assignments={p.assignments} />
                      </td>
                      <td>
                        <span className="flex flex-nowrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(p.id)}
                            disabled={update.pending}
                            className="btn btn-ghost btn-sm"
                          >
                            저장
                          </button>
                          <button type="button" onClick={cancelEdit} className="btn btn-ghost btn-sm">
                            취소
                          </button>
                        </span>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} data-testid={`person-row-${p.id}`}>
                      <td className="text-ink">{p.name}</td>
                      <td className="text-ink-sub">{p.title ?? '-'}</td>
                      <td className="text-ink-sub">{p.email ?? '-'}</td>
                      <td className="text-ink-sub">{p.phone ?? '-'}</td>
                      <td className="text-ink-sub">
                        <AssignmentChips assignments={p.assignments} />
                      </td>
                      {isPm && (
                        <td>
                          <span className="flex flex-nowrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(p)}
                              className="btn btn-ghost btn-sm"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(p)}
                              disabled={remove.pending}
                              className="btn btn-ghost-negative btn-sm"
                            >
                              삭제
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isPm && <AddPersonCard onCreated={() => people.reload()} />}
    </section>
  )
}

function AddPersonCard({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<EditDraft>(EMPTY_DRAFT)
  // §10-C — 필수 미입력은 그 줄에서 말한다. 이메일 중복 같은 서버 거절은 아래 블록 자리다
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const create = useMutation(() =>
    provider.createPerson({
      name: form.name.trim(),
      email: form.email.trim(),
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
    }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const next: { name?: string; email?: string } = {}
    if (!form.name.trim()) next.name = '이름을 입력하세요.'
    if (!form.email.trim()) next.email = '이메일을 입력하세요.'
    setErrors(next)
    if (next.name || next.email) return
    const created = await create.run()
    if (created) {
      setForm(EMPTY_DRAFT)
      onCreated()
    }
  }

  return (
    <Card title="담당자 등록">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <Field id="person-new-name" label="이름" required error={errors.name}>
          <input
            id="person-new-name"
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
              if (errors.name) setErrors((x) => ({ ...x, name: undefined }))
            }}
            aria-invalid={errors.name ? true : undefined}
            className={`ui-input w-36${errors.name ? ' ui-input-error' : ''}`}
          />
        </Field>
        <Field id="person-new-title" label="직함">
          <input
            id="person-new-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="기획팀 팀장"
            className="ui-input w-40"
          />
        </Field>
        <Field id="person-new-email" label="이메일" required error={errors.email}>
          <input
            id="person-new-email"
            type="email"
            value={form.email}
            onChange={(e) => {
              setForm((f) => ({ ...f, email: e.target.value }))
              if (errors.email) setErrors((x) => ({ ...x, email: undefined }))
            }}
            aria-invalid={errors.email ? true : undefined}
            className={`ui-input w-56${errors.email ? ' ui-input-error' : ''}`}
          />
        </Field>
        <Field id="person-new-phone" label="전화">
          <input
            id="person-new-phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="010-0000-0000"
            className="ui-input w-40"
          />
        </Field>
        <button type="submit" disabled={create.pending} className="btn btn-accent btn-sm">
          담당자 등록
        </button>
      </form>
      <p className="mt-3 text-xs text-ink-cap">
        이메일이 사람의 신원 키입니다 — 이미 등록된 이메일이면 등록되지 않습니다.
      </p>
      <div className="mt-3">
        <ErrorAlert message={create.error} />
      </div>
    </Card>
  )
}
