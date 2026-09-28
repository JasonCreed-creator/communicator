// 참고 문서 링크 — 온보딩 ①·행사 설정 ① 공용(Phase 6.11 PR-B · 설계서 v2.21 §27.3). 마스터 시트 '개요' 탭의 킥오프·요청서·제안서·계약 링크 자리.
//   · 링크만(https) — 앱은 열기만 한다(파일을 읽지 않는다) · 저장소 밖 링크도 된다 · 행사당 20개(넘으면 붙이기 막힘 + 안내)
//   · Slack 글에서 불러왔으면 그 글의 링크를 골라 붙인다(요청서 원문 시트 → 종류 '요청서' 제안 — 고칠 수 있다)
//   · 내부 화면에만(발주처·파트너·랜딩 밖) · 홈 머리에는 두지 않는다 · 견적서 첨부(QuoteAttachmentCard) 옆 — 견적서는 그쪽
import { useId, useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import type { BriefLink } from '../../lib/intake/eventBrief'
import { formatDate } from '../../lib/labels'
import { isHttpsUrl } from '../../lib/quoteAttachment'
import {
  guessReferenceLinkKind,
  hostLabel,
  REFERENCE_LINK_DUPLICATE_MESSAGE,
  REFERENCE_LINK_INVALID_MESSAGE,
  REFERENCE_LINK_KIND_LABELS,
  REFERENCE_LINKS_LIMIT_MESSAGE,
  REFERENCE_LINKS_MAX,
  referenceLinkLabel,
} from '../../lib/referenceLinks'
import { getDataProvider } from '../../providers'
import type { Project, ReferenceLink, UUID } from '../../types/entities'
import { REFERENCE_LINK_KINDS, type ReferenceLinkKind } from '../../types/enums'

const provider = getDataProvider()

export default function ReferenceLinksCard({
  projectId,
  project,
  readOnly = false,
  onChanged,
  slackLinks = [],
}: {
  projectId: UUID
  project: Project
  readOnly?: boolean
  onChanged: () => void
  /** Slack 글 속 링크(인테이크) — 골라서 참고 문서로 붙인다 */
  slackLinks?: BriefLink[]
}) {
  const ids = useId()
  const links = project.reference_links ?? []
  const full = links.length >= REFERENCE_LINKS_MAX
  const [formOpen, setFormOpen] = useState(false)
  const [kind, setKind] = useState<ReferenceLinkKind>('request')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  const save = useMutation(async (next: ReferenceLink[]) => {
    await provider.updateProject(projectId, { reference_links: next.length > 0 ? next : null })
    return true
  })

  const reset = () => {
    setFormOpen(false)
    setTitle('')
    setUrl('')
    setKind('request')
  }
  const openForm = (preset?: { url: string; title: string | null }) => {
    save.setError(null)
    if (preset) {
      setUrl(preset.url)
      setTitle(preset.title ?? '')
      setKind(guessReferenceLinkKind(preset.url, preset.title))
    }
    setFormOpen(true)
  }
  const handleAdd = async () => {
    const u = url.trim()
    if (!isHttpsUrl(u)) {
      save.setError(REFERENCE_LINK_INVALID_MESSAGE)
      return
    }
    if (links.some((l) => l.url === u)) {
      save.setError(REFERENCE_LINK_DUPLICATE_MESSAGE)
      return
    }
    if (full) {
      save.setError(REFERENCE_LINKS_LIMIT_MESSAGE)
      return
    }
    const next = [...links, { kind, title: title.trim(), url: u, added_at: new Date().toISOString() }]
    if (await save.run(next)) {
      reset()
      onChanged()
    }
  }
  const handleRemove = async (link: ReferenceLink) => {
    if (!window.confirm(`'${referenceLinkLabel(link)}' 링크를 뺄까요? 원본 문서는 그대로 남습니다.`)) return
    if (await save.run(links.filter((l) => l.url !== link.url))) onChanged()
  }

  return (
    <section aria-label="참고 문서" data-testid="reference-links" className="space-y-3 rounded-[10px] border border-border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-card-title">참고 문서</p>
          <p className="mt-0.5 text-xs text-ink-cap">
            킥오프·요청서·제안서·계약 문서의 링크를 한곳에 — 내부 화면에만 보이고, 앱은 링크를 열기만 합니다(견적서는 위 ‘견적서’ 칸에).
          </p>
        </div>
        <span className="text-xs text-ink-cap" data-testid="reference-links-count">
          {links.length}/{REFERENCE_LINKS_MAX}
        </span>
      </div>

      {links.length > 0 ? (
        <ul className="m-0 list-none space-y-1.5 p-0" data-testid="reference-links-list">
          {links.map((l) => (
            <li key={l.url} className="flex flex-wrap items-center gap-2" data-testid="reference-link-row">
              <LevelBadge level="neutral" label={REFERENCE_LINK_KIND_LABELS[l.kind]} />
              <a href={l.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate font-medium text-ink underline">
                {referenceLinkLabel(l)}
              </a>
              <span className="text-xs text-ink-cap">
                {l.title.trim() ? `${hostLabel(l.url)} · ` : ''}
                {formatDate(l.added_at.slice(0, 10))}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm ml-auto"
                  aria-label={`${referenceLinkLabel(l)} 빼기`}
                  disabled={save.pending}
                  onClick={() => void handleRemove(l)}
                >
                  빼기
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-cap" data-testid="reference-links-empty">
          아직 붙인 참고 문서가 없습니다.
        </p>
      )}

      {!readOnly && (
        <div className="space-y-2">
          {!formOpen ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={save.pending || full}
              title={full ? REFERENCE_LINKS_LIMIT_MESSAGE : undefined}
              onClick={() => openForm()}
            >
              ＋ 링크 붙이기
            </button>
          ) : (
            <div className="grid grid-cols-1 gap-2 rounded-md bg-canvas p-3 sm:grid-cols-[auto_1fr]" data-testid="reference-link-form">
              <label htmlFor={`${ids}-kind`} className="t-caption sm:self-center">
                종류
              </label>
              <select id={`${ids}-kind`} className="ui-select w-40" value={kind} onChange={(e) => setKind(e.target.value as ReferenceLinkKind)}>
                {REFERENCE_LINK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {REFERENCE_LINK_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <label htmlFor={`${ids}-title`} className="t-caption sm:self-center">
                문서 이름
              </label>
              <input
                id={`${ids}-title`}
                className="ui-input w-full"
                placeholder="비우면 링크의 사이트 이름으로 보여요"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              <label htmlFor={`${ids}-url`} className="t-caption sm:self-center">
                링크
              </label>
              <input
                id={`${ids}-url`}
                className="ui-input w-full"
                placeholder="https://docs.google.com/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <div className="flex gap-2 sm:col-start-2">
                <button type="button" className="btn btn-ghost btn-sm" disabled={save.pending || !url.trim()} onClick={() => void handleAdd()}>
                  붙이기
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  취소
                </button>
              </div>
            </div>
          )}
          {full && (
            <p className="text-xs text-ink-cap" data-testid="reference-links-limit-note">
              {REFERENCE_LINKS_LIMIT_MESSAGE}
            </p>
          )}

          {slackLinks.length > 0 && (
            <div className="space-y-1 rounded-md bg-canvas p-3" data-testid="reference-links-slack">
              <p className="text-xs font-medium text-ink-sub">Slack 글에서 온 링크 — 참고 문서로 붙이기(종류는 이름으로 어림 · 고칠 수 있어요)</p>
              <ul className="m-0 list-none space-y-1 p-0">
                {slackLinks.map((l) => {
                  const already = links.some((x) => x.url === l.url)
                  return (
                    <li key={l.url} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-ink">
                        {l.label ?? l.url}
                        <span className="ml-1 text-xs text-ink-cap">{REFERENCE_LINK_KIND_LABELS[guessReferenceLinkKind(l.url, l.label)]} 같음</span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={save.pending || already || full}
                        title={already ? '이미 붙어 있어요' : full ? REFERENCE_LINKS_LIMIT_MESSAGE : undefined}
                        onClick={() => openForm({ url: l.url, title: l.label })}
                      >
                        {already ? '붙어 있음' : '참고 문서로'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
      <ErrorAlert message={save.error} />
    </section>
  )
}
