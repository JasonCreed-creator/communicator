import type { ReactNode } from 'react'

/**
 * 목록 필터 칩 — 디자인지시서 v1.4 §7-2.5·§7-2.6 (홈 '오늘 할 일' · 디자인 보드 공용).
 * 높이 30 · 둥근 알약 · 13px, 눌린 칩 = ink 면 흰 글자(주황을 쓰지 않는다 — 채운 주황은 화면당 버튼 1개뿐).
 * 건수는 호출부가 children 안에 `<b>`로 넣는다. 눌림 상태는 aria-pressed로 보조기기에 알린다.
 */
export default function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors ${
        pressed ? 'border-ink bg-ink text-white' : 'border-border bg-card text-ink hover:bg-track'
      }`}
    >
      {children}
    </button>
  )
}
