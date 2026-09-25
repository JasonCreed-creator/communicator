// 버킷별 집행 표 — 디자인지시서 v1.4 §7-2.11(PR-7 · 캔버스 '정산보드 — 금액 색은 의미대로').
//
//   · 원가 있는 버킷이 먼저, 그다음 그룹행 **'원가 없는 항목 — 발주·실집행을 받지 않습니다'** 아래에 원가 없는 버킷
//     (PCO 기획료 · RSVP 운영비 · 리드젠 — 들여 쓰기, 발주·실집행·집행률 칸은 '—'). 숨기지 않는다(R-S4·R-S5)
//   · 버킷 이름 = 펼침 단추(▸/▾ · aria-expanded — 키보드로도 연다) + 배지(견적 초과 = 주의 · 추가 버킷 · 마진 계산 밖)
//   · 집행률 = 칸 안 64px 막대 + 옆 수치 한 줄(초과 = negative 막대·수치). 셀 내 막대는 이 열에만(§05 조건 4)
//   · 금액 색은 의미대로 — 기본 ink, 초과로 음수가 된 마크업만 negative. 행 전체 배경으로 물들이지 않는다
//   · 정렬 화살표 없음(버킷 순서 = 견적 순서) · 합계 = 고정 하단행
// 금액 계산은 하지 않는다 — lib/settlement가 준 값을 배치만 한다(마진 식 불변 · §19.1).
import { Fragment, useState, type ReactNode } from 'react'
import DensityToggle from '../internal/DensityToggle'
import { LevelBadge } from '../internal/StatusBadge'
import type { SettlementTotals } from '../../lib/settlement'
import type { SettlementBucketView } from '../../types/views'

function num(n: number): string {
  return n.toLocaleString('ko-KR')
}

function pct(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
}

/** 집행률 = 실집행 ÷ 견적. 원가 없음·견적 0(새 추가 버킷)이면 판정하지 않는다 */
function spendRate(view: SettlementBucketView): number | null {
  if (!view.bucket.has_cost) return null
  if (view.bucket.quote_amount === 0) return null
  return view.actual / view.bucket.quote_amount
}

