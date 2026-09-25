// 정산보드 KPI 4장 — 디자인지시서 v1.4 §7-2.11(PR-7 · 캔버스 '정산보드 — 금액 색은 의미대로').
//
// 3.17b의 '마진 구성 · 검산' 카드를 KPI 안으로 합쳤다:
//   · 검산 = 최종 마진 칸의 배지(항등식 `마진 기준 계약액 − Σ실집행 = 최종 마진` — lib/settlement.identityOk 그대로).
//     첫 칸 − 둘째 칸 = 셋째 칸이 화면 숫자로 바로 읽힌다
//   · 구성 = 그 칸의 6px 막대(마크업 · PCO · RSVP). **주황을 쓰지 않는다** — 금액 구성은 강조가 아니라서
//     brown · steel · border-strong(기존 토큰)으로 나눈다. 음수 변동분은 폭 0 + 캡션의 음수로 알린다
//   · 마진율 = 참고 범위 밴드(positive-tint) 위 마커 — 범위 밖이어도 **판정하지 않고 위치만**(§19.1)
// **마진 식은 여기서 계산하지 않는다** — computeTotals가 준 값을 배치만 한다.
import InfoTip from '../internal/InfoTip'
import { LevelBadge } from '../internal/StatusBadge'
import { SETTLEMENT_KPI_HELP } from '../../lib/helpTexts'
import type { SettlementTotals } from '../../lib/settlement'
import { Fragment, type ReactNode } from 'react'

/** 실측 내부정산 범위 — **참고선일 뿐 판정하지 않는다**(§19.1). 낮다고 경고를 띄우지 않는다 */
export const MARGIN_BAND = { low: 0.275, high: 0.69 }

/** 마진 구성 막대 — 주황 없이 세 단(4번째부터는 순환) */
const SEGMENT_CLASSES = ['bg-brown', 'bg-steel', 'bg-border-strong'] as const

/** 캡션용 짧은 이름 — 원가 없는 기본 버킷 두 개만 줄인다(나머지는 버킷 이름 그대로) */
const SHORT_LABEL: Record<string, string> = { s5: 'PCO', rc: 'RSVP' }

export interface MarginSegment {
  key: string
  label: string
  short: string
  amount: number
}

/** 변동(항목 마크업)이 먼저, 고정(원가 없는 버킷의 견적액)이 견적 순서대로 뒤따른다 */
export function marginSegments(totals: SettlementTotals): MarginSegment[] {
  return [
    { key: 'variable', label: '항목 마크업', short: '마크업', amount: totals.variableMarkup },
    ...totals.fixedByBucket.map((f) => ({ key: f.code, label: f.label, short: SHORT_LABEL[f.code] ?? f.label, amount: f.amount })),
  ]
}

function num(n: number): string {
  return n.toLocaleString('ko-KR')
}

function pct(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
}

/** 캡션 조각 — 숫자 가운데서 줄이 끊기지 않게 조각 단위로만 접는다 */
function parts(list: string[]): ReactNode {
  // 구분자는 조각 밖에 둔다 — 안에 두면 줄바꿈 자리가 사라져 좁은 화면에서 가로로 넘친다
  return list.map((p, i) => (
    <Fragment key={`${i}-${p}`}>
      {i > 0 ? ' · ' : ''}
      <span className="whitespace-nowrap">{p}</span>
    </Fragment>
  ))
}

/** '리드젠(쇼업 보장)' → '리드젠' — 캡션의 괄호 이름 */
function shortName(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '')
}

function Kpi({
  label,
  help,
  badge,
  value,
  tone = 'ink',
  unit = true,
  children,
  support,
  supportTestId,
}: {
  label: string
  help: string
  badge?: ReactNode
  value: string
  tone?: 'ink' | 'negative'
  unit?: boolean
  /** 숫자와 캡션 사이의 막대(구성·범위) */
  children?: ReactNode
  support: ReactNode
  supportTestId: string
}) {
  return (
    <div className="ui-card flex flex-col gap-1.5 px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="t-caption inline-flex items-center gap-1">
          {label}
          <InfoTip text={help} />
        </span>
        {badge}
      </div>
      <div className={`whitespace-nowrap text-2xl font-bold leading-[30px] tabular-nums ${tone === 'negative' ? 'text-negative' : 'text-ink'}`}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-medium">원</span>}
      </div>
      {children}
      <span className="t-caption text-ink-sub" data-testid={supportTestId}>
        {support}
      </span>
    </div>
  )
}

