import { Link } from 'react-router-dom'
import StatusBadge from '../internal/StatusBadge'
import type { Deliverable } from '../../types/entities'

/** WBS 태스크 → 산출물 연결 뱃지. 연결 시 산출물 상태 뱃지 + /items/{id} 링크(설계서 §10 S5) */
export default function LinkedDeliverableBadge({
  deliverableId,
  deliverables,
}: {
  deliverableId: string | null
  deliverables: Deliverable[]
}) {
  if (!deliverableId) return <span className="text-xs text-gray-300">—</span>
  const d = deliverables.find((x) => x.id === deliverableId)
  if (!d) return <span className="text-xs text-gray-300">—</span>
  return (
    <Link to={`/items/${d.id}`} className="inline-flex items-center gap-1.5 hover:opacity-70">
      <StatusBadge status={d.status} />
      <span className="max-w-[8rem] truncate text-xs text-gray-500">{d.title}</span>
    </Link>
  )
}
