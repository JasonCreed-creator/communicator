import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import CuesheetEditor from '../components/cue/CuesheetEditor'
import GuideBuilder from '../components/guide/GuideBuilder'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import VersionUploadCard, { UPLOAD_FORM_ID, UPLOAD_INPUT_ID } from '../components/upload/VersionUploadCard'
import BriefCard from '../components/internal/BriefCard'
import { useClientLinkTarget } from '../components/board/DesignNextAction'
import CommentThread from '../components/item/CommentThread'
import DeleteItemDialog from '../components/item/DeleteItemDialog'
import ItemMenu from '../components/item/ItemMenu'
import { ItemEditCard, boardPathFor, itemManageRights } from '../components/item/ItemManageCard'
import NextStepCard from '../components/item/NextStepCard'
import { ApprovalTimeline, VersionListCard, VersionPreviewCard } from '../components/item/VersionPanels'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import StatusBadge, { LevelBadge } from '../components/internal/StatusBadge'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { categoryGroupLabel } from '../lib/boardPresets'
import {
  AREA_LABELS,
  HOST_STATUS_LABELS,
  ROLE_BAR_CLASSES,
  STATUS_BADGE_CLASSES,
  formatDate,
  formatDateTime,
  formatDateWeekday,
} from '../lib/labels'
import { getDataProvider } from '../providers'
import { providerKind } from '../providers/kind'
import { uploadLock, versionStorage } from '../lib/uploadGate'
import type { Version } from '../types/entities'
import type { DeliverableArea, DeliverableStatus, MemberRole } from '../types/enums'
import NotFoundPage from './NotFoundPage'

export { railIndexOf, railStepState } from '../components/item/NextStepCard'

