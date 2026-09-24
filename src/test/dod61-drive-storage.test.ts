// DoD 61 (Phase 5 · 설계서 v2.9 §7) — Drive 저장소 서버 계약. 실계정 없이 가짜 Drive·가짜 DB로 돈다(CLAUDE.md Phase 5 원칙).
// 클라이언트(lib/drive/driveClient)를 서버 핸들러(api/_lib/drive/handler)에 직결해 브라우저 → 함수 → Drive 경로를 끝까지 본다.
//   ① 트리 멱등(두 번 실행 중복 0) · 이름 규약 · 기존 폴더 채택 ② 조각 업로드(5MB+) → 규약 파일명으로 항목 폴더 → 버전 등록 ·
//   재시도 · 권한은 바이트 전에 ③ 링크 3분기(행사 폴더 안 참조 · 루트 안 복사 · 루트 밖 403) ④ 서명 스트림(인라인/내려받기 ·
//   100MB · 만료·위조 · Range · 구글 문서 PDF) ⑤ §7.5 복사 성공 후에만 final · 실패 시 approved 유지 ⑥ 인박스 스캔
//   ⑦ OAuth 연결 ⑧ 행사 폴더 지정·보관 ⑨ 견적 시트 00_견적서 ⑩ 공유 권한 호출 0건(anyone 링크 금지)
import { beforeEach, describe, expect, it } from 'vitest'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { signToken, signingKey } from '../../api/_lib/drive/sign'
import { createQuoteSpreadsheetOnDrive } from '../../api/_lib/quoteGsheet'
import { createDriveClient } from '../lib/drive/driveClient'
import { createFakeDrive, FOLDER } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

const BASE = 'https://app.example.com'

function bytes(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed) % 251
  return out
}

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
  db.addUser({ jwt: 'jwt-reg', authUserId: 'auth-reg', email: 'reg@example.com', profileId: 'p-reg', appRole: 'staff' })
  db.addProject({ id: 'prj-1', code: 'STC26', name: '가상 컨퍼런스', event_date: '2026-10-20', status: 'active', drive_root_folder_id: null })
  db.addMember('p-pm', 'prj-1', 'pm')
  db.addMember('p-admin', 'prj-1', 'pm')
  db.addMember('p-design', 'prj-1', 'design')
  db.addMember('p-reg', 'prj-1', 'reg')
  db.addDeliverable({ id: 'dlv-kv', project_id: 'prj-1', area: 'design', category: '키비주얼', title: '메인 키비주얼', status: 'draft', drive_folder_id: null })
  db.addDeliverable({ id: 'dlv-ops', project_id: 'prj-1', area: 'ops', category: '운영매뉴얼', title: '현장 매뉴얼', status: 'requested', drive_folder_id: null })
  db.addDeliverable({ id: 'dlv-min', project_id: 'prj-1', area: 'common', category: '회의록', title: '킥오프 회의록', status: 'draft', drive_folder_id: null })
  let t = Date.parse('2026-09-24T10:00:00Z')
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
  return { drive, db, env, deps, appFetch, clientAs, post, advance: (ms: number) => (t += ms) }
}

beforeEach(() => clearTokenCache())

