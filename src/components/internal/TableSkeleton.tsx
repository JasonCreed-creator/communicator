/** 빈 상태 ① 로딩 — 패턴 기준 시트 §06: 0.3초 이상 걸리는 조회에만.
 *  **실제 행 구조와 같은 형태의 스켈레톤**을 쓰고 스피너는 쓰지 않는다. 인쇄에는 나가지 않는다. */
export default function TableSkeleton({
  rows = 5,
  columns = 4,
  dense = false,
}: {
  rows?: number
  columns?: number
  dense?: boolean
}) {
  return (
    <div className="print-hidden" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className={`flex items-center gap-3 border-b border-border px-3 last:border-b-0 ${
              dense ? 'h-9' : 'h-11'
            } ${r % 2 === 1 ? 'bg-canvas' : 'bg-card'}`}
          >
            {Array.from({ length: columns }, (_, c) => (
              <div
                key={c}
                className="h-2.5 animate-pulse rounded-[3px] bg-track"
                style={{ width: c === 0 ? '22%' : `${Math.max(10, 30 - c * 5)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
