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
 * S9 섹션 공통 컨테이너 — 넘버링(①~⑦, 브라운 대형) 헤더 + 섹션 진행률(우측 캡션) + 인쇄 시
 * 섹션 중간 끊김 방지. `plan-section` 클래스가 src/index.css의 `break-inside: avoid` 인쇄 규칙
 * 대상이다 (DoD-9). 종이 메타포 — 시트(.plan-doc) 내부는 하단 헤어라인으로만 구분하고
 * 별도 카드 박스를 두지 않는다(§5 카드 안 카드 금지).
 */
export default function PlanSection({ number, title, progress, action, children }: PlanSectionProps) {
  return (
    <section className="plan-section border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <h2 className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-brown sm:text-[28px]">{number}</span>
          <span className="t-section-title">{title}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {progress && <SectionProgressBar done={progress.done} total={progress.total} />}
          {action}
        </div>
      </header>
      {children}
    </section>
  )
}