export default function SettlementKpis({ totals }: { totals: SettlementTotals }) {
  const excludedTotal = totals.excluded.reduce((s, e) => s + e.amount, 0)
  const contractTotal = totals.marginBase + excludedTotal
  const excludedName = totals.excluded.length === 1 ? `(${shortName(totals.excluded[0].label)})` : ''
  const spend = totals.totalOrdered === 0 ? null : totals.totalActual / totals.totalOrdered
  const segments = marginSegments(totals)
  const positive = segments.map((s) => Math.max(0, s.amount))
  const span = positive.reduce((a, b) => a + b, 0)
  const rate = totals.marginRate
  const markerLeft = Math.min(100, Math.max(0, (rate ?? 0) * 100))
  const inBand = rate != null && rate >= MARGIN_BAND.low && rate <= MARGIN_BAND.high
  const bandText = `참고 범위 ${(MARGIN_BAND.low * 100).toFixed(1)}~${(MARGIN_BAND.high * 100).toFixed(1)}%`

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="settlement-kpis">
      <Kpi
        label="마진 기준 계약액"
        help={SETTLEMENT_KPI_HELP.contract}
        value={num(totals.marginBase)}
        support={
          excludedTotal > 0 ? (
            <>
              <span className="whitespace-nowrap">계약 {num(contractTotal)}</span>{' '}
              <span className="whitespace-nowrap">
                − 마진 밖{excludedName} {num(excludedTotal)}
              </span>
            </>
          ) : (
            `계약 ${num(contractTotal)} 전부`
          )
        }
        supportTestId="kpi-support-contract"
      />
      <Kpi
        label="실집행"
        help={SETTLEMENT_KPI_HELP.spent}
        value={num(totals.totalActual)}
        support={spend == null ? '아직 발주가 없습니다' : `발주 ${num(totals.totalOrdered)}원 중 ${pct(spend)} 집행`}
        supportTestId="kpi-support-spent"
      />
      <Kpi
        label="최종 마진"
        help={SETTLEMENT_KPI_HELP.margin}
        badge={
          <span data-testid="margin-identity" title={SETTLEMENT_KPI_HELP.identity}>
            {totals.identityOk ? <LevelBadge level="positive" label="검산 일치" /> : <LevelBadge level="blocked" label="검산 어긋남" />}
          </span>
        }
        value={num(totals.finalMargin)}
        tone={totals.finalMargin < 0 ? 'negative' : 'ink'}
        support={parts(segments.map((s) => `${s.short} ${num(s.amount)}`))}
        supportTestId="kpi-support-margin"
      >
        <div aria-label="마진 구성" className="flex h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
          {segments.map((s, i) => (
            <div
              key={s.key}
              data-testid={`margin-seg-${s.key}`}
              title={`${s.label} ${num(s.amount)}원`}
              className={SEGMENT_CLASSES[i % SEGMENT_CLASSES.length]}
              style={{ width: span === 0 ? '0%' : `${(positive[i] / span) * 100}%` }}
            />
          ))}
        </div>
      </Kpi>
      <Kpi
        label="마진율"
        help={SETTLEMENT_KPI_HELP.marginRate}
        value={pct(rate)}
        unit={false}
        support={rate == null ? `${bandText} · 판정 아님` : `${bandText} ${inBand ? '안' : '밖'} · 판정 아님`}
        supportTestId="kpi-support-rate"
      >
        {/* 참고 범위는 판정이 아니다 — 마커로 위치만 찍는다(§19.1) */}
        <div className="relative h-1.5 w-full rounded-[3px] bg-track">
          <div
            className="absolute inset-y-0 rounded-[3px] bg-positive-tint"
            style={{ left: `${MARGIN_BAND.low * 100}%`, width: `${(MARGIN_BAND.high - MARGIN_BAND.low) * 100}%` }}
          />
          <span
            data-testid="margin-rate-marker"
            aria-hidden
            className="absolute -top-[3px] h-3 w-0.5 rounded-[1px] bg-ink"
            style={{ left: `${markerLeft}%` }}
          />
        </div>
      </Kpi>
    </div>
  )
}
