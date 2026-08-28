// S9 발행 게이트 — 시트 위 한 줄에 문서 상태·버전·최종 수정자 + [인쇄 · PDF] + [컨펌 발송].
// 미입력 섹션이 하나라도 있으면 컨펌 발송을 잠근다(인쇄는 항상 허용) — 잠긴 이유는 InfoTip과
// 하단 경고 띠에서 밝힌다. 관리 UI이므로 인쇄에서는 통째로 빠진다.
import { useState } from 'react'
import InfoTip from '../internal/InfoTip'
import { LevelBadge } from '../internal/StatusBadge'
import PrintExcludedChip from './PrintExcludedChip'
import { planSectionAnchor, type PlanSectionStatus } from './planSections'

const LOCK_HELP =
  '미입력 섹션이 있으면 컨펌 발송이 열리지 않습니다. 인쇄·PDF는 언제든 가능합니다.'

const SEND_NOTICE =
  '컨펌 발송은 문서 스냅숏 발행(서버 이식) 후 열립니다 — 지금은 인쇄 · PDF로 내려받아 전달하세요.'

export default function PlanPublishGate({
  docStateLabel,
  locked,
  blocking,
  versionLabel,
  printedAt,
  authorLabel,
  onPrint,
}: {
  docStateLabel: string
  locked: boolean
  /** 미입력이라 발송을 막는 섹션들(첫 항목으로 이동 링크를 건다) */
  blocking: PlanSectionStatus[]
  versionLabel: string
  printedAt: string
  authorLabel: string
  onPrint: () => void
}) {
  const [notice, setNotice] = useState(false)
  const first = blocking[0]

  return (
    <div className="ui-card print-hidden overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <LevelBadge
            level={locked ? 'progress' : 'positive'}
            prefix="문서"
            label={docStateLabel}
          />
          <span className="truncate text-[13px] text-ink-sub">
            {versionLabel} · {printedAt} 출력 · {authorLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PrintExcludedChip />
          <button type="button" onClick={onPrint} className="btn btn-ghost print-hidden">
            인쇄 · PDF
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setNotice(true)}
            className="btn btn-accent print-hidden"
          >
            컨펌 발송
          </button>
          {locked && <InfoTip text={LOCK_HELP} />}
        </div>
      </div>

      {locked && first && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border bg-negative-tint px-5 py-2.5">
          <span className="text-[13px] leading-relaxed text-negative">
            <strong className="font-semibold">
              {first.meta.number} {first.meta.title}이(가) 비어 있습니다.
            </strong>{' '}
            미입력 섹션이 있으면 컨펌 발송이 열리지 않습니다 — 인쇄는 가능합니다.
          </span>
          <a
            href={`#${planSectionAnchor(first.key)}`}
            className="shrink-0 text-[13px] font-medium text-negative underline"
          >
            해당 섹션으로 이동 →
          </a>
        </div>
      )}

      {notice && (
        <p className="border-t border-border bg-canvas px-5 py-2.5 text-[13px] leading-relaxed text-ink-sub">
          {SEND_NOTICE}
        </p>
      )}
    </div>
  )
}
