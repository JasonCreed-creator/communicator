// 버킷별 집행 표 — 표 정본 적용 (패턴 기준 시트 §05 / 시안 '정산보드.dc.html' · Phase 3.17b)
//
// 시안이 바꾼 것:
//   · 초과 버킷의 **행 전체 배경(negative-tint)을 걷어낸다** — 행이 붉게 물들면 옆 숫자가 안 읽힌다.
//     초과는 배지(차단 단계) + 집행률·마크업 수치 색으로만 알린다.
//   · 금액은 전부 우측정렬 tabular(.ui-num). **셀 내 막대는 집행률 열에만**(§05 조건 4).
//   · 합계는 border-strong 상단선의 고정 하단행(.ui-table-total).
//   · 원가 없음(has_cost=false)·마진 밖 버킷은 **숨기지 않고** canvas 면으로 가라앉힌다.
//
// 금액 계산은 하지 않는다 — lib/settlement가 준 값을 배치만 한다(마진 식 불변 · §19.1).
import { Fragment, useState, type ReactNode } from 'react'
import DensityToggle from '../internal/DensityToggle'
import SortableTh, { type SortDirection } from '../internal/SortableTh'
import { LevelBadge } from '../internal/StatusBadge'
import type { SettlementTotals } from '../../lib/settlement'
import type { SettlementBucketView } from '../../types/views'

type SortKey = 'label' | 'quote' | 'actual'

function num(n: number): string {
  return n.toLocaleString('ko-KR')
}

function pct(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
}

/** 집행률 = 실집행 ÷ 견적. 견적 0(신규 custom 버킷)이면 판정하지 않는다 */
function spendRate(view: SettlementBucketView): number | null {
  if (!view.bucket.has_cost) return null
  if (view.bucket.quote_amount === 0) return null
  return view.actual / view.bucket.quote_amount
}

/** 셀 내 진행률 막대 — §05 규칙 10(6px + 아래 줄 수치). 초과분은 100%에서 잘리고 색으로 알린다 */
function SpendCell({ rate, over }: { rate: number | null; over: boolean }) {
  if (rate == null) return <span className="text-ink-cap">—</span>
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
        <div
          data-testid="spend-bar"
          className={`h-1.5 rounded-[3px] ${over ? 'bg-negative' : 'bg-accent'}`}
          style={{ width: `${Math.min(100, Math.round(rate * 1000) / 10)}%` }}
        />
      </div>
      <div className={`mt-1 text-right text-xs tabular-nums ${over ? 'text-negative' : 'text-ink-sub'}`}>
        {pct(rate)}
      </div>
    </div>
  )
}

