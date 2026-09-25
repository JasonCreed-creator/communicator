import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { relocateIntoBase } from './lib/basePath'
import './index.css'

// Phase 4.4 — 하위 경로로 빌드된 앱을 기본 경로 밖(Vercel 주소 루트·옛 링크 /home 등)으로 열면 기본 경로 아래로 옮긴다.
// 루트 배포(기본)에서는 아무 일도 하지 않는다.
const relocated = relocateIntoBase(window.location.pathname, window.location.search, window.location.hash)
if (relocated) {
  window.location.replace(relocated)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
