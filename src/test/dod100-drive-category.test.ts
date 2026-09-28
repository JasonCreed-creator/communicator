// DoD 100 (Phase 6.10 · 설계서 v2.21.6 §7.1 · §4-1) — 보관 분류(Drive 분류 폴더).
//   ① 순수: 자동 판정(주최형 → 자체 · 대행형 모객형 → 모객 · 대행형 일반형 → 비모객) · 고른 값 우선 · 'custom'은 고를 때만 · 폴더 이름 4종(사용자 실물) ·
//      폴더 이름 → 분류(정확한 이름 → 낱말 · 비모객이 모객보다 먼저 · 아니면 null) · isDriveCategory
//   ② 트리: 새 행사 폴더 = 저장소/{분류 폴더}/행사 ID(연도 층 0) · 분류 폴더는 정확한 이름 → 낱말이 다른 사람 폴더 채택 → 없을 때만 만든다 ·
//      옛 연도 폴더 아래 행사 폴더는 다음 보장 때 분류 폴더로 · 보관 분류를 고치면 그 분류 폴더로(하위 그대로 · 로그 1) · 사람이 둔 다른 폴더는 존중
//   ③ 채택: 분류 폴더 자체 422 · 분류 폴더 안의 폴더를 채택하면 그 분류를 보관 분류로 기록(자동과 다를 때만 · 로그 meta) · 같은 분류면 기록 0
//   ④ mock provider: updateProject drive_category(4종·null) 저장 · 모르는 값 422 · design 403 · 로그에 값 0
import { describe, expect, it } from 'vitest'
import { clearTokenCache, driveAccessToken } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { ensureCategoryFolder, isPlacementFolderName, projectCategoryFolderName } from '../../api/_lib/drive/tree'
import { DriveApi } from '../../api/_lib/drive/googleDrive'
import { createFixtureState, PROJECT_ID } from '../fixtures/sampleProject'
import { createDriveClient } from '../lib/drive/driveClient'
import {
  autoDriveCategory,
  DRIVE_CATEGORIES,
  DRIVE_CATEGORY_FOLDERS,
  DRIVE_CATEGORY_INVALID_MESSAGE,
  DRIVE_CATEGORY_LABELS,
  driveCategoryFolderName,
  driveCategoryOfFolderName,
  isDriveCategory,
  isDriveCategoryFolderName,
  resolveDriveCategory,
} from '../lib/driveCategory'
import { MockProvider } from '../providers/mock/MockProvider'
import { createFakeDrive, FOLDER } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

const BASE = 'https://app.example.com'
const GENERAL = 'MICE Solution(비모객)'
const RECRUIT = 'MICE Solution(모객)'
const OWN = '자체행사(Remember titled)'
const CUSTOM = '일반행사(Customized)'

