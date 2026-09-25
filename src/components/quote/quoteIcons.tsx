// 견적 화면 선 아이콘 — 디자인지시서 v1.4 §7-2.10(PR-6). 옵션 카드의 이모지를 대체한다.
// 24 뷰박스 · 선 1.7 · currentColor(색은 바깥 글자색을 따른다). 새 의존성 없이 경로만 둔다.
import type { ReactNode } from 'react'

const OPTION_PATHS: Record<string, string> = {
  souvenir:
    'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z',
  rsvpHandling: 'M3 5h18v14H3zM7 9h4M7 13h6M15.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM13 15a2.5 2.5 0 0 1 5 0',
  emcee: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  photo:
    'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  video: 'M3 3h18v18H3zM7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4',
  aving:
    'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2M18 14h-8M15 18h-5M10 6h8v4h-8z',
  ledOperating: 'M2 3h20v14H2zM8 21h8M12 17v4',
  screenRelay: 'M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a9 9 0 0 1 8 8M2 16a5 5 0 0 1 4 4M2 20h.01',
  onlineRelay:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z',
  fullRecording: 'M16 13l5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11M2 6h14v12H2z',
  survey: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7',
  photowall_basic: 'M3 3h18v18H3zM9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM21 15l-5-5L5 21',
  photowall_premium: 'M3 3h18v18H3zM9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM21 15l-5-5L5 21',
  booth: 'M3 9l1-5h16l1 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9ZM5 13v8h14v-8M10 21v-5h4v5',
}

function Svg({ d, size, strokeWidth = 1.7 }: { d: string; size: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

/** 옵션 카드 왼쪽 32px 타일 — 고르면 accent-tint 면 + accent-deep 선, 아니면 track 면 */
export function OptionIconTile({ id, active, muted }: { id: string; active?: boolean; muted?: boolean }) {
  const d = OPTION_PATHS[id] ?? OPTION_PATHS.survey
  return (
    <span
      aria-hidden
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${
        active ? 'bg-accent-tint text-accent-deep' : muted ? 'bg-track text-ink-cap' : 'bg-track text-brown'
      }`}
    >
      <Svg d={d} size={18} />
    </span>
  )
}

const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z'

/** 확정본 자물쇠 — 표의 버전 칸. 스크린리더에는 '확정본 · 잠김'으로 읽힌다 */
export function LockMark() {
  return (
    <span role="img" aria-label="확정본 · 잠김" title="확정본 · 잠김" className="inline-flex text-ink-sub">
      <Svg d={LOCK} size={13} strokeWidth={1.9} />
    </span>
  )
}

const ACTION_PATHS = {
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  sheet: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  back: 'M19 12H5M11 18l-6-6 6-6',
  forward: 'M5 12h14M13 6l6 6-6 6',
} as const

/** 버튼 안 16px 아이콘 — 글자 앞(또는 뒤)에 놓는다 */
export function ActionIcon({ name }: { name: keyof typeof ACTION_PATHS }): ReactNode {
  return <Svg d={ACTION_PATHS[name]} size={16} strokeWidth={1.8} />
}
