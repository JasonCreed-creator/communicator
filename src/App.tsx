import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import InternalLayout from './components/layout/InternalLayout'
import AreaBoardPage from './pages/AreaBoardPage'
import ClientConfirmQueuePage from './pages/ClientConfirmQueuePage'
import ClientStatusPage from './pages/ClientStatusPage'
import HomeDashboardPage from './pages/HomeDashboardPage'
import ItemDetailPage from './pages/ItemDetailPage'
import NotFoundPage from './pages/NotFoundPage'
import RegistrationPage from './pages/RegistrationPage'
import SchedulePage from './pages/SchedulePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 내부 화면 S1~S6 */}
        <Route element={<InternalLayout />}>
          <Route path="/" element={<HomeDashboardPage />} />
          <Route path="/board/:area" element={<AreaBoardPage />} />
          <Route path="/items/:itemId" element={<ItemDetailPage />} />
          <Route path="/registration" element={<RegistrationPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 발주처 화면 S7~S8 — 무로그인 토큰 링크 (/c/demo 데모 라우트 포함) */}
        <Route path="/c/:token" element={<ClientLayout />}>
          <Route index element={<ClientConfirmQueuePage />} />
          <Route path="status" element={<ClientStatusPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
