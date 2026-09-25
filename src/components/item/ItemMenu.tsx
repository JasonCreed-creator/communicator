// 항목 머리의 ⋯ 메뉴 — 디자인지시서 v1.4 §7-2.7 (Phase 3.23 PR-4). Phase 4.5의 '항목 관리' 카드를 대신한다:
// 고치기·지우기는 자주 쓰지 않는 동작이라 본문 카드 한 장을 차지할 까닭이 없다(캔버스 항목 상세 · 큐시트 머리).
// 권한은 그대로 — 고치기 = PM·해당 영역 담당, 지우기 = PM만, 종료 행사는 둘 다 막고 이유를 적는다. 권한이 없으면 메뉴 자체가 없다.
import { useEffect, useRef, useState } from 'react'

export default function ItemMenu({
  canDelete,
  closed,
  onEdit,
  onDelete,
}: {
  /** PM만 — 지우기 항목을 싣는다 */
  canDelete: boolean
  /** 종료 행사 — 고치기·지우기가 모두 409이므로 누를 수 없게 하고 이유를 적는다 */
  closed: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    firstRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  const item = 'block w-full rounded-md px-2.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:text-ink-cap'
  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="항목 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost w-9 px-0"
        title="고치기·지우기"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="항목 메뉴"
          className="absolute right-0 top-full z-30 mt-1.5 w-[232px] rounded-[10px] border border-border-strong bg-card p-1.5 shadow-lg"
        >
          <button ref={firstRef} type="button" role="menuitem" disabled={closed} onClick={pick(onEdit)} className={`${item} text-ink hover:bg-canvas`}>
            고치기
          </button>
          {canDelete && (
            <>
              <span aria-hidden className="mx-1.5 my-1 block h-px bg-border" />
              <button type="button" role="menuitem" disabled={closed} onClick={pick(onDelete)} className={`${item} text-negative hover:bg-negative-tint`}>
                지우기
              </button>
            </>
          )}
          {closed ? (
            <p data-testid="item-manage-closed" className="t-caption px-2.5 pb-1.5 pt-1">
              종료된 행사입니다 — 재개(pm) 후 고치거나 지울 수 있습니다.
            </p>
          ) : (
            <p className="t-caption px-2.5 pb-1.5 pt-1">
              {canDelete ? '제목·카테고리·마감·담당·제작 가이드' : '제목·카테고리·마감 — 담당·가이드·지우기는 PM'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
