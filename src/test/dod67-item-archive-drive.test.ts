// DoD 67 ⑤ (Phase 4.5) — 지운 항목의 Drive 폴더 보관(api/drive archive-item). 가짜 Drive·가짜 DB로 도는 서버 계약이라
// node 환경에서 돈다(jsdom Blob은 조각 업로드의 바이트 길이 판정과 맞지 않는다 — DoD 61과 같은 방식).
//   · 살아 있는 항목의 폴더는 409 · PM만 · 지운 항목의 표식 달린 폴더만 그 행사 폴더의 99_archive로(이름에 삭제일, 파일 보존)
//   · 공통 영역 항목은 파트 폴더 자체를 쓰므로 옮기지 않는다 · 다른 행사 폴더 안은 403 · 항목 id 형식 400
import { beforeEach, describe, expect, it } from 'vitest'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { createDriveClient } from '../lib/drive/driveClient'
import { createFakeDrive } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

const BASE = 'https://app.example.com'
const DLV = '0b6c3f7e-1d2a-4c5b-9e8f-112233445566'
const DLV_COMMON = '0b6c3f7e-1d2a-4c5b-9e8f-112233445577'

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
  db.addUser({ jwt: 'jwt-pm', authUserId: 'auth-pm', email: 'pm@example.com', profileId: 'p-pm', appRole: 'sales' })
  db.addUser({ jwt: 'jwt-design', authUserId: 'auth-design', email: 'design@example.com', profileId: 'p-design', appRole: 'staff' })
  db.addProject({ id: 'prj-1', code: 'STC26', name: '가상 컨퍼런스', event_date: '2026-10-20', status: 'active', drive_root_folder_id: null })
  db.addProject({ id: 'prj-2', code: 'OTH', name: '다른 행사', event_date: '2026-11-01', status: 'active', drive_root_folder_id: null })
  db.addMember('p-pm', 'prj-1', 'pm')
  db.addMember('p-pm', 'prj-2', 'pm')
  db.addMember('p-design', 'prj-1', 'design')
  db.addDeliverable({ id: DLV, project_id: 'prj-1', area: 'design', category: '배너', title: '무대 배너', status: 'draft', drive_folder_id: null })
  db.addDeliverable({ id: DLV_COMMON, project_id: 'prj-1', area: 'common', category: '회의록', title: '킥오프 회의록', status: 'draft', drive_folder_id: null })
  const deps = { store: db.store, fetchImpl: drive.fetch, now: () => Date.parse('2026-09-25T03:00:00Z'), sleep: async () => undefined }
  const appFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handleDriveRequest(new Request(new URL(String(input), BASE), init), env, deps)) as typeof fetch
  const clientAs = (jwt: string) =>
    createDriveClient({ apiBase: '/api', accessToken: async () => jwt, fetchImpl: appFetch, sleep: async () => undefined })
  const archive = (jwt: string, body: Record<string, unknown>) =>
    handleDriveRequest(
      new Request(`${BASE}/api/drive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ action: 'archive-item', ...body }),
      }),
      env,
      deps,
    )
  return { drive, db, clientAs, archive }
}

describe('DoD 67 · ⑤ Drive — 지운 항목의 폴더만 행사 99_archive로', () => {
  beforeEach(() => clearTokenCache())

  it('살아 있는 항목은 409 → 지운 뒤 PM이 옮긴다(이름에 삭제일) · 파일은 그대로 · 로그', async () => {
    const s = driveSetup()
    const v = await s.clientAs('jwt-design').upload({ deliverableId: DLV, file: new Blob([new Uint8Array(8)]), fileName: 'b.pdf', originalFileName: 'b.pdf' })
    const folderId = s.db.deliverables.get(DLV)!.drive_folder_id!
    const body = { project_id: 'prj-1', deliverable_id: DLV, folder_id: folderId, title: '무대 배너' }
    expect((await s.archive('jwt-pm', body)).status).toBe(409)

    s.db.deliverables.delete(DLV) // delete_deliverable 이후
    expect((await s.archive('jwt-design', body)).status).toBe(403) // 영역 담당도 PM이 아니면 못 옮긴다
    const r = await s.clientAs('jwt-pm').archiveItem(body)
    expect(r.archived).toBe(true)
    const moved = s.drive.files.get(folderId)!
    expect(moved.name).toBe('무대 배너 (삭제됨 260925)')
    const archiveFolder = s.drive.files.get(moved.parents[0])!
    expect(archiveFolder.name).toBe('99_archive')
    expect(archiveFolder.parents).toEqual([s.db.projects.get('prj-1')!.drive_root_folder_id])
    const file = s.drive.childrenOf(folderId).find((f) => f.name.endsWith('.pdf'))
    expect(file?.trashed).toBe(false)
    expect(v.drive_file_id).toBe(file?.id)
    expect(s.db.logs.some((l) => l.action === 'drive.item_archived' && l.targetId === DLV)).toBe(true)
    // 다시 불러도 그대로(멱등)
    expect(await s.clientAs('jwt-pm').archiveItem(body)).toMatchObject({ archived: true })
  })

  it('공통 영역 항목은 파트 폴더 자체를 쓰므로(표식 없음) 옮기지 않는다 — 다른 항목 파일이 딸려 가지 않게', async () => {
    const s = driveSetup()
    await s.clientAs('jwt-pm').upload({ deliverableId: DLV_COMMON, file: new Blob([new Uint8Array(4)]), fileName: 'm.docx', originalFileName: 'm.docx' })
    const partFolder = s.db.deliverables.get(DLV_COMMON)!.drive_folder_id!
    expect(s.drive.files.get(partFolder)!.name).toBe('03_회의록')
    s.db.deliverables.delete(DLV_COMMON)
    const r = await s.clientAs('jwt-pm').archiveItem({ project_id: 'prj-1', deliverable_id: DLV_COMMON, folder_id: partFolder, title: '킥오프 회의록' })
    expect(r).toMatchObject({ archived: false, reason: 'not_item_folder' })
    expect(s.drive.files.get(partFolder)!.name).toBe('03_회의록')
  })

  it('다른 행사 폴더 안의 폴더는 403 · 항목 id 형식 400', async () => {
    const s = driveSetup()
    await s.clientAs('jwt-design').upload({ deliverableId: DLV, file: new Blob([new Uint8Array(8)]), fileName: 'b.pdf', originalFileName: 'b.pdf' })
    const folderId = s.db.deliverables.get(DLV)!.drive_folder_id!
    s.db.deliverables.delete(DLV)
    await s.clientAs('jwt-pm').ensureTree('prj-2')
    expect((await s.archive('jwt-pm', { project_id: 'prj-2', deliverable_id: DLV, folder_id: folderId, title: 'x' })).status).toBe(403)
    expect((await s.archive('jwt-pm', { project_id: 'prj-1', deliverable_id: 'dlv-kv', folder_id: folderId, title: 'x' })).status).toBe(400)
    expect(s.drive.files.get(folderId)!.name).toBe('무대 배너')
  })
})