describe('DoD 61 · ① 표준 트리 — 멱등·이름 규약·기존 폴더 채택', () => {
  it('GET은 {configured}만 — 자격증명 값은 내보내지 않는다', async () => {
    const s = setup()
    const r = await handleDriveRequest(new Request(`${BASE}/api/drive`), s.env, s.deps)
    expect(await r.json()).toEqual({ configured: true })
    const r2 = await handleDriveRequest(new Request(`${BASE}/api/drive`), {}, s.deps)
    expect(await r2.json()).toEqual({ configured: false })
  })

  it('행사 폴더 = YYMMDD_코드_행사명 + 파트 7종 + 05_산출물/디자인, 두 번 실행해도 폴더 수 불변', async () => {
    const s = setup()
    const before = s.drive.folderCount()
    const r = await s.clientAs('jwt-pm').ensureTree('prj-1')
    expect(r.created).toBe(true)
    const root = s.drive.files.get(r.folder_id)!
    expect(root.name).toBe('261020_STC26_가상 컨퍼런스')
    expect(root.parents).toEqual([s.drive.rootId])
    expect(s.drive.childrenOf(root.id).map((f) => f.name).sort()).toEqual(
      ['01_기획', '02_견적·정산', '03_회의록', '04_운영', '05_산출물', '06_발주처공유', '99_archive'].sort(),
    )
    expect(s.drive.childNamed(s.drive.childNamed(root.id, '05_산출물')!.id, '디자인')).toBeTruthy()
    expect(s.db.projects.get('prj-1')!.drive_root_folder_id).toBe(root.id)
    const after1 = s.drive.folderCount()
    expect(after1 - before).toBe(9)
    const again = await s.clientAs('jwt-pm').ensureTree('prj-1')
    expect(again).toMatchObject({ folder_id: root.id, created: false })
    expect(s.drive.folderCount()).toBe(after1)
    expect(s.db.driveEnabled).toBe(true)
  })

  it('DB 기록 전에 끊겨도(행사 id 표식) 두 번째 실행이 같은 폴더를 채택한다 · 지운 파트 폴더는 복구', async () => {
    const s = setup()
    const first = await s.clientAs('jwt-pm').ensureTree('prj-1')
    s.db.projects.get('prj-1')!.drive_root_folder_id = null // 기록 유실 흉내
    const share = s.drive.childNamed(first.folder_id, '06_발주처공유')!
    share.trashed = true
    const second = await s.clientAs('jwt-pm').ensureTree('prj-1')
    expect(second.folder_id).toBe(first.folder_id)
    expect(s.drive.childNamed(first.folder_id, '06_발주처공유')).toBeTruthy()
  })

  it('비멤버는 403, 로그인 없으면 401', async () => {
    const s = setup()
    s.db.addUser({ jwt: 'jwt-out', authUserId: 'auth-out', email: 'x@example.com', profileId: 'p-out', appRole: 'staff' })
    expect((await s.post({ action: 'ensure-tree', project_id: 'prj-1' }, 'jwt-out')).status).toBe(403)
    expect((await s.post({ action: 'ensure-tree', project_id: 'prj-1' })).status).toBe(401)
  })

  it('서버 설정이 없으면 503을 사실대로(데모 값 흉내 없음)', async () => {
    const s = setup({ DRIVE_ROOT_FOLDER_ID: undefined })
    const r = await s.post({ action: 'ensure-tree', project_id: 'prj-1' }, 'jwt-pm')
    expect(r.status).toBe(503)
    expect((await r.json()).error.message).toContain('DRIVE_ROOT_FOLDER_ID')
  })
})

