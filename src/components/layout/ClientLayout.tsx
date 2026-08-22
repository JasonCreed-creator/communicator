import { useCallback } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import BrandLogo from '../BrandLogo'
import { useClientData } from '../client/useClientData'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

// 발주처 화면 공통 레이아웃 — 디자인지시서 v1 §4: 사이드바 없음, 슬림 다크 상단 바
// (--dark + offwhite 로고 + 행사명), 이하 모바일 1열 카드. 토큰은 URL 경로로만 전달.
// 행사명 조회가 실패해도(만료·회수 토큰) 레이아웃은 침묵 폴백 — 본문이 410/404를 안내한다.
export default function ClientLayout() {
  const { token } = useParams()
  const fetcher = useCallback(() => provider.getClientQueue(token ?? ''), [token])
  const queue = useClientData(fetcher)

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium ${
      isActive
        ? 'border-accent text-ink'
        : 'border-transparent text-ink-sub hover:text-ink'
    }`

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-dark">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3">
          <BrandLogo variant="offwhite" className="h-5 w-auto" />
          <span aria-hidden className="text-dark-ink/25">|</span>
          <span className="min-w-0 truncate text-sm font-medium text-dark-ink">
            {queue.data?.project_name ?? '컨펌 센터'}
          </span>
        </div>
      </header>
      <nav className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl gap-1 px-4">
          <NavLink to={`/c/${token}`} end className={tabClass}>
            컨펌 요청
          </NavLink>
          <NavLink to={`/c/${token}/status`} className={tabClass}>
            진행 현황
          </NavLink>
        </div>
      </nav>
      <main className="mx-auto max-w-2xl">
        <Outlet />
      </main>
    </div>
  )
}
