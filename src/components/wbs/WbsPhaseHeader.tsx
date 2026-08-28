// S5 간트 단계 그룹 헤더 — 패턴 기준 시트 §07(진행률 바 6px·수치 동반) + 시안 '일정 · WBS 보드'.
// 단계 이름 + 진행 막대(72px) + '완료 n/m' + 지연·임박 배지. 접힌 채로도 어느 단계가 막혔는지 읽히게 한다.
import { LevelBadge } from '../internal/StatusBadge'
import ProgressBar from '../internal/ProgressBar'
import type { PhaseSummary } from './wbsFormat'

export default function WbsPhaseHeader({
  phaseNo,
  phaseName,
  summary,
}: {
  phaseNo: number
  phaseName: string
  summary: PhaseSummary
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
      <h3 className="text-xs font-semibold text-brown">
        {phaseNo}. {phaseName}
      </h3>
      {/* 진행 막대는 72px 고정 — 수치는 바 옆 줄에 두므로 ProgressBar 자체 수치는 끈다 */}
      <div className="w-[72px] shrink-0">
        <ProgressBar done={summary.done} total={summary.total} hideValue />
      </div>
      <span className="shrink-0 text-[11px] text-ink-cap">
        완료 {summary.done}/{summary.total}
      </span>
      {summary.delayed > 0 && <LevelBadge level="blocked" label={`지연 ${summary.delayed}`} />}
      {summary.imminent > 0 && <LevelBadge level="attention" label={`임박 ${summary.imminent}`} />}
    </div>
  )
}
