// S7 컨펌 대기 카드 — 미리보기·shared 코멘트·승인/수정요청 액션.
// internal 코멘트는 애초에 provider가 shared_comments에 담아 보내지 않으므로 이 컴포넌트는 절대 렌더하지 않는다(§6.2).
import { useState } from 'react'
import { AREA_LABELS, formatDate, formatDateTime } from '../../lib/labels'
import { isProviderError } from '../../lib/errors'
import type { ClientQueueItem } from '../../types'
import DdayBadge from './DdayBadge'
import ErrorAlert from '../internal/ErrorAlert'

interface QueueItemCardProps {
  item: ClientQueueItem
  onApprove: (approvalId: string) => Promise<void>
  onRequestChanges: (approvalId: string, comment: string) => Promise<void>
}

type Mode = 'idle' | 'confirm-approve' | 'request-changes'

// 디자인지시서 v1 §6: [승인]=accent 대형(h-11), [수정요청]=ghost(h-11) — 인라인 확인/제출 버튼도 동일 규격 유지.
const ACCENT_BTN = 'btn btn-accent h-11 flex-1'
const GHOST_BTN = 'btn btn-ghost h-11 flex-1'

export default function QueueItemCard({ item, onApprove, onRequestChanges }: QueueItemCardProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const reset = () => {
    setMode('idle')
    setComment('')
    setLocalError(null)
  }

  const runApprove = async () => {
    setSubmitting(true)
    setLocalError(null)
    try {
      await onApprove(item.approval_id)
      // 성공하면 부모가 큐를 다시 불러와 이 카드는 목록에서 사라진다.
    } catch (e) {
      setLocalError(isProviderError(e) ? e.message : '처리 중 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  const runRequestChanges = async () => {
    if (!comment.trim()) {
      setLocalError('수정 요청 내용을 입력해주세요.')
      return
    }
    setSubmitting(true)
    setLocalError(null)
    try {
      await onRequestChanges(item.approval_id, comment.trim())
    } catch (e) {
      setLocalError(isProviderError(e) ? e.message : '처리 중 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  return (
    <article className="ui-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="t-card-title">{item.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-cap">
            <span className="inline-flex items-center rounded-full bg-track px-2 py-0.5 font-medium text-ink-sub">
              {AREA_LABELS[item.area]}
            </span>
            <span>{item.category}</span>
          </p>
        </div>
        {item.due_at && <DdayBadge dueAt={item.due_at} />}
      </div>

      <dl className="mt-2 space-y-0.5 text-xs text-ink-cap">
        <div>
          <dt className="inline">요청일 </dt>
          <dd className="inline">{formatDateTime(item.requested_at)}</dd>
        </div>
        {item.due_at && (
          <div>
            <dt className="inline">기한 </dt>
            <dd className="inline">{formatDate(item.due_at.slice(0, 10))}</dd>
          </div>
        )}
      </dl>

      <a
        href={item.version.preview_url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block overflow-hidden rounded-lg border border-border bg-canvas"
      >
        <img
          src={item.version.preview_url}
          alt={`${item.title} 미리보기`}
          className="h-48 w-full object-contain"
        />
      </a>
      <p className="mt-1.5 truncate text-xs text-ink-cap">
        {item.version.file_name} · v{item.version.version_no}
      </p>

      {item.shared_comments.length > 0 && (
        <div className="mt-3 space-y-2 rounded-md bg-canvas p-3">
          {item.shared_comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-medium text-ink">{c.author_token ? '발주처' : '담당팀'}</span>
              <span className="ml-1.5 text-xs text-ink-cap">{formatDateTime(c.created_at)}</span>
              <p className="mt-0.5 whitespace-pre-wrap text-ink-sub">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {localError && (
        <div className="mt-3">
          <ErrorAlert message={localError} />
        </div>
      )}

      <div className="mt-4">
        {mode === 'idle' && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('confirm-approve')} className={ACCENT_BTN}>
              승인
            </button>
            <button type="button" onClick={() => setMode('request-changes')} className={GHOST_BTN}>
              수정요청
            </button>
          </div>
        )}

        {mode === 'confirm-approve' && (
          <div className="rounded-md bg-accent-tint p-3">
            <p className="text-sm text-ink">이 버전을 승인하시겠습니까? 승인 후에는 되돌릴 수 없습니다.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={reset} disabled={submitting} className={GHOST_BTN}>
                취소
              </button>
              <button type="button" onClick={runApprove} disabled={submitting} className={ACCENT_BTN}>
                {submitting ? '처리 중...' : '예, 승인합니다'}
              </button>
            </div>
          </div>
        )}

        {mode === 'request-changes' && (
          <div className="rounded-md bg-accent-tint p-3">
            <label className="t-caption" htmlFor={`comment-${item.approval_id}`}>
              수정 요청 내용
            </label>
            <textarea
              id={`comment-${item.approval_id}`}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value)
                if (localError) setLocalError(null)
              }}
              rows={3}
              placeholder="수정이 필요한 부분을 알려주세요."
              className="ui-input mt-1 w-full"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={reset} disabled={submitting} className={GHOST_BTN}>
                취소
              </button>
              <button
                type="button"
                onClick={runRequestChanges}
                disabled={submitting || !comment.trim()}
                className={ACCENT_BTN}
              >
                {submitting ? '제출 중...' : '제출'}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
