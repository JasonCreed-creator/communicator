// 내부 라우트 로그인 게이트(Phase 4c). supabase 공급자에서 세션이 없으면 /login으로 보낸다(원래 목적지 보존).
// mock 공급자에서는 항상 통과 — 데모·기존 테스트 무변경. `/c/*`·`/p/*`·`/`는 이 게이트 밖에 배치한다.
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function AuthGate() {
  const { mode, loading, user } = useAuth()
  const location = useLocation()
  if (mode === 'mock') return <Outlet />
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-cap">로그인 확인 중…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
