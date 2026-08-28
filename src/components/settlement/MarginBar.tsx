// 마진 구성 3분할 막대 (설계서 v2.2 §19.1 · Phase 3.14b / 3.17b 시안 정렬)
//
// 최종 마진이 **어디서 나왔는지**를 한 줄로 보여준다:
//   변동(항목 마크업) + 고정(원가 없는 버킷 = PCO 기획료 · RSVP 운영비)
// 색은 패턴 기준 시트 §07 스택 막대 규격 그대로 accent 3단(accent-deep → accent → role-reg)이며
// **새 색을 만들지 않는다** — 세 색 전부 tokens.css에 있는 유틸리티 클래스를 쓴다.
//
// 3.17b: 카드 껍데기를 걷어내고 막대 + 범례만 남긴다. 검산과 한 카드로 합쳐지는 곳은
// MarginSummaryCard이며(시안 '정산보드.dc.html'), 이 파일은 그 안의 좌측 절반이다.
import type { SettlementTotals } from '../../lib/settlement'

/** 패턴 §07 스택 막대 램프 — 3단 초과 금지. 4번째부터는 램프를 늘리지 않고 순환한다 */
const SEGMENT_CLASSES = ['bg-accent-deep', 'bg-accent', 'bg-role-reg'] as const

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
    <div aria-label="마진 구성">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-caption">최종 마진이 어디서 났는가</p>
        <p className="text-sm text-ink-sub">
          합계 <span className="font-semibold text-ink">{krw(totals.finalMargin)}</span>
        </p>
      </div>

      {/* §07 스택 막대 — 12px · r999 */}
      <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-track">
        {segments.map((s, i) => (
          <div
            key={s.key}
            data-testid={`margin-seg-${s.key}`}
            title={`${s.label} ${krw(s.amount)}`}
            className={SEGMENT_CLASSES[i % SEGMENT_CLASSES.length]}
            style={{ width: span === 0 ? '0%' : `${(positive[i] / span) * 100}%` }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-[3px] ${SEGMENT_CLASSES[i % SEGMENT_CLASSES.length]}`}
            />
            <span className="text-ink-sub">{s.label}</span>
            <span className={s.amount < 0 ? 'font-medium text-negative' : 'font-medium text-ink'}>
              {krw(s.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