describe('DoD 100 · ① 순수 판정', () => {
  it('자동 판정 · 고른 값 우선 · custom은 고를 때만 · 폴더 이름 4종 · 라벨', () => {
    expect(autoDriveCategory({ kind: 'host', event_type: 'recruiting' })).toBe('own')
    expect(autoDriveCategory({ kind: 'host', event_type: 'general' })).toBe('own')
    expect(autoDriveCategory({ kind: 'agency', event_type: 'recruiting' })).toBe('solution_recruiting')
    expect(autoDriveCategory({ kind: 'agency', event_type: 'general' })).toBe('solution_general')
    expect(resolveDriveCategory({ kind: 'agency', event_type: 'general', drive_category: null })).toBe('solution_general')
    expect(resolveDriveCategory({ kind: 'agency', event_type: 'general', drive_category: 'custom' })).toBe('custom')
    expect(resolveDriveCategory({ kind: 'host', event_type: 'general', drive_category: 'solution_recruiting' })).toBe('solution_recruiting')
    expect(driveCategoryFolderName({ kind: 'agency', event_type: 'recruiting' })).toBe(RECRUIT)
    expect(driveCategoryFolderName({ kind: 'agency', event_type: 'general', drive_category: 'own' })).toBe(OWN)
    expect(Object.values(DRIVE_CATEGORY_FOLDERS)).toEqual([RECRUIT, GENERAL, OWN, CUSTOM])
    expect(DRIVE_CATEGORIES.every((c) => DRIVE_CATEGORY_LABELS[c].length > 0)).toBe(true)
    expect(DRIVE_CATEGORIES.map(autoIsReachable)).toEqual([true, true, true, false]) // custom은 자동으로 가지 않는다
    expect(isDriveCategory('own')).toBe(true)
    expect(isDriveCategory('memo')).toBe(false)
    expect(isDriveCategory(null)).toBe(false)
    expect(projectCategoryFolderName({ kind: 'agency', event_type: 'general', drive_category: null })).toBe(GENERAL)
  })

  it('폴더 이름 → 분류: 정확한 이름 → 낱말(비모객이 모객보다 먼저) → 아니면 null · 자리 폴더 판정(분류 · 옛 연도)', () => {
    expect(driveCategoryOfFolderName(GENERAL)).toBe('solution_general')
    expect(driveCategoryOfFolderName(RECRUIT)).toBe('solution_recruiting')
    expect(driveCategoryOfFolderName(OWN)).toBe('own')
    expect(driveCategoryOfFolderName(CUSTOM)).toBe('custom')
    expect(driveCategoryOfFolderName('MICE Solution (비모객) 2026')).toBe('solution_general')
    expect(driveCategoryOfFolderName('MICE Solution (모객)')).toBe('solution_recruiting')
    expect(driveCategoryOfFolderName('자체행사 모음')).toBe('own')
    expect(driveCategoryOfFolderName('일반행사(customized) 2026')).toBe('custom')
    // 행사 폴더 이름을 분류로 오인하지 않는다 — 한 글자 낱말·'자체 서밋'·'일반 세미나'·'모객 캠페인'
    expect(driveCategoryOfFolderName('모객 행사')).toBeNull()
    expect(driveCategoryOfFolderName('자체 서밋(수동)')).toBeNull()
    expect(driveCategoryOfFolderName('일반 세미나')).toBeNull()
    expect(driveCategoryOfFolderName('2026')).toBeNull()
    expect(driveCategoryOfFolderName('261020_가상고객_가상 컨퍼런스')).toBeNull()
    expect(isDriveCategoryFolderName(' 자체행사(Remember titled) ')).toBe(true)
    expect(isPlacementFolderName('2026')).toBe(true)
    expect(isPlacementFolderName('연도 미정')).toBe(true)
    expect(isPlacementFolderName(OWN)).toBe(true)
    expect(isPlacementFolderName('00_견적서')).toBe(false)
  })
})

function autoIsReachable(c: string): boolean {
  const combos: { kind: 'agency' | 'host'; event_type: 'general' | 'recruiting' }[] = [
    { kind: 'agency', event_type: 'general' },
    { kind: 'agency', event_type: 'recruiting' },
    { kind: 'host', event_type: 'general' },
    { kind: 'host', event_type: 'recruiting' },
  ]
  return combos.some((p) => autoDriveCategory(p) === c)
}