describe('DoD 61 · ② 조각 업로드 — 5MB+ · 규약 파일명 · 항목 폴더 · 권한은 바이트 전에', () => {
  it('6MB 파일이 4MB+2MB 조각으로 올라가 05_산출물/디자인/{항목}에 규약 이름으로 저장되고 버전이 등록된다', async () => {
    const s = setup()
    const data = bytes(6 * 1024 * 1024)
    const progress: [number, number][] = []
    const v = await s.clientAs('jwt-design').upload({
      deliverableId: 'dlv-kv',
      file: new Blob([data], { type: 'application/pdf' }),
      fileName: '260924_STC26_키비주얼_메인 키비주얼_v1.pdf',
      originalFileName: '시안_최종.pdf',
      note: '1차 시안',
      onProgress: (a, b) => progress.push([a, b]),
    })
    const stored = s.drive.files.get(v.drive_file_id)!
    expect(stored.name).toBe('260924_STC26_키비주얼_메인 키비주얼_v1.pdf')
    expect(stored.content.length).toBe(data.length)
    expect(stored.content[5_000_001]).toBe(data[5_000_001])
    const itemFolder = s.drive.files.get(stored.parents[0])!
    expect(itemFolder.name).toBe('메인 키비주얼')
    const design = s.drive.files.get(itemFolder.parents[0])!
    expect(design.name).toBe('디자인')
    expect(s.drive.files.get(design.parents[0])!.name).toBe('05_산출물')
    expect(v).toMatchObject({ deliverable_id: 'dlv-kv', version_no: 1, note: '1차 시안', file_name: stored.name })
    expect(s.db.deliverables.get('dlv-kv')!.drive_folder_id).toBe(itemFolder.id)
    expect(progress[0]).toEqual([0, data.length])
    expect(progress[progress.length - 1]).toEqual([data.length, data.length])
    expect(progress.some(([a]) => a === 4 * 1024 * 1024)).toBe(true)
  })

  it('ops 항목은 04_운영/{항목}, 공통 회의록은 03_회의록에 바로 · 첫 업로드가 requested → draft', async () => {
    const s = setup()
    const v1 = await s.clientAs('jwt-pm').upload({ deliverableId: 'dlv-ops', file: new Blob([bytes(10)]), fileName: 'ops.pdf', originalFileName: 'ops.pdf' })
    expect(s.drive.files.get(s.drive.files.get(v1.drive_file_id)!.parents[0])!.name).toBe('현장 매뉴얼')
    expect(s.db.deliverables.get('dlv-ops')!.status).toBe('draft')
    const v2 = await s.clientAs('jwt-pm').upload({ deliverableId: 'dlv-min', file: new Blob([bytes(10)]), fileName: 'min.docx', originalFileName: 'min.docx' })
    expect(s.drive.files.get(s.drive.files.get(v2.drive_file_id)!.parents[0])!.name).toBe('03_회의록')
  })

  it('빈 파일(0바이트)도 올라간다', async () => {
    const s = setup()
    const v = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([]), fileName: 'empty.txt', originalFileName: 'empty.txt' })
    expect(s.drive.files.get(v.drive_file_id)!.content.length).toBe(0)
  })

  it('조각 전송이 끊기면 수신 위치를 물어 이어서 보낸다(재시도)', async () => {
    const s = setup()
    s.drive.failNextChunks(1)
    const data = bytes(5 * 1024 * 1024)
    const v = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([data]), fileName: 'r.pdf', originalFileName: 'r.pdf' })
    expect(s.drive.files.get(v.drive_file_id)!.content.length).toBe(data.length)
  })

  it('reg 역할은 403 — Drive에 세션을 열기 전에 막힌다', async () => {
    const s = setup()
    const r = await s.post(
      { action: 'upload-start', deliverable_id: 'dlv-kv', file_name: 'x.pdf', original_file_name: 'x.pdf', size: 10 },
      'jwt-reg',
    )
    expect(r.status).toBe(403)
    expect(s.drive.calls.some((c) => c.url.includes('uploadType=resumable'))).toBe(false)
  })

  it('상한 초과 413 · 조각 규칙 위반 400 · 다른 사람의 티켓으로 커밋 403', async () => {
    const s = setup({ DRIVE_MAX_UPLOAD_MB: '1' })
    const big = await s.post({ action: 'upload-start', deliverable_id: 'dlv-kv', file_name: 'x.pdf', size: 2 * 1024 * 1024 }, 'jwt-design')
    expect(big.status).toBe(413)
    const start = await (
      await s.post({ action: 'upload-start', deliverable_id: 'dlv-kv', file_name: 'x.pdf', original_file_name: 'x.pdf', size: 600 * 1024 }, 'jwt-design')
    ).json()
    // 마지막이 아닌 조각이 256KB 배수가 아니면 400
    const bad = await handleDriveRequest(
      new Request(`${BASE}/api/drive?action=upload-chunk`, {
        method: 'PUT',
        headers: { 'x-upload-ticket': start.ticket, 'content-range': `bytes 0-99999/${600 * 1024}` },
        body: bytes(100000),
      }),
      s.env,
      s.deps,
    )
    expect(bad.status).toBe(400)
    const commit = await s.post({ action: 'upload-commit', ticket: start.ticket, file_id: 'whatever' }, 'jwt-pm')
    expect(commit.status).toBe(403)
  })

  it('위조 티켓 403 · 만료 티켓 410', async () => {
    const s = setup()
    const start = await (await s.post({ action: 'upload-start', deliverable_id: 'dlv-kv', file_name: 'x.pdf', size: 10 }, 'jwt-design')).json()
    const tampered = start.ticket.replace(/^./, (c: string) => (c === 'a' ? 'b' : 'a'))
    const chunk = (ticket: string) =>
      handleDriveRequest(
        new Request(`${BASE}/api/drive?action=upload-chunk`, { method: 'PUT', headers: { 'x-upload-ticket': ticket, 'content-range': 'bytes 0-9/10' }, body: bytes(10) }),
        s.env,
        s.deps,
      )
    expect((await chunk(tampered)).status).toBe(403)
    s.advance(7 * 3600 * 1000)
    expect((await chunk(start.ticket)).status).toBe(410)
  })

  it('등록이 거부되면(상태가 바뀜) 올라간 파일은 휴지통으로 — 고아 파일 0', async () => {
    const s = setup()
    const client = s.clientAs('jwt-design')
    const start = await (await s.post({ action: 'upload-start', deliverable_id: 'dlv-kv', file_name: 'x.pdf', size: 10 }, 'jwt-design')).json()
    const put = await handleDriveRequest(
      new Request(`${BASE}/api/drive?action=upload-chunk`, { method: 'PUT', headers: { 'x-upload-ticket': start.ticket, 'content-range': 'bytes 0-9/10' }, body: bytes(10) }),
      s.env,
      s.deps,
    )
    const done = await put.json()
    expect(done.done).toBe(true)
    s.db.deliverables.get('dlv-kv')!.status = 'pending_approval' // 그 사이 컨펌 발송됨
    const commit = await s.post({ action: 'upload-commit', ticket: start.ticket, file_id: done.file_id }, 'jwt-design')
    expect(commit.status).toBe(409)
    expect(s.drive.files.get(done.file_id)!.trashed).toBe(true)
    expect(client).toBeTruthy()
  })
})

