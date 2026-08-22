#!/usr/bin/env node
// 아티팩트 서빙 환경 재현 서버 — `npm run demo:serve`
//
// 퍼블리셔와 동일하게 (1) 중첩 경로 /_f/{id}/ 에서 (2) <base href>를 주입한 문서 셸로
// 감싸서 내보낸다. 그리고 **들어오는 모든 요청을 로그로 찍는다** —
// 문서 1건 외에 아무 줄도 찍히지 않으면 same-origin 하위 요청이 0건이라는 뜻이고,
// 브라우저 devtools Network 탭이 비어 있으면 외부 오리진 요청도 0건이라는 뜻이다.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FILE = process.argv[2] ?? resolve(REPO_ROOT, 'dist-demo/artifact.html')
const PORT = Number(process.env.PORT ?? 4183)
const DIR = '/_f/1787393172-408d/'

const server = createServer((req, res) => {
  const when = new Date().toISOString().slice(11, 23)
  if (req.url === DIR || req.url === DIR.slice(0, -1)) {
    console.log(`${when}  200  ${req.url}   ← 문서(이 줄 1개만 나와야 정상)`)
    // 퍼블리셔가 씌우는 셸을 그대로 재현: doctype·base·리셋 CSS.
    const body = readFileSync(FILE, 'utf8')
    const page =
      `<!doctype html><html><head><base href="${DIR}">` +
      `<meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>:root{color-scheme:light}body{margin:0;padding:0;background:#faf9f5;color:#141413}` +
      `img{max-width:100%}</style></head><body>${body}</body></html>`
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
    return
  }
  // 문서 외 요청은 전부 자가완결성 위반이다. 눈에 띄게 로그를 남긴다.
  console.log(`${when}  404  ${req.url}   ← ⚠ 하위 요청 발생: 자가완결 위반`)
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
})

server.listen(PORT, () => {
  console.log(`\n  http://localhost:${PORT}${DIR}\n`)
  console.log('  이 주소를 브라우저로 열고 확인할 것:')
  console.log('   1) 첫 화면이 홈 대시보드(S1)인가 — 404 화면이면 라우터 설정이 잘못된 것')
  console.log('   2) 사이드바에 리멤버 로고 이미지가 보이는가 — "Remember" 텍스트면 PNG 인라인 실패')
  console.log('   3) 메뉴 이동 시 주소가 …/_f/{id}/#/schedule 형태로만 바뀌는가')
  console.log('   4) devtools Network: 문서 1건 외 요청 0건 / Console: 에러 0건')
  console.log('   5) 아래 로그에 404 줄이 하나도 없는가\n')
})
