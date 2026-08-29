#!/usr/bin/env node
// 데모 아티팩트 자가완결성 정적 검증 — `node demo/verify/check-artifact.mjs`
//
// 아티팩트는 발행 후에 고칠 수 없고(퍼블리시=배포), 외부 요청은 CSP가 조용히 막으므로
// "빌드 산출물만 보고" 판정 가능한 것은 전부 여기서 막는다. 실패 시 exit 1.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = process.argv[2] ?? 'dist-demo/artifact.html'
const html = readFileSync(FILE, 'utf8')

const problems = []
const notes = []
const ok = (label, value) => notes.push(`  ok   ${label}: ${value}`)
const bad = (label, value) => problems.push(`  FAIL ${label}: ${value}`)
const count = (needle) => html.split(needle).length - 1

// ── 1. 문서 구조 — 퍼블리셔가 doctype/html/head/body를 씌우므로 우리는 본문 조각만 낸다 ──
const structure = [
  ['<title>', 1, 'atLeast'],
  // 2개: ① 앱 스타일시트 ② 랜딩 내보내기 템플릿(buildLandingHtml)이 생성 파일에 넣는 <style> 리터럴.
  // ②는 다운로드되는 .html 안에만 들어가고 이 페이지의 스타일로는 적용되지 않는다 (v2.1 랜딩보드).
  ['<style>', 2, 'exact'],
  ['<div id="root"></div>', 1, 'exact'],
  ['<script type="module">', 1, 'exact'],
]
for (const [needle, want, mode] of structure) {
  const got = count(needle)
  const pass = mode === 'exact' ? got === want : got >= want
  ;(pass ? ok : bad)(`구조 ${needle}`, `${got}개 (기대 ${mode === 'exact' ? '=' : '>='}${want})`)
}
// §13b(v2.4.1): charset 메타가 문서 선두 1,024바이트 안에 있어야 한다(브라우저 프리스캔 규칙).
// 2026-08-27 감수 실증 — 메타가 51KB 지점이면 charset 미선언 서빙에서 한글 정규식이 깨져 전면 백지.
const charsetIdx = html.indexOf('<meta charset="utf-8">')
if (charsetIdx === 0) ok('charset 위치 (§13b)', '파일 선두 0바이트 지점')
else if (charsetIdx > -1 && charsetIdx < 1024) ok('charset 위치 (§13b)', `${charsetIdx}바이트 지점 (<1,024)`)
else bad('charset 위치 (§13b)', charsetIdx === -1 ? 'charset 메타 없음' : `${charsetIdx}바이트 — 프리스캔(1,024) 밖`)

const titleIdx = html.indexOf('<title>')
if (titleIdx > -1 && titleIdx < 8192) ok('제목 위치', `${titleIdx}바이트 지점 (8KB 스캔 안전)`)
else bad('제목 위치', '<title>이 8KB 스캔 범위 안에 없다')

for (const tag of ['<!doctype', '<html', '<head', '<body']) {
  // 문서 셸은 마크업으로 존재하면 안 된다. JS 문자열 안(큐시트 인쇄 blob)에 있는 것은 무해하므로
  // <script> 앞부분(마크업 영역)만 검사한다.
  const markup = html.slice(0, html.indexOf('<script type="module">'))
  const got = markup.toLowerCase().split(tag).length - 1
  ;(got === 0 ? ok : bad)(`문서 셸 없음 ${tag}`, `${got}개`)
}

// ── 2. 외부 자원 참조 0건 ──
const forbidden = [
  ['<link', '외부/상대 스타일시트·아이콘'],
  ['/assets/', '분할 청크 잔존'],
  ['/brand/', '인라인되지 않은 브랜드 자산'],
  ['jsdelivr', 'Pretendard CDN'],
  ['sourceMappingURL', '소스맵 외부 참조'],
  ['__VITE_PRELOAD__', '치환되지 않은 Vite preload 마커'],
]
for (const [needle, why] of forbidden) {
  const got = count(needle)
  ;(got === 0 ? ok : bad)(`금지 참조 ${needle} (${why})`, `${got}개`)
}