describe('DoD 61 · ③ 링크 등록 3분기 (§7.2b)', () => {
  it('행사 폴더 안 파일 → 복사 없이 그대로 참조 · 파일명은 Drive 이름 · 인박스에 있던 것은 연결 처리', async () => {
    const s = setup()
    const tree = await s.clientAs('jwt-pm').ensureTree('prj-1')
    const ops = s.drive.childNamed(tree.folder_id, '04_운영')!
    const f = s.drive.add({ name: '현장배치도.pdf', parents: [ops.id], mimeType: 'application/pdf', content: bytes(20) })
    s.db.inbox.push({ id: 'inb-x', project_id: 'prj-1', drive_file_id: f.id, file_name: f.name, detected_folder: '04_운영', linked: null, dismissed: false })
    const before = s.drive.files.size
    const v = await s.clientAs('jwt-pm').link('dlv-kv', `https://drive.google.com/file/d/${f.id}/view?usp=sharing`)
    expect(v.drive_file_id).toBe(f.id)
    expect(v.file_name).toBe('현장배치도.pdf')
    expect(v.note).toBe('Drive 링크로 등록')
    expect(s.drive.files.size).toBe(before)
    expect(s.db.inbox[0].linked).toBe('dlv-kv')
  })

  it('저장소 루트 안이지만 행사 폴더 밖 → 항목 폴더로 복사해 등록(행사 트리 자기완결)', async () => {
    const s = setup()
    const loose = s.drive.add({ name: '공용_로고.png', parents: [s.drive.rootId], mimeType: 'image/png', content: bytes(30) })
    const v = await s.clientAs('jwt-design').link('dlv-kv', `https://drive.google.com/open?id=${loose.id}`, '로고 적용본')
    expect(v.drive_file_id).not.toBe(loose.id)
    const copy = s.drive.files.get(v.drive_file_id)!
    expect(copy.name).toBe('공용_로고.png')
    expect(s.drive.files.get(copy.parents[0])!.name).toBe('메인 키비주얼')
    expect(copy.appProperties.communicator_deliverable_id).toBe('dlv-kv')
    expect(v.note).toBe('로고 적용본')
  })

  it('루트 밖(개인 폴더) 파일 → 403 · 폴더 링크 → 422 · 링크 아님 → 400 · 못 보는 파일 → 404', async () => {
    const s = setup()
    const outside = s.drive.add({ name: '개인메모.pdf', parents: [s.drive.outsideId], mimeType: 'application/pdf' })
    const link = (url: string) => s.post({ action: 'link', deliverable_id: 'dlv-kv', url }, 'jwt-design')
    const r1 = await link(`https://drive.google.com/file/d/${outside.id}/view`)
    expect(r1.status).toBe(403)
    expect((await r1.json()).error.message).toContain('MICE Communicator 폴더 밖')
    expect((await link(`https://drive.google.com/drive/folders/${s.drive.rootId}`)).status).toBe(422)
    expect((await link('https://example.com/x')).status).toBe(400)
    const hidden = s.drive.add({ name: 'secret.pdf', parents: [s.drive.rootId] })
    s.drive.hidden.add(hidden.id)
    expect((await link(`https://drive.google.com/file/d/${hidden.id}/view`)).status).toBe(404)
  })

  it('바로가기(shortcut)는 대상 파일로 판정한다 — 루트 밖을 가리키면 403', async () => {
    const s = setup()
    const target = s.drive.add({ name: 'private.pdf', parents: [s.drive.outsideId], mimeType: 'application/pdf' })
    const sc = s.drive.add({ name: 'private 바로가기', parents: [s.drive.rootId], mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: target.id } })
    const r = await s.post({ action: 'link', deliverable_id: 'dlv-kv', url: `https://drive.google.com/file/d/${sc.id}/view` }, 'jwt-design')
    expect(r.status).toBe(403)
  })

  it('같은 항목에 같은 파일 두 번 → 409 · 권한 없는 역할 → 403', async () => {
    const s = setup()
    const tree = await s.clientAs('jwt-pm').ensureTree('prj-1')
    const f = s.drive.add({ name: 'a.pdf', parents: [tree.folder_id], mimeType: 'application/pdf' })
    const url = `https://drive.google.com/file/d/${f.id}/view`
    await s.clientAs('jwt-design').link('dlv-kv', url)
    expect((await s.post({ action: 'link', deliverable_id: 'dlv-kv', url }, 'jwt-design')).status).toBe(409)
    expect((await s.post({ action: 'link', deliverable_id: 'dlv-kv', url }, 'jwt-reg')).status).toBe(403)
  })
})

