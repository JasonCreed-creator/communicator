// S8 최근 확정본 1행 — 파일명·항목명·확정일 + positive 뱃지 + 새 탭 보기/다운로드 링크(file_url).
// 목록 안에서는 border-b border-border 구분선으로만 분리한다.
import StatusBadge from '../internal/StatusBadge'
import { formatDateTime } from '../../lib/labels'
import type { ClientFinalItem } from '../../types'

export default function FinalItemRow({ item }: { item: ClientFinalItem }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{item.deliverable_title}</p>
          <StatusBadge status="final" />
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-cap">
          {item.file_name} · 확정 {formatDateTime(item.finalized_at)}
        </p>
      </div>
      <a
        href={item.file_url}
        target="_blank"
        rel="noreferrer"
        className="btn btn-ghost h-11 shrink-0 text-xs"
      >
        다운로드/보기
      </a>
    </li>
  )
}
