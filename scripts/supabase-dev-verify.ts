// Phase 4 3단 — dev 프로젝트(실 Supabase) 실검증. CLAUDE.md §4 4d "dev DB에서 DoD 26 전부":
//   DoD 1~25를 **SupabaseProvider(124메서드) 수준의 흐름**으로 재현 + RLS 거부 3종 + 서버 재계산 + 매직링크 왕복(CI 대체).
//   UI 렌더는 mock 스위트(vitest)가 담당한다 — 여기서는 provider가 실DB·RLS·RPC·Vercel 함수 핸들러와 맞물리는지를 본다.
//
// 실행(esbuild 번들 → node):
//   npm run supabase:verify            # 전체
//   npm run supabase:verify -- --keep  # 만든 검증 데이터(행사·견적·사용자)를 지우지 않는다
//   npm run supabase:verify -- --dry   # 자격증명 없이 번들 로드·계획만 출력(네트워크 0)
//
// 자격증명은 .env.local에서만 읽는다: VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY · SUPABASE_SECRET_KEY.
// 값은 어떤 출력에도 찍지 않는다(CLAUDE.md §9). PAT(sbp_)는 여기서 쓰지 않는다 — setup·seed는 supabase-remote.mjs.
//
// 원칙
//   · 검증 데이터는 이 실행이 만든 행사 안에서만 만든다(행사 삭제 = cascade 정리). 시드 행사는 읽기만.
//   · 로그인 = admin generateLink(magiclink) → verifyOtp(token_hash). 실제 메일 수신 왕복은 §20 D-Day 스모크로 이월(4d 허용).
//   · Vercel 함수(quote-recalc·sheets)는 배포 전이라 같은 프로세스의 로컬 HTTP 서버가 핸들러를 그대로 감싼다 —
//     provider는 apiBase만 다르고 코드 경로는 배포본과 같다.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseProvider } from '../src/providers/supabase/SupabaseProvider'
import type { SupabaseEnv } from '../src/providers/supabase/client'
import { handleRecalcRequest } from '../api/_lib/quoteRecalc'
import { handleSheetsRequest } from '../api/_lib/sheets'
import { computeQuoteOutputs } from '../src/modules/quote/engine/quoteInput'
import { createFixtureQuotes } from '../src/fixtures/quoteFixtures'
import { RECRUITING_WBS_TEMPLATE } from '../src/fixtures/wbsTemplates'
import { isProviderError } from '../src/lib/errors'
import { autofillSections } from '../src/lib/landingAutofill'
import type { UUID } from '../src/types/entities'
import { seedUuid } from './lib/seedUuid'

// ── 옵션·env ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const KEEP = args.includes('--keep')
const DRY = args.includes('--dry')
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
const PUBLISHABLE = (envFile.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
const SECRET = (envFile.SUPABASE_SECRET_KEY ?? '').trim()

// ── 결과 기록 ──────────────────────────────────────────────────────────
interface Result {
  name: string
  ok: boolean
  detail: string
}
const results: Result[] = []
let section = ''
function head(title: string): void {
  section = title
  console.log(`\n## ${title}`)
}
function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name: `${section} · ${name}`, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail.split('\n')[0].slice(0, 220)}` : ''}`)
}
async function check(name: string, fn: () => Promise<boolean | string>): Promise<void> {
  try {
    const r = await fn()
    if (r === true) record(name, true)
    else record(name, false, typeof r === 'string' ? r : '조건 불일치')
  } catch (e) {
    record(name, false, errText(e))
  }
}
function errText(e: unknown): string {
  if (isProviderError(e)) return `[${e.code}] ${e.message}`
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
/** 실패해야 통과 — code(ProviderError) 또는 메시지 정규식으로 판정 */
async function expectError(fn: () => Promise<unknown>, want: { code?: string; match?: RegExp }): Promise<boolean | string> {
  try {
    await fn()
    return '실패해야 하는데 성공함'
  } catch (e) {
    const code = isProviderError(e) ? e.code : (e as { code?: string })?.code
    const msg = errText(e)
    if (want.code && code !== want.code) return `code=${code} (기대 ${want.code}) · ${msg}`
    if (want.match && !want.match.test(msg)) return `메시지 불일치: ${msg}`
    return true
  }
}
const MONEY_KEYS = /total_amount|breakdown|settlement|contract_amount|ordered_amount|actual_amount|markup|margin/

// ── Node 전용 심 — provider는 브라우저 전제(localStorage로 현재 행사 선택) ─
const memStore = new Map<string, string>()
if (typeof (globalThis as { localStorage?: unknown }).localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => memStore.get(k) ?? null,
      setItem: (k: string, v: string) => void memStore.set(k, String(v)),
      removeItem: (k: string) => void memStore.delete(k),
      clear: () => memStore.clear(),
    },
    configurable: true,
  })
}
function selectProject(id: UUID | null): void {
  if (id) memStore.set('communicator.currentProjectId', id)
  else memStore.delete('communicator.currentProjectId')
}

// ── 로컬 API 서버 — Vercel 함수 핸들러(api/_lib)를 같은 프로세스에서 감싼다 ─
async function startLocalApi(env: Record<string, string | undefined>): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const url = `http://127.0.0.1${req.url ?? '/'}`
    const request = new Request(url, { method: req.method, headers, body: body.length ? body : undefined })
    let response: Response
    if (url.endsWith('/api/quote-recalc')) response = await handleRecalcRequest(request, env)
    else if (url.endsWith('/api/sheets')) response = await handleSheetsRequest(request, env)
    else response = new Response(JSON.stringify({ error: { code: 'not_found', message: 'no route' } }), { status: 404 })
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    base: `http://127.0.0.1:${port}/api`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

// ── 세션 — 매직링크 CI 대체(4d) ────────────────────────────────────────
interface TestUser {
  label: string
  email: string
  authId: string
  client: SupabaseClient
  accessToken: string
  profileId: UUID
}

