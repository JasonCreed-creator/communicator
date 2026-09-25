import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { normalizeBasePath } from './src/lib/basePath'

// Phase 4.4 — 하위 경로 배포(회사 도메인 /leadgen/communicator/). VITE_BASE_PATH가 없으면 '/'(지금과 같음).
// Vercel은 env를 빌드 프로세스에 싣고, 로컬은 .env 파일에서 읽는다(loadEnv).
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    base: normalizeBasePath(env.VITE_BASE_PATH),
    plugins: [react(), tailwindcss()],
  }
})
