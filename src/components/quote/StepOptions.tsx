// 견적 ③ 옵션 — 디자인지시서 v1.4 §7-2.10(PR-6 · 캔버스 '견적 옵션 — 고른 것이 보이게').
// RQC STEP 3 분해 이식(12종 옵션 + 미디어/포토월 택1 + 부스 2타입 + 기념품 덮어쓰기)을 다시 배치한다:
//  · 옵션 = 체크박스 카드 2열(`.ui-check` — 폼 정본) · 고르면 accent 테두리 + 옅은 accent 면
//  · 막힌 옵션은 숨기지 않고 비활성 + **이유 한 줄**(예: 'LED 화면일 때만 — 2단계(베뉴)에서 LED로 바꾸세요').
//    전에는 눌러야 알림으로 이유가 떴다 — 이제 누르기 전에 읽힌다
//  · 묶음 머리에 고른 건수 · 합계('2개 고름 · 400만원') — 합계는 엔진에서 읽는다(optionAmounts)
//  · 미디어·포토월 = 라디오 카드(하나만) + '선택 해제' · 부스 = 한 줄(− 수량 + · × 단가 · 소계)
//  · 이모지 → 선 아이콘 타일(quoteIcons)
// 결합 규칙(택1·중계 선행·LED 잠금·온라인중계 → 화면중계)은 toggleOption 그대로 — 표시만 바꿨다.
import { useId, useState, type ReactNode } from 'react'
import {
  BOOTH_PREMIUM_UNIT_PRICE,
  BOOTH_UNIT_PRICE,
  SOUVENIR_UNIT_PRICE,
} from '../../modules/quote/engine/calcEstimate'
import Field from '../internal/Field'
import MoneyField, { MoneyInput } from '../internal/MoneyField'
import type { OptionAmounts } from './optionAmounts'
import { ActionIcon, OptionIconTile } from './quoteIcons'
import {
  fmtMoney,
  fmtWon,
  OPT_CATALOG,
  toggleOption,
  type OptCatalogItem,
  type QuoteFormState,
} from './quoteFormState'
import type { QuoteStrings } from './quoteStrings'

interface CardState {
  checked: boolean
  disabled: boolean
  /** 막힌 이유 — 카드 안에 한 줄로 */
  reason: string | null
}

