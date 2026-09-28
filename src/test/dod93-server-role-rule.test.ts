// DoD 93 (실사용 결함 묶음 2 · 2026-09-27) — 서버 함수(api/)가 SQL 정본(app.member_role)과 같은 역할 규칙을 따른다.
// 실사용: 관리자(전역 admin · 그 행사 멤버 아님)가 등록 보드 '시트 확인'에서 "프로젝트 멤버가 아닙니다."를 받았다 —
// Phase 6.5(admin = 모든 행사 pm)·6.6(한 사람 여러 역할)이 SQL·앱에는 들어갔지만 project_members를 직접 읽는 서버 함수 3곳
// (sheets · Drive · 알림)은 옛 판정이었다(다중 역할은 maybeSingle → 행 2개면 500).
//   ① Drive: admin 비멤버 → ensure-tree·scan 200 · adopt-folder pm 게이트 통과(링크 검사 400) · staff 비멤버 403 그대로
//   ② sheets: admin 비멤버 → 판정 통과(자격증명 없음 = 데모 probe) · staff 비멤버 403 · 여러 역할(행 2개) 통과 · 프로필 없음 403
//   ③ Supabase 저장소 memberRole: 행 여러 개 → 대표 역할(Drive·알림 둘 다 — maybeSingle 0) · 알림 authProfile = id + app_role
import { describe, expect, it, vi } from 'vitest'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { createFakeDrive } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

// ── ③용 가짜 supabase-js — 표마다 행 목록을 돌려주는 thenable 빌더(select·eq·limit·order 체인 + maybeSingle) ──
const fakeDb = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = {}
  function builder(table: string) {
    const rows = () => tables[table] ?? []
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      limit: () => b,
      order: () => b,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok, bad),
    }
    return b
  }
  const client = {
    from: builder,
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1', email: 'a@example.com' } }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
  }
  return { tables, client }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb.client }))

const BASE = 'https://app.example.com'
const PRJ = '11111111-1111-4111-8111-111111111111'

