// Supabase 시드 데모 데이터 정리 — seed.sql이 넣은 데모 8행사와 그에 딸린 데이터를 지워 빈 상태로 되돌린다.
// "데모는 확인했으니 이제 우리 데이터로 시작하겠다"고 할 때 쓰는 1회성 정리 도구(설계서 §18·§20 전환 절차 보조).
//
// 실행(esbuild 번들 → node):
//   npm run supabase:reset-demo              # 미리보기(기본) — 무엇을 지울지만 출력하고 아무것도 바꾸지 않는다
//   npm run supabase:reset-demo -- --yes     # 실제 삭제
//
// 자격증명은 .env.local에서만 읽는다: VITE_SUPABASE_URL · SUPABASE_SECRET_KEY.
// 값은 어떤 출력에도 찍지 않는다(CLAUDE.md §9). 대상 DB를 오인하지 않도록 URL의 host만 출력한다.
// **서비스 경로(secret key) 전용** — RLS 아래의 authenticated 세션은 projects가 0행이라 지울 대상 자체를 볼 수 없다.
//
// 무엇을 지우는가
//   · 시드 id만. 시드 id = seedUuid(픽스처 문자열 id) = md5('communicator-seed:' || id) — scripts/lib/seedUuid.ts.
//     앱에서 직접 만든 행사·견적·협력사·담당자는 id가 다르므로 대상이 되지 않는다. truncate·조건 없는 delete는 쓰지 않는다.
//   · 순서 = projects → quotes → vendors → profiles.
//     - projects 삭제 = 행사 스코프 표 전부 cascade(멤버·산출물·버전·컨펌·등록·WBS·랜딩·정산·파트너·활동 로그 …).
//     - quotes·quote_imports는 project_id가 `on delete set null`이라 행사만 지우면 project_id만 비고 행은 남는다 → 따로 지운다.
//       quotes는 반드시 한 문장(`in (...)`)으로 지운다 — superseded_by가 NO ACTION이라 체인 중간 행을 먼저 지우면 거부된다.
//     - vendors(협력사 마스터)·profiles(담당자 주소록)는 행사 비종속이라 마지막에 각각 지운다.
//   · 실제(비시드) 데이터가 참조하는 협력사·담당자는 FK가 막는다 → 강제하지 않고 사유를 적어 남겨 둔다.
//     이건 오류가 아니라 설계된 결과이므로 종료 코드 0이다. 그 밖의 실패만 1로 끝난다.
//   · auth.users(로그인 계정)는 건드리지 않는다 — 시드는 auth 계정을 만들지 않는다.
//     `app.grant_demo_access('본인@이메일')`로 만들어진 기획자님 본인 프로필은 시드 id가 아니므로 남는다(의도).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createFixtureState } from '../src/fixtures/sampleProject'
import { seedUuid } from './lib/seedUuid'

// ── 옵션 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const KNOWN = new Set(['--yes', '--dry', '--dry-run', '--help', '-h'])
const unknown = args.filter((a) => !KNOWN.has(a))
if (unknown.length || args.includes('--help') || args.includes('-h')) {
  const bad = unknown.length ? `알 수 없는 옵션: ${unknown.join(' ')}\n` : ''
  console.error(
    `${bad}사용법:\n` +
      '  npm run supabase:reset-demo              미리보기(기본) — 아무것도 지우지 않는다\n' +
      '  npm run supabase:reset-demo -- --yes     실제 삭제\n' +
      '  npm run supabase:reset-demo -- --dry     미리보기(기본과 같음, 명시용)',
  )
  process.exit(unknown.length ? 2 : 0)
}
const APPLY = args.includes('--yes')

// ── env ─────────────────────────────────────────────────────────────────
const root = process.cwd()

function loadEnvLocal(): Record<string, string> {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const envFile = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>
const URL_ = (envFile.VITE_SUPABASE_URL ?? '').trim()
const SECRET = (envFile.SUPABASE_SECRET_KEY ?? '').trim()

// ── 표 출력(한글 폭 2 기준) ─────────────────────────────────────────────
function width(s: string): number {
  let w = 0
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1
  return w
}
function padEndW(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - width(s)))
}
function padStartW(s: string, n: number): string {
  return ' '.repeat(Math.max(0, n - width(s))) + s
}
function table(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows]
  const w = headers.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? ''))))
  // 숫자만 있는 열은 우측정렬, 나머지는 좌측정렬
  const numeric = headers.map((_, i) => rows.length > 0 && rows.every((r) => /^[0-9,]*$/.test(r[i] ?? '')))
  const line = (r: string[], head: boolean) =>
    '  ' + r.map((c, i) => (!head && numeric[i] ? padStartW(c ?? '', w[i]) : padEndW(c ?? '', w[i]))).join('  ').trimEnd()
  return [line(headers, true), '  ' + w.map((n) => '─'.repeat(n)).join('  '), ...rows.map((r) => line(r, false))].join('\n')
}

