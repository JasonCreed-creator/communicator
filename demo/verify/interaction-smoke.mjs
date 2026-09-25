#!/usr/bin/env node
// 상호작용 스모크 — `npm run demo:smoke` (CLAUDE.md §7 상시 항목, 3.16.3 T4 신설)
//
// 정적 스크린샷이 못 잡는 것을 실행으로 증명한다. 데모 빌드를 아티팩트와 동일 조건
// (base 태그 + 서브패스 + **charset 미선언** 서빙 — 인코딩은 문서 선두 1KB 프리스캔의
// <meta charset>이 전부)으로 서빙해 Playwright로:
//   ① InfoTip 호버 1곳 표시 + 뷰포트 내 완전 노출 (가장 오른쪽 ⓘ로 클램프를 강제)
//   ② 사이드바 링크 클릭 → aria-current 갱신 + 전체 리로드 0 (SPA 내비 증명)
//   ③ 해당 세션이 바꾼 화면의 핵심 클릭 경로 1개 — 세션마다 아래 "③" 블록을 교체한다
//      (3.18: 판매 플래너 3스텝 · S0 ③ 유형 4카드 · 3.21: 런처 · Phase 4c: 로그인 게이트 · 4.2: 견적 내보내기 ·
//       Phase 5: 업로드 3경로 — 파일 선택 여러 개·끌어놓기·Drive 링크 등록 ·
//       3.22: 담당자 배정 카드 — 빼기 → 끌어놓기 배정 · 빼기 → 누르기 배정 ·
//       4.3.1: 업로드 잠금 안내 — 컨펌대기 항목은 고르기·업로드 대신 이유, 헤더 버튼 비활성 ·
//       4.5: 항목 고치기·지우기 — 제목 고쳐 저장 → 이름 입력 확인 후 지우기 → 보드 복귀 ·
//       6: Slack 알림 — 행사 설정 ③ 채널 등록(형식 검증 → 등록 → 가림 표시) · 홈 리마인드는 mock 사실 안내 ·
//       4.7: 협력사 견적서 불러오기 — 가상 엑셀 읽기 → 확인 큐(부가세·버킷·공급가 대조) → 확정 → 이력 ·
//       3.23: UX 개편 — PR-1 기반(날짜 표기·대비) · PR-2 홈 '오늘 할 일' · PR-3 디자인 보드(다음 행동 표·차례 칩·갤러리) ·
//             PR-4 항목 상세(다음 단계 카드·큰 미리보기·⋯ 메뉴·코멘트 공개 범위) · PR-4b 큐시트(행 메뉴·끌어 옮기기·큐 추가·대본 칸) ·
//             PR-5 행사 목록(먼저 확인할 행사·진행 중·종료 묶음·카드 ⋯ 메뉴) ·
//             PR-6 견적 목록(고른 견적 옆 동작·구버전 고치기 막힘)·옵션(체크 카드·막힌 이유·고른 옵션 요약) ·
//             PR-7 정산보드(머리 불러오기·할 일 알림·KPI 검산 배지·원가 없는 그룹행·발주 항목 ⋯ 메뉴) ·
//             PR-8 행사 설정(번호 없는 탭·섹션 목록·고정 저장 바·변경 취소)·온보딩(진행 줄·2열·나중에 하기 확인) ·
//       6.1: Slack 봇 — 행사 설정 ③ 스레드 링크(DM 링크 거부 → 등록 → 채널·Slack에서 열기 → 웹훅 예비 접힘 → 해제) · 담당자 Slack 칸)
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

