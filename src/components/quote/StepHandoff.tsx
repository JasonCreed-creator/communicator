// S-2 ⑤ 행사 만들기 — §16 핸드오프: 확정 견적 → createProjectFromQuote → S0 ① 프리필.
// 확정 전에는 비활성(§10 S-2). 금액은 어떤 키로도 넘어가지 않는다(#RULE-NO-PRICE-TO-CLIENT).
import { quoteToProjectDraft } from '../../modules/quote/handoff'
import type { Quote } from '../../types/entities'
import type { QuoteStrings } from './quoteStrings'

export default function StepHandoff({
  savedQuote,
  linkedProjectName,
  creating,
  error,
  t,
  onPrev,
  onCreateProject,
  onGoProject,
}: {
  savedQuote: Quote | null
  linkedProjectName: string | null
  creating: boolean
  error: string | null
  t: QuoteStrings
  onPrev: () => void
  onCreateProject: () => void
  onGoProject: () => void
}) {
  const isFinal = !!savedQuote?.is_final
  const linked = !!savedQuote?.project_id
  const draft = savedQuote && isFinal ? quoteToProjectDraft(savedQuote) : null

  return (
    <div className="space-y-6">
      <h2 className="t-section-title">{t.s5Title}</h2>
      <p className="text-sm leading-relaxed text-ink-sub">{t.s5Desc}</p>

      {!isFinal && (
        <p className="rounded-md bg-track px-3 py-2.5 text-sm text-ink-sub">⏳ {t.s5NeedFinal}</p>
      )}

      {draft && (
        <div className="ui-card p-4">
          <p className="t-caption mb-2">§16 프리필 미리보기</p>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[
              ['행사명', draft.name],
              ['행사 코드(제안)', draft.code_suggestion],
              ['행사일', draft.event_date ?? '—'],
              ['운영 시간', [draft.start_time, draft.end_time].filter(Boolean).join('–') || '—'],
              ['베뉴', draft.venue ?? '—'],
              ['예상 인원', draft.expected_headcount != null ? `${draft.expected_headcount}명` : '—'],
              ['유형', draft.event_type === 'recruiting' ? '모객형' : '일반형'],
              ['보장 인원', draft.guarantee_pax != null ? `${draft.guarantee_pax}명` : '—'],
              ['주최(고객사)', draft.organizer ?? '—'],
              ['참가 대상', draft.target_audience ?? '—'],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3 border-b border-border py-1.5">
                <dt className="shrink-0 text-ink-cap">{label}</dt>
                <dd className="truncate text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {linked && (
        <div className="ui-card border-positive/40 bg-positive-tint p-4">
          <p className="t-caption text-positive">{t.s5LinkedTitle}</p>
          <p className="mt-1 text-sm font-semibold text-ink">{linkedProjectName ?? savedQuote?.project_id}</p>
          <button type="button" className="btn btn-ghost mt-3" onClick={onGoProject}>
            {t.s5GoProject}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="space-y-2.5">
        {!linked && (
          <button
            type="button"
            className="btn btn-accent w-full"
            disabled={!isFinal || creating}
            onClick={onCreateProject}
          >
            {creating ? t.s5Creating : `🚀 ${t.s5CreateBtn}`}
          </button>
        )}
        <button type="button" className="btn btn-ghost w-full" onClick={onPrev}>
          {t.prev}
        </button>
      </div>
    </div>
  )
}