function driveSetup() {
  const drive = createFakeDrive({ accountEmail: 'owner@company.example' })
  const db = createFakeDriveStore()
  const env: DriveEnv = {
    DRIVE_ROOT_FOLDER_ID: drive.rootId,
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    SUPABASE_SECRET_KEY: 'test-signing-secret-not-a-real-key',
  }
  db.refreshToken = 'refresh-token-1'
  db.addUser({ jwt: 'jwt-admin', authUserId: 'auth-admin', email: 'admin@example.com', profileId: 'p-admin', appRole: 'admin' })
  db.addUser({ jwt: 'jwt-out', authUserId: 'auth-out', email: 'out@example.com', profileId: 'p-out', appRole: 'sales' })
  db.addUser({ jwt: 'jwt-pm', authUserId: 'auth-pm', email: 'pm@example.com', profileId: 'p-pm', appRole: 'sales' })
  db.addProject({ id: PRJ, code: 'EVT-1', name: '가상 컨퍼런스', organizer: '가상고객', event_date: '2026-10-20', status: 'active', drive_root_folder_id: null })
  db.addMember('p-pm', PRJ, 'pm') // admin·out은 멤버가 아니다
  const deps = { store: db.store, fetchImpl: drive.fetch, now: () => Date.parse('2026-09-27T10:00:00Z'), sleep: async () => undefined }
  const post = (body: Record<string, unknown>, jwt?: string) =>
    handleDriveRequest(
      new Request(`${BASE}/api/drive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify(body),
      }),
      env,
      deps,
    )
  return { db, post }
}

describe('DoD 93 ① Drive 서버 — 전역 admin = pm(멤버 아니어도)', () => {
  it('admin 비멤버: ensure-tree 200 · scan 200 · adopt-folder는 pm 게이트를 지나 링크 검사(400) · staff 비멤버는 403 그대로', async () => {
    clearTokenCache()
    const s = driveSetup()
    expect((await s.post({ action: 'ensure-tree', project_id: PRJ }, 'jwt-out')).status).toBe(403)
    expect((await s.post({ action: 'ensure-tree', project_id: PRJ }, 'jwt-admin')).status).toBe(200)
    expect((await s.post({ action: 'scan', project_id: PRJ }, 'jwt-admin')).status).toBe(200)
    const adopt = await s.post({ action: 'adopt-folder', project_id: PRJ, url: 'not-a-link' }, 'jwt-admin')
    expect(adopt.status).toBe(400) // 403이 아니다 — pm 게이트를 지나 폴더 링크 검사에서 멈춘다
    expect((await s.post({ action: 'adopt-folder', project_id: PRJ, url: 'not-a-link' }, 'jwt-out')).status).toBe(403)
    expect(s.db.logs.some((l) => l.action === 'drive.tree_created' || l.action === 'drive.tree_placed' || l.action.startsWith('drive.'))).toBe(true)
  })
})

describe('DoD 93 ② sheets 서버 — 프로필 권한 + 여러 역할', () => {
  // Phase 6.14 — 시험 명단(demo)은 SHEETS_DEMO=1을 명시한 환경에서만
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SHEETS_DEMO: '1' }
  const body = { op: 'probe' as const, project_id: PRJ, url: 'https://docs.google.com/spreadsheets/d/1AbC/edit' }

  function clients(profile: { id: string; app_role: 'admin' | 'sales' | 'staff' } | null, memberRows: { role: string }[]) {
    const tables: Record<string, Record<string, unknown>[]> = {
      profiles: profile ? [profile] : [],
      project_members: memberRows,
      projects: [{ name: '가상 컨퍼런스' }],
      sheet_connections: [],
      sheet_source_rows: [],
    }
    function builder(table: string) {
      const rows = () => tables[table] ?? []
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        order: () => b,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok, bad),
      }
      return b
    }
    return {
      userClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } }, error: null }) } }) as never,
      adminClient: () => ({ from: builder }) as never,
    }
  }

  it('admin(멤버 행 0) → 판정 통과 · staff(멤버 행 0) → 403 · staff 여러 역할(행 2개) → 통과 · 프로필 없음 → 403', async () => {
    const { handleSheets, SHEETS_NO_CREDENTIALS_MESSAGE } = await import('../../api/_lib/sheets')
    // Phase 6.14 — 자격증명 없음 + SHEETS_DEMO 없음 = 503(가짜 명단 0) · SHEETS_DEMO=1이어야 시험 명단
    const { SHEETS_DEMO: _demo, ...noDemo } = env
    await expect(handleSheets(body, 'tok', noDemo, fetch, clients({ id: 'p-admin', app_role: 'admin' }, []))).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
      message: SHEETS_NO_CREDENTIALS_MESSAGE,
    })
    const admin = await handleSheets(body, 'tok', env, fetch, clients({ id: 'p-admin', app_role: 'admin' }, []))
    expect(admin).toMatchObject({ demo: true })
    await expect(handleSheets(body, 'tok', env, fetch, clients({ id: 'p-out', app_role: 'staff' }, []))).rejects.toMatchObject({
      status: 403,
      message: '프로젝트 멤버가 아닙니다.',
    })
    const multi = await handleSheets(body, 'tok', env, fetch, clients({ id: 'p-two', app_role: 'staff' }, [{ role: 'design' }, { role: 'ops' }]))
    expect(multi).toMatchObject({ demo: true })
    await expect(handleSheets(body, 'tok', env, fetch, clients(null, []))).rejects.toMatchObject({ status: 403 })
  })

  // Phase 6.15(2026-09-28 "이것좀 자동으로 해줘") — 서비스 계정 키가 없어도 Drive 저장소에 연결된 계정(OAuth · scope drive)으로 시트를 읽는다
  it('서비스 계정 키 없음 + Drive 연결 있음 → OAuth 토큰으로 실제 시트를 읽고 읽는 계정 = 연결 계정 · 연결 없음 → 503', async () => {
    const { handleSheets } = await import('../../api/_lib/sheets')
    const { clearTokenCache } = await import('../../api/_lib/drive/auth')
    clearTokenCache()
    const oauthEnv = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      DRIVE_ROOT_FOLDER_ID: 'root-1',
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    }
    const calls: string[] = []
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'oa-token', expires_in: 3600 })
      if (/spreadsheets\/1AbC\?fields/.test(url)) return json({ properties: { title: '가상 명단 시트' }, sheets: [{ properties: { title: '참가자' } }] })
      if (/drive\/v3\/files\/1AbC/.test(url)) return json({ modifiedTime: '2026-09-28T01:00:00Z' })
      if (/\/values\//.test(url)) return json({ values: [['성명', '이메일'], ['가상 참가자', 'guest@example.com']] })
      return new Response('nf', { status: 404 })
    }) as typeof fetch
    const store = {
      readRefreshToken: async () => 'refresh-phase-6-15',
      recordConnectionError: async () => undefined,
      connectionInfo: async () => ({ account_email: 'drive-owner@example.com' }),
    }
    const res = (await handleSheets(body, 'tok', oauthEnv, fetchImpl, { ...clients({ id: 'p-admin', app_role: 'admin' }, []), driveStore: store as never })) as {
      probe: { title: string; service_account: string; tabs: { name: string; selectable: boolean }[] }
      demo?: boolean
    }
    expect(res.demo).toBeUndefined()
    expect(res.probe.title).toBe('가상 명단 시트')
    expect(res.probe.service_account).toBe('drive-owner@example.com')
    expect(res.probe.tabs.map((t) => t.name)).toEqual(['참가자'])
    expect(calls.some((u) => u.startsWith('https://oauth2.googleapis.com/token'))).toBe(true)
    // 연결(갱신 토큰)이 없으면 OAuth 경로는 비고, SHEETS_DEMO도 없으니 503
    const none = { ...store, readRefreshToken: async () => null }
    await expect(
      handleSheets(body, 'tok', oauthEnv, fetchImpl, { ...clients({ id: 'p-admin', app_role: 'admin' }, []), driveStore: none as never }),
    ).rejects.toMatchObject({ status: 503, code: 'unavailable' })
  })

  // Phase 6.15.1(2026-09-28 운영 실측) — 시트를 공유한 뒤에도 403이 이어졌는데 문구가 '뷰어로 초대했는지'뿐이라 사유가 가려졌다.
  // 구글 403의 사유를 구분한다: Sheets API 꺼짐 → 503 + 켜는 링크 · 스코프 부족 → 503 다시 연결 · 그 밖 → 403 + 구글 문구
  it('구글 403 사유 구분 — SERVICE_DISABLED = 503 + activationUrl · 스코프 부족 = 503 다시 연결 · 그 밖 = 403 공유 안내 + 구글 문구', async () => {
    const { handleSheets } = await import('../../api/_lib/sheets')
    const { clearTokenCache } = await import('../../api/_lib/drive/auth')
    clearTokenCache()
    const oauthEnv = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      DRIVE_ROOT_FOLDER_ID: 'root-1',
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    }
    const store = {
      readRefreshToken: async () => 'refresh-phase-6-15-1',
      recordConnectionError: async () => undefined,
      connectionInfo: async () => ({ account_email: 'drive-owner@example.com' }),
    }
    const deps = () => ({ ...clients({ id: 'p-admin', app_role: 'admin' }, []), driveStore: store as never })
    const withSheetsError = (status: number, error: unknown) =>
      (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'oa-token', expires_in: 3600 }), { status: 200 })
        if (/spreadsheets\/1AbC\?fields/.test(url)) return new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } })
        return new Response('nf', { status: 404 })
      }) as typeof fetch
    // ① Sheets API가 OAuth 클라이언트의 GCP 프로젝트에서 꺼짐 — 공유와 무관 · 켜는 링크를 그대로 전한다
    await expect(
      handleSheets(
        body,
        'tok',
        oauthEnv,
        withSheetsError(403, {
          code: 403,
          message: 'Google Sheets API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123 then retry.',
          status: 'PERMISSION_DENIED',
          details: [{ reason: 'SERVICE_DISABLED', metadata: { activationUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123' } }],
        }),
        deps(),
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
      message: expect.stringMatching(/Google Sheets API가 꺼져 있어.*https:\/\/console\.developers\.google\.com\/apis\/api\/sheets\.googleapis\.com\/overview\?project=123/),
    })
    // ② 토큰 스코프 부족 — 다시 연결 안내
    await expect(
      handleSheets(body, 'tok', oauthEnv, withSheetsError(403, { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] }), deps()),
    ).rejects.toMatchObject({ status: 503, code: 'unavailable', message: expect.stringContaining('다시 연결') })
    // ③ 그 밖(진짜 공유 안 됨) — 기존 403 + 구글 문구 꼬리
    await expect(
      handleSheets(body, 'tok', oauthEnv, withSheetsError(403, { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED' }), deps()),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden', message: expect.stringMatching(/뷰어로 초대했는지 확인하세요\. \(구글: The caller does not have permission\)/) })
    // ④ 본문 없는 404 — 기존 문구 그대로(꼬리 없음)
    await expect(handleSheets(body, 'tok', oauthEnv, withSheetsError(404, undefined), deps())).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: '시트에 접근할 수 없습니다 — 서비스 계정을 뷰어로 초대했는지 확인하세요.',
    })
  })
})

describe('DoD 93 ③ Supabase 저장소 — 여러 역할 행 → 대표 역할 · 알림 authProfile = id + app_role', () => {
  it('Drive·알림 저장소 memberRole이 행 2개(ops·pm)에서 pm을 돌려주고(maybeSingle 0), 멤버 아님은 null', async () => {
    const { supabaseDriveStore } = await import('../../api/_lib/drive/store')
    const { createSupabaseNotifyStore } = await import('../../api/_lib/notify/store')
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }
    fakeDb.tables.project_members = [{ role: 'ops' }, { role: 'pm' }]
    fakeDb.tables.profiles = [{ id: 'p-admin', app_role: 'admin' }]
    const drive = supabaseDriveStore(env)
    expect(await drive.memberRole('p-two', PRJ)).toBe('pm')
    const notify = createSupabaseNotifyStore(env)
    expect(await notify.memberRole('p-two', PRJ)).toBe('pm')
    expect(await notify.authProfile('jwt')).toEqual({ id: 'p-admin', app_role: 'admin' })
    fakeDb.tables.project_members = [{ role: 'design' }, { role: 'reg' }]
    expect(await drive.memberRole('p-two', PRJ)).toBe('design')
    fakeDb.tables.project_members = []
    expect(await drive.memberRole('p-none', PRJ)).toBeNull()
    expect(await notify.memberRole('p-none', PRJ)).toBeNull()
  })
})
