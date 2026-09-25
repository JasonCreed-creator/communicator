/** @vitest-environment jsdom */
// DoD-64 (Phase 4.3 · 설계서 §12.1, 사용자 결정 2026-09-25 "로그인 기능은 나중에(Okta) — 지금은 아무나 들어갈 수 있는
// 게이트로"): 시험용 입구. 암호는 없다(위험 고지 후 사용자 선택) — 대신 스스로 닫히는 장치를 증명한다.
//   ① 여닫기는 서버 env만: AUTH_GATE=open + AUTH_GATE_UNTIL(지금부터 14일 이내)일 때만 열린다 — 없거나 틀리면 닫힘(fail-safe)
//   ② 목록은 주소록 사람의 이름·직함·권한뿐 — 이메일·전화·auth 연결 여부가 응답에 없다
//   ③ 입장은 주소록 id로만(이메일을 받지 않는다) · 로그인한 적 없으면 auth 사용자를 만든 뒤 1회용 token_hash만 돌려준다(링크·이메일 없음)
//   ④ 닫힘 403 · 기한 지남 410 · 형식 400 · 주소록에 없음 404 · 자격증명 없음 503
//   ⑤ 화면: 열려 있으면 경고 + 닫히는 시각(KST) + 인물 카드 → 누르면 그 사람으로 입장 · 닫혀 있으면 입구가 없다
//   ⑥ 사이드바 로그아웃은 실서버 모드에서만(다른 사람으로 바꿔 들어가는 자리) — mock에는 없다
//   ⑦ 스위치는 서버 전용 — 앱 소스(src)에 AUTH_GATE가 없고, env 예시에 VITE_ 판이 없다
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GATE_MAX_DAYS, gateState, handleGateRequest, type GateDeps, type GateEnv } from '../../api/_lib/gate'
import { SidebarAccount } from '../components/layout/InternalLayout'
import { AuthProvider } from '../context/AuthContext'
import LoginPage from '../pages/LoginPage'
import type { AuthAdapter, AuthSessionUser, GateStatus } from '../providers/auth'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const NOW = new Date('2026-09-25T06:00:00.000Z')
/** 3일 뒤 — 한국 시간 9월 28일 18:00 */
const UNTIL = '2026-09-28T09:00:00.000Z'
const OPEN_ENV: GateEnv = {
  AUTH_GATE: 'open',
  AUTH_GATE_UNTIL: UNTIL,
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
}

const ID_ADMIN = '11111111-1111-4111-8111-111111111111'
const ID_SALES = '22222222-2222-4222-8222-222222222222'
const ID_STAFF = '33333333-3333-4333-8333-333333333333'
const ID_UNKNOWN = '44444444-4444-4444-8444-444444444444'

interface Row {
  id: string
  display_name: string
  title: string | null
  app_role: string
  email: string
  phone: string | null
  auth_user_id: string | null
}

/** 가상 주소록 — 실명·실제 연락처 금지(공개 레포). 순서를 일부러 섞어 정렬을 본다 */
const PEOPLE: Row[] = [
  { id: ID_STAFF, display_name: '가상 디자이너', title: '디자이너 · 가상팀', app_role: 'staff', email: 'designer@example.test', phone: '010-0000-0003', auth_user_id: null },
  { id: ID_SALES, display_name: '가상 매니저', title: '매니저 · 가상 PM', app_role: 'sales', email: 'pm@example.test', phone: null, auth_user_id: 'auth-sales' },
  { id: ID_ADMIN, display_name: '가상 팀장', title: 'Team Leader', app_role: 'admin', email: 'lead@example.test', phone: '010-0000-0001', auth_user_id: null },
]

function fakeDeps(opts: { createError?: string; linkError?: string; listError?: string } = {}) {
  const calls = { createUser: [] as Array<Record<string, unknown>>, generateLink: [] as Array<Record<string, unknown>> }
  const client = {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`unexpected table ${table}`)
      let rows = PEOPLE
      const chain = {
        select: () => chain,
        eq: (col: keyof Row, val: string) => {
          rows = rows.filter((r) => r[col] === val)
          return chain
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        // 목록 조회는 select 결과를 그대로 await한다 — 실제 행(이메일·전화 포함)을 돌려줘 서버가 걸러 내는지 본다
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(opts.listError ? { data: null, error: { message: opts.listError } } : { data: rows, error: null }).then(resolve, reject),
      }
      return chain
    },
    auth: {
      admin: {
        createUser: async (a: Record<string, unknown>) => {
          calls.createUser.push(a)
          return opts.createError ? { data: { user: null }, error: { message: opts.createError } } : { data: { user: { id: 'auth-new' } }, error: null }
        },
        generateLink: async (a: Record<string, unknown>) => {
          calls.generateLink.push(a)
          return opts.linkError
            ? { data: { properties: null, user: null }, error: { message: opts.linkError } }
            : {
                data: { properties: { hashed_token: 'hash-abc', action_link: 'https://x.supabase.co/auth/v1/verify?token=secret' }, user: { id: 'u' } },
                error: null,
              }
        },
      },
    },
  }
  const deps: GateDeps = { admin: () => client as never }
  return { deps, calls }
}

