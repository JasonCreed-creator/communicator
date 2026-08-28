// S8 '지금 필요한 것' 카드 — 고객사가 지금 해야 하는 일 한 장.
// 외부 지면 규격: 액션은 44px(h-11) 풀폭 1개, btn-sm 금지. accent는 실제 대기 건이 있을 때만.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export default function ClientActionCard({
  title,
  body,
  badge,
  actionLabel,
  to,
  tone,
}: {
  title: string
  body: string
  badge?: ReactNode
  actionLabel: string
  to: string
  /** accent = 지금 처리할 것이 남아 있음 (화면당 1개) */
  tone: 'accent' | 'neutral'
}) {
  return (
    <article className={`ui-card p-4 ${tone === 'accent' ? 'border-accent' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-card-title">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-sub">{body}</p>
        </div>
        {badge}
      </div>
      <Link
        to={to}
        className={`btn ${tone === 'accent' ? 'btn-accent' : 'btn-ghost'} mt-3.5 h-11 w-full`}
      >
        {actionLabel}
      </Link>
    </article>
  )
}
