// SupabaseProvider 공용 컨텍스트 — 세션(현재 프로필·행사 역할)·권한 단언·행사/항목 조회·활동 로그·RPC.
// 도메인 모듈(domains/*.ts)은 전부 이 컨텍스트만 통해 DB에 닿는다. 규칙(설계서 §6.1 매트릭스)은
// MockProvider와 같은 code·메시지로 먼저 앱 계층에서 판정하고, DB의 RLS·트리거가 같은 규칙을 이중 강제한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ProviderError } from '../../lib/errors'
import type { Deliverable, Project, UUID } from '../../types/entities'
import type { AppRole, DeliverableArea, MemberRole } from '../../types/enums'
import type { CurrentUser } from '../../types/views'
import { mapPgError, unwrap, type PgErrorLike } from './errors'
import type { SupabaseEnv } from './client'

/** 현재 로그인 사용자 = profiles 행(app 정본) + auth 연결 */
export interface Me {
  id: UUID
  auth_user_id: UUID
  name: string
  email: string | null
  title: string | null
  phone: string | null
  org: string | null
  app_role: AppRole
}

const CURRENT_PROJECT_KEY = 'communicator.currentProjectId'

const TIMESTAMPTZ_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:?\d{2})$/
const TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/

/**
 * PostgREST 행 → 도메인 타입 정규화. timestamptz는 '+00:00' 오프셋 표기로 오고 time은 'HH:MM:SS'라
 * TS 정본(ISO 'Z' · 'HH:MM')으로 맞춘다. jsonb 안의 값은 앱이 이미 정본 형태로 써 넣었으므로
 * 정규식에 걸리지 않는다(Z 표기는 오프셋 패턴이 아니다).
 */
export function normalizeRow<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (TIMESTAMPTZ_RE.test(value)) return new Date(value).toISOString() as unknown as T
    if (TIME_RE.test(value)) return value.slice(0, 5) as unknown as T
    return value
  }
  if (Array.isArray(value)) return value.map((v) => normalizeRow(v)) as unknown as T
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalizeRow(v)
    return out as T
  }
  return value
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): UUID {
  return crypto.randomUUID()
}

export class SupabaseCtx {
  private meCache: Me | null = null
  private roleCache = new Map<UUID, MemberRole | null>()

  constructor(
    public readonly sb: SupabaseClient,
    public readonly env: SupabaseEnv,
  ) {
    sb.auth.onAuthStateChange(() => this.invalidate())
  }

  invalidate(): void {
    this.meCache = null
    this.roleCache.clear()
  }

  /** 멤버십이 바뀐 뒤(추가·삭제·행사 생성) 역할 캐시만 비운다 */
  invalidateRoles(projectId?: UUID): void {
    if (projectId) this.roleCache.delete(projectId)
    else this.roleCache.clear()
  }

  /** PostgREST 응답 언랩 + 정규화 */
  q<T>(res: { data: T | null; error: PgErrorLike | null }, notFoundMessage?: string): T {
    return normalizeRow(unwrap(res, notFoundMessage))
  }

  /** 응답이 비어도 되는 조회(delete·update 등) */
  ok(res: { error: PgErrorLike | null }): void {
    if (res.error) throw mapPgError(res.error)
  }

