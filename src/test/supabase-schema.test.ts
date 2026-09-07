// Phase 4 — supabase/ 산출물의 정적 계약 (서버 0으로 항상 도는 가드).
//   ① setup.sql = migrations 통합 결과와 동일(생성물 드리프트 금지)
//   ② 모든 create table이 RLS 활성 목록에 있고, 정책 0건인 표는 "서비스 전용" 화이트리스트에만 있다
//   ③ 토큰 경로 화이트리스트 밖 표(quotes·settlement_*·vendors·partner 금액)에 anon 정책이 없다(§19.7)
//   ④ 시크릿 실키 패턴이 레포에 없다(§8 DoD 9) · .env.local은 gitignore
//   ⑤ 열거형·상태 전이표가 코드 정본(enums.ts·statusMachine.ts)과 1:1
// 실 Postgres 검증(멱등·RLS 거부·트리거)은 scripts/supabase-local-check.mjs — psql이 있을 때만 여기서도 돈다.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DELIVERABLE_STATUSES, MEMBER_ROLES, APP_ROLES, QUOTE_STATUSES, EVENT_FORMATS } from '../types/enums'
import { TRANSITION_RULES } from '../lib/statusMachine'

const root = process.cwd()
const migDir = join(root, 'supabase', 'migrations')
const migrations = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
const allSql = migrations.map((f) => readFileSync(join(migDir, f), 'utf8')).join('\n')
const setupSql = readFileSync(join(root, 'supabase', 'setup.sql'), 'utf8')
const rlsSql = readFileSync(join(migDir, migrations.find((f) => f.includes('_rls'))!), 'utf8')

/** 정책이 없어도 되는 표 — 서비스 경로(SQL 에디터·Edge Function secret)만 쓴다 */
const SERVICE_ONLY_TABLES = ['app_config']

function createdTables(sql: string): string[] {
  return [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1])
}

