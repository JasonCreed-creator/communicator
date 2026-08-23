// DoD 컴포넌트 테스트 공용 헬퍼.
// App.tsx와 동일한 라우트 표를 MemoryRouter로 렌더한다(App은 BrowserRouter라 initialEntries 주입 불가).
// 주의: 페이지 모듈들이 모듈 스코프에서 getDataProvider()를 캡처하므로,
// 픽스처 초기화 단위 = 테스트 "파일"이다(vitest가 파일별로 모듈 레지스트리를 격리).
// 한 파일 안의 테스트들은 같은 MockProvider 상태를 공유하니 시나리오 순서대로 작성할 것.
// v1.5: 내부 라우트는 App.tsx처럼 ProjectProvider 스코프 안 — 현재 행사는 localStorage
// 'communicator.currentProjectId'(파일별 jsdom에서 초기 비어 있음 → 첫 active 행사 = 샘플 테크).
import { render } from '@testing-library/react'
import { MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import ClientLayout from '../components/layout/ClientLayout'
import InternalLayout from '../components/layout/InternalLayout'
import OnboardingGuard from '../components/onboarding/OnboardingGuard'
import { ProjectProvider } from '../context/ProjectContext'
import AreaBoardPage from '../pages/AreaBoardPage'
import ClientConfirmQueuePage from '../pages/ClientConfirmQueuePage'
import ClientStatusPage from '../pages/ClientStatusPage'
import HomeDashboardPage from '../pages/HomeDashboardPage'
import ItemDetailPage from '../pages/ItemDetailPage'
import NotFoundPage from '../pages/NotFoundPage'
import OnboardingPage from '../pages/OnboardingPage'
import PlanDocPage from '../pages/PlanDocPage'
import LegacyGonePage from '../pages/LegacyGonePage'
import ProjectListPage from '../pages/ProjectListPage'
import QuoteEditorPage from '../pages/QuoteEditorPage'
import QuotesPage from '../pages/QuotesPage'
import RegistrationPage from '../pages/RegistrationPage'
import SchedulePage from '../pages/SchedulePage'
import SettingsPage from '../pages/SettingsPage'
import SettlementPage from '../pages/SettlementPage'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

/** 페이지 모듈들이 쓰는 것과 동일한 싱글턴을 MockProvider로 캐스팅해 반환(테스트 arrange용) */
export function mockProvider(): MockProvider {
  return getDataProvider() as MockProvider
}

function ProjectScope() {
  return (
    <ProjectProvider>
      <Outlet />
    </ProjectProvider>
  )
}

export function renderRoute(path: string) {
  // 기본 선택 행사 = ① 샘플 테크(픽스처 정본) — 이미 선택값이 있으면 존중(dod18 전환·유지 검증용)
  try {
    if (!localStorage.getItem('communicator.currentProjectId')) {
      localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    }
  } catch {
    // jsdom 외 환경 무시
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProjectScope />}>
          {/* S0 온보딩 위저드 — 가드 대상 제외 (App.tsx와 동일 구성) */}
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route element={<InternalLayout />}>
            {/* v1.5: S-1·행사 설정은 OnboardingGuard 밖 (세팅 미완료 행사도 접근) */}
            <Route path="/projects" element={<ProjectListPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* v2.0 S-2 견적 — App.tsx와 동일하게 가드 밖, app_role 게이트는 QuoteGate */}
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/quotes/:quoteId/edit" element={<QuoteEditorPage />} />

            <Route element={<OnboardingGuard />}>
              <Route path="/" element={<HomeDashboardPage />} />
              <Route path="/board/:area" element={<AreaBoardPage />} />
              <Route path="/items/:itemId" element={<ItemDetailPage />} />
              <Route path="/registration" element={<RegistrationPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/plan" element={<PlanDocPage />} />
              {/* v2.2 S-10 정산보드 */}
              <Route path="/settlement" element={<SettlementPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/c/:token" element={<ClientLayout />}>
          <Route index element={<ClientConfirmQueuePage />} />
          <Route path="status" element={<ClientStatusPage />} />
        </Route>

        {/* v2.0 §10 — 옛 Configurator 라우트 리다이렉트 (App.tsx와 동일 구성) */}
        <Route path="/quote" element={<Navigate to="/quotes" replace />} />
        <Route path="/configurator" element={<Navigate to="/quotes" replace />} />
        <Route path="/setup" element={<Navigate to="/onboarding" replace />} />
        <Route path="/events" element={<Navigate to="/projects" replace />} />
        <Route path="/events/:id" element={<Navigate to="/projects" replace />} />
        <Route path="/events/:id/soc" element={<LegacySocRedirect />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// App.tsx LegacySocRedirect와 동일 — `?client_view=1` 공유 링크는 410 안내(§12 ④)
function LegacySocRedirect() {
  const location = useLocation()
  if (new URLSearchParams(location.search).get('client_view') === '1') return <LegacyGonePage />
  return <Navigate to="/schedule" replace />
}