describe('DoD 61 · ④ 서명 스트림 (§7.4)', () => {
  async function uploaded(s: ReturnType<typeof setup>, name: string, mime: string, content: Uint8Array) {
    const v = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([content], { type: mime }), fileName: name, originalFileName: name })
    const urls = await s.clientAs('jwt-design').fileUrls([v.id, 'ver-없음'])
    return { v, url: urls[v.id]!, missing: urls['ver-없음'] }
  }

  it('보이는 버전만 서명 URL · PDF는 inline(샌드박스 CSP 없음) · 원본 바이트 그대로', async () => {
    const s = setup()
    const content = bytes(2048)
    const { url, missing } = await uploaded(s, 'a.pdf', 'application/pdf', content)
    expect(missing).toBeNull()
    expect(url.startsWith('/api/drive?action=stream&t=')).toBe(true)
    const r = await s.appFetch(url)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/pdf')
    expect(r.headers.get('content-disposition')).toMatch(/^inline;/)
    expect(r.headers.get('content-security-policy')).toBeNull()
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(content)
  })

  it('HTML·SVG 같은 형식은 내려받기(attachment) + sandbox CSP — 우리 도메인에서 스크립트가 돌지 않는다', async () => {
    const s = setup()
    const { url } = await uploaded(s, 'x.html', 'text/html', new TextEncoder().encode('<script>alert(1)</script>'))
    const r = await s.appFetch(url)
    expect(r.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(r.headers.get('content-security-policy')).toContain('sandbox')
  })

  it('Range는 206으로 전달 · 만료 410 · 위조 403 · 비멤버는 URL을 받지 못함', async () => {
    const s = setup()
    const { v, url } = await uploaded(s, 'v.mp4', 'video/mp4', bytes(4000))
    const part = await s.appFetch(url, { headers: { range: 'bytes=100-199' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 100-199/4000')
    expect((await part.arrayBuffer()).byteLength).toBe(100)
    expect((await s.appFetch(url.replace(/t=./, 't=Z'))).status).toBe(403)
    s.db.addUser({ jwt: 'jwt-out', authUserId: 'auth-out', email: 'o@example.com', profileId: 'p-out', appRole: 'staff' })
    expect((await s.clientAs('jwt-out').fileUrls([v.id]))[v.id]).toBeNull()
    s.advance(2 * 3600 * 1000)
    expect((await s.appFetch(url)).status).toBe(410)
  })

  it('100MB 초과는 413 · 구글 문서는 PDF로 내보내 보여 준다', async () => {
    const s = setup()
    const key = signingKey(s.env)
    const huge = s.drive.add({ name: 'raw.psd', parents: [s.drive.rootId], mimeType: 'image/vnd.adobe.photoshop' })
    Object.defineProperty(huge, 'content', { value: { length: 101 * 1024 * 1024 } })
    const t1 = signToken({ k: 'st', f: huge.id, n: 'raw.psd' }, key, 600, Date.parse('2026-09-24T10:00:00Z'))
    expect((await s.appFetch(`/api/drive?action=stream&t=${t1}`)).status).toBe(413)
    const doc = s.drive.add({ name: '운영계획', parents: [s.drive.rootId], mimeType: 'application/vnd.google-apps.document' })
    const t2 = signToken({ k: 'st', f: doc.id, n: '운영계획' }, key, 600, Date.parse('2026-09-24T10:00:00Z'))
    const r = await s.appFetch(`/api/drive?action=stream&t=${t2}`)
    expect(r.headers.get('content-type')).toBe('application/pdf')
    expect(r.headers.get('content-disposition')).toContain("filename*=UTF-8''%EC%9A%B4%EC%98%81%EA%B3%84%ED%9A%8D.pdf")
    expect(await r.text()).toContain('%PDF-export-of-운영계획')
  })

  it('발주처 토큰은 SQL이 정한 버전만 서명 URL을 받는다 · 없는 토큰 404', async () => {
    const s = setup()
    const v = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([bytes(10)]), fileName: 'c.pdf', originalFileName: 'c.pdf' })
    s.db.deliverables.get('dlv-kv')!.status = 'pending_approval'
    s.db.approvals.set('apr-1', { id: 'apr-1', deliverable_id: 'dlv-kv', version_id: v.id, decision: null })
    const token = '11111111-2222-3333-4444-555555555555'
    s.db.clientTokens.set(token, 'prj-1')
    const urls = await s.clientAs(null).clientFileUrls(token)
    expect(Object.keys(urls)).toEqual([v.id])
    expect((await s.appFetch(urls[v.id]!)).status).toBe(200)
    await expect(s.clientAs(null).clientFileUrls('99999999-2222-3333-4444-555555555555')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('DoD 61 · ⑤ §7.5 확정 복사 — 06_발주처공유 복사 성공 후에만 final', () => {
  async function approved(s: ReturnType<typeof setup>) {
    const v = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([bytes(64)]), fileName: '확정본.pdf', originalFileName: '확정본.pdf' })
    s.db.deliverables.get('dlv-kv')!.status = 'approved'
    s.db.approvals.set('apr-1', { id: 'apr-1', deliverable_id: 'dlv-kv', version_id: v.id, decision: 'approved' })
    const token = '11111111-2222-3333-4444-555555555555'
    s.db.clientTokens.set(token, 'prj-1')
    return { v, token }
  }

  it('복사 → 마감 순서 · 복사본은 06에 · 다시 불러도 사본 1개(멱등)', async () => {
    const s = setup()
    const { v, token } = await approved(s)
    const r = await s.clientAs(null).clientFinalize(token, 'apr-1')
    expect(r.status).toBe('final')
    expect(s.db.deliverables.get('dlv-kv')!.status).toBe('final')
    const root = s.db.projects.get('prj-1')!.drive_root_folder_id!
    const share = s.drive.childNamed(root, '06_발주처공유')!
    const copies = s.drive.childrenOf(share.id)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ name: '확정본.pdf' })
    expect(copies[0].appProperties.communicator_snapshot).toBe(v.id)
    expect(s.db.finalizeCalls).toEqual([{ deliverableId: 'dlv-kv', snapshotFileId: copies[0].id }])
    // 이미 final → 할 일 없음
    expect((await s.clientAs(null).clientFinalize(token, 'apr-1')).status).toBe('noop')
  })

  it('복사가 3회 실패하면 approved 유지 + 실패 로그, 다음 스캔이 재시도해 final', async () => {
    const s = setup()
    const { token } = await approved(s)
    s.drive.failNextCopies(3)
    const r = await s.clientAs(null).clientFinalize(token, 'apr-1')
    expect(r.status).toBe('pending')
    expect(s.db.deliverables.get('dlv-kv')!.status).toBe('approved')
    expect(s.db.finalizeCalls).toEqual([])
    expect(s.db.logs.some((l) => l.action === 'drive.snapshot_failed')).toBe(true)
    const scan = await s.clientAs('jwt-pm').scan('prj-1')
    expect(scan.finalized).toBe(1)
    expect(s.db.deliverables.get('dlv-kv')!.status).toBe('final')
  })

  it('Drive에 없는 버전(Phase 4 자리표시)·사라진 원본은 복사 없이 마감 — approved에 묶이지 않는다', async () => {
    const s = setup()
    const { v, token } = await approved(s)
    s.db.versions.find((x) => x.id === v.id)!.drive_file_id = 'pending:1234'
    expect((await s.clientAs(null).clientFinalize(token, 'apr-1')).status).toBe('final')
    expect(s.db.finalizeCalls[0].snapshotFileId).toBeNull()
  })
})

describe('DoD 61 · ⑥ 인박스 스캔 (§7.3 — 행사 폴더 목록 비교)', () => {
  it('직접 올린 파일만 인박스로 — 등록된 버전·06·99·진행 중 업로드 제외 · 경로 표기 · 사라진 파일 정리', async () => {
    const s = setup()
    const tree = await s.clientAs('jwt-pm').ensureTree('prj-1')
    const registered = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([bytes(5)]), fileName: 'r.pdf', originalFileName: 'r.pdf' })
    const itemFolder = s.drive.files.get(registered.drive_file_id)!.parents[0]
    const direct = s.drive.add({ name: '직접올림_시안B.pdf', parents: [itemFolder], mimeType: 'application/pdf' })
    s.drive.add({ name: '사본.pdf', parents: [s.drive.childNamed(tree.folder_id, '06_발주처공유')!.id] })
    s.drive.add({ name: '옛것.pdf', parents: [s.drive.childNamed(tree.folder_id, '99_archive')!.id] })
    s.drive.add({ name: '올리는중.pdf', parents: [itemFolder], appProperties: { communicator_upload: 'n1' } })
    s.db.inbox.push({ id: 'inb-gone', project_id: 'prj-1', drive_file_id: 'DELETED_FILE_ID_000000000000001', file_name: 'x', detected_folder: 'x', linked: null, dismissed: false })
    const r = await s.clientAs('jwt-pm').scan('prj-1')
    expect(r).toMatchObject({ added: 1, removed: 1 })
    const row = s.db.inbox.find((x) => x.drive_file_id === direct.id)!
    expect(row.detected_folder).toBe('05_산출물/디자인/메인 키비주얼')
    expect(s.db.inbox.find((x) => x.id === 'inb-gone')!.dismissed).toBe(true)
    // 두 번째 스캔은 중복 없이 0건
    expect((await s.clientAs('jwt-pm').scan('prj-1')).added).toBe(0)
  })

  it('행사 폴더가 아직 없으면 건너뛴다(no_tree)', async () => {
    const s = setup()
    expect((await s.clientAs('jwt-pm').scan('prj-1')).skipped).toBe('no_tree')
  })
})

