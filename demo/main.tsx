// 데모 아티팩트 엔트리 — src/main.tsx의 대응물.
//
// 유일한 차이는 라우터 종류다. 아티팩트는 `/_f/{id}/` 하위 경로로 서빙되는데
// BrowserRouter의 기본 basename은 '/'라서 초기 location.pathname('/_f/{id}/')이
// 어떤 라우트와도 매칭되지 않고 `path="*"`(NotFoundPage)로 떨어진다.
// (`<base href>`는 location.pathname을 바꾸지 않으므로 퍼블리셔가 대신 고쳐주지 않는다.)
//
// HashRouter는 초기 위치를 location.hash에서만 읽으므로(해시가 비면 '/') 경로에 독립적이다.
// 게다가 react-router의 createHashHref는 문서에 `<base>`가 있으면 현재 URL 절대 경로 +
// '#/path' 형태를 만들어 주므로, 링크가 아티팩트 디렉터리 밖으로 새지 않는다.
// MemoryRouter도 초기 렌더는 같지만 브라우저 뒤로가기가 아티팩트를 통째로 벗어나므로 쓰지 않는다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import '../src/index.css'
import DemoNotice from './DemoNotice'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppRoutes />
    </HashRouter>
    <DemoNotice />
  </StrictMode>,
)
