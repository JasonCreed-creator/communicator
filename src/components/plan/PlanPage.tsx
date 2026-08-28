// S9 A4 한 쪽 — 러닝 헤더(행사명 · 섹션명) + 본문 + 러닝 푸터(버전 · 출력일시 · n/7).
// 헤더·푸터는 모든 쪽에 반복되며 인쇄에도 그대로 실린다(표지만 헤더 없이 푸터부터).
// 화면에서는 '페이지 경계 보기'가 켜져 있을 때 다음 쪽 시작을 점선으로 미리 보여준다.
import type { ReactNode } from 'react'

export default function PlanPage({
  pageNo,
  totalPages,
  eventName,
  sectionLabel,
  versionLabel,
  printedAt,
  showBoundary,
  boundaryNote,
  children,
}: {
  pageNo: number
  totalPages: number
  eventName: string
  /** 표지는 null — 표지 자체가 행사명을 크게 싣는다 */
  sectionLabel: string | null
  versionLabel: string
  printedAt: string
  showBoundary: boolean
  /** 경계 칩 뒤에 덧붙이는 안내(예: '표지', '07 비상 대응 전용 장') */
  boundaryNote?: string
  children: ReactNode
}) {
  const last = pageNo >= totalPages
  const footer = `${versionLabel} · ${printedAt} 출력 · ${pageNo}/${totalPages}`

  return (
    <div className={`plan-page ${last ? '' : 'print:break-after-page'}`}>
      {sectionLabel && (
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2 text-[10px] tracking-[.04em] text-ink-cap">
          <span className="truncate">{eventName} · 운영계획서</span>
          <span className="shrink-0">{sectionLabel}</span>
        </div>
      )}

      {children}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2 text-[10px] tracking-[.04em] text-ink-cap">
        <span className="truncate">{eventName} · 운영계획서</span>
        <span className="shrink-0">{footer}</span>
      </div>

      {!last && showBoundary && (
        <div aria-hidden className="print-hidden flex items-center gap-3 py-3.5">
          <span className="h-px flex-1 border-t border-dashed border-border-strong" />
          <span className="inline-flex shrink-0 rounded-full bg-track px-2.5 py-0.5 text-[11px] font-medium text-ink-cap">
            A4 {pageNo}쪽 끝 · {pageNo + 1}쪽 시작{boundaryNote ? ` · ${boundaryNote}` : ''}
          </span>
          <span className="h-px flex-1 border-t border-dashed border-border-strong" />
        </div>
      )}
    </div>
  )
}
