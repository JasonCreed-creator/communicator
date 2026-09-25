// S0 라우트 가드 — 온보딩 미완료 시 본체 라우트(/home, /board/*, /items/*, /registration, /schedule,
// /plan) 접근을 /settings로 유도한다(설계서 v1.5 §10: 미완료 행사는 목록에 남고, 진입 시 행사 설정
// 화면에서 필수 항목을 채우도록 안내한다 — 위저드로 강제 리다이렉트하지 않는다).
// 가드 제외: /(제품 런처)·/c/:token(발주처 무로그인 뷰), /onboarding·/settings·/projects 자체
// (App.tsx·testUtils.tsx의 라우트 표 참조 — 전부 이 가드가 감싸는 라우트 그룹 밖에 배치되어 있다).
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import ErrorAlert from '../internal/ErrorAlert'
import { useProject } from '../../context/ProjectContext'
import { useAsync } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

export default function OnboardingGuard() {
  const { projectId } = useProject()
  // `?project=` 링크(Slack 알림 등)로 들어오면 행사 전환은 ProjectContext의 효과가 한다. 그 전환이 그려지기 전에
  // 지금(이전) 행사의 조회가 끝나면 그 결과로 판정해, 링크가 가리킨 화면 대신 이전 행사의 행사 설정으로 끌고 갔다
  // (Phase 3.23 PR-8 스모크에서 발견). 두 갈래를 막는다:
  //   ① 전환 대기 — 주소에 다른 행사의 `project`가 남아 있으면 아직 판정하지 않는다(적용·무시 뒤 주소에서 지워진다)
  //   ② 낡은 결과 — 결과에 행사 id를 붙여 두고 지금 행사 것이 아니면 버린다(전환은 그려졌는데 이전 조회가 늦게 온 경우)
  const pendingProject = new URLSearchParams(useLocation().search).get('project')
  const switching = pendingProject !== null && pendingProject !== projectId
  const status = useAsync(
    () => provider.getOnboardingStatus(projectId).then((s) => ({ ...s, projectId })),
    [projectId],
  )
  const stale = !status.loading && !status.error && status.data?.projectId !== projectId

  if (status.loading || stale || switching) {
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