// v2.4 §21 — 주최형(파트너) 제출 항목은 발주처 컨펌 어휘 대신 HOST_STATUS_LABELS로 표기한다
// (§5.1). StatusBadge(내부 공용)를 건드리지 않고 이 화면 전용으로 배지를 다시 그린다.
function HostStatusBadge({ status }: { status: DeliverableStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {status === 'pending_approval' && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
      {HOST_STATUS_LABELS[status]}
    </span>
  )
}

const provider = getDataProvider()

/** 헤더 복귀 경로 — S2 보드 라우트가 있는 영역만 링크로(공통 문서는 보드가 없다) */
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

/** 버전 업로드 카드 앵커 — 헤더·'다음 단계' 버튼이 같은 카드로 시선을 옮긴다(상태 전이 없음) */
function focusVersionUpload() {
  const form = document.getElementById(UPLOAD_FORM_ID)
  form?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  const input = document.getElementById(UPLOAD_INPUT_ID) as HTMLInputElement | null
  input?.focus()
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
  // Phase 3.23 PR-3(§7-2.6) — 디자인 보드의 '올리기'는 `?upload=1`로 들어온다. 화면이 그려지면 업로드 카드로
  // 시선을 옮기고(잠금 안내·Drive 경고·진행률이 있는 한 곳) 주소에서 표시를 지운다 — 새로고침해도 다시 튀지 않게.
  const [searchParams, setSearchParams] = useSearchParams()
  const wantsUpload = searchParams.get('upload') === '1'
  const readyForUpload = !!detail.data && !!currentUser.data
  useEffect(() => {
    if (!wantsUpload || !readyForUpload) return
    const t = setTimeout(() => {
      focusVersionUpload()
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('upload')
          return next
        },
        { replace: true },
      )
    }, 0)
    return () => clearTimeout(t)
  }, [wantsUpload, readyForUpload, setSearchParams])
  const navigate = useNavigate()
  // Phase 3.23 PR-4 — ⋯ 메뉴(고치기·지우기)와 미리볼 버전
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  // 컨펌대기 항목의 발주처 링크 재전달(대행형 PM) — 이메일은 아직 가지 않는다(Phase 6b)
  const clientLink = useClientLinkTarget(
    projectId,
    currentUser.data?.role === 'pm' && project.data?.kind !== 'host' && detail.data?.status === 'pending_approval',
  )
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
  const assigneeRole = members.data?.find((m) => m.user_id === d.assignee_id)?.role ?? null

  const statusBadge =
    d.partner_id != null ? <HostStatusBadge status={d.status} /> : <StatusBadge status={d.status} />

  // Phase 3.23 PR-4(§7-2.7) — 머리 = 복귀 경로·제목·상태·담당·마감 + [최신본 내려받기][⋯]. 올리기·내부검토 요청·컨펌 발송은
  // 전부 '다음 단계' 카드 한 곳에(채운 버튼 1개). 정형 문서(큐시트·빌더)는 3.16.3/3.16.4의 "상단 스트립 단일 표시"를 유지한다.
  const latestVersion = d.versions[0]
  const hasPartner = d.partner_id != null
  const lock = uploadLock(d.status, { hasPartner })
  const lastChangesRequested = d.approvals
    .slice()
    .reverse()
    .find((a) => a.decision === 'changes_requested')
  let openApproval: (typeof d.approvals)[number] | null = null
  for (const a of d.approvals) if (a.decided_at === null) openApproval = a
  const rights = itemManageRights(d, role)
  const closed = project.data?.status === 'closed'
  const leave = boardPathFor(d.area)
  const shownVersionId = selectedVersionId && d.versions.some((v) => v.id === selectedVersionId) ? selectedVersionId : latestVersion?.id ?? null

  const menu = rights.canEdit ? (
    <ItemMenu canDelete={rights.canDelete} closed={closed} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} />
  ) : null

  const nextStep = (
    <NextStepCard
      deliverable={d}
      isPm={isPm}
      canWriteArea={canWriteArea}
      isHost={isHost}
      autoSnapshotDoc={isStructuredPanel}
      sendViaHeader={isBuilderDoc}
      showRail={!isStructuredPanel}
      clientLink={clientLink}
      inlineSend={isCuesheet}
      onUpload={focusVersionUpload}
      onChanged={detail.reload}
    />
  )

  const comments = (
    <CommentThread
      deliverableId={d.id}
      comments={d.comments}
      memberName={memberName}
      hasPartner={hasPartner}
      onAdded={detail.reload}
    />
  )

  const timeline = (
    <ApprovalTimeline approvals={d.approvals} versions={d.versions} requesterName={memberName} hasPartner={hasPartner} />
  )

  return (
    <section className="space-y-5 p-6">
      <ItemHeader
        title={d.title}
        area={d.area}
        category={d.category}
        showMeta={!isStructuredPanel || isCuesheet}
        extraMeta={
          isCuesheet && latestVersion
            ? `최신 v${latestVersion.version_no} · ${formatDate(latestVersion.created_at.slice(0, 10))}`
            : undefined
        }
        statusBadge={statusBadge}
        assigneeName={memberName(d.assignee_id)}
        assigneeRole={assigneeRole}
        dueDate={d.due_date}
        done={d.status === 'final' || d.status === 'approved'}
        actions={
          <>
            {(!isStructuredPanel || isCuesheet) && latestVersion && <LatestDownloadLink version={latestVersion} />}
            {menu}
          </>
        }
      />

      {/* ⋯ → 고치기: 본문 맨 위에서 연다(저장하면 머리에 바로 반영) */}
      {editing && rights.canEdit && (
        <ItemEditCard
          deliverable={d}
          isPm={rights.isPm}
          members={members.data ?? undefined}
          onSaved={() => {
            setEditing(false)
            detail.reload()
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* 3.17b 시안 — 발주처 수정요청은 본문 최상단 경고 카드(원문 인용 + 결정일시) */}
      {d.status === 'changes_requested' && (
        <ChangeRequestAlert
          decidedAt={lastChangesRequested?.decided_at ?? null}
          comment={
            lastChangesRequested?.client_comment ??
            d.comments.filter((c) => c.visibility === 'shared').slice(-1)[0]?.body ??
            null
          }
          hasPartner={hasPartner}
        />
      )}

      {isCuesheet ? (
        // §7-2.8 큐시트 — 메타는 머리 한 줄(스트립 없음) · 다음 단계 한 줄(PM 발송 포함) · 표 · 대본 | 코멘트·컨펌 기록
        <div className="min-w-0 space-y-5">
          {nextStep}
          <BriefCard deliverable={d} />
          <CuesheetEditor
            deliverableId={d.id}
            canEdit={canEditCue}
            side={
              <>
                {comments}
                {timeline}
              </>
            }
          />
        </div>
      ) : isStructuredPanel ? (
        // 3.9.1 P1: 정형 문서 = 1단 전폭 — 표·빌더가 깨지지 않도록 메타를 에디터 위 가로 스트립으로
        <div className="min-w-0 space-y-6">
          <CuesheetMetaStrip
            status={d.status}
            assigneeName={memberName(d.assignee_id)}
            dueDate={d.due_date}
            versions={d.versions}
            isFinal={d.status === 'final'}
            uploaderNameFor={(userId) => memberName(userId)}
          />
          <BriefCard deliverable={d} />
          {nextStep}
          {isScenarioDoc ? (
            <ScenarioBuilder deliverableId={d.id} canEdit={canEditCue} onStatusChanged={detail.reload} />
          ) : (
            <GuideBuilder deliverableId={d.id} canEdit={canEditCue} onStatusChanged={detail.reload} />
          )}
          {comments}
          {timeline}
        </div>
      ) : (
        // §7-2.7: 일반 항목 = 본문(다음 단계 · 큰 미리보기 · 업로드 · 코멘트) + 오른쪽 320(버전 이력 · 컨펌 기록 · 제작 가이드)
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            {nextStep}
            {latestVersion && shownVersionId && (
              <VersionPreviewCard versions={d.versions} selectedId={shownVersionId} onSelect={setSelectedVersionId} />
            )}
            {/* 업로드가 막힌 상태면 카드를 그리지 않는다 — 이유는 다음 단계 카드가 말한다(Phase 4.3.1 계약 유지) */}
            {!lock && (
              <VersionUploadCard
                deliverableId={d.id}
                status={d.status}
                hasPartner={hasPartner}
                driveFolderId={d.drive_folder_id}
                canWrite={canWriteArea}
                onUploaded={detail.reload}
              />
            )}
            {comments}
          </div>
          <aside className="space-y-4">
            <VersionListCard
              versions={d.versions}
              selectedId={shownVersionId}
              onSelect={setSelectedVersionId}
              sentVersionId={d.status === 'pending_approval' ? openApproval?.version_id ?? null : null}
              uploaderName={memberName}
            />
            {timeline}
            <BriefCard
              deliverable={d}
              showEmpty
              onFill={rights.isPm && !closed ? () => setEditing(true) : undefined}
            />
          </aside>
        </div>
      )}

      {deleting && (
        <DeleteItemDialog
          deliverable={d}
          leaveLabel={leave.label}
          onCancel={() => setDeleting(false)}
          onLeave={() => navigate(leave.path)}
        />
      )}
    </section>
  )
}

// ── 헤더 (3.17b 시안) ────────────────────────────────────────────────
// 복귀 경로(보드 › 카테고리 › S3) · 제목 · 상태 배지 · 담당(역할 도트) · 마감 D-day · 주 액션 2개.
// 상태는 **면**(배지), 역할은 **형태**(8px 도트)로만 나타낸다(패턴 §04 — 역할에 pill 금지).
function ItemHeader({
  title,
  area,
  category,
  showMeta,
  statusBadge,
  assigneeName,
  assigneeRole,
  dueDate,
  done,
  extraMeta,
  actions,
}: {
  title: string
  area: DeliverableArea
  category: string
  /** 정형 문서(큐시트·빌더)는 상단 스트립이 메타를 이미 표시한다 — 헤더는 복귀 경로만 */
  showMeta: boolean
  statusBadge: ReactNode
  assigneeName: string
  assigneeRole: MemberRole | null
  dueDate: string | null
  /** 승인·확정 — 기한 칸에 '완료' */
  done: boolean
  /** 메타 줄 끝에 덧붙일 것 — 큐시트의 '최신 vN · 날짜' */
  extraMeta?: string
  actions: ReactNode
}) {
  const hasBoard = BOARD_AREAS.includes(area)
  return (
    <div>
      <nav aria-label="위치" className="t-caption flex flex-wrap items-center gap-1.5">
        {hasBoard ? (
          <Link to={`/board/${area}`} className="text-ink-cap hover:text-accent-deep hover:underline">
            {AREA_LABELS[area]} 보드
          </Link>
        ) : (
          <span>{AREA_LABELS[area]}</span>
        )}
        <span aria-hidden>›</span>
        <span className="text-ink-sub">{categoryGroupLabel(category)}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="t-page-title">{title}</h1>
            {showMeta && statusBadge}
          </div>
          {showMeta && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-sub">
              <span>{categoryGroupLabel(category)}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${
                    assigneeRole ? ROLE_BAR_CLASSES[assigneeRole] : 'bg-border-strong'
                  }`}
                />
                {assigneeName}
              </span>
              {dueDate && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-2">
                    마감 {formatDateWeekday(dueDate)}
                    {/* 끝난 항목에는 '지남'을 붙이지 않는다(§7-2.2) */}
                    {done ? (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
                        완료
                      </span>
                    ) : (
                      <DdayBadge isoDate={dueDate} />
                    )}
                  </span>
                </>
              )}
              {extraMeta && (
                <>
                  <span aria-hidden>·</span>
                  <span>{extraMeta}</span>
                </>
              )}
            </p>
          )}
        </div>
        {actions && <div className="print-hidden flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** 헤더 주 액션 ① — 최신 버전 내려받기(파일 URL이 준비된 뒤에만 링크로 나타난다) */
function LatestDownloadLink({ version }: { version: Version }) {
  const url = useAsync(() => provider.getFileUrl(version.id), [version.id])
  if (!url.data) return null
  return (
    <a href={url.data} download={version.file_name} target="_blank" rel="noreferrer" className="btn btn-ghost">
      최신본 내려받기
    </a>
  )
}

// ── 발주처 수정요청 경고 (3.17b 시안) ────────────────────────────────
function ChangeRequestAlert({
  decidedAt,
  comment,
  hasPartner,
}: {
  decidedAt: string | null
  comment: string | null
  hasPartner: boolean
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-negative/40 bg-negative-tint p-4"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="mt-0.5 size-[18px] shrink-0 text-negative"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-negative">
          {hasPartner ? '파트너 제출물에 수정을 요청했습니다' : '발주처가 수정을 요청했습니다'}
          {decidedAt ? ` — ${formatDateTime(decidedAt)}` : ''}
        </p>
        {comment && (
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-sub">“{comment}”</p>
        )}
        <p className="mt-2 text-xs text-ink-cap">
          {hasPartner
            ? '파트너가 재제출하면 자동으로 검토중 상태로 돌아갑니다.'
            : '새 버전을 업로드하면 자동으로 초안(draft) 상태로 돌아갑니다.'}
        </p>
      </div>
    </div>
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
  // Phase 4.3.1 ④ — 이 버전의 파일이 실제로 어디 있는가(실서버만 — mock은 전부 데모라 표시하지 않는다)
  const storage = versionStorage(version.drive_file_id, providerKind())

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
            {/* Phase 3.23 PR-4 — 흰 글자 주황 면(대비 3.07) 대신 의미 배지(§7-2.1) */}
            {isLatest && <LevelBadge level={isFinal ? 'positive' : 'neutral'} label="최신" />}
            {storage && (
              <span title={storage.title} data-testid="version-storage">
                <LevelBadge level={storage.level} label={storage.label} />
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
