import { Fragment, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import CuesheetEditor from '../components/cue/CuesheetEditor'
import GuideBuilder from '../components/guide/GuideBuilder'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import BriefCard from '../components/internal/BriefCard'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import ErrorAlert from '../components/internal/ErrorAlert'
import StatusBadge, { LevelBadge } from '../components/internal/StatusBadge'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import {
  AREA_LABELS,
  HOST_STATUS_LABELS,
  ROLE_BAR_CLASSES,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  formatDate,
  formatDateTime,
} from '../lib/labels'
import { getDataProvider } from '../providers'
import type { Version } from '../types/entities'
import type {
  ApprovalDecision,
  CommentVisibility,
  DeliverableArea,
  DeliverableStatus,
  MemberRole,
} from '../types/enums'
import NotFoundPage from './NotFoundPage'

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

const DECISION_LABELS: Record<ApprovalDecision, string> = {
  approved: '승인',
  changes_requested: '수정요청',
}

/** 헤더 복귀 경로 — S2 보드 라우트가 있는 영역만 링크로(공통 문서는 보드가 없다) */
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

/** 버전 업로드 폼 앵커 — 헤더·'다음 단계' 버튼이 같은 폼으로 시선을 옮긴다(상태 전이 없음) */
const UPLOAD_FORM_ID = 'version-upload-form'
const UPLOAD_INPUT_ID = 'version-upload-file'

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

  // 3.17b 시안 — 헤더에 복귀 경로·상태·담당·마감·주 액션 2개를 집약한다.
  // 정형 문서(큐시트·빌더)는 3.16.3/3.16.4에서 확정한 "상단 스트립 단일 표시"를 유지한다 —
  // 상태·담당·마감은 스트립이, 주 액션은 문서 헤더가 이미 담당하므로 헤더는 복귀 경로만 쓴다.
  const latestVersion = d.versions[0]
  const lastChangesRequested = d.approvals
    .slice()
    .reverse()
    .find((a) => a.decision === 'changes_requested')

  return (
    <section className="space-y-5 p-6">
      <ItemHeader
        title={d.title}
        area={d.area}
        category={d.category}
        showMeta={!isStructuredPanel}
        statusBadge={statusBadge}
        assigneeName={memberName(d.assignee_id)}
        assigneeRole={assigneeRole}
        dueDate={d.due_date}
        actions={
          isStructuredPanel ? null : (
            <>
              {latestVersion && <LatestDownloadLink version={latestVersion} />}
              {canWriteArea && (
                <button type="button" onClick={focusVersionUpload} className="btn btn-accent">
                  새 버전 업로드
                </button>
              )}
            </>
          )
        }
      />

      {/* 3.17b 시안 — 발주처 수정요청은 상태 카드 안 한 줄이 아니라 본문 최상단 경고 카드로
          올린다(원문 인용 + 결정일시). 같은 문장을 상태 카드가 반복하지 않는다. */}
      {d.status === 'changes_requested' && (
        <ChangeRequestAlert
          decidedAt={lastChangesRequested?.decided_at ?? null}
          comment={
            lastChangesRequested?.client_comment ??
            d.comments.filter((c) => c.visibility === 'shared').slice(-1)[0]?.body ??
            null
          }
          hasPartner={d.partner_id != null}
        />
      )}

      {/* §6 S3: 일반 항목 = 2단 분할 — 좌(주 콘텐츠) 가이드 카드·상태 액션·미리보기·코멘트 / 우(300 고정)
          메타 사이드(상태·담당·마감·버전 타임라인).
          3.9.1 P1: 큐시트 항목 = 1단 전폭 — 7열 정형 표가 깨지지 않도록 메타를 에디터 위
          가로 스트립 카드로 재배치(버전 이력은 최신 1건 + 전체 보기 토글). */}
      <div
        className={`grid grid-cols-1 gap-6 ${
          isStructuredPanel ? '' : 'lg:grid-cols-[minmax(0,1fr)_300px]'
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
            sendViaHeader={isBuilderDoc}
            showRail={!isStructuredPanel}
            requiresApproval={d.requires_approval}
            versions={d.versions}
            isPm={isPm}
            canWriteArea={canWriteArea}
            isHost={isHost}
            hasPartner={d.partner_id != null}
            onChanged={detail.reload}
          />

          {isCuesheet ? (
            <CuesheetEditor deliverableId={d.id} canEdit={canEditCue} />
          ) : isBuilderDoc && isScenarioDoc ? (
            <ScenarioBuilder deliverableId={d.id} canEdit={canEditCue} onStatusChanged={detail.reload} />
          ) : isBuilderDoc ? (
            <GuideBuilder deliverableId={d.id} canEdit={canEditCue} onStatusChanged={detail.reload} />
          ) : (
            <VersionUploadForm deliverableId={d.id} canWrite={canWriteArea} onUploaded={detail.reload} />
          )}

          <CommentThread deliverableId={d.id} comments={d.comments} memberName={memberName} onAdded={detail.reload} />

          <Card title="컨펌 이력">
            {d.approvals.length === 0 && <p className="text-sm text-ink-cap">컨펌 이력이 없습니다.</p>}
            {d.approvals.length > 0 && (
              // 패턴 기준 시트 §05 표 정본 — 44행·zebra·hover·…처리는 .ui-table이 한 벌로 준다.
              // 정렬 화살표는 시간순이 의미인 이력표라 붙이지 않는다(조건 3).
              <div className="overflow-x-auto">
                <table className="ui-table min-w-[640px] text-sm">
                  <thead>
                    <tr>
                      <th className="ui-th w-[136px]">요청일</th>
                      <th className="ui-th w-[128px]">기한</th>
                      <th className="ui-th w-[96px]">결정</th>
                      <th className="ui-th w-[128px]">결정일</th>
                      <th className="ui-th">발주처 코멘트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.approvals.map((a) => (
                      <tr key={a.id}>
                        <td className="text-ink-sub">{formatDateTime(a.requested_at)}</td>
                        <td className="text-ink-sub">{a.due_at ? formatDateTime(a.due_at) : '—'}</td>
                        <td>
                          {a.decision ? (
                            <LevelBadge
                              level={a.decision === 'approved' ? 'positive' : 'blocked'}
                              label={DECISION_LABELS[a.decision]}
                            />
                          ) : (
                            <LevelBadge level="neutral" label="대기중" />
                          )}
                        </td>
                        <td className="text-ink-sub">{a.decided_at ? formatDateTime(a.decided_at) : '—'}</td>
                        {/* 조건 2 — …처리된 값은 title로 전체를 확인할 수 있어야 한다 */}
                        <td className="text-ink-sub" title={a.client_comment ?? undefined}>
                          {a.client_comment ?? '—'}
                        </td>
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
              <div className="mt-1.5">{statusBadge}</div>
            </div>
            <div>
              <p className="t-caption">담당</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${
                    assigneeRole ? ROLE_BAR_CLASSES[assigneeRole] : 'bg-border-strong'
                  }`}
                />
                {memberName(d.assignee_id)}
              </p>
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
        <span>{category}</span>
        <span aria-hidden>›</span>
        <span className="text-ink-sub">S3</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="t-page-title">{title}</h1>
            {showMeta && statusBadge}
          </div>
          {showMeta && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-sub">
              <span>
                {AREA_LABELS[area]} · {category}
              </span>
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
                    마감 {formatDate(dueDate)}
                    <DdayBadge isoDate={dueDate} />
                  </span>
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
      최신본 다운로드
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

// ── 6단계 진행 레일 (3.17b 시안) ─────────────────────────────────────
// 가이드됨 → 초안 → 내부검토 → 컨펌대기 → 수정요청 → 확정.
// 완료 = accent 원 + 체크 / 현재 = 2px 아웃라인 / 되돌아온 지점(수정요청) = negative.
const RAIL_STATUSES: DeliverableStatus[] = [
  'requested',
  'draft',
  'internal_review',
  'pending_approval',
  'changes_requested',
  'final',
]

/** 레일에서 현재 위치(0-based). approved는 확정 직전 단계이므로 '확정' 칸을 현재로 본다. */
export function railIndexOf(status: DeliverableStatus): number {
  if (status === 'approved' || status === 'final') return 5
  return RAIL_STATUSES.indexOf(status)
}

export function railStepState(
  status: DeliverableStatus,
  index: number,
): 'done' | 'current' | 'future' {
  // '수정요청'은 지나온 단계로 치지 않는다 — 되돌아온 지금 그 자리에 있을 때만 표시한다.
  if (status === 'changes_requested') {
    return index < 4 ? 'done' : index === 4 ? 'current' : 'future'
  }
  if (index === 4) return 'future'
  const current = railIndexOf(status)
  if (status === 'final') return 'done'
  if (index === current) return 'current'
  return index < current ? 'done' : 'future'
}

function CheckGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="currentColor">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
    </svg>
  )
}

function ProgressRail({ status }: { status: DeliverableStatus }) {
  return (
    <div className="overflow-x-auto">
      <ol aria-label="진행 단계" className="flex min-w-[560px] items-start">
        {RAIL_STATUSES.map((s, i) => {
          const state = railStepState(status, i)
          const reverted = status === 'changes_requested' && i === 4
          const circle =
            state === 'done'
              ? 'bg-accent text-card'
              : state === 'current'
                ? `border-2 bg-card text-xs font-semibold ${
                    reverted ? 'border-negative text-negative' : 'border-accent text-accent-deep'
                  }`
                : 'border border-border bg-card text-[11px] font-semibold text-ink-cap'
          return (
            <Fragment key={s}>
              {i > 0 && (
                <li
                  aria-hidden
                  className={`mt-[13px] h-px flex-1 ${reverted ? 'bg-negative' : 'bg-border'}`}
                />
              )}
              <li
                data-step-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex w-[88px] shrink-0 flex-col items-center gap-1.5"
              >
                <span className={`flex size-[26px] items-center justify-center rounded-full ${circle}`}>
                  {state === 'done' ? <CheckGlyph /> : reverted ? '!' : i + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-[11px] ${
                    state === 'current'
                      ? reverted
                        ? 'font-semibold text-negative'
                        : 'font-semibold text-accent-deep'
                      : 'text-ink-cap'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </span>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}

/** 레일 아래 '다음 단계' 블록 — 할 일 하나 + (있으면) 버튼 하나 */
function NextStepBlock({
  action,
  description,
  button,
}: {
  action: string
  description: string
  button?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-canvas p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">다음 단계 — {action}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-sub">{description}</p>
      </div>
      {button}
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

// ── 상태 액션 바 ──────────────────────────────────────────────────────
function StatusActionBar({
  deliverableId,
  status,
  category,
  autoSnapshotDoc,
  sendViaHeader = false,
  showRail,
  requiresApproval,
  versions,
  isPm,
  canWriteArea,
  isHost,
  hasPartner,
  onChanged,
}: {
  deliverableId: string
  status: DeliverableStatus
  category: string
  /** v2.5 §23 — 발송 시 provider가 인쇄 스냅숏을 자동 버전 등록하는 정형 문서
   *  (큐시트, 그리고 빌더 데이터가 있는 시나리오·운영가이드 — R-O2 doc-snapshot) */
  autoSnapshotDoc: boolean
  /** 3.16.4 — 시나리오·운영가이드 빌더 문서는 컨펌 발송을 문서 헤더(StructuredDocHeader)가
   *  담당한다. true면 이 카드에서 발송 폼을 그리지 않는다(중복 노출 정리 — 반려·안내는 유지) */
  sendViaHeader?: boolean
  /** 3.17b — 6단계 진행 레일. 정형 문서는 상단 스트립 단일 표시를 유지하므로 그리지 않는다 */
  showRail: boolean
  requiresApproval: boolean
  versions: Version[]
  isPm: boolean
  canWriteArea: boolean
  /** v2.4 §10.1 — 주최형 행사면 발주처 컨펌 발송 UI를 숨긴다(DoD 31) */
  isHost: boolean
  /** partner_id가 있는 항목 — 파트너 보드에서 검토한다는 안내로 대체 */
  hasPartner: boolean
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

  const uploadButton =
    canWriteArea && !autoSnapshotDoc ? (
      <button type="button" onClick={focusVersionUpload} className="btn btn-primary shrink-0">
        새 버전 업로드
      </button>
    ) : undefined

  // 상태별 '다음 단계' — 할 일 하나 + 버튼 하나. 상태 전이는 전부 기존 경로(transitionStatus·
  // requestApproval)를 그대로 태운다. 여기 버튼은 업로드 폼으로 시선을 옮기거나(전이 없음)
  // 기존 전이 버튼을 그 자리에 놓을 뿐이다.
  let nextStep: ReactNode = null
  if (status === 'requested') {
    nextStep = (
      <NextStepBlock
        action={autoSnapshotDoc ? '문서 작성' : '첫 버전 업로드'}
        description="첫 버전을 업로드하면 자동으로 초안(draft) 상태로 전환됩니다."
        button={uploadButton}
      />
    )
  } else if (status === 'draft') {
    nextStep = canWriteArea ? (
      <NextStepBlock
        action="내부검토 요청"
        description="담당자 작업이 끝났으면 PM 검토로 넘깁니다."
        button={
          <button
            type="button"
            onClick={handleToReview}
            disabled={toReview.pending}
            className="btn btn-primary shrink-0"
          >
            내부검토 요청
          </button>
        }
      />
    ) : (
      <NextStepBlock action="담당자 작업" description="담당 역할이 초안을 다듬는 중입니다." />
    )
  } else if (status === 'internal_review') {
    nextStep = isPm ? (
      <NextStepBlock
        action={isHost || sendViaHeader || !requiresApproval ? '내부 검토' : '컨펌 발송'}
        description={
          isHost
            ? '주최형 행사입니다 — 발주처 컨펌 없이 내부에서 확정합니다.'
            : sendViaHeader
              ? '아래 문서 헤더에서 컨펌을 발송합니다.'
              : requiresApproval
                ? '아래에서 반려하거나, 버전과 기한을 정해 발주처에 컨펌을 발송합니다.'
                : '컨펌 루프를 쓰지 않는 공통 문서입니다 — 내부 확인으로 마무리합니다.'
        }
      />
    ) : (
      <NextStepBlock
        action="PM 검토 대기"
        description="내부검토 중입니다. PM의 반려 또는 컨펌 발송을 기다리세요."
      />
    )
  } else if (status === 'pending_approval') {
    nextStep = (
      <NextStepBlock
        action={hasPartner ? '파트너 제출 검토' : '발주처 컨펌 대기'}
        description={
          hasPartner ? '파트너 보드에서 제출물을 검토하세요.' : '발주처의 승인 또는 수정요청을 기다립니다.'
        }
        button={
          hasPartner ? (
            <Link to="/partners" className="btn btn-ghost shrink-0">
              파트너 보드에서 검토
            </Link>
          ) : undefined
        }
      />
    )
  } else if (status === 'changes_requested') {
    nextStep = (
      <NextStepBlock
        action={hasPartner ? '파트너 재제출 대기' : '수정본 업로드'}
        description={
          hasPartner
            ? '파트너가 재제출하면 검토 대기로 돌아옵니다.'
            : '수정본을 올리면 초안으로 돌아가고, 내부검토 → 컨펌 발송을 다시 태웁니다.'
        }
        button={hasPartner ? undefined : uploadButton}
      />
    )
  } else if (status === 'approved') {
    nextStep = (
      <NextStepBlock
        action="확정 전환"
        description={
          hasPartner ? '승인되었습니다 — 확정본으로 전환 중입니다.' : '발주처가 승인했습니다 — 확정본으로 전환 중입니다.'
        }
      />
    )
  } else {
    nextStep = <NextStepBlock action="없음" description="확정된 항목입니다. 후속 변경은 새 항목으로 진행하세요." />
  }

  const railIndex = railIndexOf(status)
  const railCaption =
    showRail && railIndex >= 0
      ? `6단계 중 ${railIndex + 1}단계${status === 'changes_requested' ? ' · 되돌아옴' : ''}`
      : null

  return (
    <Card
      title={status === 'internal_review' && isPm ? '상태 액션 (PM)' : '상태 액션'}
      action={railCaption ? <span className="t-caption">{railCaption}</span> : undefined}
    >
      <div className="space-y-4">
        {showRail && <ProgressRail status={status} />}
        {nextStep}

        {status === 'internal_review' && isPm && (
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
            ) : sendViaHeader ? (
              <p className="border-t border-border pt-4 text-xs text-ink-cap">
                컨펌 발송은 아래 문서 헤더의 [컨펌 발송] 버튼으로 진행합니다.
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
                        className="ui-input ui-select w-64"
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
        )}

        {status === 'draft' && canWriteArea && <ErrorAlert message={toReview.error} />}
      </div>
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
    <div id={UPLOAD_FORM_ID}>
      <Card title="버전 업로드">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 t-caption">
            파일
            <input id={UPLOAD_INPUT_ID} type="file" onChange={handleFileChange} className="ui-input" />
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
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-card ${
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

  const sharedCount = comments.filter((c) => c.visibility === 'shared').length

  return (
    <Card
      title="코멘트"
      action={
        comments.length > 0 ? (
          <span className="t-caption">{`내부 ${comments.length - sharedCount} · 공유 ${sharedCount}`}</span>
        ) : undefined
      }
    >
      {comments.length === 0 && <p className="text-sm text-ink-cap">코멘트가 없습니다.</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          // 3.17b 시안 — 공유(shared) 건만 좌측 3px steel 보더. 배지만으로는 스크롤 중 안 잡힌다.
          <li
            key={c.id}
            data-visibility={c.visibility}
            className={`rounded-md border border-border p-3 ${
              c.visibility === 'shared' ? 'border-l-[3px] border-l-steel' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">
                {c.author_token ? '발주처' : memberName(c.author_user_id)}
              </span>
              <span
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
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
          <label className="ui-check-row items-center text-xs text-ink-sub">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="ui-check"
            />
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
