// 운영가이드 섹션 카드 (v2.5 §23 화면 C → v2.13 §23.5 · 디자인지시서 §7-2.13).
// 머리 = 번호 · 제목(h3) · 출처 배지(steel) · 상태(갱신 있음 / 비어 있음) · 고치기·위로·아래로·삭제.
// 본문 = 표 섹션(data)은 늘 펼친 표, 마크다운 섹션은 기존 2줄 미리보기(펼치기) — 인쇄 때는 부모가 전부 펼친다.
// R-O6: 연락망/비품 섹션은 개인 연락처 경고를 고정 노출하고, '연락망 포함' 체크 전에는 인쇄에서 뺀다.
import { useState } from 'react'
import InfoTip from '../internal/InfoTip'
import { GUIDE_STALE_HELP } from '../../lib/helpTexts'
import { GUIDE_KIND_META, hasGuideData, isGuideSectionEmpty } from '../../lib/guideStructured'
import type { GuideSection, GuideSectionData, ProgramSession } from '../../types/entities'
import { renderLiteMarkdown } from '../plan/markdown'
import { GuideDataEditor } from './GuideDataEditor'
import { GuideDataView } from './GuideDataView'
import GuideStaleDiff from './GuideStaleDiff'

/** 연동 배지 문구(steel 톤) — 마크다운 섹션은 원본 연동, 표 섹션은 뼈대 출처 */
const SOURCE_BADGE_LABELS: Record<string, string> = {
  zone_items: '존운영 항목 연동',
  role_charters: 'R&R 연동',
}

export default function GuideSectionCard({
  section,
  number,
  isFirst,
  isLast,
  canEdit,
  projectId,
  sessions,
  headcount,
  includeContactsInPrint,
  saving,
  expanded,
  onToggleExpanded,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSaveMarkdown,
  onSaveData,
  onApplyDiff,
}: {
  section: GuideSection
  /** 1부터 — 머리에 두 자리로 */
  number: number
  isFirst: boolean
  isLast: boolean
  canEdit: boolean
  projectId: string | null
  sessions: readonly ProgramSession[]
  headcount: number | null
  includeContactsInPrint: boolean
  saving: boolean
  expanded: boolean
  onToggleExpanded: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onSaveMarkdown: (id: string, patch: { title: string; content: string }) => Promise<unknown>
  onSaveData: (id: string, patch: { title: string; data: GuideSectionData }) => Promise<unknown>
  onApplyDiff: (id: string, content: string) => Promise<unknown>
}) {
  const structured = hasGuideData(section)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(section.title)
  const [content, setContent] = useState(section.content ?? '')
  const [draft, setDraft] = useState<GuideSectionData | null>(section.data ?? null)

  const startEdit = () => {
    setTitle(section.title)
    setContent(section.content ?? '')
    setDraft(section.data ?? null)
    setEditing(true)
  }

  const submitEdit = async () => {
    const result =
      structured && draft ? await onSaveData(section.id, { title, data: draft }) : await onSaveMarkdown(section.id, { title, content })
    if (result) setEditing(false)
  }

  const isContacts = section.kind === 'contacts'
  // R-O6: 인쇄에서 연락망 섹션은 명시 체크 전까지 제외 — plan-print-hidden(§23.2)을 재사용해
  // 화면에는 그대로 두고 window.print()에서만 숨긴다.
  const printClass = isContacts && !includeContactsInPrint ? 'plan-print-hidden' : ''
  const sourceBadge = section.source_ref
    ? SOURCE_BADGE_LABELS[section.source_ref]
    : structured
      ? GUIDE_KIND_META[section.kind]?.source
      : null
  const empty = isGuideSectionEmpty(section)
  const hasBody = !!section.content?.trim()

  return (
    <article id={`guide-sec-${section.id}`} className={`plan-section scroll-mt-4 rounded-lg border border-border ${printClass}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden className="text-xs font-bold tabular-nums text-brown">
            {String(number).padStart(2, '0')}
          </span>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="섹션 제목"
              className="ui-input text-sm font-semibold"
            />
          ) : (
            <h3 className="min-w-0 truncate text-sm font-bold text-ink">{section.title}</h3>
          )}
          {sourceBadge && (
            <span className="inline-flex items-center rounded-md bg-steel-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-steel">
              {sourceBadge}
            </span>
          )}
          {section.source_stale && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-deep">
              갱신 있음
              <InfoTip text={GUIDE_STALE_HELP} />
            </span>
          )}
          {empty && !section.source_stale && (
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
              비어 있음
            </span>
          )}
        </div>
        {canEdit && (
          <div className="plan-print-hidden flex flex-wrap items-center gap-2">
            {!editing && (
              <button type="button" onClick={startEdit} className="text-xs text-ink-sub underline">
                고치기
              </button>
            )}
            <button type="button" onClick={onMoveUp} disabled={isFirst} className="text-xs text-ink-sub underline disabled:opacity-40">
              위로
            </button>
            <button type="button" onClick={onMoveDown} disabled={isLast} className="text-xs text-ink-sub underline disabled:opacity-40">
              아래로
            </button>
            <button type="button" onClick={onDelete} className="text-xs text-negative underline">
              삭제
            </button>
          </div>
        )}
      </header>

      <div className="px-4 py-3">
        {isContacts && (
          <p className="plan-print-hidden mb-3 rounded-md bg-canvas px-3 py-2 text-xs text-ink-sub">
            개인 연락처(개인 휴대폰 등)는 넣지 마세요 — 화면·운영계획서 조립에서 제외되며, 인쇄 포함은 명시 옵션입니다.
          </p>
        )}

        {editing ? (
          <div className="space-y-3">
            {structured && draft ? (
              <GuideDataEditor data={draft} sessions={sessions} onChange={setDraft} idPrefix={`gs-${section.id}`} />
            ) : (
              <>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  aria-label={`${section.title} 본문`}
                  className="ui-input w-full font-mono text-xs"
                />
                <div>
                  <p className="t-caption mb-1">미리보기</p>
                  <div className="rounded-md bg-canvas p-3">{renderLiteMarkdown(content || '_내용 없음_')}</div>
                </div>
              </>
            )}
            <div className="plan-print-hidden flex gap-2">
              <button type="button" onClick={submitEdit} disabled={saving} className="btn btn-primary btn-sm">
                저장
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
                취소
              </button>
            </div>
          </div>
        ) : structured && section.data ? (
          <GuideDataView data={section.data} headcount={headcount} />
        ) : hasBody ? (
          <>
            {/* 3.16.4 화면 C — 기본 2줄 미리보기(말줄임), 클릭 시 펼침. 본문은 항상 DOM에
                있고 시각적으로만 접는다(line-clamp) — 인쇄 시 부모가 전 섹션을 펼친다. */}
            <div
              onClick={expanded ? undefined : onToggleExpanded}
              className={`text-sm text-ink-sub ${expanded ? '' : 'line-clamp-2 cursor-pointer'}`}
            >
              {renderLiteMarkdown(section.content!)}
            </div>
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="plan-print-hidden mt-1.5 text-xs font-medium text-steel underline underline-offset-2"
            >
              {expanded ? '접기 ▴' : '펼치기 ▾'}
            </button>
          </>
        ) : (
          <p className="text-xs text-ink-cap">본문 미작성</p>
        )}

        {section.source_stale && section.source_ref && projectId && (
          <GuideStaleDiff
            section={section}
            projectId={projectId}
            canApply={canEdit}
            applying={saving}
            onApply={(next) => onApplyDiff(section.id, next)}
          />
        )}
      </div>
    </article>
  )
}
