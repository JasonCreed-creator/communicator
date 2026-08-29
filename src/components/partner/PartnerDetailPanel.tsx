// S-11 파트너 상세 — 접수 대장 상세 (시안 '파트너 보드.dc.html').
//
// 좌측 = 담당 정보(연락처 **마스킹**) · 우측 = 제출 항목 표(.ui-table).
// 표의 모든 행에 **수신 경로 · 접수자**가 남는다 — "누가 언제 받았나"의 증빙이다.
// 포털 제출분(version.uploaded_by === null)은 '포털'로 자동 확정되고, PM이 대리 접수한 건은
// 경로 저장 필드가 없어 '미기록'이 기본이다(PM 선택은 표시용 — partnerReceipt.ts 주석 참조).
//
// 상태 전이는 전부 기존 provider 경유다: 검토(reviewPartnerSubmission) · 접수 기록(uploadVersion,
// §5.1 host inbound 분기로 changes_requested→pending_approval). 첫 제출(requested)은 전이표상
// 파트너 제출(partner_submit) 경로만 있으므로 이 화면에서 만들지 않고 요청 메일로 안내한다.
// 계약액 등 금액은 어디에도 렌더하지 않는다(§21.2 R-H3).
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ErrorAlert from '../internal/ErrorAlert'
import TableSkeleton from '../internal/TableSkeleton'
import { LevelBadge } from '../internal/StatusBadge'
import { activityActorLabel } from '../internal/activityLabels'
import { useAsync, useMutation } from '../../hooks/useAsync'
import {
  DELIVERABLE_STATUS_LEVEL,
  HOST_STATUS_LABELS,
  ROLE_BAR_CLASSES,
  ROLE_LABELS,
  formatDate,
  formatDateTime,
} from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { Deliverable, UUID } from '../../types/entities'
import type { MemberRole } from '../../types/enums'
import type { DeliverableDetail, PartnerWithProgress } from '../../types/views'
import { partnerActivityLabel } from './partnerBoardUtils'
import type { HostTaskGroup } from './partnerBoardUtils'
import {
  RECEIPT_CHANNELS,
  RECEIPT_CHANNEL_LABELS,
  RECEIPT_NONE_LABEL,
  RECEIPT_UNRECORDED_LABEL,
  buildMailto,
  maskEmail,
  receiptOf,
  type ReceiptChannel,
} from './partnerReceipt'

const provider = getDataProvider()

function HostBadge({ status }: { status: Deliverable['status'] }) {
  // 컨펌 계열과 같은 의미 4단계를 쓰되 문구만 주최형 세트(§5.1) — '검토 필요'는 내 행동을
  // 기다리는 상태라 좌측 도트를 붙이는 유일한 배지다(§03).
  const isReview = status === 'pending_approval'
  return (
    <LevelBadge
      level={DELIVERABLE_STATUS_LEVEL[status]}
      label={isReview ? '검토 필요' : status === 'changes_requested' ? '재요청함' : HOST_STATUS_LABELS[status]}
      dot={isReview}
    />
  )
}

interface SubmissionRow {
  code: string
  title: string
  deliverable_id: UUID
  end_date: string | null
}

