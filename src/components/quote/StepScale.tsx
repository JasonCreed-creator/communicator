// S-2 ① 규모·유형 — RQC STEP 1 분해 이식 + v2.0 확장(일자·시간·행사 성격·타겟팅 5축).
import { kpiDownRatio, kpiMinAck, kpiTier, KPI_MIN_FLOOR } from '../../modules/quote/engine/kpiRules'
import { TARGET_MAX, TARGET_MIN } from '../../modules/quote/engine/calcEstimate'
import { EVENT_TYPE_OPTIONS } from '../../modules/quote/data/eventTypes'
import {
  COMPANY_SIZE,
  INDUSTRY,
  JOB_FUNCTION,
  POSITION,
  WORK_REGION,
} from '../../modules/quote/data/leadTargeting'
import type { Targeting } from '../../types/entities'
import type { QuoteOutputs } from '../../modules/quote/engine/quoteInput'
import { fmtMoney, LEAD_MIN, type QuoteFormState } from './quoteFormState'
import type { QuoteStrings } from './quoteStrings'

const TIER_TEXT = ['text-positive', 'text-accent-deep', 'text-negative']
const TIER_BG = ['bg-positive', 'bg-accent', 'bg-negative']

const TARGETING_AXES: { key: keyof Targeting; options: string[] }[] = [
  { key: 'company_size', options: COMPANY_SIZE },
  { key: 'title', options: POSITION },
  { key: 'industry', options: INDUSTRY },
  { key: 'job', options: JOB_FUNCTION },
  { key: 'region', options: WORK_REGION },
]