describe('Phase 4 · supabase 스키마 정적 계약', () => {
  it('① setup.sql은 migrations를 이어 붙인 결과와 같다(생성물 드리프트 0)', () => {
    for (const f of migrations) {
      expect(setupSql, `${f}가 setup.sql에 없음`).toContain(`-- >>> ${f}`)
      const body = readFileSync(join(migDir, f), 'utf8').replace(/\s+$/, '')
      expect(setupSql).toContain(body)
    }
    const r = spawnSync('node', ['scripts/supabase-build-setup.mjs', '--check'], { encoding: 'utf8', cwd: root })
    expect(r.status, r.stderr).toBe(0)
  })

  it('② 모든 표가 RLS 활성 목록에 있고, 정책 없는 표는 서비스 전용 화이트리스트뿐이다', () => {
    const tables = createdTables(allSql)
    expect(tables.length).toBeGreaterThanOrEqual(40)
    const enableBlock = rlsSql.match(/foreach t in array array\[([\s\S]*?)\]/)![1]
    const enabled = new Set([...enableBlock.matchAll(/'(\w+)'/g)].map((m) => m[1]))
    for (const t of tables) expect(enabled.has(t), `${t} RLS 활성 누락`).toBe(true)
    const withPolicy = new Set([...rlsSql.matchAll(/create policy \w+ on (\w+)/g)].map((m) => m[1]))
    for (const t of tables) {
      if (SERVICE_ONLY_TABLES.includes(t)) {
        expect(withPolicy.has(t), `${t}는 서비스 전용 — 정책이 있으면 안 된다`).toBe(false)
      } else {
        expect(withPolicy.has(t), `${t} 정책 0건(의도면 SERVICE_ONLY_TABLES에 사유와 함께 등재)`).toBe(true)
      }
    }
  })

  it('③ 정책은 전부 authenticated 대상 — anon 정책 0건(토큰 경로는 Edge Function 화이트리스트, §6.2·§19.7)', () => {
    const policies = [...rlsSql.matchAll(/create policy \w+ on \w+[^;]*?to (\w+)/g)].map((m) => m[1])
    expect(policies.length).toBeGreaterThan(80)
    expect(policies.every((r) => r === 'authenticated')).toBe(true)
    const grants = readFileSync(join(migDir, migrations.find((f) => f.includes('_grants'))!), 'utf8')
    expect(grants).toMatch(/revoke all on all tables in schema public from anon/)
    expect(grants).toMatch(/revoke update on profiles from authenticated/)
    expect(grants).not.toMatch(/grant update \([^)]*app_role/)
  })

  it('④ 시크릿 실키 패턴 0건(§8 DoD 9) · .env.local은 gitignore · setup/seed에 실키 없음', () => {
    const r = spawnSync('grep', ['-rlE', 'sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,}|sb_publishable_[A-Za-z0-9_-]{10,}', 'src', 'supabase', 'scripts', 'docs', 'PROGRESS.md', 'CLAUDE.md', 'README.md'], { encoding: 'utf8', cwd: root })
    expect(r.status, `실키 패턴 발견: ${r.stdout}`).toBe(1)
    const gi = readFileSync(join(root, '.gitignore'), 'utf8')
    expect(gi).toMatch(/^\.env\.\*$/m)
    expect(gi).toMatch(/^!\.env\.\*\.example$/m)
    expect(existsSync(join(root, 'supabase', 'seed.sql'))).toBe(true)
  })

  it('⑤ 열거형·전이표가 코드 정본과 1:1', () => {
    const enumOf = (name: string) => {
      const m = allSql.match(new RegExp(`create type ${name} as enum\\s*\\(([^)]*)\\)`, 's'))!
      return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1])
    }
    expect(enumOf('deliverable_status')).toEqual([...DELIVERABLE_STATUSES])
    expect(enumOf('member_role')).toEqual([...MEMBER_ROLES])
    expect(enumOf('app_role')).toEqual([...APP_ROLES])
    expect(enumOf('quote_status')).toEqual([...QUOTE_STATUSES])
    expect(enumOf('event_format')).toEqual([...EVENT_FORMATS])
    // §5 전이표의 (from,to) 쌍이 전부 DB 가드에 있다
    const triggers = readFileSync(join(migDir, migrations.find((f) => f.includes('_triggers'))!), 'utf8')
    const guard = triggers.slice(triggers.indexOf('guard_deliverable_status'), triggers.indexOf('trg_deliverables_status_guard'))
    for (const rule of TRANSITION_RULES) {
      const line = guard.split('\n').find((l) => l.includes(`old.status = '${rule.from}'`))
      expect(line, `가드에 from=${rule.from} 줄 없음`).toBeTruthy()
      expect(line, `가드 ${rule.from} → ${rule.to} 누락`).toContain(`'${rule.to}'`)
    }
  })

  it('⑥ seed 결정적 uuid — 픽스처 id 매핑이 두 구현(TS·검증 스크립트)에서 같다', async () => {
    const { seedUuid } = await import('../../scripts/lib/seedUuid')
    const seed = readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8')
    expect(seed).toContain(seedUuid('prj-stc26'))
    expect(seed).toContain(seedUuid('usr-pm'))
    expect(seed).not.toMatch(/'prj-stc26'|'usr-pm'/) // 문자열 id가 그대로 남지 않았다
    expect(seed).toMatch(/^set client_min_messages to warning;$/m)
  })
})

const hasLocalPg = (() => {
  if (spawnSync('psql', ['--version'], { encoding: 'utf8' }).status !== 0) return false
  const conn = process.env.LOCAL_PG ?? 'host=/tmp/pg-communicator port=54329 user=postgres'
  return spawnSync('psql', [`${conn} dbname=postgres`, '-Atc', 'select 1'], { encoding: 'utf8' }).status === 0
})()

describe.skipIf(!hasLocalPg)('Phase 4 · 로컬 Postgres 실증(psql 있을 때만)', () => {
  it('setup.sql 멱등 · seed 멱등 · RLS 거부 3종 · 트리거 가드 전부 통과', () => {
    const r = spawnSync('node', ['scripts/supabase-local-check.mjs'], { encoding: 'utf8', cwd: root, env: { ...process.env, LOCAL_PG_DB: 'comm_check_vitest' } })
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
  }, 120_000)
})
