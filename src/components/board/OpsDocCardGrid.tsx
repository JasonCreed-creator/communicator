// P11(3.16.2) 운영보드 유형 카드 4종 — 시각 정본 = v2.5 목업 화면 A + 시안 `디자인 · 운영 보드`.
// 카드 구조: 아이콘+이름 → 한 줄 설명(ink-cap·12px, min-h로 4카드 정렬) →
//   **진행 막대**(3.17b 정렬) → 하단 요약(건수 · 대표 상태 · 확정 n/m).
// 진행 막대는 "3건"이 "3건 중 확정 2"로 읽히게 하려고 넣는다 — 건수만으로는 진척이 안 보였다.
// 클릭 = 그 유형 선택(재클릭 해제). 선택 스타일은 P10 그대로(주황 테두리 + 틴트 링).
import InfoTip from '../internal/InfoTip'
import ProgressBar from '../internal/ProgressBar'
import { OPS_DOC_CARD_HELP } from '../../lib/helpTexts'
import {
  OPS_DOC_CARD_BLURBS,
  OPS_DOC_CARD_ICONS,
  OPS_DOC_CARD_LABELS,
  STATUS_LABELS,
} from '../../lib/labels'
import type { DeliverableStatus } from '../../types/enums'
import { OPS_DOC_CARD_ORDER, type OpsDocCardKey } from './opsDocCards'

export interface OpsDocCardSummary {
  key: OpsDocCardKey
  count: number
  /** 가장 최근 수정된 항목의 상태 — 카드 하단 "n건 · 대표 상태"의 뒷부분 */
  latestStatus: DeliverableStatus | null
  /** 확정(final) 건수 — 진행 막대와 "확정 n/m" 캡션의 분자 */
  doneCount: number
}

export default function OpsDocCardGrid({
  summaries,
  selected,
  onSelect,
}: {
  summaries: OpsDocCardSummary[]
  selected: OpsDocCardKey | null
  onSelect: (key: OpsDocCardKey | null) => void
}) {
  const byKey = new Map(summaries.map((s) => [s.key, s]))

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {OPS_DOC_CARD_ORDER.map((key) => {
        const summary = byKey.get(key) ?? { key, count: 0, latestStatus: null, doneCount: 0 }
        const active = selected === key
        return (
          // InfoTip은 자체 <button>이라 카드 전체를 <button>으로 감싸면 버튼 중첩(무효 HTML)이
          // 된다 — 바깥은 위치 기준 <div>, 선택 동작은 그 안의 별도 <button>, InfoTip은 형제로 둔다.
          <div
            key={key}
            data-testid={`ops-doc-card-${key}`}
            className={`relative rounded-[10px] border p-4 transition-colors ${
              active
                ? 'border-accent bg-accent-tint ring-2 ring-accent-tint'
                : 'border-border bg-card hover:bg-track'
            }`}
          >
            <button
              type="button"
              aria-pressed={active}
              // 버튼 안 설명·요약 텍스트가 접근성 이름에 섞이지 않도록 라벨을 명시한다
              // (시각 텍스트는 아래 그대로 — 스크린리더·테스트만 이 이름을 쓴다).
              aria-label={OPS_DOC_CARD_LABELS[key]}
              onClick={() => onSelect(active ? null : key)}
              className="block w-full cursor-pointer text-left"
            >
              {/* 라벨은 아이콘과 별개 노드로 둔다 — 카드 이름을 그대로 읽을 수 있게 */}
              <span className="t-card-title flex items-center gap-1.5 pr-5">
                <span aria-hidden>{OPS_DOC_CARD_ICONS[key]}</span>
                <span>{OPS_DOC_CARD_LABELS[key]}</span>
              </span>
              <span className="mt-1 block min-h-[32px] text-xs leading-snug text-ink-cap">
                {OPS_DOC_CARD_BLURBS[key]}
              </span>
              {/* 진행 막대 — 패턴 §07(6px · r3 · track/accent, 100%는 positive).
                  수치는 아래 요약 줄이 담으므로 바 자체의 수치 라벨은 끈다. */}
              <span data-testid={`ops-doc-card-progress-${key}`} className="mt-2.5 block">
                <ProgressBar done={summary.doneCount} total={summary.count} hideValue />
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* 건수는 단독 텍스트 노드로 둔다 — 카드 요약 계약(건수)을 그대로 읽을 수 있게 */}
                <span className="text-sm font-semibold text-ink">{summary.count}건</span>
                <span aria-hidden className="text-xs text-ink-cap">
                  ·
                </span>
                <span className="t-caption">
                  {summary.latestStatus ? STATUS_LABELS[summary.latestStatus] : '항목 없음'}
                </span>
                {summary.count > 0 && (
                  <>
                    <span aria-hidden className="text-xs text-ink-cap">
                      ·
                    </span>
                    <span className="t-caption">
                      확정 {summary.doneCount}/{summary.count}
                    </span>
                  </>
                )}
              </span>
            </button>
            <span className="absolute right-3 top-3">
              <InfoTip text={OPS_DOC_CARD_HELP[key]} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