export default function StepScale({
  form,
  outputs,
  t,
  en,
  onField,
  onIncludeLeads,
  onTargeting,
  onNext,
}: {
  form: QuoteFormState
  outputs: QuoteOutputs
  t: QuoteStrings
  en: boolean
  onField: (key: string, value: unknown) => void
  onIncludeLeads: (on: boolean) => void
  onTargeting: (axis: keyof Targeting, value: string) => void
  onNext: () => void
}) {
  const isOversize = form.target > TARGET_MAX
  const ack = kpiMinAck(form.guarantee)
  const ratio = Math.round((1 - kpiDownRatio(form.guarantee)) * 100)
  const tier = kpiTier(form.guarantee)
  const underFloor = form.guarantee < KPI_MIN_FLOOR
  const p = outputs.result

  return (
    <div className="space-y-6">
      <h2 className="t-section-title">{t.s1Title}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="t-caption">{t.projectName}</span>
          <input
            className="ui-input mt-1 w-full"
            value={form.eventName}
            onChange={(e) => onField('eventName', e.target.value)}
            placeholder={t.projectPlaceholder}
          />
        </label>
        <label className="block">
          <span className="t-caption">{t.eventDateLabel}</span>
          <input type="date" className="ui-input mt-1 w-full" value={form.eventDate} onChange={(e) => onField('eventDate', e.target.value)} />
        </label>
        <label className="block">
          <span className="t-caption">{t.eventEndDateLabel}</span>
          <input type="date" className="ui-input mt-1 w-full" value={form.eventEndDate} onChange={(e) => onField('eventEndDate', e.target.value)} />
        </label>
        <div>
          <span className="t-caption">{t.timeLabel}</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="time" aria-label="시작 시간" className="ui-input w-full" value={form.startTime} onChange={(e) => onField('startTime', e.target.value)} />
            <span className="text-ink-cap">–</span>
            <input type="time" aria-label="종료 시간" className="ui-input w-full" value={form.endTime} onChange={(e) => onField('endTime', e.target.value)} />
          </div>
        </div>
        <label className="block">
          <span className="t-caption">{t.natureLabel}</span>
          <select className="ui-input ui-select mt-1 w-full" value={form.eventNature} onChange={(e) => onField('eventNature', e.target.value)}>
            {EVENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 총 참석인원 */}
      <div>
        <span className="t-caption">{t.attendeeLabel}</span>
        <div className="mt-1 flex items-center gap-3">
          {/* 슬라이더와 한 쌍인 초점 숫자라 가운데 정렬이 의도다 — 우측정렬(ui-input-num)을 붙이지 않는다 */}
          <input
            type="number"
            min={TARGET_MIN}
            max={TARGET_MAX}
            value={form.target}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') return
              const v = +raw
              if (!Number.isNaN(v)) onField('target', Math.min(TARGET_MAX, Math.max(TARGET_MIN, v)))
            }}
            className="ui-input w-28 text-center text-lg font-semibold"
            aria-label={t.attendeeLabel}
          />
          <span className="text-sm font-semibold text-accent-deep">{form.target}{t.pax}</span>
        </div>
        <input
          type="range"
          min={TARGET_MIN}
          max={TARGET_MAX}
          step={10}
          value={Math.min(form.target, TARGET_MAX)}
          onChange={(e) => onField('target', +e.target.value)}
          className="mt-2 w-full"
          aria-label={`${t.attendeeLabel} 슬라이더`}
        />
        <div className="flex justify-between text-xs text-ink-cap">
          <span>{TARGET_MIN}</span><span>150</span><span>300</span><span>{TARGET_MAX}</span>
        </div>
        {isOversize && (
          <p className="mt-2 rounded-md bg-negative-tint px-3 py-2 text-sm font-medium text-negative">
            {t.oversizeInline(TARGET_MAX)}
          </p>
        )}
      </div>

      {/* 모객 포함/제외 토글 */}
      <div className="ui-card border-accent/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="t-card-title">🤝 {t.leadsCardTitle}</span>
          <span className="rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-semibold text-accent-deep">{t.leadsCardBadge}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { on: true, label: t.leadsOn, desc: t.leadsOnDesc, icon: '🚀' },
            { on: false, label: t.leadsOff, desc: t.leadsOffDesc, icon: '📦' },
          ].map((m) => (
            <button
              key={String(m.on)}
              type="button"
              onClick={() => onIncludeLeads(m.on)}
              className={`rounded-[10px] border p-3.5 text-left transition-colors ${
                form.includeLeads === m.on ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:bg-track'
              }`}
            >
              <span className={`block text-sm font-semibold ${form.includeLeads === m.on ? 'text-accent-deep' : 'text-ink'}`}>
                {m.icon} {m.label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-sub">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 게런티 + KPI (모객 포함 모드) */}
      {form.includeLeads && !isOversize && (
        <div>
          <span className="t-caption">{t.guaranteeLabel}</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {/* 위 참석인원과 같은 슬라이더 짝 — 가운데 정렬 유지 */}
            <input
              type="number"
              min={LEAD_MIN}
              max={form.target}
              value={form.guarantee}
              onChange={(e) => {
                const v = +e.target.value
                if (!Number.isNaN(v)) onField('guarantee', v)
              }}
              className="ui-input w-28 text-center text-lg font-semibold"
              aria-label={t.guaranteeLabel}
            />
            <span className="text-sm font-semibold text-accent-deep">{form.guarantee}{t.pax}</span>
            <span className="text-xs text-ink-cap">{t.guaranteeNote(LEAD_MIN, form.target)}</span>
          </div>
          {underFloor ? (
            <p className="mt-2 inline-flex rounded-md bg-accent-tint px-3 py-1.5 text-xs font-medium text-accent-deep">
              ⚠️ {t.kpiUnderFloor(KPI_MIN_FLOOR)}
            </p>
          ) : (
            <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-track px-3 py-1.5 text-xs text-ink-sub">
              <span aria-hidden className={`size-2 rounded-full ${TIER_BG[tier - 1]}`} />
              <span className={`font-semibold ${TIER_TEXT[tier - 1]}`}>{t.kpiLine(ratio, ack)}</span>
              <span className="text-ink-cap">{t.kpiZoneNote(tier, form.guarantee)}</span>
            </p>
          )}
          <input
            type="range"
            min={LEAD_MIN}
            max={form.target}
            step={1}
            value={Math.max(LEAD_MIN, Math.min(form.guarantee, form.target))}
            onChange={(e) => {
              const raw = +e.target.value
              const snapped = Math.max(LEAD_MIN, Math.min(form.target, Math.round(raw / 10) * 10 || LEAD_MIN))
              onField('guarantee', snapped)
            }}
            className="mt-3 w-full"
            aria-label={`${t.guaranteeLabel} 슬라이더`}
          />
        </div>
      )}

      {/* 일반 참관객 관리 */}
      {!isOversize && (
        <div className="ui-card p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="t-card-title">🎟️ {t.genTitle}</span>
            <span className="rounded-full bg-track px-2.5 py-0.5 text-xs font-semibold text-ink-sub">{t.genBadge}</span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-ink-sub">{t.genDesc}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onField('genAttendees', Math.max(0, (form.genAttendees || 0) - 10))}>−10</button>
            {/* −10 / +10 사이 값이라 가운데 정렬이 의도다 */}
            <input
              type="number"
              min={0}
              aria-label={t.genLabel}
              value={form.genAttendees || 0}
              onChange={(e) => {
                const v = +e.target.value
                if (!Number.isNaN(v)) onField('genAttendees', Math.max(0, Math.round(v)))
              }}
              className="ui-input w-24 text-center font-semibold"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onField('genAttendees', (form.genAttendees || 0) + 10)}>+10</button>
            <span className="text-xs text-ink-cap">{t.genLabel}</span>
            {p.genManage > 0 && (
              <span className="ml-auto text-sm font-semibold text-accent-deep">
                {t.genCalc(p.genCount)} = {fmtMoney(p.genManage, en)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 타겟팅 5축 (모객 포함 모드) */}
      {form.includeLeads && !isOversize && (
        <div className="ui-card p-4">
          <p className="t-card-title">🎯 {t.targetingTitle}</p>
          <p className="mt-1 text-xs text-ink-sub">{t.targetingDesc}</p>
          <div className="mt-3 space-y-3">
            {TARGETING_AXES.map((axis, i) => (
              <div key={axis.key}>
                <p className="t-caption mb-1.5">{t.targetingAxes[i]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {axis.options.map((option) => {
                    const active = form.targeting[axis.key].includes(option)
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onTargeting(axis.key, option)}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? 'border-accent bg-accent-tint font-semibold text-accent-deep'
                            : 'border-border bg-card text-ink-sub hover:bg-track'
                        }`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isOversize && (
        <button type="button" className="btn btn-primary w-full" onClick={onNext}>
          {t.nextVenue}
        </button>
      )}
    </div>
  )
}
