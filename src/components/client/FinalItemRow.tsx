// S8 최근 확정본 1행 — 파일명·항목명·확정일 + 새 탭 보기/다운로드 링크(file_url).
import { formatDateTime } from '../../lib/labels'
import type { ClientFinalItem } from '../../types'

export default function FinalItemRow({ item }: { item: ClientFinalItem }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{item.deliverable_title}</p>
        <p className="truncate text-xs text-gray-500">
          {item.file_name} · 확정 {formatDateTime(item.finalized_at)}
        </p>
      </div>
      <a
        href={item.file_url}
        target="_blank"
        rel="noreferrer"
        className="flex h-11 shrink-0 items-center rounded-md border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        다운로드/보기
      </a>
    </li>
  )
}
