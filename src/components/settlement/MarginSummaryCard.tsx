// 마진 구성 · 검산 — 한 카드 (시안 '정산보드.dc.html' / Phase 3.17b)
//
// 시안이 합친 이유: "어디서 났나(구성 막대)"와 "맞나(검산)"는 같은 질문의 앞뒤라
// 카드가 둘로 갈리면 시선이 두 번 움직인다. 초과 경보도 같은 카드 하단 바로 내린다.
//
// **마진 식은 설계서 §19.1 정본이며 여기서 계산하지 않는다** — computeTotals가 준 값을
// 표시만 한다. 검산 항등식(마진 기준 계약액 − Σ실집행 = 최종 마진)도 lib/settlement의
// identityOk를 그대로 읽는다.
import InfoTip from '../internal/InfoTip'
import { LevelBadge } from '../internal/StatusBadge'
import MarginBar from './MarginBar'
import { SETTLEMENT_KPI_HELP } from '../../lib/helpTexts'
import type { SettlementTotals } from '../../lib/settlement'

function krw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

function CheckRow({
  label,
  amount,
  total = false,
}: {
  label: string
  amount: number
  total?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        total ? 'mt-0.5 border-t border-border-strong pt-2' : ''
      }`}
    >
      <span className={`text-[13px] ${total ? 'font-semibold text-ink' : 'text-ink-sub'}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${total ? 'text-sm font-semibold text-ink' : 'text-[13px] text-ink'}`}
      >
        {krw(amount)}
      </span>
    </div>
  )
}

export default function MarginSummaryCard({
  totals,
  contractTotal,
  excludedTotal,
  overOnly,
  onToggleOverOnly,
}: {
  totals: SettlementTotals
  /** 계약 총액 = 마진 기준 계약액 + 마진 밖 버킷 */
  contractTotal: number
  /** 마진 기준에서 빠진 버킷(리드젠) 합 */
  excludedTotal: number
  overOnly: boolean
  onToggleOverOnly: () => void
}) {
  return (
    <section
      data-testid="margin-summary-card"
      className={`ui-card ${totals.identityOk ? '' : 'border-negative'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        {/* h2의 접근성 이름에 "도움말"이 섞이지 않도록 InfoTip은 h2의 형제로 둔다 */}
        <div className="flex items-center gap-1.5">
          <h2 className="t-card-title">마진 구성 · 검산</h2>
          <InfoTip text={SETTLEMENT_KPI_HELP.identity} />
        </div>
        {totals.identityOk ? (
          <LevelBadge level="positive" label="항등식 성립" />
        ) : (
          <LevelBadge level="blocked" label="항등식 어긋남" />
        )}
      </div>

      <div className="flex flex-col gap-6 p-5 lg:flex-row lg:gap-8">
        <div className="min-w-0 flex-1">
          <MarginBar totals={totals} />
        </div>

        {/* 검산 — 카드 안 카드 금지(§5)라 canvas 인셋으로 면을 나눈다 */}
        <div className="rounded-lg border border-border bg-canvas p-4 lg:w-[400px] lg:shrink-0">
          <p className="t-caption">검산</p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            <CheckRow label="계약" amount={contractTotal} />
            <CheckRow label="− 마진 밖(리드젠)" amount={excludedTotal} />
            <CheckRow label="− 실집행" amount={totals.totalActual} />
            <CheckRow label="최종 마진" amount={totals.finalMargin} total />
          </div>
          {!totals.identityOk && (
            <p className="mt-2.5 text-sm font-medium text-negative" role="alert">
              항등식이 어긋납니다 — 버킷의 원가·마진 기준 설정을 확인하세요.
            </p>
          )}
        </div>
      </div>

      {/* 초과 경보 — 카드 하단 negative-tint 바. 초과를 막지는 않는다(R-S8) */}
      {totals.overBudgetCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-negative-tint px-5 py-3">
          <span className="text-sm font-medium text-negative" role="alert">
            견적 초과 버킷 {totals.overBudgetCount}건 — 초과는 막지 않으니 사유를 남겨 주세요.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-negative print-hidden"
            aria-pressed={overOnly}
            onClick={onToggleOverOnly}
          >
            {overOnly ? '전체 버킷 보기' : '초과 버킷만 보기'}
          </button>
        </div>
      )}
    </section>
  )
}
