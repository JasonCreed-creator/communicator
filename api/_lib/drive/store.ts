// Drive 서버 함수의 DB 경계 — 인터페이스(DriveStore)와 Supabase 구현.
// 사용자 권한이 걸린 판정(업로드 가능 여부·버전 등록·버전 가시성)은 **사용자 JWT로** RPC·RLS를 탄다 — 서버가 권한을
// 새로 발명하지 않고 기존 SQL 정본(§6.1 역할-영역·§5 상태·종료 행사 409)을 그대로 쓴다. 폴더 id 기록·인박스 적재·
// 토큰 경로(`/c`) 파일 목록·확정 마감처럼 사람 권한과 무관한 시스템 작업만 service 경로(secret 키)를 쓴다.
// 테스트는 이 인터페이스의 메모리 구현으로 돈다(src/test/helpers/fakeDriveStore.ts).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DriveError, type DriveErrorCode } from './errors.js'

export type AppRole = 'admin' | 'sales' | 'staff'
export type MemberRole = 'pm' | 'design' | 'ops' | 'reg'

export interface ProjectRow {
  id: string
  code: string
  name: string
  event_date: string | null
  status: 'active' | 'closed'
  drive_root_folder_id: string | null
}

export interface DeliverableRow {
  id: string
  project_id: string
  area: 'design' | 'ops' | 'common'
  category: string
  title: string
  status: string
  drive_folder_id: string | null
}

export interface UploadTarget {
  deliverable: DeliverableRow
  project: ProjectRow
}

export interface VersionRow {
  id: string
  deliverable_id: string
  version_no: number
  drive_file_id: string
  file_name: string
  note: string | null
  uploaded_by: string | null
  created_at: string
}

export interface SnapshotTarget {
  deliverable_id: string
  version_id: string
  drive_file_id: string
  file_name: string
  project: ProjectRow
}

export interface ClientFileRow {
  version_id: string
  drive_file_id: string
  file_name: string
}

export interface ConnectionInfo {
  account_email: string | null
  connected_at: string | null
  last_error: string | null
  last_error_at: string | null
}

export interface RegisterVersionArgs {
  deliverable_id: string
  file_name: string
  note: string | null
  original_file_name: string
  drive_file_id: string
}

export interface DriveStore {
  authUser(jwt: string): Promise<{ authUserId: string; email: string | null } | null>
  profileByAuth(authUserId: string): Promise<{ id: string; app_role: AppRole } | null>
  memberRole(profileId: string, projectId: string): Promise<MemberRole | null>
  project(projectId: string): Promise<ProjectRow | null>
  projectByRoot(folderId: string): Promise<{ id: string } | null>
  /** v15 — 사용자 JWT로 `drive_settlement_file_check`: 협력사 견적서 원본을 올릴 수 있는가(pm · 확인 대기) + 행사 정보 */
  settlementFileCheck(jwt: string, importId: string): Promise<{ import_id: string; file_name: string; project: ProjectRow }>
  /** v15 — 원본 파일 id 기록(service) */
  setSettlementImportFile(importId: string, fileId: string): Promise<void>
  /** 항목이 아직 DB에 있는가 — 항목 폴더 보관(archive-item)은 지워진 항목에만 허용한다 */
  deliverableExists(deliverableId: string): Promise<boolean>
  /** 사용자 JWT로 `drive_upload_check` — upload_version과 같은 판정(404·403·409)을 바이트 전송 전에 */
  uploadCheck(jwt: string, deliverableId: string): Promise<UploadTarget>
  /** 사용자 JWT로 `upload_version` — 버전 번호·§5 자동 전이·로그·인박스 연결 표시는 SQL이 한다 */
  registerVersion(jwt: string, args: RegisterVersionArgs): Promise<VersionRow>
  /** 사용자 JWT(RLS)로 보이는 버전만 */
  visibleVersions(jwt: string, versionIds: string[]): Promise<{ id: string; drive_file_id: string; file_name: string }[]>
  setProjectRoot(projectId: string, folderId: string): Promise<void>
  setItemFolder(deliverableId: string, folderId: string): Promise<void>
  /** 이 행사가 이미 아는 Drive 파일 id — 버전 + 인박스(처리됨 포함) */
  knownFileIds(projectId: string): Promise<Set<string>>
  openInbox(projectId: string): Promise<{ id: string; drive_file_id: string }[]>
  insertInbox(projectId: string, rows: { drive_file_id: string; file_name: string; detected_folder: string }[]): Promise<number>
  dismissInbox(ids: string[]): Promise<void>
  clientFileVersions(token: string): Promise<ClientFileRow[]>
  clientSnapshotTarget(token: string, approvalId: string): Promise<SnapshotTarget | null>
  pendingSnapshots(projectId: string): Promise<SnapshotTarget[]>
  finalizeApproved(deliverableId: string, snapshotFileId: string | null): Promise<void>
  readRefreshToken(): Promise<string | null>
  saveConnection(args: { refreshToken: string; accountEmail: string | null; connectedBy: string | null }): Promise<void>
  clearConnection(): Promise<void>
  connectionInfo(): Promise<ConnectionInfo | null>
  recordConnectionError(message: string): Promise<void>
  setDriveEnabled(enabled: boolean): Promise<void>
  log(projectId: string, action: string, targetType: string, targetId: string | null, meta?: Record<string, unknown>): Promise<void>
}