/** 옵션 카드 1장 — 체크박스(여럿) 또는 라디오(하나만) */
function OptionCard({
  o,
  type,
  name,
  state,
  price,
  priceBelow = false,
  lang,
  onChange,
}: {
  o: OptCatalogItem
  type: 'checkbox' | 'radio'
  name?: string
  state: CardState
  price: string
  /** 좁은 3열(미디어 패키지) — 금액을 이름 옆이 아니라 설명 아래에 둔다(이름이 세 줄로 접히지 않게) */
  priceBelow?: boolean
  lang: 'ko' | 'en'
  onChange: () => void
}) {
  const reasonId = useId()
  const { checked, disabled, reason } = state
  const priceNode = (
    <span className={`ui-num shrink-0 whitespace-nowrap text-sm font-semibold ${disabled && !checked ? 'text-ink-cap' : 'text-ink'}`}>
      {price}
    </span>
  )
  return (
    <label
      data-testid={`opt-${o.id}`}
      data-checked={checked || undefined}
      className={`grid grid-cols-[18px_32px_minmax(0,1fr)] items-start gap-x-3 rounded-[10px] border px-4 py-3.5 transition-colors ${
        checked
          ? 'border-accent bg-accent-tint/50 ring-1 ring-accent'
          : disabled
            ? 'border-border bg-canvas'
            : 'border-border bg-card hover:bg-canvas'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        type={type}
        name={name}
        className="ui-check mt-[9px]"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={reason ? reasonId : undefined}
      />
      <OptionIconTile id={o.id} active={checked} muted={disabled && !checked} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2.5">
          <span className={`text-sm font-semibold ${disabled && !checked ? 'text-ink-sub' : 'text-ink'}`}>{o[lang].label}</span>
          {!priceBelow && priceNode}
        </span>
        <span className="whitespace-pre-line text-xs leading-[17px] text-ink-sub">{o[lang].detail}</span>
        {priceBelow && <span className="mt-1">{priceNode}</span>}
        {reason && (
          <span id={reasonId} className="text-xs leading-[17px] text-accent-deep" data-testid="opt-reason">
            {reason}
          </span>
        )}
      </span>
    </label>
  )
}

/** 묶음 머리 — 제목 + (캡션) + 오른쪽 요약/동작 */
function SectionHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="t-section-title text-lg">
        {title}
        {hint && <span className="t-caption ml-2 text-[13px] font-normal">{hint}</span>}
      </h2>
      {right}
    </div>
  )
}

export default function StepOptions({
  form,
  amounts,
  t,
  en,
  lang,
  onForm,
  onField,
  onPrev,
  onNext,
}: {
  form: QuoteFormState
  /** 엔진에서 읽은 옵션별 금액 — 묶음 합계·부스 소계 */
  amounts: OptionAmounts
  t: QuoteStrings
  en: boolean
  lang: 'ko' | 'en'
  onForm: (updater: (prev: QuoteFormState) => QuoteFormState) => void
  onField: (key: string, value: unknown) => void
  onPrev: () => void
  onNext: () => void
}) {
  const [notice, setNotice] = useState<string | null>(null)

  const handleToggle = (id: string) => {
    onForm((prev) => {
      const { state, notice: msg } = toggleOption(prev, id, t)
      setNotice(msg)
      return state
    })
  }

  // LED 오퍼레이팅 옵션은 100명 미만 전용 — 100명 이상은 시스템 자동 포함/불필요 (RQC soloOpts 규칙)
  const soloOpts = OPT_CATALOG.filter(
    (o) =>
      o.group !== 'media' &&
      o.group !== 'photowall' &&
      (!o.pureOnly || !form.includeLeads) &&
      !(o.id === 'ledOperating' && form.target >= 100),
  )
  const mediaOpts = OPT_CATALOG.filter((o) => o.group === 'media')
  const photowallOpts = OPT_CATALOG.filter((o) => o.group === 'photowall')

  const souvUnit = form.souvenirPrice === '' ? SOUVENIR_UNIT_PRICE : Number(form.souvenirPrice)
  const souvQty = form.souvenirQty === '' ? form.target : Number(form.souvenirQty)
  const relayOn = !!form.options.screenRelay || !!form.options.onlineRelay

  /** 카드 상태 — 결합 규칙을 누르기 전에 보이게(체크 해제 불가·선행 필요는 비활성 + 이유) */
  const cardState = (o: OptCatalogItem): CardState => {
    const checked = !!form.options[o.id]
    if (o.id === 'ledOperating' && form.displayType === 'led' && checked) {
      return { checked, disabled: true, reason: t.lockLedOperating }
    }
    if (o.id === 'screenRelay' && checked && form.options.onlineRelay) {
      return { checked, disabled: true, reason: t.lockScreenRelay }
    }
    if (o.ledOnly && form.displayType !== 'led') return { checked, disabled: true, reason: t.gateLedOnly }
    if (o.relayOnly && !relayOn) return { checked, disabled: true, reason: t.gateRelayFirst }
    return { checked, disabled: false, reason: null }
  }

  const priceOf = (o: OptCatalogItem): string => {
    if (o.dyn === 'souvenir') return fmtMoney(souvQty * souvUnit, en)
    if (o.dyn === 'rsvp') return fmtMoney(form.target * 20000, en)
    return o[lang].price
  }

  // 묶음 머리 합계 — 엔진이 매긴 옵션별 금액에서 이 묶음 것만
  const amountOf = new Map(amounts.picked.map((p) => [p.id, p.amount]))
  const soloPicked = soloOpts.filter((o) => form.options[o.id])
  const soloSum = soloPicked.reduce((sum, o) => sum + (amountOf.get(o.id) ?? 0), 0)
  const mediaPicked = mediaOpts.find((o) => form.options[o.id]) ?? null
  const photowallPicked = photowallOpts.find((o) => form.options[o.id]) ?? null

  const booths = [
    {
      key: 'boothCount' as const,
      priceKey: 'boothUnitPrice' as const,
      title: t.boothStdTitle,
      desc: t.boothStdDesc,
      count: form.boothCount,
      def: BOOTH_UNIT_PRICE,
      amount: amounts.boothStd,
    },
    {
      key: 'boothPremiumCount' as const,
      priceKey: 'boothPremiumUnitPrice' as const,
      title: t.boothPremTitle,
      desc: t.boothPremDesc,
      count: form.boothPremiumCount,
      def: BOOTH_PREMIUM_UNIT_PRICE,
      amount: amounts.boothPremium,
    },
  ]

  const pickOneGroup = (
    title: string,
    items: OptCatalogItem[],
    picked: OptCatalogItem | null,
    name: string,
    cols: string,
    priceBelow = false,
  ) => (
    <section className="space-y-3" aria-label={title}>
      <SectionHead
        title={title}
        hint={picked ? t.pickOneHint : `${t.pickOneHint} · ${t.pickOneNone}`}
        right={
          picked ? (
            <button type="button" onClick={() => handleToggle(picked.id)} className="text-[13px] font-medium text-accent-deep hover:underline">
              {t.clearPick}
            </button>
          ) : undefined
        }
      />
      <div className={`grid gap-2.5 ${cols}`}>
        {items.map((o) => (
          <OptionCard
            key={o.id}
            o={o}
            type="radio"
            name={name}
            state={cardState(o)}
            price={priceOf(o)}
            priceBelow={priceBelow}
            lang={lang}
            onChange={() => handleToggle(o.id)}
          />
        ))}
      </div>
    </section>
  )

  return (
    // 같은 컴포넌트가 옆 요약(lg↑) 유무로 폭이 달라진다 — 화면 폭이 아니라 놓인 칸 폭으로 열 수를 정한다
    <div className="@container space-y-7">
      {notice && (
        <p role="status" className="rounded-md bg-steel-tint px-3 py-2 text-sm text-steel">
          {notice}
        </p>
      )}

      <section className="space-y-3" aria-label={t.s3Title}>
        <SectionHead
          title={t.s3Title}
          right={
            <span className="t-caption" data-testid="opt-solo-summary">
              {soloPicked.length > 0 ? t.optPicked(soloPicked.length, fmtMoney(soloSum, en)) : t.optNonePicked}
            </span>
          }
        />
        <div className="grid gap-2.5 @xl:grid-cols-2">
          {soloOpts.map((o) => (
            <OptionCard
              key={o.id}
              o={o}
              type="checkbox"
              state={cardState(o)}
              price={priceOf(o)}
              lang={lang}
              onChange={() => handleToggle(o.id)}
            />
          ))}
        </div>

        {form.options.souvenir && (
          <div className="rounded-[10px] border border-border bg-canvas px-4 py-3.5" data-testid="souvenir-panel">
            {/* 금액 필드는 힌트 줄에 에코가 붙어 높이가 한 줄 늘어난다 — 합계는 행 아래로 내린다.
                에코는 한글 축약(`1,200만원`) 고정이라 영문 모드에서는 끈다(`echo={null}`) — 영문 축약 표기는 정본에 없다 */}
            <div className="flex flex-wrap items-start gap-4">
              <MoneyField
                label={t.souvenirPriceLabel}
                value={form.souvenirPrice === '' ? null : form.souvenirPrice}
                onChange={(v) => onField('souvenirPrice', v == null ? '' : Math.max(0, Math.round(v)))}
                placeholder={SOUVENIR_UNIT_PRICE.toLocaleString('ko-KR')}
                inputClassName="w-36"
                echo={en ? null : undefined}
              />
              <Field label={t.souvenirQtyLabel} align="right">
                <input
                  type="number"
                  min={0}
                  className="ui-input ui-input-num w-28"
                  value={form.souvenirQty}
                  placeholder={String(form.target)}
                  onChange={(e) => onField('souvenirQty', e.target.value === '' ? '' : Math.max(0, Math.round(+e.target.value || 0)))}
                />
              </Field>
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">
              = {fmtWon(souvQty * souvUnit, en)}
            </p>
            <p className="t-caption mt-1">{t.souvenirLinkNote}</p>
          </div>
        )}
      </section>

      {pickOneGroup(t.mediaPkg, mediaOpts, mediaPicked, 'quote-media', '@2xl:grid-cols-3', true)}
      {pickOneGroup(t.photowall, photowallOpts, photowallPicked, 'quote-photowall', '@xl:grid-cols-2')}

      <section className="space-y-3" aria-label={t.boothSection}>
        <SectionHead title={t.boothSection} />
        <div className="ui-card overflow-hidden">
          {booths.map((b) => {
            // 계산 키로 인덱싱한 값은 좁혀지지 않는다 — 지역 변수로 한 번 받아 MoneyInput 계약(number|null)에 맞춘다
            const unitPrice = form[b.priceKey]
            return (
              <div
                key={b.key}
                data-testid={`booth-${b.key}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-track px-4 py-3 last:border-b-0"
              >
                <OptionIconTile id="booth" active={b.count > 0} />
                <span className="flex min-w-[11rem] flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ink">{b.title}</span>
                  <span className="text-xs leading-[17px] text-ink-sub">
                    {b.desc} · 0~50{t.unitCount}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-7 px-0"
                    aria-label={`${b.title} ${t.boothDec}`}
                    disabled={b.count <= 0}
                    onClick={() => onField(b.key, Math.max(0, (b.count || 0) - 1))}
                  >
                    −
                  </button>
                  {/* − / ＋ 사이 값이라 가운데 정렬이 의도다 — 우측정렬(ui-input-num)을 붙이지 않는다 */}
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="ui-input h-7 min-h-7 w-14 px-2 py-1 text-center font-semibold"
                    value={b.count || 0}
                    onChange={(e) => {
                      const v = +e.target.value
                      if (!Number.isNaN(v)) onField(b.key, Math.max(0, Math.min(50, v)))
                    }}
                    aria-label={t.boothCountAria(b.title)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-7 px-0"
                    aria-label={`${b.title} ${t.boothInc}`}
                    disabled={b.count >= 50}
                    onClick={() => onField(b.key, Math.min(50, (b.count || 0) + 1))}
                  >
                    ＋
                  </button>
                  {t.unitCount && <span className="t-caption">{t.unitCount}</span>}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="t-caption">{t.boothUnitPrefix}</span>
                  <MoneyInput
                    ariaLabel={t.boothUnitAria(b.title)}
                    value={unitPrice === '' ? null : unitPrice}
                    onChange={(v) => onField(b.priceKey, v == null ? '' : Math.max(0, Math.round(v)))}
                    placeholder={b.def.toLocaleString('ko-KR')}
                    className="h-8 min-h-8 w-[120px] py-1"
                  />
                  <span className="t-caption">{t.unitWon}</span>
                </span>
                <span
                  className={`ui-num ml-auto min-w-16 text-right text-sm ${b.amount > 0 ? 'font-semibold text-ink' : 'text-ink-cap'}`}
                  data-testid="booth-amount"
                >
                  {fmtMoney(b.amount, en)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onPrev}>
          <ActionIcon name="back" />
          {t.s3Prev}
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {t.s3Next}
          <ActionIcon name="forward" />
        </button>
      </div>
    </div>
  )
}
