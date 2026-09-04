// S-2 ② 베뉴 — RQC STEP 2(후보 다중·택1) + v2.0 확장: 베뉴 DB 20곳 필터·홀 적합도(§10 S-2).
import { useMemo, useState } from 'react'
import {
  getAllVenues,
  getScaledHalls,
  getTrustBadge,
  GRADE_LABELS,
  type VenueWithTrust,
} from '../../modules/quote/data/venuedb'
import { calcVenueRental, VENUE_PER_PAX_5STAR } from '../../modules/quote/engine/calcEstimate'
import { clampVenueIndex } from '../../modules/quote/engine/venueOptions'
import MoneyField from '../internal/MoneyField'
import { fmtMoney, fmtWon, newEditorVenue, type EditorVenue, type QuoteFormState } from './quoteFormState'
import type { QuoteStrings } from './quoteStrings'

export default function StepVenue({
  form,
  t,
  en,
  onForm,
  onField,
  onPrev,
  onNext,
}: {
  form: QuoteFormState
  t: QuoteStrings
  en: boolean
  onForm: (updater: (prev: QuoteFormState) => QuoteFormState) => void
  onField: (key: string, value: unknown) => void
  onPrev: () => void
  onNext: () => void
}) {
  const allVenues = useMemo(() => getAllVenues(), [])
  const regions = useMemo(() => [...new Set(allVenues.map((v) => v.region))], [allVenues])
  const [region, setRegion] = useState<string>('')
  const [openVenueId, setOpenVenueId] = useState<string | null>(null)

  const filtered = region ? allVenues.filter((v) => v.region === region) : allVenues
  const selIdx = clampVenueIndex(
    form.venues.map((v) => ({ name: v.name, date: v.date, rental: v.rental })),
    form.venueSelected,
  )
  const selectedRental = Number(form.venues[selIdx]?.rental) || 0

  const updateVenue = (idx: number, patch: Partial<EditorVenue>) =>
    onForm((prev) => ({
      ...prev,
      venues: prev.venues.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    }))

  const addCandidate = (candidate: EditorVenue) =>
    onForm((prev) => {
      // 첫 후보가 빈 직접입력이면 교체, 아니면 추가 후 새 후보를 선택
      const isBlankFirst = prev.venues.length === 1 && !prev.venues[0].name && !prev.venues[0].venue_id
      const venues = isBlankFirst ? [candidate] : [...prev.venues, candidate]
      return { ...prev, venues, venueSelected: venues.length - 1 }
    })

  const removeVenue = (idx: number) =>
    onForm((prev) => {
      if (prev.venues.length <= 1) return prev
      const venues = prev.venues.filter((_, i) => i !== idx)
      const sel = clampVenueIndex(
        prev.venues.map((v) => ({ name: v.name, date: v.date, rental: v.rental })),
        prev.venueSelected,
      )
      const venueSelected = idx === sel ? 0 : idx < sel ? sel - 1 : sel
      return { ...prev, venues, venueSelected }
    })

  const selectVenue = (idx: number) => onForm((prev) => ({ ...prev, venueSelected: idx }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="t-section-title">{t.s2Title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-sub">{t.s2Intro}</p>
      </div>

      <p className="rounded-md bg-accent-tint px-3 py-2 text-sm font-medium text-accent-deep">⚠️ {t.hotelWarn}</p>

      {/* 베뉴 DB — 20곳 필터·홀 적합도 (§10 S-2 ②) */}
      <div className="ui-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="t-card-title">🏨 {t.dbTitle}</p>
          <label className="flex items-center gap-2 text-xs text-ink-cap">
            {t.dbFilterRegion}
            <select className="ui-input ui-select min-h-8 py-1 text-xs" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">{t.dbFilterAll}</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {filtered.map((venue: VenueWithTrust) => {
            const open = openVenueId === venue.id
            const halls = open ? getScaledHalls(venue.id, form.target) : []
            return (
              <li key={venue.id} className="rounded-md border border-border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-track"
                  onClick={() => setOpenVenueId(open ? null : venue.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{venue.name}</span>
                    <span className="block truncate text-xs text-ink-cap">
                      {venue.region} · {GRADE_LABELS[venue.grade] ?? venue.grade} · {getTrustBadge(venue)}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-xs text-ink-cap">{open ? '▴' : '▾'}</span>
                </button>
                {open && (
                  <div className="border-t border-border px-3 py-2">
                    {halls.map((hall, hi) => (
                      <div key={`${venue.id}-${hi}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="min-w-0 text-sm text-ink">
                          {hall.name}
                          <span
                            className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                              hall.fit === 'best'
                                ? 'bg-positive-tint text-positive'
                                : hall.fit === 'small'
                                  ? 'bg-negative-tint text-negative'
                                  : 'bg-track text-ink-sub'
                            }`}
                          >
                            {t.dbHallFit[hall.fit]}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {hall.scaledPrice != null ? fmtMoney(hall.scaledPrice, en) : t.dbNeedQuote}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              addCandidate({
                                venue_id: venue.id,
                                name: venue.name,
                                hall: hall.name,
                                date: form.eventDate || '',
                                rental: hall.scaledPrice ?? calcVenueRental(form.target),
                              })
                            }
                          >
                            {t.dbAddBtn}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* 후보 목록 · 택1 */}
      <div>
        <p className="t-card-title mb-2">{t.candidatesTitle}</p>
        <div className="space-y-3">
          {form.venues.map((venue, vi) => {
            const isSel = selIdx === vi
            return (
              <div key={vi} className={`ui-card p-4 ${isSel ? 'border-accent' : ''}`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => selectVenue(vi)} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`flex size-5 items-center justify-center rounded-full border-2 ${isSel ? 'border-accent' : 'border-border-strong'}`}
                    >
                      {isSel && <span className="size-2.5 rounded-full bg-accent" />}
                    </span>
                    <span className="rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-bold text-accent-deep">
                      🏨 {t.venueCardTitle(vi + 1)}
                    </span>
                    {isSel ? (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-white">{t.venueSelectedTag}</span>
                    ) : (
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-ink-sub">{t.venueSelectBtn}</span>
                    )}
                  </button>
                  <span className={`ml-auto text-sm font-bold ${isSel ? 'text-accent-deep' : 'text-ink-cap'}`}>
                    {fmtWon(Number(venue.rental) || 0, en)}
                  </span>
                  {form.venues.length > 1 && (
                    <button type="button" className="btn btn-ghost-negative btn-sm" onClick={() => removeVenue(vi)}>
                      {t.removeVenue}
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="t-caption">{t.venueNameLabel}</span>
                    <input
                      className="ui-input mt-1 w-full"
                      value={venue.name}
                      onChange={(e) => updateVenue(vi, { name: e.target.value, venue_id: null })}
                      placeholder={t.venueNamePlaceholder}
                    />
                  </label>
                  <label className="block">
                    <span className="t-caption">{t.hallLabel}</span>
                    <input className="ui-input mt-1 w-full" value={venue.hall} onChange={(e) => updateVenue(vi, { hall: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="t-caption">{t.venueDateLabel}</span>
                    <input type="date" className="ui-input mt-1 w-full" value={venue.date} onChange={(e) => updateVenue(vi, { date: e.target.value })} />
                  </label>
                </div>
                <div className="mt-3">
                  {/* 값 되읽기는 MoneyField 에코 한 줄로 모은다 — 만원 단위로 반올림하던 옆 칸과 두 번 말하지 않는다.
                      에코 문구는 한글 축약 고정이라 영문 모드에서는 끈다(`echo={null}`) — 대체 영문 문구는 지어내지 않는다 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <MoneyField
                      label={t.rentalLabel}
                      value={venue.rental}
                      onChange={(v) => updateVenue(vi, { rental: v == null ? 0 : Math.max(0, Math.round(v)) })}
                      ariaLabel={t.rentalLabel}
                      inputClassName="w-44"
                      echo={en ? null : undefined}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title={`${form.target} × ${VENUE_PER_PAX_5STAR.toLocaleString()}`}
                      onClick={() => updateVenue(vi, { rental: calcVenueRental(form.target) })}
                    >
                      {t.autoCalcBtn}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-ink-cap">{t.rentalCap}</p>
                </div>
              </div>
            )
          })}
        </div>
        <button type="button" className="btn btn-ghost mt-3 w-full border-dashed" onClick={() => addCandidate(newEditorVenue(0))}>
          {t.addVenue}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border-2 border-accent bg-accent-tint px-4 py-3">
        <span className="text-sm font-bold text-ink">{t.venuesTotalLabel}</span>
        <span className="text-xl font-bold text-accent-deep">{fmtWon(selectedRental, en)}</span>
      </div>
      <p className="rounded-md bg-accent-tint px-3 py-2 text-sm text-accent-deep">{t.fbNote(fmtMoney(selectedRental * 0.8, en))}</p>

      {/* 디스플레이 */}
      <div>
        <span className="t-caption">{t.displayLabel}</span>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {[
            { id: 'led', label: t.displayLed, desc: t.displayLedDesc },
            { id: 'projector', label: t.displayProjector, desc: t.displayProjectorDesc },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onField('displayType', d.id)}
              className={`rounded-[10px] border p-3.5 text-left transition-colors ${
                form.displayType === d.id ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:bg-track'
              }`}
            >
              <span className={`block text-sm font-semibold ${form.displayType === d.id ? 'text-accent-deep' : 'text-ink'}`}>{d.label}</span>
              <span className="mt-0.5 block text-xs text-ink-sub">{d.desc}</span>
            </button>
          ))}
        </div>
        {form.displayType === 'led' && (
          <p className="mt-2 rounded-md bg-accent-tint px-3 py-2 text-xs font-medium text-accent-deep">{t.ledNote}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" className="btn btn-ghost flex-1" onClick={onPrev}>{t.prev}</button>
        <button type="button" className="btn btn-primary flex-1" onClick={onNext}>{t.nextOption}</button>
      </div>
    </div>
  )
}