describe('DoD 61 · ⑦ OAuth 연결 (관리자 · 갱신 토큰은 Vault)', () => {
  it('oauth-start는 admin만 — offline·consent·서명 state가 붙은 구글 동의 URL', async () => {
    const s = setup()
    s.db.refreshToken = null
    expect((await s.post({ action: 'oauth-start' }, 'jwt-pm')).status).toBe(403)
    const { url, redirect_uri } = await s.clientAs('jwt-admin').oauthStart()
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive')
    expect(redirect_uri).toBe(`${BASE}/api/drive`)
    expect(u.searchParams.get('state')).toBeTruthy()
  })

  it('콜백: 코드 교환 → 루트 쓰기 확인 → Vault 저장 → 00_견적서·99_archive → /settings?drive=connected', async () => {
    const s = setup()
    s.db.refreshToken = null
    const { url } = await s.clientAs('jwt-admin').oauthStart()
    const state = new URL(url).searchParams.get('state')!
    const r = await handleDriveRequest(new Request(`${BASE}/api/drive?code=good-code&state=${encodeURIComponent(state)}`), s.env, s.deps)
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/settings?drive=connected')
    expect(s.db.refreshToken).toBe('refresh-token-1')
    expect((await s.db.store.connectionInfo())?.account_email).toBe('owner@company.example')
    expect(s.drive.childNamed(s.drive.rootId, '00_견적서')).toBeTruthy()
    expect(s.drive.childNamed(s.drive.rootId, '99_archive')).toBeTruthy()
    const status = await s.clientAs('jwt-admin').status()
    expect(status).toMatchObject({ configured: true, connected: true, token_source: 'vault', account_email: 'owner@company.example' })
  })

  it('콜백 실패 사유: 위조 state · 거부 · 루트에 못 쓰는 계정 → 저장하지 않는다', async () => {
    const s = setup()
    s.db.refreshToken = null
    const go = (q: string) => handleDriveRequest(new Request(`${BASE}/api/drive?${q}`), s.env, s.deps)
    expect((await go('code=good-code&state=forged')).headers.get('location')).toBe('/settings?drive=error&reason=state')
    const { url } = await s.clientAs('jwt-admin').oauthStart()
    const state = encodeURIComponent(new URL(url).searchParams.get('state')!)
    expect((await go(`error=access_denied&state=${state}`)).headers.get('location')).toBe('/settings?drive=error&reason=denied')
    s.drive.files.get(s.drive.rootId)!.capabilities = { canAddChildren: false }
    expect((await go(`code=good-code&state=${state}`)).headers.get('location')).toBe('/settings?drive=error&reason=root_access')
    expect(s.db.refreshToken).toBeNull()
  })

  it('갱신 토큰이 취소되면(invalid_grant) 503 + 연결 오류 기록 · 연결 해제는 admin', async () => {
    const s = setup()
    s.drive.setInvalidGrant(true)
    const r = await s.post({ action: 'ensure-tree', project_id: 'prj-1' }, 'jwt-pm')
    expect(r.status).toBe(503)
    expect((await s.db.store.connectionInfo())?.last_error).toContain('다시 연결')
    expect((await s.post({ action: 'disconnect' }, 'jwt-pm')).status).toBe(403)
    expect((await s.post({ action: 'disconnect' }, 'jwt-admin')).status).toBe(200)
    expect(s.db.refreshToken).toBeNull()
    expect(s.db.driveEnabled).toBe(false)
  })

  it('status는 로그인 필요 · 비관리자에게 redirect_uri를 주지 않는다', async () => {
    const s = setup()
    expect((await s.post({ action: 'status' })).status).toBe(401)
    const st = await s.clientAs('jwt-design').status()
    expect(st.redirect_uri).toBeNull()
    expect(st.can_connect).toBe(false)
    expect(st.root_url).toBe(`https://drive.google.com/drive/folders/${s.drive.rootId}`)
  })
})

