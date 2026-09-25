// 행·카드의 ⋯ 동작 메뉴 — 디자인지시서 v1.4 §7-2.8(큐시트 행 메뉴가 첫 사용처).
// 자주 쓰지 않는 동작(고치기·옮기기·지우기)을 칸마다 버튼으로 늘어놓지 않고 한 메뉴에 모은다.
// 막힌 항목은 숨기지 않고 비활성 + 이유를 이름 옆에 적는다(예: '위로 옮기기 — 맨 위라 안 됨').
// 바깥 누르기·Esc로 닫히고, Esc는 여는 버튼으로 초점을 돌린다. 연 직후 첫 항목에 초점.
import { useEffect, useRef, useState } from 'react'

export interface ActionMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** 막힌 이유 — 이름 옆에 붙는다 */
  reason?: string
  /** 되돌릴 수 없는 동작(지우기) — negative 글자, 앞에 구분선 */
  danger?: boolean
  /** 이름 아래 작은 설명 — 예: '관리자만 · 되돌릴 수 없음' */
  note?: string
  testId?: string
}

export default function ActionMenu({
  label,
  items,
  width = 200,
}: {
  /** 여는 버튼과 메뉴의 접근성 이름 — 예: '큐 메뉴 C03' */
  label: string
  items: ActionMenuItem[]
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
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

  return (
    // 카드·행 전체가 눌리는 자리(role="button")에 놓여도 메뉴 안의 누르기·Enter가 바깥으로 번지지 않게 한다
    // (Esc는 문서 수준에서 메뉴를 닫아야 하므로 막지 않는다)
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={`inline-flex size-8 items-center justify-center rounded-md text-ink-sub transition-colors hover:bg-track ${open ? 'bg-track' : ''}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ width }}
          className="absolute right-0 top-full z-30 mt-1 rounded-[10px] border border-border-strong bg-card p-1.5 text-left shadow-lg"
        >
          {items.map((it, i) => (
            <div key={it.label}>
              {it.danger && i > 0 && <span aria-hidden className="mx-1.5 my-1 block h-px bg-border" />}
              <button
                type="button"
                role="menuitem"
                data-testid={it.testId}
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  it.onSelect()
                }}
                className={`block w-full whitespace-normal rounded-md px-2.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:text-ink-cap ${
                  it.danger ? 'text-negative hover:bg-negative-tint' : 'text-ink hover:bg-canvas'
                }`}
              >
                {it.label}
                {it.disabled && it.reason ? ` — ${it.reason}` : ''}
                {it.note && <span className="t-caption mt-0.5 block">{it.note}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
