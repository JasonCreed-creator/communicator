import type { ReactNode } from 'react'

/** 내부 화면 공통 페이지 헤더 — §4: 캡션 라벨 → 타이틀 25 → 우측 액션 버튼 */
export default function PageHeader({
  caption,
  title,
  action,
}: {
  caption: string
  title: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="t-caption">{caption}</p>
        <h1 className="t-page-title mt-1">{title}</h1>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
