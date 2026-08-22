import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import InternalLayout from './components/layout/InternalLayout'
import OnboardingGuard from './components/onboarding/OnboardingGuard'
import { ProjectProvider } from './context/ProjectContext'
import AreaBoardPage from './pages/AreaBoardPage'
import ClientConfirmQueuePage from './pages/ClientConfirmQueuePage'
import ClientStatusPage from './pages/ClientStatusPage'
import HomeDashboardPage from './pages/HomeDashboardPage'
import ItemDetailPage from './pages/ItemDetailPage'
import LegacyGonePage from './pages/LegacyGonePage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingPage from './pages/OnboardingPage'
import PlanDocPage from './pages/PlanDocPage'
import ProjectListPage from './pages/ProjectListPage'
import QuoteEditorPage from './pages/QuoteEditorPage'
import QuotesPage from './pages/QuotesPage'
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

// v2.0 §10 — 옛 Configurator 라우트 리다이렉트. `?client_view=1` 공유 링크는 410 안내(§12 ④).
function LegacySocRedirect() {
  const location = useLocation()
  if (new URLSearchParams(location.search).get('client_view') === '1') return <LegacyGonePage />
  return <Navigate to="/schedule" replace />
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

            {/* v2.0 S-2 견적 — 행사 없이도 접근(견적→행사 생성이 첫 단계)하므로 가드 밖.
                app_role 게이트(admin·sales)는 페이지 내부(QuoteGate)가 수행 — staff는 403 화면 */}
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/quotes/:quoteId/edit" element={<QuoteEditorPage />} />

            {/* 내부 화면 S1~S6 — 온보딩 미완료 시 OnboardingGuard가 /settings로 유도 */}
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

        {/* v2.0 §10 — 옛 Configurator 라우트 리다이렉트 (구버전 화면은 이식하지 않음 §17.2) */}
        <Route path="/quote" element={<Navigate to="/quotes" replace />} />
        <Route path="/configurator" element={<Navigate to="/quotes" replace />} />
        <Route path="/setup" element={<Navigate to="/onboarding" replace />} />
        <Route path="/events" element={<Navigate to="/projects" replace />} />
        <Route path="/events/:id" element={<Navigate to="/projects" replace />} />
        <Route path="/events/:id/soc" element={<LegacySocRedirect />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
