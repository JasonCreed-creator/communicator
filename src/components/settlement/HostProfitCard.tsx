// 주최형 손익 카드 — 설계서 v2.22.2 §19.9 (Phase 6.18 · 기획자님 #8b "견적서 금액과 정산금액이 일치하지 않는 부분" 중 워킹버짓 행사).
//
// 주최형(kind='host')은 발주처 계약액이 없다 — 파트너 계약액(수입)에서 지출을 뺀 손익이 관심사라 KPI 4장 위에 한 장을 더 둔다.
//   · 숫자는 lib/settlement.hostProfit이 준 값을 배치만 한다(마진 식·버킷 플래그 무접촉)
//   · 수입 = 파트너 보드의 계약액(철회 제외) · 지출 예산 = 버킷 견적 합(= 예산 워크북 지출 표) · 실집행 = 원가 버킷 실비 합
//   · 손익은 실집행 기준을 크게, 예산 기준을 캡션에 — 실집행이 아직 없으면 둘이 다르다는 사실을 캡션이 말한다
//   · 내부 전용 — 파트너 포털·발주처 지면에 이 카드의 키는 나가지 않는다(R-H2·R-H3)
import InfoTip from '../internal/InfoTip'
import { hostProfit, type SettlementTotals } from '../../lib/settlement'
import type { SettlementBucket } from '../../types/entities'

export const HOST_PROFIT_HELP =
  '주최형 손익 = 파트너 계약액(수입, 철회 제외) − 실집행. 실집행이 아직 없으면 예산 기준(수입 − 버킷 견적 합)으로 읽으세요. 마진 식(§19.1)과는 별개의 참고 숫자입니다.'

function num(n: number): string {
  return n.toLocaleString('ko-KR')
}

function Tile({ label, value, tone = 'ink', testId }: { label: string; value: number; tone?: 'ink' | 'negative'; testId: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="t-caption">{label}</dt>
      <dd
        className={`whitespace-nowrap text-xl font-bold leading-7 tabular-nums ${tone === 'negative' ? 'text-negative' : 'text-ink'}`}
        data-testid={testId}
      >
        {num(value)}
        <span className="ml-0.5 text-sm font-medium">원</span>
      </dd>
    </div>
  )
}

export default function HostProfitCard({
  partners,
  buckets,
  totals,
  loading = false,
}: {
  partners: readonly { contract_amount: number | null; status: string }[]
  buckets: readonly Pick<SettlementBucket, 'quote_amount'>[]
  totals: Pick<SettlementTotals, 'totalActual'>
  loading?: boolean
}) {
  const p = hostProfit(partners, buckets, totals)
  return (
    <section className="ui-card px-[18px] py-4" data-testid="host-profit" aria-labelledby="host-profit-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="host-profit-title" className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
          주최형 손익
          <InfoTip text={HOST_PROFIT_HELP} />
        </h2>
        <span className="t-caption text-ink-sub" data-testid="host-profit-basis">
          {loading ? '파트너 계약액 불러오는 중…' : `파트너 ${p.partnerCount}곳 계약액 기준 · 내부 전용`}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="수입 (파트너 계약액)" value={p.revenue} testId="host-profit-revenue" />
        <Tile label="지출 예산 (버킷 견적 합)" value={p.budget} testId="host-profit-budget" />
        <Tile label="실집행" value={p.actual} testId="host-profit-actual" />
        <Tile label="손익 (수입 − 실집행)" value={p.profitActual} tone={p.profitActual < 0 ? 'negative' : 'ink'} testId="host-profit-result" />
      </dl>
      <p className="t-caption mt-2 text-ink-sub" data-testid="host-profit-note">
        {p.partnerCount === 0
          ? '파트너 계약액이 아직 없습니다 — 파트너 보드에서 파트너와 계약액을 등록하면 수입에 잡힙니다.'
          : `예산 기준 손익 ${num(p.profitPlanned)}원 (수입 − 지출 예산)${p.actual === 0 ? ' · 실집행이 아직 없어 실집행 기준 손익은 수입과 같습니다' : ''}`}
      </p>
    </section>
  )
}
