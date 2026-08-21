import { NavLink, Outlet, useParams } from 'react-router-dom'
import BrandLogo from '../BrandLogo'

// 발주처 화면 공통 레이아웃 — 모바일(375px) 우선, 토큰은 URL 경로로만 전달
export default function ClientLayout() {
  const { token } = useParams()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <span className="flex items-center gap-2">
            <BrandLogo className="h-3.5 w-auto" />
            <span className="text-gray-300">|</span>
            <span className="text-sm font-bold text-gray-900">컨펌 센터</span>
          </span>
          <nav className="flex gap-1">
            <NavLink
              to={`/c/${token}`}
              end
              className={({ isActive }) =>
                `flex h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              컨펌 요청
            </NavLink>
            <NavLink
              to={`/c/${token}/status`}
              className={({ isActive }) =>
                `flex h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              진행 현황
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl">
        <Outlet />
      </main>
    </div>
  )
}
