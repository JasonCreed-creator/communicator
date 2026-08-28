// P8(3.15.1) 공용 도움말 레이어 — 라벨 옆 ⓘ 아이콘, hover·포커스 시 툴팁.
// 키보드 접근 가능(포커스 표시), 모바일은 탭 토글. 문구는 src/lib/helpTexts.ts 사전에서만 가져온다.
// 토큰만 사용(bg-dark·text-dark-ink) — 디자인지시서 §3 다크 면 규격 준용.
// 3.16.3 T1 — 뷰포트 가장자리 클램프: 중앙 정렬로 먼저 그린 뒤 useLayoutEffect에서 실측해
// 좌/우 정렬로 보정하고(우측 넘침 → 오른쪽 정렬, 좌측 넘침 → 왼쪽 정렬), 하단이 넘치고 위에
// 공간이 있으면 위로 반전한다. 페인트 전에 보정이 끝나 잘린 상태가 화면에 나타나지 않는다.
import { useId, useLayoutEffect, useRef, useState } from 'react'

type Box = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

export type TipPlacement = { align: 'center' | 'left' | 'right'; flipUp: boolean }

const CENTER: TipPlacement = { align: 'center', flipUp: false }

/**
 * 클램프 판정 순수 함수(3.16.3 T1 테스트 대상) — `tip`은 중앙 정렬로 그린 툴팁의 실측 박스,
 * `anchor`는 ⓘ 버튼의 실측 박스. 우측 넘침이 좌측 넘침보다 우선한다(둘 다 넘치는 경우는
 * 뷰포트가 툴팁 폭보다 좁을 때뿐이라 실사용에서 없다).
 */
export function resolveTipPlacement(
  tip: Box,
  anchor: Box,
  viewport: { width: number; height: number },
  margin = 8,
): TipPlacement {
  let align: TipPlacement['align'] = 'center'
  if (tip.right > viewport.width - margin) align = 'right'
  else if (tip.left < margin) align = 'left'
  // 하단 반전 — 아래가 넘치고, 앵커 위에 같은 간격으로 툴팁 전체가 들어갈 때만
  const gap = tip.top - anchor.bottom
  const flipUp = tip.bottom > viewport.height - margin && anchor.top - gap - tip.height >= margin
  return { align, flipUp }
}

export default function InfoTip({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<TipPlacement>(CENTER)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  // 열릴 때 1회 실측 — 닫히면 중앙으로 복원해 다음 열림도 항상 중앙 실측에서 시작한다.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(CENTER)
      return
    }
    const tip = tipRef.current
    const anchor = anchorRef.current
    if (!tip || !anchor) return
    setPlacement(
      resolveTipPlacement(tip.getBoundingClientRect(), anchor.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    )
  }, [open])

  const alignClass =
    placement.align === 'center' ? 'left-1/2' : placement.align === 'right' ? 'right-0' : 'left-0'
  const vertClass = placement.flipUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={anchorRef}
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
          ref={tipRef}
          id={tipId}
          role="tooltip"
          // 중앙 정렬은 인라인 transform으로 — Tailwind translate 유틸 클래스명은
          // 디자인 토큰 grep 가드(DoD 17)의 금지 팔레트명을 부분 문자열로 포함해 오탐된다
          style={placement.align === 'center' ? { transform: 'translateX(-50%)' } : undefined}
          className={`absolute ${alignClass} ${vertClass} z-30 w-60 rounded-md bg-dark px-3 py-2 text-xs font-normal leading-relaxed text-dark-ink shadow-lg`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