const get = (env: GateEnv, deps?: GateDeps) => handleGateRequest(new Request('http://x/api/gate'), env, deps, NOW)
const post = (env: GateEnv, body: unknown, deps?: GateDeps) =>
  handleGateRequest(
    new Request('http://x/api/gate', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env,
    deps,
    NOW,
  )

describe('① 여닫기 — 서버 env만, 틀리면 닫힘', () => {
  it('AUTH_GATE가 open이 아니면 off', () => {
    expect(gateState({}, NOW)).toEqual({ open: false, reason: 'off' })
    expect(gateState({ AUTH_GATE: 'closed', AUTH_GATE_UNTIL: UNTIL }, NOW)).toEqual({ open: false, reason: 'off' })
  })

  it('기한이 없거나 읽을 수 없으면 misconfigured', () => {
    expect(gateState({ AUTH_GATE: 'open' }, NOW)).toEqual({ open: false, reason: 'misconfigured' })
    expect(gateState({ AUTH_GATE: 'open', AUTH_GATE_UNTIL: '내일' }, NOW)).toEqual({ open: false, reason: 'misconfigured' })
  })

  it('기한이 지났으면 expired', () => {
    expect(gateState({ AUTH_GATE: 'open', AUTH_GATE_UNTIL: '2026-09-25T05:59:59Z' }, NOW)).toEqual({ open: false, reason: 'expired' })
  })

  it(`기한 상한 ${GATE_MAX_DAYS}일 — 경계는 열리고 1ms만 넘어도 misconfigured(영구 개방 방지)`, () => {
    const edge = new Date(NOW.getTime() + GATE_MAX_DAYS * 86_400_000).toISOString()
    const over = new Date(NOW.getTime() + GATE_MAX_DAYS * 86_400_000 + 1).toISOString()
    expect(gateState({ AUTH_GATE: 'open', AUTH_GATE_UNTIL: edge }, NOW)).toEqual({ open: true, until: edge })
    expect(gateState({ AUTH_GATE: 'open', AUTH_GATE_UNTIL: over }, NOW)).toEqual({ open: false, reason: 'misconfigured' })
  })

  it('한국 시간 표기(+09:00)도 받아 ISO로 돌려준다', () => {
    expect(gateState({ AUTH_GATE: 'Open', AUTH_GATE_UNTIL: '2026-09-28T18:00:00+09:00' }, NOW)).toEqual({ open: true, until: UNTIL })
  })
})

describe('② 목록 — 이름·직함·권한만', () => {
  it('닫혀 있으면 사유만 돌려주고 주소록을 읽지 않는다', async () => {
    const r = await get({}, { admin: () => { throw new Error('읽으면 안 된다') } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ open: false, reason: 'off' })
  })

  it('열려 있으면 admin → sales → staff 순, 이메일·전화·auth 연결이 없다', async () => {
    const { deps } = fakeDeps()
    const r = await get(OPEN_ENV, deps)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json()
    expect(body.open).toBe(true)
    expect(body.until).toBe(UNTIL)
    expect(body.people.map((p: { id: string }) => p.id)).toEqual([ID_ADMIN, ID_SALES, ID_STAFF])
    for (const p of body.people) expect(Object.keys(p).sort()).toEqual(['app_role', 'display_name', 'id', 'title'])
    const raw = JSON.stringify(body)
    expect(raw).not.toMatch(/@example\.test|010-0000|auth_user_id|auth-sales/)
  })

  it('자격증명이 없으면 503(사실대로) — 열려 있어도 흉내 내지 않는다', async () => {
    const r = await get({ AUTH_GATE: 'open', AUTH_GATE_UNTIL: UNTIL })
    expect(r.status).toBe(503)
    expect((await r.json()).error.message).toMatch(/SUPABASE_SECRET_KEY/)
  })
})

describe('③④ 입장 — 주소록 id만, 1회용 token_hash만', () => {
  it('로그인한 적 없는 사람 → auth 사용자 생성(email_confirm) → magiclink 토큰 → 응답은 token_hash 하나', async () => {
    const { deps, calls } = fakeDeps()
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const r = await post(OPEN_ENV, { profile_id: ID_ADMIN }, deps)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ token_hash: 'hash-abc' })
    expect(calls.createUser).toEqual([{ email: 'lead@example.test', email_confirm: true }])
    expect(calls.generateLink).toEqual([{ type: 'magiclink', email: 'lead@example.test' }])
    // 감사 흔적은 id·권한만 — 이메일·이름을 서버 로그에 남기지 않는다
    expect(log).toHaveBeenCalledWith(`[gate] enter profile=${ID_ADMIN} role=admin`)
  })

  it('이미 연결된 사람은 auth 사용자를 다시 만들지 않는다', async () => {
    const { deps, calls } = fakeDeps()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    expect((await post(OPEN_ENV, { profile_id: ID_SALES }, deps)).status).toBe(200)
    expect(calls.createUser).toHaveLength(0)
  })

  it('"이미 가입됨"은 넘어가고, 그 밖의 생성 실패·토큰 실패는 503', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    expect((await post(OPEN_ENV, { profile_id: ID_ADMIN }, fakeDeps({ createError: 'A user with this email address has already been registered' }).deps)).status).toBe(200)
    expect((await post(OPEN_ENV, { profile_id: ID_ADMIN }, fakeDeps({ createError: 'Database error' }).deps)).status).toBe(503)
    expect((await post(OPEN_ENV, { profile_id: ID_SALES }, fakeDeps({ linkError: 'boom' }).deps)).status).toBe(503)
  })

  it('닫힘 403 · 기한 지남 410 — 토큰을 만들지 않는다', async () => {
    const { deps, calls } = fakeDeps()
    expect((await post({ ...OPEN_ENV, AUTH_GATE: '' }, { profile_id: ID_ADMIN }, deps)).status).toBe(403)
    expect((await post({ ...OPEN_ENV, AUTH_GATE_UNTIL: '2026-09-24T00:00:00Z' }, { profile_id: ID_ADMIN }, deps)).status).toBe(410)
    expect(calls.generateLink).toHaveLength(0)
  })

  it('형식 400(JSON 아님·id 아님·이메일을 보내도 안 받는다) · 주소록에 없음 404', async () => {
    const { deps, calls } = fakeDeps()
    expect((await post(OPEN_ENV, '{not json', deps)).status).toBe(400)
    expect((await post(OPEN_ENV, { profile_id: 'lead@example.test' }, deps)).status).toBe(400)
    expect((await post(OPEN_ENV, { email: 'lead@example.test' }, deps)).status).toBe(400)
    expect((await post(OPEN_ENV, { profile_id: ID_UNKNOWN }, deps)).status).toBe(404)
    expect(calls.createUser).toHaveLength(0)
    expect(calls.generateLink).toHaveLength(0)
  })

  it('GET·POST 밖은 405', async () => {
    const r = await handleGateRequest(new Request('http://x/api/gate', { method: 'PUT' }), OPEN_ENV, fakeDeps().deps, NOW)
    expect(r.status).toBe(405)
  })
})

