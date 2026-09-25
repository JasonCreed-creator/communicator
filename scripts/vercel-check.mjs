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

/** vercel.json의 source 패턴(path-to-regexp 축약형)을 정규식으로 옮긴다 — `(.*)`와 이름 붙은 꼬리(`:path*`, Phase 4.4) */
function compile(source) {
  const names = []
  const pattern = source
    .replace(/\/\(\.\*\)/g, '(?:/.*)?')
    .replace(/\(\.\*\)/g, '.*')
    .replace(/:(\w+)\*/g, (_, name) => {
      names.push(name)
      return '(.*)'
    })
  return { re: new RegExp('^' + pattern + '$'), names }
}
const toRegExp = (source) => compile(source).re

/** 매칭된 rewrite의 목적지 — `:path*` 자리를 잡힌 값으로 채운다 */
function destinationFor(rule, pathname) {
  const { re, names } = compile(rule.source)
  const m = re.exec(pathname)
  return rule.destination.replace(/:(\w+)\*/g, (_, name) => (m ? (m[1 + names.indexOf(name)] ?? '') : ''))
}

// Phase 4.4 — 빌드의 기본 경로(VITE_BASE_PATH)는 dist/index.html의 자산 경로에서 읽는다(빌드와 검증이 갈라지지 않게).
// 루트 빌드면 '/', 하위 경로 빌드면 '/leadgen/communicator/' 꼴
const BASE = /src="(\/[^"]*?)assets\/[^"]+\.js"/.exec(readFileSync(join(DIST, 'index.html'), 'utf8'))?.[1] ?? '/'
// 하위 경로 규칙의 접두어 — vercel.json에서 함수로 가는 rewrite를 찾아 읽는다(사본 금지)
const SUBPATH = (CONFIG.rewrites ?? []).find((r) => r.destination === '/api/:path*')?.source.replace(/\/api\/:path\*$/, '') ?? null

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
    served = destinationFor(rule, pathname)
    // 함수(api/)는 로컬에서 돌리지 않는다 — 어느 함수로 가는지만 헤더로 알린다
    if (served.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'x-emulated-function': served })
      res.end('function')
      return
    }
    file = join(DIST, served)
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404)
      res.end('not found')
      return
    }
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
console.log(`\n배포 설정 검증 — ${ORIGIN} (vercel.json 규칙 재현 · 빌드 기본 경로 ${BASE})\n`)

/** 앱 경로 → 이 빌드의 주소('/home' → BASE + 'home') */
const at = (path) => `${BASE}${path.replace(/^\//, '')}`

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
for (const [appPath, label] of DEEP_LINKS) {
  const path = at(appPath)
  const r = await fetch(`${ORIGIN}${path}`)
  const body = await r.text()
  const ok = r.status === 200 && body.includes('<div id="root">')
  check(ok, `딥링크 ${path} — ${label}`, `${r.status}`)
}

// ── B. 정적 자산은 rewrite에 먹히지 않는다 ──
const html = await (await fetch(`${ORIGIN}${at('/')}`)).text()
const assetPath = /src="(\/[^"]*?assets\/[A-Za-z0-9._-]+\.js)"/.exec(html)?.[1]
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

