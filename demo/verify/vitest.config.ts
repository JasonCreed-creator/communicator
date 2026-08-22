// 데모 전용 vitest 설정 — 앱 테스트(`npm test`, 312건)와 완전히 분리한다.
// include를 *.check.tsx로 좁혀 두었으므로 이 설정으로만 데모 검증이 돌고,
// 반대로 `npm test`의 기본 include(*.test.*)에는 이 파일들이 절대 잡히지 않는다.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react()],
  test: {
    include: ['demo/verify/**/*.check.tsx'],
    environment: 'jsdom',
    environmentOptions: {
      // 실제 아티팩트 서빙 경로를 그대로 재현한다 — 이 값이 라우팅 증명의 핵심 전제다.
      jsdom: { url: 'https://artifact.example/_f/1787393172-408d/' },
    },
  },
})