export default function SettlementBucketTable({
  buckets,
  totals,
  contractTotal,
  expandedId,
  onToggleExpand,
  renderExpanded,
  overOnly,
  onClearOverOnly,
  action,
}: {
  buckets: SettlementBucketView[]
  totals: SettlementTotals
  /** 전 버킷 견적 합(마진 밖 포함) — 합계행의 견적 칸 */
  contractTotal: number
  expandedId: string | null
  onToggleExpand: (bucketId: string) => void
  renderExpanded: (view: SettlementBucketView) => ReactNode
  /** 초과 경보 바의 '초과 버킷만 보기'가 켜진 상태 */
  overOnly: boolean
  onClearOverOnly: () => void
  /** 카드 헤더 우측 추가 액션(＋ 버킷 추가 등) */
  action?: ReactNode
}) {
  const [dense, setDense] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const shown = buckets.filter((b) => !overOnly || b.over_budget)
  const rows = sortKey
    ? [...shown].sort((a, b) => {
        const sign = sortDir === 'asc' ? 1 : -1
        if (sortKey === 'label') return a.bucket.label.localeCompare(b.bucket.label, 'ko') * sign
        if (sortKey === 'quote') return (a.bucket.quote_amount - b.bucket.quote_amount) * sign
        return (a.actual - b.actual) * sign
      })
    : shown

  // 합계행 집행률 — 원가 있는 버킷의 견적 대비 실집행(행 값들의 가중 평균)
  const costQuote = buckets
    .filter((b) => b.bucket.has_cost)
    .reduce((s, b) => s + b.bucket.quote_amount, 0)
  const avgSpend = costQuote === 0 ? null : totals.totalActual / costQuote

  return (
    <section className="ui-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="t-card-title">버킷별 집행</h2>
          <span className="t-caption">단위: 원 · 부가세 별도</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DensityToggle dense={dense} onChange={setDense} />
          {action}
        </div>
      </div>

      {overOnly && (
        // ③ 필터 결과 구분 — 전체 건수 + 적용된 필터 + 초기화
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-5 py-2.5 text-sm text-ink-sub print-hidden">
          <span>
            전체 {buckets.length}건 중 {rows.length}건
          </span>
          <LevelBadge level="blocked" label="견적 초과만" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClearOverOnly}>
            필터 초기화
          </button>
        </div>
      )}

      <div className="overflow-x-auto p-5">
        <table className={`ui-table min-w-[880px] text-sm ${dense ? 'ui-table-dense' : ''}`}>
          <thead>
            <tr>
              <SortableTh
                active={sortKey === 'label'}
                direction={sortDir}
                onSort={() => toggleSort('label')}
                className="w-[280px]"
              >
                버킷
              </SortableTh>
              <SortableTh
                active={sortKey === 'quote'}
                direction={sortDir}
                onSort={() => toggleSort('quote')}
                numeric
                className="w-[128px]"
              >
                견적
              </SortableTh>
              <th className="ui-th ui-num w-[128px]">발주</th>
              <SortableTh
                active={sortKey === 'actual'}
                direction={sortDir}
                onSort={() => toggleSort('actual')}
                numeric
                className="w-[128px]"
              >
                실집행
              </SortableTh>
              <th className="ui-th w-[132px]">집행률</th>
              <th className="ui-th ui-num w-[124px]">마크업</th>
              <th className="ui-th ui-num w-[88px]">마크업률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const muted = !b.bucket.has_cost || !b.bucket.is_margin_base
              const open = expandedId === b.bucket.id
              const rate = spendRate(b)
              const money = muted ? 'text-ink-cap' : 'text-ink-sub'
              return (
                <Fragment key={b.bucket.id}>
                  <tr
                    data-testid={`bucket-row-${b.bucket.code}`}
                    data-muted={muted ? 'true' : undefined}
                    onClick={() => onToggleExpand(b.bucket.id)}
                    className="cursor-pointer"
                    // 원가 없음·마진 밖 버킷은 숨기지 않고 canvas 면으로 가라앉힌다.
                    // (스티키 첫 열이 background:inherit라 면은 tr에 인라인으로 고정한다 — 토큰 값만 사용)
                    style={muted ? { background: 'var(--canvas)' } : undefined}
                  >
                    <td title={b.bucket.label}>
                      <span className={`inline-flex flex-wrap items-center gap-2 ${muted ? 'text-ink-sub' : 'text-ink'}`}>
                        <span>{b.bucket.label}</span>
                        {b.over_budget && <LevelBadge level="blocked" label="견적 초과" />}
                        {!b.bucket.has_cost && <LevelBadge level="neutral" label="원가 없음" />}
                        {!b.bucket.is_margin_base && <LevelBadge level="neutral" label="마진 계산 밖" />}
                        {b.bucket.source === 'custom' && <LevelBadge level="neutral" label="추가 버킷" />}
                      </span>
                    </td>
                    <td className={`ui-num ${money}`}>{num(b.bucket.quote_amount)}</td>
                    <td className={`ui-num ${money}`}>{b.bucket.has_cost ? num(b.ordered) : '—'}</td>
                    <td className={`ui-num ${muted ? 'text-ink-cap' : 'font-medium text-ink'}`}>
                      {b.bucket.has_cost ? num(b.actual) : '—'}
                    </td>
                    <td>
                      <SpendCell rate={rate} over={b.over_budget} />
                    </td>
                    <td
                      className={`ui-num font-medium ${
                        b.markup < 0 ? 'text-negative' : muted ? 'text-ink-cap' : 'text-ink'
                      }`}
                    >
                      {b.bucket.is_margin_base ? num(b.markup) : '—'}
                    </td>
                    <td
                      className={`ui-num ${
                        b.markup < 0 ? 'text-negative' : muted ? 'text-ink-cap' : 'text-ink-sub'
                      }`}
                    >
                      {b.bucket.is_margin_base ? pct(b.markup_rate) : '—'}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      {/* 펼침 행 — 표 정본의 nowrap·ellipsis(§05 규칙 07)는 한 줄 셀용이라 이 행에서만 해제한다
                          (클래스는 .ui-table 셀 규칙에 특이도로 밀려 인라인으로 지정) */}
                      <td
                        colSpan={7}
                        className="p-0"
                        style={{
                          whiteSpace: 'normal',
                          overflow: 'visible',
                          position: 'static',
                          borderRight: 'none',
                          fontWeight: 400,
                        }}
                      >
                        {renderExpanded(b)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {/* 09 합계·소계는 고정 하단행 + border-strong 상단선 */}
            <tr className="ui-table-total">
              <td>합계</td>
              <td className="ui-num">{num(contractTotal)}</td>
              <td className="ui-num">{num(totals.totalOrdered)}</td>
              <td className="ui-num">{num(totals.totalActual)}</td>
              <td className="ui-num text-xs font-normal text-ink-sub">평균 {pct(avgSpend)}</td>
              <td className="ui-num">{num(totals.finalMargin)}</td>
              <td className="ui-num">{pct(totals.marginRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
