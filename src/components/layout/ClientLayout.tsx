import { useCallback } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import BrandLogo from '../BrandLogo'
import { useClientData } from '../client/useClientData'
import { deriveClientMaterials } from '../client/clientDerive'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

// 발주처 화면 공통 레이아웃 — 디자인지시서 v1 §4: 사이드바 없음, 슬림 다크 상단 바
// (--dark + offwhite 로고 + 행사명), 이하 모바일 1열 카드. 토큰은 URL 경로로만 전달.
// 행사명 조회가 실패해도(만료·회수 토큰) 레이아웃은 침묵 폴백 — 본문이 410/404를 안내한다.
// 시안 「발주처 보드」: 탭 3개(컨펌 요청 · 진행 현황 · 제출 자료) + 대기 건수 배지.
export default function ClientLayout() {
  const { token } = useParams()
  const fetcher = useCallback(() => provider.getClientQueue(token ?? ''), [token])
  const queue = useClientData(fetcher)

  const confirmCount = queue.data?.queue.length ?? 0
  const materialCount = deriveClientMaterials(queue.data, null).length

  // 3.16.3 T2 — 사이드바와 동일하게 비활성 탭에도 hover 배경 하이라이트(라이트 면 토큰)
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
      isActive
        ? 'border-accent text-ink'
        : 'border-transparent text-ink-sub hover:bg-track hover:text-ink'
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
        <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-4">
          <NavLink to={`/c/${token}`} end className={tabClass}>
            컨펌 요청
            {confirmCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-1.5 py-0.5 text-xs text-accent-deep">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {confirmCount}
              </span>
            )}
          </NavLink>
          <NavLink to={`/c/${token}/status`} className={tabClass}>
            진행 현황
          </NavLink>
          <NavLink to={`/c/${token}/materials`} className={tabClass}>
            제출 자료
            {materialCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-track px-1.5 py-0.5 text-xs text-ink-sub">
                {materialCount}
              </span>
            )}
          </NavLink>
        </div>
      </nav>
      <main className="mx-auto max-w-2xl">
        <Outlet />
      </main>
    </div>
  )
}