  async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const res = await this.sb.rpc(fn, args ?? {})
    if (res.error) throw mapPgError(res.error)
    return normalizeRow(res.data as T)
  }

  // ── 세션 ──────────────────────────────────────────────────────────
  async me(): Promise<Me> {
    if (this.meCache) return this.meCache
    const { data, error } = await this.sb.auth.getUser()
    if (error || !data.user) throw new ProviderError('forbidden', '로그인이 필요합니다.')
    const row = this.q(
      await this.sb
        .from('profiles')
        .select('id, auth_user_id, display_name, email, title, phone, org, app_role')
        .eq('auth_user_id', data.user.id)
        .maybeSingle(),
      '프로필이 아직 준비되지 않았습니다 — 잠시 후 다시 시도하세요.',
    ) as {
      id: UUID
      auth_user_id: UUID
      display_name: string
      email: string
      title: string | null
      phone: string | null
      org: string | null
      app_role: AppRole
    }
    this.meCache = {
      id: row.id,
      auth_user_id: row.auth_user_id,
      name: row.display_name,
      email: row.email,
      title: row.title,
      phone: row.phone,
      org: row.org,
      app_role: row.app_role,
    }
    return this.meCache
  }

  currentProjectId(): UUID | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(CURRENT_PROJECT_KEY) : null
    } catch {
      return null
    }
  }

  async roleIn(projectId: UUID): Promise<MemberRole | null> {
    if (this.roleCache.has(projectId)) return this.roleCache.get(projectId) ?? null
    const me = await this.me()
    const { data, error } = await this.sb
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', me.id)
      .maybeSingle()
    if (error) throw mapPgError(error)
    const role = (data?.role as MemberRole | undefined) ?? null
    this.roleCache.set(projectId, role)
    return role
  }

  /**
   * 현재 사용자 + 현재 행사 역할. 현재 행사 = ProjectContext가 localStorage에 둔 선택값(멤버인 경우),
   * 없으면 첫 멤버십(등록순). 멤버십이 하나도 없는 새 사용자는 행사를 만들 수 있어야 하므로
   * 예외 대신 최소 권한(reg)·빈 project_id로 돌려준다 — RLS가 실제 권한을 판정한다.
   */
  async currentUser(): Promise<CurrentUser> {
    const me = await this.me()
    const rows = this.q(
      await this.sb
        .from('project_members')
        .select('project_id, role, projects!inner(created_at)')
        .eq('user_id', me.id),
    ) as { project_id: UUID; role: MemberRole; projects: { created_at: string } | { created_at: string }[] }[]
    const sorted = rows
      .map((r) => ({ project_id: r.project_id, role: r.role, created_at: (Array.isArray(r.projects) ? r.projects[0] : r.projects)?.created_at ?? '' }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const r of sorted) this.roleCache.set(r.project_id, r.role)
    const preferred = this.currentProjectId()
    const pick = sorted.find((r) => r.project_id === preferred) ?? sorted[0]
    return {
      id: me.id,
      name: me.name,
      email: me.email,
      title: me.title,
      phone: me.phone,
      role: pick?.role ?? 'reg',
      project_id: pick?.project_id ?? '',
      app_role: me.app_role,
    }
  }

  // ── 권한 단언 (설계서 §6.1 — MockProvider와 같은 메시지) ──────────
  async assertMember(projectId: UUID): Promise<MemberRole> {
    const role = await this.roleIn(projectId)
    if (!role) throw new ProviderError('forbidden', '프로젝트 멤버가 아닙니다.')
    return role
  }

  async assertPm(projectId: UUID): Promise<Me> {
    const role = await this.roleIn(projectId)
    if (role !== 'pm') throw new ProviderError('forbidden', 'PM 전용 기능입니다.')
    return this.me()
  }

  async assertPmOps(projectId: UUID): Promise<Me> {
    const role = await this.roleIn(projectId)
    if (role !== 'pm' && role !== 'ops') {
      throw new ProviderError('forbidden', '이 편집은 PM·운영 담당만 가능합니다.')
    }
    return this.me()
  }

  async assertReg(projectId: UUID): Promise<Me> {
    const role = await this.roleIn(projectId)
    if (role !== 'pm' && role !== 'reg') throw new ProviderError('forbidden', '등록 데이터 권한이 없습니다.')
    return this.me()
  }

  /** §6.1 역할-영역 일치: pm=전 영역, design/ops=자기 영역, common=pm 전용, reg=쓰기 불가 */
  async assertAreaRole(projectId: UUID, area: DeliverableArea): Promise<Me> {
    const role = await this.assertMember(projectId)
    if (role === 'pm') return this.me()
    if ((role === 'design' || role === 'ops') && area === role) return this.me()
    throw new ProviderError('forbidden', '해당 영역에 대한 쓰기 권한이 없습니다.')
  }

  /** 견적 권한 = app_role admin·sales (프로젝트 역할과 무관) */
  async assertQuoteRole(): Promise<Me> {
    const me = await this.me()
    if (me.app_role !== 'admin' && me.app_role !== 'sales') {
      throw new ProviderError('forbidden', '견적 메뉴는 영업·관리자 권한이 필요합니다.')
    }
    return me
  }

  // ── 조회 도우미 ──────────────────────────────────────────────────
  async project(projectId: UUID): Promise<Project> {
    return this.q(
      await this.sb.from('projects').select('*').eq('id', projectId).maybeSingle(),
      '프로젝트를 찾을 수 없습니다.',
    ) as Project
  }

  /** v1.5 §8: closed 행사에 대한 쓰기 API는 전부 409 */
  async assertWritable(projectId: UUID): Promise<Project> {
    const project = await this.project(projectId)
    if (project.status === 'closed') {
      throw new ProviderError('conflict', '종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.')
    }
    return project
  }

  async deliverable(deliverableId: UUID): Promise<Deliverable> {
    return this.q(
      await this.sb.from('deliverables').select('*').eq('id', deliverableId).maybeSingle(),
      '항목을 찾을 수 없습니다.',
    ) as Deliverable
  }

  /**
   * 활동 로그(§4-11). 실패해도 본 동작을 막지 않는다(알림·감사 기록은 fire-and-forget — §9 원칙 준용).
   * actor 기본값 = 'user:{profile_id}'.
   */
  async log(
    projectId: UUID,
    action: string,
    targetType: string,
    targetId: UUID | null,
    meta?: Record<string, unknown>,
    actor?: string,
  ): Promise<void> {
    try {
      const who = actor ?? `user:${(await this.me()).id}`
      const { error } = await this.sb.from('activity_log').insert({
        project_id: projectId,
        actor: who,
        action,
        target_type: targetType,
        target_id: targetId,
        meta: meta ?? null,
      })
      if (error) console.warn('[activity_log] 기록 실패:', error.message)
    } catch (e) {
      console.warn('[activity_log] 기록 실패:', e)
    }
  }
}
