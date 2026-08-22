import { NavLink, Outlet } from 'react-router-dom'
import BrandLogo from '../BrandLogo'

const NAV_ITEMS = [
  { to: '/', label: '홈', end: true },
  { to: '/board/design', label: '디자인 보드' },
  { to: '/board/ops', label: '운영 보드' },
  { to: '/registration', label: '등록' },
  { to: '/schedule', label: '일정' },
  { to: '/plan', label: '운영계획서' },
  { to: '/settings', label: '설정' },
]

export default function InternalLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="flex items-center gap-2.5">
            <BrandLogo className="h-4 w-auto" />
            <span className="text-gray-300">|</span>
            <span className="text-sm font-bold text-gray-900">MICE 커뮤니케이터</span>
          </span>
          <nav className="flex flex-wrap gap-1">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-gray-900 font-medium text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl">
        <Outlet />
      </main>
    </div>
  )
}
