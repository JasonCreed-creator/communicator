import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import InternalLayout from './components/layout/InternalLayout'
import OnboardingGuard from './components/onboarding/OnboardingGuard'
import AreaBoardPage from './pages/AreaBoardPage'
import ClientConfirmQueuePage from './pages/ClientConfirmQueuePage'
import ClientStatusPage from './pages/ClientStatusPage'
import HomeDashboardPage from './pages/HomeDashboardPage'
import ItemDetailPage from './pages/ItemDetailPage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingPage from './pages/OnboardingPage'
import PlanDocPage from './pages/PlanDocPage'
import RegistrationPage from './pages/RegistrationPage'
import SchedulePage from './pages/SchedulePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* S0 온보딩 위저드 — 가드 대상 제외 */}
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* 내부 화면 S1~S6 — 온보딩 미완료 시 OnboardingGuard가 /onboarding으로 리다이렉트 */}
        <Route element={<OnboardingGuard />}>
          <Route element={<InternalLayout />}>
            <Route path="/" element={<HomeDashboardPage />} />
            <Route path="/board/:area" element={<AreaBoardPage />} />
            <Route path="/items/:itemId" element={<ItemDetailPage />} />
            <Route path="/registration" element={<RegistrationPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/plan" element={<PlanDocPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* 발주처 화면 S7~S8 — 무로그인 토큰 링크 (/c/demo 데모 라우트 포함), 가드 제외 */}
        <Route path="/c/:token" element={<ClientLayout />}>
          <Route index element={<ClientConfirmQueuePage />} />
          <Route path="status" element={<ClientStatusPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
