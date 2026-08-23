// 마진 구성 3분할 막대 (설계서 v2.2 §19.1 · Phase 3.14b)
//
// 최종 마진이 **어디서 나왔는지**를 한 줄로 보여준다:
//   변동(항목 마크업) + 고정(원가 없는 버킷 = PCO 기획료 · RSVP 운영비)
// 색은 accent 계열 순차 3단이며 **새 색을 만들지 않는다** — 세 번째 단계는 토큰이 없는
// 밝은 accent라 인라인 리터럴로만 쓴다(디자인지시서 개정 없이 tokens.css를 늘리지 않기 위함).
import type { SettlementTotals } from '../../lib/settlement'

const SEGMENT_COLORS = ['var(--accent-deep)', 'var(--accent)', '#F3B48A']

function krw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

export interface MarginSegment {
  key: string
  label: string
  amount: number
}

/** 3분할 세그먼트 — 변동이 먼저, 고정 버킷이 견적 순서대로 뒤따른다 */
export function marginSegments(totals: SettlementTotals): MarginSegment[] {
  return [
    { key: 'variable', label: '항목 마크업', amount: totals.variableMarkup },
    ...totals.fixedByBucket.map((f) => ({ key: f.code, label: f.label, amount: f.amount })),
  ]
}

export default function MarginBar({ totals }: { totals: SettlementTotals }) {
  const segments = marginSegments(totals)
  // 견적 초과로 변동분이 음수면 막대에 폭을 줄 수 없다 — 폭은 0으로 두고 범례에 음수를 적는다
  const positive = segments.map((s) => Math.max(0, s.amount))
  const span = positive.reduce((a, b) => a + b, 0)

  return (
    <section className="ui-card p-5" aria-label="마진 구성">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-section-title">마진 구성</h2>
        <p className="text-sm text-ink-sub">
          최종 마진 <span className="font-semibold text-ink">{krw(totals.finalMargin)}</span>
        </p>
      </div>

      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-track">
        {segments.map((s, i) => (
          <div
            key={s.key}
            data-testid={`margin-seg-${s.key}`}
            title={`${s.label} ${krw(s.amount)}`}
            style={{
              width: span === 0 ? '0%' : `${(positive[i] / span) * 100}%`,
              background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            <span className="text-ink-sub">{s.label}</span>
            <span className={s.amount < 0 ? 'font-medium text-negative' : 'font-medium text-ink'}>
              {krw(s.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
