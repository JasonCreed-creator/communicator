#!/usr/bin/env node
// 상호작용 스모크 — `npm run demo:smoke` (CLAUDE.md §7 상시 항목, 3.16.3 T4 신설)
//
// 정적 스크린샷이 못 잡는 것을 실행으로 증명한다. 데모 빌드를 아티팩트와 동일 조건
// (base 태그 + 서브패스 + **charset 미선언** 서빙 — 인코딩은 문서 선두 1KB 프리스캔의
// <meta charset>이 전부)으로 서빙해 Playwright로:
//   ① InfoTip 호버 1곳 표시 + 뷰포트 내 완전 노출 (가장 오른쪽 ⓘ로 클램프를 강제)
//   ② 사이드바 링크 클릭 → aria-current 갱신 + 전체 리로드 0 (SPA 내비 증명)
//   ③ 해당 세션이 바꾼 화면의 핵심 클릭 경로 1개 — 세션마다 아래 "③" 블록을 교체한다
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
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const tab = await ctx.newPage()
const docRequests = []
tab.on('request', (r) => r.resourceType() === 'document' && docRequests.push(r.url()))

console.log(`\n상호작용 스모크 — ${ORIGIN}${DIR} (charset 미선언 서빙)\n`)
await tab.goto(`${ORIGIN}${DIR}`, { waitUntil: 'networkidle' })
await tab.getByText('외관 대형 현수막').first().waitFor({ timeout: 10_000 })
check(true, '홈(S1) 렌더', 'charset 미선언 조건에서 한글 정상')

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

// ── ③ 이번 세션이 바꾼 화면의 핵심 클릭 경로 — 3.16.4: 시나리오 카드 → 빌더 열기 →
//     세션 카드·인라인 대본 표시(목업 화면 B 정합, T1) ──
await tab.getByRole('link', { name: /운영 보드/ }).click()
await tab.waitForURL(/#\/board\/ops/, { timeout: 10_000 })
await tab.getByTestId('ops-doc-card-scenario').getByRole('button', { name: /시나리오/ }).click()
await tab.getByRole('button', { name: '빌더 열기' }).first().click()
// 빌더 헤더(시나리오 — 문서명) + 세션 카드(프로그램표 연동 배지) + 대본 인라인 노출
await tab.getByRole('heading', { name: /시나리오 — 진행 시나리오/ }).waitFor({ timeout: 10_000 })
const linkBadges = await tab.getByText('프로그램표 연동').count()
check(linkBadges >= 3, '세션 카드 — 프로그램표 연동 배지', `${linkBadges}개(RB27 3세션)`)
const inlineScript = await tab.getByText(/MC 무대 인사 및 오프닝 키노트 세션 소개/).count()
check(inlineScript >= 1, '대본 인라인 노출(토글 클릭 없이 본문 표시)', `${inlineScript}건`)
await tab.getByRole('heading', { name: /시나리오 — 진행 시나리오/ }).scrollIntoViewIfNeeded()
await tab.screenshot({ path: resolve(SHOTS, '03-scenario-builder-inline.png') })

await browser.close()
server.close()

console.log(`\n캡처: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n상호작용 스모크 전 항목 통과.\n')
