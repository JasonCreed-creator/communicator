// 항목 상세 코멘트 — 디자인지시서 v1.4 §7-2.7 (캔버스 항목 상세). 옛 체크박스 "발주처에 공유(shared)"를
// 두 갈래 토글(내부 메모 · 발주처와 공유)로 바꿨다 — 누가 보는지를 쓰기 전에 고르고, 기본은 내부 메모(CLAUDE.md §6).
// 목록은 칩으로 거른다(전체 · 내부 메모 · 발주처와 공유). 공유 건은 steel 틴트 면 — 발주처 화면에도 보이는 글이다.
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import FilterChip from '../internal/FilterChip'
import SegmentedToggle from '../internal/SegmentedToggle'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import { formatDateTime } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { Comment } from '../../types/entities'
import type { CommentVisibility } from '../../types/enums'

const provider = getDataProvider()

type Filter = 'all' | CommentVisibility

export default function CommentThread({
  deliverableId,
  comments,
  memberName,
  hasPartner = false,
  onAdded,
}: {
  deliverableId: string
  comments: Comment[]
  memberName: (userId: string | null) => string
  /** 파트너 제출 항목 — 공유 상대가 발주처가 아니라 파트너다 */
  hasPartner?: boolean
  onAdded: () => void
}) {
  const who = hasPartner ? '파트너' : '발주처'
  const sharedLabel = `${who}와 공유`
  const [filter, setFilter] = useState<Filter>('all')
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<CommentVisibility>('internal')
  const add = useMutation((v: CommentVisibility) => provider.addComment(deliverableId, { body, visibility: v }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    const result = await add.run(visibility)
    if (result) {
      setBody('')
      setVisibility('internal')
      onAdded()
    }
  }

  const sharedCount = comments.filter((c) => c.visibility === 'shared').length
  const counts: Record<Filter, number> = { all: comments.length, internal: comments.length - sharedCount, shared: sharedCount }
  const shown = filter === 'all' ? comments : comments.filter((c) => c.visibility === filter)
  const labels: Record<Filter, string> = { all: '전체', internal: '내부 메모', shared: sharedLabel }

  return (
    <section className="ui-card" aria-label="코멘트">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="t-card-title">코멘트</h2>
        {comments.length > 0 && (
          <div role="group" aria-label="코멘트 거르기" className="flex flex-wrap gap-1.5">
            {(['all', 'internal', 'shared'] as const).map((f) => (
              <FilterChip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
                {labels[f]} <b>{counts[f]}</b>
              </FilterChip>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2.5 px-5 pb-5 pt-4">
        {comments.length === 0 && <p className="text-sm text-ink-cap">코멘트가 없습니다.</p>}
        {comments.length > 0 && shown.length === 0 && (
          <p className="text-sm text-ink-cap">{labels[filter]} 코멘트가 없습니다.</p>
        )}
        <ul className="space-y-2.5">
          {shown.map((c) => {
            const name = c.author_token ? who : memberName(c.author_user_id)
            const shared = c.visibility === 'shared'
            return (
              <li
                key={c.id}
                data-visibility={c.visibility}
                className={`flex gap-3 rounded-[10px] px-3.5 py-3 ${shared ? 'bg-steel-tint' : 'bg-canvas'}`}
              >
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-track text-xs font-semibold text-brown"
                >
                  {name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{name}</span>
                    <LevelBadge level={shared ? 'progress' : 'neutral'} label={shared ? sharedLabel : '내부 메모'} />
                    <span className="t-caption">{formatDateTime(c.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-ink">{c.body}</p>
                </div>
              </li>
            )
          })}
        </ul>

        <form onSubmit={handleSubmit} className="space-y-2.5 pt-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            aria-label="코멘트"
            placeholder="코멘트를 입력하세요"
            className="ui-input w-full resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <SegmentedToggle
                label="코멘트 공개 범위"
                value={visibility}
                options={[
                  { value: 'internal', label: '내부 메모' },
                  { value: 'shared', label: sharedLabel },
                ]}
                onChange={setVisibility}
              />
              <span className="t-caption" data-testid="comment-visibility-note">
                {visibility === 'internal' ? `내부 메모는 ${who}에게 보이지 않습니다.` : `${who} 화면에도 보입니다.`}
              </span>
            </div>
            <button type="submit" disabled={add.pending} className="btn btn-ghost">
              등록
            </button>
          </div>
          <ErrorAlert message={add.error} />
        </form>
      </div>
    </section>
  )
}
