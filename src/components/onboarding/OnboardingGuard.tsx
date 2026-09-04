// S0 라우트 가드 — 온보딩 미완료 시 본체 라우트(/home, /board/*, /items/*, /registration, /schedule,
// /plan) 접근을 /settings로 유도한다(설계서 v1.5 §10: 미완료 행사는 목록에 남고, 진입 시 행사 설정
// 화면에서 필수 항목을 채우도록 안내한다 — 위저드로 강제 리다이렉트하지 않는다).
// 가드 제외: /(제품 런처)·/c/:token(발주처 무로그인 뷰), /onboarding·/settings·/projects 자체
// (App.tsx·testUtils.tsx의 라우트 표 참조 — 전부 이 가드가 감싸는 라우트 그룹 밖에 배치되어 있다).
import { Navigate, Outlet } from 'react-router-dom'
import ErrorAlert from '../internal/ErrorAlert'
import { useProject } from '../../context/ProjectContext'
import { useAsync } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

export default function OnboardingGuard() {
  const { projectId } = useProject()
  const status = useAsync(() => provider.getOnboardingStatus(projectId), [projectId])

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
    return <Navigate to="/settings" replace />
  }

  return <Outlet />
}