export default function PartnerDetailPanel({
  partner,
  groups,
  projectName,
  currentRole,
  onChanged,
}: {
  partner: PartnerWithProgress
  /** 마감 타임라인과 같은 그룹 데이터 — 이 파트너의 partner_submit 인스턴스만 추린다 */
  groups: HostTaskGroup[]
  projectName: string
  currentRole: MemberRole | null
  onChanged: () => void
}) {
  const rows: SubmissionRow[] = groups
    .filter((g) => g.direction === 'partner_submit')
    .map((g) => {
      const mine = g.instances.find((t) => t.partner_id === partner.id)
      return mine?.linked_deliverable_id
        ? { code: g.code, title: g.title, deliverable_id: mine.linked_deliverable_id, end_date: g.end_date }
        : null
    })
    .filter((r): r is SubmissionRow => r !== null)

  const rowKey = rows.map((r) => r.deliverable_id).join(',')
  const details = useAsync(
    () => Promise.all(rows.map((r) => provider.getDeliverable(r.deliverable_id))),
    [rowKey],
  )
  const members = useAsync(() => provider.listMembers(partner.project_id), [partner.project_id])

  const memberNameById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.user_id, m.profile.name])),
    [members.data],
  )
  const detailById = useMemo(
    () => new Map((details.data ?? []).map((d) => [d.id, d])),
    [details.data],
  )

  /** PM이 화면에서 고른 수신 경로 — **표시 전용**(저장 필드 없음, 새로고침 시 미기록으로 복귀) */
  const [channelById, setChannelById] = useState<Record<string, ReceiptChannel>>({})
  const [reviewingId, setReviewingId] = useState<UUID | null>(null)
  const [recordingId, setRecordingId] = useState<UUID | null>(null)

  // 파트너를 바꾸면 검토 대기(=내 행동을 기다리는) 항목을 자동으로 연다.
  useEffect(() => {
    const firstPending = (details.data ?? []).find((d) => d.status === 'pending_approval')
    setReviewingId(firstPending?.id ?? null)
    setRecordingId(null)
  }, [partner.id, details.data])

  const contact = partner.token
  const pmMember = (members.data ?? []).find((m) => m.role === 'pm') ?? (members.data ?? [])[0] ?? null

  const latestVersion = (details.data ?? [])
    .flatMap((d) => d.versions)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const latestReceipt = receiptOf(latestVersion, memberNameById)

  const requestMailto = contact
    ? buildMailto({
        to: contact.contact_email,
        subject: `[${projectName}] 제출 자료 요청 — ${partner.name}`,
        body: `${partner.name} ${contact.contact_name}님,\n\n아래 항목의 제출을 요청드립니다.\n\n${rows
          .filter((r) => detailById.get(r.deliverable_id)?.status === 'requested')
          .map((r) => `· ${r.code} ${r.title}${r.end_date ? ` (마감 ${formatDate(r.end_date)})` : ''}`)
          .join('\n')}\n\n감사합니다.`,
      })
    : null

  return (
    <div className="space-y-5">
      <ErrorAlert message={details.error} />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="w-full rounded-lg border border-border bg-canvas p-4 lg:w-[280px] lg:shrink-0">
          <p className="t-caption">담당</p>
          {contact ? (
            <>
              <p className="mt-1.5 text-sm text-ink">{contact.contact_name}</p>
              <p className="mt-0.5 text-xs text-ink-sub">{maskEmail(contact.contact_email)}</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-ink-cap">연락처 미등록 — 행사 설정 ② 파트너에서 추가</p>
          )}

          <p className="t-caption mt-4">내부 담당</p>
          {pmMember ? (
            <p className="mt-1.5 inline-flex items-center gap-2 text-sm text-ink">
              {/* 역할은 형태로만 — 8px 도트(§04). 역할에 pill 배지를 쓰지 않는다 */}
              <span aria-hidden className={`size-2 rounded-full ${ROLE_BAR_CLASSES[pmMember.role]}`} />
              {pmMember.profile.name} · {ROLE_LABELS[pmMember.role]}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-cap">담당자 미지정</p>
          )}

          <p className="t-caption mt-4">최근 수신</p>
          <p className="mt-1.5 text-xs text-ink-sub">
            {latestReceipt && latestReceipt.receivedAt
              ? `${formatDateTime(latestReceipt.receivedAt)} · ${
                  latestReceipt.derivedChannel
                    ? RECEIPT_CHANNEL_LABELS[latestReceipt.derivedChannel]
                    : RECEIPT_UNRECORDED_LABEL
                }${latestReceipt.receiverName ? ` · 접수자 ${latestReceipt.receiverName}` : ''}`
              : '아직 접수된 자료가 없습니다.'}
          </p>

          <p className="t-caption mt-4">요청 발송 이력</p>
          <p className="mt-1.5 text-xs text-ink-sub">
            {contact
              ? `제출 링크 발급 ${formatDate(contact.created_at.slice(0, 10))}`
              : '제출 링크 미발급'}
          </p>
          <p className="mt-1 text-[11px] text-ink-cap">
            요청 메일은 사용자의 메일 프로그램으로 열립니다 — 발송 이력은 앱에 저장되지 않습니다.
          </p>
          {requestMailto && (
            <a href={requestMailto} className="btn btn-ghost btn-sm mt-3 print-hidden">
              미접수 항목 요청 메일
            </a>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {details.loading && <TableSkeleton rows={4} columns={6} />}
          {!details.loading && rows.length === 0 && (
            <p className="text-sm text-ink-cap">전개된 제출 태스크가 없습니다.</p>
          )}
          {!details.loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="ui-table min-w-[720px] text-sm">
                <thead>
                  <tr>
                    <th className="ui-th w-[72px]">코드</th>
                    <th className="ui-th">제출 항목</th>
                    <th className="ui-th w-[96px]">마감</th>
                    <th className="ui-th w-[176px]">수신 경로 · 접수자</th>
                    <th className="ui-th w-[120px]">상태</th>
                    <th className="ui-th w-[148px] text-right">PM 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = detailById.get(r.deliverable_id)
                    const receipt = receiptOf(d?.versions[0], memberNameById)
                    const picked = channelById[r.deliverable_id]
                    return (
                      <tr key={r.deliverable_id} data-testid={`submission-row-${r.code}`}>
                        <td className="text-ink-cap">{r.code}</td>
                        <td title={r.title} className="text-ink">
                          {r.title}
                        </td>
                        <td className="text-ink-sub">{r.end_date ? formatDate(r.end_date) : '—'}</td>
                        <td>
                          {!receipt ? (
                            <span className="text-ink-cap">{RECEIPT_NONE_LABEL}</span>
                          ) : receipt.derivedChannel ? (
                            <span className="text-ink-sub">
                              {RECEIPT_CHANNEL_LABELS[receipt.derivedChannel]} · 자동 접수
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <select
                                aria-label={`${r.code} 수신 경로`}
                                value={picked ?? ''}
                                onChange={(e) =>
                                  setChannelById((cur) => ({
                                    ...cur,
                                    [r.deliverable_id]: e.target.value as ReceiptChannel,
                                  }))
                                }
                                className="ui-input ui-select h-7 min-h-0 py-0 text-xs"
                              >
                                <option value="">{RECEIPT_UNRECORDED_LABEL}</option>
                                {RECEIPT_CHANNELS.map((c) => (
                                  <option key={c} value={c}>
                                    {RECEIPT_CHANNEL_LABELS[c]}
                                  </option>
                                ))}
                              </select>
                              <span className="text-ink-sub">· {receipt.receiverName}</span>
                            </span>
                          )}
                        </td>
                        <td>{d ? <HostBadge status={d.status} /> : <span className="text-ink-cap">—</span>}</td>
                        <td className="text-right">
                          <RowAction
                            status={d?.status ?? null}
                            reviewing={reviewingId === r.deliverable_id}
                            recording={recordingId === r.deliverable_id}
                            onReview={() =>
                              setReviewingId((cur) => (cur === r.deliverable_id ? null : r.deliverable_id))
                            }
                            onRecord={() =>
                              setRecordingId((cur) => (cur === r.deliverable_id ? null : r.deliverable_id))
                            }
                            mailto={
                              contact
                                ? buildMailto({
                                    to: contact.contact_email,
                                    subject: `[${projectName}] ${r.code} ${r.title} 재요청 — ${partner.name}`,
                                    body: `${partner.name} ${contact.contact_name}님,\n\n${r.code} ${r.title} 자료를 다시 보내주시기 바랍니다.\n\n감사합니다.`,
                                  })
                                : null
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-ink-cap">
                첫 접수는 파트너가 제출 링크(포털)로 올린 것만 자동 기록됩니다 — 메일·메신저·유선으로
                받은 재제출분은 [접수 기록]으로 남기세요. 수신 경로 선택은 표시용이며 저장되지 않습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {recordingId && (
        <ReceiptRecordForm
          deliverableId={recordingId}
          channel={channelById[recordingId] ?? null}
          onChannel={(c) => setChannelById((cur) => ({ ...cur, [recordingId]: c }))}
          onDone={() => {
            setRecordingId(null)
            details.reload()
            onChanged()
          }}
          onCancel={() => setRecordingId(null)}
        />
      )}

      {reviewingId && (
        <ReviewPanel
          deliverableId={reviewingId}
          currentRole={currentRole}
          onReviewed={() => {
            details.reload()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

/** 상태별 PM 액션 — accent CTA는 '검토' 하나뿐이고, 열려 있는 동안에는 ghost로 낮춘다(§ 화면당 1개) */
function RowAction({
  status,
  reviewing,
  recording,
  onReview,
  onRecord,
  mailto,
}: {
  status: Deliverable['status'] | null
  reviewing: boolean
  recording: boolean
  onReview: () => void
  onRecord: () => void
  mailto: string | null
}) {
  if (status === 'pending_approval') {
    return (
      <button
        type="button"
        onClick={onReview}
        className={`btn btn-sm ${reviewing ? 'btn-ghost' : 'btn-accent'}`}
      >
        {reviewing ? '검토 중' : '검토'}
      </button>
    )
  }
  if (status === 'changes_requested') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={onRecord} className="btn btn-ghost btn-sm">
          {recording ? '닫기' : '접수 기록'}
        </button>
        {mailto && (
          <a href={mailto} className="btn btn-ghost btn-sm print-hidden">
            재요청 메일
          </a>
        )}
      </span>
    )
  }
  if (status === 'requested') {
    return mailto ? (
      <a href={mailto} className="btn btn-ghost btn-sm print-hidden">
        요청 메일
      </a>
    ) : (
      <span className="text-ink-cap">연락처 없음</span>
    )
  }
  return <span className="text-ink-cap">—</span>
}

/** 접수 기록 — 메일·메신저·유선으로 받은 파일을 PM이 대신 등록한다.
 *  provider.uploadVersion 경유(§5.1 host inbound 분기: changes_requested→pending_approval). */
function ReceiptRecordForm({
  deliverableId,
  channel,
  onChannel,
  onDone,
  onCancel,
}: {
  deliverableId: UUID
  channel: ReceiptChannel | null
  onChannel: (c: ReceiptChannel) => void
  onDone: () => void
  onCancel: () => void
}) {
  const [fileName, setFileName] = useState('')
  const [note, setNote] = useState('')
  const upload = useMutation((input: { file_name: string; note?: string }) =>
    provider.uploadVersion(deliverableId, input),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fileName.trim()) {
      upload.setError('접수한 파일명을 입력해주세요.')
      return
    }
    const result = await upload.run({
      file_name: fileName.trim(),
      note: note.trim() || undefined,
    })
    if (result) onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-canvas p-4">
      <p className="t-caption">접수 기록</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-cap">
          받은 파일명
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="예: 안전관리계획서.pdf"
            className="ui-input w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-cap">
          수신 경로
          <select
            value={channel ?? ''}
            onChange={(e) => onChannel(e.target.value as ReceiptChannel)}
            className="ui-input ui-select w-32"
          >
            <option value="">{RECEIPT_UNRECORDED_LABEL}</option>
            {RECEIPT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {RECEIPT_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-cap">
          메모
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 8/28 16:12 메일 수신"
            className="ui-input"
          />
        </label>
        <button type="submit" disabled={upload.pending} className="btn btn-ghost btn-sm">
          기록
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          취소
        </button>
      </div>
      <ErrorAlert message={upload.error} />
    </form>
  )
}

function ReviewPanel({
  deliverableId,
  currentRole,
  onReviewed,
}: {
  deliverableId: UUID
  currentRole: MemberRole | null
  onReviewed: () => void
}) {
  const detail = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const activity = useAsync(
    () => provider.listActivity(detail.data?.project_id ?? '', 40),
    [detail.data?.project_id],
  )
  const [comment, setComment] = useState('')
  const review = useMutation((decision: 'approved' | 'changes_requested', body?: string) =>
    provider.reviewPartnerSubmission(deliverableId, { decision, comment: body }),
  )
  const latestId = detail.data?.versions[0]?.id
  // 훅은 조건부 return보다 먼저 호출해야 하므로(Rules of Hooks) 로딩·에러 분기 위에 둔다.
  const preview = useAsync(
    () => (latestId ? provider.getFileUrl(latestId) : Promise.resolve(null)),
    [latestId],
  )

  if (detail.loading) return <p className="text-sm text-ink-cap">불러오는 중…</p>
  if (detail.error || !detail.data) return <ErrorAlert message={detail.error ?? '항목을 찾을 수 없습니다.'} />

  const d: DeliverableDetail = detail.data
  const canReview = !!currentRole && (currentRole === 'pm' || currentRole === d.area)
  const latest = d.versions[0]

  const handleApprove = async () => {
    const result = await review.run('approved')
    if (result) {
      detail.reload()
      onReviewed()
    }
  }

  const handleRequestChanges = async (e: FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) {
      review.setError('수정요청은 코멘트가 필수입니다.')
      return
    }
    const result = await review.run('changes_requested', comment)
    if (result) {
      setComment('')
      detail.reload()
      onReviewed()
    }
  }

  const relatedActivity = (activity.data ?? []).filter(
    (e) => e.target_type === 'deliverable' && e.target_id === deliverableId,
  )

  return (
    <div className="space-y-4 rounded-lg border border-border bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-caption">검토 — {d.title}</p>
        <HostBadge status={d.status} />
      </div>

      {latest ? (
        <div className="flex flex-wrap items-start gap-3">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-track">
            {preview.data ? (
              <img
                src={preview.data}
                alt={latest.file_name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-ink-cap">
                {latest.file_name}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{latest.file_name}</p>
            <p className="mt-0.5 text-xs text-ink-cap">
              v{latest.version_no} · {formatDateTime(latest.created_at)}
            </p>
            {d.content && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-sub">{d.content}</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-cap">아직 접수된 자료가 없습니다.</p>
      )}

      <div>
        <p className="t-caption">코멘트</p>
        {d.comments.length === 0 && <p className="mt-1 text-sm text-ink-cap">코멘트가 없습니다.</p>}
        <ul className="mt-1 space-y-2">
          {d.comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-card p-2.5 text-sm">
              <div className="flex items-center gap-2 text-xs text-ink-cap">
                <span className="font-medium text-ink">{c.author_token ? '파트너' : '내부'}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    c.visibility === 'shared' ? 'bg-steel-tint text-steel' : 'bg-track text-ink-sub'
                  }`}
                >
                  {c.visibility === 'shared' ? '공유' : '내부'}
                </span>
                <span>{formatDateTime(c.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink-sub">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>

      {canReview && d.status === 'pending_approval' && (
        <div className="space-y-3 border-t border-border pt-3">
          <button type="button" onClick={handleApprove} disabled={review.pending} className="btn btn-accent">
            승인
          </button>
          <form onSubmit={handleRequestChanges} className="space-y-2 border-t border-border pt-3">
            <p className="t-caption">재요청 (코멘트 필수)</p>
            <div className="flex flex-wrap gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="다시 보내주셔야 하는 내용을 남겨주세요 — 파트너에게 그대로 전달됩니다."
                className="ui-input min-w-64 flex-1"
              />
              <button type="submit" disabled={review.pending} className="btn btn-ghost self-start">
                수정요청
              </button>
            </div>
          </form>
          <ErrorAlert message={review.error} />
        </div>
      )}
      {!canReview && d.status === 'pending_approval' && (
        <p className="text-xs text-ink-cap">
          이 영역의 검토 권한이 없습니다 — pm 또는 담당 영역만 검토할 수 있습니다.
        </p>
      )}
      {d.status === 'requested' && <p className="text-xs text-ink-cap">아직 접수되지 않았습니다.</p>}
      {(d.status === 'approved' || d.status === 'final') && (
        <p className="text-xs text-positive">승인되었습니다.</p>
      )}
      {d.status === 'changes_requested' && (
        <p className="text-xs text-negative">재요청 상태입니다 — 파트너의 재제출을 기다리는 중입니다.</p>
      )}

      <div className="border-t border-border pt-3">
        <p className="t-caption">활동 이력</p>
        {relatedActivity.length === 0 && <p className="mt-1 text-sm text-ink-cap">활동 내역이 없습니다.</p>}
        <ul className="divide-y divide-border">
          {relatedActivity.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="text-ink-sub">
                <span className="text-ink-cap">{activityActorLabel(e.actor)} · </span>
                {partnerActivityLabel(e.action)}
              </span>
              <span className="shrink-0 text-ink-cap">{formatDateTime(e.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link to={`/items/${deliverableId}`} className="text-xs text-steel hover:underline">
        항목 상세(S3)에서 전체 이력 보기 →
      </Link>
    </div>
  )
}
