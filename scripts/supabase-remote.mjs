#!/usr/bin/env node
// Supabase Management API로 SQL 파일을 원격 실행한다 — 이 컨테이너는 DB 포트(5432·6543)가 막혀 psql 직결이 불가하고
// https://api.supabase.com 만 통과한다(2026-09-07 실측). SQL Editor 붙여 넣기(§20 T1)의 자동화 대체 경로.
//
//   node scripts/supabase-remote.mjs setup            # supabase/setup.sql 실행
//   node scripts/supabase-remote.mjs seed             # supabase/seed.sql 실행(표 단위 청크 — 각 청크가 자체 트랜잭션, 멱등)
//   node scripts/supabase-remote.mjs sql "select 1"   # 임의 SQL 1건
//   node scripts/supabase-remote.mjs file path.sql    # 임의 파일
//
// 자격증명은 .env.local에서만 읽는다: SUPABASE_ACCESS_TOKEN(sbp_… 개인 액세스 토큰) · VITE_SUPABASE_URL(ref 추출).
// 값은 출력하지 않는다. 완료 후 토큰은 대시보드에서 폐기할 것(계정 전체 권한).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function loadEnvLocal() {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env }
const token = env.SUPABASE_ACCESS_TOKEN
const url = env.VITE_SUPABASE_URL
const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

if (!token || !ref) {
  console.error(
    [
      '자격증명이 없습니다 — .env.local에 다음 두 값이 필요합니다:',
      '  VITE_SUPABASE_URL=https://<ref>.supabase.co',
      '  SUPABASE_ACCESS_TOKEN=sbp_…  (계정 → Access Tokens)',
      `현재: URL ${url ? 'OK' : '없음'} · ref ${ref ? 'OK' : '추출 실패'} · 토큰 ${token ? 'OK' : '없음'}`,
    ].join('\n'),
  )
  process.exit(2)
}

async function runSql(query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`)
  }
  return text
}

/** seed.sql을 `-- ── ` 표 구분선 단위로 쪼갠다. 첫 청크(set·begin)와 마지막 commit은 떼어 내고 청크마다 자체 트랜잭션 */
function chunkSeed(sql) {
  const body = sql.replace(/^set client_min_messages to warning;\s*$/m, '').replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '')
  const parts = body.split(/\n(?=-- ── )/g).map((s) => s.trim()).filter((s) => s && !/^--[^\n]*$/.test(s))
  return parts.map((p) => `set client_min_messages to warning;\nbegin;\n${p}\ncommit;`)
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const started = Date.now()
  if (cmd === 'setup') {
    const sql = readFileSync(join(root, 'supabase', 'setup.sql'), 'utf8')
    await runSql(sql, 'setup.sql')
    console.log(`setup.sql 실행 완료 (${sql.length.toLocaleString()} bytes, ${Date.now() - started}ms)`)
  } else if (cmd === 'seed') {
    const sql = readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8')
    const chunks = chunkSeed(sql)
    let i = 0
    for (const c of chunks) {
      i += 1
      const label = c.match(/-- ── ([^\n]*)/)?.[1] ?? `chunk ${i}`
      await runSql(c, label)
      process.stdout.write(`  ✓ ${label}\n`)
    }
    console.log(`seed.sql 실행 완료 — ${chunks.length}청크, ${Date.now() - started}ms`)
  } else if (cmd === 'sql') {
    console.log(await runSql(arg, 'sql'))
  } else if (cmd === 'file') {
    const sql = readFileSync(arg, 'utf8')
    console.log(await runSql(sql, arg))
  } else {
    console.error('사용법: supabase-remote.mjs setup | seed | sql "<query>" | file <path>')
    process.exit(2)
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