// ── 시드 대상 — 픽스처에서 그대로 유도한다(gen-seed.ts와 같은 방식) ─────
interface SeedRow {
  fixtureId: string
  id: string
  /** 미리보기·보고용 표시명 */
  label: string
}
/** 행사는 미리보기에서 DB의 현재 이름과 대조한다(시드 이후 수정 여부 표시용) */
interface SeedProjectRow extends SeedRow {
  name: string
}

const state = createFixtureState()
const seedProjects: SeedProjectRow[] = state.projects.map((p) => ({
  fixtureId: p.id,
  id: seedUuid(p.id),
  label: `${p.name} (${p.code})`,
  name: p.name,
}))
const seedQuotes: SeedRow[] = state.quotes.map((q) => ({
  fixtureId: q.id,
  id: seedUuid(q.id),
  label: `${q.title} v${q.version}`,
}))
const seedVendors: SeedRow[] = state.vendors.map((v) => ({
  fixtureId: v.id,
  id: seedUuid(v.id),
  label: v.name,
}))
// profiles(담당자 주소록)는 seed.sql에서 state.users로부터 만들어진다 — 같은 id 규칙을 따른다
const seedProfiles: SeedRow[] = state.users.map((u) => ({
  fixtureId: u.id,
  id: seedUuid(u.id),
  label: `${u.name}${u.email ? ` <${u.email}>` : ''}`,
}))

const projectIds = seedProjects.map((r) => r.id)

/** 행사 삭제로 함께 사라지는 행사 스코프 표(project_id 보유). 이보다 아래 단계(versions·comments·cues·
 *  settlement_items·partner_tokens·landing_daily_metrics 등)도 이 표들을 따라 연쇄 삭제된다. */
const CASCADE_TABLES = [
  'project_members',
  'project_invites',
  'client_contacts',
  'client_tokens',
  'deliverables',
  'milestones',
  'unregistered_files',
  'rsvp_contacts',
  'attendees',
  'sheet_connections',
  'sheet_source_rows',
  'program_sessions',
  'wbs_tasks',
  'role_charters',
  'compliance_cards',
  'landing_pages',
  'settlement_boards',
  'partner_tiers',
  'partners',
  'activity_log',
]

// ── seed.sql 대조 — 계산한 uuid가 실제 시드 파일과 같은지 ───────────────
function crossCheckSeedSql(): { status: 'ok' | 'skip' | 'mismatch'; detail: string } {
  const p = join(root, 'supabase', 'seed.sql')
  if (!existsSync(p)) return { status: 'skip', detail: 'supabase/seed.sql 없음 — 대조 건너뜀' }
  const sql = readFileSync(p, 'utf8')
  const m = sql.match(/delete from activity_log where project_id in \(([^)]*)\)/)
  if (!m) return { status: 'skip', detail: 'seed.sql에서 행사 id 목록을 찾지 못함 — 대조 건너뜀' }
  const inFile = (m[1].match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/g) ?? []).slice().sort()
  const mine = projectIds.slice().sort()
  if (inFile.length === mine.length && inFile.every((v, i) => v === mine[i])) {
    return { status: 'ok', detail: `seed.sql의 행사 ${inFile.length}건과 일치` }
  }
  const onlyMine = mine.filter((v) => !inFile.includes(v))
  const onlyFile = inFile.filter((v) => !mine.includes(v))
  return {
    status: 'mismatch',
    detail:
      `seed.sql과 불일치 — 픽스처 ${mine.length}건 / seed.sql ${inFile.length}건` +
      (onlyMine.length ? `\n    픽스처에만 있음: ${onlyMine.join(', ')}` : '') +
      (onlyFile.length ? `\n    seed.sql에만 있음: ${onlyFile.join(', ')}` : ''),
  }
}

// ── DB 접근 ─────────────────────────────────────────────────────────────
type Admin = SupabaseClient

interface PgError {
  code?: string
  message: string
  details?: string | null
  hint?: string | null
}

/** 참조하는 표 이름을 사람이 읽는 말로 */
const REF_TABLE_KO: Record<string, string> = {
  projects: '행사',
  project_members: '행사 담당자 배정',
  project_invites: '행사 초대',
  deliverables: '산출물 항목',
  versions: '버전',
  approvals: '컨펌',
  comments: '코멘트',
  quotes: '견적',
  quote_imports: '견적서 임포트',
  settlement_items: '정산 항목',
  settlement_imports: '정산 업로드',
  settlement_boards: '정산보드',
}

