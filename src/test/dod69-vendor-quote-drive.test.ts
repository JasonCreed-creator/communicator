// DoD 69 ⑤ (Phase 4.7 · 설계서 v2.11 §19.5 "원본 파일은 근거로 보존") — 협력사 견적서 원본을 Drive 행사 폴더
// 02_견적·정산/협력사 견적서에 보관한다(api/drive PUT settlement-file). 가짜 Drive·가짜 DB로 도는 서버 계약(node 환경 — DoD 61 방식).
//   · pm만(영역 담당 403) · 확인 대기만(확정 뒤 409) · 로그인 없음 401 · id 형식 400 · 4MB 초과 413
//   · 보관한 원본은 인박스 스캔이 '모르는 파일'로 올리지 않는다(아는 파일 = 버전 + 인박스 + 정산 원본)
import { beforeEach, describe, expect, it } from 'vitest'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { createDriveClient } from '../lib/drive/driveClient'
import { createFakeDrive } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

const BASE = 'https://app.example.com'
const IMP = '5d6c3f7e-1d2a-4c5b-9e8f-112233445566'

function setup() {
  const drive = createFakeDrive({ accountEmail: 'owner@company.example' })
  const db = createFakeDriveStore()
  const env: DriveEnv = {
    DRIVE_ROOT_FOLDER_ID: drive.rootId,
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    SUPABASE_SECRET_KEY: 'test-signing-secret-not-a-real-key',
  }
  db.refreshToken = 'refresh-token-1'
  db.addUser({ jwt: 'jwt-pm', authUserId: 'auth-pm', email: 'pm@example.com', profileId: 'p-pm', appRole: 'sales' })
  db.addUser({ jwt: 'jwt-design', authUserId: 'auth-design', email: 'design@example.com', profileId: 'p-design', appRole: 'staff' })
  db.addProject({ id: 'prj-1', code: 'STC26', name: '가상 컨퍼런스', event_date: '2026-10-20', status: 'active', drive_root_folder_id: null })
  db.addMember('p-pm', 'prj-1', 'pm')
  db.addMember('p-design', 'prj-1', 'design')
  db.settlementImports.set(IMP, { project_id: 'prj-1', file_name: '가상음향_견적.xlsx', status: 'parsed', drive_file_id: null })
  const deps = { store: db.store, fetchImpl: drive.fetch, now: () => Date.parse('2026-09-25T03:00:00Z'), sleep: async () => undefined }
  const appFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handleDriveRequest(new Request(new URL(String(input), BASE), init), env, deps)) as typeof fetch
  const clientAs = (jwt: string | null) =>
    createDriveClient({ apiBase: '/api', accessToken: async () => jwt, fetchImpl: appFetch, sleep: async () => undefined })
  const put = (jwt: string | null, importId: string, bytes: Uint8Array) =>
    handleDriveRequest(
      new Request(`${BASE}/api/drive?action=settlement-file&import_id=${importId}&name=${encodeURIComponent('가상음향_견적.xlsx')}`, {
        method: 'PUT',
        headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
        body: bytes,
      }),
      env,
      deps,
    )
  return { drive, db, clientAs, put }
}

function bytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (i * 13 + 7) % 251
  return out
}

describe('DoD 69 · ⑤ 협력사 견적서 원본 보관(Drive)', () => {
  beforeEach(() => clearTokenCache())

  it('pm → 행사 폴더 02_견적·정산/협력사 견적서에 원본 · 가져오기에 파일 id 기록 · 로그', async () => {
    const s = setup()
    const data = bytes(2048)
    const r = await s.clientAs('jwt-pm').settlementFile(IMP, '가상음향_견적.xlsx', data.buffer as ArrayBuffer)
    const file = s.drive.files.get(r.file_id)!
    expect(file.name).toBe('가상음향_견적.xlsx')
    const folder = s.drive.files.get(file.parents[0])!
    expect(folder.name).toBe('협력사 견적서')
    expect(s.drive.files.get(folder.parents[0])!.name).toBe('02_견적·정산')
    expect(s.db.settlementImports.get(IMP)!.drive_file_id).toBe(r.file_id)
    expect(s.db.logs.some((l) => l.action === 'drive.settlement_file' && l.targetId === IMP)).toBe(true)
  })

  it('보관한 원본은 인박스 스캔이 새 파일로 올리지 않는다', async () => {
    const s = setup()
    await s.clientAs('jwt-pm').settlementFile(IMP, '가상음향_견적.xlsx', bytes(64).buffer as ArrayBuffer)
    const scan = await s.clientAs('jwt-pm').scan('prj-1')
    expect(scan.added).toBe(0)
    expect(s.db.inbox).toHaveLength(0)
  })

  it('영역 담당 403 · 로그인 없음 401 · 확정된 가져오기 409 · id 형식 400 · 4MB 초과 413', async () => {
    const s = setup()
    expect((await s.put('jwt-design', IMP, bytes(10))).status).toBe(403)
    expect((await s.put(null, IMP, bytes(10))).status).toBe(401)
    expect((await s.put('jwt-pm', 'not-a-uuid', bytes(10))).status).toBe(400)
    expect((await s.put('jwt-pm', IMP, bytes(4 * 1024 * 1024 + 1))).status).toBe(413)
    s.db.settlementImports.get(IMP)!.status = 'confirmed'
    const conflict = await s.put('jwt-pm', IMP, bytes(10))
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).error.message).toContain('이미 확정')
  })
})
