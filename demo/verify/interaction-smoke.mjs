#!/usr/bin/env node
// 상호작용 스모크 — `npm run demo:smoke` (CLAUDE.md §7 상시 항목, 3.16.3 T4 신설)
//
// 정적 스크린샷이 못 잡는 것을 실행으로 증명한다. 데모 빌드를 아티팩트와 동일 조건
// (base 태그 + 서브패스 + **charset 미선언** 서빙 — 인코딩은 문서 선두 1KB 프리스캔의
// <meta charset>이 전부)으로 서빙해 Playwright로:
//   ① InfoTip 호버 1곳 표시 + 뷰포트 내 완전 노출 (가장 오른쪽 ⓘ로 클램프를 강제)
//   ② 사이드바 링크 클릭 → aria-current 갱신 + 전체 리로드 0 (SPA 내비 증명)
//   ③ 해당 세션이 바꾼 화면의 핵심 클릭 경로 1개 — 세션마다 아래 "③" 블록을 교체한다
//      (3.18: 판매 플래너 3스텝 · S0 ③ 유형 4카드)
// 캡처는 dist-demo/shots-interaction/ 에 남긴다. 실패 시 exit 1.
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// playwright는 레포 의존이 아니다(CLAUDE.md §2 스택 고정) — 설치돼 있을 때만 돈다.
let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.log(
    '\n건너뜀 — playwright 미설치. 상호작용 스모크를 돌리려면:\n' +
      '  npm i --no-save playwright   (브라우저는 PLAYWRIGHT_BROWSERS_PATH의 것을 쓴다)\n',
  )
  process.exit(0)
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FILE = process.argv[2] ?? resolve(REPO_ROOT, 'dist-demo/artifact.html')
const SHOTS = resolve(REPO_ROOT, 'dist-demo/shots-interaction')
const DIR = '/_f/1787393172-408d/'
const PORT = 4184
const ORIGIN = `http://localhost:${PORT}`

const problems = []
const check = (pass, label, detail) => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!pass) problems.push(label)
}

// ── 아티팩트 동일 조건 서빙: base+서브패스, 셸·Content-Type 어디에도 charset 선언 없음 ──
const body = readFileSync(FILE, 'utf8')
const page =
  `<!doctype html><html><head><base href="${DIR}">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>:root{color-scheme:light}body{margin:0;padding:0;background:#faf9f5;color:#141413}` +
  `img{max-width:100%}</style></head><body>${body}</body></html>`
