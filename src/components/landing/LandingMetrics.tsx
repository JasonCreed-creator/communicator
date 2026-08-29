// 랜딩 유입 지표 (v2.1 §4-22) — KPI 4장 + 일자별 막대.
// mock에선 픽스처 수치를 그리고, Phase 4에서 같은 모양으로 GA Data API 응답을 받는다.
// 차트는 외부 라이브러리 없이 CSS 막대로 그린다(번들·의존 원칙 유지).
//
// 3.17b 시안 정렬('랜딩보드 · 견적.dc.html' + 패턴 기준 시트 §07):
//  · KPI = StatTile 정본 — 숫자 31/650 + 캡션 + **보조 수치 1줄**(구분선 위).
//    폼 열람·신청 완료는 보조 수치에 미니바(ProgressBar 6px)를 붙여 '1,146'이 '열람률 13.6%'로 읽히게 한다.
//  · 일자별 막대에 **범례 + 4점 축 라벨 + 최고점 해설**을 붙인다(기존엔 양 끝 날짜뿐이었다).
import { useMemo } from 'react'
import ProgressBar from '../internal/ProgressBar'
import StatTile from '../internal/StatTile'
import { formatDate } from '../../lib/labels'
import type { LandingDailyMetric } from '../../types/entities'

function sum(rows: LandingDailyMetric[], key: keyof LandingDailyMetric): number {
  return rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)
}

function pct(n: number, d: number): string {
  if (!d) return '—'
  return `${((n / d) * 100).toFixed(1)}%`
}

/** 보조 수치 1줄 + 미니바 — 바 아래 줄에 수치(§07: 수치는 항상 바 아래 줄) */
function SupportBar({
  done,
  total,
  text,
  testId,
}: {
  done: number
  total: number
  text: string
  testId: string
}) {
  return (
    <>
      <ProgressBar done={done} total={total} hideValue />
      <span className="mt-1.5 block" data-testid={testId}>
        {text}
      </span>
    </>
  )
}

/** 축 라벨 4점 — 첫·1/3·2/3·끝 (행이 4일 미만이면 중복 지점을 접는다) */
export function axisIndexes(length: number): number[] {
  if (length <= 0) return []
  const last = length - 1
  const raw = [0, Math.round(last / 3), Math.round((last * 2) / 3), last]
  return [...new Set(raw)]
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
  const peak = useMemo(
    () => rows.reduce<LandingDailyMetric | null>((best, r) => (!best || r.views > best.views ? r : best), null),
    [rows],
  )
  const axis = useMemo(() => axisIndexes(rows.length), [rows.length])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-sub">
        아직 수집된 지표가 없습니다. GA 측정 ID를 넣고 랜딩을 발행하면 유입이 쌓입니다.
      </p>
    )
  }

  const dailyAvg = Math.round(totals.views / rows.length)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="페이지뷰"
          value={totals.views.toLocaleString()}
          support={
            <span data-testid="kpi-support-views">
              최근 {rows.length}일 · 일평균 {dailyAvg.toLocaleString()}
            </span>
          }
        />
        <StatTile
          label="순 방문자"
          value={totals.uniques.toLocaleString()}
          support={
            <span data-testid="kpi-support-uniques">
              페이지뷰 대비 {pct(totals.uniques, totals.views)}
            </span>
          }
        />
        <StatTile
          label="폼 열람"
          value={totals.starts.toLocaleString()}
          support={
            <SupportBar
              done={totals.starts}
              total={totals.views}
              text={`열람률 ${pct(totals.starts, totals.views)}`}
              testId="kpi-support-starts"
            />
          }
        />
        <StatTile
          label="신청 완료"
          value={totals.submits.toLocaleString()}
          tone="accent"
          support={
            <SupportBar
              done={totals.submits}
              total={totals.starts}
              text={`폼 열람 대비 ${pct(totals.submits, totals.starts)} · 전체 ${pct(totals.submits, totals.views)}`}
              testId="kpi-support-submits"
            />
          }
        />
      </div>

      {/* 일자별 추이 — 막대 높이는 페이지뷰, 진한 부분이 신청 완료 */}
      <div className="ui-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">일자별 유입</p>
          {/* 범례 — 색만으로 구분하지 않도록 라벨 텍스트를 항상 동반한다 */}
          <ul className="flex items-center gap-3.5" data-testid="daily-legend">
            <li className="flex items-center gap-1.5 text-xs text-ink-sub">
              <span aria-hidden className="size-2.5 rounded-[2px] bg-track" />
              페이지뷰
            </li>
            <li className="flex items-center gap-1.5 text-xs text-ink-sub">
              <span aria-hidden className="size-2.5 rounded-[2px] bg-accent" />
              신청 완료
            </li>
          </ul>
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
        {/* 4점 축 라벨 — 양 끝만 있던 축을 등간격 4점으로 */}
        <div
          className="mt-2 flex justify-between border-t border-border pt-2 text-[11px] text-ink-cap"
          data-testid="daily-axis"
        >
          {axis.map((i) => (
            <span key={rows[i].date}>{formatDate(rows[i].date)}</span>
          ))}
        </div>
        {peak && (
          <p className="mt-2.5 text-xs leading-relaxed text-ink-cap" data-testid="daily-peak">
            최고점 {formatDate(peak.date)} · 뷰 {peak.views.toLocaleString()} · 신청{' '}
            {peak.submits.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
