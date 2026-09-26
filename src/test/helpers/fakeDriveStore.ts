// 가짜 DriveStore(메모리) — api/_lib/drive 계약 테스트용. 규칙은 SQL 정본(assert_can_upload·upload_version·
// client_snapshot_target·finalize_approved)을 그대로 흉내 낸다 — 실 DB 판정은 supabase:check(로컬 Postgres)가 증명한다.
import type {
  AppRole,
  ClientFileRow,
  DeliverableRow,
  DriveStore,
  MemberRole,
  ProjectRow,
  RegisterVersionArgs,
  SnapshotTarget,
  VersionRow,
} from '../../../api/_lib/drive/store'
import { DriveError } from '../../../api/_lib/drive/errors'

export interface FakeUser {
  jwt: string
  authUserId: string
  email: string
  profileId: string
  appRole: AppRole
}

export function createFakeDriveStore() {
  const users = new Map<string, FakeUser>()
  const members = new Map<string, MemberRole>()
  const projects = new Map<string, ProjectRow>()
  const deliverables = new Map<string, DeliverableRow & { partner_id: string | null }>()
  const versions: VersionRow[] = []
  const inbox: { id: string; project_id: string; drive_file_id: string; file_name: string; detected_folder: string; linked: string | null; dismissed: boolean }[] = []
  const logs: { projectId: string; action: string; targetId: string | null; meta?: Record<string, unknown> }[] = []
  const clientTokens = new Map<string, string>() // token → project_id
  const settlementImports = new Map<string, { project_id: string; file_name: string; status: 'parsed' | 'confirmed' | 'discarded'; drive_file_id: string | null }>()
  const approvals = new Map<string, { id: string; deliverable_id: string; version_id: string; decision: 'approved' | 'changes_requested' | null }>()
  let refreshToken: string | null = null
  let connection: { account_email: string | null; connected_at: string | null; last_error: string | null; last_error_at: string | null } | null = null
  let driveEnabled = false
  const finalizeCalls: { deliverableId: string; snapshotFileId: string | null }[] = []
  let seq = 0

  const userByJwt = (jwt: string) => users.get(jwt) ?? null

  const store: DriveStore = {
    async authUser(jwt) {
      const u = userByJwt(jwt)
      return u ? { authUserId: u.authUserId, email: u.email } : null
    },
    async profileByAuth(authUserId) {
      const u = [...users.values()].find((x) => x.authUserId === authUserId)
      return u ? { id: u.profileId, app_role: u.appRole } : null
    },
    async memberRole(profileId, projectId) {
      return members.get(`${profileId}:${projectId}`) ?? null
    },
    async project(projectId) {
      const p = projects.get(projectId)
      return p ? { ...p } : null
    },
    async projectByRoot(folderId) {
      const p = [...projects.values()].find((x) => x.drive_root_folder_id === folderId)
      return p ? { id: p.id } : null
    },
    async settlementFileCheck(jwt, importId) {
      const u = userByJwt(jwt)
      const imp = settlementImports.get(importId)
      if (!imp) throw new DriveError(404, 'not_found', '견적서 가져오기를 찾을 수 없습니다.')
      const role = u ? members.get(`${u.profileId}:${imp.project_id}`) : undefined
      if (role !== 'pm') throw new DriveError(403, 'forbidden', 'PM 전용 기능입니다.')
      if (imp.status !== 'parsed') throw new DriveError(409, 'conflict', '이미 확정했거나 버린 견적서입니다 — 다시 불러오세요.')
      return { import_id: importId, file_name: imp.file_name, project: { ...projects.get(imp.project_id)! } }
    },
    async setSettlementImportFile(importId, fileId) {
      settlementImports.get(importId)!.drive_file_id = fileId
    },
    async projectFileCheck(jwt, projectId) {
      const u = userByJwt(jwt)
      const p = projects.get(projectId)
      if (!p) throw new DriveError(404, 'not_found', '프로젝트를 찾을 수 없습니다.')
      const role = u ? members.get(`${u.profileId}:${projectId}`) : undefined
      if (role !== 'pm') throw new DriveError(403, 'forbidden', 'PM 전용 기능입니다.')
      if (p.status === 'closed') throw new DriveError(409, 'conflict', '종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.')
      return { ...p }
    },
    async deliverableExists(deliverableId) {
      return deliverables.has(deliverableId)
    },
    async uploadCheck(jwt, deliverableId) {
      const u = userByJwt(jwt)
      const d = deliverables.get(deliverableId)
      if (!d) throw new DriveError(404, 'not_found', '항목을 찾을 수 없습니다.')
      const role = u ? members.get(`${u.profileId}:${d.project_id}`) : null
      if (!u || !role) throw new DriveError(403, 'forbidden', '프로젝트 멤버가 아닙니다.')
      const p = projects.get(d.project_id)!
      if (p.status === 'closed') throw new DriveError(409, 'conflict', '종료된 행사는 수정할 수 없습니다')
      if (!(role === 'pm' || ((role === 'design' || role === 'ops') && d.area === role))) {
        throw new DriveError(403, 'forbidden', '해당 영역에 대한 쓰기 권한이 없습니다.')
      }
      if (!['requested', 'draft', 'internal_review', 'changes_requested'].includes(d.status)) {
        throw new DriveError(409, 'conflict', `현재 상태(${d.status})에서는 업로드할 수 없습니다.`)
      }
      return { deliverable: { ...d }, project: { ...p } }
    },
    async registerVersion(jwt, a: RegisterVersionArgs) {
      await store.uploadCheck(jwt, a.deliverable_id)
      if (versions.some((v) => v.deliverable_id === a.deliverable_id && v.drive_file_id === a.drive_file_id)) {
        throw new DriveError(409, 'conflict', '이미 이 항목에 등록된 파일입니다.')
      }
      const d = deliverables.get(a.deliverable_id)!
      const no = Math.max(0, ...versions.filter((v) => v.deliverable_id === a.deliverable_id).map((v) => v.version_no)) + 1
      const v: VersionRow = {
        id: `ver-${++seq}`,
        deliverable_id: a.deliverable_id,
        version_no: no,
        drive_file_id: a.drive_file_id,
        file_name: a.file_name,
        note: a.note,
        uploaded_by: userByJwt(jwt)!.profileId,
        created_at: '2026-09-24T10:00:00+00:00',
      }
      versions.push(v)
      for (const r of inbox) if (r.drive_file_id === a.drive_file_id && r.project_id === d.project_id && !r.linked) r.linked = a.deliverable_id
      if (d.status === 'requested' || d.status === 'changes_requested') d.status = 'draft'
      return v
    },
    async visibleVersions(jwt, ids) {
      const u = userByJwt(jwt)
      if (!u) return []
      return versions
        .filter((v) => ids.includes(v.id))
        .filter((v) => members.has(`${u.profileId}:${deliverables.get(v.deliverable_id)?.project_id}`))
        .map((v) => ({ id: v.id, drive_file_id: v.drive_file_id, file_name: v.file_name }))
    },
    async setProjectRoot(projectId, folderId) {
      projects.get(projectId)!.drive_root_folder_id = folderId
    },
    async setItemFolder(deliverableId, folderId) {
      deliverables.get(deliverableId)!.drive_folder_id = folderId
    },
    async knownFileIds(projectId) {
      const ids = new Set<string>()
      for (const v of versions) if (deliverables.get(v.deliverable_id)?.project_id === projectId) ids.add(v.drive_file_id)
      for (const r of inbox) if (r.project_id === projectId) ids.add(r.drive_file_id)
      // v15 — 정산 가져오기 원본(SQL drive_known_file_ids 재정의와 같은 범위)
      for (const i of settlementImports.values()) if (i.project_id === projectId && i.drive_file_id) ids.add(i.drive_file_id)
      return ids
    },
    async openInbox(projectId) {
      return inbox.filter((r) => r.project_id === projectId && !r.dismissed && !r.linked).map((r) => ({ id: r.id, drive_file_id: r.drive_file_id }))
    },
    async insertInbox(projectId, rows) {
      let n = 0
      for (const r of rows) {
        if (inbox.some((x) => x.drive_file_id === r.drive_file_id)) continue
        inbox.push({ id: `inb-${++seq}`, project_id: projectId, ...r, linked: null, dismissed: false })
        n++
      }
      return n
    },
    async dismissInbox(ids) {
      for (const r of inbox) if (ids.includes(r.id)) r.dismissed = true
    },
    async clientFileVersions(token) {
      const projectId = clientTokens.get(token)
      if (!projectId) throw new DriveError(404, 'not_found', '유효하지 않은 링크입니다.')
      const rows: ClientFileRow[] = []
      for (const a of approvals.values()) {
        const d = deliverables.get(a.deliverable_id)!
        if (d.project_id !== projectId) continue
        if (a.decision === null && d.status === 'pending_approval') {
          const v = versions.find((x) => x.id === a.version_id)!
          rows.push({ version_id: v.id, drive_file_id: v.drive_file_id, file_name: v.file_name })
        }
      }
      return rows
    },
    async clientSnapshotTarget(token, approvalId) {
      const projectId = clientTokens.get(token)
      if (!projectId) throw new DriveError(404, 'not_found', '유효하지 않은 링크입니다.')
      const a = approvals.get(approvalId)
      if (!a) throw new DriveError(404, 'not_found', '컨펌 요청을 찾을 수 없습니다.')
      const d = deliverables.get(a.deliverable_id)!
      if (d.project_id !== projectId) throw new DriveError(403, 'forbidden', '이 링크로 처리할 수 없는 항목입니다.')
      if (a.decision !== 'approved' || d.status !== 'approved') return null
      return target(d.id, a.version_id)
    },
    async pendingSnapshots(projectId) {
      const out: SnapshotTarget[] = []
      for (const d of deliverables.values()) {
        if (d.project_id !== projectId || d.status !== 'approved') continue
        const a = [...approvals.values()].reverse().find((x) => x.deliverable_id === d.id && x.decision === 'approved')
        if (a) out.push(target(d.id, a.version_id))
      }
      return out
    },
    async finalizeApproved(deliverableId, snapshotFileId) {
      finalizeCalls.push({ deliverableId, snapshotFileId })
      const d = deliverables.get(deliverableId)!
      if (d.status !== 'approved') return
      d.status = 'final'
      logs.push({ projectId: d.project_id, action: snapshotFileId ? 'drive.snapshot_copied' : 'drive.snapshot_skipped', targetId: deliverableId, meta: { snapshot_file_id: snapshotFileId } })
    },
    async readRefreshToken() {
      return refreshToken
    },
    async saveConnection({ refreshToken: t, accountEmail }) {
      refreshToken = t
      connection = { account_email: accountEmail, connected_at: '2026-09-24T10:00:00Z', last_error: null, last_error_at: null }
    },
    async clearConnection() {
      refreshToken = null
      connection = null
    },
    async connectionInfo() {
      return connection
    },
    async recordConnectionError(message) {
      connection = { ...(connection ?? { account_email: null, connected_at: null }), last_error: message, last_error_at: '2026-09-24T10:00:00Z' }
    },
    async setDriveEnabled(enabled) {
      driveEnabled = enabled
    },
    async log(projectId, action, _targetType, targetId, meta) {
      logs.push({ projectId, action, targetId, meta })
    },
  }

  function target(deliverableId: string, versionId: string): SnapshotTarget {
    const d = deliverables.get(deliverableId)!
    const v = versions.find((x) => x.id === versionId)!
    return { deliverable_id: d.id, version_id: v.id, drive_file_id: v.drive_file_id, file_name: v.file_name, project: { ...projects.get(d.project_id)! } }
  }

  return {
    store,
    users,
    members,
    projects,
    deliverables,
    versions,
    inbox,
    logs,
    clientTokens,
    settlementImports,
    approvals,
    finalizeCalls,
    get refreshToken() {
      return refreshToken
    },
    set refreshToken(t: string | null) {
      refreshToken = t
    },
    get driveEnabled() {
      return driveEnabled
    },
    addUser(u: FakeUser) {
      users.set(u.jwt, u)
      return u
    },
    addProject(p: ProjectRow) {
      projects.set(p.id, p)
      return p
    },
    addMember(profileId: string, projectId: string, role: MemberRole) {
      members.set(`${profileId}:${projectId}`, role)
    },
    addDeliverable(d: DeliverableRow & { partner_id?: string | null }) {
      const row = { partner_id: null, ...d }
      deliverables.set(d.id, row)
      return row
    },
  }
}

export type FakeDriveStore = ReturnType<typeof createFakeDriveStore>