/** 칸 안 막대 + 수치 한 줄 — 초과분은 100%에서 잘리고 색으로 알린다 */
function SpendCell({ rate, over }: { rate: number | null; over: boolean }) {
  if (rate == null) return <span className="text-ink-cap">—</span>
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-[3px] bg-track">
        <span
          data-testid="spend-bar"
          className={`block h-1.5 rounded-[3px] ${over ? 'bg-negative' : 'bg-accent'}`}
          style={{ width: `${Math.min(100, Math.round(rate * 1000) / 10)}%` }}
        />
      </span>
      <span className={`ui-num text-[13px] ${over ? 'text-negative' : 'text-ink-sub'}`}>{pct(rate)}</span>
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-ink-sub transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export default function SettlementBucketTable({
  buckets,
  totals,
  contractTotal,
  expandedId,
  onToggleExpand,
  renderExpanded,
  action,
}: {
  buckets: SettlementBucketView[]
  totals: SettlementTotals
  /** 전 버킷 견적 합(마진 밖 포함) — 합계행의 견적 칸 */
  contractTotal: number
  expandedId: string | null
  onToggleExpand: (bucketId: string) => void
  renderExpanded: (view: SettlementBucketView) => ReactNode
  /** 카드 머리 오른쪽 동작(버킷 추가 등) */
  action?: ReactNode
}) {
  const [dense, setDense] = useState(false)

  const costRows = buckets.filter((b) => b.bucket.has_cost)
  const noCostRows = buckets.filter((b) => !b.bucket.has_cost)

  // 합계행 집행률 — 원가 있는 버킷의 견적 대비 실집행(행 값들의 가중 평균)
  const costQuote = costRows.reduce((s, b) => s + b.bucket.quote_amount, 0)
  const avgSpend = costQuote === 0 ? null : totals.totalActual / costQuote

  const row = (b: SettlementBucketView) => {
    // 원가 없는 버킷은 발주 항목을 받지 않아 펼칠 것이 없다 — 이미 항목이 있을 때만 연다(자료를 숨기지 않게)
    const expandable = b.bucket.has_cost || b.items.length > 0
    const open = expandable && expandedId === b.bucket.id
    const inBase = b.bucket.is_margin_base
    const rate = spendRate(b)
    const negativeMarkup = inBase && b.markup < 0
    const panelId = `bucket-panel-${b.bucket.id}`
    return (
      <Fragment key={b.bucket.id}>
        <tr
          data-testid={`bucket-row-${b.bucket.code}`}
          data-muted={!b.bucket.has_cost || !inBase ? 'true' : undefined}
          data-open={open || undefined}
          onClick={expandable ? () => onToggleExpand(b.bucket.id) : undefined}
          className={expandable ? 'cursor-pointer' : undefined}
          // 펼친 버킷 = 고른 행 면 — 스티키 첫 열이 background:inherit라 tr에 인라인으로 건다
          style={open ? { background: 'var(--accent-tint)' } : undefined}
        >
          <td title={b.bucket.label}>
            <span className={`flex min-w-0 items-center gap-2 ${expandable ? '' : 'pl-[22px]'}`}>
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? panelId : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand(b.bucket.id)
                  }}
                  className="inline-flex min-w-0 items-center gap-2 text-left font-semibold text-ink hover:underline"
                >
                  <Chevron open={open} />
                  <span className="truncate">{b.bucket.label}</span>
                </button>
              ) : (
                <span className="truncate font-semibold text-ink">{b.bucket.label}</span>
              )}
              {b.over_budget && <LevelBadge level="attention" label="견적 초과" />}
              {!inBase && <LevelBadge level="neutral" label="마진 계산 밖" />}
              {b.bucket.source === 'custom' && <LevelBadge level="neutral" label="추가 버킷" />}
            </span>
          </td>
          <td className="ui-num text-ink">{num(b.bucket.quote_amount)}</td>
          <td className={`ui-num ${b.bucket.has_cost ? 'text-ink' : 'text-ink-cap'}`}>{b.bucket.has_cost ? num(b.ordered) : '—'}</td>
          <td className={`ui-num ${b.bucket.has_cost ? 'text-ink' : 'text-ink-cap'}`}>{b.bucket.has_cost ? num(b.actual) : '—'}</td>
          <td>
            <SpendCell rate={rate} over={b.over_budget} />
          </td>
          <td className={`ui-num font-semibold ${negativeMarkup ? 'text-negative' : inBase ? 'text-ink' : 'text-ink-cap'}`}>
            {inBase ? num(b.markup) : '—'}
          </td>
          <td className={`ui-num ${negativeMarkup ? 'text-negative' : inBase ? 'text-ink' : 'text-ink-cap'}`}>
            {inBase ? pct(b.markup_rate) : '—'}
          </td>
        </tr>
        {open && (
          <tr data-testid={`bucket-panel-${b.bucket.code}`}>
            {/* 펼침 행 — 표 정본의 nowrap·ellipsis(§05 규칙 07)·스티키는 한 줄 셀용이라 이 칸에서만 푼다
                (클래스는 .ui-table 셀 규칙에 특이도로 밀려 인라인으로 지정) */}
            <td
              id={panelId}
              colSpan={7}
              className="p-0"
              style={{ whiteSpace: 'normal', overflow: 'visible', position: 'static', borderRight: 'none', fontWeight: 400 }}
            >
              {renderExpanded(b)}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <section className="ui-card overflow-hidden" aria-label="버킷별 집행">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="t-card-title">버킷별 집행</h2>
          <span className="t-caption">단위 원 · 부가세 별도 · 버킷을 누르면 발주 항목이 열립니다</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DensityToggle dense={dense} onChange={setDense} />
          {action}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`ui-table min-w-[1010px] table-fixed text-sm ${dense ? 'ui-table-dense' : ''}`}>
          <colgroup>
            <col />
            <col className="w-[128px]" />
            <col className="w-[128px]" />
            <col className="w-[128px]" />
            <col className="w-[150px]" />
            <col className="w-[128px]" />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="ui-th">버킷</th>
              <th className="ui-th ui-num">견적</th>
              <th className="ui-th ui-num">발주</th>
              <th className="ui-th ui-num">실집행</th>
              <th className="ui-th">집행률</th>
              <th className="ui-th ui-num">마크업</th>
              <th className="ui-th ui-num">마크업률</th>
            </tr>
          </thead>
          <tbody>
            {costRows.map(row)}
            {noCostRows.length > 0 && (
              <tr className="ui-table-group" data-testid="no-cost-group">
                <td colSpan={7} className="static border-r-0">
                  원가 없는 항목 — 발주·실집행을 받지 않습니다
                </td>
              </tr>
            )}
            {noCostRows.map(row)}

            {/* 09 합계·소계는 고정 하단행 + border-strong 상단선 */}
            <tr className="ui-table-total">
              <td>합계</td>
              <td className="ui-num">{num(contractTotal)}</td>
              <td className="ui-num">{num(totals.totalOrdered)}</td>
              <td className="ui-num">{num(totals.totalActual)}</td>
              <td className="text-xs font-normal text-ink-sub">평균 {pct(avgSpend)}</td>
              <td className={`ui-num ${totals.finalMargin < 0 ? 'text-negative' : ''}`}>{num(totals.finalMargin)}</td>
              <td className="ui-num">{pct(totals.marginRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