export interface StoreEnv {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

// ── Postgres 오류 → DriveError (RPC는 'CODE: 메시지' + SQLSTATE P04xx로 던진다 — 1600·1700 규약) ──
const STATE: Record<string, [number, DriveErrorCode]> = {
  P0400: [400, 'validation'],
  P0403: [403, 'forbidden'],
  P0404: [404, 'not_found'],
  P0409: [409, 'conflict'],
  P0410: [410, 'gone'],
  P0422: [422, 'validation'],
  '42501': [403, 'forbidden'],
  '23505': [409, 'conflict'],
  '22P02': [404, 'not_found'],
  PGRST116: [404, 'not_found'],
}

export function pgToDriveError(err: { code?: string | null; message?: string } | null | undefined): DriveError {
  const raw = err?.message ?? '알 수 없는 DB 오류'
  const message = raw.replace(/^[A-Z_]+:\s*/, '') || raw
  const mapped = err?.code ? STATE[err.code] : undefined
  if (mapped) return new DriveError(mapped[0], mapped[1], message)
  if (/row-level security|permission denied/i.test(raw)) return new DriveError(403, 'forbidden', '이 작업을 수행할 권한이 없습니다.')
  return new DriveError(500, 'validation', message)
}

type Res<T> = { data: T | null; error: { code?: string | null; message?: string } | null }

function must<T>(res: Res<T>): T | null {
  if (res.error) throw pgToDriveError(res.error)
  return res.data
}

export function supabaseDriveStore(env: StoreEnv): DriveStore {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !secret || !publishable) {
    throw new DriveError(
      500,
      'validation',
      '서버 자격증명이 설정되지 않았습니다 (SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY).',
    )
  }
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin: SupabaseClient = createClient(url, secret, opts)
  const asUser = (jwt: string): SupabaseClient =>
    createClient(url, publishable, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } })

  return {
    async authUser(jwt) {
      const { data, error } = await asUser(jwt).auth.getUser(jwt)
      if (error || !data.user) return null
      return { authUserId: data.user.id, email: data.user.email ?? null }
    },
    async profileByAuth(authUserId) {
      return must(await admin.from('profiles').select('id, app_role').eq('auth_user_id', authUserId).maybeSingle()) as {
        id: string
        app_role: AppRole
      } | null
    },
    async memberRole(profileId, projectId) {
      const row = must(
        await admin.from('project_members').select('role').eq('project_id', projectId).eq('user_id', profileId).maybeSingle(),
      ) as { role: MemberRole } | null
      return row?.role ?? null
    },
    async project(projectId) {
      return must(
        await admin
          .from('projects')
          .select('id, code, name, event_date, status, drive_root_folder_id')
          .eq('id', projectId)
          .maybeSingle(),
      ) as ProjectRow | null
    },
    async projectByRoot(folderId) {
      const rows = must(await admin.from('projects').select('id').eq('drive_root_folder_id', folderId).limit(1)) as { id: string }[] | null
      return rows?.[0] ?? null
    },
    async settlementFileCheck(jwt, importId) {
      const res = await asUser(jwt).rpc('drive_settlement_file_check', { p_import: importId })
      const data = must(res as Res<{ import_id: string; file_name: string; project: ProjectRow }>)
      if (!data) throw new DriveError(404, 'not_found', '견적서 가져오기를 찾을 수 없습니다.')
      return data
    },
    async setSettlementImportFile(importId, fileId) {
      must(await admin.rpc('settlement_import_set_file', { p_import: importId, p_file: fileId }))
    },
    async deliverableExists(deliverableId) {
      return Boolean(must(await admin.from('deliverables').select('id').eq('id', deliverableId).maybeSingle()))
    },
    async uploadCheck(jwt, deliverableId) {
      const res = await asUser(jwt).rpc('drive_upload_check', { p_deliverable: deliverableId })
      const data = must(res as Res<UploadTarget>)
      if (!data) throw new DriveError(404, 'not_found', '항목을 찾을 수 없습니다.')
      return data
    },
    async registerVersion(jwt, a) {
      const res = await asUser(jwt).rpc('upload_version', {
        p_deliverable: a.deliverable_id,
        p_file_name: a.file_name,
        p_note: a.note,
        p_original_file_name: a.original_file_name,
        p_drive_file_id: a.drive_file_id,
      })
      const data = must(res as Res<VersionRow>)
      if (!data) throw new DriveError(500, 'validation', '버전을 등록하지 못했습니다.')
      return data
    },
    async visibleVersions(jwt, versionIds) {
      if (versionIds.length === 0) return []
      return (must(await asUser(jwt).from('versions').select('id, drive_file_id, file_name').in('id', versionIds)) ?? []) as {
        id: string
        drive_file_id: string
        file_name: string
      }[]
    },
    async setProjectRoot(projectId, folderId) {
      must(await admin.from('projects').update({ drive_root_folder_id: folderId }).eq('id', projectId))
    },
    async setItemFolder(deliverableId, folderId) {
      must(await admin.from('deliverables').update({ drive_folder_id: folderId }).eq('id', deliverableId))
    },
    async knownFileIds(projectId) {
      const ids = must(await admin.rpc('drive_known_file_ids', { p_project: projectId })) as string[] | null
      return new Set(ids ?? [])
    },
    async openInbox(projectId) {
      return (must(
        await admin
          .from('unregistered_files')
          .select('id, drive_file_id')
          .eq('project_id', projectId)
          .eq('dismissed', false)
          .is('linked_deliverable_id', null),
      ) ?? []) as { id: string; drive_file_id: string }[]
    },
    async insertInbox(projectId, rows) {
      if (rows.length === 0) return 0
      const payload = rows.map((r) => ({ project_id: projectId, ...r }))
      const inserted = must(
        await admin.from('unregistered_files').upsert(payload, { onConflict: 'drive_file_id', ignoreDuplicates: true }).select('id'),
      ) as { id: string }[] | null
      return inserted?.length ?? 0
    },
    async dismissInbox(ids) {
      if (ids.length === 0) return
      must(await admin.from('unregistered_files').update({ dismissed: true }).in('id', ids))
    },
    async clientFileVersions(token) {
      return (must(await admin.rpc('client_file_versions', { p_token: token })) ?? []) as ClientFileRow[]
    },
    async clientSnapshotTarget(token, approvalId) {
      return must(await admin.rpc('client_snapshot_target', { p_token: token, p_approval: approvalId })) as SnapshotTarget | null
    },
    async pendingSnapshots(projectId) {
      return (must(await admin.rpc('drive_pending_snapshots', { p_project: projectId })) ?? []) as SnapshotTarget[]
    },
    async finalizeApproved(deliverableId, snapshotFileId) {
      must(await admin.rpc('finalize_approved', { p_deliverable: deliverableId, p_snapshot_file_id: snapshotFileId }))
    },
    async readRefreshToken() {
      return must(await admin.rpc('drive_token_read')) as string | null
    },
    async saveConnection({ refreshToken, accountEmail, connectedBy }) {
      must(
        await admin.rpc('drive_connection_save', {
          p_refresh_token: refreshToken,
          p_account_email: accountEmail,
          p_connected_by: connectedBy,
        }),
      )
    },
    async clearConnection() {
      must(await admin.rpc('drive_connection_clear'))
    },
    async connectionInfo() {
      return must(
        await admin
          .from('drive_connection')
          .select('account_email, connected_at, last_error, last_error_at')
          .eq('id', 1)
          .maybeSingle(),
      ) as ConnectionInfo | null
    },
    async recordConnectionError(message) {
      try {
        must(await admin.rpc('drive_connection_error', { p_message: message.slice(0, 500) }))
      } catch (e) {
        console.warn('[drive] 연결 오류 기록 실패:', e instanceof Error ? e.message : e)
      }
    },
    async setDriveEnabled(enabled) {
      must(await admin.from('app_config').update({ drive_enabled: enabled }).eq('id', 1))
    },
    async log(projectId, action, targetType, targetId, meta) {
      const { error } = await admin.from('activity_log').insert({
        project_id: projectId,
        actor: 'system',
        action,
        target_type: targetType,
        target_id: targetId,
        meta: meta ?? null,
      })
      if (error) console.warn('[drive] activity_log 기록 실패:', error.message)
    },
  }
}