function fakeAdapter(status: GateStatus | null, enter = vi.fn(async (_id: string) => null as string | null)) {
  let listener: ((u: AuthSessionUser | null) => void) | null = null
  const adapter: AuthAdapter = {
    mode: 'supabase',
    allowedDomains: [],
    getUser: async () => null,
    onChange: (cb) => {
      listener = cb
      return () => undefined
    },
    signInWithEmail: async () => null,
    signOut: vi.fn(async () => undefined),
    getAccessToken: async () => null,
    gate: status ? { status: async () => status, enter } : null,
  }
  return { adapter, enter, signIn: (u: AuthSessionUser) => act(() => listener?.(u)) }
}

function renderLogin(adapter: AuthAdapter) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider adapter={adapter}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={<p>홈 화면</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const OPEN_STATUS: GateStatus = {
  open: true,
  until: UNTIL,
  people: [
    { id: ID_ADMIN, display_name: '가상 팀장', title: 'Team Leader', app_role: 'admin' },
    { id: ID_STAFF, display_name: '가상 디자이너', title: null, app_role: 'staff' },
  ],
}

describe('⑤ 로그인 화면의 시험용 입구', () => {
  it('열려 있으면 경고·닫히는 시각(KST)·인물 카드 → 누르면 그 사람으로 들어가고 원래 목적지로 간다', async () => {
    const { adapter, enter, signIn } = fakeAdapter(OPEN_STATUS)
    renderLogin(adapter)
    expect(await screen.findByRole('heading', { name: '시험용 입구' })).toBeTruthy()
    expect(screen.getByText(/누구나 들어올 수 있는 임시 입구/)).toBeTruthy()
    expect(screen.getByText(/9월 28일/).textContent).toMatch(/18:00/)
    // 직함이 없으면 권한 이름을 대신 보인다
    const staff = screen.getByRole('button', { name: '가상 디자이너(으)로 들어가기' })
    expect(staff.textContent).toMatch(/일반/)
    fireEvent.click(screen.getByRole('button', { name: '가상 팀장(으)로 들어가기' }))
    await waitFor(() => expect(enter).toHaveBeenCalledWith(ID_ADMIN))
    signIn({ id: 'auth-admin', email: null })
    expect(await screen.findByText('홈 화면')).toBeTruthy()
  })

  it('입장 실패 문구를 보이고 다시 누를 수 있다', async () => {
    const { adapter } = fakeAdapter(OPEN_STATUS, vi.fn(async () => '시험용 입구가 닫혀 있습니다.'))
    renderLogin(adapter)
    fireEvent.click(await screen.findByRole('button', { name: '가상 팀장(으)로 들어가기' }))
    expect((await screen.findByRole('alert')).textContent).toBe('시험용 입구가 닫혀 있습니다.')
    expect((screen.getByRole('button', { name: '가상 팀장(으)로 들어가기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('꺼져 있으면 입구가 없고 이메일 로그인은 그대로 · 기한이 지났으면 그 사실만 알린다', async () => {
    const off = fakeAdapter({ open: false, reason: 'off' })
    renderLogin(off.adapter)
    expect(await screen.findByRole('button', { name: '로그인 링크 받기' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('시험용 입구 확인 중…')).toBeNull())
    expect(screen.queryByRole('heading', { name: '시험용 입구' })).toBeNull()
    cleanup()
    renderLogin(fakeAdapter({ open: false, reason: 'expired' }).adapter)
    expect(await screen.findByText('시험용 입구는 기한이 지나 닫혔습니다.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '시험용 입구' })).toBeNull()
  })

  it('입구 API가 없는 어댑터(gate=null)는 기존 로그인 화면 그대로', async () => {
    renderLogin(fakeAdapter(null).adapter)
    expect(await screen.findByRole('button', { name: '로그인 링크 받기' })).toBeTruthy()
    expect(screen.queryByText(/시험용 입구/)).toBeNull()
  })
})

describe('⑥ 사이드바 로그아웃 — 실서버 모드에서만', () => {
  it('mock(AuthProvider 밖)에는 없다', () => {
    render(<SidebarAccount name="가상 팀장" />)
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
  })

  it('supabase에서는 이름과 로그아웃 — 누르면 signOut', async () => {
    const { adapter } = fakeAdapter(null)
    render(
      <AuthProvider adapter={adapter}>
        <SidebarAccount name="가상 팀장" />
      </AuthProvider>,
    )
    expect(screen.getByText('가상 팀장')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(adapter.signOut).toHaveBeenCalledTimes(1))
  })
})

describe('⑦ 스위치는 서버 전용', () => {
  const ROOT = resolve(__dirname, '../..')

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name === 'test') continue
        out.push(...sourceFiles(p))
      } else if (/\.(ts|tsx)$/.test(name)) out.push(p)
    }
    return out
  }

  it('앱 소스(src — 테스트 제외)가 입구 스위치를 읽지 않는다 — 번들이 입구를 여닫지 못한다', () => {
    // 주석의 변수 이름은 괜찮다 — 막는 것은 클라이언트가 env로 여닫는 경로(VITE_ 판·import.meta.env 읽기)
    const switchRead = /VITE_AUTH_GATE|import\.meta\.env(\?\.|\.|\[['"])AUTH_GATE/
    const offenders = sourceFiles(resolve(ROOT, 'src')).filter((f) => switchRead.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('env 예시: AUTH_GATE·AUTH_GATE_UNTIL은 서버 변수로만 — VITE_ 판이 없다', () => {
    for (const file of ['.env.production.example', '.env.example']) {
      const text = readFileSync(resolve(ROOT, file), 'utf8')
      expect(text).toMatch(/^AUTH_GATE=/m)
      expect(text).toMatch(/^AUTH_GATE_UNTIL=/m)
      expect(text).not.toMatch(/VITE_AUTH_GATE/)
    }
  })
})
