// DoD 92 (Phase 6.7 · 설계서 v2.18 §22.6) — 온보딩 견적서 첨부 → 견적 가져오기 다리(서버 계약).
// 실사용(2026-09-27) "견적서를 온보딩 시점에서 올렸는데 적용이 안됨": 첨부(projects.quote_attachment · Drive 01_견적)는 기록만 되고
// 견적으로 읽는 길이 없었다. `project-file-url`이 첨부 파일의 서명 스트림 토큰을 돌려주고, 앱이 그 파일을 파서·AI 경로로 넘긴다.
//   ① drive 첨부 → 토큰 + 파일 이름 · 클라이언트가 같은 바이트의 File로 받는다 · 멤버(design)도 읽는다 · 1시간 뒤 410
//   ② link 첨부 → 토큰 없이 kind만 ③ 첨부 없음 → 전부 null ④ 행사가 안 보이는 사람 404 · admin은 멤버가 아니어도 읽는다(RLS)
//   ⑤ id 형식 400 · 로그인 401 ⑥ Drive 미설정이면 503(파일이 있는데도 흉내 내지 않는다) ⑦ 저장 0 · 공유 권한 호출 0
import { beforeEach, describe, expect, it } from 'vitest'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { createDriveClient } from '../lib/drive/driveClient'
import { createFakeDrive } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

const BASE = 'https://app.example.com'
const PRJ = '11111111-1111-4111-8111-111111111111'
const PRJ_OTHER = '22222222-2222-4222-8222-222222222222'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function setup(over: Partial<DriveEnv> = {}) {
  const drive = createFakeDrive({ accountEmail: 'owner@company.example' })
  const db = createFakeDriveStore()
  const env: DriveEnv = {
    DRIVE_ROOT_FOLDER_ID: drive.rootId,
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    SUPABASE_SECRET_KEY: 'test-signing-secret-not-a-real-key',
    ...over,
  }
  db.refreshToken = 'refresh-token-1'
  db.addUser({ jwt: 'jwt-pm', authUserId: 'auth-pm', email: 'pm@example.com', profileId: 'p-pm', appRole: 'sales' })
  db.addUser({ jwt: 'jwt-admin', authUserId: 'auth-admin', email: 'admin@example.com', profileId: 'p-admin', appRole: 'admin' })
  db.addUser({ jwt: 'jwt-design', authUserId: 'auth-design', email: 'design@example.com', profileId: 'p-design', appRole: 'staff' })
  db.addUser({ jwt: 'jwt-out', authUserId: 'auth-out', email: 'out@example.com', profileId: 'p-out', appRole: 'sales' })
  db.addProject({ id: PRJ, code: 'EVT-1', name: '가상 컨퍼런스', organizer: '가상고객', event_date: '2026-10-20', status: 'active', drive_root_folder_id: null })
  db.addProject({ id: PRJ_OTHER, code: 'EVT-2', name: '가상 포럼', organizer: '가상고객', event_date: '2026-11-04', status: 'active', drive_root_folder_id: null })
  db.addMember('p-pm', PRJ, 'pm')
  db.addMember('p-design', PRJ, 'design')
  let t = Date.parse('2026-09-27T10:00:00Z')
  const deps = { store: db.store, fetchImpl: drive.fetch, now: () => t, sleep: async () => undefined }
  const appFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handleDriveRequest(new Request(new URL(String(input), BASE), init), env, deps)) as typeof fetch
  const clientAs = (jwt: string | null) =>
    createDriveClient({ apiBase: '/api', accessToken: async () => jwt, fetchImpl: appFetch, sleep: async () => undefined })
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
  const urlOf = (projectId: string, jwt?: string) => post({ action: 'project-file-url', project_id: projectId }, jwt)
  return { drive, db, env, deps, appFetch, clientAs, post, urlOf, advance: (ms: number) => (t += ms) }
}

function sampleBytes(n = 2048): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (i * 17 + 3) % 251
  return out
}

/** 실제 흐름과 같이 — 온보딩 ①이 `project-file`로 올린 파일을 첨부로 기록한다 */
async function attachUploaded(s: ReturnType<typeof setup>, name = '가상 견적서.xlsx') {
  const data = sampleBytes()
  const up = await s.clientAs('jwt-pm').projectFile(PRJ, name, data.buffer as ArrayBuffer, XLSX)
  s.db.setProjectAttachment(PRJ, { kind: 'drive', file_name: up.file_name, drive_file_id: up.file_id })
  return { data, up }
}

beforeEach(() => clearTokenCache())

