// P5-① — RSVP·참관객 두 표가 공유하는 페이지네이션(50행/페이지, 페이지 표시·이동).
interface PaginationBarProps {
  page: number
  totalPages: number
  totalCount: number
  onPageChange: (page: number) => void
}

export default function PaginationBar({ page, totalPages, totalCount, onPageChange }: PaginationBarProps) {
  if (totalCount === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-ink-sub">
      <span>총 {totalCount}건</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn btn-ghost btn-sm"
        >
          이전
        </button>
        <span aria-live="polite" className="font-medium text-ink-sub">
          {page} / {totalPages} 페이지
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn btn-ghost btn-sm"
        >
          다음
        </button>
      </div>
    </div>
  )
}