function setup() {
  clearTokenCache()
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
  db.addProject({ id: 'prj-r', code: 'R', name: '모객 컨퍼런스', organizer: '가상고객', event_date: '2026-10-20', status: 'active', drive_root_folder_id: null, kind: 'agency', event_type: 'recruiting' })
  db.addProject({ id: 'prj-g', code: 'G', name: '일반 세미나', organizer: '가상고객', event_date: '2026-11-04', status: 'active', drive_root_folder_id: null, kind: 'agency', event_type: 'general' })
  db.addProject({ id: 'prj-h', code: 'H', name: '자체 서밋', organizer: '가상회사', event_date: '2026-12-01', status: 'active', drive_root_folder_id: null, kind: 'host', event_type: 'general' })
  for (const id of ['prj-r', 'prj-g', 'prj-h']) db.addMember('p-pm', id, 'pm')
  let t = Date.parse('2026-09-28T10:00:00Z')
  const deps = { store: db.store, fetchImpl: drive.fetch, now: () => t, sleep: async () => undefined }
  const appFetch = (async (input: RequestInfo | URL, init?: RequestInit) => handleDriveRequest(new Request(new URL(String(input), BASE), init), env, deps)) as typeof fetch
  const client = createDriveClient({ apiBase: '/api', accessToken: async () => 'jwt-pm', fetchImpl: appFetch, sleep: async () => undefined })
  const post = (body: Record<string, unknown>) =>
    handleDriveRequest(new Request(`${BASE}/api/drive`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer jwt-pm' }, body: JSON.stringify(body) }), env, deps)
  const api = new DriveApi(() => driveAccessToken(env, db.store, drive.fetch, Date.now()), drive.fetch)
  return { drive, db, env, deps, client, post, api, advance: (ms: number) => (t += ms) }
}

describe('DoD 100 · ② 트리 — 저장소/{분류 폴더}/행사 ID', () => {
  it('새 행사 폴더는 자동 분류 폴더 아래(모객·비모객·자체 각각) · 연도 층 0 · 분류 폴더는 한 번만 만든다', async () => {
    const s = setup()
    const r = await s.client.ensureTree('prj-r')
    const g = await s.client.ensureTree('prj-g')
    const h = await s.client.ensureTree('prj-h')
    expect(s.drive.files.get(s.drive.files.get(r.folder_id)!.parents[0])!.name).toBe(RECRUIT)
    expect(s.drive.files.get(s.drive.files.get(g.folder_id)!.parents[0])!.name).toBe(GENERAL)
    expect(s.drive.files.get(s.drive.files.get(h.folder_id)!.parents[0])!.name).toBe(OWN)
    for (const id of [r.folder_id, g.folder_id, h.folder_id]) expect(s.drive.files.get(s.drive.files.get(id)!.parents[0])!.parents).toEqual([s.drive.rootId])
    expect(s.drive.childrenOf(s.drive.rootId).filter((f) => f.mimeType === FOLDER && /^(19|20)\d{2}$|연도 미정/.test(f.name))).toEqual([])
    expect(s.drive.childNamed(s.drive.rootId, CUSTOM)).toBeUndefined() // 일반행사는 고를 때만
    s.db.addProject({ id: 'prj-r2', code: 'R2', name: '둘째 모객', organizer: '가상고객', event_date: '2026-10-21', status: 'active', drive_root_folder_id: null, kind: 'agency', event_type: 'recruiting' })
    s.db.addMember('p-pm', 'prj-r2', 'pm')
    const r2 = await s.client.ensureTree('prj-r2')
    expect(s.drive.files.get(r2.folder_id)!.parents).toEqual([s.drive.files.get(r.folder_id)!.parents[0]])
    expect(s.drive.childrenOf(s.drive.rootId).filter((f) => f.name === RECRUIT)).toHaveLength(1)
  })

  it('분류 폴더 찾기: 정확한 이름 → 낱말이 다른 사람 폴더(예: "MICE Solution (비모객) 2026") 채택 → 없을 때만 정본 이름으로 · 만든 뒤 두 번째는 같은 id', async () => {
    const s = setup()
    const human = s.drive.add({ name: 'MICE Solution (비모객) 행사', parents: [s.drive.rootId], mimeType: FOLDER })
    const decoy = s.drive.add({ name: '모객 자료', parents: [human.id], mimeType: FOLDER }) // 루트 바로 아래가 아니면 무관
    expect(await ensureCategoryFolder(s.api, s.drive.rootId, 'solution_general')).toBe(human.id)
    expect(s.drive.childNamed(s.drive.rootId, GENERAL)).toBeUndefined()
    const created = await ensureCategoryFolder(s.api, s.drive.rootId, 'own')
    expect(s.drive.files.get(created)!.name).toBe(OWN)
    expect(await ensureCategoryFolder(s.api, s.drive.rootId, 'own')).toBe(created)
    expect(decoy.parents).toEqual([human.id])
    const g = await s.client.ensureTree('prj-g')
    expect(s.drive.files.get(g.folder_id)!.parents).toEqual([human.id])
  })

  it('옛 연도 폴더(v2.17) 아래 행사 폴더는 다음 보장 때 분류 폴더로 · 보관 분류를 고치면 그 분류 폴더로(하위 그대로 · 로그) · 바뀐 것 없으면 PATCH 0', async () => {
    const s = setup()
    const year = s.drive.add({ name: '2026', parents: [s.drive.rootId], mimeType: FOLDER })
    const legacy = s.drive.add({ name: '261020_가상고객_모객 컨퍼런스', parents: [year.id], mimeType: FOLDER, appProperties: { communicator_project_id: 'prj-r' } })
    const keep = s.drive.add({ name: '03_제작·키비주얼', parents: [legacy.id], mimeType: FOLDER })
    s.db.projects.get('prj-r')!.drive_root_folder_id = legacy.id
    const first = await s.client.ensureTree('prj-r')
    expect(first.folder_id).toBe(legacy.id)
    expect(s.drive.files.get(legacy.parents[0])!.name).toBe(RECRUIT)
    expect(s.drive.files.get(keep.id)!.parents).toEqual([legacy.id])
    expect(s.drive.childrenOf(year.id)).toEqual([])
    expect(s.db.logs.filter((l) => l.action === 'drive.tree_placed' && l.projectId === 'prj-r')).toHaveLength(1)
    // 설정 ③에서 '일반행사(Customized)'로 고침 → 다음 보장 때 그 분류 폴더로(없으니 만든다)
    s.db.projects.get('prj-r')!.drive_category = 'custom'
    await s.client.ensureTree('prj-r')
    expect(s.drive.files.get(legacy.parents[0])!.name).toBe(CUSTOM)
    expect(s.drive.files.get(legacy.parents[0])!.parents).toEqual([s.drive.rootId])
    expect(s.drive.files.get(keep.id)!.parents).toEqual([legacy.id])
    expect(s.db.logs.filter((l) => l.action === 'drive.tree_placed' && l.projectId === 'prj-r')).toHaveLength(2)
    const patches = () => s.drive.calls.filter((c) => c.method === 'PATCH').length
    const before = patches()
    await s.client.ensureTree('prj-r')
    expect(patches()).toBe(before)
    // 사람이 루트 안 다른 폴더(고객사 폴더)에 둔 행사 폴더는 분류를 고쳐도 자리 존중(이름만)
    const clientFolder = s.drive.add({ name: '가상고객', parents: [s.drive.rootId], mimeType: FOLDER })
    const manual = s.drive.add({ name: '세미나 자료', parents: [clientFolder.id], mimeType: FOLDER, appProperties: { communicator_project_id: 'prj-g' } })
    s.db.projects.get('prj-g')!.drive_root_folder_id = manual.id
    s.db.projects.get('prj-g')!.drive_category = 'own'
    await s.client.ensureTree('prj-g')
    expect(manual.name).toBe('261104_가상고객_일반 세미나')
    expect(manual.parents).toEqual([clientFolder.id])
  })
})

describe('DoD 100 · ③ 채택(adopt-folder)', () => {
  it('분류 폴더 자체는 422 · 분류 폴더 안의 폴더를 채택하면 그 분류를 보관 분류로 기록(자동과 다를 때만 · 로그 meta) · 같은 분류면 기록 0 · 이름만 맞춘다', async () => {
    const s = setup()
    const own = s.drive.add({ name: OWN, parents: [s.drive.rootId], mimeType: FOLDER })
    const c = await s.post({ action: 'adopt-folder', project_id: 'prj-g', url: `https://drive.google.com/drive/folders/${own.id}` })
    expect(c.status).toBe(422)
    expect((await c.json()).error.message).toContain('분류 폴더')
    // 사람이 '자체행사' 폴더 안에 만들어 둔 일반 세미나 폴더를 채택 → 자동(비모객)과 다르니 own을 기록 · 자리 그대로 · 이름 = 행사 ID
    const manual = s.drive.add({ name: '일반 세미나(수동)', parents: [own.id], mimeType: FOLDER })
    const r = await s.client.adoptFolder('prj-g', `https://drive.google.com/drive/folders/${manual.id}`)
    expect(r.folder_id).toBe(manual.id)
    expect(s.db.projects.get('prj-g')!.drive_category).toBe('own')
    expect(manual.parents).toEqual([own.id])
    expect(manual.name).toBe('261104_가상고객_일반 세미나')
    expect(s.db.logs.find((l) => l.action === 'drive.tree_adopted' && l.projectId === 'prj-g')?.meta).toMatchObject({ folder_id: manual.id, drive_category: 'own' })
    expect(s.drive.childNamed(s.drive.rootId, GENERAL)).toBeUndefined()
    // 자동 분류 폴더 안의 폴더를 채택하면 기록 0(자동과 같다)
    const recruit = s.drive.add({ name: RECRUIT, parents: [s.drive.rootId], mimeType: FOLDER })
    const manual2 = s.drive.add({ name: '모객 폴더', parents: [recruit.id], mimeType: FOLDER })
    await s.client.adoptFolder('prj-r', `https://drive.google.com/drive/folders/${manual2.id}`)
    expect(s.db.projects.get('prj-r')!.drive_category).toBeNull()
    expect(s.db.logs.find((l) => l.action === 'drive.tree_adopted' && l.projectId === 'prj-r')?.meta).toEqual({ folder_id: manual2.id })
    expect(manual2.parents).toEqual([recruit.id])
    // 루트 바로 아래 폴더를 채택하면 자동 분류 폴더로 옮긴다
    const top = s.drive.add({ name: '자체 서밋(수동)', parents: [s.drive.rootId], mimeType: FOLDER })
    await s.client.adoptFolder('prj-h', `https://drive.google.com/drive/folders/${top.id}`)
    expect(s.drive.files.get(top.parents[0])!.name).toBe(OWN)
    expect(top.parents[0]).toBe(own.id)
  })
})

describe('DoD 100 · ④ mock provider — updateProject.drive_category', () => {
  it('pm이 4종·null을 저장 · 모르는 값 422 · design 403 · 저장값이 getProject에 · 로그에 값 0', async () => {
    const provider = new MockProvider(createFixtureState())
    provider.switchUser('usr-pm')
    for (const c of DRIVE_CATEGORIES) {
      await provider.updateProject(PROJECT_ID, { drive_category: c })
      expect((await provider.getProject(PROJECT_ID)).drive_category).toBe(c)
    }
    await provider.updateProject(PROJECT_ID, { drive_category: null })
    expect((await provider.getProject(PROJECT_ID)).drive_category).toBeNull()
    await expect(provider.updateProject(PROJECT_ID, { drive_category: 'memo' as never })).rejects.toMatchObject({ code: 'validation', message: DRIVE_CATEGORY_INVALID_MESSAGE })
    expect((await provider.getProject(PROJECT_ID)).drive_category).toBeNull()
    const log = await provider.listActivity(PROJECT_ID, 50)
    expect(JSON.stringify(log)).not.toContain('drive_category')
    provider.switchUser('usr-design')
    await expect(provider.updateProject(PROJECT_ID, { drive_category: 'own' })).rejects.toMatchObject({ code: 'forbidden' })
  })
})
