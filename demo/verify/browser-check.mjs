#!/usr/bin/env node
// 실제 브라우저 런타임 증명 — `npm run demo:check:browser`
//
// 정적 검사(check-artifact.mjs)가 못 잡는 것을 잡는다:
//   · 중첩 경로 /_f/{id}/ 에서 첫 화면이 정말 홈 대시보드인가 (404가 아닌가)
//   · 네트워크 요청이 정말 문서 1건뿐인가 (외부 오리진 포함, 브라우저가 실제로 보낸 것 기준)
//   · 콘솔 에러·미처리 예외가 0건인가
//   · 해시 내비게이션이 아티팩트 디렉터리를 벗어나지 않는가
// 실패 시 exit 1. 스크린샷은 dist-demo/shots/ 에 남는다.
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// playwright는 레포 의존이 아니다(CLAUDE.md §2 스택 고정) — 설치돼 있을 때만 돈다.
// 없으면 건너뛰고 exit 0: `npm run demo` 체인이 새 클론에서 깨지지 않게 한다.
let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.log(
    '\n건너뜀 — playwright 미설치. 브라우저 검증을 돌리려면:\n' +
      '  npm i --no-save playwright   (브라우저는 PLAYWRIGHT_BROWSERS_PATH의 것을 쓴다)\n' +
      '정적 검증(demo:check)·라우팅 검증(demo:check:routing)은 이것 없이도 전부 돈다.\n',
  )
  process.exit(0)
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FILE = process.argv[2] ?? resolve(REPO_ROOT, 'dist-demo/artifact.html')
const SHOTS = resolve(REPO_ROOT, 'dist-demo/shots')
const DIR = '/_f/1787393172-408d/'
const PORT = 4183
const ORIGIN = `http://localhost:${PORT}`

const problems = []
const check = (pass, label, detail) => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!pass) problems.push(label)
}

// ── 퍼블리셔 셸을 그대로 재현해 서빙 ──
const body = readFileSync(FILE, 'utf8')
const page =
  `<!doctype html><html><head><base href="${DIR}">` +
  `<meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>:root{color-scheme:light}body{margin:0;padding:0;background:#faf9f5;color:#141413}` +
  `img{max-width:100%}</style></head><body>${body}</body></html>`

// §13b(v2.4.1) no-charset 케이스: 빌드 산출물을 **래퍼 없이** Content-Type에 charset 없이
// 그대로 서빙한다 — 이때 인코딩은 문서 선두 1,024바이트 프리스캔의 <meta charset>이 전부다.
// 2026-08-27 감수 실증: 메타가 51KB 지점이면 이 서빙에서 한글 정규식 SyntaxError로 전면 백지.
const NC_DIR = '/_nc/'
const served = []
const server = createServer((req, res) => {
  served.push(req.url)
  if (req.url === DIR) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
  } else if (req.url === NC_DIR) {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(Buffer.from(body, 'utf8'))
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
})
await new Promise((r) => server.listen(PORT, r))

mkdirSync(SHOTS, { recursive: true })
// 사전 설치된 Chromium을 쓰는 환경(원격 세션 등)에서는 playwright 패키지 버전과 브라우저 빌드
// 번호가 어긋나 기본 launch()가 실패한다. PLAYWRIGHT_CHROMIUM_PATH가 있으면 그 실행 파일을 쓴다.
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {}
const browser = await chromium.launch(launchOpts)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const tab = await ctx.newPage()

const requests = []
const consoleErrors = []
const pageErrors = []
tab.on('request', (r) => requests.push(`${r.method()} ${r.url()}`))
tab.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
tab.on('pageerror', (e) => pageErrors.push(String(e)))

console.log(`\n브라우저 런타임 검증 — ${ORIGIN}${DIR}\n`)
await tab.goto(`${ORIGIN}${DIR}`, { waitUntil: 'networkidle' })

// ── 1. 첫 화면이 홈 대시보드(S1)인가 ──
const notFound = await tab.getByText('페이지를 찾을 수 없습니다').count()
check(notFound === 0, '첫 화면이 404가 아님', `NotFound 노드 ${notFound}개`)
await tab.getByText('외관 대형 현수막').first().waitFor({ timeout: 10_000 })
check(true, '홈 대시보드(S1) 렌더', '데모 기본 행사(RE:BUILD 27)의 미결 컨펌 카드 확인')

// ── 2. 네트워크 요청이 문서 1건뿐인가 ──
check(requests.length === 1, '브라우저 네트워크 요청', `${requests.length}건 → ${requests.join(' | ')}`)
check(served.length === 1, '서버가 받은 요청', `${served.length}건 → ${served.join(' | ')}`)
const external = requests.filter((r) => !r.includes(ORIGIN))
check(external.length === 0, '외부 오리진 요청', `${external.length}건 ${external.join(' | ')}`)

