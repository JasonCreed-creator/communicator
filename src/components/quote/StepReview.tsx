// S-2 ④ 확인·확정 — RQC STEP 4 분해 이식(항목별 요약·조정) + v2.0 확정 잠금·고객 정보.
import { TARGET_MAX } from '../../modules/quote/engine/calcEstimate'
import type { QuoteOutputs } from '../../modules/quote/engine/quoteInput'
import type { Quote } from '../../types/entities'
import { fmtMoney, fmtWon, type QuoteFormState } from './quoteFormState'
import type { QuoteStrings } from './quoteStrings'

function Row({
  label,
  value,
  en,
  strong,
  accent,
  origValue,
}: {
  label: string
  value: number
  en: boolean
  strong?: boolean
  accent?: boolean
  origValue?: number
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 text-sm">
      <span className={strong ? 'font-bold text-ink' : 'text-ink-sub'}>{label}</span>
      <span className={`font-semibold ${accent ? 'text-accent-deep' : 'text-ink'}`}>
        {origValue != null && origValue !== value && (
          <span className="mr-2 font-normal text-ink-cap line-through">{fmtWon(origValue, en)}</span>
        )}
        {fmtWon(value, en)}
      </span>
    </div>
  )
}

export default function StepReview({
  form,
  outputs,
  baseOutputs,
  savedQuote,
  saving,
  finalizing,
  downloadPending,
  error,
  t,
  en,
  onField,
  onAdjust,
  onResetAdjust,
  onPrev,
  onSave,
  onFinalize,
  onDownload,
}: {
  form: QuoteFormState
  /** 조정 반영 산출 */
  outputs: QuoteOutputs
  /** 조정 미반영(자동) 산출 — 조정 UI의 기준값 */
  baseOutputs: QuoteOutputs
  savedQuote: Quote | null
  saving: boolean
  finalizing: boolean
  downloadPending: boolean
  error: string | null
  t: QuoteStrings
  en: boolean
  onField: (key: string, value: unknown) => void
  onAdjust: (key: string, value: string | number) => void
  onResetAdjust: () => void
  onPrev: () => void
  onSave: () => void
  onFinalize: () => void
  onDownload: () => void
}) {
  const p = baseOutputs.result
  const pAdj = outputs.result
  const adj = form.adjust
  const adjSum = ['s1', 's2', 's3', 's4', 'ot', 'leadPkg'].reduce((s, k) => s + (Number(adj[k]) || 0), 0)
  const hasAdjust = adjSum !== 0
  const isOversize = form.target > TARGET_MAX
  const isFinal = !!savedQuote?.is_final

  return (
    <div className="space-y-6">
      <h2 className="t-section-title">{t.s4Title}</h2>

      {isFinal && (
        <p className="rounded-md bg-positive-tint px-3 py-2 text-sm font-medium text-positive">🔒 {t.lockedBanner}</p>
      )}

      {/* 요약 카드 */}
      <div className="ui-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="t-caption text-accent-deep">{t.quoteTag}</p>
            <p className="t-card-title mt-1">{form.eventName || t.defaultProject}</p>
            <p className="mt-1 text-sm text-ink-sub">
              {form.venues[form.venueSelected]?.name || t.tbd} ·{' '}
              {form.includeLeads ? t.attendeeLeadShort(form.target, form.guarantee) : t.attendeeShort(form.target)}
            </p>
          </div>
          <div className="text-right">
            <p className="t-caption">
              {t.vatExcl}
              {hasAdjust && ` ${t.adjApplied}`}
            </p>
            <p className="kpi-num text-accent-deep">{fmtMoney(pAdj.pk, en)}</p>
            {hasAdjust && <p className="text-xs text-ink-cap line-through">{fmtMoney(p.pk, en)}</p>}
          </div>
        </div>
      </div>

      {/* 항목별 표 */}
      <div>
        <Row label={t.l1} value={pAdj.s1} en={en} origValue={adj.s1 ? p.s1 : undefined} />
        <p className="py-1 text-xs font-medium text-negative">{t.l1warn}</p>
        <Row label={t.l2} value={pAdj.s2} en={en} origValue={adj.s2 ? p.s2 : undefined} />
        <Row label={t.l3} value={pAdj.s3} en={en} origValue={adj.s3 ? p.s3 : undefined} />
        <Row label={t.l4(form.target)} value={pAdj.s4} en={en} origValue={adj.s4 ? p.s4 : undefined} />
        <Row label={form.includeLeads ? t.l5On : t.l5Off} value={pAdj.s5} en={en} origValue={pAdj.s5 !== p.s5 ? p.s5 : undefined} />
        {p.ot > 0 && <Row label={t.l6} value={pAdj.ot} en={en} origValue={adj.ot ? p.ot : undefined} />}
        {form.includeLeads && (
          <Row label={t.l7(p.g, p.ot > 0)} value={pAdj.leadPkg} en={en} origValue={adj.leadPkg ? p.leadPkg : p.leadOrig} />
        )}
        {p.genManage > 0 && (
          <Row label={t.lGen(6 + (p.ot > 0 ? 1 : 0) + (form.includeLeads ? 1 : 0), p.genCount)} value={p.genManage} en={en} />
        )}
        <Row label={t.lTotal} value={pAdj.pk} en={en} strong accent />
        <Row label={t.vatLine} value={outputs.breakdown.vat} en={en} />
        <Row label={t.totalInclVat} value={outputs.breakdown.total} en={en} strong />
      </div>

      {/* 금액 조정 */}
      {!isOversize && (
        <div className="ui-card p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="t-card-title">
              {t.adjTitle} <span className="text-xs font-normal text-ink-sub">{t.adjSub}</span>
            </p>
            {hasAdjust && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onResetAdjust}>
                {t.adjReset}
              </button>
            )}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-ink-sub">{t.adjDesc}</p>
          {[
            { k: 's1', label: t.adjS1, base: p.s1 },
            { k: 's2', label: t.adjS2, base: p.s2 },
            { k: 's3', label: t.adjS3, base: p.s3 },
            { k: 's4', label: t.adjS4, base: p.s4 },
            ...(p.ot > 0 ? [{ k: 'ot', label: t.adjOt, base: p.ot }] : []),
            ...(form.includeLeads ? [{ k: 'leadPkg', label: t.adjLead, base: p.leadPkg }] : []),
          ].map(({ k, label, base }) => {
            const d = Number(adj[k]) || 0
            return (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="text-xs text-ink-sub">
                    {t.adjAuto} {fmtWon(base, en)}
                    {d !== 0 && (
                      <span className={`ml-2 font-bold ${d < 0 ? 'text-negative' : 'text-steel'}`}>→ {fmtWon(base + d, en)}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdjust(k, d - 100000)} aria-label={`${label} 10만원 감액`}>−</button>
                  <input
                    type="number"
                    step={10000}
                    value={d === 0 ? '' : d}
                    placeholder="0"
                    onChange={(e) => onAdjust(k, e.target.value)}
                    className="ui-input w-32 text-right"
                    aria-label={`${label} 조정`}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdjust(k, d + 100000)} aria-label={`${label} 10만원 증액`}>＋</button>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-3 text-sm">
            <span className="font-medium text-ink-sub">{t.adjSum}</span>
            <span className={`font-bold ${adjSum < 0 ? 'text-negative' : adjSum > 0 ? 'text-steel' : 'text-ink-sub'}`}>
              {adjSum > 0 ? '+' : ''}
              {fmtWon(adjSum, en)}
            </span>
          </div>
          {hasAdjust && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="font-medium text-ink-sub">{t.adjPco}</span>
              <span className="font-semibold text-ink">
                {fmtWon(p.s5, en)} → {fmtWon(pAdj.s5, en)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 고객·담당 정보 — §16 핸드오프(organizer·담당 매니저·고객 연락처) 소스 */}
      <div className="ui-card p-4">
        <p className="t-card-title mb-3">{t.clientInfoTitle}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="t-caption">{t.clientCompanyLabel}</span>
            <input className="ui-input mt-1 w-full" value={form.clientCompany} onChange={(e) => onField('clientCompany', e.target.value)} />
          </label>
          <label className="block">
            <span className="t-caption">{t.managerLabel}</span>
            <input className="ui-input mt-1 w-full" value={form.manager} onChange={(e) => onField('manager', e.target.value)} />
          </label>
          <label className="block">
            <span className="t-caption">{t.contactNameLabel}</span>
            <input className="ui-input mt-1 w-full" value={form.contactName} onChange={(e) => onField('contactName', e.target.value)} />
          </label>
          <label className="block">
            <span className="t-caption">{t.contactEmailLabel}</span>
            <input className="ui-input mt-1 w-full" value={form.contactEmail} onChange={(e) => onField('contactEmail', e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="t-caption">{t.notesLabel}</span>
            <input className="ui-input mt-1 w-full" value={form.notes} onChange={(e) => onField('notes', e.target.value)} />
          </label>
        </div>
      </div>

      <p className="rounded-md bg-negative-tint px-3 py-2.5 text-sm leading-relaxed text-negative">{t.reviewNotice}</p>

      {error && (
        <p role="alert" className="rounded-md bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="space-y-2.5">
        <button type="button" className="btn btn-primary w-full" onClick={onSave} disabled={saving || isOversize}>
          {saving ? t.saving : isFinal ? t.saveNewVersionBtn : t.saveBtn}
        </button>
        <button type="button" className="btn btn-accent w-full" onClick={onFinalize} disabled={finalizing || saving || isOversize || isFinal}>
          {isFinal ? `🔒 ${t.finalizedBadge}` : finalizing ? t.saving : `🔏 ${t.finalizeBtn}`}
        </button>
        <button type="button" className="btn btn-ghost w-full" onClick={onDownload} disabled={downloadPending || isOversize || !savedQuote}>
          {t.downloadBtn}
        </button>
        <button type="button" className="btn btn-ghost w-full" onClick={onPrev}>
          {t.prev}
        </button>
      </div>
    </div>
  )
}