// ── ③ 이번 세션이 바꾼 화면의 핵심 클릭 경로 — **Phase 6.1 Slack 봇(2026-09-26)**.
//     일정(②에서 도착) → 행사 설정 ③ Slack 카드: DM 채널 링크 → 형식 문구 + '스레드 등록' 비활성 → 스레드 첫 글 링크 → 등록 →
//     채널 id·'Slack에서 열기'(링크 그대로) · 웹훅은 예비로 접힘('예비 웹훅 보기' → 펼침) → '스레드 해제'(확인 수락) → 입력 칸 ·
//     담당자(S-13): Slack 칸 머리 + 비어 있는 사람 '이메일로 자동' → 다시 '일정'으로(아래 ③-이전 블록이 일정에서 시작한다).
{
  const notice61 = tab.getByRole('button', { name: '안내 닫기' })
  if (await notice61.count()) await notice61.click()
  const docBefore = docRequests.length
  await tab.evaluate(() => {
    window.location.hash = '#/settings?tab=integration'
  })
  const card = tab.getByTestId('slack-card')
  await card.waitFor({ timeout: 10_000 })
  check(/스레드에 답글로 남기고, 할 일이 생긴 사람을 멘션합니다/.test(await card.innerText()), 'Slack 카드: 행사 스레드 · 멘션 안내')
  const threadInput = card.getByLabel('Slack 스레드 링크')
  await threadInput.fill('https://acme.slack.com/archives/D0DMCHAN1/p1727251234567890')
  check(
    (await card.getByRole('button', { name: '스레드 등록' }).isDisabled()) && /Slack 스레드 링크가 아닙니다/.test(await card.innerText()),
    'DM 채널 링크 → 형식 문구 + 스레드 등록 비활성',
  )
  const THREAD = 'https://acme.slack.com/archives/C0DEMO001/p1727251234567890'
  await threadInput.fill(THREAD)
  await card.getByRole('button', { name: '스레드 등록' }).click()
  const saved = tab.getByTestId('slack-thread-saved')
  await saved.waitFor({ timeout: 10_000 })
  const openLink = saved.getByRole('link', { name: 'Slack에서 열기' })
  check(/C0DEMO001/.test(await saved.innerText()) && (await openLink.getAttribute('href')) === THREAD, '등록 → 채널 id · Slack에서 열기(링크 그대로)', await saved.innerText())
  check((await tab.getByTestId('slack-webhook-box').count()) === 0, '스레드가 있으면 웹훅(예비)은 접힘')
  await card.getByRole('button', { name: '예비 웹훅 보기' }).click()
  check((await card.getByLabel('Slack 웹훅 주소').count()) === 1, "'예비 웹훅 보기' → 웹훅 칸 펼침")
  check((await card.getByRole('button', { name: '테스트 보내기' }).count()) === 0, 'mock: 테스트 보내기 없음')
  await tab.screenshot({ path: resolve(SHOTS, '03-slack-thread.png'), fullPage: true })
  tab.once('dialog', (d) => d.accept())
  await card.getByRole('button', { name: '스레드 해제' }).click()
  await card.getByLabel('Slack 스레드 링크').waitFor({ timeout: 10_000 })
  check(true, "'스레드 해제' → 입력 칸으로 돌아감")
  await tab.evaluate(() => {
    window.location.hash = '#/people'
  })
  const table = tab.getByRole('table', { name: '담당자 목록' })
  await table.waitFor({ timeout: 10_000 })
  const heads = (await table.locator('thead th').allInnerTexts()).map((t) => t.trim())
  const autoCells = await tab.locator('[data-testid^="person-slack-"]').allInnerTexts()
  check(heads.includes('Slack') && autoCells.length > 0 && autoCells.every((t) => t.trim() === '이메일로 자동'), "담당자: Slack 칸 · 비어 있으면 '이메일로 자동'", `${heads.join('|')} / ${autoCells.length}행`)
  await tab.screenshot({ path: resolve(SHOTS, '03-people-slack.png'), fullPage: true })
  check(docRequests.length === docBefore, 'Slack 카드·담당자 화면 이동·등록에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-8) 행사 설정·온보딩 — 직전 PR ③을 회귀 가드로 유지.
//     일정(②에서 도착) → 행사 설정(RB27): 탭 이름에 번호 없음 · 탭 줄 필수 요약 · 쉴 때 채운 버튼 0 →
//     예상 인원 고치기 → 고정 저장 바 '저장하지 않은 변경 1개 · 예상 인원' + 채운 버튼 = 저장 하나 → 변경 취소로 원래 값 ·
//     세팅 미완료 행사 온보딩(?project=prj-forum-h2): 진행 줄 '3단계 중 1단계 · 필수 4개 중 m개' · 2열 · 채운 버튼 = 다음: 담당자 →
//     장소를 비우면 저장 전에도 개수가 줄고 → '나중에 하기'가 먼저 묻는다(수락) → 행사 목록 → RB27로 되돌리고 '일정'으로.
{
  // 데모 안내 칩은 우하단 고정이라 고정 저장 바의 버튼(변경 취소·저장)과 겹친다 — 사용자와 똑같이 닫고 시작한다
  const notice8 = tab.getByRole('button', { name: '안내 닫기' })
  if (await notice8.count()) await notice8.click()
  const docBefore = docRequests.length
  await tab.evaluate(() => {
    window.location.hash = '#/settings'
  })
  await tab.getByRole('navigation', { name: '개요 섹션' }).waitFor({ timeout: 10_000 })
  let tabsOk = (await tab.getByRole('button', { name: /^[①②③]/ }).count()) === 0
  for (const name of ['개요', '담당자', '유형·연동']) tabsOk &&= (await tab.getByRole('button', { name, exact: true }).count()) === 1
  check(tabsOk, '행사 설정 탭 이름 = 개요 · 담당자 · 유형·연동(번호 없음)')
  const summary = (await tab.getByTestId('required-summary').innerText()).trim()
  check(/^필수 4개 모두 입력됨$|^필수 \d개 남음 — /.test(summary), '탭 줄 오른쪽 필수 요약', summary)
  const restFilled = (await tab.locator('main .btn-accent, main .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(restFilled.length === 0, '행사 설정 쉴 때 채운 버튼 0(저장 바는 바꾼 칸이 있을 때만)', restFilled.join(' · '))
  const headcount = tab.getByLabel('예상 인원', { exact: true })
  const headcountBefore = await headcount.inputValue()
  await headcount.fill(String(Number(headcountBefore || '0') + 20))
  const bar = tab.getByRole('region', { name: '저장하지 않은 변경' })
  await bar.waitFor({ timeout: 10_000 })
  const barText = (await bar.innerText()).replace(/\s+/g, ' ')
  check(/저장하지 않은 변경 1개/.test(barText) && /예상 인원/.test(barText), '예상 인원 고치기 → 고정 저장 바(1개 · 칸 이름)', barText.slice(0, 40))
  const dirtyFilled = (await tab.locator('main .btn-accent, main .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(dirtyFilled.join('|') === '저장', '바꾼 칸이 있으면 채운 버튼 = 저장 하나', dirtyFilled.join(' · '))
  await tab.screenshot({ path: resolve(SHOTS, '03-settings-savebar.png'), fullPage: true })
  await bar.getByRole('button', { name: '변경 취소' }).click()
  check(
    (await tab.getByRole('region', { name: '저장하지 않은 변경' }).count()) === 0 && (await headcount.inputValue()) === headcountBefore,
    '변경 취소 → 원래 값 · 저장 바 사라짐',
  )

  await tab.evaluate(() => {
    window.location.hash = '#/onboarding?project=prj-forum-h2'
  })
  await tab.getByRole('heading', { name: '행사 기본 정보' }).waitFor({ timeout: 10_000 })
  const venue = tab.getByLabel('장소', { exact: true })
  await venue.waitFor({ timeout: 10_000 })
  const progressText = async () => (await tab.getByTestId('onboarding-progress-text').innerText()).replace(/\s+/g, ' ').trim()
  const progress = await progressText()
  check(/^3단계 중 1단계 · 필수 4개 중 \d개 입력$/.test(progress), '온보딩 진행 줄 = n단계 중 k단계 · 필수 4개 중 m개 입력', progress)
  const stepNow = await tab.getByRole('list', { name: '온보딩 단계' }).locator('li[aria-current="step"]').innerText()
  check(/행사 개요/.test(stepNow), '단계 줄 지금 단계 = 행사 개요', stepNow.replace(/\s+/g, ' '))
  check(
    (await tab.getByText('무엇을', { exact: true }).count()) === 1 && (await tab.getByText('언제 · 어디서', { exact: true }).count()) === 1,
    '온보딩 1단계 = 넓은 2열(무엇을 / 언제 · 어디서)',
  )
  const obFilled = (await tab.locator('.btn-accent, .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(obFilled.join('|') === '다음: 담당자', '온보딩 1단계 채운 버튼 = 다음: 담당자 하나', obFilled.join(' · '))
  const filledBefore = Number(/필수 4개 중 (\d)개/.exec(progress)?.[1] ?? '0')
  await venue.fill('')
  // 진행 줄은 폼이 알려 준 개수로 다시 그려진다(한 프레임 뒤) — 바로 읽지 않고 그 글자가 뜨기를 기다린다
  const liveOk = await tab
    .getByTestId('onboarding-progress-text')
    .filter({ hasText: `필수 4개 중 ${filledBefore - 1}개 입력` })
    .waitFor({ timeout: 5_000 })
    .then(
      () => true,
      () => false,
    )
  check(liveOk, '장소를 비우면 저장 전에도 필수 개수가 바로 줄어든다', await progressText())
  await tab.screenshot({ path: resolve(SHOTS, '03-onboarding-step1.png'), fullPage: true })
  let asked = ''
  tab.once('dialog', (d) => {
    asked = d.message()
    d.accept()
  })
  await tab.getByRole('button', { name: '나중에 하기' }).click()
  await tab.getByRole('heading', { name: '행사 목록', exact: true }).waitFor({ timeout: 10_000 })
  check(/저장하지 않은 입력이 있습니다/.test(asked), "저장 안 한 입력이 있으면 '나중에 하기'가 먼저 묻고 → 행사 목록", asked.slice(0, 24))
  check(docRequests.length === docBefore, '행사 설정·온보딩 이동·고치기에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.evaluate(() => {
    window.location.hash = '#/home?project=prj-rebuild27'
  })
  await tab.getByTestId('today-list').waitFor({ timeout: 10_000 })
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-7) 정산보드 — 직전 PR ③을 회귀 가드로 유지.
//     샘플 행사의 정산보드(?project=) → 머리 채운 버튼 1개(협력사 견적서 불러오기) · 최종 마진 칸 '검산 일치' ·
//     견적 초과 알림 '항목 보기' → 시스템 구축이 펼쳐지고 메모 안내 · 발주 항목 ⋯ 메뉴(PM) 열고 Esc · 원가 없는 그룹행 →
//     데모 기본 행사(RB27)로 되돌리고 '일정'으로.
{
  const docBefore = docRequests.length
  await tab.evaluate(() => {
    window.location.hash = '#/settlement?project=prj-stc26'
  })
  await tab.getByTestId('settlement-kpis').waitFor({ timeout: 10_000 })
  await tab.getByRole('button', { name: '협력사 견적서 불러오기' }).waitFor({ timeout: 10_000 })
  await tab.waitForFunction(() => !document.querySelector('main .btn-accent')?.hasAttribute('disabled'), null, { timeout: 10_000 })
  const filled = (await tab.locator('main .btn-accent, main .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(filled.join('|') === '협력사 견적서 불러오기', '정산보드 채운 버튼 1개(협력사 견적서 불러오기)', filled.join(' · '))
  const identity = (await tab.getByTestId('margin-identity').innerText()).trim()
  check(identity === '검산 일치', "최종 마진 칸 '검산 일치' 배지", identity)
  await tab.getByTestId('alert-over-s2').getByRole('button', { name: '항목 보기' }).click()
  const panel = tab.getByTestId('bucket-panel-s2')
  await panel.waitFor({ timeout: 10_000 })
  check(/메모로 이유를 남겨/.test(await panel.getByTestId('over-reason-hint').innerText()), "견적 초과 알림 '항목 보기' → 버킷 펼침 + 메모 안내")
  await panel.getByRole('button', { name: /^발주 항목 메뉴 / }).first().click()
  const menuItems = (await tab.getByRole('menu').first().getByRole('menuitem').allInnerTexts()).map((t) => t.trim())
  check(menuItems.join('|') === '금액·상태 입력|항목 지우기', '발주 항목 ⋯ 메뉴(PM) = 금액·상태 입력 · 항목 지우기', menuItems.join(' · '))
  await tab.keyboard.press('Escape')
  check((await tab.getByRole('menu').count()) === 0, '메뉴 Esc로 닫힘')
  check((await tab.getByTestId('no-cost-group').count()) === 1, "원가 없는 버킷은 그룹행 '원가 없는 항목' 아래")
  await tab.screenshot({ path: resolve(SHOTS, '03-settlement.png'), fullPage: true })
  check(docRequests.length === docBefore, '정산보드 알림·펼침·메뉴에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.evaluate(() => {
    window.location.hash = '#/home?project=prj-rebuild27'
  })
  await tab.getByTestId('today-list').waitFor({ timeout: 10_000 })
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-6) 견적 목록·옵션 — 직전 PR ③을 회귀 가드로 유지.
//     일정(②에서 도착) → 사이드바 '견적' → 채운 버튼 1개(새 견적) · 요약 패널 아래 동작 → v2(구버전) 고르기 → 고치기 막힘 + 이유 →
//     '＋ 새 견적' → 단계 줄 '옵션' → 사회자 체크 → 묶음 머리 '1개 고름 · 150만원' · 옆 요약 '고른 옵션' · 중계는 막힘 + 이유 → 다시 '일정'으로.
{
  const docBefore = docRequests.length
  await tab.locator('aside nav').first().getByRole('link', { name: '견적', exact: true }).click()
  await tab.waitForURL(/#\/quotes$/, { timeout: 10_000 })
  const summary = tab.getByTestId('quote-summary')
  await summary.waitFor({ timeout: 10_000 })
  const filled = (await tab.locator('main .btn-accent, main .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(filled.join('|') === '＋ 새 견적', '견적 목록 채운 버튼 1개(새 견적)', filled.join(' · '))
  check(
    (await summary.getByRole('button', { name: 'Excel 내려받기' }).count()) === 1 &&
      (await summary.getByRole('button', { name: '새 버전으로 고치기' }).count()) === 1,
    '고른 견적에 대한 동작(Excel·고치기)은 요약 패널 아래',
  )
  await tab.getByTestId('quote-row-quo-002').getByRole('button', { name: 'v2' }).click()
  const note = (await summary.getByTestId('quote-edit-note').innerText()).trim()
  check(
    (await summary.getByRole('button', { name: '새 버전으로 고치기' }).isDisabled()) && /이미 있어 이 버전은 고칠 수 없습니다/.test(note),
    '구버전(v2) 고르기 → 고치기 비활성 + 이유',
    note,
  )
  await tab.screenshot({ path: resolve(SHOTS, '03-quotes-list.png'), fullPage: true })
  await tab.getByRole('button', { name: '＋ 새 견적' }).click()
  await tab.waitForURL(/#\/quotes\/new/, { timeout: 10_000 })
  await tab.getByRole('navigation', { name: '견적 단계' }).getByRole('button', { name: /옵션/ }).click()
  await tab.getByTestId('opt-emcee').click()
  const solo = (await tab.getByTestId('opt-solo-summary').innerText()).trim()
  check(solo === '1개 고름 · 150만원', '옵션: 사회자 체크 → 묶음 머리 건수·합계', solo)
  check(/사회자/.test(await tab.getByTestId('editor-picked-options').innerText()), '옆 요약 "고른 옵션"에 사회자')
  const relayReason = (await tab.getByTestId('opt-screenRelay').getByTestId('opt-reason').innerText()).trim()
  check(/LED 화면일 때만/.test(relayReason), '빔프로젝터면 화면중계가 막히고 이유가 카드 안에', relayReason)
  const optFilled = (await tab.locator('main .btn-accent, main .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(optFilled.join('|') === '다음: 확인·확정', '옵션 단계 채운 버튼 1개(다음: 확인·확정)', optFilled.join(' · '))
  await tab.screenshot({ path: resolve(SHOTS, '03-quote-options.png'), fullPage: true })
  check(docRequests.length === docBefore, '견적 목록·옵션 이동·체크에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-5) 행사 목록 — 직전 PR ③을 회귀 가드로 유지.
//     일정(②에서 도착) → 사이드바 '행사 목록' → 세 묶음(먼저 확인할 행사 줄 · 진행 중 카드 · 종료된 행사 접힘) · 채운 버튼 1개 ·
//     카드 ⋯ 메뉴 열고 Esc(카드로 들어가지 않음) → 종료된 행사 펼치기 → 다시 '일정'으로.
{
  const docBefore = docRequests.length
  await tab.locator('aside nav a', { hasText: '행사 목록' }).first().click()
  await tab.waitForURL(/#\/projects/, { timeout: 10_000 })
  await tab.getByTestId('project-card').first().waitFor({ timeout: 10_000 })
  const attention = tab.getByRole('region', { name: '먼저 확인할 행사' })
  const rows = (await attention.getByTestId('setup-row').count()) + (await attention.getByTestId('past-row').count())
  const cards = await tab.getByTestId('project-card').count()
  check(rows > 0 && cards > 0, '행사 목록 세 묶음: 먼저 확인할 행사 줄 + 진행 중 카드', `${rows}줄 · ${cards}장`)
  const filled = (await tab.locator('main .btn-accent, main .btn-primary').allInnerTexts()).map((t) => t.trim())
  check(filled.join('|') === '＋ 새 행사 만들기', '행사 목록 채운 버튼 1개(새 행사 만들기)', filled.join(' · '))
  await tab.getByRole('button', { name: /^행사 메뉴 / }).first().click()
  await tab.getByRole('menu').getByRole('menuitem', { name: '행사 설정 열기' }).waitFor({ timeout: 5_000 })
  await tab.keyboard.press('Escape')
  check((await tab.getByRole('menu').count()) === 0 && /#\/projects/.test(tab.url()), '카드 ⋯ 메뉴 열고 Esc — 카드로 들어가지 않음')
  const closedToggle = tab.getByRole('button', { name: /^종료된 행사 \d+$/ })
  await closedToggle.click()
  await tab.getByRole('button', { name: '종료된 행사 접기' }).waitFor({ timeout: 5_000 })
  check((await tab.getByTestId('project-card').count()) > cards, '종료된 행사 펼치기 → 카드가 늘어난다')
  await tab.screenshot({ path: resolve(SHOTS, '03-project-list.png'), fullPage: true })
  check(docRequests.length === docBefore, '행사 목록 이동·메뉴·펼치기에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-4b) 큐시트 — 직전 PR ③을 회귀 가드로 유지.
//     샘플 행사의 '개막식 큐시트'(dlv-004 — 큐 4개, ?project=로 행사 전환) → 표 머리 7칸 · 행 끝 ⋯ · **실제 브라우저 끌어 옮기기**(C01 → C03 뒤) →
//     맨 위 행 '위로 옮기기'는 막히고 이유 · '큐 추가' → C05 편집 줄 → 시간 넣고 저장 → '대본 모아 보기' → 데모 기본 행사(RB27)로 되돌리고 '일정'으로.
{
  const docBefore = docRequests.length
  await tab.evaluate(() => {
    window.location.hash = '#/items/dlv-004?project=prj-stc26'
  })
  const table = tab.getByTestId('cue-table')
  await table.getByTestId('cue-row').first().waitFor({ timeout: 10_000 })
  const cueNos = async () =>
    tab.evaluate(() =>
      [...document.querySelectorAll('[data-testid="cue-table"] tbody > tr[data-testid="cue-row"]')].map((tr) => tr.querySelectorAll('td')[1]?.textContent ?? ''),
    )
  const head = (await table.locator('thead tr').innerText()).replace(/\s+/g, '')
  check(head === '큐시간구분내용음향조명스크린', '큐시트 표 머리(손잡이·메뉴 칸은 이름 없음)', head)
  const before = await cueNos()
  check(before.join(',') === 'C01,C02,C03,C04', '큐 4행', before.join(','))
  const rowOf = (no) => table.locator('tr[data-testid="cue-row"]', { has: tab.locator('td', { hasText: new RegExp(`^${no}$`) }) })
  // 놓는 자리는 행의 아래 절반 — 그 행 '뒤'로 간다(위 절반이면 '앞')
  await rowOf('C01').dragTo(rowOf('C03'), { targetPosition: { x: 240, y: 44 } })
  await tab.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="cue-table"] tbody > tr[data-testid="cue-row"]')].map((tr) => tr.querySelectorAll('td')[1]?.textContent).join(',') === 'C02,C03,C01,C04',
    null,
    { timeout: 10_000 },
  ).catch(() => undefined)
  const dragged = await cueNos()
  check(dragged.join(',') === 'C02,C03,C01,C04', '실제 브라우저 끌어 옮기기(C01 → C03 뒤)', dragged.join(','))
  await rowOf('C02').getByRole('button', { name: '큐 메뉴 C02' }).click()
  const up = tab.getByRole('menu', { name: '큐 메뉴 C02' }).getByRole('menuitem', { name: /위로 옮기기/ })
  check((await up.isDisabled()) && /맨 위라 안 됨/.test(await up.innerText()), "맨 위 행: '위로 옮기기' 막힘 + 이유")
  await tab.keyboard.press('Escape')
  await tab.getByRole('button', { name: '큐 추가' }).click()
  const editRow = tab.getByTestId('cue-edit-row')
  await editRow.waitFor({ timeout: 10_000 })
  check((await editRow.getByLabel('큐번호').inputValue()) === 'C05', "'큐 추가' → C05 편집 줄이 바로 열림")
  await editRow.getByLabel('시간').fill('10:05')
  await editRow.getByRole('button', { name: '저장' }).click()
  await tab.waitForFunction(() => document.querySelectorAll('[data-testid="cue-table"] tbody > tr[data-testid="cue-row"]').length === 5, null, { timeout: 10_000 })
  check((await cueNos()).at(-1) === 'C05', '저장 → 표 끝에 C05')
  await tab.getByRole('button', { name: '대본 모아 보기' }).click()
  check((await tab.getByTestId('cue-script-panel').getByRole('heading', { name: '대본 전체' }).count()) === 1, "'대본 모아 보기' → 대본 전체")
  await tab.screenshot({ path: resolve(SHOTS, '03-cuesheet.png'), fullPage: true })
  check(docRequests.length === docBefore, '큐시트 끌기·추가·저장에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.evaluate(() => {
    window.location.hash = '#/home?project=prj-rebuild27'
  })
  await tab.getByTestId('today-list').waitFor({ timeout: 10_000 })
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-4) 항목 상세 — 직전 PR ③을 회귀 가드로 유지.
//     일정(②에서 도착) → 컨펌대기 항목(RB27 '외관 대형 현수막') → 다음 단계 카드(5단계 레일 · 4단계 · 발주처 답 기다림) · 머리 = 최신본 내려받기 + ⋯ ·
//     채운 버튼 0 · 큰 미리보기 16:9 · ⋯ 메뉴 열고 Esc · 코멘트 공개 범위 토글 → 공유 안내 → 내부검토 항목(prd-001)에서 채운 버튼 = 컨펌 발송 하나 →
//     다시 '일정'으로(아래 ③-이전 블록이 일정 화면에서 시작한다).
{
  const docBefore = docRequests.length
  await tab.evaluate(() => {
    window.location.hash = '#/items/dlv-rb27-prd-007'
  })
  const card = tab.getByTestId('next-step-card')
  await card.waitFor({ timeout: 10_000 })
  const steps = await card.locator('li[data-step-state]').count()
  const current = (await card.locator('li[aria-current="step"]').innerText()).trim()
  check(steps === 5 && /발주처 컨펌/.test(current), '다음 단계 카드: 5단계 레일 · 지금 = 발주처 컨펌', `${steps}칸 · ${current}`)
  const heading = (await card.getByRole('heading').first().innerText()).trim()
  check(heading === '발주처 답을 기다리는 중', '컨펌대기 = 한 문장 제목', heading)
  const headerLinks = await tab.getByRole('link', { name: '최신본 내려받기' }).count()
  check(headerLinks === 1 && (await tab.getByRole('button', { name: '항목 메뉴' }).count()) === 1, '머리 = 최신본 내려받기 + ⋯ 메뉴')
  const filled = await tab.locator('main .btn-accent, main .btn-primary').count()
  check(filled === 0, '컨펌대기 항목 채운 버튼 0(할 일이 발주처에 있다)', `${filled}개`)
  const box = await tab.getByTestId('version-preview').locator('.aspect-video').boundingBox()
  check(!!box && Math.abs(box.width / box.height - 16 / 9) < 0.02 && box.width > 600, '큰 미리보기 16:9 · 본문 폭', box ? `${Math.round(box.width)}×${Math.round(box.height)}` : '없음')
  await tab.getByRole('button', { name: '항목 메뉴' }).click()
  await tab.getByRole('menu', { name: '항목 메뉴' }).waitFor({ timeout: 5_000 })
  await tab.keyboard.press('Escape')
  check((await tab.getByRole('menu').count()) === 0, '⋯ 메뉴 열고 Esc로 닫힘')
  const thread = tab.getByRole('region', { name: '코멘트' })
  await thread.getByRole('button', { name: '발주처와 공유' }).click()
  const note = (await thread.getByTestId('comment-visibility-note').innerText()).trim()
  check(note === '발주처 화면에도 보입니다.', '코멘트 공개 범위 = 발주처와 공유 → 안내 바뀜', note)
  await tab.screenshot({ path: resolve(SHOTS, '03-item-detail-pending.png'), fullPage: true })
  await tab.evaluate(() => {
    window.location.hash = '#/items/dlv-rb27-prd-001'
  })
  await card.getByRole('heading', { name: '검토하고 발주처로 보낼 차례' }).waitFor({ timeout: 10_000 })
  // 업로드 카드(자체 제출·보기 전환)는 셈에서 뺀다 — vitest DoD 73과 같은 기준
  const filledReview = await tab.evaluate(() =>
    [...document.querySelectorAll('main .btn-accent, main .btn-primary')]
      .filter((el) => !el.closest('#version-upload-form'))
      .map((el) => (el.textContent ?? '').trim()),
  )
  check(filledReview.join('|') === '컨펌 발송', '내부검토 항목: 채운 버튼 = 컨펌 발송 하나(업로드 카드 제외)', filledReview.join(' · '))
  await tab.screenshot({ path: resolve(SHOTS, '03-item-detail-review.png'), fullPage: true })
  check(docRequests.length === docBefore, '항목 상세 이동·메뉴·토글에 전체 리로드 0', `${docBefore} → ${docRequests.length}`)
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-3) 디자인 보드 — 직전 PR ③을 회귀 가드로 유지.
//     일정(②에서 도착) → 사이드바 '디자인 보드' → 표 6열(다음 행동 칸) · 행마다 다음 행동 1줄 · 채운 버튼 1개(＋ 항목 추가) ·
//     '지연만' 칩 → 남은 행 전부 'n일 지남' → 해제 · '갤러리' → 카드 = 행 수 · 썸네일(이미지 또는 빈 자리) → '목록'으로 되돌리고
//     다시 '일정'으로(아래 ③-이전 블록이 일정 화면에서 시작한다).
{
  await tab.locator('aside nav a', { hasText: '디자인 보드' }).first().click()
  await tab.waitForURL(/#\/board\/design$/, { timeout: 10_000 })
  const table = tab.getByTestId('design-board-table')
  await table.getByTestId('design-row').first().waitFor({ timeout: 10_000 })
  const heads = (await table.locator('thead th').allInnerTexts()).map((t) => t.trim())
  check(heads.join('|') === '상태|항목|버전|담당|마감|다음 행동', '디자인 보드 표 6열(다음 행동 칸)', heads.join(' · '))
  const rows = table.getByTestId('design-row')
  const rowCount = await rows.count()
  let oneAction = rowCount > 0
  for (let i = 0; i < rowCount; i++) {
    const n = await rows.nth(i).getByTestId('design-next-action').locator('a, button').count()
    oneAction = oneAction && n <= 1
  }
  check(oneAction, '행마다 다음 행동 1줄 + 버튼 최대 1개', `${rowCount}행`)
  await tab.getByRole('button', { name: '＋ 항목 추가' }).waitFor({ timeout: 10_000 })
  const filled = await tab.locator('main .btn-accent, main .btn-primary').count()
  check(filled === 1, '디자인 보드 채운 버튼 1개(＋ 항목 추가)', `${filled}개`)
  await tab.screenshot({ path: resolve(SHOTS, '03-design-board-list.png'), fullPage: true })
  await tab.getByRole('button', { name: /지연만/ }).click()
  const lateCount = await rows.count()
  let allLate = true
  for (let i = 0; i < lateCount; i++) allLate = allLate && /\d+일 지남/.test(await rows.nth(i).innerText())
  check(allLate, "'지연만' → 남은 행 전부 'n일 지남'", `${lateCount}/${rowCount}행`)
  await tab.getByRole('button', { name: /지연만/ }).click()
  await tab.getByRole('button', { name: '갤러리' }).click()
  const cards = tab.getByTestId('design-card')
  await cards.first().waitFor({ timeout: 10_000 })
  const cardCount = await cards.count()
  check(cardCount === rowCount, '갤러리 카드 = 목록 행 수', `${cardCount}장`)
  const thumbs = await tab.locator('[data-testid="version-picture"], [data-testid="version-file-cover"], [data-testid="design-thumb-empty"]').count()
  check(thumbs === cardCount, '카드마다 16:9 썸네일 자리(이미지·파일 표지·빈 자리)', `${thumbs}/${cardCount}`)
  await tab.waitForTimeout(300)
  await tab.screenshot({ path: resolve(SHOTS, '03-design-board-gallery.png'), fullPage: true })
  await tab.getByRole('button', { name: '목록' }).click()
  await table.waitFor({ timeout: 10_000 })
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-2) 홈 '오늘 할 일' — 직전 PR ③을 회귀 가드로 유지.
//     일정(②에서 도착) → 사이드바 '홈' → 요약 5칸 · 목록 행 · '지연' 칩으로 거르면 남은 행이 전부 'n일 지남' → '전체'로 복귀 ·
//     채운 버튼 0 · '담당에게 리마인드'(mock) = 사실 안내 → 다시 '일정'으로(아래 ③-이전 PR-1 블록이 일정 화면에서 시작한다).
{
  await tab.locator('aside nav a', { hasText: '홈' }).first().click()
  await tab.waitForURL(/#\/home$/, { timeout: 10_000 })
  const list = tab.getByTestId('today-list')
  await list.getByTestId('today-row').first().waitFor({ timeout: 10_000 })
  const tiles = await tab.locator('[data-testid^="home-tile-"]').count()
  check(tiles === 5, '홈 요약 5칸', `${tiles}칸`)
  const total = await list.getByTestId('today-row').count()
  check(total > 0, "'오늘 할 일' 한 목록", `${total}행`)
  const filled = await tab.locator('main .btn-accent, main .btn-primary').count()
  check(filled === 0, '홈 채운 버튼 0개(훑는 화면)', `${filled}개`)
  await list.getByRole('button', { name: /^지연/ }).click()
  const lateRows = list.getByTestId('today-row')
  const lateCount = await lateRows.count()
  let allLate = lateCount > 0
  for (let i = 0; i < lateCount; i++) allLate = allLate && /\d+일 지남/.test(await lateRows.nth(i).innerText())
  check(allLate, "'지연' 칩 → 남은 행 전부 'n일 지남'", `${lateCount}/${total}행`)
  await list.getByRole('button', { name: /^전체/ }).click()
  check((await list.getByTestId('today-row').count()) === total, "'전체' 칩 → 목록 복귀", `${total}행`)
  await list.getByRole('button', { name: '담당에게 리마인드' }).click()
  const notice = await tab.getByRole('status').first().innerText()
  check(/데모\(mock\)에서는 알림을 보내지 않습니다/.test(notice), '리마인드(mock) = 보내는 흉내 없이 사실 안내', notice.slice(0, 40))
  await tab.screenshot({ path: resolve(SHOTS, '03-home-today.png'), fullPage: true })
  await tab.locator('aside nav a', { hasText: '일정' }).first().click()
  await tab.waitForURL(/#\/schedule/, { timeout: 10_000 })
}

// ── ③-이전(2026-09-25 Phase 3.23 PR-1) UX 개편 기반 — 직전 PR ③을 회귀 가드로 유지.
//     일정 화면(②에서 도착): 머리 캡션 = 그룹 이름('운영' — 화면 코드 S5 없음) · 지난 기한은 'n일 지남'(D+n 0건) ·
//     html word-break = keep-all → 행사 목록: '새 행사 만들기'(btn-accent) 바탕 = accent-deep(rgb 184,67,26)·흰 글자.
{
  const main = tab.locator('main')
  await main.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10_000 })
  const mainText = await main.innerText()
  check(!/\bS-?\d{1,2}\b/.test(mainText.split('\n').slice(0, 3).join(' ')), '일정 머리에 화면 코드 없음', mainText.split('\n').slice(0, 2).join(' / '))
  // 기한 배지만 본다 — WBS 템플릿 오프셋(D-42~D+30, 행사일 기준)은 기한이 아니라 그대로 D+n이다
  const pills = (await main.locator('span.rounded-full').allInnerTexts()).map((t) => t.trim())
  const overduePills = pills.filter((t) => /^\d+일 지남$/.test(t))
  const plusPills = pills.filter((t) => /^D\+\d+$/.test(t))
  check(overduePills.length > 0 && plusPills.length === 0, "지난 기한 배지 = 'n일 지남' (D+n 배지 0건)", `'n일 지남' ${overduePills.length}건 · D+n ${plusPills.length}건`)
  const wb = await tab.evaluate(() => getComputedStyle(document.documentElement).wordBreak)
  check(wb === 'keep-all', '한글 단어 단위 줄바꿈(html word-break)', wb)
  await tab.screenshot({ path: resolve(SHOTS, '03-foundation-schedule.png') })

  await tab.locator('aside nav a', { hasText: '행사 목록' }).first().click()
  await tab.waitForURL(/#\/projects/, { timeout: 10_000 })
  const cta = tab.getByRole('button', { name: /새 행사 만들기/ }).first()
  await cta.waitFor({ timeout: 10_000 })
  const [bg, fg] = await cta.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])
  check(bg === 'rgb(184, 67, 26)' && fg === 'rgb(255, 255, 255)', '주황 채운 버튼 = accent-deep 바탕 · 흰 글자', `${bg} / ${fg}`)
  await tab.screenshot({ path: resolve(SHOTS, '03-foundation-projects.png') })
}

// ── ③-이전(2026-09-25 Phase 4.7) 협력사 견적서 불러오기 — 직전 세션 ③을 회귀 가드로 유지.
//     정산보드가 있는 샘플 행사로 옮겨(`?project=` — Phase 6 알림 링크 경로) → 머리의 '협력사 견적서 불러오기'(PR-7 — 옛 아래 카드) →
//     가상 협력사 견적(A형 — 부가세 줄·할인 행. 이 자리에서 exceljs로 만든다: 실파일·바이너리 커밋 금지 R-Q4) 고르기 → 읽기 →
//     확인 큐(부가세 별도 미리 선택 · 부가세 '확인 필요' 없음 · 공급가 대조 '=' · 원가 없는 버킷은 선택지에 없음) → 확정 →
//     '발주 항목 6개' → 닫기 → 이력 '확정 · 항목 6개'. 끝나면 데모 기본 행사(RB27)로 되돌린다 — 아래 ③-이전 블록들은 RB27 기준이다.
const noticeV = tab.getByRole('button', { name: '안내 닫기' })
if (await noticeV.count()) await noticeV.click()
const docBeforeVendor = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/settlement?project=prj-stc26'
})
await tab.getByTestId('settlement-kpis').waitFor({ timeout: 10_000 })
check((await tab.getByText('Phase 4.7에서 열립니다').count()) === 0, '정산보드: 옛 "Phase 4.7에서 열립니다" 안내 없음 → 머리의 불러오기 버튼')
await tab.getByRole('button', { name: '협력사 견적서 불러오기' }).click()
const vqDialog = tab.getByTestId('vendor-quote-dialog')
await vqDialog.waitFor({ timeout: 10_000 })
const { default: ExcelJSv } = await import('exceljs')
const vwb = new ExcelJSv.Workbook()
const vws = vwb.addWorksheet('가상 협력사 견적 AV')
// src/modules/quote/import/__tests__/fixtures/syntheticVendorQuotes.ts의 A형과 같은 표(가상 명칭)
const vSheet = {
  1: ['견 적 서'],
  3: ['행 사 명', '가상 테크 포럼 2027', null, null, null, null, '상      호', null, '가상음향㈜'],
  8: ['견적금액', '금 이천이백만원 정 (￦22,000,000/원) 부가세 포함'],
  10: ['1. 항목 합계', null, null, null, null, null, null, null, 20_000_000],
  11: ['2. 부가세', null, null, null, null, null, null, null, 2_000_000],
  12: ['총 견적', null, null, null, null, null, null, null, 22_000_000],
  15: ['구  분', '항  목', '규격 · 사양', '단  가', '수  량', '일  수', null, null, '금  액', '비  고'],
  16: ['1. 음향'],
  17: ['음향', '메인 스피커 시스템', '라인어레이 L/R', 6_000_000, 1, 1, null, null, 6_000_000],
  18: ['음향', '무선 마이크', '핸드 4 · 핀 2', 500_000, 4, 1, null, null, 2_000_000],
  19: ['소계', null, null, null, null, null, null, null, 8_000_000],
  20: ['2. 조명'],
  21: ['조명', '무빙 라이트', '스팟 6대', 1_000_000, 6, 1, null, null, 6_000_000],
  22: ['소계', null, null, null, null, null, null, null, 6_000_000],
  23: ['3. 현장 운영'],
  24: ['인력', '오퍼레이터', '5명 × 2일', 300_000, 5, 2, null, null, 3_000_000],
  25: ['운송', '장비 운송 · 설치', '5톤 2대 왕복', 2_000_000, 2, 1, null, null, 4_000_000],
  26: ['할인', '패키지 할인', null, -1_000_000, 1, 1, null, null, -1_000_000],
  27: ['소계', null, null, null, null, null, null, null, 6_000_000],
}
for (const [rowNo, cells] of Object.entries(vSheet)) {
  cells.forEach((value, i) => {
    if (value !== null) vws.getRow(Number(rowNo)).getCell(i + 1).value = value
  })
}
const vBuf = Buffer.from(await vwb.xlsx.writeBuffer())
await vqDialog.getByLabel('견적서 파일').setInputFiles({
  name: '가상음향_견적.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: vBuf,
})
await vqDialog.getByRole('button', { name: '읽기' }).click()
const vqRows = vqDialog.getByTestId('vendor-quote-rows')
await vqRows.waitFor({ timeout: 10_000 })
check((await vqRows.locator('tbody tr').count()) === 6, '읽기 → 확인 큐 6행(할인 행 포함)', `${await vqRows.locator('tbody tr').count()}행`)
check(await vqDialog.getByLabel('별도(항목 금액 그대로 저장)').isChecked(), '부가세 줄 있음 → 별도 미리 선택')
check((await vqDialog.getByTestId('vendor-quote-vat-needs').count()) === 0, "부가세 확실 → '확인 필요' 없음")
const vqCheckText = await vqDialog.getByTestId('vendor-quote-check').innerText()
check(/ = /.test(vqCheckText), '공급가 대조 일치(=)', vqCheckText.trim())
check((await vqRows.locator('option', { hasText: 'PCO 기획료' }).count()) === 0, '원가 없는 버킷(PCO 기획료)은 선택지에 없음')
await tab.screenshot({ path: resolve(SHOTS, '03-vendor-quote-review.png'), fullPage: true })
await vqDialog.getByRole('button', { name: '확정 — 발주 항목 6개 만들기' }).click()
await vqDialog.getByRole('heading', { name: '발주 항목 6개를 만들었습니다' }).waitFor({ timeout: 10_000 })
check(true, '확정 → 발주 항목 6개')
await vqDialog.getByRole('button', { name: '닫기' }).click()
const vqList = tab.getByTestId('vendor-quote-import').getByRole('list', { name: '불러온 견적서' })
await vqList.waitFor({ timeout: 10_000 })
await tab.waitForFunction(
  () => /확정 · 항목 6개/.test(document.querySelector('[aria-label="불러온 견적서"]')?.textContent ?? ''),
  null,
  { timeout: 10_000 },
)
check(true, "이력: '확정 · 항목 6개'")
check(docRequests.length === docBeforeVendor, '불러오기·확정에 전체 리로드 0', `${docBeforeVendor} → ${docRequests.length}`)
await tab.screenshot({ path: resolve(SHOTS, '03-vendor-quote-done.png'), fullPage: true })
await tab.evaluate(() => {
  window.location.hash = '#/home?project=prj-rebuild27'
})
await tab.waitForFunction(
  () => localStorage.getItem('communicator.currentProjectId') === 'prj-rebuild27' && location.hash === '#/home',
  null,
  { timeout: 10_000 },
)
check(true, '데모 기본 행사(RB27)로 되돌림 — ?project= 적용 후 주소에서 지워짐')

// ── ③-이전(2026-09-25 Phase 6) Slack 알림 — 직전 세션 ③을 회귀 가드로 유지.
//     행사 설정 ③ Slack 카드: 틀린 주소 → 형식 문구 + 등록 비활성 → Incoming Webhook 주소 → 등록 → 끝 토큰이 가려진 표시 →
//     해제(확인창 수락). 데모는 mock이라 '테스트 보내기'가 없고 발송하지 않는다는 사실만 적는다. 홈 '담당에게 리마인드'도 mock 안내.
const noticeS = tab.getByRole('button', { name: '안내 닫기' })
if (await noticeS.count()) await noticeS.click()
const docBeforeSlack = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/settings?tab=integration'
})
const slackCard = tab.getByTestId('slack-card')
await slackCard.waitFor({ timeout: 10_000 })
check(/데모\(mock\)에서는 알림을 보내지 않습니다/.test(await slackCard.innerText()), 'Slack 카드: mock은 발송하지 않는다는 사실 안내')
const hookInput = slackCard.getByLabel('Slack 웹훅 주소')
await hookInput.fill('https://example.com/hook')
check(await slackCard.getByRole('button', { name: '등록', exact: true }).isDisabled(), 'Slack 카드: Incoming Webhook 주소가 아니면 등록 비활성')
check(/hooks\.slack\.com\/services\/… 형식/.test(await slackCard.innerText()), 'Slack 카드: 형식 문구')
await hookInput.fill('https://hooks.slack.com/services/TDEMO/BDEMO/demoSecretToken')
await slackCard.getByRole('button', { name: '등록', exact: true }).click()
const masked = tab.getByTestId('slack-webhook-masked')
await masked.waitFor({ timeout: 10_000 })
check((await masked.innerText()).endsWith('/••••') && !(await tab.evaluate(() => document.body.innerText)).includes('demoSecretToken'), '등록 → 끝 토큰 가림 표시(원문 0)', await masked.innerText())
check((await slackCard.getByRole('button', { name: '테스트 보내기' }).count()) === 0, 'mock: 테스트 보내기 없음')
await tab.screenshot({ path: resolve(SHOTS, '03-slack-card.png'), fullPage: true })
tab.once('dialog', (d) => d.accept())
await slackCard.getByRole('button', { name: '해제', exact: true }).click()
await slackCard.getByLabel('Slack 웹훅 주소').waitFor({ timeout: 10_000 })
check(true, '해제 → 입력 칸으로 돌아감')
await tab.evaluate(() => {
  window.location.hash = '#/home'
})
const remindBtn = tab.getByRole('button', { name: '담당에게 리마인드' })
await remindBtn.waitFor({ timeout: 10_000 })
await remindBtn.click()
const remindStatus = tab.getByRole('status').filter({ hasText: '데모(mock)에서는 알림을 보내지 않습니다' })
await remindStatus.first().waitFor({ timeout: 10_000 })
check(true, '홈 리마인드: mock은 보내는 흉내 없이 사실 안내')
check(docRequests.length === docBeforeSlack, 'Slack 카드·홈 리마인드에 전체 리로드 0', `${docBeforeSlack} → ${docRequests.length}`)

// ── ③-이전(2026-09-25 Phase 4.5) 항목 고치기·지우기 — 직전 세션 ③을 회귀 가드로 유지.
//     RB27 '유튜브 중계 템플릿'(dlv-rb27-prd-005): 보드에 있는지 먼저 보고 → 머리 ⋯ 메뉴(Phase 3.23 PR-4 — 옛 '항목 관리' 카드) → 고치기 → 제목 바꿔 저장(헤더 반영) →
//     지우기 → 이름 입력 전 '영구 삭제' 비활성 → 정확히 치면 활성 → 지움 → 결과 창(데모는 Drive 문구 없음) → '디자인 보드로' →
//     보드에 그 항목 없음. 다른 블록이 쓰는 항목(prd-001·prd-007)은 건드리지 않는다.
const noticeE = tab.getByRole('button', { name: '안내 닫기' })
if (await noticeE.count()) await noticeE.click()
const docBeforeEdit = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/board/design'
})
await tab.getByText('유튜브 중계 템플릿', { exact: true }).first().waitFor({ timeout: 10_000 })
check(true, '지우기 전: 디자인 보드에 대상 항목 있음')
await tab.evaluate(() => {
  window.location.hash = '#/items/dlv-rb27-prd-005'
})
const itemMenu = tab.getByRole('button', { name: '항목 메뉴' })
await itemMenu.waitFor({ timeout: 10_000 })
await itemMenu.click()
await tab.getByRole('menu', { name: '항목 메뉴' }).getByRole('menuitem', { name: '고치기' }).click()
const editForm = tab.getByTestId('item-edit-form')
await editForm.getByLabel('제목').fill('유튜브 중계 템플릿 (27 개정)')
await editForm.getByRole('button', { name: '저장' }).click()
await tab.getByRole('heading', { level: 1, name: '유튜브 중계 템플릿 (27 개정)' }).waitFor({ timeout: 10_000 })
check((await tab.getByTestId('item-edit-form').count()) === 0, '고치기 → 저장 → 헤더 제목 반영 · 폼 닫힘')
await tab.screenshot({ path: resolve(SHOTS, '03-item-edited.png'), fullPage: true })
await itemMenu.click()
await tab.getByRole('menu', { name: '항목 메뉴' }).getByRole('menuitem', { name: '지우기' }).click()
const delDialog = tab.getByTestId('delete-item-dialog')
await delDialog.waitFor({ timeout: 10_000 })
const goDelete = delDialog.getByRole('button', { name: '영구 삭제' })
check(await goDelete.isDisabled(), '지우기: 이름 입력 전 영구 삭제 비활성')
await delDialog.getByLabel(/항목 이름/).fill('유튜브 중계 템플릿 (27 개정)')
check(!(await goDelete.isDisabled()), '지우기: 이름을 정확히 치면 활성')
await tab.screenshot({ path: resolve(SHOTS, '03-item-delete-confirm.png') })
await goDelete.click()
await delDialog.getByRole('heading', { name: '지웠습니다' }).waitFor({ timeout: 10_000 })
check((await delDialog.getByTestId('delete-item-drive').count()) === 0, '데모(mock): 결과 창에 Drive 문구 없음')
await delDialog.getByRole('button', { name: '디자인 보드로' }).click()
await tab.waitForURL(/#\/board\/design/, { timeout: 10_000 })
await tab.getByText('키비주얼', { exact: true }).first().waitFor({ timeout: 10_000 })
check((await tab.getByText(/유튜브 중계 템플릿/).count()) === 0, '보드로 돌아오면 지운 항목 없음')
check(docRequests.length === docBeforeEdit, '고치기·지우기·보드 복귀에 전체 리로드 0', `${docBeforeEdit} → ${docRequests.length}`)
await tab.screenshot({ path: resolve(SHOTS, '03-item-deleted-board.png'), fullPage: true })

// ── ③-이전(2026-09-25 Phase 4.3.1) 업로드 잠금 안내 — 직전 세션 ③을 회귀 가드로 유지.
//     컨펌대기 항목(RB27 '외관 대형 현수막')은 고르기·끌어놓기·업로드 대신 '다음 단계' 카드가 이유를 보이고, 올리기 버튼이
//     어디에도 없다(Phase 3.23 PR-4 — 올리기는 머리가 아니라 다음 단계 카드 한 곳. 예전에는 누른 뒤에야 영문 상태 코드로 실패했다).
//     업로드가 되는 항목의 폼은 아래 ③-이전(Phase 5) 블록이 그대로 잡는다. 발송 경고·저장 위치·Drive 경고 상자는
//     실서버 전용이라 vitest(dod66)가 잡는다.
const noticeL = tab.getByRole('button', { name: '안내 닫기' })
if (await noticeL.count()) await noticeL.click()
const docBeforeLock = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/items/dlv-rb27-prd-007'
})
const locked = tab.getByTestId('upload-locked')
await locked.waitFor({ timeout: 10_000 })
const lockText = (await locked.innerText()).replace(/\s+/g, ' ')
check(/지금은 새 버전을 올릴 수 없습니다 — 컨펌대기/.test(lockText), '컨펌대기 항목: 업로드 폼 대신 이유 안내', lockText.slice(0, 48))
check((await tab.locator('input[type="file"]').count()) === 0, '컨펌대기 항목: 파일 입력 0(고르기·끌어놓기 없음)')
check((await tab.getByRole('button', { name: /올리기|새 버전 업로드/ }).count()) === 0, '컨펌대기 항목: 올리기 버튼 0(이유만)')
const bodyText = await tab.evaluate(() => document.body.innerText)
check(!/pending_approval/.test(bodyText), '화면 글자에 영문 상태 코드 0')
check(docRequests.length === docBeforeLock, '항목 이동에 전체 리로드 0', `${docBeforeLock} → ${docRequests.length}`)
await tab.screenshot({ path: resolve(SHOTS, '03-upload-locked.png'), fullPage: true })

// ── ③-이전(2026-09-24 Phase 3.22) 담당자 배정 카드 — 직전 세션 ③을 회귀 가드로 유지.
//     행사 설정 ② = 역할 칸 4개 + 주소록 인물 카드. 데모 행사는 4명이 이미 다 배정돼 있으므로
//     박운영을 빼고 → 카드를 운영 칸으로 **실제 브라우저 끌어놓기**(Playwright dragTo = HTML5 DnD) →
//     최등록을 빼고 → 카드를 **눌러** 등록으로 배정한다. 빼기 확인창은 사용자처럼 수락한다.

const noticeM = tab.getByRole('button', { name: '안내 닫기' })
if (await noticeM.count()) await noticeM.click()

const docBeforeMembers = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/settings'
})
await tab.getByRole('button', { name: '담당자', exact: true }).click()
const laneOf = (label) => tab.getByRole('region', { name: `${label} 담당` })
await laneOf('운영').getByText('박운영').waitFor({ timeout: 10_000 })
check((await tab.getByRole('option', { name: '담당자 선택' }).count()) === 0, '담당자: 셀렉트 피커 대신 역할 칸 4개', 'PM·디자인·운영·등록')

tab.once('dialog', (d) => d.accept())
await laneOf('운영').getByRole('button', { name: '박운영 빼기' }).click()
const poolList = tab.getByRole('list', { name: '배정할 수 있는 담당자' })
const opsCard = poolList.locator('[data-person-card]', { hasText: '박운영' })
await opsCard.waitFor({ timeout: 10_000 })
check((await laneOf('운영').getByText('카드를 여기로 끌어놓기').count()) === 1, '빼기 → 운영 칸이 비고 주소록 카드로 돌아감')
await tab.screenshot({ path: resolve(SHOTS, '03a-member-board.png'), fullPage: true })

await opsCard.dragTo(laneOf('운영'))
await laneOf('운영').getByText('박운영').waitFor({ timeout: 10_000 })
check((await poolList.count()) === 0 || (await poolList.locator('[data-person-card]', { hasText: '박운영' }).count()) === 0, '끌어놓기(실제 브라우저 DnD) → 운영 칸에 배정')

tab.once('dialog', (d) => d.accept())
await laneOf('등록').getByRole('button', { name: '최등록 빼기' }).click()
const regCard = tab.getByRole('button', { name: '최등록 역할 고르기' })
await regCard.waitFor({ timeout: 10_000 })
await regCard.click()
check((await regCard.getAttribute('aria-expanded')) === 'true', '누르기 → 역할 버튼 4개 열림')
await tab.getByRole('button', { name: '최등록 등록으로 배정' }).click()
await laneOf('등록').getByText('최등록').waitFor({ timeout: 10_000 })
check(true, '누르기 → 등록 칸에 배정')
check(docRequests.length === docBeforeMembers, '빼기·끌어놓기·누르기 배정에 전체 리로드 0', `${docBeforeMembers} → ${docRequests.length}`)
await tab.screenshot({ path: resolve(SHOTS, '03b-member-assigned.png'), fullPage: true })

// ── ③-이전(2026-09-24 Phase 5) 업로드 3경로 — 직전 세션 ③을 회귀 가드로 유지.
//     항목 상세(RB27 'LED 키비주얼', requested)의 버전 업로드 카드: 폴더 선택 입력(webkitdirectory) · 파일 2개 선택 →
//     이름순 목록(시안2 → 시안10) → 업로드 = 새 버전 2개 · 끌어놓기(브라우저 DataTransfer drop) → 목록 · Drive 링크 등록 → 새 버전.
//     mock이라 서버 호출은 없다(fetch 1건 가드 유지) — 저장 위치 안내 문구가 그 사실을 적는다.

// 데모 안내 칩은 우하단 고정이라 카드 하단과 겹칠 수 있다 — 사용자와 똑같이 닫고 시작한다
const notice0 = tab.getByRole('button', { name: '안내 닫기' })
if (await notice0.count()) await notice0.click()

const docBeforeUpload = docRequests.length
await tab.evaluate(() => {
  window.location.hash = '#/items/dlv-rb27-prd-001'
})
const zone = tab.getByTestId('upload-dropzone')
await zone.waitFor({ timeout: 10_000 })
check((await tab.locator('input[webkitdirectory]').count()) === 1, '업로드 카드: 폴더 선택 입력(webkitdirectory)')
check(/데모\(mock\) 모드/.test(await zone.innerText()), '업로드 카드: 저장 위치 안내(mock — 새로고침 시 사라짐)')
await tab.getByLabel('파일 선택').setInputFiles([
  { name: '시안10.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-10') },
  { name: '시안2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-2') },
])
const queue = tab.getByTestId('upload-queue')
await queue.waitFor({ timeout: 10_000 })
const rows = await queue.getByRole('listitem').allInnerTexts()
check(rows.length === 2 && rows[0].includes('시안2.pdf') && rows[1].includes('시안10.pdf'), '파일 2개 → 이름순 목록(시안2 → 시안10)', rows.join(' | '))
await tab.screenshot({ path: resolve(SHOTS, '03c-upload-queue.png'), fullPage: true })
await tab.getByRole('button', { name: '업로드', exact: true }).click()
await tab.getByText('새 버전 2개를 올렸습니다.').waitFor({ timeout: 10_000 })
check(true, '업로드 → 새 버전 2개(파일마다 1개)')
await zone.evaluate((el) => {
  const dt = new DataTransfer()
  dt.items.add(new File(['x'], '끌어놓은_배너.png', { type: 'image/png' }))
  el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await queue.waitFor({ timeout: 10_000 })
check((await queue.innerText()).includes('끌어놓은_배너.png'), '끌어놓기 → 목록에 담김')
await tab.getByRole('button', { name: 'Drive 링크로 등록' }).click()
await tab.getByLabel('Drive 링크').fill('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view?usp=sharing')
await tab.getByLabel('표시 이름(선택)').fill('링크등록_시안.pdf')
await tab.getByRole('button', { name: '링크 등록' }).click()
await tab.getByText('Drive 파일을 새 버전으로 등록했습니다.').waitFor({ timeout: 10_000 })
check((await tab.getByText('링크등록_시안.pdf').count()) >= 1, 'Drive 링크 등록 → 새 버전(표시 이름)')
check(docRequests.length === docBeforeUpload, '업로드·끌어놓기·링크 등록에 전체 리로드 0', `${docBeforeUpload} → ${docRequests.length}`)
await tab.screenshot({ path: resolve(SHOTS, '03d-upload-link.png'), fullPage: true })

// ── ③-이전(2026-09-10 · 09-24) 견적서 내보내기 2종 + 파일 속 이미지(직인) — 직전 세션 ③을 회귀 가드로 유지.
//    **견적서 내보내기 2종(2026-09-10) + 파일 속 이미지(2026-09-24 직인)**.
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
await tab.getByRole('heading', { name: '견적', exact: true }).waitFor({ timeout: 10_000 })
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
await tab.screenshot({ path: resolve(SHOTS, '03e-quotes-export-buttons.png') })

// ③-2 (2026-09-24 직인) — 내려받은 Excel 안의 이미지를 직접 연다. 데모는 직인을 싣지 않으므로(demo/plugins.ts)
//      로고 1장(PNG)만 있어야 하고, PNG가 아닌 미디어는 0건이어야 한다 — 없는 자산 경로에 SPA 폴백 HTML이
//      PNG로 박히던 운영 결함의 회귀 가드. 직인이 실제로 얹히는 경로는 sealAsset.test.ts가 잡는다
const [download] = await Promise.all([tab.waitForEvent('download', { timeout: 15_000 }), excelBtn.click()])
const { default: ExcelJS } = await import('exceljs')
const wbx = new ExcelJS.Workbook()
await wbx.xlsx.readFile(await download.path())
const media = wbx.model.media ?? []
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const nonPng = media.filter((m) => !PNG_SIG.every((b, i) => m.buffer?.[i] === b))
check(
  media.length === 1 && nonPng.length === 0,
  'Excel 파일 이미지 = 로고 1장(PNG) · 직인 없음(데모 제외) · 비PNG 미디어 0',
  `media ${media.length} · 비PNG ${nonPng.length}`,
)
const sealMark = wbx.worksheets[0].getCell('H7').value
check(sealMark === '(인)', "Excel 공급자 행 H7 '(인)' 표식", String(sealMark))

// 에디터 ④ — 목록에서 '새 버전으로 고치기'(PR-6: 머리 '＋ 새 버전' → 요약 패널 아래)로 견적 id를 얻고, ?step=4 딥링크로 확인·확정 단계에 진입한다
await tab.getByRole('button', { name: '새 버전으로 고치기' }).click()
await tab.waitForURL(/#\/quotes\/[^/]+\/edit/, { timeout: 10_000 })
const editHash = await tab.evaluate(() => window.location.hash)
const quoteId = editHash.match(/#\/quotes\/([^/?]+)\/edit/)?.[1]
check(Boolean(quoteId), '새 버전으로 고치기 → 에디터 진입(견적 id 확보)', quoteId)
await tab.evaluate(() => {
  window.location.hash = '#/quotes'
})
await tab.getByRole('heading', { name: '견적', exact: true }).waitFor({ timeout: 10_000 })
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
await tab.screenshot({ path: resolve(SHOTS, '03f-editor-step4-export.png'), fullPage: true })

await browser.close()
server.close()

console.log(`\n캡처: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n상호작용 스모크 전 항목 통과.\n')
