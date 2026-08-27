// `/p/{token}` 항목 카드 — §10.1 화면 C: 상태 배지 · 수정요청 코멘트(shared) · 제출/재제출
// (파일 드롭존 또는 텍스트 인라인 폼, 카드에서 토글) · 승인됨은 읽기 전용.
// 라벨은 주최형 세트(HOST_STATUS_LABELS, §5.1 표) — 대행형 STATUS_LABELS와 문구만 다르다.
import { useState, type DragEvent } from 'react'
import { isProviderError } from '../../lib/errors'
import { formatDate, formatDateTime, HOST_STATUS_LABELS, STATUS_BADGE_CLASSES } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { PartnerPortalItem, PartnerSubmissionInput } from '../../types'
import ErrorAlert from '../internal/ErrorAlert'

const provider = getDataProvider()

type SubmitMode = 'file' | 'text'

interface PartnerPortalItemCardProps {
  item: PartnerPortalItem
  token: string
  onSubmitted: () => void | Promise<void>
}

export default function PartnerPortalItemCard({ item, token, onSubmitted }: PartnerPortalItemCardProps) {
  const [mode, setMode] = useState<SubmitMode>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const canSubmit = item.status === 'requested' || item.status === 'changes_requested'
  const isResubmit = item.status === 'changes_requested'
  const latestVersion = item.versions[0] ?? null

  const runSubmit = async () => {
    if (mode === 'file' && !file) {
      setLocalError('제출할 파일을 선택해주세요.')
      return
    }
    if (mode === 'text' && !text.trim()) {
      setLocalError('제출 내용을 입력해주세요.')
      return
    }
    setLocalError(null)
    setSubmitting(true)
    try {
      const input: PartnerSubmissionInput =
        mode === 'file' ? { file_name: file!.name, note: note.trim() || undefined } : { text: text.trim() }
      await provider.submitPartnerItem(token, item.deliverable_id, input)
      setFile(null)
      setText('')
      setNote('')
      await onSubmitted()
    } catch (e) {
      setLocalError(isProviderError(e) ? e.message : '제출 중 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) setFile(dropped)
  }

  return (
    <article className="ui-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-caption">{item.task_code}</p>
          <h3 className="t-card-title">{item.task_title}</h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[item.status]}`}
        >
          {item.status === 'pending_approval' && (
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          )}
          {HOST_STATUS_LABELS[item.status]}
        </span>
      </div>

      {item.deadline && <p className="mt-1 text-xs text-ink-cap">마감 {formatDate(item.deadline)}</p>}

      {latestVersion && (
        <p className="mt-2 truncate text-xs text-ink-cap">
          최근 제출 · {latestVersion.file_name} · v{latestVersion.version_no}
        </p>
      )}

      {item.comments.length > 0 && (
        <div className="mt-3 space-y-2 rounded-md bg-canvas p-3">
          {item.comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-medium text-ink">주최 측 검토 의견</span>
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

      {item.status === 'pending_approval' && (
        <p className="mt-4 rounded-md bg-canvas px-3 py-2 text-sm text-ink-sub">
          제출이 접수되어 검토 중입니다.
        </p>
      )}

      {canSubmit && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode('file')}
              aria-pressed={mode === 'file'}
              className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-ghost'}`}
            >
              파일로 제출
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              aria-pressed={mode === 'text'}
              className={`btn btn-sm ${mode === 'text' ? 'btn-primary' : 'btn-ghost'}`}
            >
              텍스트로 제출
            </button>
          </div>

          {mode === 'file' ? (
            <>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="mt-3 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong bg-canvas px-3 text-center"
              >
                <input
                  type="file"
                  className="hidden"
                  aria-label={`${item.task_title} 파일 선택`}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <span className="truncate text-sm text-ink">
                  {file ? file.name : '파일을 선택하거나 이곳에 끌어다 놓으세요'}
                </span>
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="메모(선택)"
                aria-label={`${item.task_title} 메모`}
                className="ui-input mt-2 w-full"
              />
            </>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="제출 내용을 입력해주세요."
              aria-label={`${item.task_title} 텍스트 제출`}
              className="ui-input mt-3 w-full"
            />
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={runSubmit}
              disabled={submitting}
              className="btn btn-accent h-11 w-full"
            >
              {submitting ? '제출 중...' : isResubmit ? '다시 제출' : '제출'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