describe('DoD 61 · ⑧ 행사 폴더 지정·보관', () => {
  it('pm이 루트 안 기존 폴더를 지정 → 표식·파트 폴더 채움 · 다른 행사 폴더 409 · 루트/예약/루트 밖 거부', async () => {
    const s = setup()
    const manual = s.drive.add({ name: '가상컨퍼런스(수동)', parents: [s.drive.rootId], mimeType: FOLDER })
    const url = `https://drive.google.com/drive/folders/${manual.id}`
    expect((await s.post({ action: 'adopt-folder', project_id: 'prj-1', url }, 'jwt-design')).status).toBe(403)
    const r = await s.clientAs('jwt-pm').adoptFolder('prj-1', url)
    expect(r.folder_id).toBe(manual.id)
    expect(manual.appProperties.communicator_project_id).toBe('prj-1')
    expect(s.drive.childNamed(manual.id, '05_산출물')).toBeTruthy()
    s.db.addProject({ id: 'prj-2', code: 'B', name: 'B', event_date: null, status: 'active', drive_root_folder_id: null })
    s.db.addMember('p-pm', 'prj-2', 'pm')
    expect((await s.post({ action: 'adopt-folder', project_id: 'prj-2', url }, 'jwt-pm')).status).toBe(409)
    expect((await s.post({ action: 'adopt-folder', project_id: 'prj-2', url: `https://drive.google.com/drive/folders/${s.drive.rootId}` }, 'jwt-pm')).status).toBe(422)
    const quote = s.drive.add({ name: '00_견적서', parents: [s.drive.rootId], mimeType: FOLDER })
    expect((await s.post({ action: 'adopt-folder', project_id: 'prj-2', url: `https://drive.google.com/drive/folders/${quote.id}` }, 'jwt-pm')).status).toBe(422)
    const out = s.drive.add({ name: '밖', parents: [s.drive.outsideId], mimeType: FOLDER })
    expect((await s.post({ action: 'adopt-folder', project_id: 'prj-2', url: `https://drive.google.com/drive/folders/${out.id}` }, 'jwt-pm')).status).toBe(403)
  })

  it('행사 삭제 후 보관: admin만 · 루트 99_archive로 이동 + "(삭제됨 YYMMDD)" · 파일은 지우지 않음 · 아직 쓰는 폴더 409', async () => {
    const s = setup()
    const tree = await s.clientAs('jwt-pm').ensureTree('prj-1')
    const inside = s.drive.add({ name: 'keep.pdf', parents: [tree.folder_id] })
    expect((await s.post({ action: 'archive-project', folder_id: tree.folder_id, project_name: '가상 컨퍼런스' }, 'jwt-admin')).status).toBe(409)
    s.db.projects.delete('prj-1') // delete_project 이후
    expect((await s.post({ action: 'archive-project', folder_id: tree.folder_id, project_name: '가상 컨퍼런스' }, 'jwt-pm')).status).toBe(403)
    const r = await s.clientAs('jwt-admin').archiveProject(tree.folder_id, '가상 컨퍼런스')
    expect(r.archived).toBe(true)
    const moved = s.drive.files.get(tree.folder_id)!
    expect(moved.name).toBe('가상 컨퍼런스 (삭제됨 260924)')
    expect(s.drive.files.get(moved.parents[0])!.name).toBe('99_archive')
    expect(s.drive.files.get(inside.id)!.trashed).toBe(false)
  })
})

