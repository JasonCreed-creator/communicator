// P8(3.15.1) 공용 도움말 레이어 — 라벨 옆 ⓘ 아이콘, hover·포커스 시 툴팁.
// 키보드 접근 가능(포커스 표시), 모바일은 탭 토글. 문구는 src/lib/helpTexts.ts 사전에서만 가져온다.
// 토큰만 사용(bg-dark·text-dark-ink) — 디자인지시서 §3 다크 면 규격 준용.
import { useId, useState } from 'react'

export default function InfoTip({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const tipId = useId()

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label="도움말"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-[10px] font-bold leading-none text-ink-cap hover:border-ink-sub hover:text-ink-sub focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1.5 w-60 -translate-x-1/2 rounded-md bg-dark px-3 py-2 text-xs font-normal leading-relaxed text-dark-ink shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
