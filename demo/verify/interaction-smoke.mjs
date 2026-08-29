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

// ── ③ 이번 세션이 바꾼 화면의 핵심 클릭 경로 — 3.18: **행사 유형 4분류**.
//     주최형(DMS) 행사로 전환 → 파트너 보드 **판매 플래너 탭** 3스텝 왕복 →
//     세팅 미완료 행사의 S0 ③ **4카드** 확인. 전부 이번 회차에 새로 생긴 경로다. ──

// 데모 안내 칩은 우하단 고정이라 셀렉터 드롭다운 하단 행과 겹친다 — 사용자와 똑같이 닫고 시작한다
const notice = tab.getByRole('button', { name: '안내 닫기' })
if (await notice.count()) await notice.click()

/** 사이드바 셀렉터로 현재 행사를 바꾼다 — 실제 사용자 경로 그대로(직접 URL 주입 아님) */
async function switchProject(name) {
  await tab.getByRole('button', { name: /현재 행사/ }).click()
  await tab.getByRole('button', { name: new RegExp(name) }).first().click()
  await tab.getByText(name).first().waitFor({ timeout: 10_000 })
}

await switchProject('가상 서밋 2026')
await tab.getByRole('link', { name: /^파트너 보드$/ }).click()
await tab.waitForURL(/#\/partners/, { timeout: 10_000 })

// 판매 플래너 탭은 복합 게이트(주최형 + 판매형 포맷)를 통과한 행사에만 뜬다
const plannerTab = tab.getByRole('button', { name: '판매 플래너' })
await plannerTab.waitFor({ timeout: 10_000 })
await plannerTab.click()

// ① 상품 정의 — 등급 카드에 판매 단가 입력이 있다(내부 전용)
await tab.getByRole('heading', { name: /① 상품 정의/ }).waitFor({ timeout: 10_000 })
const priceInputs = await tab.getByLabel('판매 단가 (내부)').count()
check(priceInputs >= 3, '① 상품 정의 — 등급별 판매 단가 입력', `${priceInputs}개`)
await tab.screenshot({ path: resolve(SHOTS, '03a-planner-step1.png') })

// ② 목표 시뮬레이션 — 만석 기준 합계와 '왜 빠졌는지'가 함께 보인다
await tab.getByRole('button', { name: '다음' }).click()
await tab.getByRole('table', { name: '등급별 판매 계획' }).waitFor({ timeout: 10_000 })
const targetCells = await tab.getByText('200,000,000원').count()
check(targetCells >= 1, '② 시뮬레이션 — 만석 기준 매출 Σ(정원×단가)', `${targetCells}곳`)
const excludedNote = await tab.getByTestId('planner-excluded-note').innerText()
check(
  /silver/.test(excludedNote),
  '② 합계에서 빠진 등급을 숨기지 않고 이유를 적는다',
  excludedNote.trim().slice(0, 40),
)
await tab.screenshot({ path: resolve(SHOTS, '03b-planner-step2.png') })

// ③ 프리셋 확인 — DMS 운영 프리셋 5줄 + 트랙 편성
await tab.getByRole('button', { name: '다음' }).click()
await tab.getByTestId('planner-ops-notes').waitFor({ timeout: 10_000 })
const opsNotes = await tab.getByTestId('planner-ops-notes').locator('li').count()
check(opsNotes === 5, '③ 프리셋 확인 — DMS 운영 프리셋 5줄', `${opsNotes}줄`)
const trackTable = await tab.getByRole('table', { name: '트랙 편성' }).count()
check(trackTable >= 1, '③ 트랙 편성 표', `${trackTable}개`)
await tab.screenshot({ path: resolve(SHOTS, '03c-planner-step3.png') })

// 대행형 행사로 돌아가면 탭 자체가 사라진다 — format 단독 게이트가 아님을 실행으로 확인
await switchProject('샘플 테크 컨퍼런스')
await tab.getByRole('heading', { name: '파트너 보드' }).waitFor({ timeout: 10_000 })
const plannerOnAgency = await tab.getByRole('button', { name: '판매 플래너' }).count()
check(plannerOnAgency === 0, '대행형에서는 판매 플래너 탭 부재(복합 게이트)', `${plannerOnAgency}개`)

// S0 ③ — 세팅 미완료 행사의 유형 4카드
await switchProject('리더십 포럼 하반기')
await tab.evaluate(() => {
  window.location.hash = '#/onboarding'
})
await tab.getByRole('heading', { name: '① 행사개요' }).waitFor({ timeout: 10_000 })
await tab.getByRole('button', { name: '다음' }).click()
await tab.getByRole('heading', { name: '② 담당자' }).waitFor({ timeout: 10_000 })
await tab.getByRole('button', { name: '다음' }).click()
await tab.getByRole('heading', { name: '③ 유형·확인' }).waitFor({ timeout: 10_000 })
const cards = await tab.getByRole('radio').count()
check(cards === 4, 'S0 ③ — 유형 4카드', `${cards}장`)
const assumedBadges = await tab.getByText('가정', { exact: true }).count()
check(assumedBadges === 2, "근거가 약한 프리셋만 '가정' 표기(DMS·전시회)", `${assumedBadges}개`)
await tab.screenshot({ path: resolve(SHOTS, '03d-onboarding-format-cards.png') })

// 전시회 데모 — EX 템플릿이 실제로 전개돼 일정에 EX 코드로 보인다(3.18d, 전부 '가정')
// S0는 사이드바가 없는 독립 화면이라 셀렉터를 쓰려면 먼저 본체로 돌아온다
await tab.evaluate(() => {
  window.location.hash = '#/'
})
await tab.getByRole('button', { name: /현재 행사/ }).waitFor({ timeout: 10_000 })
await switchProject('가상산업박람회 2026')
await tab.getByRole('link', { name: /^일정$/ }).click()
await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
await tab.getByText(/EX-1\b/).first().waitFor({ timeout: 10_000 })
const exCodes = await tab.getByText(/^EX-\d+$/).count()
check(exCodes >= 10, '전시회 — EX WBS 템플릿 전개', `${exCodes}개 코드`)
await tab.screenshot({ path: resolve(SHOTS, '03e-exhibition-ex-wbs.png') })

await browser.close()
server.close()

console.log(`\n캡처: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n상호작용 스모크 전 항목 통과.\n')
