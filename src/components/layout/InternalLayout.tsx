import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import BrandLogo from '../BrandLogo'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useAsync } from '../../hooks/useAsync'
import { EVENT_TYPE_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

// 내부 화면 레이아웃 — 디자인지시서 v1 §4: 상단 탭 → 좌측 사이드바(고정 232px, --dark).
// 활성 항목 = 오렌지 3px 좌측 마커 + 텍스트 100%. 하단에 행사명·유형 뱃지·설정.
// 모바일(<768px)은 슬림 다크 바 + 햄버거 드로어(열릴 때만 마운트 — 중복 렌더 방지).

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

const NAV_ITEMS = [
  { to: '/', label: '홈', end: true, icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { to: '/board/design', label: '디자인 보드', icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z' },
  { to: '/board/ops', label: '운영 보드', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/registration', label: '등록', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6' },
  { to: '/schedule', label: '일정', icon: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z' },
  { to: '/plan', label: '운영계획서', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6' },
]

const SETTINGS_ITEM = { to: '/settings', label: '설정', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z' }

function SidebarLink({
  to,
  label,
  end,
  icon,
  onNavigate,
}: {
  to: string
  label: string
  end?: boolean
  icon: string
  onNavigate?: () => void
}) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className="block">
      {({ isActive }) => (
        <span
          className={`relative flex items-center gap-2.5 px-5 py-2 text-sm transition-colors ${
            isActive ? 'font-medium text-dark-ink' : 'text-dark-ink/70 hover:text-dark-ink'
          }`}
        >
          {isActive && (
            <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" />
          )}
          <Icon d={icon} />
          {label}
        </span>
      )}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const project = useAsync(() => provider.getProject(PROJECT_ID), [])

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <BrandLogo variant="offwhite" className="h-5 w-auto" />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto py-1">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="border-t border-dark-ink/15 py-3">
        <SidebarLink {...SETTINGS_ITEM} onNavigate={onNavigate} />
        {project.data && (
          <div className="flex items-center gap-2 px-5 pb-1 pt-2.5">
            <span className="min-w-0 truncate text-xs font-medium text-dark-ink/80">
              {project.data.name}
            </span>
            <span className="shrink-0 rounded-full bg-dark-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-dark-ink/70">
              {EVENT_TYPE_LABELS[project.data.event_type]}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>
}

export default function InternalLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <Shell>
      {/* 데스크톱 사이드바 (≥768px) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] bg-dark md:block">
        <SidebarContent />
      </aside>

      {/* 모바일 슬림 다크 바 + 드로어 (<768px) */}
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-dark px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="메뉴 열기"
          onClick={() => setDrawerOpen(true)}
          className="-ml-1 flex size-9 items-center justify-center rounded-md text-dark-ink"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <BrandLogo variant="offwhite" className="h-5 w-auto" />
      </header>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-dark/60"
          />
          <div className="absolute inset-y-0 left-0 w-[232px] bg-dark shadow-card">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* 콘텐츠 — §4: --canvas 배경, max-width 1120 중앙 */}
      <div className="md:pl-[232px]">
        <main className="mx-auto max-w-[1120px]">
          <Outlet />
        </main>
      </div>
    </Shell>
  )
}
