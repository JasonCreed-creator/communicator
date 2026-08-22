import { Link } from 'react-router-dom'
import StatusBadge from '../internal/StatusBadge'
import type { Deliverable } from '../../types/entities'

/** WBS 태스크 → 산출물 연결 뱃지. 연결 시 산출물 상태 뱃지(final=positive 틴트, 그 외 상태별 뱃지) +
 *  /items/{id} 링크(설계서 §10 S5). 미연결 = track/ink-sub 중립 플레이스홀더. */
export default function LinkedDeliverableBadge({
  deliverableId,
  deliverables,
}: {
  deliverableId: string | null
  deliverables: Deliverable[]
}) {
  if (!deliverableId) {
    return (
      <span className="inline-flex items-center rounded-full bg-track px-2 py-0.5 text-xs text-ink-sub">—</span>
    )
  }
  const d = deliverables.find((x) => x.id === deliverableId)
  if (!d) {
    return (
      <span className="inline-flex items-center rounded-full bg-track px-2 py-0.5 text-xs text-ink-sub">—</span>
    )
  }
  return (
    <Link to={`/items/${d.id}`} className="inline-flex items-center gap-1.5 hover:opacity-70">
      <StatusBadge status={d.status} />
      <span className="max-w-[8rem] truncate text-xs text-ink-sub">{d.title}</span>
    </Link>
  )
}
