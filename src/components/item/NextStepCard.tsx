// 항목 상세 '다음 단계' 카드 — 디자인지시서 v1.4 §7-2.7 (Phase 3.23 PR-4 · 캔버스 항목 상세).
// 3.17b의 '상태 액션' 카드(6단계 레일 + 다음 단계 블록 + PM 폼)를 한 장으로 다시 짰다:
//   ① 5단계 레일(가이드 → 초안 → 내부검토 → 발주처 컨펌 → 확정 — 수정요청은 '발주처 컨펌' 칸이 되돌아온 표시)
//   ② 지금 상태를 한 문장 제목 + 설명 + 버튼(채운 버튼은 화면에 1개 — 머리의 '새 버전 업로드'는 이 카드로 옮겼다)
//   ③ PM 폼(반려·컨펌 발송)은 내부검토일 때 카드 아래칸에 그대로
// 상태 전이는 전부 기존 경로(transitionStatus·requestApproval)만 탄다. 업로드 버튼은 업로드 카드로 시선을 옮길 뿐이다.
import { Fragment, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ClientLinkWarning, { EmailPendingNote } from '../internal/ClientLinkWarning'
import ErrorAlert from '../internal/ErrorAlert'
import { ClientLinkButton, type ClientLinkTarget } from '../board/DesignNextAction'
import { useMutation } from '../../hooks/useAsync'
import { STATUS_STRIP_CLASSES, daysUntil, formatDate, objectParticle, waitingDays } from '../../lib/labels'
import { uploadLock } from '../../lib/uploadGate'
import { getDataProvider } from '../../providers'
import type { DeliverableStatus } from '../../types/enums'
import type { DeliverableDetail } from '../../types/views'

const provider = getDataProvider()

// ── 5단계 레일 ─────────────────────────────────────────────────────────
/** 레일 칸 이름 — 파트너 항목은 첫 칸이 '제출 요청', 주최형·파트너는 넷째 칸이 '검토'(발주처가 없다) */
export function railLabels(opts: { hasPartner: boolean; isHost: boolean }): string[] {
  return [
    opts.hasPartner ? '제출 요청' : '가이드',
    '초안',
    '내부검토',
    opts.hasPartner || opts.isHost ? '검토' : '발주처 컨펌',
    '확정',
  ]
}

export const RAIL_STEP_COUNT = 5

/** 레일에서 지금 자리(0-based). 수정요청은 '발주처 컨펌' 칸으로 되돌아온 것, 승인은 확정으로 넘어가는 중 */
export function railIndexOf(status: DeliverableStatus): number {
  switch (status) {
    case 'requested':
      return 0
    case 'draft':
      return 1
    case 'internal_review':
      return 2
    case 'pending_approval':
    case 'changes_requested':
      return 3
    case 'approved':
    case 'final':
      return 4
  }
}

export function railStepState(status: DeliverableStatus, index: number): 'done' | 'current' | 'future' {
  if (status === 'final') return 'done'
  const current = railIndexOf(status)
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

export function ProgressRail({ status, labels }: { status: DeliverableStatus; labels: string[] }) {
  const reverted = status === 'changes_requested'
  return (
    <div className="overflow-x-auto">
      <ol aria-label="진행 단계" className="flex min-w-[520px] max-w-[720px] items-center">
        {labels.map((label, i) => {
          const state = railStepState(status, i)
          const back = reverted && i === 3
          const circle =
            state === 'done'
              ? 'bg-accent text-card'
              : state === 'current'
                ? `border-2 ${back ? 'border-negative bg-negative-tint text-negative' : 'border-accent bg-accent-tint text-accent-deep'} text-xs font-semibold`
                : 'border border-border-strong bg-card text-xs font-semibold text-ink-cap'
          return (
            <Fragment key={label}>
              {i > 0 && (
                <li aria-hidden className={`mx-2.5 h-px min-w-4 flex-1 ${back ? 'bg-negative' : 'bg-border'}`} />
              )}
              <li
                data-step-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex shrink-0 items-center gap-2"
              >
                <span className={`flex size-[22px] items-center justify-center rounded-full ${circle}`}>
                  {state === 'done' ? <CheckGlyph /> : back ? '!' : i + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-[13px] ${
                    state === 'current' ? (back ? 'font-semibold text-negative' : 'font-semibold text-ink') : state === 'done' ? 'text-ink-sub' : 'text-ink-cap'
                  }`}
                >
                  {back ? '수정요청' : label}
                </span>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}

// ── 카드 ───────────────────────────────────────────────────────────────
export default function NextStepCard({
  deliverable: d,
  isPm,
  canWriteArea,
  isHost,
  autoSnapshotDoc,
  sendViaHeader = false,
  showRail,
  clientLink,
  inlineSend = false,
  onUpload,
  onChanged,
}: {
  deliverable: DeliverableDetail
  isPm: boolean
  canWriteArea: boolean
  /** v2.4 §10.1 — 주최형 행사면 발주처 컨펌 발송 UI를 숨긴다(DoD 31) */
  isHost: boolean
  /** v2.5 §23 — 발송 시 provider가 인쇄 스냅숏을 자동 버전 등록하는 정형 문서(큐시트·빌더 문서) */
  autoSnapshotDoc: boolean
  /** 3.16.4 — 시나리오·운영가이드 빌더 문서는 컨펌 발송을 문서 헤더가 맡는다 */
  sendViaHeader?: boolean
  /** 정형 문서는 레일을 그리지 않는다(상단 스트립 단일 표시 — 3.16.3/3.16.4) */
  showRail: boolean
  /** 컨펌대기일 때 발주처 링크 재전달(대행형 PM) — 없으면 버튼 없음 */
  clientLink: ClientLinkTarget | null
  /** 큐시트(§7-2.8) — PM 컨펌 발송을 카드 한 줄 안에(답 기한 · 반려… · 컨펌 발송). 버전은 표 스냅숏이 자동으로 된다 */
  inlineSend?: boolean
  /** 업로드 카드로 시선 옮기기(전이 없음) */
  onUpload: () => void
  onChanged: () => void
}) {
  const status = d.status
  const hasPartner = d.partner_id !== null
  const lock = uploadLock(status, { hasPartner })
  const canUpload = canWriteArea && !autoSnapshotDoc && !lock
  const latest = d.versions[0] ?? null
  let openApproval: DeliverableDetail['approvals'][number] | null = null
  for (const a of d.approvals) if (a.decided_at === null) openApproval = a

  const toReview = useMutation(() => provider.transitionStatus(d.id, 'internal_review'))
  const handleToReview = async () => {
    const result = await toReview.run()
    if (result) onChanged()
  }

  const uploadBtn = (label: string, filled: boolean) =>
    canUpload ? (
      <button type="button" onClick={onUpload} className={filled ? 'btn btn-accent' : 'btn btn-ghost'}>
        {label}
      </button>
    ) : null

  let title: string
  let description: ReactNode
  let actions: ReactNode = null
  switch (status) {
    case 'requested':
      if (hasPartner) {
        title = '파트너 제출을 기다리는 중'
        description = '파트너가 제출 링크로 첫 버전을 올리면 검토로 넘어옵니다.'
        actions = (
          <Link to={`/partners?partner=${d.partner_id ?? ''}`} className="btn btn-ghost">
            파트너 보드
          </Link>
        )
      } else {
        title = autoSnapshotDoc ? '문서를 작성할 차례' : '첫 시안을 올릴 차례'
        description = autoSnapshotDoc
          ? '문서를 채우고 내부검토를 요청하세요.'
          : canWriteArea
            ? '첫 시안을 올리면 초안으로 바뀝니다.'
            : '담당자가 첫 시안을 올리면 초안으로 바뀝니다.'
        actions = uploadBtn('첫 시안 올리기', true)
      }
      break
    case 'draft':
      if (!canWriteArea) {
        title = '담당자가 작업 중'
        description = '담당 역할이 초안을 다듬는 중입니다.'
      } else if (!latest && !autoSnapshotDoc) {
        title = '시안을 올릴 차례'
        description = '시안을 올린 뒤 내부검토를 요청하세요.'
        actions = uploadBtn('시안 올리기', true)
      } else {
        title = 'PM 검토로 넘길 차례'
        description = autoSnapshotDoc
          ? '작성이 끝났으면 내부검토를 요청하세요.'
          : '작업이 끝났으면 내부검토를 요청하세요. 고칠 게 있으면 새 버전을 먼저 올립니다.'
        actions = (
          <>
            {uploadBtn('새 버전 올리기', false)}
            <button type="button" onClick={handleToReview} disabled={toReview.pending} className="btn btn-accent">
              내부검토 요청
            </button>
          </>
        )
      }
      break
    case 'internal_review':
      if (!isPm) {
        title = 'PM 검토를 기다리는 중'
        description = 'PM이 반려하거나 발주처에 컨펌을 보냅니다.'
      } else if (isHost || hasPartner) {
        title = '내부에서 검토하는 중'
        description = '주최형 행사입니다 — 발주처 컨펌 없이 내부에서 확정합니다.'
      } else if (sendViaHeader) {
        title = '검토하고 컨펌을 보낼 차례'
        description = '아래 문서 머리의 [컨펌 발송]으로 보냅니다.'
      } else if (!d.requires_approval) {
        title = '내부 확인으로 마무리'
        description = '컨펌 루프를 쓰지 않는 공통 문서입니다 — 내부 확인으로 마무리합니다.'
      } else if (inlineSend) {
        title = '검토하고 발주처로 보낼 차례'
        description = `보내면 지금 표가 PDF로 저장돼 v${(latest?.version_no ?? 0) + 1}${objectParticle((latest?.version_no ?? 0) + 1) === '을' ? '이' : '가'} 됩니다.`
        actions = <InlineSendForm deliverableId={d.id} onChanged={onChanged} />
      } else {
        title = '검토하고 발주처로 보낼 차례'
        description = '반려하거나, 보낼 버전과 답 기한을 정해 컨펌을 발송하세요.'
      }
      break
    case 'pending_approval':
      if (hasPartner) {
        title = '파트너 제출물을 검토할 차례'
        description = '파트너 보드에서 승인하거나 수정을 요청하세요.'
        actions = (
          <Link to={`/partners?partner=${d.partner_id ?? ''}`} className="btn btn-ghost">
            파트너 보드에서 검토
          </Link>
        )
      } else {
        title = '발주처 답을 기다리는 중'
        description = sentLine(openApproval, d.versions)
        actions = isPm && !isHost ? <ClientLinkButton target={clientLink} label="발주처 링크" copyLabel="발주처 링크 복사" small={false} /> : null
      }
      break
    case 'changes_requested':
      if (hasPartner) {
        title = '파트너 재제출을 기다리는 중'
        description = '파트너가 다시 제출하면 검토로 돌아옵니다.'
      } else {
        title = '수정본을 올릴 차례'
        description = '수정본을 올리면 초안으로 돌아가고, 내부검토 → 컨펌 발송을 다시 거칩니다.'
        actions = uploadBtn('수정본 올리기', true)
      }
      break
    case 'approved':
      title = '확정본으로 정리 중'
      description = hasPartner ? '승인되었습니다 — 확정본으로 전환 중입니다.' : '발주처가 승인했습니다 — 확정본으로 전환 중입니다.'
      break
    case 'final':
      title = '확정됨'
      description = '끝난 항목입니다. 바꿔야 하면 새 항목을 만들어 진행하세요.'
      break
  }

  const index = railIndexOf(status)
  const caption = showRail
    ? `${RAIL_STEP_COUNT}단계 중 ${index + 1}단계${status === 'changes_requested' ? ' · 되돌아옴' : ''}`
    : null

  return (
    <section data-testid="next-step-card" aria-label="다음 단계" className="ui-card relative overflow-hidden">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STRIP_CLASSES[status]}`} />
      <div className="space-y-4 py-4 pl-[22px] pr-5">
        {showRail && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <ProgressRail status={status} labels={railLabels({ hasPartner, isHost })} />
            {caption && <span className="t-caption">{caption}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="min-w-0 space-y-1">
            <h2 className="t-card-title">{title}</h2>
            <p className="text-sm leading-relaxed text-ink-sub">{description}</p>
            {canWriteArea && lock && !autoSnapshotDoc && (
              <p data-testid="upload-locked" className="t-caption">
                지금은 새 버전을 올릴 수 없습니다 — {lock.label} · {lock.reason}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {status === 'draft' && canWriteArea && <ErrorAlert message={toReview.error} />}

        {status === 'internal_review' && isPm && inlineSend && !isHost && !hasPartner && d.requires_approval && (
          // Phase 6 계약 — 이메일이 아직 가지 않는다는 사실은 발송 칸 곁에(게이트 뒤에 숨기지 않는다) + 링크 0개 경고
          <div className="space-y-2">
            <EmailPendingNote />
            <ClientLinkWarning />
          </div>
        )}
        {status === 'internal_review' && isPm && !(inlineSend && !isHost && !hasPartner && d.requires_approval) && (
          <PmReviewForms
            deliverable={d}
            isHost={isHost}
            hasPartner={hasPartner}
            autoSnapshotDoc={autoSnapshotDoc}
            sendViaHeader={sendViaHeader}
            onChanged={onChanged}
          />
        )}
      </div>
    </section>
  )
}

/** 컨펌대기 설명 — 'v2를 8월 17일에 보냈고 39일째 답이 없습니다 (기한 8월 21일 — 35일 지남).' 올릴 수 없는 이유는 아래 잠금 줄이 말한다 */
function sentLine(open: DeliverableDetail['approvals'][number] | null, versions: DeliverableDetail['versions']): string {
  if (!open) return '발주처의 승인 또는 수정요청을 기다립니다.'
  const v = versions.find((x) => x.id === open.version_id)
  const what = v ? `v${v.version_no}${objectParticle(v.version_no)} ` : ''
  const days = waitingDays(open.requested_at)
  const sent = days === 0 ? `${what}오늘 보냈습니다` : `${what}${formatDate(open.requested_at.slice(0, 10))}에 보냈고 ${days}일째 답이 없습니다`
  let due = ''
  if (open.due_at) {
    const left = daysUntil(open.due_at.slice(0, 10))
    due = left < 0 ? ` (기한 ${formatDate(open.due_at.slice(0, 10))} — ${-left}일 지남)` : ` (기한 ${formatDate(open.due_at.slice(0, 10))})`
  }
  return `${sent}${due}.`
}

// ── 큐시트 한 줄 발송 — 답 기한 · 반려… · 컨펌 발송 (§7-2.8 · 캔버스 큐시트) ──────────────
function InlineSendForm({ deliverableId, onChanged }: { deliverableId: string; onChanged: () => void }) {
  const [dueAt, setDueAt] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  // 정형 문서는 provider가 version_id를 무시하고 표 스냅숏(.pdf)을 자동 버전으로 등록한다 — 관례상 'auto'
  const send = useMutation(() =>
    provider.requestApproval(deliverableId, { version_id: 'auto', due_at: dueAt ? new Date(dueAt).toISOString() : undefined }),
  )
  const reject = useMutation((comment: string) => provider.transitionStatus(deliverableId, 'draft', { comment }))

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    if (await send.run()) onChanged()
  }
  const handleReject = async (e: FormEvent) => {
    e.preventDefault()
    if (!rejectComment.trim()) return
    if (await reject.run(rejectComment)) {
      setRejectComment('')
      setRejecting(false)
      onChanged()
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <form onSubmit={handleSend} className="flex flex-wrap items-end justify-end gap-2">
        <label className="flex flex-col gap-1 t-caption">
          답 기한
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="ui-input w-[200px]" />
        </label>
        <button type="button" onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting} className="btn btn-ghost">
          반려…
        </button>
        <button type="submit" disabled={send.pending} className="btn btn-accent">
          컨펌 발송
        </button>
      </form>
      {rejecting && (
        <form onSubmit={handleReject} className="flex w-full flex-wrap justify-end gap-2">
          <input
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder="반려 사유 (초안으로 돌려보냅니다)"
            aria-label="반려 사유"
            className="ui-input min-w-64 flex-1"
          />
          <button type="submit" disabled={reject.pending} className="btn btn-ghost">
            반려
          </button>
        </form>
      )}
      <ErrorAlert message={send.error ?? reject.error} />
    </div>
  )
}

// ── PM 폼 — 반려 · 컨펌 발송 (3.17b 상태 액션 카드에서 그대로 옮겼다) ─────────────
function PmReviewForms({
  deliverable: d,
  isHost,
  hasPartner,
  autoSnapshotDoc,
  sendViaHeader,
  onChanged,
}: {
  deliverable: DeliverableDetail
  isHost: boolean
  hasPartner: boolean
  autoSnapshotDoc: boolean
  sendViaHeader: boolean
  onChanged: () => void
}) {
  const isCuesheet = d.category === '큐시트'
  const [rejectComment, setRejectComment] = useState('')
  const reject = useMutation((comment: string) => provider.transitionStatus(d.id, 'draft', { comment }))
  const [versionId, setVersionId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const requestApproval = useMutation(() =>
    provider.requestApproval(d.id, {
      // 정형 문서는 DataProvider가 version_id를 무시하고 createDocSnapshot으로 대체한다.
      // 동결된 RequestApprovalInput이 version_id를 필수로 요구해 관례상 리터럴 'auto'를 보낸다
      // (§8 doc-snapshot 전처리 — MockProvider.requestApproval 참조).
      version_id: autoSnapshotDoc ? 'auto' : versionId,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
    }),
  )

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

  return (
    <div className="space-y-5 border-t border-border pt-4">
      {isHost ? (
        <p className="text-xs text-ink-cap">
          주최형 행사는 이 화면에서 발주처 컨펌을 발송하지 않습니다
          {hasPartner ? ' — 파트너 제출 항목은 파트너 보드에서 검토하세요.' : '.'}
        </p>
      ) : sendViaHeader ? (
        <p className="text-xs text-ink-cap">컨펌 발송은 아래 문서 헤더의 [컨펌 발송] 버튼으로 진행합니다.</p>
      ) : d.requires_approval ? (
        <form onSubmit={handleRequestApproval} className="space-y-2">
          <p className="t-caption">컨펌 발송</p>
          {/* Phase 4.3.1 — 발주처 링크 0개면 보내도 열어볼 사람이 없다(발송은 막지 않는다) */}
          <ClientLinkWarning />
          <EmailPendingNote />
          <div className="flex flex-wrap items-end gap-2">
            {isCuesheet ? (
              <p className="max-w-xs text-xs text-ink-sub">발송 시 표의 스냅숏(.pdf)이 자동 버전으로 등록됩니다.</p>
            ) : autoSnapshotDoc ? (
              <p className="max-w-xs text-xs text-ink-sub">발송 시 인쇄 스냅숏(.pdf)이 자동 버전으로 등록됩니다.</p>
            ) : (
              <label className="flex flex-col gap-1 t-caption">
                버전
                <select value={versionId} onChange={(e) => setVersionId(e.target.value)} className="ui-input ui-select w-64">
                  <option value="">버전 선택…</option>
                  {d.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_no} — {v.file_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 t-caption">
              답 기한
              <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="ui-input" />
            </label>
            <button type="submit" disabled={requestApproval.pending} className="btn btn-accent">
              컨펌 발송
            </button>
          </div>
          <ErrorAlert message={requestApproval.error} />
        </form>
      ) : (
        <p className="text-sm text-ink-cap">이 항목은 컨펌 루프를 사용하지 않습니다(공통 문서).</p>
      )}

      <form onSubmit={handleReject} className="space-y-2">
        <p className="t-caption">반려 (사유 필수 — 초안으로 돌려보냅니다)</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder="반려 사유"
            aria-label="반려 사유"
            className="ui-input min-w-64 flex-1"
          />
          <button type="submit" disabled={reject.pending} className="btn btn-ghost">
            반려
          </button>
        </div>
        <ErrorAlert message={reject.error} />
      </form>
    </div>
  )
}