const server = createServer((req, res) => {
  if (req.url === DIR || req.url === DIR.slice(0, -1)) {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(Buffer.from(page, 'utf8'))
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
const docRequests = []
tab.on('request', (r) => r.resourceType() === 'document' && docRequests.push(r.url()))

console.log(`\n상호작용 스모크 — ${ORIGIN}${DIR} (charset 미선언 서빙)\n`)
await tab.goto(`${ORIGIN}${DIR}`, { waitUntil: 'networkidle' })
await tab.getByRole('link', { name: '견적 컨피규레이터 들어가기' }).waitFor({ timeout: 10_000 })
check(true, '제품 런처(S-00) 렌더', 'charset 미선언 조건에서 한글 정상')
await tab.getByRole('link', { name: 'MICE 커뮤니케이터 들어가기' }).click()
await tab.waitForURL(/#\/home$/, { timeout: 10_000 })
await tab.getByText('외관 대형 현수막').first().waitFor({ timeout: 10_000 })
check(true, '런처 → 홈(S1) 렌더', '커뮤니케이터 카드가 홈 대시보드에 닿는다')

// ── ① InfoTip 호버 — 가장 오른쪽 ⓘ에서 뷰포트 내 완전 노출 ──
// 3.16.3 T1 재현 화면: 운영 보드 헤더 우측 ⓘ(실측 x1244+w240=1484>1440로 잘렸던 곳)
await tab.getByRole('link', { name: /운영 보드/ }).click()
await tab.waitForURL(/#\/board\/ops/, { timeout: 10_000 })
await tab.waitForTimeout(300)
const tips = await tab.locator('button[aria-label="도움말"]').all()
let rightmost = null
let rightmostBox = null
for (const t of tips) {
  if (!(await t.isVisible())) continue
  const b = await t.boundingBox()
  if (b && (!rightmostBox || b.x > rightmostBox.x)) {
    rightmost = t
    rightmostBox = b
  }
}
check(!!rightmost, 'InfoTip ⓘ 존재(운영 보드)', rightmostBox ? `가장 오른쪽 x=${Math.round(rightmostBox.x)}` : '0개')
await rightmost.hover()
const tooltip = tab.locator('[role="tooltip"]')
await tooltip.waitFor({ timeout: 5_000 })
const tipBox = await tooltip.boundingBox()
check(!!tipBox, 'InfoTip 호버 시 툴팁 표시', tipBox ? `bbox x=${Math.round(tipBox.x)} w=${Math.round(tipBox.width)}` : '없음')
if (tipBox) {
  const within =
    tipBox.x >= 0 && tipBox.y >= 0 && tipBox.x + tipBox.width <= 1440 && tipBox.y + tipBox.height <= 900
  check(
    within,
    '툴팁이 뷰포트 안에 완전 노출(클램프 동작)',
    `x ${Math.round(tipBox.x)}..${Math.round(tipBox.x + tipBox.width)} / 1440, y ${Math.round(tipBox.y)}..${Math.round(tipBox.y + tipBox.height)} / 900`,
  )
}
await tab.screenshot({ path: resolve(SHOTS, '01-tooltip-clamp.png') })

// ── ② 사이드바 링크: hover 배경 + 클릭 → aria-current 갱신 + 전체 리로드 0 ──
await tab.evaluate(() => {
  window.__spaMarker = 'alive'
})
const scheduleLink = tab.locator('aside nav a', { hasText: '일정' }).first()
const rowSpan = scheduleLink.locator('span').first()
const bgBefore = await rowSpan.evaluate((el) => getComputedStyle(el).backgroundColor)
await scheduleLink.hover()
await tab.waitForTimeout(250) // transition-colors 완료 대기
const bgHover = await rowSpan.evaluate((el) => getComputedStyle(el).backgroundColor)
check(
  bgHover !== bgBefore && bgHover !== 'rgba(0, 0, 0, 0)',
  '사이드바 hover 배경 하이라이트',
  `${bgBefore} → ${bgHover}`,
)
await tab.screenshot({ path: resolve(SHOTS, '02-sidebar-hover.png') })

const docCountBefore = docRequests.length
await scheduleLink.click()
await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
const ariaCurrent = await scheduleLink.getAttribute('aria-current')
check(ariaCurrent === 'page', '클릭 후 aria-current="page" 갱신', `aria-current=${ariaCurrent}`)
const marker = await tab.evaluate(() => window.__spaMarker)
check(marker === 'alive', '전체 리로드 0 (SPA 마커 생존)', `marker=${marker}`)
check(
  docRequests.length === docCountBefore,
  '전체 리로드 0 (document 요청 증가 없음)',
  `${docCountBefore} → ${docRequests.length}`,
)

// ── ③ 이번 세션이 바꾼 화면의 핵심 클릭 경로 — S-00 **제품 런처**(도메인 루트, 2026-09-04).
//     "같은 도메인에서 선택하여 각각 진입"이 실제로 도는지: 런처 → 견적 컨피규레이터(#/quotes) →
//     사이드바 로고로 런처 복귀 → MICE 커뮤니케이터(#/home) → 사이드바 '홈'이 /home으로 활성. ──

// 데모 안내 칩은 우하단 고정이라 카드 하단과 겹칠 수 있다 — 사용자와 똑같이 닫고 시작한다
const notice = tab.getByRole('button', { name: '안내 닫기' })
if (await notice.count()) await notice.click()

// 사이드바 로고 = 런처 복귀 경로(제품을 갈아타는 자리)
const logoLink = tab.locator('aside a[aria-label="제품 선택으로"]')
check((await logoLink.count()) === 1, '사이드바 로고가 제품 선택(런처) 링크', `${await logoLink.count()}개`)
await logoLink.click()
await tab.waitForURL(/#\/$/, { timeout: 10_000 })
await tab.getByRole('heading', { name: '어떤 도구로 시작할까요?' }).waitFor({ timeout: 10_000 })
const shellOnLauncher = await tab.locator('aside nav').count()
check(shellOnLauncher === 0, '런처는 제품 셸(사이드바) 밖의 중립 지면', `nav ${shellOnLauncher}개`)
const ctaOnLauncher = await tab.locator('.btn-accent, .btn-primary').count()
check(ctaOnLauncher === 0, '런처 CTA — 카드 전체가 링크(accent 버튼 0개)', `${ctaOnLauncher}개`)
await tab.screenshot({ path: resolve(SHOTS, '03a-launcher.png') })

// 견적 컨피규레이터 카드 → S-2 (mock 사용자 = sales, QuoteGate 통과)
const docBeforeQuote = docRequests.length
await tab.getByRole('link', { name: '견적 컨피규레이터 들어가기' }).click()
await tab.waitForURL(/#\/quotes$/, { timeout: 10_000 })
await tab.getByRole('heading', { name: '견적' }).waitFor({ timeout: 10_000 })
check(true, '런처 → 견적 컨피규레이터(#/quotes)', '견적(S-2) 헤딩 확인')
check(docRequests.length === docBeforeQuote, '런처 → 견적 전환에 전체 리로드 0', `${docBeforeQuote} → ${docRequests.length}`)
const quoteNavActive = await tab.locator('aside nav a[aria-current="page"]').innerText()
check(/견적/.test(quoteNavActive), '견적 진입 후 사이드바 활성 항목 = 견적', quoteNavActive.trim())
await tab.screenshot({ path: resolve(SHOTS, '03b-launcher-to-quotes.png') })

// 로고로 런처 복귀 → MICE 커뮤니케이터 카드 → S1 홈, 사이드바 '홈'(/home) 활성
await tab.locator('aside a[aria-label="제품 선택으로"]').click()
await tab.getByRole('link', { name: 'MICE 커뮤니케이터 들어가기' }).waitFor({ timeout: 10_000 })
await tab.getByRole('link', { name: 'MICE 커뮤니케이터 들어가기' }).click()
await tab.waitForURL(/#\/home$/, { timeout: 10_000 })
await tab.getByRole('heading', { name: '홈 대시보드' }).waitFor({ timeout: 10_000 })
const homeLink = tab.locator('aside nav a', { hasText: '홈' }).first()
check((await homeLink.getAttribute('href') ?? '').endsWith('#/home'), "사이드바 '홈' 링크 = #/home", await homeLink.getAttribute('href'))
check((await homeLink.getAttribute('aria-current')) === 'page', "런처 → 커뮤니케이터 후 '홈' aria-current=page")
await tab.screenshot({ path: resolve(SHOTS, '03c-launcher-to-home.png') })

// 옛 견적 주소는 런처를 거치지 않는다(§10 리다이렉트 표 불변)
await tab.evaluate(() => {
  window.location.hash = '#/configurator'
})
await tab.waitForURL(/#\/quotes$/, { timeout: 10_000 })
check(true, '옛 주소 #/configurator → #/quotes (런처 경유 없음)')

await browser.close()
server.close()

console.log(`\n캡처: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n상호작용 스모크 전 항목 통과.\n')
