import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import InternalLayout from './components/layout/InternalLayout'
import OnboardingGuard from './components/onboarding/OnboardingGuard'
import { ProjectProvider } from './context/ProjectContext'
import AreaBoardPage from './pages/AreaBoardPage'
import ClientConfirmQueuePage from './pages/ClientConfirmQueuePage'
import ClientStatusPage from './pages/ClientStatusPage'
import HomeDashboardPage from './pages/HomeDashboardPage'
import ItemDetailPage from './pages/ItemDetailPage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingPage from './pages/OnboardingPage'
import PlanDocPage from './pages/PlanDocPage'
import ProjectListPage from './pages/ProjectListPage'
import RegistrationPage from './pages/RegistrationPage'
import SchedulePage from './pages/SchedulePage'
import SettingsPage from './pages/SettingsPage'

// v1.5 진입점 원칙(설계서 §2.1·§10): /onboarding·본체·S-1·행사 설정은 모두 같은 ProjectProvider
// 스코프 안에서 "현재 행사"를 공유한다. /c/:token(발주처 무로그인 뷰)은 이 스코프 밖.
function ProjectScope() {
  return (
    <ProjectProvider>
      <Outlet />
    </ProjectProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ProjectScope />}>
          {/* S0 온보딩 위저드 — 가드 대상 제외 */}
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route element={<InternalLayout />}>
            {/* S-1 행사 목록·행사 설정 — 세팅 미완료 행사도 접근해야 하므로 OnboardingGuard 밖
                (가드가 /settings로 유도하는 구조라 가드 안에 두면 무한 루프) */}
            <Route path="/projects" element={<ProjectListPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* 내부 화면 S1~S6 — 온보딩 미완료 시 OnboardingGuard가 /onboarding으로 리다이렉트 */}
            <Route element={<OnboardingGuard />}>
              <Route path="/" element={<HomeDashboardPage />} />
              <Route path="/board/:area" element={<AreaBoardPage />} />
              <Route path="/items/:itemId" element={<ItemDetailPage />} />
              <Route path="/registration" element={<RegistrationPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/plan" element={<PlanDocPage />} />
            </Route>
          </Route>
        </Route>

        {/* 발주처 화면 S7~S8 — 무로그인 토큰 링크 (/c/demo 데모 라우트 포함), ProjectScope 밖 */}
        <Route path="/c/:token" element={<ClientLayout />}>
          <Route index element={<ClientConfirmQueuePage />} />
          <Route path="status" element={<ClientStatusPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
