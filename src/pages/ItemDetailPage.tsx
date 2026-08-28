import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import CuesheetEditor from '../components/cue/CuesheetEditor'
import GuideBuilder from '../components/guide/GuideBuilder'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import BriefCard from '../components/internal/BriefCard'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import StatusBadge from '../components/internal/StatusBadge'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, HOST_STATUS_LABELS, STATUS_BADGE_CLASSES, formatDate, formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Version } from '../types/entities'
import type { ApprovalDecision, CommentVisibility, DeliverableStatus } from '../types/enums'
import NotFoundPage from './NotFoundPage'

// v2.4 §21 — 주최형(파트너) 제출 항목은 발주처 컨펌 어휘 대신 HOST_STATUS_LABELS로 표기한다
// (§5.1). StatusBadge(내부 공용)를 건드리지 않고 이 화면 전용으로 배지를 다시 그린다.
function HostStatusBadge({ status }: { status: DeliverableStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {status === 'pending_approval' && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
      {HOST_STATUS_LABELS[status]}
    </span>
  )
}

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
  const { projectId } = useProject()
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const detail = useAsync(() => provider.getDeliverable(itemId), [itemId])
  // v2.4 §10.1 — 주최형에서는 발주처 컨펌 발송 UI를 숨긴다(파트너 항목이든 아니든, DoD 31)
  const isHost = project.data?.kind === 'host'
  // v2.5 §23 — 시나리오·운영가이드 빌더 문서 판정 재료. 카테고리 문자열만으로는 부족하다:
  // v2.5 이전의 자유 카테고리 '시나리오' 항목(예: 샘플 dlv-005)은 파일 흐름을 유지해야
  // 한다(R-O1 무손실). provider의 requestApproval 자동 스냅숏 판정과 같은 기준 — 빌더 행이
  // 있거나 파일 버전이 아직 없는 정형 문서만 빌더 모드다. 카테고리 불일치 조회는 409를
  // 던지므로 0건으로 흡수한다.
  const builderRows = useAsync(async () => {
    const [blocks, sections] = await Promise.all([
      provider.listScenarioBlocks(itemId).catch(() => []),
      provider.listGuideSections(itemId).catch(() => []),
    ])
    return blocks.length + sections.length
  }, [itemId])

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
        <p className="text-sm text-ink-cap">불러오는 중…</p>
      </section>
    )
  }

  const d = detail.data
  const role = currentUser.data?.role
  const canWriteArea = !!role && (role === 'pm' || role === d.area)
  const isPm = role === 'pm'
  // v1.3 큐시트: category='큐시트' 항목은 파일 대신 정형 표 에디터 — 편집은 pm·ops 전용(§6.1)
  const isCuesheet = d.category === '큐시트'
  // v2.5 §23 — 시나리오·운영가이드 빌더 모드(위 builderRows 주석의 판정 기준)
  const isScenarioDoc = d.category === '시나리오'
  const isGuideDoc = d.category === '운영가이드'
  const isBuilderDoc =
    (isScenarioDoc || isGuideDoc) && ((builderRows.data ?? 0) > 0 || d.versions.length === 0)
  // 정형 문서 공통 레이아웃(1단 전폭 + 메타 스트립) — 큐시트(3.9.1 P1)와 동일 취급
  const isStructuredPanel = isCuesheet || isBuilderDoc
  // 큐시트·빌더 편집 권한은 동일하게 pm·ops(§6.1·§8.2)
  const canEditCue = role === 'pm' || role === 'ops'

  // 판정 재료(builderRows)가 오기 전에 파일 폼을 잠깐 그렸다가 빌더로 바꾸면 화면이 튄다 —
  // 정형 2종 카테고리에서만 로딩을 기다린다(그 외 카테고리는 판정과 무관).
  if ((isScenarioDoc || isGuideDoc) && builderRows.data === undefined) {
    return (
      <section className="p-6">
        <p className="text-sm text-ink-cap">불러오는 중…</p>
      </section>
    )
  }
  const memberName = (userId: string | null) =>
    members.data?.find((m) => m.user_id === userId)?.profile.name ?? (userId ? userId : '미배정')

  return (
    <section className="space-y-6 p-6">
      <div>
        <p className="t-caption">S3</p>
        <h1 className="t-page-title mt-1">{d.title}</h1>
        <p className="mt-1 text-sm text-ink-sub">
          {AREA_LABELS[d.area]} · {d.category}
        </p>
      </div>

      {/* §6 S3: 일반 항목 = 2단 분할 — 좌(주 콘텐츠) 가이드 카드·상태 액션·미리보기·코멘트 / 우(300 고정)
          메타 사이드(상태·담당·마감·버전 타임라인).
          3.9.1 P1: 큐시트 항목 = 1단 전폭 — 7열 정형 표가 깨지지 않도록 메타를 에디터 위
          가로 스트립 카드로 재배치(버전 이력은 최신 1건 + 전체 보기 토글). */}
      <div
        className={`grid grid-cols-1 gap-6 ${
          isStructuredPanel ? '' : 'lg:grid-cols-[minmax(0,660px)_300px]'
        }`}
      >
        <div className="min-w-0 space-y-6">
          {isStructuredPanel && (
            <CuesheetMetaStrip
              status={d.status}
              assigneeName={memberName(d.assignee_id)}
              dueDate={d.due_date}
              versions={d.versions}
              isFinal={d.status === 'final'}
              uploaderNameFor={(userId) => memberName(userId)}
            />
          )}

          <BriefCard deliverable={d} />

          <StatusActionBar
            deliverableId={d.id}
            status={d.status}
            category={d.category}
            autoSnapshotDoc={isStructuredPanel}
            requiresApproval={d.requires_approval}
            versions={d.versions}
            isPm={isPm}
            canWriteArea={canWriteArea}
            isHost={isHost}
            hasPartner={d.partner_id != null}
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
          ) : isBuilderDoc && isScenarioDoc ? (
            <ScenarioBuilder deliverableId={d.id} canEdit={canEditCue} />
          ) : isBuilderDoc ? (
            <GuideBuilder deliverableId={d.id} canEdit={canEditCue} />
          ) : (
            <VersionUploadForm deliverableId={d.id} canWrite={canWriteArea} onUploaded={detail.reload} />
          )}

          <CommentThread deliverableId={d.id} comments={d.comments} memberName={memberName} onAdded={detail.reload} />

          <Card title="컨펌 이력">
            {d.approvals.length === 0 && <p className="text-sm text-ink-cap">컨펌 이력이 없습니다.</p>}
            {d.approvals.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="ui-th">요청일</th>
                      <th className="ui-th">기한</th>
                      <th className="ui-th">결정</th>
                      <th className="ui-th">결정일</th>
                      <th className="ui-th">발주처 코멘트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.approvals.map((a) => (
                      <tr key={a.id} className="h-11 hover:bg-accent-tint/30">
                        <td className="py-2 pr-4 text-ink-sub">{formatDateTime(a.requested_at)}</td>
                        <td className="py-2 pr-4 text-ink-sub">{a.due_at ? formatDateTime(a.due_at) : '-'}</td>
                        <td className="py-2 pr-4 text-ink-sub">
                          {a.decision ? DECISION_LABELS[a.decision] : '대기중'}
                        </td>
                        <td className="py-2 pr-4 text-ink-sub">{a.decided_at ? formatDateTime(a.decided_at) : '-'}</td>
                        <td className="py-2 text-ink-sub">{a.client_comment ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* 3.16.3 T3② — 정형 문서(큐시트·빌더)는 메타가 상단 스트립에 이미 있으므로
            하단(1단 폴드 아래) 메타·버전 카드를 그리지 않는다(중복 제거). 레거시 파일 문서는 유지 */}
        {!isStructuredPanel && (
        <aside className="space-y-6">
          <div className="ui-card space-y-4 p-5">
            <div>
              <p className="t-caption">상태</p>
              <div className="mt-1.5">
                {d.partner_id != null ? <HostStatusBadge status={d.status} /> : <StatusBadge status={d.status} />}
              </div>
            </div>
            <div>
              <p className="t-caption">담당</p>
              <p className="mt-1 text-sm text-ink">{memberName(d.assignee_id)}</p>
            </div>
            <div>
              <p className="t-caption">마감</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-ink">
                {d.due_date ? (
                  <>
                    {formatDate(d.due_date)}
                    <DdayBadge isoDate={d.due_date} />
                  </>
                ) : (
                  '미정'
                )}
              </div>
            </div>
          </div>

          <Card title="버전 이력">
            {d.versions.length === 0 && <p className="text-sm text-ink-cap">업로드된 버전이 없습니다.</p>}
            {d.versions.length > 0 && (
              // §6 S3: 버전 타임라인 — 세로선 + 항목별 도트로 이력 표현
              <ul className="space-y-5 border-l border-border pl-5">
                {d.versions.map((v, idx) => (
                  <VersionItem
                    key={v.id}
                    version={v}
                    isLatest={idx === 0}
                    isFinal={d.status === 'final'}
                    uploaderName={memberName(v.uploaded_by)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </aside>
        )}
      </div>
    </section>
  )
}

// ── 큐시트 메타 스트립 (3.9.1 P1) ────────────────────────────────────
// 큐시트 항목 전용 — 우측 메타 사이드를 대신해 상태·담당·마감·버전을 에디터 위 한 줄로 요약한다.
// 버전 이력은 최신 1건만 인라인, '전체 보기' 토글 시 기존 세로 타임라인을 그대로 펼친다.
function CuesheetMetaStrip({
  status,
  assigneeName,
  dueDate,
  versions,
  isFinal,
  uploaderNameFor,
}: {
  status: DeliverableStatus
  assigneeName: string
  dueDate: string | null
  versions: Version[]
  isFinal: boolean
  uploaderNameFor: (userId: string | null) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const latest = versions[0]

  return (
    <div className="ui-card p-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <p className="t-caption">상태</p>
          <div className="mt-1.5">
            <StatusBadge status={status} />
          </div>
        </div>
        <div>
          <p className="t-caption">담당</p>
          <p className="mt-1.5 text-sm text-ink">{assigneeName}</p>
        </div>
        <div>
          <p className="t-caption">마감</p>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-ink">
            {dueDate ? (
              <>
                {formatDate(dueDate)}
                <DdayBadge isoDate={dueDate} />
              </>
            ) : (
              '미정'
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="t-caption">버전 이력</p>
          {latest ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-ink">v{latest.version_no}</span>
              <span className="min-w-0 truncate text-ink-sub" title={latest.file_name}>
                {latest.file_name}
              </span>
              {versions.length > 1 && (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="btn btn-ghost btn-sm">
                  {expanded ? '접기' : `전체 보기 (${versions.length})`}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-ink-cap">업로드된 버전이 없습니다.</p>
          )}
        </div>
      </div>
      {expanded && versions.length > 0 && (
        <ul className="mt-5 space-y-5 border-l border-border pl-5">
          {versions.map((v, idx) => (
            <VersionItem
              key={v.id}
              version={v}
              isLatest={idx === 0}
              isFinal={isFinal}
              uploaderName={uploaderNameFor(v.uploaded_by)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 상태 액션 바 ──────────────────────────────────────────────────────
function StatusActionBar({
  deliverableId,
  status,
  category,
  autoSnapshotDoc,
  requiresApproval,
  versions,
  isPm,
  canWriteArea,
  isHost,
  hasPartner,
  lastChangesRequestedComment,
  onChanged,
}: {
  deliverableId: string
  status: string
  category: string
  /** v2.5 §23 — 발송 시 provider가 인쇄 스냅숏을 자동 버전 등록하는 정형 문서
   *  (큐시트, 그리고 빌더 데이터가 있는 시나리오·운영가이드 — R-O2 doc-snapshot) */
  autoSnapshotDoc: boolean
  requiresApproval: boolean
  versions: Version[]
  isPm: boolean
  canWriteArea: boolean
  /** v2.4 §10.1 — 주최형 행사면 발주처 컨펌 발송 UI를 숨긴다(DoD 31) */
  isHost: boolean
  /** partner_id가 있는 항목 — 파트너 보드에서 검토한다는 안내로 대체 */
  hasPartner: boolean
  lastChangesRequestedComment: string | null
  onChanged: () => void
}) {
  // v1.3→v2.5 정형 문서(autoSnapshotDoc): 발송 시 provider(requestApproval)가 문서를 .pdf
  // 스냅숏으로 자동 버전 등록하고 version_id는 무시한다 — 버전 선택 셀렉트 대신 안내 문구로
  // 대체한다. 안내 문구만 큐시트("표")와 빌더 문서("인쇄 스냅숏")로 나눠 쓴다.
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
      // 정형 문서는 DataProvider가 version_id를 무시하고 createDocSnapshot으로 대체한다.
      // 동결된 RequestApprovalInput이 version_id를 필수로 요구해 관례상 리터럴 'auto'를 보낸다
      // (§8 doc-snapshot 전처리 — MockProvider.requestApproval 참조).
      version_id: autoSnapshotDoc ? 'auto' : versionId,
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
    if (!autoSnapshotDoc && !versionId) {
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
        <p className="text-sm text-ink-sub">가이드가 발행되었습니다.</p>
        <p className="mt-1 text-xs text-ink-cap">첫 버전을 업로드하면 자동으로 초안(draft) 상태로 전환됩니다.</p>
      </Card>
    )
  }

  if (status === 'draft' && canWriteArea) {
    return (
      <Card title="상태 액션">
        <button type="button" onClick={handleToReview} disabled={toReview.pending} className="btn btn-primary">
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
          <p className="text-sm text-ink-cap">내부검토 중입니다. PM의 반려 또는 컨펌 발송을 기다리세요.</p>
        </Card>
      )
    }
    return (
      <Card title="상태 액션 (PM)">
        <div className="space-y-5">
          <form onSubmit={handleReject} className="space-y-2">
            <p className="t-caption">반려 (사유 필수)</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="반려 사유"
                className="ui-input min-w-64 flex-1"
              />
              <button type="submit" disabled={reject.pending} className="btn btn-ghost">
                반려
              </button>
            </div>
            <ErrorAlert message={reject.error} />
          </form>

          {isHost ? (
            <p className="border-t border-border pt-4 text-xs text-ink-cap">
              주최형 행사는 이 화면에서 발주처 컨펌을 발송하지 않습니다
              {hasPartner ? ' — 파트너 제출 항목은 파트너 보드에서 검토하세요.' : '.'}
            </p>
          ) : requiresApproval ? (
            <form onSubmit={handleRequestApproval} className="space-y-2 border-t border-border pt-4">
              <p className="t-caption">컨펌 발송</p>
              <div className="flex flex-wrap items-end gap-2">
                {isCuesheet ? (
                  <p className="max-w-xs text-xs text-ink-sub">
                    발송 시 표의 스냅숏(.pdf)이 자동 버전으로 등록됩니다.
                  </p>
                ) : autoSnapshotDoc ? (
                  <p className="max-w-xs text-xs text-ink-sub">
                    발송 시 인쇄 스냅숏(.pdf)이 자동 버전으로 등록됩니다.
                  </p>
                ) : (
                  <label className="flex flex-col gap-1 t-caption">
                    버전
                    <select
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                      className="ui-input w-64"
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
                <label className="flex flex-col gap-1 t-caption">
                  컨펌 기한
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="ui-input"
                  />
                </label>
                <button type="submit" disabled={requestApproval.pending} className="btn btn-accent">
                  컨펌 발송
                </button>
              </div>
              <ErrorAlert message={requestApproval.error} />
            </form>
          ) : (
            <p className="border-t border-border pt-4 text-sm text-ink-cap">
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
        <p className="text-sm text-ink-cap">
          {hasPartner ? '파트너 제출 검토 대기 중입니다 — ' : '발주처 컨펌 대기 중입니다.'}
          {hasPartner && (
            <Link to="/partners" className="text-steel hover:underline">
              파트너 보드에서 검토
            </Link>
          )}
        </p>
      </Card>
    )
  }

  if (status === 'changes_requested') {
    return (
      <Card title="상태 액션">
        <p className="text-sm text-ink-sub">
          {hasPartner ? '수정요청되었습니다' : '발주처가 수정을 요청했습니다'}
          {lastChangesRequestedComment ? `: ${lastChangesRequestedComment}` : '.'}
        </p>
        <p className="mt-1 text-xs text-ink-cap">
          {hasPartner
            ? '파트너가 재제출하면 자동으로 검토중 상태로 돌아갑니다.'
            : '새 버전을 업로드하면 자동으로 초안(draft) 상태로 돌아갑니다.'}
        </p>
      </Card>
    )
  }

  if (status === 'approved') {
    return (
      <Card title="상태 액션">
        <p className="text-sm text-ink-cap">
          {hasPartner ? '승인되었습니다 — 확정본으로 전환 중입니다.' : '발주처가 승인했습니다 — 확정본으로 전환 중입니다.'}
        </p>
      </Card>
    )
  }

  return (
    <Card title="상태 액션">
      <p className="text-sm text-ink-cap">확정된 항목입니다.</p>
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
        <label className="flex flex-col gap-1 t-caption">
          파일
          <input type="file" onChange={handleFileChange} className="ui-input" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          노트
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="버전 노트(선택)"
            className="ui-input w-64"
          />
        </label>
        <button type="submit" disabled={upload.pending} className="btn btn-primary">
          업로드
        </button>
      </form>
      <ErrorAlert message={upload.error} />
    </Card>
  )
}

// ── 버전 항목 (미리보기 포함, 우측 메타 사이드의 버전 타임라인 1행) ────
function VersionItem({
  version,
  isLatest,
  isFinal,
  uploaderName,
}: {
  version: Version
  isLatest: boolean
  /** 상위 항목(deliverable) 상태가 final인지 — 타임라인 도트·최신 뱃지 색 분기(§6 S3) */
  isFinal: boolean
  uploaderName: string
}) {
  const preview = useAsync(() => provider.getFileUrl(version.id), [version.id])
  const [previewFailed, setPreviewFailed] = useState(false)
  const dotClass = isLatest ? (isFinal ? 'bg-positive' : 'bg-accent') : 'bg-border-strong'

  return (
    <li className="relative">
      <span aria-hidden className={`absolute -left-6 top-1.5 size-2 rounded-full ${dotClass}`} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-track">
          {preview.data && !previewFailed ? (
            <img
              src={preview.data}
              alt={version.file_name}
              className="h-full w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-ink-cap">
              {version.file_name}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">v{version.version_no}</span>
            {isLatest && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-card ${
                  isFinal ? 'bg-positive' : 'bg-accent'
                }`}
              >
                최신
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-sub">{version.file_name}</p>
          {version.note && <p className="mt-0.5 text-xs text-ink-cap">{version.note}</p>}
          <p className="mt-1 text-xs text-ink-cap">
            {uploaderName} · {formatDateTime(version.created_at)}
          </p>
        </div>
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
      {comments.length === 0 && <p className="text-sm text-ink-cap">코멘트가 없습니다.</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">
                {c.author_token ? '발주처' : memberName(c.author_user_id)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.visibility === 'shared' ? 'bg-steel-tint text-steel' : 'bg-track text-ink-sub'
                }`}
              >
                {c.visibility === 'shared' ? '공유' : '내부'}
              </span>
              <span className="text-xs text-ink-cap">{formatDateTime(c.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-sub">{c.body}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2 border-t border-border pt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="코멘트를 입력하세요"
          className="ui-input w-full"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-ink-sub">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            발주처에 공유(shared) — 기본은 내부(internal)
          </label>
          <button type="submit" disabled={add.pending} className="btn btn-primary">
            등록
          </button>
        </div>
        <ErrorAlert message={add.error} />
      </form>
    </Card>
  )
}
