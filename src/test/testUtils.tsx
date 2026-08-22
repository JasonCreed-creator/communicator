// DoD 컴포넌트 테스트 공용 헬퍼.
// App.tsx와 동일한 라우트 표를 MemoryRouter로 렌더한다(App은 BrowserRouter라 initialEntries 주입 불가).
// 주의: 페이지 모듈들이 모듈 스코프에서 getDataProvider()를 캡처하므로,
// 픽스처 초기화 단위 = 테스트 "파일"이다(vitest가 파일별로 모듈 레지스트리를 격리).
// 한 파일 안의 테스트들은 같은 MockProvider 상태를 공유하니 시나리오 순서대로 작성할 것.
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClientLayout from '../components/layout/ClientLayout'
import InternalLayout from '../components/layout/InternalLayout'
import AreaBoardPage from '../pages/AreaBoardPage'
import ClientConfirmQueuePage from '../pages/ClientConfirmQueuePage'
import ClientStatusPage from '../pages/ClientStatusPage'
import HomeDashboardPage from '../pages/HomeDashboardPage'
import ItemDetailPage from '../pages/ItemDetailPage'
import NotFoundPage from '../pages/NotFoundPage'
import PlanDocPage from '../pages/PlanDocPage'
import RegistrationPage from '../pages/RegistrationPage'
import SchedulePage from '../pages/SchedulePage'
import SettingsPage from '../pages/SettingsPage'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

/** 페이지 모듈들이 쓰는 것과 동일한 싱글턴을 MockProvider로 캐스팅해 반환(테스트 arrange용) */
export function mockProvider(): MockProvider {
  return getDataProvider() as MockProvider
}

export function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<InternalLayout />}>
          <Route path="/" element={<HomeDashboardPage />} />
          <Route path="/board/:area" element={<AreaBoardPage />} />
          <Route path="/items/:itemId" element={<ItemDetailPage />} />
          <Route path="/registration" element={<RegistrationPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/plan" element={<PlanDocPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/c/:token" element={<ClientLayout />}>
          <Route index element={<ClientConfirmQueuePage />} />
          <Route path="status" element={<ClientStatusPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
