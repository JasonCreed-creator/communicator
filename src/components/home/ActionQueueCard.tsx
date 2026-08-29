// S1 홈 — 액션 큐 카드 (시안: 홈 대시보드.dc.html).
// 카드 헤더 = 제목 + 건수 배지 / 본문 = '가장 급한 1건' 히어로 블록 + 기한순 행 + 전체 보기 링크.
// 배지는 의미 4단계(패턴 §03), 역할은 형태(도트)로만 표시한다(패턴 §04).
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Card from '../internal/Card'
import DdayBadge from '../internal/DdayBadge'
import EmptyState from '../internal/EmptyState'
import TableSkeleton from '../internal/TableSkeleton'
import { LevelBadge } from '../internal/StatusBadge'
import { ROLE_BAR_CLASSES, ROLE_LABELS, formatDate, type StatusLevel } from '../../lib/labels'
import type { QueueItem } from './queueItems'

export type QueueTone = 'negative' | 'accent' | 'neutral'

/** 히어로 면 — 지연은 negative 보더 + 틴트, 임박은 accent, 미결은 canvas 인셋(시안 그대로). */
const HERO_SURFACE: Record<QueueTone, string> = {
  negative: 'border-negative bg-negative-tint',
  accent: 'border-accent bg-accent-tint',
  neutral: 'border-border bg-canvas',
}

const HERO_LABEL: Record<QueueTone, string> = {
  negative: 'text-negative',
  accent: 'text-accent-deep',
  neutral: 'text-ink-cap',
}

function OwnerLine({ item }: { item: QueueItem }) {
  if (!item.role && !item.owner) return null
  const label = item.owner
    ? item.role
      ? `${ROLE_LABELS[item.role]} · ${item.owner}`
      : item.owner
    : `${ROLE_LABELS[item.role!]} 담당`
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-sub">
      {item.role && (
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${ROLE_BAR_CLASSES[item.role]}`} />
      )}
      {label}
    </span>
  )
}

export default function ActionQueueCard({
  title,
  tone,
  badgeLevel,
  badgeDot = false,
  items,
  loading = false,
  emptyMessage,
  heroActions,
  heroNotice,
  moreTo,
  moreLabel,
  rowLimit = 3,
}: {
  title: string
  tone: QueueTone
  badgeLevel: StatusLevel
  /** 도트는 '내 행동을 기다리는' 큐(미결 컨펌)에만 (패턴 §03) */
  badgeDot?: boolean
  items: QueueItem[]
  loading?: boolean
  emptyMessage: string
  /** 히어로 블록 액션 버튼 — accent는 화면 전체에 1개만 */
  heroActions?: ReactNode
  /** 액션 결과 안내(알림 준비 중 등) — 게이트 뒤에 숨기지 않는다 */
  heroNotice?: ReactNode
  moreTo: string
  moreLabel: string
  rowLimit?: number
}) {
  const [hero, ...rest] = items
  const rows = rest.slice(0, rowLimit)

  return (
    <Card
      title={title}
      action={<LevelBadge level={badgeLevel} label={`${items.length}건`} dot={badgeDot} />}
    >
      {loading && items.length === 0 && <TableSkeleton rows={3} columns={2} />}
      {!loading && items.length === 0 && <EmptyState message={emptyMessage} />}

      {hero && (
        <div className={`rounded-[10px] border p-3.5 ${HERO_SURFACE[tone]}`} data-testid="queue-hero">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] font-semibold tracking-[0.06em] ${HERO_LABEL[tone]}`}>
              가장 급한 1건
            </span>
            {hero.dueDate && <DdayBadge isoDate={hero.dueDate} />}
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-[1.45] text-ink">
            {hero.code && <span className="mr-1.5 font-mono text-ink-cap">{hero.code}</span>}
            {hero.title}
          </p>
          {hero.subtitle && <p className="mt-1 truncate text-xs text-ink-cap">{hero.subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <OwnerLine item={hero} />
            {hero.dueDate && (
              <span className="text-xs text-ink-cap">{formatDate(hero.dueDate.slice(0, 10))} 마감</span>
            )}
            {hero.dueNote && <span className="text-xs text-ink-cap">{hero.dueNote}</span>}
          </div>
          {heroActions && <div className="mt-3.5 flex gap-2">{heroActions}</div>}
          {heroNotice}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-3.5">
          {rows.map((item) => (
            <li key={item.key} className="border-t border-border">
              <Link
                to={item.to}
                className="flex items-center justify-between gap-2.5 py-2.5 hover:opacity-70"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {item.role && (
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-full ${ROLE_BAR_CLASSES[item.role]}`}
                    />
                  )}
                  {item.code && (
                    <span className="shrink-0 font-mono text-[11px] text-ink-cap">{item.code}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink" title={item.title}>
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="block truncate text-xs text-ink-cap">{item.subtitle}</span>
                    )}
                  </span>
                </span>
                {item.dueDate ? (
                  <DdayBadge isoDate={item.dueDate} />
                ) : (
                  <span className="shrink-0 text-xs text-ink-cap">기한 미정</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <Link
          to={moreTo}
          className="mt-3 block text-[13px] font-medium text-accent-deep hover:underline"
        >
          {moreLabel} →
        </Link>
      )}
    </Card>
  )
}