describe('DoD 61 · ⑨ 견적 시트는 저장소 00_견적서로 (Phase 4.2 연동)', () => {
  it('OAuth 저장소가 연결돼 있으면 00_견적서(없으면 생성)에 변환 업로드 · 요청자 개별 공유 없음', async () => {
    const s = setup()
    const fakeUser = { auth: { getUser: async () => ({ data: { user: { id: 'auth-1', email: 'sales@example.com' } }, error: null }) } }
    const admin = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', app_role: 'sales' }, error: null }) }) }) }),
      rpc: async (fn: string) => (fn === 'drive_token_read' ? { data: 'refresh-token-1', error: null } : { data: null, error: null }),
    }
    const r = await createQuoteSpreadsheetOnDrive(
      { file_name: '리멤버견적서_샘플.xlsx', xlsx_base64: Buffer.from('PK-fake').toString('base64') },
      'tok',
      s.env,
      { userClient: () => fakeUser as never, adminClient: () => admin as never, fetchImpl: s.drive.fetch },
    )
    const quoteFolder = s.drive.childNamed(s.drive.rootId, '00_견적서')!
    expect(s.drive.files.get(r.spreadsheet_id)!.parents).toEqual([quoteFolder.id])
    expect(s.drive.files.get(r.spreadsheet_id)!.mimeType).toBe('application/vnd.google-apps.spreadsheet')
    expect(r.shared_with).toBeNull()
  })
})

describe('DoD 61 · ⑩ 공유 권한을 바꾸는 호출 0건 (CLAUDE.md §6 — anyone 링크 금지)', () => {
  it('트리·업로드·링크·스트림·확정·스캔·연결 전 흐름에서 /permissions 호출이 없다 + 소스에 permissions 호출 코드가 없다', async () => {
    const s = setup()
    const tree = await s.clientAs('jwt-pm').ensureTree('prj-1')
    const v = await s.clientAs('jwt-design').upload({ deliverableId: 'dlv-kv', file: new Blob([bytes(10)]), fileName: 'p.pdf', originalFileName: 'p.pdf' })
    const f = s.drive.add({ name: 'l.pdf', parents: [s.drive.rootId] })
    await s.clientAs('jwt-design').link('dlv-kv', `https://drive.google.com/file/d/${f.id}/view`)
    const urls = await s.clientAs('jwt-design').fileUrls([v.id])
    await s.appFetch(urls[v.id]!)
    await s.clientAs('jwt-pm').scan('prj-1')
    expect(tree.folder_id).toBeTruthy()
    expect(s.drive.calls.filter((c) => c.url.includes('/permissions'))).toEqual([])
    const { readFileSync, readdirSync } = await import('node:fs')
    const dir = new URL('../../api/_lib/drive/', import.meta.url)
    for (const name of readdirSync(dir)) {
      const src = readFileSync(new URL(name, dir), 'utf8')
      expect(src.includes('/permissions'), name).toBe(false)
      expect(/anyoneWithLink|"anyone"|'anyone'/.test(src), name).toBe(false)
    }
  })
})