// ── 3. http(s) URL 전수 분류 — 호스트 화이트리스트. 새 호스트가 나오면 사람이 판정하도록 실패시킨다 ──
// 아래는 전부 "가져오지 않는 문자열"이다: XML 네임스페이스 상수·라이선스 배너·에러 메시지
// 안내 링크·UI placeholder·픽스처 더미. 실제 요청을 만드는 코드는 4번 항목이 따로 본다.
const BENIGN_HOSTS = new Map([
  ['www.w3.org', 'XML 네임스페이스 상수 (React DOM·SVG)'],
  ['schemas.openxmlformats.org', 'OOXML 네임스페이스·관계 타입 상수 (exceljs)'],
  ['schemas.microsoft.com', 'OOXML 확장 네임스페이스 상수 (exceljs)'],
  ['purl.org', 'Dublin Core 네임스페이스 상수 (exceljs)'],
  ['tailwindcss.com', 'CSS 라이선스 배너'],
  ['reactjs.org', 'React 축약 에러 디코더 안내 문자열'],
  ['github.com', '의존성 라이선스·이슈 안내 주석 (exceljs·core-js·jszip 등)'],
  ['raw.github.com', 'jszip 라이선스 배너'],
  ['stuk.github.io', 'jszip 에러 메시지 문서 링크'],
  ['stuartk.com', 'jszip 라이선스 배너'],
  ['feross.org', 'buffer 라이선스 배너'],
  ['hooks.slack.com', 'S6 비활성 input의 placeholder'],
  ['sheets.example.com', 'S4 시트 연결 픽스처의 더미 URL (실제 요청 없음 — 표시·링크 문자열)'],
  ['example.com', '픽스처 더미 링크'],
  ['…', 'S3 지시 참고링크 textarea placeholder ("https://…")'],
  // v2.1 랜딩보드: 랜딩 내보내기 템플릿의 GA4/GTM 스니펫 문자열. 내려받은 .html에서만 실행되며
  // 데모 아티팩트 자체는 이 호스트로 요청하지 않는다(브라우저 검증: 외부 요청 0건).
  ['www.googletagmanager.com', '랜딩 내보내기용 GA/GTM 스니펫 문자열 (이 페이지는 요청하지 않음)'],
])
const urls = [...new Set(html.match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? [])]
const unknownHosts = new Set()
for (const u of urls) {
  const host = u.replace(/^https?:\/\//, '').split(/[/?#]/)[0]
  if (!BENIGN_HOSTS.has(host)) unknownHosts.add(host)
}
if (unknownHosts.size === 0) {
  ok('http(s) URL 호스트', `${urls.length}종 / ${BENIGN_HOSTS.size}호스트 전부 분류됨(비요청 문자열)`)
} else {
  bad('http(s) URL 호스트', `미분류 호스트 → ${[...unknownHosts].join(' , ')}`)
}

// ── 4. 실제 요청을 만드는 API 호출부 — fetch는 로고 data: URI 1건만 허용 ──
const fetchSites = [...html.matchAll(/\bfetch\(([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')/g)].map((m) => m[1])
if (fetchSites.length === 1) ok('fetch() 호출부', `1건 (로고 data: URI 상수 ${fetchSites[0]})`)
else bad('fetch() 호출부', `${fetchSites.length}건 ${JSON.stringify(fetchSites)} (기대 1)`)
// `importScripts`는 core-js가 워커 판별용으로 **참조만** 한다(`!t.importScripts`) — 호출부만 본다.
for (const api of ['new WebSocket', 'new Worker(', 'serviceWorker', 'sendBeacon', 'importScripts(']) {
  const got = count(api)
  ;(got === 0 ? ok : bad)(`네트워크 API ${api}`, `${got}개`)
}

// ── 5. 브랜드 PNG 인라인 (BrandLogo 2 + exportEstimate 1) ──
const pngs = count('data:image/png;base64,')
;(pngs === 3 ? ok : bad)('브랜드 PNG data: URI', `${pngs}개 (기대 3)`)

// ── 6. 발행 파이프라인이 거절하는 문자 ──
let fffd = 0
let lone = 0
for (let i = 0; i < html.length; i++) {
  const c = html.charCodeAt(i)
  if (c === 0xfffd) fffd++
  if (c >= 0xd800 && c <= 0xdbff) {
    const n = html.charCodeAt(i + 1)
    if (n >= 0xdc00 && n <= 0xdfff) i++
    else lone++
  } else if (c >= 0xdc00 && c <= 0xdfff) lone++
}
;(fffd === 0 ? ok : bad)('U+FFFD 치환 문자', `${fffd}개`)
;(lone === 0 ? ok : bad)('짝 없는 서로게이트', `${lone}개`)

// ── 7. Phase 3.11 내용물이 실제로 들어갔는지(스테일 번들 방지) ──
for (const marker of ['/quotes', '컴플라이언스', '큐시트', 'exceljs']) {
  const got = count(marker)
  ;(got > 0 ? ok : bad)(`v2.0 마커 "${marker}"`, `${got}개`)
}

// ── 8. 인라인 스크립트가 유효한 ES 모듈인가 (조기 종료·이스케이프 파손 탐지) ──
const start = html.indexOf('<script type="module">') + '<script type="module">'.length
const scriptBody = html.slice(start, html.lastIndexOf('</script>'))
const tmp = join(mkdtempSync(join(tmpdir(), 'artifact-')), 'bundle.mjs')
writeFileSync(tmp, scriptBody)
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
  ok('인라인 번들 구문', `유효한 ES 모듈 (${scriptBody.length.toLocaleString()}자)`)
} catch (e) {
  bad('인라인 번들 구문', String(e.stderr ?? e).split('\n').slice(0, 3).join(' | '))
}

// ── 9. 크기 ──
const bytes = Buffer.byteLength(html, 'utf8')
;(bytes <= 16 * 1024 * 1024 ? ok : bad)('파일 크기', `${(bytes / 1024 / 1024).toFixed(2)} MB / 16 MB`)

console.log(`\n${FILE}\n${notes.join('\n')}`)
if (problems.length) {
  console.error(`\n실패 ${problems.length}건:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('\n전 항목 통과 — 외부 요청 0건 자가완결 아티팩트.\n')
