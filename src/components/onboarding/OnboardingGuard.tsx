// S0 라우트 가드 — 온보딩 미완료 시 내부 라우트(/, /board/*, /items/*, /registration, /schedule,
// /plan, /settings) 접근을 /onboarding으로 리다이렉트한다.
// 가드 제외: /c/:token(발주처 무로그인 뷰), /onboarding 자체(App.tsx·testUtils.tsx의 라우트 표 참조 —
// 둘 다 이 가드가 감싸는 <InternalLayout> 라우트 그룹 밖에 배치되어 있다).
import { Navigate, Outlet } from 'react-router-dom'
import ErrorAlert from '../internal/ErrorAlert'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useAsync } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

export default function OnboardingGuard() {
  const status = useAsync(() => provider.getOnboardingStatus(PROJECT_ID), [])

  if (status.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-cap">불러오는 중…</p>
      </div>
    )
  }

  if (status.error) {
    return (
      <div className="p-6">
        <ErrorAlert message={status.error} />
      </div>
    )
  }

  if (!status.data?.completed) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
