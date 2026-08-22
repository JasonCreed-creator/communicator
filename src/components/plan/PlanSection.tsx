import type { ReactNode } from 'react'
import SectionProgressBar from './SectionProgressBar'
import type { SectionProgressData } from './planSections'

interface PlanSectionProps {
  number: string
  title: string
  progress?: SectionProgressData
  /** pm·ops 전용 편집 버튼 등 — 인쇄 시 숨김(plan-print-hidden)은 호출부가 부여 */
  action?: ReactNode
  children: ReactNode
}

/**
 * S9 섹션 공통 컨테이너 — 넘버링(①~⑥) 헤더 + 섹션 진행률 + 인쇄 시 섹션 중간 끊김 방지.
 * `plan-section` 클래스가 src/index.css의 `break-inside: avoid` 인쇄 규칙 대상이다 (DoD-9).
 */
export default function PlanSection({ number, title, progress, action, children }: PlanSectionProps) {
  return (
    <section className="plan-section rounded-lg border border-gray-200 bg-white p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <h2 className="flex items-baseline gap-2 text-base font-bold text-gray-900">
          <span className="text-gray-400">{number}</span>
          <span>{title}</span>
        </h2>
        <div className="flex items-center gap-3">
          {progress && <SectionProgressBar done={progress.done} total={progress.total} />}
          {action}
        </div>
      </header>
      {children}
    </section>
  )
}
