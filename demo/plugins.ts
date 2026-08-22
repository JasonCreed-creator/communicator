// 데모 아티팩트 전용 Vite 플러그인 2종 — vite.demo.config.ts에서만 쓴다.
// 앱 소스(src/)는 건드리지 않는다: 브랜드 경로 치환은 빌드 타임 transform으로,
// 단일 파일 조립은 generateBundle에서 수행한다.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

function pngDataUri(relPath: string): string {
  const bytes = readFileSync(resolve(REPO_ROOT, relPath))
  return `data:image/png;base64,${bytes.toString('base64')}`
}

/**
 * `/brand/*.png` 절대 경로를 data: URI로 치환한다.
 *
 * 아티팩트는 `/_f/{id}/` 하위에 서빙되므로 루트 절대 경로는 오리진 루트로 해석돼 404가 난다
 * (BrandLogo는 텍스트 폴백으로 떨어지고, exportEstimate는 로고 없이 출력).
 * `<base href>`는 루트 절대 경로를 재기준화하지 않으므로 빌드 타임 인라인이 유일한 해법.
 *
 * 대상 3곳: BrandLogo.tsx(black/offwhite), exportEstimate.ts(REMEMBER_LOGO_URL).
 * exportEstimate의 `fetch(REMEMBER_LOGO_URL)`은 그대로 둔다 — data: URI는 브라우저 fetch가
 * 지원하고 외부 오리진이 아니므로 DoD 22("외부 http(s) 호출 0건")의 의미도 그대로 유지된다.
 */
export function inlineBrandAssets(): Plugin {
  let table: Array<[string, string]> = []
  let hits = 0

  return {
    name: 'demo:inline-brand-assets',
    enforce: 'pre',
    buildStart() {
      hits = 0
      table = [
        ['/brand/remember-logo-black.png', pngDataUri('public/brand/remember-logo-black.png')],
        ['/brand/remember-logo-offwhite.png', pngDataUri('public/brand/remember-logo-offwhite.png')],
      ]
    },
    transform(code, id) {
      // 쿼리(?raw 등)가 붙은 id는 건드리지 않는다 — 정적 가드 테스트가 읽는 원문 보존.
      if (!/\.[cm]?[jt]sx?$/.test(id) || id.includes('node_modules')) return null
      let out = code
      let touched = false
      for (const [needle, uri] of table) {
        if (out.includes(needle)) {
          out = out.split(needle).join(uri)
          touched = true
          hits++
        }
      }
      return touched ? { code: out, map: null } : null
    },
    buildEnd() {
      // 경로 리터럴이 바뀌면 조용히 404를 배포하게 되므로 빌드를 세운다.
      if (hits < 3) {
        this.error(
          `[demo:inline-brand-assets] /brand/*.png 치환 ${hits}건 — 3건이어야 한다. ` +
            'BrandLogo.tsx·exportEstimate.ts의 경로 리터럴을 확인할 것.',
        )
      }
    },
  }
}

/**
 * 빌드 산출물(HTML+CSS+JS)을 Claude 아티팩트가 요구하는 "본문 조각" 한 파일로 접는다.
 *
 * 아티팩트 퍼블리셔가 `<!doctype html><head>…</head><body>`를 스스로 씌우므로,
 * 문서 셸(doctype/html/head/body)을 넣으면 중첩돼 렌더가 깨진다. 그래서 출력은
 *   <title> · <style> · <div id="root"> · <script type="module">  — 딱 이 4개.
 *
 * 자산이 하나라도 남으면(추가 청크·이미지 등) 에러로 빌드를 세운다 — 런타임 404를
 * 조용히 배포하는 것보다 빌드가 깨지는 편이 안전하다.
 */
export function singleFileArtifact(options: { fileName?: string } = {}): Plugin {
  const fileName = options.fileName ?? 'artifact.html'

  return {
    name: 'demo:single-file-artifact',
    enforce: 'post',
    // order:'post'가 필수다. Vite는 사용자 post 플러그인보다 **뒤에** 내부 플러그인
    // `vite:build-import-analysis`를 등록하는데, 그 generateBundle이 `__VITE_PRELOAD__`
    // 마커를 `void 0`로 치환한다. order를 주지 않으면 이 훅이 먼저 돌아 청크를 bundle에서
    // 지워버리고, Vite는 빈 bundle을 순회해 치환을 못 한다 → 런타임에 미정의 식별자
    // `__VITE_PRELOAD__` 참조로 Excel 내보내기가 ReferenceError로 죽는다.
    generateBundle: {
      order: 'post',
      handler(_outputOptions, bundle) {
        const css: string[] = []
        const js: string[] = []
        const leftovers: string[] = []
        let title = 'MICE 커뮤니케이터'

        for (const [key, output] of Object.entries(bundle)) {
          if (key.endsWith('.html')) {
            const source = String((output as { source?: unknown }).source ?? '')
            const m = source.match(/<title>([\s\S]*?)<\/title>/i)
            if (m) title = m[1].trim()
            delete bundle[key]
            continue
          }
          if (output.type === 'chunk') {
            js.push(output.code)
            delete bundle[key]
            continue
          }
          if (key.endsWith('.css')) {
            css.push(String((output as { source?: unknown }).source ?? ''))
            delete bundle[key]
            continue
          }
          leftovers.push(key)
        }

        if (leftovers.length > 0) {
          this.error(
            `[demo:single-file-artifact] 인라인하지 못한 자산 ${leftovers.length}건: ` +
              `${leftovers.join(', ')} — 아티팩트는 자가완결이어야 한다.`,
          )
        }
        if (js.length !== 1) {
          this.error(
            `[demo:single-file-artifact] JS 청크가 ${js.length}개 — 1개여야 한다. ` +
              'build.rollupOptions.output.inlineDynamicImports 설정을 확인할 것.',
          )
        }
        if (css.length !== 1) {
          this.error(
            `[demo:single-file-artifact] CSS 자산이 ${css.length}개 — 1개여야 한다. ` +
              'build.cssCodeSplit=false 설정을 확인할 것.',
          )
        }

        const styleText = css[0]
        if (/<\/style/i.test(styleText)) {
          this.error('[demo:single-file-artifact] CSS에 `</style` 문자열이 있어 인라인할 수 없다.')
        }

        // 인라인 <script> 안의 `</script`는 스크립트를 조기 종료시키므로 이스케이프한다.
        // 문자열·정규식·템플릿 리터럴 어디에서든 `<\/script`는 같은 값이므로 실행 결과는 불변.
        //
        // U+FFFD(치환 문자)도 함께 이스케이프한다. exceljs 의존(string_decoder·saxes)이
        // 이 문자를 소스에 리터럴로 갖고 있는데, 아티팩트 발행 파이프라인이 이를 깨진 인코딩으로
        // 보고 업로드를 400(unpaired escape sequences)으로 거절한다. `�`는 동일한 값이라
        // 실행 결과는 불변이며, 문자열·정규식 어느 문맥에서도 유효한 이스케이프다.
        const scriptText = js[0]
          .replace(/<\/script/gi, '<\\/script')
          .replace(/�/g, '\\uFFFD')

        const html =
          `<title>${title}</title>\n` +
          `<style>\n${styleText}\n</style>\n` +
          `<div id="root"></div>\n` +
          `<script type="module">\n${scriptText}\n</script>\n`

        this.emitFile({ type: 'asset', fileName, source: html })
      },
    },
  }
}
