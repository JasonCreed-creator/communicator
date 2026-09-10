#!/usr/bin/env node
// 상호작용 스모크 — `npm run demo:smoke` (CLAUDE.md §7 상시 항목, 3.16.3 T4 신설)
//
// 정적 스크린샷이 못 잡는 것을 실행으로 증명한다. 데모 빌드를 아티팩트와 동일 조건
// (base 태그 + 서브패스 + **charset 미선언** 서빙 — 인코딩은 문서 선두 1KB 프리스캔의
// <meta charset>이 전부)으로 서빙해 Playwright로:
//   ① InfoTip 호버 1곳 표시 + 뷰포트 내 완전 노출 (가장 오른쪽 ⓘ로 클램프를 강제)
//   ② 사이드바 링크 클릭 → aria-current 갱신 + 전체 리로드 0 (SPA 내비 증명)
//   ③ 해당 세션이 바꾼 화면의 핵심 클릭 경로 1개 — 세션마다 아래 "③" 블록을 교체한다
//      (3.18: 판매 플래너 3스텝 · S0 ③ 유형 4카드 · 3.21: 런처 · Phase 4c: 로그인 게이트)
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

// ── ③ 이번 세션이 바꾼 화면의 핵심 클릭 경로 — **견적서 내보내기 2종(2026-09-10)**.
//     S-2 목록에 'Excel 내려받기'·'구글 시트로 만들기'가 나란히 있고, mock 공급자(로그인 없음)에서 시트 버튼은
//     무음 실패 대신 안내 문구(role=alert)를 띄운다(무동작 금지). 에디터 ④에도 같은 두 버튼이 있다.
//     (직전 세션 ③ = 로그인 게이트 — 그 경로는 launcher.test·AuthGate 테스트가 계속 잡는다) ──

// 데모 안내 칩은 우하단 고정이라 카드 하단과 겹칠 수 있다 — 사용자와 똑같이 닫고 시작한다
const notice = tab.getByRole('button', { name: '안내 닫기' })
if (await notice.count()) await notice.click()

const docBeforeQuotes = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/quotes'
})
await tab.getByRole('heading', { name: '견적' }).waitFor({ timeout: 10_000 })
const excelBtn = tab.getByRole('button', { name: 'Excel 내려받기' })
const sheetBtn = tab.getByRole('button', { name: '구글 시트로 만들기' })
check((await excelBtn.count()) === 1 && (await sheetBtn.count()) === 1, 'S-2 목록: Excel 내려받기 · 구글 시트로 만들기 버튼 2종')
check(!(await sheetBtn.isDisabled()), '선택된 견적이 있으면 시트 버튼 활성')
await sheetBtn.click()
const alert = tab.getByRole('alert')
await alert.waitFor({ timeout: 10_000 })
const alertText = (await alert.innerText()).trim()
check(/실서버\(로그인\) 모드에서만/.test(alertText) && /Excel로 내려받으세요/.test(alertText), 'mock: 시트 버튼 → 안내 문구(무음 실패 없음)', alertText)
check((await tab.getByTestId('gsheet-result').count()) === 0, 'mock: 결과 카드(링크) 없음')
check(docRequests.length === docBeforeQuotes, '견적 목록·안내 표시에 전체 리로드 0', `${docBeforeQuotes} → ${docRequests.length}`)
await tab.screenshot({ path: resolve(SHOTS, '03a-quotes-export-buttons.png') })

// 에디터 ④ — 목록에서 '＋ 새 버전'으로 견적 id를 얻고, ?step=4 딥링크로 확인·확정 단계에 진입한다
await tab.getByRole('button', { name: '＋ 새 버전' }).click()
await tab.waitForURL(/#\/quotes\/[^/]+\/edit/, { timeout: 10_000 })
const editHash = await tab.evaluate(() => window.location.hash)
const quoteId = editHash.match(/#\/quotes\/([^/?]+)\/edit/)?.[1]
check(Boolean(quoteId), '＋ 새 버전 → 에디터 진입(견적 id 확보)', quoteId)
await tab.evaluate(() => {
  window.location.hash = '#/quotes'
})
await tab.getByRole('heading', { name: '견적' }).waitFor({ timeout: 10_000 })
await tab.evaluate((id) => {
  window.location.hash = `#/quotes/${id}/edit?step=4`
}, quoteId)
const editorExcel = tab.getByRole('button', { name: /Excel 내려받기/ })
const editorSheet = tab.getByRole('button', { name: /구글 스프레드시트로 만들기/ })
await editorSheet.waitFor({ timeout: 10_000 })
check((await editorExcel.count()) === 1, '에디터 ④: Excel 내려받기 버튼')
check(!(await editorSheet.isDisabled()), '에디터 ④: 저장된 견적이라 시트 버튼 활성')
await editorSheet.click()
await tab.getByRole('alert').waitFor({ timeout: 10_000 })
check(/실서버\(로그인\) 모드에서만/.test((await tab.getByRole('alert').innerText()).trim()), '에디터 ④ mock: 안내 문구')
await tab.screenshot({ path: resolve(SHOTS, '03b-editor-step4-export.png'), fullPage: true })

await browser.close()
server.close()

console.log(`\n캡처: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n상호작용 스모크 전 항목 통과.\n')
