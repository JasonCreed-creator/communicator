// 데모 아티팩트 빌드 설정 — `npx vite build --config vite.demo.config.ts`
// 앱 빌드(vite.config.ts)와 완전히 분리되어 있으므로 Vercel 배포 산출물에 영향이 없다.
//
// 산출: dist-demo/artifact.html 한 파일(외부 요청 0건). Artifact 툴에 이 경로를 넘긴다.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { inlineBrandAssets, singleFileArtifact } from './demo/plugins'

export default defineConfig({
  // envDir을 demo/로 고정 — 루트에 .env(.local)가 생겨도 데모 빌드에 새어들지 않는다.
  // (providers/index.ts는 VITE_DATA_PROVIDER가 'mock'이 아니면 throw → 백스크린)
  envDir: 'demo',
  // public/은 아티팩트에서 URL로 접근할 수 없다 — 복사 자체를 끈다(브랜드 PNG는 인라인됨).
  publicDir: false,
  plugins: [inlineBrandAssets(), react(), tailwindcss(), singleFileArtifact()],
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    // 소스맵은 별도 파일이자 외부 참조가 되므로 금지.
    sourcemap: false,
    // 단일 파일이므로 modulepreload 폴리필 불필요 — 번들의 유일한 fetch() 호출도 사라진다.
    modulePreload: false,
    // CSS를 청크별로 쪼개지 않고 한 자산으로 모은다(플러그인이 1개를 전제).
    cssCodeSplit: false,
    // 인라인 임계값을 올려 혹시 모를 소형 자산도 data: URI로 접히게 한다.
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: {
      input: 'demo/index.html',
      output: {
        // exceljs·file-saver의 동적 import()를 본 청크에 접는다.
        // 이게 없으면 아티팩트가 존재하지 않는 /assets/exceljs.min-*.js를 런타임에 요청한다.
        inlineDynamicImports: true,
      },
    },
  },
})
