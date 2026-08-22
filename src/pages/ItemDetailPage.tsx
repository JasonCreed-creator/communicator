import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import CuesheetEditor from '../components/cue/CuesheetEditor'
import BriefCard from '../components/internal/BriefCard'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import StatusBadge from '../components/internal/StatusBadge'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, formatDate, formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Version } from '../types/entities'
import type { ApprovalDecision, CommentVisibility } from '../types/enums'
import NotFoundPage from './NotFoundPage'

const provider = getDataProvider()

const DECISION_LABELS: Record<ApprovalDecision, string> = {
  approved: '승인',
  changes_requested: '수정요청',
}

export default function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>()
  if (!itemId) return <NotFoundPage />
  return <ItemDetail itemId={itemId} />
}

function ItemDetail({ itemId }: { itemId: string }) {
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(PROJECT_ID), [])
  const detail = useAsync(() => provider.getDeliverable(itemId), [itemId])

  if (detail.error) {
    return (
      <section className="p-6">
        <ErrorAlert message={detail.error} />
      </section>
    )
  }
  if (!detail.data) {
    return (
      <section className="p-6">
        <p className="text-sm text-gray-400">불러오는 중…</p>
      </section>
    )
  }

  const d = detail.data
  const role = currentUser.data?.role
  const canWriteArea = !!role && (role === 'pm' || role === d.area)
  const isPm = role === 'pm'
  // v1.3 큐시트: category='큐시트' 항목은 파일 대신 정형 표 에디터 — 편집은 pm·ops 전용(§6.1)
  const isCuesheet = d.category === '큐시트'
  const canEditCue = role === 'pm' || role === 'ops'
  const memberName = (userId: string | null) =>
    members.data?.find((m) => m.user_id === userId)?.profile.name ?? (userId ? userId : '미배정')

  return (
    <section className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs text-gray-400">S3</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{d.title}</h1>
          <StatusBadge status={d.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {AREA_LABELS[d.area]} · {d.category}
        </p>
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <div>
          <p className="text-xs text-gray-400">담당</p>
          <p className="mt-0.5 text-gray-900">{memberName(d.assignee_id)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">마감</p>
          <p className="mt-0.5 flex items-center gap-2 text-gray-900">
            {d.due_date ? (
              <>
                {formatDate(d.due_date)}
                <DdayBadge isoDate={d.due_date} />
              </>
            ) : (
              '미정'
            )}
          </p>
        </div>
      </div>

      <BriefCard deliverable={d} />

      <StatusActionBar
        deliverableId={d.id}
        status={d.status}
        category={d.category}
        requiresApproval={d.requires_approval}
        versions={d.versions}
        isPm={isPm}
        canWriteArea={canWriteArea}
        lastChangesRequestedComment={
          d.approvals
            .slice()
            .reverse()
            .find((a) => a.decision === 'changes_requested')?.client_comment ?? null
        }
        onChanged={detail.reload}
      />

      {isCuesheet ? (
        <CuesheetEditor deliverableId={d.id} canEdit={canEditCue} />
      ) : (
        <VersionUploadForm deliverableId={d.id} canWrite={canWriteArea} onUploaded={detail.reload} />
      )}

      <Card title="버전 이력">
        {d.versions.length === 0 && <p className="text-sm text-gray-400">업로드된 버전이 없습니다.</p>}
        <ul className="space-y-4">
          {d.versions.map((v, idx) => (
            <VersionItem key={v.id} version={v} isLatest={idx === 0} uploaderName={memberName(v.uploaded_by)} />
          ))}
        </ul>
      </Card>

      <CommentThread deliverableId={d.id} comments={d.comments} memberName={memberName} onAdded={detail.reload} />

      <Card title="컨펌 이력">
        {d.approvals.length === 0 && <p className="text-sm text-gray-400">컨펌 이력이 없습니다.</p>}
        {d.approvals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="pb-2 pr-4 font-medium">요청일</th>
                  <th className="pb-2 pr-4 font-medium">기한</th>
                  <th className="pb-2 pr-4 font-medium">결정</th>
                  <th className="pb-2 pr-4 font-medium">결정일</th>
                  <th className="pb-2 font-medium">발주처 코멘트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.approvals.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 text-gray-700">{formatDateTime(a.requested_at)}</td>
                    <td className="py-2 pr-4 text-gray-700">{a.due_at ? formatDateTime(a.due_at) : '-'}</td>
                    <td className="py-2 pr-4 text-gray-700">
                      {a.decision ? DECISION_LABELS[a.decision] : '대기중'}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{a.decided_at ? formatDateTime(a.decided_at) : '-'}</td>
                    <td className="py-2 text-gray-700">{a.client_comment ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}

// ── 상태 액션 바 ──────────────────────────────────────────────────────
function StatusActionBar({
  deliverableId,
  status,
  category,
  requiresApproval,
  versions,
  isPm,
  canWriteArea,
  lastChangesRequestedComment,
  onChanged,
}: {
  deliverableId: string
  status: string
  category: string
  requiresApproval: boolean
  versions: Version[]
  isPm: boolean
  canWriteArea: boolean
  lastChangesRequestedComment: string | null
  onChanged: () => void
}) {
  // v1.3 큐시트: 발송 시 provider(requestApproval)가 표를 .pdf 스냅숏으로 자동 버전 등록하고
  // version_id는 무시한다 — 버전 선택 셀렉트 대신 안내 문구로 대체한다.
  const isCuesheet = category === '큐시트'
  const toReview = useMutation(() => provider.transitionStatus(deliverableId, 'internal_review'))
  const [rejectComment, setRejectComment] = useState('')
  const reject = useMutation((comment: string) =>
    provider.transitionStatus(deliverableId, 'draft', { comment }),
  )
  const [versionId, setVersionId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const requestApproval = useMutation(() =>
    provider.requestApproval(deliverableId, {
      // 큐시트 항목은 DataProvider가 version_id를 무시하고 createCueSnapshot으로 대체한다.
      // 동결된 RequestApprovalInput이 version_id를 필수로 요구해 관례상 리터럴 'auto'를 보낸다
      // (§8 cue-snapshot 전처리 — MockProvider.requestApproval 참조).
      version_id: isCuesheet ? 'auto' : versionId,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
    }),
  )

  const handleToReview = async () => {
    const result = await toReview.run()
    if (result) onChanged()
  }

  const handleReject = async (e: FormEvent) => {
    e.preventDefault()
    if (!rejectComment.trim()) return
    const result = await reject.run(rejectComment)
    if (result) {
      setRejectComment('')
      onChanged()
    }
  }

  const handleRequestApproval = async (e: FormEvent) => {
    e.preventDefault()
    if (!isCuesheet && !versionId) {
      requestApproval.setError('발송할 버전을 선택하세요.')
      return
    }
    const result = await requestApproval.run()
    if (result) {
      setVersionId('')
      setDueAt('')
      onChanged()
    }
  }

  if (status === 'requested') {
    return (
      <Card title="상태 액션">
        <p className="text-sm text-gray-700">지시가 발행되었습니다.</p>
        <p className="mt-1 text-xs text-gray-400">첫 버전을 업로드하면 자동으로 초안(draft) 상태로 전환됩니다.</p>
      </Card>
    )
  }

  if (status === 'draft' && canWriteArea) {
    return (
      <Card title="상태 액션">
        <button
          type="button"
          onClick={handleToReview}
          disabled={toReview.pending}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          내부검토 요청
        </button>
        <ErrorAlert message={toReview.error} />
      </Card>
    )
  }

  if (status === 'internal_review') {
    if (!isPm) {
      return (
        <Card title="상태 액션">
          <p className="text-sm text-gray-400">내부검토 중입니다. PM의 반려 또는 컨펌 발송을 기다리세요.</p>
        </Card>
      )
    }
    return (
      <Card title="상태 액션 (PM)">
        <div className="space-y-5">
          <form onSubmit={handleReject} className="space-y-2">
            <p className="text-xs font-medium text-gray-500">반려 (사유 필수)</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="반려 사유"
                className="min-w-64 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              />
              <button
                type="submit"
                disabled={reject.pending}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                반려
              </button>
            </div>
            <ErrorAlert message={reject.error} />
          </form>

          {requiresApproval ? (
            <form onSubmit={handleRequestApproval} className="space-y-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500">컨펌 발송</p>
              <div className="flex flex-wrap items-end gap-2">
                {isCuesheet ? (
                  <p className="max-w-xs text-xs text-gray-500">
                    발송 시 표의 스냅숏(.pdf)이 자동 버전으로 등록됩니다.
                  </p>
                ) : (
                  <label className="flex flex-col gap-1 text-xs text-gray-500">
                    버전
                    <select
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                      className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                    >
                      <option value="">버전 선택…</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.version_no} — {v.file_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                  컨펌 기한
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                  />
                </label>
                <button
                  type="submit"
                  disabled={requestApproval.pending}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  컨펌 발송
                </button>
              </div>
              <ErrorAlert message={requestApproval.error} />
            </form>
          ) : (
            <p className="border-t border-gray-100 pt-4 text-sm text-gray-400">
              이 항목은 컨펌 루프를 사용하지 않습니다(공통 문서).
            </p>
          )}
        </div>
      </Card>
    )
  }

  if (status === 'pending_approval') {
    return (
      <Card title="상태 액션">
        <p className="text-sm text-gray-400">발주처 컨펌 대기 중입니다.</p>
      </Card>
    )
  }

  if (status === 'changes_requested') {
    return (
      <Card title="상태 액션">
        <p className="text-sm text-gray-700">
          발주처가 수정을 요청했습니다{lastChangesRequestedComment ? `: ${lastChangesRequestedComment}` : ''}.
        </p>
        <p className="mt-1 text-xs text-gray-400">새 버전을 업로드하면 자동으로 초안(draft) 상태로 돌아갑니다.</p>
      </Card>
    )
  }

  if (status === 'approved') {
    return (
      <Card title="상태 액션">
        <p className="text-sm text-gray-400">발주처가 승인했습니다 — 확정본으로 전환 중입니다.</p>
      </Card>
    )
  }

  return (
    <Card title="상태 액션">
      <p className="text-sm text-gray-400">확정된 항목입니다.</p>
    </Card>
  )
}

// ── 버전 업로드 ───────────────────────────────────────────────────────
function VersionUploadForm({
  deliverableId,
  canWrite,
  onUploaded,
}: {
  deliverableId: string
  canWrite: boolean
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const upload = useMutation(() => {
    if (!file) throw new Error('파일을 선택하세요.')
    return provider.uploadVersion(deliverableId, { file_name: file.name, note: note || undefined, file })
  })

  if (!canWrite) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      upload.setError('파일을 선택하세요.')
      return
    }
    const result = await upload.run()
    if (result) {
      setFile(null)
      setNote('')
      onUploaded()
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
  }

  return (
    <Card title="버전 업로드">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          파일
          <input
            type="file"
            onChange={handleFileChange}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          노트
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="버전 노트(선택)"
            className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <button
          type="submit"
          disabled={upload.pending}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          업로드
        </button>
      </form>
      <ErrorAlert message={upload.error} />
    </Card>
  )
}

// ── 버전 항목 (미리보기 포함) ─────────────────────────────────────────
function VersionItem({ version, isLatest, uploaderName }: { version: Version; isLatest: boolean; uploaderName: string }) {
  const preview = useAsync(() => provider.getFileUrl(version.id), [version.id])
  const [previewFailed, setPreviewFailed] = useState(false)

  return (
    <li className="flex flex-wrap items-start gap-4 rounded-md border border-gray-100 p-3">
      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {preview.data && !previewFailed ? (
          <img
            src={preview.data}
            alt={version.file_name}
            className="h-full w-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-gray-400">
            {version.file_name}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-900">v{version.version_no}</span>
          {isLatest && (
            <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
              최신
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-700">{version.file_name}</p>
        {version.note && <p className="mt-0.5 text-xs text-gray-500">{version.note}</p>}
        <p className="mt-1 text-xs text-gray-400">
          {uploaderName} · {formatDateTime(version.created_at)}
        </p>
      </div>
    </li>
  )
}

// ── 코멘트 스레드 ─────────────────────────────────────────────────────
function CommentThread({
  deliverableId,
  comments,
  memberName,
  onAdded,
}: {
  deliverableId: string
  comments: import('../types/entities').Comment[]
  memberName: (userId: string | null) => string
  onAdded: () => void
}) {
  const [body, setBody] = useState('')
  const [shared, setShared] = useState(false)
  const add = useMutation((visibility: CommentVisibility) =>
    provider.addComment(deliverableId, { body, visibility }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    const result = await add.run(shared ? 'shared' : 'internal')
    if (result) {
      setBody('')
      setShared(false)
      onAdded()
    }
  }

  return (
    <Card title="코멘트">
      {comments.length === 0 && <p className="text-sm text-gray-400">코멘트가 없습니다.</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-md border border-gray-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {c.author_token ? '발주처' : memberName(c.author_user_id)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.visibility === 'shared' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {c.visibility === 'shared' ? '공유' : '내부'}
              </span>
              <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{c.body}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2 border-t border-gray-100 pt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="코멘트를 입력하세요"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            발주처에 공유(shared) — 기본은 내부(internal)
          </label>
          <button
            type="submit"
            disabled={add.pending}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            등록
          </button>
        </div>
        <ErrorAlert message={add.error} />
      </form>
    </Card>
  )
}
