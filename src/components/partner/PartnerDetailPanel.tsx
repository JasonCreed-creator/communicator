// S-11 파트너 상세 패널 (§10.1) — 제출물 목록 + 검토 패널(S3 상세 화면의 버전 미리보기·코멘트
// 패턴을 이 화면 전용으로 재구성) + 검토 액션(승인/수정요청) + 간단 활동 이력.
// 계약액 등 금액은 어디에도 렌더하지 않는다(§21.2 R-H3).
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Card from '../internal/Card'
import DdayBadge from '../internal/DdayBadge'
import ErrorAlert from '../internal/ErrorAlert'
import { activityActorLabel } from '../internal/activityLabels'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { HOST_STATUS_LABELS, STATUS_BADGE_CLASSES, formatDate, formatDateTime } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { Deliverable } from '../../types/entities'
import type { MemberRole } from '../../types/enums'
import type { PartnerWithProgress } from '../../types/views'
import { partnerActivityLabel } from './partnerBoardUtils'
import type { HostTaskGroup } from './partnerBoardUtils'

const provider = getDataProvider()

function HostBadge({ status }: { status: Deliverable['status'] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {HOST_STATUS_LABELS[status]}
    </span>
  )
}

interface SubmissionRow {
  code: string
  title: string
  deliverable_id: string
  end_date: string | null
}

export default function PartnerDetailPanel({
  partner,
  groups,
  currentRole,
  onChanged,
}: {
  partner: PartnerWithProgress
  /** 마감 타임라인과 같은 그룹 데이터 — 이 파트너의 partner_submit 인스턴스만 추린다 */
  groups: HostTaskGroup[]
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

  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.deliverable_id ?? null)

  useEffect(() => {
    // 파트너 전환 시 선택을 초기화(검토 대기 항목이 있으면 그것을 우선 연다)
    setSelectedId(rows[0]?.deliverable_id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.id])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-1">
        <p className="t-caption mb-1">제출물 ({rows.length})</p>
        {rows.length === 0 && <p className="text-xs text-ink-cap">전개된 제출 태스크가 없습니다.</p>}
        <ul className="space-y-1">
          {rows.map((r) => (
            <SubmissionListItem
              key={r.deliverable_id}
              row={r}
              active={r.deliverable_id === selectedId}
              onClick={() => setSelectedId(r.deliverable_id)}
            />
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        {selectedId ? (
          <ReviewPanel
            deliverableId={selectedId}
            currentRole={currentRole}
            onReviewed={onChanged}
          />
        ) : (
          <p className="text-sm text-ink-cap">제출물을 선택하면 검토 패널이 열립니다.</p>
        )}
      </div>
    </div>
  )
}

function SubmissionListItem({
  row,
  active,
  onClick,
}: {
  row: SubmissionRow
  active: boolean
  onClick: () => void
}) {
  const detail = useAsync(() => provider.getDeliverable(row.deliverable_id), [row.deliverable_id])
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left text-xs ${
          active ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:bg-track'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-ink-cap">{row.code}</span>
          {detail.data && <HostBadge status={detail.data.status} />}
        </span>
        <span className="truncate text-ink" title={row.title}>
          {row.title}
        </span>
        {row.end_date && (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-cap">
            {formatDate(row.end_date)}
            <DdayBadge isoDate={row.end_date} />
          </span>
        )}
      </button>
    </li>
  )
}

function ReviewPanel({
  deliverableId,
  currentRole,
  onReviewed,
}: {
  deliverableId: string
  currentRole: MemberRole | null
  onReviewed: () => void
}) {
  const detail = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const activity = useAsync(() => provider.listActivity(detail.data?.project_id ?? '', 40), [detail.data?.project_id])
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

  const d = detail.data
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
    <div className="space-y-4">
      <Card
        title="제출 내용"
        action={<HostBadge status={d.status} />}
      >
        <div className="space-y-3">
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
                <p className="mt-0.5 text-xs text-ink-cap">v{latest.version_no} · {formatDateTime(latest.created_at)}</p>
                {d.content && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-sub">{d.content}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-cap">아직 제출된 내용이 없습니다.</p>
          )}
        </div>
      </Card>

      <Card title="코멘트">
        {d.comments.length === 0 && <p className="text-sm text-ink-cap">코멘트가 없습니다.</p>}
        <ul className="space-y-2">
          {d.comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border p-2.5 text-sm">
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
      </Card>

      {canReview && d.status === 'pending_approval' && (
        <Card title="검토">
          <div className="space-y-3">
            <button type="button" onClick={handleApprove} disabled={review.pending} className="btn btn-accent">
              승인
            </button>
            <form onSubmit={handleRequestChanges} className="space-y-2 border-t border-border pt-3">
              <p className="t-caption">수정요청 (코멘트 필수)</p>
              <div className="flex flex-wrap gap-2">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="수정이 필요한 내용을 남겨주세요 — 파트너에게 그대로 전달됩니다."
                  className="ui-input min-w-64 flex-1"
                />
                <button type="submit" disabled={review.pending} className="btn btn-ghost self-start">
                  수정요청
                </button>
              </div>
            </form>
            <ErrorAlert message={review.error} />
          </div>
        </Card>
      )}
      {!canReview && d.status === 'pending_approval' && (
        <p className="text-xs text-ink-cap">이 영역의 검토 권한이 없습니다 — pm 또는 담당 영역만 검토할 수 있습니다.</p>
      )}
      {d.status === 'requested' && <p className="text-xs text-ink-cap">아직 파트너가 제출하지 않았습니다.</p>}
      {(d.status === 'approved' || d.status === 'final') && (
        <p className="text-xs text-positive">승인되었습니다.</p>
      )}
      {d.status === 'changes_requested' && (
        <p className="text-xs text-negative">수정요청 상태입니다 — 파트너의 재제출을 기다리는 중입니다.</p>
      )}

      <Card title="활동 이력">
        {relatedActivity.length === 0 && <p className="text-sm text-ink-cap">활동 내역이 없습니다.</p>}
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
      </Card>

      <Link to={`/items/${deliverableId}`} className="text-xs text-steel hover:underline">
        항목 상세(S3)에서 전체 이력 보기 →
      </Link>
    </div>
  )
}