describe('DoD 92 ① drive 첨부 → 서명 토큰 → 같은 파일', () => {
  it('pm: 토큰·파일 이름·kind drive · 클라이언트가 File로 받는다(이름·바이트·형식) · 멤버(design)도 읽는다 · 1시간 뒤 410', async () => {
    const s = setup()
    const { data, up } = await attachUploaded(s)
    const r = await s.urlOf(PRJ, 'jwt-pm')
    expect(r.status).toBe(200)
    const body = (await r.json()) as { token: string | null; file_name: string | null; kind: string | null }
    expect(body.kind).toBe('drive')
    expect(body.file_name).toBe('가상 견적서.xlsx')
    expect(typeof body.token).toBe('string')
    expect(body).not.toHaveProperty('drive_file_id') // 파일 id는 토큰 안에만 — 응답으로 흘리지 않는다

    const got = await s.clientAs('jwt-pm').projectAttachmentFile(PRJ)
    expect(got.kind).toBe('drive')
    expect(got.file?.name).toBe('가상 견적서.xlsx')
    expect(got.file?.type).toBe(XLSX)
    expect(new Uint8Array(await got.file!.arrayBuffer())).toEqual(data)

    // 영역 담당도 행사가 보이므로 읽는다(RLS) — 견적 가져오기 화면의 app_role 게이트는 앱 쪽
    const asDesign = await s.clientAs('jwt-design').projectAttachmentFile(PRJ)
    expect(asDesign.file?.name).toBe('가상 견적서.xlsx')

    // 토큰은 내부 서명 URL과 같은 1시간
    const streamUrl = `${BASE}/api/drive?action=stream&t=${encodeURIComponent(body.token!)}`
    expect((await s.appFetch(streamUrl)).status).toBe(200)
    s.advance(61 * 60 * 1000)
    expect((await s.appFetch(streamUrl)).status).toBe(410)
    expect(s.drive.files.get(up.file_id)!.name).toBe('가상 견적서.xlsx') // 파일은 그대로(옮기거나 지우지 않는다)
  })
})

describe('DoD 92 ② link 첨부 · ③ 첨부 없음', () => {
  it('링크 첨부는 토큰 없이 kind link(앱이 내려받아 올리라고 안내) · 첨부 없음은 전부 null', async () => {
    const s = setup()
    s.db.setProjectAttachment(PRJ, { kind: 'link', file_name: null, drive_file_id: null })
    expect(await (await s.urlOf(PRJ, 'jwt-pm')).json()).toEqual({ token: null, file_name: null, kind: 'link' })
    const got = await s.clientAs('jwt-pm').projectAttachmentFile(PRJ)
    expect(got).toEqual({ file: null, file_name: null, kind: 'link' })

    s.db.setProjectAttachment(PRJ, null)
    expect(await (await s.urlOf(PRJ, 'jwt-pm')).json()).toEqual({ token: null, file_name: null, kind: null })
    expect(await s.clientAs('jwt-pm').projectAttachmentFile(PRJ)).toEqual({ file: null, file_name: null, kind: null })

    // drive 모양인데 파일 id가 Drive id가 아니면(자리표시) 토큰 없이 — 흉내 내지 않는다
    s.db.setProjectAttachment(PRJ, { kind: 'drive', file_name: 'x.xlsx', drive_file_id: 'pending:abc' })
    expect(await (await s.urlOf(PRJ, 'jwt-pm')).json()).toEqual({ token: null, file_name: 'x.xlsx', kind: 'drive' })
  })
})

describe('DoD 92 ④ 권한 = 행사가 보이는 사람(RLS) · ⑤ 형식·로그인 · ⑥ Drive 미설정', () => {
  it('멤버 아닌 사람 404 · admin은 멤버가 아니어도 200 · id 형식 400 · 로그인 없음 401', async () => {
    const s = setup()
    await attachUploaded(s)
    expect((await s.urlOf(PRJ, 'jwt-out')).status).toBe(404)
    await expect(s.clientAs('jwt-out').projectAttachmentFile(PRJ)).rejects.toMatchObject({ code: 'not_found' })
    // admin(전역) — 멤버 표에 없어도 행사가 보인다(Phase 6.5)
    s.db.setProjectAttachment(PRJ_OTHER, { kind: 'link', file_name: null, drive_file_id: null })
    expect((await s.urlOf(PRJ_OTHER, 'jwt-admin')).status).toBe(200)
    expect((await s.urlOf(PRJ_OTHER, 'jwt-pm')).status).toBe(404)
    expect((await s.urlOf('nope', 'jwt-pm')).status).toBe(400)
    expect((await s.urlOf(PRJ)).status).toBe(401)
  })

  it('Drive가 설정되지 않았으면 drive 첨부라도 503(DRIVE_ROOT_FOLDER_ID 안내) — 링크·없음은 그대로 답한다', async () => {
    const s = setup({ DRIVE_ROOT_FOLDER_ID: undefined })
    s.db.setProjectAttachment(PRJ, { kind: 'drive', file_name: '견적서.pdf', drive_file_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456' })
    const r = await s.urlOf(PRJ, 'jwt-pm')
    expect(r.status).toBe(503)
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain('DRIVE_ROOT_FOLDER_ID')
    s.db.setProjectAttachment(PRJ, { kind: 'link', file_name: null, drive_file_id: null })
    expect((await s.urlOf(PRJ, 'jwt-pm')).status).toBe(200)
  })

  it('⑦ 읽기는 저장·로그를 남기지 않고, 공유 권한(permissions) 호출이 없다', async () => {
    const s = setup()
    await attachUploaded(s)
    const logsBefore = s.db.logs.length
    const filesBefore = s.drive.files.size
    await s.clientAs('jwt-pm').projectAttachmentFile(PRJ)
    expect(s.db.logs.length).toBe(logsBefore)
    expect(s.drive.files.size).toBe(filesBefore)
    expect(s.drive.calls.some((c) => c.url.includes('/permissions'))).toBe(false)
  })
})
