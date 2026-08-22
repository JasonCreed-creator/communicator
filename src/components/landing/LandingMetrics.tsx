// 랜딩 유입 지표 (v2.1 §4-22) — KPI 4장 + 일자별 막대.
// mock에선 픽스처 수치를 그리고, Phase 4에서 같은 모양으로 GA Data API 응답을 받는다.
// 차트는 외부 라이브러리 없이 CSS 막대로 그린다(번들·의존 원칙 유지).
import { useMemo } from 'react'
import type { LandingDailyMetric } from '../../types/entities'

function sum(rows: LandingDailyMetric[], key: keyof LandingDailyMetric): number {
  return rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)
}

function pct(n: number, d: number): string {
  if (!d) return '—'
  return `${((n / d) * 100).toFixed(1)}%`
}

function Kpi({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="ui-card p-4">
      <p className="t-caption">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</p>
      {caption && <p className="mt-0.5 text-xs text-ink-cap">{caption}</p>}
    </div>
  )
}

export default function LandingMetrics({ rows }: { rows: LandingDailyMetric[] }) {
  const totals = useMemo(() => {
    const views = sum(rows, 'views')
    const uniques = sum(rows, 'unique_visitors')
    const starts = sum(rows, 'form_starts')
    const submits = sum(rows, 'submits')
    return { views, uniques, starts, submits }
  }, [rows])

  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.views)), [rows])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-sub">
        아직 수집된 지표가 없습니다. GA 측정 ID를 넣고 랜딩을 발행하면 유입이 쌓입니다.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="페이지뷰" value={totals.views.toLocaleString()} caption={`최근 ${rows.length}일`} />
        <Kpi label="순 방문자" value={totals.uniques.toLocaleString()} />
        <Kpi
          label="폼 열람"
          value={totals.starts.toLocaleString()}
          caption={`열람률 ${pct(totals.starts, totals.views)}`}
        />
        <Kpi
          label="신청 완료"
          value={totals.submits.toLocaleString()}
          caption={`전환율 ${pct(totals.submits, totals.views)}`}
        />
      </div>

      {/* 일자별 추이 — 막대 높이는 페이지뷰, 진한 부분이 신청 완료 */}
      <div className="ui-card p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-ink">일자별 유입</p>
          <p className="t-caption">막대 = 페이지뷰 · 진한 부분 = 신청 완료</p>
        </div>
        <div className="mt-4 flex h-32 items-end gap-[3px]">
          {rows.map((r) => {
            const h = Math.round((r.views / max) * 100)
            const sub = r.views ? Math.round((r.submits / r.views) * 100) : 0
            return (
              <div
                key={r.date}
                className="flex-1 rounded-t bg-track"
                style={{ height: `${Math.max(4, h)}%` }}
                title={`${r.date} · 뷰 ${r.views} · 신청 ${r.submits}`}
              >
                <div
                  className="w-full rounded-t bg-accent"
                  style={{ height: `${Math.min(100, Math.max(sub * 3, r.submits ? 8 : 0))}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-cap">
          <span>{rows[0]?.date}</span>
          <span>{rows[rows.length - 1]?.date}</span>
        </div>
      </div>
    </div>
  )
}
