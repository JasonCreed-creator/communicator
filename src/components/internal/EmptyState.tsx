import type { ReactNode } from 'react'

/** 빈 상태 — §5: 중앙 아이콘(--ink-cap) + 한 줄 설명 + ghost CTA(옵션) */
export default function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-8 text-ink-cap"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      </svg>
      <p className="text-sm text-ink-sub">{message}</p>
      {action}
    </div>
  )
}
