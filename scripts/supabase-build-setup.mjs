#!/usr/bin/env node
// supabase/migrations/*.sql(파일명 순) → supabase/setup.sql 통합 생성.
// 설계서 §18-3 "신규 프로젝트 SQL 에디터 1회 실행으로 전체 구축". 사본 드리프트를 막기 위해
// setup.sql은 손으로 고치지 않고 이 스크립트로만 만든다(테스트가 concat 결과와 동일함을 검사).
//   node scripts/supabase-build-setup.mjs          # 생성
//   node scripts/supabase-build-setup.mjs --check  # 최신인지 검사(불일치면 exit 1)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const outFile = join(root, 'supabase', 'setup.sql')

export function buildSetupSql() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const parts = files.map((f) => {
    const body = readFileSync(join(migrationsDir, f), 'utf8').replace(/\s+$/, '')
    return `-- >>> ${f}\n${body}\n-- <<< ${f}\n`
  })
  const header = [
    '-- ═══════════════════════════════════════════════════════════════════════',
    '-- MICE 커뮤니케이터 · Supabase setup.sql (생성물 — 직접 편집 금지)',
    `-- 원본: supabase/migrations/ ${files.length}개 파일을 파일명 순으로 이어 붙였다.`,
    '-- 재생성: node scripts/supabase-build-setup.mjs',
    '--',
    '-- 사용법(설계서 §18-3 · §20 T1): 새 Supabase 프로젝트 → SQL Editor → 이 파일 전문을 붙여 넣고 Run 1회.',
    '-- 멱등: 2회 실행해도 무해하다(scripts/supabase-local-check.mjs가 로컬 Postgres에서 증명).',
    '-- 데모 데이터는 별도 supabase/seed.sql(선택 — 운영 프로젝트에는 실행하지 않아도 된다).',
    '--',
    '-- 첫 admin 승격(§18-2, 본인 이메일로 1회):',
    "--   select app.promote_admin('you@company.com');",
    '-- 허용 이메일 도메인 제한(선택, 비우면 전 도메인 허용):',
    "--   update app_config set allowed_email_domains = array['company.com'] where id = 1;",
    '-- ═══════════════════════════════════════════════════════════════════════',
    'set client_min_messages to warning;',
    '',
  ].join('\n')
  const footer = [
    '',
    '-- ═══════════════════════════════════════════════════════════════════════',
    '-- setup.sql 끝. 다음 두 줄은 필요할 때만 본인 값으로 바꿔 실행한다(§18-2 · §20 T1).',
    "--   select app.promote_admin('you@company.com');                              -- 첫 admin 승격(프로필이 없으면 만들어 두고 첫 로그인 때 연결)",
    "--   update app_config set allowed_email_domains = array['company.com'] where id = 1;  -- 허용 이메일 도메인 제한(선택)",
    '-- ═══════════════════════════════════════════════════════════════════════',
    '',
  ].join('\n')
  return { files, sql: header + parts.join('\n') + footer }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { files, sql } = buildSetupSql()
  if (process.argv.includes('--check')) {
    const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
    if (current !== sql) {
      console.error('setup.sql이 migrations와 다릅니다 — node scripts/supabase-build-setup.mjs 로 재생성하세요')
      process.exit(1)
    }
    console.log(`setup.sql 최신 (${files.length}개 마이그레이션)`)
  } else {
    writeFileSync(outFile, sql)
    console.log(`supabase/setup.sql 생성 — ${files.length}개 마이그레이션, ${sql.length.toLocaleString()} bytes`)
  }
}
