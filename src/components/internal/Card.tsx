import type { ReactNode } from 'react'

interface CardProps {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** 내부 화면 공용 카드 — 흰 배경 + 얇은 테두리, 헤더에 제목·우측 액션 슬롯 */
export default function Card({ title, action, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