// 견적서가 fetch하는 브랜드 자산(로고·직인)은 실제 PNG여야 한다. 파일이 빠지면 rewrite가 index.html을 200으로
// 돌려주고 — 2026-09-24 운영 실측: 직인 파일이 없던 동안 이 HTML이 견적서에 PNG로 박혀 나갔다.
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
for (const [appPath, label] of [
  ['/brand/remember-logo-offwhite.png', '견적서 로고'],
  ['/brand/remember-seal.png', '견적서 직인'],
]) {
  const path = at(appPath)
  const res = await fetch(`${ORIGIN}${path}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isPng = PNG_SIG.every((b, i) => bytes[i] === b)
  check(
    res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('image/png') && isPng,
    `${label} ${path}이 PNG로 서빙된다(SPA 폴백 아님)`,
    `${res.status} ${res.headers.get('content-type') ?? ''} ${bytes.length}B`,
  )
}

// ── C. 보안 헤더 ──
const root = await fetch(`${ORIGIN}${at('/')}`)
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
for (const path of [at('/c/demo/status'), at('/p/demo-partner')]) {
  const r = await fetch(`${ORIGIN}${path}`)
  check((r.headers.get('x-robots-tag') ?? '').includes('noindex'), `${path} noindex`, r.headers.get('x-robots-tag') ?? '없음')
  check(r.headers.get('referrer-policy') === 'no-referrer', `${path} 리퍼러 차단`, r.headers.get('referrer-policy') ?? '없음')
  check((r.headers.get('cache-control') ?? '').includes('no-store'), `${path} 공유 캐시 금지`, r.headers.get('cache-control') ?? '없음')
}
// 대조군 — 내부 지면은 no-store가 아니어야 한다(규칙이 전역으로 새지 않았는지)
const internal = await fetch(`${ORIGIN}${at('/schedule')}`)
check(
  !(internal.headers.get('cache-control') ?? '').includes('no-store'),
  '토큰 지면 규칙이 내부 지면으로 새지 않는다',
  internal.headers.get('cache-control') ?? '(기본값)',
)

// ── D2. 회사 도메인 하위 경로 규칙(Phase 4.4) — 빌드 기본 경로와 무관하게 접두어 아래가 제자리로 간다 ──
// 회사 CloudFront는 접두어를 그대로 붙여 Vercel로 넘긴다. 서버 함수·자산·로고가 index.html로 새면 화면만 뜨고 기능이 죽는다
check(Boolean(SUBPATH), '하위 경로 rewrite 규칙이 있다(api → 함수)', SUBPATH ?? '없음')
if (SUBPATH) {
  const fn = await fetch(`${ORIGIN}${SUBPATH}/api/drive?action=x`)
  check(fn.headers.get('x-emulated-function') === '/api/drive', `${SUBPATH}/api/drive → 함수 /api/drive`, fn.headers.get('x-emulated-function') ?? `${fn.status}`)
  if (assetPath) {
    const file = assetPath.slice(assetPath.lastIndexOf('/assets/'))
    const a = await fetch(`${ORIGIN}${SUBPATH}${file}`)
    check(
      (a.headers.get('content-type') ?? '').startsWith('text/javascript') && (a.headers.get('cache-control') ?? '').includes('immutable'),
      `${SUBPATH}/assets/* → 해시 자산(immutable)`,
      `${a.status} ${a.headers.get('content-type') ?? ''}`,
    )
  }
  const seal = await fetch(`${ORIGIN}${SUBPATH}/brand/remember-seal.png`)
  const sealBytes = new Uint8Array(await seal.arrayBuffer())
  check(PNG_SIG.every((b, i) => sealBytes[i] === b), `${SUBPATH}/brand/* → PNG(SPA 폴백 아님)`, `${seal.status} ${sealBytes.length}B`)
  for (const path of [SUBPATH, `${SUBPATH}/`, `${SUBPATH}/projects`]) {
    const r = await fetch(`${ORIGIN}${path}`)
    check(r.status === 200 && (await r.text()).includes('<div id="root">'), `딥링크 ${path} → index.html`, `${r.status}`)
  }
  const token = await fetch(`${ORIGIN}${SUBPATH}/c/demo/status`)
  check((token.headers.get('x-robots-tag') ?? '').includes('noindex'), `${SUBPATH}/c/* noindex(토큰 지면 규칙 유지)`, token.headers.get('x-robots-tag') ?? '없음')
}

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

  for (const [appPath, heading] of [
    ['/home', /홈 대시보드/],
    ['/schedule', /일정|WBS/],
    ['/settlement', /정산/],
    ['/c/demo/status', /진행 현황|담당자/],
  ]) {
    const path = at(appPath)
    await tab.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' })
    const text = await tab.locator('body').innerText()
    const notFound = /찾을 수 없|NotFound/.test(text)
    check(heading.test(text) && !notFound, `실브라우저 렌더 ${path}`, text.slice(0, 28).replace(/\n/g, ' '))
  }

  // S-00 제품 런처 — 도메인 루트에서 두 제품을 골라 들어간다(2026-09-04). 도메인이 붙은 뒤
  // rmb-mice.com 첫 화면이 이것이므로, 두 카드가 각자의 제품 첫 화면에 실제로 닿는지 클릭으로 본다.
  await tab.goto(`${ORIGIN}${at('/')}`, { waitUntil: 'networkidle' })
  const launcher = await tab.locator('body').innerText()
  check(
    /견적 컨피규레이터/.test(launcher) && /MICE 커뮤니케이터/.test(launcher),
    `기본 경로(${BASE}) = 제품 런처 — 두 제품 카드`,
    launcher.slice(0, 28).replace(/\n/g, ' '),
  )
  await tab.getByRole('link', { name: '견적 컨피규레이터 들어가기' }).click()
  await tab.waitForURL(/\/quotes$/, { timeout: 10_000 })
  check(
    new URL(tab.url()).pathname === at('/quotes') && /견적/.test(await tab.locator('h1').first().innerText()),
    `런처 → 견적 컨피규레이터(${at('/quotes')})`,
    new URL(tab.url()).pathname,
  )
  await tab.goto(`${ORIGIN}${at('/')}`, { waitUntil: 'networkidle' })
  await tab.getByRole('link', { name: 'MICE 커뮤니케이터 들어가기' }).click()
  await tab.waitForURL(/\/home$/, { timeout: 10_000 })
  check(
    new URL(tab.url()).pathname === at('/home') && /홈 대시보드/.test(await tab.locator('body').innerText()),
    `런처 → MICE 커뮤니케이터(${at('/home')})`,
    new URL(tab.url()).pathname,
  )

  // §10 옛 라우트 → 새 라우트로 튄다(§18-5가 전환 후 확인하라고 지정한 항목)
  await tab.goto(`${ORIGIN}${at('/configurator')}`, { waitUntil: 'networkidle' })
  check(
    new URL(tab.url()).pathname === at('/quotes'),
    `옛 라우트 ${at('/configurator')} → ${at('/quotes')} 리다이렉트`,
    new URL(tab.url()).pathname,
  )

  // 새로고침해도 딥링크가 유지된다(rewrite가 없으면 여기서 404가 난다)
  await tab.goto(`${ORIGIN}${at('/partners')}`, { waitUntil: 'networkidle' })
  await tab.reload({ waitUntil: 'networkidle' })
  check(new URL(tab.url()).pathname === at('/partners'), '새로고침 후 딥링크 유지', new URL(tab.url()).pathname)

  // Phase 4.4 — 하위 경로 빌드를 도메인 루트(Vercel 주소 /·옛 링크 /home)로 열면 기본 경로 아래로 옮겨 간다
  if (BASE !== '/') {
    for (const [from, to] of [
      ['/', BASE],
      ['/home', at('/home')],
    ]) {
      await tab.goto(`${ORIGIN}${from}`, { waitUntil: 'networkidle' })
      check(new URL(tab.url()).pathname === to, `기본 경로 밖 ${from} → ${to}`, new URL(tab.url()).pathname)
    }
    const logo = await tab.evaluate(() => document.querySelector('img[alt="Remember"]')?.getAttribute('src') ?? '')
    check(logo.startsWith(BASE), `로고가 기본 경로 아래에서 온다(${BASE})`, logo || '없음')
  }

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
