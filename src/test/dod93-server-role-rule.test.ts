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
