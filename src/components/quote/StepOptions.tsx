// S-2 ③ 옵션 — RQC STEP 3 분해 이식 (12종 옵션 + 미디어/포토월 택1 그룹 + 부스 2타입 + 기념품 오버라이드).
import { useState } from 'react'
import {
  BOOTH_PREMIUM_UNIT_PRICE,
  BOOTH_UNIT_PRICE,
  SOUVENIR_UNIT_PRICE,
} from '../../modules/quote/engine/calcEstimate'
import type { QuoteOutputs } from '../../modules/quote/engine/quoteInput'
import {
  fmtMoney,
  fmtWon,
  OPT_CATALOG,
  toggleOption,
  type OptCatalogItem,
  type QuoteFormState,
} from './quoteFormState'
import type { QuoteStrings } from './quoteStrings'

export default function StepOptions({
  form,
  outputs,
  t,
  en,
  lang,
  onForm,
  onField,
  onPrev,
  onNext,
}: {
  form: QuoteFormState
  outputs: QuoteOutputs
  t: QuoteStrings
  en: boolean
  lang: 'ko' | 'en'
  onForm: (updater: (prev: QuoteFormState) => QuoteFormState) => void
  onField: (key: string, value: unknown) => void
  onPrev: () => void
  onNext: () => void
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const p = outputs.result

  const handleToggle = (id: string) => {
    onForm((prev) => {
      const { state, notice: msg } = toggleOption(prev, id, t)
      setNotice(msg)
      return state
    })
  }

  // scaler4k 옵션은 100명 미만 전용 — 100명 이상은 시스템 자동 포함/불필요 (RQC soloOpts 규칙)
  const soloOpts = OPT_CATALOG.filter(
    (o) =>
      o.group !== 'media' &&
      o.group !== 'photowall' &&
      (!o.pureOnly || !form.includeLeads) &&
      !(o.id === 'scaler4k' && form.target >= 100),
  )
  const souvUnit = form.souvenirPrice === '' ? SOUVENIR_UNIT_PRICE : Number(form.souvenirPrice)
  const souvQty = form.souvenirQty === '' ? form.target : Number(form.souvenirQty)
  const boothStdUnit = form.boothUnitPrice === '' ? BOOTH_UNIT_PRICE : Number(form.boothUnitPrice)
  const boothPremUnit = form.boothPremiumUnitPrice === '' ? BOOTH_PREMIUM_UNIT_PRICE : Number(form.boothPremiumUnitPrice)

  const optDynPrice = (o: OptCatalogItem): string => {
    if (o.dyn === 'souvenir') return `${fmtWon(souvUnit, en)} × ${souvQty} = ${fmtMoney(souvQty * souvUnit, en)}`
    if (o.dyn === 'rsvp') return `${fmtWon(20000, en)} × ${form.target} = ${fmtMoney(form.target * 20000, en)}`
    return o[lang].price
  }

  const OptionRow = ({ o }: { o: OptCatalogItem }) => {
    const active = !!form.options[o.id]
    const isLocked = o.id === 'scaler4k' && form.displayType === 'led'
    const isLedGated = !!o.ledOnly && form.displayType !== 'led'
    return (
      <button
        type="button"
        onClick={() => handleToggle(o.id)}
        title={o[lang].detail}
        className={`flex w-full items-center gap-3 rounded-[10px] border p-3.5 text-left transition-colors ${
          active ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:bg-track'
        } ${isLedGated ? 'opacity-50' : ''}`}
      >
        <span aria-hidden>{o.icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">
            {o[lang].label}
            {isLocked && <span className="ml-2 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold text-accent-deep">{t.ledRequired}</span>}
            {isLedGated && <span className="ml-2 rounded bg-track px-1.5 py-0.5 text-[10px] font-bold text-ink-cap">{t.ledOnlyTag}</span>}
          </span>
          <span className="block truncate text-xs text-ink-sub">{o[lang].detail}</span>
        </span>
        <span className="ml-auto shrink-0 text-sm font-medium text-accent-deep">{optDynPrice(o)}</span>
        <span aria-hidden className={`shrink-0 text-base ${active ? 'text-accent-deep' : 'text-ink-cap'}`}>
          {active ? (isLocked ? '🔒' : '✓') : ''}
        </span>
      </button>
    )
  }

  const RadioGroup = ({ title, icon, items }: { title: string; icon: string; items: OptCatalogItem[] }) => (
    <div className="ui-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        <span className="t-card-title">{title}</span>
        <span className="rounded-full bg-track px-2 py-0.5 text-xs text-ink-cap">{t.pick1}</span>
      </div>
      <div className="space-y-2">
        {items.map((o) => (
          <OptionRow key={o.id} o={o} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <h2 className="t-section-title">{t.s3Title}</h2>

      {notice && (
        <p role="status" className="rounded-md bg-steel-tint px-3 py-2 text-sm text-steel">
          {notice}
        </p>
      )}

      <div className="space-y-2">
        {soloOpts.map((o) => (
          <OptionRow key={o.id} o={o} />
        ))}
      </div>

      {form.options.souvenir && (
        <div className="ui-card border-accent/40 p-4">
          <p className="mb-3 text-sm font-bold text-ink">🎁 {t.souvenirPriceLabel} · {t.souvenirQtyLabel}</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="t-caption">{t.souvenirPriceLabel}</span>
              <input
                type="number"
                step={5000}
                min={0}
                className="ui-input mt-1 w-36 text-right"
                value={form.souvenirPrice}
                placeholder={String(SOUVENIR_UNIT_PRICE)}
                onChange={(e) => onField('souvenirPrice', e.target.value === '' ? '' : Math.max(0, Math.round(+e.target.value || 0)))}
              />
            </label>
            <label className="block">
              <span className="t-caption">{t.souvenirQtyLabel}</span>
              <input
                type="number"
                min={0}
                className="ui-input mt-1 w-28 text-right"
                value={form.souvenirQty}
                placeholder={String(form.target)}
                onChange={(e) => onField('souvenirQty', e.target.value === '' ? '' : Math.max(0, Math.round(+e.target.value || 0)))}
              />
            </label>
            <span className="pb-2 text-sm font-bold text-accent-deep">= {fmtWon(souvQty * souvUnit, en)}</span>
          </div>
          <p className="mt-2 text-xs text-ink-cap">{t.souvenirLinkNote}</p>
        </div>
      )}

      <RadioGroup title={t.mediaPkg} icon="📹" items={OPT_CATALOG.filter((o) => o.group === 'media')} />
      <RadioGroup title={t.photowall} icon="🖼️" items={OPT_CATALOG.filter((o) => o.group === 'photowall')} />

      {([
        { key: 'boothCount' as const, priceKey: 'boothUnitPrice' as const, icon: '🏬', title: t.boothStdTitle, desc: t.boothStdDesc, count: form.boothCount, unit: boothStdUnit, def: BOOTH_UNIT_PRICE },
        { key: 'boothPremiumCount' as const, priceKey: 'boothPremiumUnitPrice' as const, icon: '🏛️', title: t.boothPremTitle, desc: t.boothPremDesc, count: form.boothPremiumCount, unit: boothPremUnit, def: BOOTH_PREMIUM_UNIT_PRICE },
      ]).map((b) => (
        <div key={b.key} className={`ui-card p-4 ${b.count > 0 ? 'border-accent' : ''}`}>
          <div className="mb-3 flex items-center gap-3">
            <span aria-hidden className="text-lg">{b.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{b.title}</p>
              <p className="text-xs text-ink-cap">{b.desc}</p>
            </div>
            <span className="text-sm text-accent-deep">
              {b.count > 0 ? `${b.count} × ${fmtMoney(b.unit, en)} = ${fmtMoney(b.count * b.unit, en)}` : t.boothUnselected}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onField(b.key, Math.max(0, (b.count || 0) - 1))}>−</button>
            <input
              type="number"
              min={0}
              max={50}
              className="ui-input w-20 text-center font-semibold"
              value={b.count || 0}
              onChange={(e) => {
                const v = +e.target.value
                if (!Number.isNaN(v)) onField(b.key, Math.max(0, Math.min(50, v)))
              }}
              aria-label={`${b.title} ${t.boothCountLabel}`}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onField(b.key, Math.min(50, (b.count || 0) + 1))}>＋</button>
            <span className="text-xs text-ink-cap">{t.boothCountLabel}</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-ink-cap">{t.boothUnitLabel}</span>
              <input
                type="number"
                step={100000}
                min={0}
                className="ui-input w-32 text-right text-sm"
                value={form[b.priceKey]}
                placeholder={String(b.def)}
                onChange={(e) => onField(b.priceKey, e.target.value === '' ? '' : Math.max(0, Math.round(+e.target.value || 0)))}
                aria-label={`${b.title} ${t.boothUnitLabel}`}
              />
            </div>
          </div>
        </div>
      ))}

      {p.ot > 0 && (
        <div className="ui-card flex items-center justify-between p-4">
          <span className="text-sm font-bold text-ink">{t.optSubtotal}</span>
          <span className="text-base font-bold text-accent-deep">{fmtMoney(p.ot, en)}</span>
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" className="btn btn-ghost flex-1" onClick={onPrev}>{t.prev}</button>
        <button type="button" className="btn btn-primary flex-1" onClick={onNext}>{t.reviewNext}</button>
      </div>
    </div>
  )
}
