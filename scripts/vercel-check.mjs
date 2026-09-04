#!/usr/bin/env node
// 배포 설정 검증 — `npm run deploy:check` (설계서 §18-5 · §20 T2)
//
// 런북은 "`vercel.json` 동봉 — 설정 무변경"을 약속한다. 그 약속이 실제로 지켜지는지는
// **배포해 봐야** 알 수 있는데, 그러면 도메인이 걸린 뒤에야 알게 된다. 그래서 Vercel의
// 정적 서빙 규칙을 로컬에서 재현해 미리 확인한다:
//
//   ① 파일이 있으면 파일을 준다 (rewrites는 파일시스템 검사 **다음**이다)
//   ② 없으면 `rewrites`대로 /index.html 로 되돌린다  ← BrowserRouter 딥링크가 사는 지점
//   ③ `headers`의 경로 규칙을 순서대로 겹쳐 쌓는다
//
// 설정은 vercel.json을 **직접 읽어서** 적용한다 — 사본을 두면 파일과 검증이 갈라진다.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = JSON.parse(readFileSync(resolve(REPO, 'vercel.json'), 'utf8'))
const DIST = resolve(REPO, CONFIG.outputDirectory ?? 'dist')
const PORT = 4187
const ORIGIN = `http://localhost:${PORT}`

const problems = []
const check = (pass, label, detail) => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!pass) problems.push(label)
}

if (!existsSync(DIST)) {
  console.error(`\n${CONFIG.outputDirectory} 가 없다 — 먼저 \`npm run build\`.\n`)
  process.exit(1)
}

/** vercel.json의 source 패턴(path-to-regexp 축약형)을 정규식으로 옮긴다 */
function toRegExp(source) {
  return new RegExp('^' + source.replace(/\/\(\.\*\)/g, '(?:/.*)?').replace(/\(\.\*\)/g, '.*') + '$')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN)
  const pathname = decodeURIComponent(url.pathname)

  // ① 파일시스템 우선
  let file = join(DIST, pathname)
  let served = pathname
  const isFile = existsSync(file) && statSync(file).isFile()
  if (!isFile) {
    // ② rewrites — 첫 매칭만 적용(Vercel과 같다)
    const rule = (CONFIG.rewrites ?? []).find((r) => toRegExp(r.source).test(pathname))
    if (!rule) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    file = join(DIST, rule.destination)
    served = rule.destination
  }

  // ③ headers — 매칭되는 규칙을 순서대로 겹쳐 쌓는다(뒤가 이긴다)
  const headers = { 'Content-Type': MIME[extname(served)] ?? 'application/octet-stream' }
  for (const block of CONFIG.headers ?? []) {
    if (!toRegExp(block.source).test(pathname)) continue
    for (const h of block.headers) headers[h.key] = h.value
  }
  res.writeHead(200, headers)
  res.end(readFileSync(file))
})

await new Promise((r) => server.listen(PORT, r))
console.log(`\n배포 설정 검증 — ${ORIGIN} (vercel.json 규칙 재현)\n`)

// ── A. 딥링크: BrowserRouter는 rewrites 없이는 전부 404다 ──
const DEEP_LINKS = [
  ['/', '제품 런처(S-00)'],
  ['/home', '홈(S1)'],
  ['/schedule', '일정(S5)'],
  ['/settlement', '정산보드(S-10)'],
  ['/partners', '파트너 보드(S-11)'],
  ['/checkin', '현장 체크인(S-12)'],
  ['/board/design', '보드 상세(중첩 경로)'],
  ['/c/demo/status', '발주처 현황(토큰 경로)'],
  ['/p/demo-partner', '파트너 포털(토큰 경로)'],
  ['/configurator', '옛 라우트(§10 리다이렉트 대상)'],
]
for (const [path, label] of DEEP_LINKS) {
  const r = await fetch(`${ORIGIN}${path}`)
  const body = await r.text()
  const ok = r.status === 200 && body.includes('<div id="root">')
  check(ok, `딥링크 ${path} — ${label}`, `${r.status}`)
}

// ── B. 정적 자산은 rewrite에 먹히지 않는다 ──
const html = await (await fetch(`${ORIGIN}/`)).text()
const assetPath = /\/assets\/[A-Za-z0-9._-]+\.js/.exec(html)?.[0]
check(Boolean(assetPath), '빌드 산출 자산 경로 확인', assetPath ?? '못 찾음')
if (assetPath) {
  const a = await fetch(`${ORIGIN}${assetPath}`)
  check(
    a.headers.get('content-type')?.startsWith('text/javascript'),
    '자산이 index.html로 rewrite되지 않는다',
    a.headers.get('content-type') ?? '',
  )
  check(
    (a.headers.get('cache-control') ?? '').includes('immutable'),
    '해시 자산은 immutable 캐시',
    a.headers.get('cache-control') ?? '',
  )
}

// ── C. 보안 헤더 ──
const root = await fetch(`${ORIGIN}/`)
for (const [key, want] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['strict-transport-security', 'max-age='],
]) {
  const got = root.headers.get(key) ?? ''
  check(got.includes(want), `보안 헤더 ${key}`, got || '없음')
}

