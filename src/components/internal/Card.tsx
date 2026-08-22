import type { ReactNode } from 'react'

interface CardProps {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** 내부 화면 공용 카드 — §5: --card + 1px --border + r12 + 그림자 1단계.
 *  헤더에 카드 타이틀(16/600)·우측 액션 슬롯. 카드 안 카드 금지(면 분리는 --canvas 인셋). */
export default function Card({ title, action, children, className = '' }: CardProps) {
  return (
    <div className={`ui-card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="t-card-title">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