// ── 3. 에러 0건 ──
check(pageErrors.length === 0, '미처리 예외', pageErrors.slice(0, 3).join(' | ') || '0건')
check(consoleErrors.length === 0, '콘솔 에러', consoleErrors.slice(0, 3).join(' | ') || '0건')

// ── 4. 브랜드 로고가 텍스트 폴백이 아니라 실제 이미지인가 ──
const logo = tab.locator('img[alt="Remember"]').first()
const logoOk = await logo.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false)
check(logoOk, '브랜드 로고 이미지 디코드', logoOk ? 'naturalWidth > 0 (data: URI)' : '폴백/실패')

// ── 5. 해시 내비게이션이 아티팩트 디렉터리 안에 머무는가 ──
await tab.screenshot({ path: resolve(SHOTS, '01-home.png'), fullPage: false })
await tab.getByRole('link', { name: /일정/ }).first().click()
await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
const url = new URL(tab.url())
check(url.pathname === DIR, '이동 후 pathname 불변', url.pathname)
check(url.hash === '#/schedule', '해시로만 이동', url.hash)
await tab.getByText(/컴플라이언스|R&R|체크리스트/).first().waitFor({ timeout: 10_000 })
check(true, 'S5 일정 화면 렌더', 'WBS 보드 확인')
await tab.screenshot({ path: resolve(SHOTS, '02-schedule.png') })

// ── 6. 새로고침해도 같은 화면으로 복귀하는가(해시 딥링크) ──
await tab.reload({ waitUntil: 'networkidle' })
check(tab.url().endsWith('#/schedule'), '새로고침 후 딥링크 유지', tab.url().replace(ORIGIN, ''))

// ── 7. 발주처 뷰(375px) ──
await tab.setViewportSize({ width: 375, height: 812 })
await tab.goto(`${ORIGIN}${DIR}#/c/demo`, { waitUntil: 'networkidle' })
await tab.getByText('메인 키비주얼').first().waitFor({ timeout: 10_000 })
check(true, '발주처 컨펌 큐(S7) 375px 렌더', '/c/demo 토큰 경로')
await tab.screenshot({ path: resolve(SHOTS, '03-client-375.png'), fullPage: false })

// ── 8. 견적 화면(S-2) ──
await tab.setViewportSize({ width: 1440, height: 900 })
await tab.goto(`${ORIGIN}${DIR}#/quotes`, { waitUntil: 'networkidle' })
await tab.waitForTimeout(500)
const quoteDenied = await tab.getByText('페이지를 찾을 수 없습니다').count()
check(quoteDenied === 0, '견적(S-2) 라우트 도달', `NotFound ${quoteDenied}개`)
await tab.screenshot({ path: resolve(SHOTS, '04-quotes.png') })

// 전체 여정 동안 추가 요청이 없었는지 재확인
check(requests.length <= 3, '여정 전체 네트워크 요청', `${requests.length}건(문서+새로고침만)`)

// ── 9. §13b — charset 미명시 서빙에서도 전 화면이 렌더되는가 ──
const ncTab = await ctx.newPage()
const ncErrors = []
ncTab.on('pageerror', (e) => ncErrors.push(String(e)))
await ncTab.setViewportSize({ width: 1440, height: 900 })
await ncTab.goto(`${ORIGIN}${NC_DIR}`, { waitUntil: 'networkidle' })
await ncTab.getByText('외관 대형 현수막').first().waitFor({ timeout: 10_000 })
check(true, 'no-charset 서빙: 홈(S1) 렌더', '프리스캔 1KB 안의 <meta charset>이 인코딩을 확정')
await ncTab.goto(`${ORIGIN}${NC_DIR}#/schedule`, { waitUntil: 'networkidle' })
await ncTab.getByText(/컴플라이언스|R&R|체크리스트/).first().waitFor({ timeout: 10_000 })
check(true, 'no-charset 서빙: 일정(S5) 렌더', '해시 라우팅 정상')
await ncTab.goto(`${ORIGIN}${NC_DIR}#/p/demo-partner`, { waitUntil: 'networkidle' })
await ncTab.getByText('제출 현황').first().waitFor({ timeout: 10_000 })
check(true, 'no-charset 서빙: 파트너 포털 렌더', '한글 정규식 포함 번들 파싱 정상')
check(ncErrors.length === 0, 'no-charset 서빙: 미처리 예외', ncErrors.slice(0, 3).join(' | ') || '0건')

await browser.close()
server.close()

console.log(`\n스크린샷: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n브라우저 검증 전 항목 통과.\n')