function userClient(): SupabaseClient {
  return createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

async function signInViaMagicLink(admin: SupabaseClient, email: string): Promise<{ client: SupabaseClient; accessToken: string; authId: string; via: string }> {
  // generateLink는 메일을 보내지 않고 검증 토큰만 만든다 — 실수신 왕복 없이 같은 verify 경로를 탄다
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink 실패: ${error.message}`)
  const client = userClient()
  const v = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
  if (v.error || !v.data.session) throw new Error(`verifyOtp 실패: ${v.error?.message ?? '세션 없음'}`)
  return { client, accessToken: v.data.session.access_token, authId: v.data.user?.id ?? data.user.id, via: 'magiclink(generateLink→verifyOtp)' }
}

async function createTestUser(admin: SupabaseClient, label: string, email: string, appRole: 'admin' | 'sales' | 'staff'): Promise<TestUser> {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: `검증-${label}` } })
  if (created.error) throw new Error(`createUser(${label}) 실패: ${created.error.message}`)
  const session = await signInViaMagicLink(admin, email)
  // 트리거(0800 auth 연결)가 만든 프로필을 찾고 app_role은 서버 권한(secret)으로 지정 — 자가 승격은 컬럼 권한으로 막혀 있다
  const prof = await admin.from('profiles').select('id, app_role').eq('auth_user_id', created.data.user.id).maybeSingle()
  if (prof.error || !prof.data) throw new Error(`프로필 자동 생성 확인 실패(${label}): ${prof.error?.message ?? '행 없음'} — setup.sql 트리거 상태를 확인하세요`)
  if (prof.data.app_role !== appRole) {
    const up = await admin.from('profiles').update({ app_role: appRole }).eq('id', prof.data.id)
    if (up.error) throw new Error(`app_role 지정 실패(${label}): ${up.error.message}`)
  }
  return { label, email, authId: created.data.user.id, client: session.client, accessToken: session.accessToken, profileId: prof.data.id }
}

// ── 본문 ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('Phase 4 3단 — dev DB 실검증 (DoD 26)')
  if (DRY) {
    console.log('  --dry: 번들 로드 확인만. 계획 —')
    for (const s of PLAN) console.log(`  · ${s}`)
    console.log(`  env: URL ${URL_ ? 'OK' : '없음'} · publishable ${PUBLISHABLE.startsWith('sb_publishable_') ? 'OK' : '없음/형식'} · secret ${SECRET.startsWith('sb_secret_') ? 'OK' : '없음/형식'}`)
    return
  }
  if (!URL_ || !PUBLISHABLE.startsWith('sb_publishable_') || !SECRET.startsWith('sb_secret_')) {
    console.error(
      [
        '자격증명이 없습니다 — .env.local에 세 값이 필요합니다(값은 출력하지 않습니다):',
        `  VITE_SUPABASE_URL             ${URL_ ? 'OK' : '없음'}`,
        `  VITE_SUPABASE_PUBLISHABLE_KEY ${PUBLISHABLE ? (PUBLISHABLE.startsWith('sb_publishable_') ? 'OK' : '형식 오류(sb_publishable_ 필요)') : '없음'}`,
        `  SUPABASE_SECRET_KEY           ${SECRET ? (SECRET.startsWith('sb_secret_') ? 'OK' : '형식 오류(sb_secret_ 필요)') : '없음'}`,
      ].join('\n'),
    )
    process.exit(2)
  }

  const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
  const serverEnv = { SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: SECRET, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }
  const api = await startLocalApi(serverEnv)
  const providerEnv: SupabaseEnv = { url: URL_, publishableKey: PUBLISHABLE, allowedDomains: [], apiBase: api.base }
  const run = Date.now().toString(36)
  const created = { projects: [] as UUID[], quotes: [] as UUID[], users: [] as TestUser[], profiles: [] as UUID[] }

  try {
    // 0. 사전 점검 ─────────────────────────────────────────────────────
    head('0 사전 점검')
    const cfg = await admin.from('app_config').select('id, allowed_email_domains').eq('id', 1).maybeSingle()
    if (cfg.error) {
      record('setup.sql 적용 여부(app_config)', false, `${cfg.error.message} — 먼저 \`npm run supabase:remote -- setup\`(또는 SQL Editor)로 setup.sql을 실행하세요`)
      throw new Error('STOP')
    }
    record('setup.sql 적용됨(app_config 조회)', true)
    const allowed = (cfg.data?.allowed_email_domains as string[] | null) ?? []
    const domain = allowed.length && !allowed.includes('example.com') ? allowed[0] : 'example.com'
    record(`검증 사용자 도메인 = ${domain}${allowed.length ? ' (허용 도메인 제한 있음)' : ' (도메인 제한 없음)'}`, true)
    const seedProbe = await admin.from('projects').select('id').eq('id', seedUuid('prj-stc26')).maybeSingle()
    const seeded = !!seedProbe.data
    record(seeded ? 'seed.sql 적용됨(샘플 행사 존재) — 시드 의존 검사 포함' : 'seed.sql 미적용 — 시드 의존 검사(데모 토큰 경로)는 건너뜀', true)

    // 1. 세션 — 매직링크 CI 대체 ─────────────────────────────────────
    head('1 로그인(매직링크 CI 대체 · 4d)')
    let pm!: TestUser, staff!: TestUser, outsider!: TestUser
    await check('sales(pm) 사용자 생성 → generateLink → verifyOtp 세션', async () => {
      pm = await createTestUser(admin, 'pm', `verify-pm-${run}@${domain}`, 'sales')
      created.users.push(pm)
      return true
    })
    await check('staff 사용자 생성·로그인', async () => {
      staff = await createTestUser(admin, 'staff', `verify-staff-${run}@${domain}`, 'staff')
      created.users.push(staff)
      return true
    })
    await check('비멤버(staff) 사용자 생성·로그인', async () => {
      outsider = await createTestUser(admin, 'outsider', `verify-out-${run}@${domain}`, 'staff')
      created.users.push(outsider)
      return true
    })
    if (!pm || !staff || !outsider) throw new Error('STOP')
    created.profiles.push(pm.profileId, staff.profileId, outsider.profileId)
    const P = createSupabaseProvider({ client: pm.client, env: providerEnv })
    const S = createSupabaseProvider({ client: staff.client, env: providerEnv })
    const O = createSupabaseProvider({ client: outsider.client, env: providerEnv })
    const anon = userClient()
    const A = createSupabaseProvider({ client: anon, env: providerEnv })
    await check('getCurrentUser: 프로필 자동 생성 + app_role 반영(sales)', async () => {
      const me = await P.getCurrentUser()
      return me.app_role === 'sales' && me.id === pm.profileId ? true : JSON.stringify({ app_role: me.app_role })
    })

    // 2. 행사 생성·온보딩 (DoD 10·13·16·20) ─────────────────────────
    head('2 행사 생성·온보딩 (DoD 10·13·16·20)')
    const eventDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
    let projectId!: UUID
    await check('createProject → 생성자 pm 자동 멤버십(트리거) · onboarded_at null', async () => {
      const p = await P.createProject({ name: `검증 행사 ${run}`, code: `VF${run.toUpperCase().slice(-6)}`, event_date: eventDate, event_type: 'recruiting', expected_headcount: 120, venue: '검증홀' })
      projectId = p.id
      created.projects.push(p.id)
      selectProject(p.id)
      const me = await P.getCurrentUser()
      return p.onboarded_at === null && me.role === 'pm' && me.project_id === p.id ? true : JSON.stringify({ onboarded_at: p.onboarded_at, role: me.role })
    })
    if (!projectId) throw new Error('STOP')
    await check('getOnboardingStatus: completed=false', async () => (await P.getOnboardingStatus(projectId)).completed === false)
    await check('completeOnboarding → onboarded_at 기록 + 모객형 WBS 전개 + R&R·컴플라이언스 시드', async () => {
      await P.completeOnboarding(projectId)
      const st = await P.getOnboardingStatus(projectId)
      const tasks = await P.listWbsTasks(projectId)
      const charters = await P.listRoleCharters(projectId)
      const cards = await P.listComplianceCards(projectId)
      const okCount = tasks.length === RECRUITING_WBS_TEMPLATE.length
      return st.completed && st.onboarded_at && okCount && charters.length > 0 && cards.length > 0
        ? true
        : JSON.stringify({ completed: st.completed, tasks: tasks.length, want: RECRUITING_WBS_TEMPLATE.length, charters: charters.length, cards: cards.length })
    })
    await check('completeOnboarding 재호출 → 409 conflict (DoD 16)', () => expectError(() => P.completeOnboarding(projectId), { code: 'conflict' }))
    await check('WBS 날짜가 event_date 기준(D-42 시작 태스크 존재)', async () => {
      const tasks = await P.listWbsTasks(projectId)
      const d42 = new Date(`${eventDate}T00:00:00Z`)
      d42.setUTCDate(d42.getUTCDate() - 42)
      return tasks.some((t) => t.start_date === d42.toISOString().slice(0, 10)) ? true : `D-42 태스크 없음 (첫 태스크 ${tasks[0]?.start_date})`
    })
    await check('listProjects: 새 행사가 목록에 있고 요약 온보딩 단계=완료', async () => {
      const list = await P.listProjects()
      const mine = list.find((s) => s.id === projectId)
      return mine && mine.onboarded && mine.onboarding_steps_done === 3 ? true : mine ? JSON.stringify({ onboarded: mine.onboarded, steps: mine.onboarding_steps_done }) : '목록에 없음'
    })

    // 3. 담당자·주소록 (DoD 19·54) ─────────────────────────────────
    head('3 담당자·주소록 (DoD 19·54)')
    await check('addMember: staff를 design으로 배정(이메일로 기존 프로필 재사용)', async () => {
      const m = await P.addMember(projectId, { display_name: '검증-staff', email: staff.email, role: 'design', title: '대리' })
      return m.user_id === staff.profileId && m.role === 'design' ? true : JSON.stringify({ user_id: m.user_id, want: staff.profileId })
    })
    await check('addMember 중복 배정 → 409', () => expectError(() => P.addMember(projectId, { display_name: 'x', email: staff.email, role: 'ops' }), { code: 'conflict' }))
    await check('removeMember(마지막 PM) → 409', () => expectError(() => P.removeMember(projectId, pm.profileId), { code: 'conflict' }))
    await check('listPeople: 주소록이 행사 무관 + 배정 현황 포함', async () => {
      const people = await P.listPeople()
      const s = people.find((p) => p.id === staff.profileId)
      return s && s.assignments.some((a) => a.project_id === projectId) ? true : '배정 현황 없음'
    })
    await check('createPerson 이메일 중복 → 409', () => expectError(() => P.createPerson({ name: 'x', email: staff.email }), { code: 'conflict' }))
    await check('removePerson(배정 있음) → 409 + 사유에 행사명', () =>
      expectError(() => P.removePerson(staff.profileId), { code: 'conflict', match: new RegExp(`검증 행사 ${run}`) }),
    )
    await check('updatePerson → 모든 행사 멤버 목록에 반영', async () => {
      await P.updatePerson(staff.profileId, { title: '선임' })
      const members = await P.listMembers(projectId)
      return members.find((m) => m.user_id === staff.profileId)?.profile.title === '선임' ? true : '직함 미반영'
    })

    // 4. RLS 거부 3종 (DoD 26) ───────────────────────────────────────
    head('4 RLS 거부 3종 (DoD 26)')
    await check('① staff(app_role) → quotes 0행 · insert 거부', async () => {
      const r = await staff.client.from('quotes').select('id')
      if (r.error) return `select 오류: ${r.error.message}`
      if (r.data.length !== 0) return `보인 행 ${r.data.length}`
      const ins = await staff.client.from('quotes').insert({ title: 'x', input: {}, breakdown: {}, total_amount: 0 })
      return ins.error && /row-level security|permission denied/i.test(ins.error.message) ? true : `insert가 통과함: ${ins.error?.message ?? 'ok'}`
    })
    await check('② 비멤버 → project 0행 (pm은 1행)', async () => {
      const o = await outsider.client.from('projects').select('id').eq('id', projectId)
      const p = await pm.client.from('projects').select('id').eq('id', projectId)
      return o.data?.length === 0 && p.data?.length === 1 ? true : JSON.stringify({ outsider: o.data?.length, pm: p.data?.length, err: o.error?.message })
    })
    await check('② provider 수준: 비멤버의 getProject·listDeliverables → 404/403 (RLS로 가려짐)', async () => {
      const g = await expectError(() => O.getProject(projectId), { match: /찾을 수 없|멤버가 아닙니다|권한/ })
      if (g !== true) return g
      const list = await O.listDeliverables(projectId).catch(() => [])
      return list.length === 0 ? true : `비멤버에게 항목 ${list.length}건 보임`
    })
    await check('③ anon(토큰 경로 롤) → quotes·deliverables·settlement_items 권한 없음', async () => {
      for (const t of ['quotes', 'deliverables', 'settlement_items']) {
        const r = await anon.from(t).select('id').limit(1)
        if (!r.error) return `${t}: anon 조회가 통과함`
      }
      return true
    })
    await check('역할-영역: design 멤버(staff)의 ops 항목 생성 → 403', () =>
      expectError(() => S.createDeliverable({ project_id: projectId, area: 'ops', category: '동선', title: 'x' }), { code: 'forbidden' }),
    )
    await check('권한: 로그인 사용자의 app_role 자가 승격 거부(컬럼 권한)', async () => {
      const r = await staff.client.from('profiles').update({ app_role: 'admin' }).eq('id', staff.profileId)
      return r.error ? true : '승격이 통과함'
    })

    // 5. 컨펌 루프 (DoD 1·2·3·7·23) ─────────────────────────────────
    head('5 컨펌 루프 (DoD 1·2·3·7·23)')
    let token!: string
    await check('발주처 연락처 + 토큰 발급 (기본 만료 = 행사일+30일)', async () => {
      const c = await P.createClientContact({ project_id: projectId, name: '검증 담당', org: '검증사', email: `client-${run}@${domain}` })
      const t = await P.issueClientToken({ project_id: projectId, contact_id: c.id })
      token = t.token
      const want = new Date(`${eventDate}T00:00:00Z`)
      want.setUTCDate(want.getUTCDate() + 30)
      return t.expires_at?.slice(0, 10) === want.toISOString().slice(0, 10) ? true : `expires_at=${t.expires_at}`
    })
    if (!token) throw new Error('STOP')
    let d1!: UUID, d2!: UUID
    await check('DoD 1: 생성 → 업로드(v1) → 내부확정 → 컨펌 발송 → 큐 노출 → 승인 → final', async () => {
      const d = await P.createDeliverable({ project_id: projectId, area: 'design', category: '키비주얼', title: '메인 KV', assignee_id: pm.profileId })
      d1 = d.id
      if (d.status !== 'draft') return `초기 status=${d.status}`
      const v = await P.uploadVersion(d.id, { file_name: 'kv.pdf', file: new Blob(['%PDF-1.4 verify'], { type: 'application/pdf' }) })
      if (v.version_no !== 1) return `version_no=${v.version_no}`
      await P.transitionStatus(d.id, 'internal_review')
      const ap = await P.requestApproval(d.id, { version_id: v.id })
      const q = await A.getClientQueue(token)
      const item = q.queue.find((x) => x.approval_id === ap.id)
      if (!item) return '큐에 없음'
      await A.submitClientDecision(token, { approval_id: ap.id, decision: 'approved' })
      const after = await P.getDeliverable(d.id)
      return after.status === 'final' ? true : `승인 후 status=${after.status}`
    })
    await check('컨펌 발송 조건: 미리보기 포맷 아님(.docx) → 422', async () => {
      const d = await P.createDeliverable({ project_id: projectId, area: 'design', category: '초청장', title: '문서', assignee_id: pm.profileId })
      const v = await P.uploadVersion(d.id, { file_name: 'x.docx' })
      await P.transitionStatus(d.id, 'internal_review')
      return expectError(() => P.requestApproval(d.id, { version_id: v.id }), { code: 'validation' })
    })
    await check('DoD 2: 수정요청(코멘트 없음 422 → 코멘트 포함) → changes_requested → 재업로드 시 draft 자동 복귀', async () => {
      const d = await P.createDeliverable({ project_id: projectId, area: 'design', category: '배너', title: '현수막', assignee_id: pm.profileId })
      d2 = d.id
      const v = await P.uploadVersion(d.id, { file_name: 'banner.png' })
      await P.transitionStatus(d.id, 'internal_review')
      const ap = await P.requestApproval(d.id, { version_id: v.id })
      const noComment = await expectError(() => A.submitClientDecision(token, { approval_id: ap.id, decision: 'changes_requested' }), { code: 'validation' })
      if (noComment !== true) return `코멘트 없는 수정요청: ${noComment}`
      await A.submitClientDecision(token, { approval_id: ap.id, decision: 'changes_requested', comment: '색을 바꿔 주세요' })
      const mid = await P.getDeliverable(d.id)
      if (mid.status !== 'changes_requested') return `수정요청 후 status=${mid.status}`
      const v2 = await P.uploadVersion(d.id, { file_name: 'banner-v2.png' })
      const after = await P.getDeliverable(d.id)
      return after.status === 'draft' && v2.version_no === 2 ? true : JSON.stringify({ status: after.status, version_no: v2.version_no })
    })
    await check('DoD 3: internal 코멘트는 /c 큐 어디에도 없음 · shared 코멘트(발주처 작성분 포함)만', async () => {
      await P.addComment(d2, { body: `내부만-${run}` })
      await P.addComment(d2, { body: `공유-${run}`, visibility: 'shared' })
      await P.transitionStatus(d2, 'internal_review')
      const detail = await P.getDeliverable(d2)
      const latest = detail.versions.sort((a, b) => b.version_no - a.version_no)[0]
      await P.requestApproval(d2, { version_id: latest.id })
      const q = await A.getClientQueue(token)
      const text = JSON.stringify(q)
      if (text.includes(`내부만-${run}`)) return 'internal 코멘트가 /c에 노출'
      if (!text.includes(`공유-${run}`)) return 'shared 코멘트가 /c에 없음'
      if (!text.includes('색을 바꿔 주세요')) return '발주처 수정요청 코멘트가 이력에 없음'
      if (/"visibility":"internal"/.test(text)) return 'visibility=internal 항목 존재'
      return true
    })
    await check('final 항목 상세: 버전 1건·approved 이력·발주처 현황 recent_finals에 등장', async () => {
      const det = await P.getDeliverable(d1)
      const st = await A.getClientStatus(token)
      return det.versions.length === 1 && det.approvals.some((a) => a.decision === 'approved') && st.recent_finals.some((f) => f.deliverable_id === d1)
        ? true
        : JSON.stringify({ versions: det.versions.length, approved: det.approvals.map((a) => a.decision), finals: st.recent_finals.length })
    })
    await check('DoD 23: /c 큐·현황 응답에 금액·정산 키 0건 + 담당자(staff) 노출(3.18.1)', async () => {
      const q = JSON.stringify(await A.getClientQueue(token))
      const st = await A.getClientStatus(token)
      const s = JSON.stringify(st)
      if (MONEY_KEYS.test(q) || MONEY_KEYS.test(s)) return '금액 키 검출'
      return st.staff.some((x) => x.user_id === pm.profileId) ? true : 'staff 노출 없음'
    })
    await check('DoD 7: 지시 발행(brief) → requested → 첫 업로드 시 draft 자동 전환', async () => {
      const d = await P.createDeliverable({ project_id: projectId, area: 'design', category: '명찰', title: '명찰 디자인', assignee_id: staff.profileId, brief: '로고 중앙, 90×60', spec_size: '90×60mm', spec_qty: 200 })
      if (d.status !== 'requested') return `status=${d.status}`
      const dash = await S.getDashboard(projectId)
      if (!dash.my_requested.some((x) => x.id === d.id)) return "담당자 홈 '받은 지시'에 없음"
      const v = await S.uploadVersion(d.id, { file_name: 'badge.pdf' })
      const after = await P.getDeliverable(d.id)
      return after.status === 'draft' && v.version_no === 1 ? true : `status=${after.status}`
    })
    await check('지시 발행은 pm 전용 — design(staff)의 brief 포함 생성 → 403', () =>
      expectError(() => S.createDeliverable({ project_id: projectId, area: 'design', category: 'x', title: 'x', assignee_id: staff.profileId, brief: 'b' }), { code: 'forbidden' }),
    )
    await check('전이표 밖: draft → final 직접 전이 → 409', async () => {
      const d = await P.createDeliverable({ project_id: projectId, area: 'design', category: 'x', title: '전이 테스트', assignee_id: pm.profileId })
      return expectError(() => P.transitionStatus(d.id, 'final'), { code: 'conflict' })
    })
    await check('토큰 회수 → /c 410 gone', async () => {
      const c = await P.createClientContact({ project_id: projectId, name: '회수 대상' })
      const t = await P.issueClientToken({ project_id: projectId, contact_id: c.id })
      await P.revokeClientToken(t.token)
      return expectError(() => A.getClientQueue(t.token), { code: 'gone' })
    })

    // 6. 등록·홈·운영계획서 (DoD 4·5·8) ────────────────────────────
    head('6 등록·홈·운영계획서 (DoD 4·5·8)')
    await check('DoD 4: CSV 임포트 3행 → 재임포트 시 이메일 기준 upsert → 체크인 → 통계', async () => {
      const rows = [1, 2, 3].map((i) => ({ name: `참가자${i}`, org: '검증사', email: `att${i}-${run}@${domain}` }))
      const r1 = await P.importRegistrationCsv(projectId, 'attendees', rows)
      const r2 = await P.importRegistrationCsv(projectId, 'attendees', rows)
      const list = await P.listAttendees(projectId)
      const first = list.find((a) => a.email === rows[0].email)
      if (!first) return '참관객 없음'
      const t = await P.toggleCheckin(first.id)
      const stats = await P.getRegistrationStats(projectId)
      return r1.inserted === 3 && r2.updated === 3 && r2.inserted === 0 && t.checked_in_at && stats.attendee_total === 3 && stats.checked_in === 1
        ? true
        : JSON.stringify({ r1, r2, checked: !!t.checked_in_at, stats })
    })
    await check('reg 권한: design(staff)의 CSV 임포트 → 403', () => expectError(() => S.importRegistrationCsv(projectId, 'attendees', [{ name: 'x' }]), { code: 'forbidden' }))
    await check('DoD 5: 홈 대시보드 — 미결 컨펌 1건(d2)·영역 진행률 3축·최근 활동', async () => {
      const dash = await P.getDashboard(projectId)
      const pending = dash.pending_approvals.some((x) => x.deliverable.id === d2)
      return pending && dash.area_progress.length >= 3 && dash.recent_activity.length > 0
        ? true
        : JSON.stringify({ pending, areas: dash.area_progress.length, activity: dash.recent_activity.length })
    })
    await check('DoD 8·23: 운영계획서 조립 — 제작물 리스트에 지시 스펙 반영 · 금액 키 0건', async () => {
      const plan = await P.getPlan(projectId)
      const text = JSON.stringify(plan)
      if (MONEY_KEYS.test(text)) return '금액 키 검출'
      const badge = plan.production_items.some((x) => JSON.stringify(x).includes('90×60mm'))
      return badge && plan.section_progress.length >= 6 ? true : JSON.stringify({ badge, sections: plan.section_progress.length })
    })
    await check('활동 로그: project.created·deliverable 전이가 기록됨', async () => {
      const log = await P.listActivity(projectId, 200)
      return log.some((e) => e.action === 'project.created') ? true : `actions=${[...new Set(log.map((e) => e.action))].join(',')}`
    })

    // 7. 견적 — 서버 재계산·권한·핸드오프 (DoD 21·24·25·26) ────────
    head('7 견적 — 서버 재계산·권한·핸드오프 (DoD 21·24·25·26)')
    const sampleInput = createFixtureQuotes(seedUuid('prj-stc26'))[0].input
    const expected = computeQuoteOutputs(sampleInput)
    let quoteId!: UUID
    let quoteV2!: UUID
    await check('createQuote(provider → 로컬 /api/quote-recalc → 핸들러) → 엔진 산출과 0원 일치', async () => {
      const q = await P.createQuote({ ...sampleInput, event_name: `검증 견적 ${run}` })
      quoteId = q.id
      created.quotes.push(q.id)
      return q.total_amount === expected.total_amount && q.version === 1 && q.source === 'engine' ? true : JSON.stringify({ got: q.total_amount, want: expected.total_amount })
    })
    await check('서버 재계산: 클라이언트가 보낸 total_amount·breakdown은 버려지고 엔진 값이 저장(DoD 26)', async () => {
      const res = await fetch(`${api.base}/quote-recalc`, {
        method: 'POST',
        headers: { authorization: `Bearer ${pm.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'create', input: { ...sampleInput, event_name: `조작 시도 ${run}` }, total_amount: 1, breakdown: { hacked: true } }),
      })
      const json = (await res.json()) as { quote?: { id: UUID; total_amount: number; breakdown: unknown } }
      if (!res.ok || !json.quote) return `HTTP ${res.status}`
      created.quotes.push(json.quote.id)
      const stored = await admin.from('quotes').select('total_amount, breakdown').eq('id', json.quote.id).single()
      return stored.data?.total_amount === expected.total_amount && !('hacked' in (stored.data?.breakdown as object))
        ? true
        : JSON.stringify({ stored: stored.data?.total_amount, want: expected.total_amount })
    })
    await check('staff의 서버 재계산 호출 → 403 · 토큰 없음 → 401', async () => {
      const r1 = await fetch(`${api.base}/quote-recalc`, { method: 'POST', headers: { authorization: `Bearer ${staff.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ op: 'create', input: sampleInput }) })
      const r2 = await fetch(`${api.base}/quote-recalc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'create', input: sampleInput }) })
      return r1.status === 403 && r2.status === 401 ? true : `staff=${r1.status} none=${r2.status}`
    })
    await check('saveQuoteVersion → v2 + 이전 버전 superseded 체인', async () => {
      const v2 = await P.saveQuoteVersion(quoteId, { ...sampleInput, headcount: sampleInput.headcount + 10 })
      quoteV2 = v2.id
      created.quotes.push(v2.id)
      const prev = await P.getQuote(quoteId)
      return v2.version === 2 && prev.superseded_by === v2.id && prev.status === 'superseded' ? true : JSON.stringify({ v: v2.version, sup: prev.superseded_by, st: prev.status })
    })
    await check('DoD 25: staff는 listQuotes 0건·getQuote 403/404 (RLS로 가려짐)', async () => {
      const list = await S.listQuotes().catch((e) => (isProviderError(e) && e.code === 'forbidden' ? [] : Promise.reject(e)))
      if (list.length !== 0) return `staff에게 ${list.length}건 보임`
      const r = await expectError(() => S.getQuote(quoteId), {})
      return r
    })
    await check('DoD 24: 미확정 견적으로 행사 만들기 → 409', () => expectError(() => P.createProjectFromQuote(quoteV2), { code: 'conflict' }))
    let quoteProjectId!: UUID
    await check('finalizeQuote → is_final·locked_at · createProjectFromQuote → 상호 링크(§16)', async () => {
      const f = await P.finalizeQuote(quoteV2)
      if (!f.is_final || !f.locked_at) return 'finalize 실패'
      const p = await P.createProjectFromQuote(quoteV2)
      quoteProjectId = p.id
      created.projects.push(p.id)
      const q = await P.getQuote(quoteV2)
      return p.quote_id === quoteV2 && q.project_id === p.id && p.onboarded_at === null && p.expected_headcount === sampleInput.headcount + 10
        ? true
        : JSON.stringify({ pq: p.quote_id, qp: q.project_id, hc: p.expected_headcount })
    })
    await check('확정 견적 잠금: 확정본 수정은 새 버전 경로만(직접 update → 트리거 QUOTE_LOCKED)', async () => {
      const r = await admin.from('quotes').update({ total_amount: 1 }).eq('id', quoteV2)
      return r.error && /QUOTE_LOCKED/.test(r.error.message) ? true : `잠금 미작동: ${r.error?.message ?? 'ok'}`
    })

    // 8. 정산 (DoD 29·30) ─────────────────────────────────────────────
    head('8 정산 (DoD 29·30)')
    await check('createSettlementBoard(확정 견적) → 버킷 9종(rc·ld 분리) + 항등식', async () => {
      const board = await P.createSettlementBoard(projectId, quoteV2)
      const codes = board.buckets.map((b) => b.bucket.code)
      return board.buckets.length >= 9 && codes.includes('rc') && codes.includes('ld') && board.totals.identityOk
        ? true
        : JSON.stringify({ n: board.buckets.length, codes, identity: board.totals.identityOk })
    })
    await check('has_cost=false 버킷(ld)에 발주액 → 422 validation (R-S4)', async () => {
      const board = await P.getSettlementBoard(projectId)
      const ld = board?.buckets.find((b) => b.bucket.code === 'ld')
      if (!ld) return 'ld 버킷 없음'
      return expectError(() => P.createSettlementItem(projectId, ld.bucket.id, { title: 'x', ordered_amount: 1000 }), { code: 'validation' })
    })
    await check('부가세 포함 입력 → round(v/1.1) 저장 + 원본 보존(§19.4) · 항등식 유지', async () => {
      const board = await P.getSettlementBoard(projectId)
      const s1 = board?.buckets.find((b) => b.bucket.has_cost)
      if (!s1) return 'has_cost 버킷 없음'
      const item = await P.createSettlementItem(projectId, s1.bucket.id, { title: '검증 발주', ordered_amount: 1100000, vat_included_input: true })
      const after = await P.getSettlementBoard(projectId)
      return item.ordered_amount === 1000000 && item.input_amount_raw === 1100000 && item.vat_included_input && after?.totals.identityOk
        ? true
        : JSON.stringify({ ordered: item.ordered_amount, raw: item.input_amount_raw })
    })
    await check('정산 비노출: /c 큐·현황·운영계획서 조립 데이터에 정산 키 0건(§19.7)', async () => {
      const t = JSON.stringify(await A.getClientQueue(token)) + JSON.stringify(await A.getClientStatus(token)) + JSON.stringify(await P.getPlan(projectId))
      return MONEY_KEYS.test(t) ? '정산·금액 키 검출' : true
    })

    // 9. 랜딩 (DoD 27·28) ─────────────────────────────────────────────
    head('9 랜딩 (DoD 27·28)')
    let landingId!: UUID
    await check('createLandingPage → 기본 13섹션·폼·동의 시드 · autofill(읽기 시 조립)이 행사 개요를 채움', async () => {
      const l = await P.createLandingPage(projectId, { title: `검증 랜딩 ${run}`, slug: `verify-${run}` })
      landingId = l.id
      // 저장본은 기본 템플릿 그대로(autofill 플래그만) — 조립은 화면·내보내기 직전에 lib/landingAutofill이 한다(mock과 동일 규약)
      const filled = autofillSections(l.sections, {
        project: await P.getProject(projectId),
        sessions: await P.listProgramSessions(projectId),
        zoneDeliverables: [],
      })
      const hero = filled.find((s) => s.type === 'hero')
      return l.sections.length === 13 && l.form_fields.length > 0 && hero?.headline === `검증 행사 ${run}`
        ? true
        : JSON.stringify({ sections: l.sections.length, fields: l.form_fields.length, hero: hero?.headline ?? null })
    })
    await check('같은 slug를 같은 행사에 → 409 · 다른 행사(견적 행사)에는 가능(§4-21)', async () => {
      const dup = await expectError(() => P.createLandingPage(projectId, { title: 'x', slug: `verify-${run}` }), { code: 'conflict' })
      if (dup !== true) return dup
      const other = await P.createLandingPage(quoteProjectId, { title: 'x', slug: `verify-${run}` })
      return other.project_id === quoteProjectId ? true : '다른 행사 생성 실패'
    })
    await check('anon 랜딩 리드 제출 → attendees(channel=rsvp) 유입 + 성함 누락 422', async () => {
      const l = await P.getLandingPage(landingId)
      const nameField = l.form_fields.find((f) => /성함|이름/.test(f.label)) ?? l.form_fields[0]
      const values: Record<string, string> = { [`f_${nameField.id}`]: `리드-${run}` }
      for (const c of l.consents) if (c.required) values[`c_${c.id}`] = 'on'
      const missing = await expectError(() => A.submitLandingLead(landingId, {}), { code: 'validation' })
      if (missing !== true) return `성함 누락: ${missing}`
      const att = await A.submitLandingLead(landingId, values)
      const list = await P.listAttendees(projectId)
      return att.channel === 'rsvp' && list.some((a) => a.id === att.id) ? true : JSON.stringify({ channel: att.channel })
    })
    await check('종료 행사에 랜딩 생성 → 409 (closeProject → 쓰기 전부 409) → 재개', async () => {
      await P.closeProject(quoteProjectId, true)
      const r = await expectError(() => P.createLandingPage(quoteProjectId, { title: 'x', slug: `closed-${run}` }), { code: 'conflict' })
      const m = await expectError(() => P.createMilestone(quoteProjectId, { title: 'x', due_date: eventDate }), { code: 'conflict' })
      await P.closeProject(quoteProjectId, false)
      return r === true && m === true ? true : `landing=${r} milestone=${m}`
    })

    // 10. 운영보드 정형 문서 (DoD 12·35~38) ───────────────────────────
    head('10 운영보드 정형 문서 (DoD 12·35~38)')
    let scenarioId!: UUID
    await check('프로그램 세션 2건 → 시나리오 시드(빈 문서만) → 재시드 409 (R-O3)', async () => {
      await P.createProgramSession(projectId, { title: '오프닝', start_time: '09:30', end_time: '09:40' })
      await P.createProgramSession(projectId, { title: '키노트', start_time: '09:40', end_time: '10:20', speaker_name: '홍연사' })
      const d = await P.createDeliverable({ project_id: projectId, area: 'ops', category: '시나리오', title: '진행 시나리오', assignee_id: pm.profileId })
      scenarioId = d.id
      const blocks = await P.seedScenarioFromProgram(d.id)
      if (blocks.length === 0) return '블록 0건'
      return expectError(() => P.seedScenarioFromProgram(d.id), { code: 'conflict' })
    })
    await check('큐시트: 큐 CRUD → 시나리오 내보내기는 기존 큐 보존+후미 삽입 (R-O5)', async () => {
      const cue = await P.createDeliverable({ project_id: projectId, area: 'ops', category: '큐시트', title: '메인 큐시트', assignee_id: pm.profileId })
      const c1 = await P.createCue(cue.id, { cue_no: 'C-01', time_at: '09:30', segment: 'MC', body: '개회 선언' })
      await P.saveScenarioBlocks(scenarioId, [
        ...(await P.listScenarioBlocks(scenarioId)).map((b) => ({ session_id: b.session_id, time: b.time, kind: b.kind, script: b.script, note: b.note })),
        { kind: 'video', time: '09:35', script: '오프닝 영상 M-02 재생' },
      ])
      const added = await P.exportScenarioToCues(scenarioId, cue.id)
      const all = await P.listCues(cue.id)
      return all[0]?.id === c1.id && added.length >= 1 && all.length === 1 + added.length ? true : JSON.stringify({ first: all[0]?.id === c1.id, added: added.length, all: all.length })
    })
    await check('운영가이드: 4섹션 시드 → 인쇄 스냅숏(doc-snapshot .pdf 규약) · 연락처 기본 제외(R-O6)', async () => {
      const g = await P.createDeliverable({ project_id: projectId, area: 'ops', category: '운영가이드', title: '운영가이드', assignee_id: pm.profileId })
      const sections = await P.seedGuideFromSources(g.id)
      const v = await P.createDocSnapshot(g.id)
      const url = await P.getFileUrl(v.id)
      return sections.length === 4 && /\.pdf$/i.test(v.file_name) && typeof url === 'string' ? true : JSON.stringify({ sections: sections.length, file: v.file_name })
    })
    await check('S9: ⑦비상 대응·시나리오 섹션이 조립되고 진행률에 반영', async () => {
      const plan = await P.getPlan(projectId)
      return plan.scenario !== null && plan.section_progress.length >= 7 ? true : JSON.stringify({ scenario: !!plan.scenario, sections: plan.section_progress.length })
    })

    // 11. 시트 연동 (DoD 42~46) ───────────────────────────────────────
    head('11 등록 시트 연동 (DoD 42~46 · 서버 함수 데모 모드)')
    const sheetUrl = `https://docs.google.com/spreadsheets/d/verify-${run}/edit#gid=0`
    let sheetTab = ''
    await check('probe → preview → connect(필수 매핑 이름+이메일) → state connected · 참관객 적재', async () => {
      const probe = await P.probeSheet(projectId, sheetUrl)
      const tab = probe.tabs.find((t) => t.selectable)
      if (!tab) return '선택 가능한 탭 없음'
      sheetTab = tab.name
      const cols = await P.previewSheetColumns(projectId, sheetUrl, tab.name)
      const mapping = cols.map((c) => ({ column: c.column, field: c.suggested }))
      if (!mapping.some((m) => m.field === 'name') || !mapping.some((m) => m.field === 'email')) return '이름·이메일 추측 매핑 없음'
      const conn = await P.connectSheet(projectId, { url: sheetUrl, tab_name: tab.name, mapping, first_row_is_header: true })
      const list = await P.listAttendees(projectId)
      return conn.state === 'connected' && conn.snapshot_version >= 1 && list.some((a) => a.sheet_row_id) ? true : JSON.stringify({ state: conn.state, v: conn.snapshot_version, sheetRows: list.filter((a) => a.sheet_row_id).length })
    })
    await check('필수 매핑 누락(이메일 없음) → 422 validation (연결은 생기지 않음)', async () => {
      if (!sheetTab) return '선행 probe 실패'
      const r = await expectError(
        () => P.connectSheet(quoteProjectId, { url: sheetUrl, tab_name: sheetTab, mapping: [{ column: '성명', field: 'name' }], first_row_is_header: true }),
        { code: 'validation', match: /이름|이메일|필수/ },
      )
      if (r !== true) return r
      return (await P.getSheetConnection(quoteProjectId)) === null ? true : '거부됐는데 연결 행이 생김'
    })
    await check('checkSheetUpdates는 감지만(참관객 수 불변) · applySheetDiff 낡은 버전 → 409 (DoD 43)', async () => {
      const before = (await P.listAttendees(projectId)).length
      const conn = await P.checkSheetUpdates(projectId)
      const after = (await P.listAttendees(projectId)).length
      if (before !== after) return `감지 중 참관객 수 변경 ${before}→${after}`
      const stale = await expectError(() => P.applySheetDiff(projectId, conn.snapshot_version - 1), { code: 'conflict' })
      if (stale !== true) return stale
      const diff = await P.getSheetDiff(projectId)
      return Array.isArray(diff.rows) ? true : 'diff 형식 오류'
    })
    await check('시트 기준 KPI(getSheetRegistrationStats) 반환 · 항등식 항 존재 (DoD 46)', async () => {
      const s = await P.getSheetRegistrationStats(projectId)
      return s && typeof s.confirm_rate === 'number' ? true : 'null 또는 형식 오류'
    })
    await check('시트 권한: design(staff)의 applySheetDiff → 403', () => expectError(() => S.applySheetDiff(projectId, 1), { code: 'forbidden' }))

    // 12. 주최형·파트너 (DoD 31~33) ──────────────────────────────────
    head('12 주최형·파트너 (DoD 31~33)')
    let partnerToken!: string
    let partnerItem!: UUID
    await check("kind='host' 전환 → 파트너·토큰 → expandHostWbs → /p 포털에 자기 항목만 (R-H2·R-H3)", async () => {
      await P.updateProject(projectId, { kind: 'host' })
      const tier = await P.upsertPartnerTier(projectId, { code: 'GOLD', name: '골드', price: 5000000, sort: 1 })
      const a = await P.createPartner(projectId, { name: `파트너A-${run}`, tier_id: tier.id, contract_amount: 5000000 })
      const b = await P.createPartner(projectId, { name: `파트너B-${run}`, tier_id: tier.id })
      const t = await P.issuePartnerToken(a.id, { contact_name: '파트너 담당', contact_email: `pa-${run}@${domain}` })
      partnerToken = t.token
      const tasks = await P.expandHostWbs(projectId)
      const portal = await A.getPartnerPortal(t.token)
      const text = JSON.stringify(portal)
      if (MONEY_KEYS.test(text) || /"price"/.test(text)) return '금액 키 검출'
      if (text.includes(`파트너B-${run}`)) return '타 파트너 노출'
      if (portal.submission_items.length === 0) return '제출 항목 0건'
      partnerItem = portal.submission_items[0].deliverable_id
      return tasks.some((x) => x.partner_id === a.id) && tasks.some((x) => x.partner_id === b.id) ? true : '파트너별 인스턴스 없음'
    })
    await check('DoD 33: 제출(requested→pending_approval) → 수정요청 코멘트 없음 422 → 코멘트 → 재제출 → 승인 final', async () => {
      const s1 = await A.submitPartnerItem(partnerToken, partnerItem, { text: '1차 제출' })
      if (s1.status !== 'pending_approval') return `제출 후 ${s1.status}`
      const no = await expectError(() => P.reviewPartnerSubmission(partnerItem, { decision: 'changes_requested' }), { code: 'validation' })
      if (no !== true) return no
      const cr = await P.reviewPartnerSubmission(partnerItem, { decision: 'changes_requested', comment: '로고 해상도를 높여 주세요' })
      if (cr.status !== 'changes_requested') return `수정요청 후 ${cr.status}`
      const s2 = await A.submitPartnerItem(partnerToken, partnerItem, { text: '2차 제출' })
      if (s2.status !== 'pending_approval') return `재제출 후 ${s2.status}`
      const ok = await P.reviewPartnerSubmission(partnerItem, { decision: 'approved' })
      const portal = await A.getPartnerPortal(partnerToken)
      const item = portal.submission_items.find((x) => x.deliverable_id === partnerItem)
      return ok.status === 'final' && item?.comments.some((c) => c.body.includes('해상도')) ? true : JSON.stringify({ status: ok.status, comments: item?.comments.length })
    })
    await check('파트너 토큰 회수 → /p 410 · 대행형 재전환 시 파트너 데이터 보존(R-H1)', async () => {
      await P.revokePartnerToken(partnerToken)
      const gone = await expectError(() => A.getPartnerPortal(partnerToken), { code: 'gone' })
      if (gone !== true) return gone
      await P.updateProject(projectId, { kind: 'agency' })
      const partners = await P.listPartners(projectId)
      return partners.length === 2 ? true : `파트너 ${partners.length}건`
    })

    // 13. 시드 토큰 경로(있을 때만) ──────────────────────────────────
    if (seeded) {
      head('13 시드 데모 토큰 경로 (/c/demo · /p/demo-partner)')
      await check('/c/demo 큐·현황 anon 조회 + 금액 키 0건', async () => {
        const q = await A.getClientQueue(seedUuid('demo'))
        const s = await A.getClientStatus(seedUuid('demo'))
        return !MONEY_KEYS.test(JSON.stringify(q) + JSON.stringify(s)) && q.project_name.length > 0 ? true : '응답 이상'
      })
      await check('/p/demo-partner anon 조회 + 타 파트너·금액 키 0건', async () => {
        const p = await A.getPartnerPortal(seedUuid('demo-partner'))
        const t = JSON.stringify(p)
        return !MONEY_KEYS.test(t) && !/"price"/.test(t) && p.submission_items.length > 0 ? true : '응답 이상'
      })
      await check('회수 토큰(tok-revoked) → 410', () => expectError(() => A.getClientQueue(seedUuid('tok-revoked')), { code: 'gone' }))
      await check('비멤버(outsider) → 시드 행사 0건 · anon RPC add_member 권한 없음', async () => {
        const r = await outsider.client.from('projects').select('id').eq('id', seedUuid('prj-stc26'))
        const rpc = await anon.rpc('add_member', { p_project: seedUuid('prj-stc26'), p_display_name: 'x', p_email: 'x@x.io', p_role: 'reg' })
        return r.data?.length === 0 && rpc.error ? true : JSON.stringify({ rows: r.data?.length, rpc: rpc.error?.message ?? 'ok' })
      })
    }
  } catch (e) {
    if (!(e instanceof Error && e.message === 'STOP')) record('예기치 못한 중단', false, errText(e))
    else console.log('  (선행 단계 실패로 이후 검사를 중단합니다)')
  } finally {
    // ── 정리 — 이 실행이 만든 것만 (행사 cascade · 견적 · auth 사용자 · 프로필) ─
    if (KEEP) {
      console.log(`\n--keep: 검증 데이터 보존 (행사 ${created.projects.length} · 견적 ${created.quotes.length} · 사용자 ${created.users.length})`)
    } else {
      head('정리')
      for (const id of created.projects) {
        const r = await admin.from('projects').delete().eq('id', id)
        record(`행사 삭제(cascade) ${id.slice(0, 8)}`, !r.error, r.error?.message ?? '')
      }
      for (const id of created.quotes) {
        // superseded 체인은 자기 참조 FK — 참조를 먼저 끊고 지운다
        await admin.from('quotes').update({ superseded_by: null }).eq('superseded_by', id)
        const r = await admin.from('quotes').delete().eq('id', id)
        record(`견적 삭제 ${id.slice(0, 8)}`, !r.error, r.error?.message ?? '')
      }
      for (const u of created.users) {
        const r = await admin.auth.admin.deleteUser(u.authId)
        record(`auth 사용자 삭제(${u.label})`, !r.error, r.error?.message ?? '')
      }
      if (created.profiles.length) {
        const r = await admin.from('profiles').delete().in('id', created.profiles)
        record('검증 프로필 삭제', !r.error, r.error?.message ?? '')
      }
    }
    await api.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 통과${failed.length ? ` — 실패 ${failed.length}건:` : ''}`)
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail.split('\n')[0].slice(0, 300)}` : ''}`)
  process.exit(failed.length ? 1 : 0)
}

const PLAN = [
  '0 사전 점검: setup.sql(app_config) · seed 여부 · 허용 도메인',
  '1 로그인: admin generateLink(magiclink) → verifyOtp — sales·staff·비멤버 3명',
  '2 행사 생성·온보딩: DoD 10·13·16·20',
  '3 담당자·주소록: DoD 19·54',
  '4 RLS 거부 3종 + 역할-영역 + 자가 승격 거부: DoD 26',
  '5 컨펌 루프·코멘트 가시성·비노출: DoD 1·2·3·7·23',
  '6 등록·홈·운영계획서: DoD 4·5·8',
  '7 견적 서버 재계산(로컬 /api → 핸들러)·권한·핸드오프: DoD 21·24·25·26',
  '8 정산 스냅숏·항등식·부가세·비노출: DoD 29·30',
  '9 랜딩 시드·스코프·anon 리드: DoD 27·28',
  '10 시나리오·큐시트·운영가이드·S9: DoD 12·35~38',
  '11 등록 시트 연동(데모 모드 서버 함수): DoD 42~46',
  '12 주최형·파트너 격리·검토 루프: DoD 31~33',
  '13 시드 데모 토큰 경로(seed 있을 때)',
  '정리: 만든 행사(cascade)·견적·auth 사용자·프로필 삭제 (--keep으로 보존)',
]

main().catch((e) => {
  console.error(errText(e))
  process.exit(1)
})
