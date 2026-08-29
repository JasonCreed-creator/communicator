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

// ── ③ 이번 세션이 바꾼 화면의 핵심 클릭 경로 — 3.19: **폼 정본(패턴 기준 시트 §10)**.
//     정적 스크린샷은 컨트롤의 '색'만 보여 준다. 폼 정본이 실제로 지키는 것은 **입력 중 동작**이라
//     여기서만 증명된다: 금액 에코가 타이핑을 따라오는가 · dirty 전 저장이 잠겨 있는가 ·
//     저장 후 캡션이 배지가 아니라 한 줄로 뜨는가 · 셀렉트 화살표가 OS 것이 아닌가.
//     경로: 판매 플래너 ① 금액·저장 → 온보딩 ③ 선택 카드·셀렉트 → 행사 설정 ② 전자명함 임포트. ──

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

// §10-A 금액 — 표시는 천단위, 편집 중에는 raw, blur 시 재포맷. 에코가 타이핑을 따라온다
const priceField = tab.getByLabel('판매 단가 (내부)').first()
const priceShown = await priceField.inputValue()
check(/,/.test(priceShown), '§10-A 금액 — 천단위 구분 표시', priceShown)
const priceAlign = await priceField.evaluate((el) => getComputedStyle(el).textAlign)
check(priceAlign === 'right', '§10-A 금액 — 우측정렬(.ui-input-num)', priceAlign)

// §10 버튼 위계 — 변경 전에는 저장이 잠겨 있다
const saveBtn = tab.getByRole('button', { name: /부스 저장$|존 저장$|저장$/ }).first()
check(await saveBtn.isDisabled(), '§10 버튼 위계 — 변경 전 저장 비활성')
const saveClass = (await saveBtn.getAttribute('class')) ?? ''
check(
  /btn-ghost/.test(saveClass) && !/btn-primary|btn-accent/.test(saveClass),
  '§10 버튼 위계 — 카드 저장은 ghost(주 버튼은 전진 하나)',
  saveClass.trim(),
)

await priceField.click()
const priceRaw = await priceField.inputValue()
check(!/,/.test(priceRaw), '§10-A 금액 — 편집 중에는 raw(쉼표가 커서를 튀게 하지 않는다)', priceRaw)
await priceField.fill('123456789')
await tab.waitForTimeout(120)
const echoLive = await tab.getByText('1억 2,345만 6,789원').count()
check(echoLive >= 1, '§10-A 금액 — 한글 에코가 타이핑을 따라온다', `${echoLive}곳`)
check(!(await saveBtn.isDisabled()), '§10 버튼 위계 — 변경 후 저장 활성')
await tab.screenshot({ path: resolve(SHOTS, '03a-planner-money-echo.png') })

await priceField.blur()
const priceReformatted = await priceField.inputValue()
check(priceReformatted === '123,456,789', '§10-A 금액 — blur 시 재포맷', priceReformatted)

await saveBtn.click()
await tab.getByText(/^저장됨 \d{2}:\d{2}$/).first().waitFor({ timeout: 10_000 })
check(true, "§10 버튼 위계 — 저장 결과는 토스트가 아니라 '저장됨 hh:mm' 캡션")
await tab.screenshot({ path: resolve(SHOTS, '03a-planner-step1.png') })

// 원래 단가로 되돌린다 — 이 스모크는 데모 상태를 남기지 않는다(아래 ② 합계가 픽스처 값을 본다)
await priceField.click()
await priceField.fill(priceShown.replace(/,/g, ''))
await priceField.blur()
await saveBtn.click()
await tab.waitForTimeout(200)
const priceRestored = await priceField.inputValue()
check(priceRestored === priceShown, '스모크가 데모 상태를 되돌린다', priceRestored)

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

// §10-B 선택 카드 — 표시는 보더·틴트 두 겹까지. '선택' 필은 사라졌다
const pills = await tab.getByText('선택', { exact: true }).count()
check(pills === 0, "§10-B 선택 카드 — '선택' 필 0건", `${pills}개`)

// §10-B 체크·라디오 — 16px + 브랜드 accent(브라우저 파랑 아님)
const radio = tab.getByRole('radio').first()
const radioSpec = await radio.evaluate((el) => {
  const cs = getComputedStyle(el)
  return { w: cs.width, accent: cs.accentColor }
})
check(radioSpec.w === '16px', '§10-B 라디오 16px(내부 지면)', radioSpec.w)
check(
  /235|eb6f2a/i.test(radioSpec.accent),
  '§10-B accent-color가 브랜드 오렌지(브라우저 파랑 아님)',
  radioSpec.accent,
)

// §10-A 셀렉트 — OS 화살표 제거 + 자체 셰브론
const kindSelect = tab.getByLabel('행사 성격')
const selectSpec = await kindSelect.evaluate((el) => {
  const cs = getComputedStyle(el)
  return { appearance: cs.appearance, image: cs.backgroundImage, pad: cs.paddingRight }
})
check(selectSpec.appearance === 'none', '§10-A 셀렉트 — OS 화살표 제거', selectSpec.appearance)
check(selectSpec.image.startsWith('url('), '§10-A 셀렉트 — ink-cap 셰브론 자체 렌더')
check(selectSpec.pad === '32px', '§10-A 셀렉트 — 우측 여백 32', selectSpec.pad)
const hintLine = await tab.getByText('카드가 시드한 값').count()
check(hintLine === 1, '§10-C 힌트 한 줄이 카드와의 관계를 말한다', `${hintLine}곳`)
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

// 행사 설정 ② — 전자명함 붙여넣기 임포트(3.18.1 §2). 파싱 → 확인 표 → 저장까지 실제로 도는지.
// 가상 명함 텍스트다(#RULE-NO-COMPANY — 실명·실회사·실번호 금지).
await tab.evaluate(() => {
  window.location.hash = '#/'
})
await tab.getByRole('button', { name: /현재 행사/ }).waitFor({ timeout: 10_000 })
await switchProject('샘플 테크 컨퍼런스')
await tab.evaluate(() => {
  window.location.hash = '#/settings'
})
await tab.getByRole('button', { name: /담당자/ }).first().click()
await tab.getByRole('button', { name: '전자명함 붙여넣기' }).click()
await tab
  .getByLabel('명함·서명 텍스트')
  .fill('가상기획\n홍길동 팀장\nhong@example.com\n010-0000-0000')
await tab.getByRole('button', { name: '인식', exact: true }).click()

const parsedName = await tab.getByLabel('1번째 이름').inputValue()
check(parsedName === '홍길동', '전자명함 — 이름 인식', parsedName)
const parsedTitle = await tab.getByLabel('1번째 직함').inputValue()
check(parsedTitle === '팀장', '전자명함 — 직함 인식', parsedTitle)
const parsedPhone = await tab.getByLabel('1번째 전화').inputValue()
check(parsedPhone === '010-0000-0000', '전자명함 — 전화 표기 정규화', parsedPhone)
const parsedEmail = await tab.getByLabel('1번째 이메일').inputValue()
check(parsedEmail === 'hong@example.com', '전자명함 — 이메일 인식', parsedEmail)
await tab.screenshot({ path: resolve(SHOTS, '03f-contact-card-import.png') })

await browser.close()
server.close()

console.log(`\n캡처: ${SHOTS}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건: ${problems.join(', ')}\n`)
  process.exit(1)
}
console.log('\n상호작용 스모크 전 항목 통과.\n')