// ── D. 토큰 지면(/c·/p)은 색인·리퍼러·캐시를 막는다 ──
// URL 자체가 자격증명이다. 검색에 걸리거나 외부 링크로 새면 그 토큰은 끝난다.
for (const path of ['/c/demo/status', '/p/demo-partner']) {
  const r = await fetch(`${ORIGIN}${path}`)
  check((r.headers.get('x-robots-tag') ?? '').includes('noindex'), `${path} noindex`, r.headers.get('x-robots-tag') ?? '없음')
  check(r.headers.get('referrer-policy') === 'no-referrer', `${path} 리퍼러 차단`, r.headers.get('referrer-policy') ?? '없음')
  check((r.headers.get('cache-control') ?? '').includes('no-store'), `${path} 공유 캐시 금지`, r.headers.get('cache-control') ?? '없음')
}
// 대조군 — 내부 지면은 no-store가 아니어야 한다(규칙이 전역으로 새지 않았는지)
const internal = await fetch(`${ORIGIN}/schedule`)
check(
  !(internal.headers.get('cache-control') ?? '').includes('no-store'),
  '토큰 지면 규칙이 내부 지면으로 새지 않는다',
  internal.headers.get('cache-control') ?? '(기본값)',
)

// ── E. 실브라우저: index.html이 왔다는 것과 화면이 뜨는 것은 다른 말이다 ──
// A는 rewrite가 걸린다는 것까지만 증명한다. BrowserRouter가 그 경로를 실제로 그리는지,
// §10 옛 라우트 리다이렉트가 도는지는 브라우저에서만 확인된다.
let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.log('\n  건너뜀 — playwright 미설치(브라우저 검증). `npm i --no-save playwright`\n')
}
if (chromium) {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })
  const tab = await browser.newPage()
  const errors = []
  tab.on('pageerror', (e) => errors.push(String(e)))

  for (const [path, heading] of [
    ['/home', /홈 대시보드/],
    ['/schedule', /일정|WBS/],
    ['/settlement', /정산/],
    ['/c/demo/status', /진행 현황|담당자/],
  ]) {
    await tab.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' })
    const text = await tab.locator('body').innerText()
    const notFound = /찾을 수 없|NotFound/.test(text)
    check(heading.test(text) && !notFound, `실브라우저 렌더 ${path}`, text.slice(0, 28).replace(/\n/g, ' '))
  }

  // S-00 제품 런처 — 도메인 루트에서 두 제품을 골라 들어간다(2026-09-04). 도메인이 붙은 뒤
  // rmb-mice.com 첫 화면이 이것이므로, 두 카드가 각자의 제품 첫 화면에 실제로 닿는지 클릭으로 본다.
  await tab.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
  const launcher = await tab.locator('body').innerText()
  check(
    /견적 컨피규레이터/.test(launcher) && /MICE 커뮤니케이터/.test(launcher),
    '루트(/) = 제품 런처 — 두 제품 카드',
    launcher.slice(0, 28).replace(/\n/g, ' '),
  )
  await tab.getByRole('link', { name: '견적 컨피규레이터 들어가기' }).click()
  await tab.waitForURL(/\/quotes$/, { timeout: 10_000 })
  check(
    new URL(tab.url()).pathname === '/quotes' && /견적/.test(await tab.locator('h1').first().innerText()),
    '런처 → 견적 컨피규레이터(/quotes)',
    new URL(tab.url()).pathname,
  )
  await tab.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
  await tab.getByRole('link', { name: 'MICE 커뮤니케이터 들어가기' }).click()
  await tab.waitForURL(/\/home$/, { timeout: 10_000 })
  check(
    new URL(tab.url()).pathname === '/home' && /홈 대시보드/.test(await tab.locator('body').innerText()),
    '런처 → MICE 커뮤니케이터(/home)',
    new URL(tab.url()).pathname,
  )

  // §10 옛 라우트 → 새 라우트로 튄다(§18-5가 전환 후 확인하라고 지정한 항목)
  await tab.goto(`${ORIGIN}/configurator`, { waitUntil: 'networkidle' })
  check(
    new URL(tab.url()).pathname === '/quotes',
    '옛 라우트 /configurator → /quotes 리다이렉트',
    new URL(tab.url()).pathname,
  )

  // 새로고침해도 딥링크가 유지된다(rewrite가 없으면 여기서 404가 난다)
  await tab.goto(`${ORIGIN}/partners`, { waitUntil: 'networkidle' })
  await tab.reload({ waitUntil: 'networkidle' })
  check(new URL(tab.url()).pathname === '/partners', '새로고침 후 딥링크 유지', new URL(tab.url()).pathname)

  check(errors.length === 0, '미처리 예외 0건', errors.slice(0, 1).join('') || '0건')
  await browser.close()
}

server.close()
console.log(
  problems.length
    ? `\n실패 ${problems.length}건:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`
    : '\n배포 설정 전 항목 통과 — Vercel 대시보드 설정 없이 import만으로 동작한다.\n',
)
process.exit(problems.length ? 1 : 0)