function refWhoKo(err: PgError): string {
  const t = (err.details ?? '').match(/table "([a-z_]+)"/)?.[1]
  if (!t) return '다른 데이터'
  return REF_TABLE_KO[t] ? `${REF_TABLE_KO[t]}(${t})` : t
}

async function countRows(admin: Admin, table: string, column: string, ids: string[]): Promise<number | null> {
  if (ids.length === 0) return 0
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).in(column, ids)
  if (error) {
    console.log(`  ! ${table} 조회 실패 — ${error.message}`)
    return null
  }
  return count ?? 0
}

function fmtCount(n: number | null): string {
  return n === null ? '조회 실패' : `${n}`
}

// ── 본문 ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('Supabase 시드 데모 데이터 정리')

  if (!URL_ || !SECRET.startsWith('sb_secret_')) {
    console.error(
      [
        '',
        '자격증명이 없습니다 — .env.local에 두 값이 필요합니다(값은 출력하지 않습니다):',
        `  VITE_SUPABASE_URL    ${URL_ ? 'OK' : '없음'}   예) https://<ref>.supabase.co`,
        `  SUPABASE_SECRET_KEY  ${SECRET ? (SECRET.startsWith('sb_secret_') ? 'OK' : '형식 오류(sb_secret_ 로 시작해야 합니다)') : '없음'}`,
        '',
        '이 스크립트는 서비스 경로(secret key)로만 동작합니다 — 로그인 세션(publishable key)으로는',
        'RLS 때문에 시드 행사가 0행으로 보여 지울 대상을 찾을 수 없습니다.',
        'secret key는 절대 VITE_* 이름으로 두지 마세요(프론트 번들에 구워집니다 — 설계서 §12).',
      ].join('\n'),
    )
    process.exit(2)
  }

  const host = (() => {
    try {
      return new URL(URL_).host
    } catch {
      return URL_
    }
  })()

  console.log(`  대상 DB : ${host}`)
  console.log(`  모드    : ${APPLY ? '실제 삭제 (--yes)' : '미리보기 — 아무것도 지우지 않습니다'}`)

  const cross = crossCheckSeedSql()
  console.log(`  시드 대조: ${cross.status === 'ok' ? '✓' : cross.status === 'skip' ? '·' : '✗'} ${cross.detail}`)
  if (cross.status === 'mismatch' && APPLY) {
    console.error(
      [
        '',
        '중단합니다 — 픽스처에서 계산한 행사 id가 supabase/seed.sql의 id 목록과 다릅니다.',
        '둘 다 같은 픽스처에서 나오므로 어긋났다면 seed.sql이 오래된 것입니다.',
        '`npm run supabase:seed`로 seed.sql을 다시 생성해 두 목록을 맞춘 뒤 다시 실행하세요.',
        '(미리보기 모드에서는 이 상태로도 계산 결과를 볼 수 있습니다.)',
      ].join('\n'),
    )
    process.exit(2)
  }

  const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })

  // 0. 현재 상태 ────────────────────────────────────────────────────────
  const probe = await admin.from('projects').select('id').limit(1)
  if (probe.error) {
    console.error(
      `\n행사(projects) 표를 읽지 못했습니다 — ${probe.error.message}\n` +
        'setup.sql이 적용되지 않았을 수 있습니다. 먼저 `npm run supabase:remote -- setup`(또는 SQL Editor)을 실행하세요.',
    )
    process.exit(2)
  }

  console.log('\n## 지울 행사 (시드 id만)')
  const live = await admin.from('projects').select('id, name, code, status').in('id', projectIds)
  if (live.error) {
    console.error(`행사 조회 실패 — ${live.error.message}`)
    process.exit(1)
  }
  const liveById = new Map((live.data ?? []).map((r) => [r.id as string, r as Record<string, unknown>]))
  const projectRows = seedProjects.map((p) => {
    const row = liveById.get(p.id)
    const present = !!row
    const changed = present && String(row?.name ?? '') !== p.name
    return [
      p.fixtureId,
      present ? String(row?.name ?? '') : '—',
      present ? String(row?.status ?? '') : '—',
      present ? (changed ? '있음 ※ 시드와 이름이 다름' : '있음') : '없음',
    ]
  })
  console.log(table(['픽스처 id', '행사명', '상태', 'DB'], projectRows))
  const presentProjects = seedProjects.filter((p) => liveById.has(p.id))
  if (presentProjects.some((p) => String(liveById.get(p.id)?.name ?? '') !== p.name)) {
    console.log(
      '  ※ 이름이 시드와 다른 행사는 데모를 쓰면서 수정한 것으로 보입니다. id가 시드 id이므로 시드 데이터로 보고 함께 지웁니다 —',
    )
    console.log('     실제 업무로 쓰고 있는 행사라면 지금 중단하고(--yes 없이) 그 행사만 앱에서 따로 옮기세요.')
  }

  // 행사 삭제로 함께 사라지는 것 ─────────────────────────────────────────
  console.log('\n## 행사와 함께 사라지는 행사 스코프 데이터 (cascade)')
  const cascadeBefore: Array<{ table: string; n: number | null }> = []
  for (const t of CASCADE_TABLES) cascadeBefore.push({ table: t, n: await countRows(admin, t, 'project_id', projectIds) })
  const shown = cascadeBefore.filter((c) => c.n === null || c.n > 0)
  console.log(
    shown.length
      ? table(['표', '행'], shown.map((c) => [c.table, fmtCount(c.n)]))
      : '  (없음)',
  )
  console.log('  · 이 표들에 딸린 하위 표(versions·approvals·comments·cues·scenario_blocks·guide_sections·')
  console.log('    settlement_buckets·settlement_items·partner_tokens·landing_daily_metrics)도 함께 사라집니다.')

  // 행사 비종속 3표 ──────────────────────────────────────────────────────
  const quoteIds = seedQuotes.map((r) => r.id)
  const vendorIds = seedVendors.map((r) => r.id)
  const profileIds = seedProfiles.map((r) => r.id)

  const before = {
    projects: await countRows(admin, 'projects', 'id', projectIds),
    quotes: await countRows(admin, 'quotes', 'id', quoteIds),
    quote_imports: await countRows(admin, 'quote_imports', 'project_id', projectIds),
    vendors: await countRows(admin, 'vendors', 'id', vendorIds),
    profiles: await countRows(admin, 'profiles', 'id', profileIds),
  }

  console.log('\n## 행사 비종속 — 따로 지우는 표')
  console.log(
    table(
      ['표', '시드', '현재', '설명'],
      [
        ['quotes(견적)', `${quoteIds.length}`, fmtCount(before.quotes), 'project_id가 set null이라 행사만 지우면 남는다'],
        ['vendors(협력사)', `${vendorIds.length}`, fmtCount(before.vendors), '행사 비종속 마스터'],
        ['profiles(담당자)', `${profileIds.length}`, fmtCount(before.profiles), '주소록 — 실제 데이터가 참조하면 남겨 둔다'],
      ],
    ),
  )
  if ((before.quotes ?? 0) > 0) console.log(`  · 지울 견적: ${seedQuotes.map((q) => q.label).join(' · ')}`)
  console.log(
    `  · quote_imports는 시드 픽스처가 없습니다(현재 시드 행사 연결분 ${fmtCount(before.quote_imports)}건) — 행사 삭제 시 project_id만 비고 행은 남습니다.`,
  )

  const nothing =
    (before.projects ?? 0) === 0 && (before.quotes ?? 0) === 0 && (before.vendors ?? 0) === 0 && (before.profiles ?? 0) === 0
  if (nothing) {
    console.log('\n지울 시드 데이터가 없습니다 — 이미 정리된 DB입니다. (아무것도 바꾸지 않았습니다.)')
    return
  }

  if (!APPLY) {
    console.log('\n미리보기였습니다 — 아무것도 지우지 않았습니다.')
    console.log(`실제로 지우려면:  npm run supabase:reset-demo -- --yes      (대상 DB: ${host})`)
    return
  }

  // ── 실제 삭제 ─────────────────────────────────────────────────────────
  const kept: string[] = []
  const failed: string[] = []

  console.log('\n## 삭제')
  // 1) projects — 행사 하나씩(어느 행사가 막혔는지 이름으로 말하기 위해). 항상 `in`/`eq` 조건부 삭제만 한다.
  for (const p of presentProjects) {
    const name = String(liveById.get(p.id)?.name ?? p.label)
    const { error } = await admin.from('projects').delete().eq('id', p.id)
    if (error) {
      const e = error as PgError
      failed.push(`행사 "${name}" 삭제 실패 — ${e.message}${e.details ? ` (${e.details})` : ''}`)
      console.log(`  ✗ 행사 ${name}`)
    } else {
      console.log(`  ✓ 행사 ${name}`)
    }
  }

  // 2) quotes — 반드시 한 문장. superseded_by(NO ACTION) 체인 중간 행을 먼저 지우면 거부된다.
  if ((before.quotes ?? 0) > 0) {
    const { error } = await admin.from('quotes').delete().in('id', quoteIds)
    if (error) {
      const e = error as PgError
      if (e.code === '23503') {
        kept.push(
          `견적 ${quoteIds.length}건을 남겨 둡니다 — 시드가 아닌 ${refWhoKo(e)}이(가) 이 견적을 참조하고 있습니다.` +
            ' (예: 앱에서 만든 견적이 시드 견적을 이전 버전으로 가리키는 경우)',
        )
      } else {
        failed.push(`견적 삭제 실패 — ${e.message}${e.details ? ` (${e.details})` : ''}`)
      }
      console.log('  ✗ 견적')
    } else {
      console.log(`  ✓ 견적 ${quoteIds.length}건 (한 문장으로 일괄 삭제 — superseded_by 체인)`)
    }
  }

  // 3) vendors — 하나씩. 실제 정산 항목이 물고 있으면 남긴다.
  for (const v of seedVendors) {
    const { error } = await admin.from('vendors').delete().eq('id', v.id)
    if (!error) {
      console.log(`  ✓ 협력사 ${v.label}`)
      continue
    }
    const e = error as PgError
    if (e.code === '23503') {
      kept.push(`협력사 "${v.label}"은(는) 실제 ${refWhoKo(e)}이(가) 참조하고 있어 남겨 둡니다.`)
      console.log(`  · 협력사 ${v.label} — 남김`)
    } else {
      failed.push(`협력사 "${v.label}" 삭제 실패 — ${e.message}`)
      console.log(`  ✗ 협력사 ${v.label}`)
    }
  }

  // 4) profiles — 하나씩. 실제 행사·산출물·견적이 담당자로 물고 있으면 남긴다.
  for (const u of seedProfiles) {
    const { error } = await admin.from('profiles').delete().eq('id', u.id)
    if (!error) {
      console.log(`  ✓ 담당자 ${u.label}`)
      continue
    }
    const e = error as PgError
    if (e.code === '23503') {
      kept.push(`담당자 "${u.label}"은(는) 실제 ${refWhoKo(e)}이(가) 참조하고 있어 남겨 둡니다 — 주소록에서 직접 지우세요.`)
      console.log(`  · 담당자 ${u.label} — 남김`)
    } else {
      failed.push(`담당자 "${u.label}" 삭제 실패 — ${e.message}`)
      console.log(`  ✗ 담당자 ${u.label}`)
    }
  }

  // ── 결과 ─────────────────────────────────────────────────────────────
  const after = {
    projects: await countRows(admin, 'projects', 'id', projectIds),
    quotes: await countRows(admin, 'quotes', 'id', quoteIds),
    vendors: await countRows(admin, 'vendors', 'id', vendorIds),
    profiles: await countRows(admin, 'profiles', 'id', profileIds),
  }
  const cascadeAfter = new Map<string, number | null>()
  for (const c of shown) if (c.n !== null) cascadeAfter.set(c.table, await countRows(admin, c.table, 'project_id', projectIds))

  console.log('\n## 결과 (시드 id 기준 행 수)')
  const rows: string[][] = [
    ['projects (행사)', fmtCount(before.projects), fmtCount(after.projects)],
    ['quotes (견적)', fmtCount(before.quotes), fmtCount(after.quotes)],
    ['vendors (협력사)', fmtCount(before.vendors), fmtCount(after.vendors)],
    ['profiles (담당자)', fmtCount(before.profiles), fmtCount(after.profiles)],
  ]
  for (const c of shown) {
    if (!cascadeAfter.has(c.table)) continue
    rows.push([`${c.table} (cascade)`, fmtCount(c.n), fmtCount(cascadeAfter.get(c.table) ?? null)])
  }
  console.log(table(['표', '전', '후'], rows))

  if (kept.length) {
    console.log('\n## 남겨 둔 항목 (강제로 지우지 않습니다)')
    for (const k of kept) console.log(`  · ${k}`)
  }
  if (failed.length) {
    console.log('\n## 실패')
    for (const f of failed) console.log(`  ✗ ${f}`)
  }
  console.log(
    failed.length
      ? '\n일부 삭제가 실패했습니다 — 위 사유를 확인하고 다시 실행하세요(같은 명령을 다시 돌려도 안전합니다).'
      : '\n정리 완료. 같은 명령을 다시 실행해도 안전합니다(지울 것이 없으면 그렇게 알려 줍니다).',
  )
  if (failed.length) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
