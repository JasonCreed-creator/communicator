// SupabaseProvider · 프로젝트 도메인 — 세션 · 행사(목록·생성·종료·수정) · 멤버 배정 · 담당자 마스터(§4-2b) ·
// 온보딩 상태 · 발주처 연락처/토큰(§4-3).
// 동작 정본 = MockProvider의 같은 메서드: 검증 순서·오류 code·한국어 메시지·activity_log action 이름을 그대로 옮겼다.
// 권한은 mock과 같은 순서로 앱 계층에서 먼저 단언하고(같은 메시지), RLS·RPC(add_member·remove_member·
// list_people·remove_person)가 서버에서 이중 강제한다. 다중 쓰기가 한 트랜잭션이어야 하는 곳은 RPC를 탄다.
import type { DataProvider } from '../../DataProvider'
import { normalizeRow, nowIso, type SupabaseCtx } from '../ctx'
import { mapPgError, type PgErrorLike } from '../errors'
import { ProviderError } from '../../../lib/errors'
import { isDelayed, toIsoDate } from '../../../lib/wbs'
import type { ClientContact, ClientToken, Project, UUID, WbsTask } from '../../../types/entities'
import type { MemberRole } from '../../../types/enums'
import type {
  MemberWithProfile,
  PersonAssignment,
  PersonWithAssignments,
  ProjectOverviewPatch,
  ProjectPatch,
  ProjectSummary,
  UserRef,
} from '../../../types/views'

type ProjectsDomain = Pick<
  DataProvider,
  | 'getCurrentUser'
  | 'listProjects'
  | 'createProject'
  | 'closeProject'
  | 'getProject'
  | 'listMembers'
  | 'addMember'
  | 'removeMember'
  | 'updateProject'
  | 'updateProjectOverview'
  | 'getOnboardingStatus'
  | 'listPeople'
  | 'createPerson'
  | 'updatePerson'
  | 'removePerson'
  | 'listClientContacts'
  | 'createClientContact'
  | 'listClientTokens'
  | 'issueClientToken'
  | 'revokeClientToken'
>

/** profiles 행(주소록) — UserRef 매핑 원본 */
interface ProfileRow {
  id: UUID
  display_name: string
  email: string | null
  title: string | null
  phone: string | null
}

interface MemberRow {
  project_id: UUID
  user_id: UUID
  role: MemberRole
  /** PostgREST 임베드 — 다대일이면 객체, 관계 추론에 따라 배열로 올 수도 있어 둘 다 받는다 */
  profiles: ProfileRow | ProfileRow[] | null
}

/** list_people() RPC 행 */
interface PeopleRow {
  id: UUID
  name: string
  email: string | null
  title: string | null
  phone: string | null
  org: string | null
  assignments: PersonAssignment[] | null
}

const UNIQUE_VIOLATION = '23505'

/** ProjectPatch 중 검증 없이 그대로 컬럼에 쓰는 키 — name·code·quote_id는 아래에서 별도 처리 */
const PROJECT_PATCH_PASSTHROUGH = [
  'kind',
  'event_date',
  'event_type',
  'format',
  'psa_enabled',
  'audience_model',
  'event_end_date',
  'start_time',
  'end_time',
  'venue',
  'expected_headcount',
  'seating',
  'theme',
  'organizer',
  'mc_name',
  'target_audience',
  'overview_items',
  'partner_guide_url',
  'partner_contact_email',
  'guarantee_pax',
  'kpi_show_rate',
  'targeting',
] as const satisfies readonly (keyof ProjectPatch)[]

const OVERVIEW_PATCH_KEYS = ['event_date', 'theme', 'venue', 'mc_name', 'overview_items'] as const satisfies readonly (keyof ProjectOverviewPatch)[]

/** maybeSingle() 결과 — 없으면 null (ctx.q는 null을 404로 던지므로 '없어도 되는' 조회는 이걸 쓴다) */
function maybeRow<T>(res: { data: T | null; error: PgErrorLike | null }): T | null {
  if (res.error) throw mapPgError(res.error)
  return res.data === null || res.data === undefined ? null : normalizeRow(res.data)
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toUserRef(row: ProfileRow): UserRef {
  return { id: row.id, name: row.display_name, email: row.email, title: row.title ?? null, phone: row.phone ?? null }
}

/** mock의 nextId('EVT')에 해당 — 빈 코드 입력 시 자리표시 코드. 전역 유일이면 되고 형식은 사용자가 S0에서 고친다 */
function generateProjectCode(): string {
  return `EVT-${Date.now().toString(36).toUpperCase()}`
}

export function projectsDomain(ctx: SupabaseCtx): ProjectsDomain {
  /**
   * mock의 assertPm() = **현재 행사**의 pm. 주소록(담당자 마스터)은 행사 스코프가 없어 대상 행사가 없으므로
   * 같은 기준을 쓴다 — DB 쪽 RLS(app.is_any_pm)는 어느 행사든 pm이면 허용하므로 앱 계층이 더 좁다(mock 동일).
   */
  async function assertPersonAdmin(): Promise<void> {
    const user = await ctx.currentUser()
    if (user.role !== 'pm') throw new ProviderError('forbidden', 'PM 전용 기능입니다.')
  }

  /** 행사 코드 유일성 — RLS로 보이는 범위에서 먼저 확인(mock과 같은 메시지), 보이지 않는 충돌은 insert/update의 23505로 잡는다 */
  async function assertCodeAvailable(code: string, exceptProjectId?: UUID): Promise<void> {
    let q = ctx.sb.from('projects').select('id').eq('code', code)
    if (exceptProjectId) q = q.neq('id', exceptProjectId)
    const dup = await maybeRow(await q.maybeSingle())
    if (dup) throw new ProviderError('conflict', '이미 사용 중인 행사 코드입니다.')
  }

  function projectCodeConflict(err: PgErrorLike): ProviderError {
    if (err.code === UNIQUE_VIOLATION) return new ProviderError('conflict', '이미 사용 중인 행사 코드입니다.')
    return mapPgError(err)
  }

  function personEmailConflict(err: PgErrorLike): ProviderError {
    if (err.code === UNIQUE_VIOLATION) return new ProviderError('conflict', '이미 등록된 이메일입니다.')
    return mapPgError(err)
  }

  return {
    // ── 세션 ──────────────────────────────────────────────────────────
    async getCurrentUser() {
      return ctx.currentUser()
    },

    // ── 프로젝트·멤버 (v1.5 §8 GET/POST /projects·close·members) ──────
    async getProject(projectId) {
      return ctx.project(projectId)
    },

    async listMembers(projectId) {
      await ctx.project(projectId)
      const rows = ctx.q(
        await ctx.sb
          .from('project_members')
          .select('project_id, user_id, role, profiles(id, display_name, email, title, phone)')
          .eq('project_id', projectId),
      ) as MemberRow[]
      return rows.map((m): MemberWithProfile => {
        const profile = one(m.profiles)
        if (!profile) throw new ProviderError('not_found', '사용자를 찾을 수 없습니다.')
        return { project_id: m.project_id, user_id: m.user_id, role: m.role, profile: toUserRef(profile) }
      })
    },

    async listProjects() {
      // 로그인만 요구한다 — 멤버십이 하나도 없는 새 사용자도 빈 목록을 보고 행사를 만들 수 있어야 한다.
      // 어느 행사가 보이는지는 RLS(멤버·생성자)가 정한다.
      await ctx.me()
      const projects = ctx.q(await ctx.sb.from('projects').select('*')) as Project[]
      if (projects.length === 0) return []
      const ids = projects.map((p) => p.id)
      const [memberRes, deliverableRes, taskRes] = await Promise.all([
        ctx.sb.from('project_members').select('project_id, user_id, role, profiles(id, display_name, email, title, phone)').in('project_id', ids),
        ctx.sb.from('deliverables').select('id, project_id, status').in('project_id', ids),
        ctx.sb.from('wbs_tasks').select('project_id, status, end_date').in('project_id', ids),
      ])
      const members = ctx.q(memberRes) as MemberRow[]
      const deliverables = ctx.q(deliverableRes) as { id: UUID; project_id: UUID; status: string }[]
      const tasks = ctx.q(taskRes) as Pick<WbsTask, 'project_id' | 'status' | 'end_date'>[]
      const today = toIsoDate(new Date())

      const summaries = projects.map((p): ProjectSummary => {
        const mine = deliverables.filter((d) => d.project_id === p.id)
        const pmMember = members.find((m) => m.project_id === p.id && m.role === 'pm')
        const pmProfile = pmMember ? one(pmMember.profiles) : null
        const overviewComplete = !!(p.name.trim() && p.code.trim() && p.event_date && p.venue)
        const steps = (overviewComplete ? 1 : 0) + (pmMember ? 1 : 0) + (p.onboarded_at ? 1 : 0)
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          kind: p.kind,
          event_type: p.event_type,
          event_date: p.event_date,
          venue: p.venue,
          expected_headcount: p.expected_headcount,
          status: p.status,
          onboarded: p.onboarded_at !== null,
          onboarding_steps_done: steps,
          pm_name: pmProfile?.display_name ?? null,
          pending_approvals: mine.filter((d) => d.status === 'pending_approval').length,
          delayed_tasks: tasks.filter((t) => t.project_id === p.id && isDelayed(t, today)).length,
          finals: mine.filter((d) => d.status === 'final').length,
          deliverable_total: mine.length,
        }
      })
      // 진행 중 먼저(등록순 — 기본 선택이 결정적이도록 created_at 기준), 종료는 뒤로(최근 종료순) — mock 동일
      const createdAt = new Map(projects.map((p) => [p.id, p.created_at]))
      const at = (id: UUID) => createdAt.get(id) ?? ''
      return summaries.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1
        if (a.status === 'closed') return at(b.id).localeCompare(at(a.id))
        return at(a.id).localeCompare(at(b.id))
      })
    },

    async createProject(input) {
      const me = await ctx.me()
      const code = input.code?.trim() || generateProjectCode()
      await assertCodeAvailable(code)
      const res = await ctx.sb
        .from('projects')
        .insert({
          name: input.name?.trim() || '새 행사',
          code,
          // v2.6 §25 — format은 시드축이다. 미지정이면 conference(기존 동작과 동일).
          format: input.format ?? 'conference',
          psa_enabled: input.psa_enabled ?? false,
          audience_model: input.audience_model ?? null,
          kind: 'agency', // v2.4 §21 — S0 위저드로 만드는 행사는 기본 대행형(행사 설정에서 전환 가능)
          event_date: input.event_date ?? null,
          event_end_date: input.event_end_date ?? null,
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null,
          expected_headcount: input.expected_headcount ?? null,
          seating: input.seating ?? null,
          organizer: input.organizer ?? null,
          target_audience: input.target_audience ?? null,
          status: 'active',
          event_type: input.event_type ?? 'general',
          theme: input.theme ?? null,
          venue: input.venue ?? null,
          mc_name: input.mc_name ?? null,
          overview_items: input.overview_items ?? null,
          onboarded_at: null, // §8: S0 완료 전까지 null
          created_by: me.id, // §8 생성자=pm 자동 — projects_after_insert 트리거가 멤버십을 만든다
        })
        .select('*')
        .single()
      if (res.error) throw projectCodeConflict(res.error)
      const project = normalizeRow(res.data) as Project
      ctx.invalidateRoles() // 트리거가 만든 pm 멤버십을 다음 roleIn이 보게 한다
      await ctx.log(project.id, 'project.created', 'project', project.id)
      return project
    },

    async closeProject(projectId, closed) {
      await ctx.assertPm(projectId)
      const project = ctx.q(
        await ctx.sb
          .from('projects')
          .update({ status: closed ? 'closed' : 'active', closed_at: closed ? nowIso() : null })
          .eq('id', projectId)
          .select('*')
          .single(),
        '프로젝트를 찾을 수 없습니다.',
      ) as Project
      await ctx.log(projectId, closed ? 'project.closed' : 'project.reopened', 'project', projectId)
      return project
    },

    async addMember(projectId, input) {
      // mock은 현재 행사의 pm을 봤지만, 배정 대상 행사의 pm이 RLS·RPC(require_pm)가 실제로 강제하는 기준이다
      await ctx.assertPm(projectId)
      await ctx.assertWritable(projectId)
      const name = input.display_name.trim()
      const email = input.email.trim()
      if (!name || !email) {
        throw new ProviderError('validation', '이름과 이메일은 필수입니다.')
      }
      // 3.18.1 §2 담당자 노출 계약 — 직함·전화는 확인 표에서 사람이 고친 값이므로 그대로 받아 적는다(RPC는 빈 칸만 채운다)
      const member = await ctx.rpc<MemberWithProfile>('add_member', {
        p_project: projectId,
        p_display_name: name,
        p_email: email,
        p_role: input.role,
        p_title: input.title?.trim() || null,
        p_phone: input.phone?.trim() || null,
      })
      ctx.invalidateRoles(projectId)
      return {
        project_id: member.project_id,
        user_id: member.user_id,
        role: member.role,
        profile: {
          id: member.profile.id,
          name: member.profile.name,
          email: member.profile.email,
          title: member.profile.title ?? null,
          phone: member.profile.phone ?? null,
        },
      }
    },

    async removeMember(projectId, memberId) {
      await ctx.assertPm(projectId)
      await ctx.assertWritable(projectId)
      await ctx.rpc<void>('remove_member', { p_project: projectId, p_member: memberId })
      ctx.invalidateRoles(projectId)
    },

    // ── v1.3 프로젝트 기본정보 (v1.5: 개요 전 필드 §8 PATCH /projects/{id}) ──
    async updateProject(projectId, patch) {
      const me = await ctx.assertPm(projectId)
      const project = await ctx.assertWritable(projectId)
      const row: Record<string, unknown> = {}
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new ProviderError('validation', '행사명은 비울 수 없습니다.')
        row.name = patch.name
      }
      if (patch.code !== undefined) {
        const code = patch.code.trim()
        if (!code) throw new ProviderError('validation', '행사 코드는 비울 수 없습니다.')
        await assertCodeAvailable(code, projectId)
        row.code = code
      }
      // v2.4 §21 R-H1 kind · v2.6 §25.1 format 등 — 값만 바꾼다(WBS 재전개는 S5 '템플릿 재전개'의 몫, 어떤 행도 지우지 않는다)
      for (const key of PROJECT_PATCH_PASSTHROUGH) {
        const value = patch[key]
        if (value !== undefined) row[key] = value
      }
      // v2.0 — "견적 연결" 액션: app_role admin·sales 전용 (§6.1·§10), 상호 링크 동기화
      if (patch.quote_id !== undefined) {
        if (me.app_role !== 'admin' && me.app_role !== 'sales') {
          throw new ProviderError('forbidden', '견적 연결은 영업·관리자 권한이 필요합니다.')
        }
        if (patch.quote_id === null) {
          if (project.quote_id) {
            ctx.ok(await ctx.sb.from('quotes').update({ project_id: null }).eq('id', project.quote_id))
          }
          row.quote_id = null
        } else {
          const quote = ctx.q(
            await ctx.sb.from('quotes').select('id, project_id').eq('id', patch.quote_id).maybeSingle(),
            '견적을 찾을 수 없습니다.',
          ) as { id: UUID; project_id: UUID | null }
          if (quote.project_id && quote.project_id !== projectId) {
            throw new ProviderError('conflict', '이미 다른 행사에 연결된 견적입니다.')
          }
          ctx.ok(await ctx.sb.from('quotes').update({ project_id: projectId }).eq('id', quote.id))
          row.quote_id = quote.id
        }
      }
      let updated: Project = project
      if (Object.keys(row).length > 0) {
        const res = await ctx.sb.from('projects').update(row).eq('id', projectId).select('*').single()
        if (res.error) throw projectCodeConflict(res.error)
        updated = normalizeRow(res.data) as Project
      }
      // 행사일·유형 변경 후 WBS 날짜/구성 갱신은 명시적 재전개(expandWbs)로 수행 — S5 pm 배너·버튼
      await ctx.log(projectId, 'project.updated', 'project', projectId)
      return updated
    },

    // ── v1.2 행사개요 (§8 PATCH /projects/{id}/overview, pm·ops) ──────
    async updateProjectOverview(projectId, patch) {
      await ctx.assertPmOps(projectId)
      const project = await ctx.assertWritable(projectId)
      const row: Record<string, unknown> = {}
      for (const key of OVERVIEW_PATCH_KEYS) {
        const value = patch[key]
        if (value !== undefined) row[key] = value
      }
      let updated: Project = project
      if (Object.keys(row).length > 0) {
        updated = ctx.q(
          await ctx.sb.from('projects').update(row).eq('id', projectId).select('*').single(),
          '프로젝트를 찾을 수 없습니다.',
        ) as Project
      }
      await ctx.log(projectId, 'project.overview_updated', 'project', projectId)
      return updated
    },

    // ── v1.3 S0 온보딩 상태 — v1.4.1: 정본은 projects.onboarded_at, completed는 파생값 ──
    async getOnboardingStatus(projectId) {
      const project = await ctx.project(projectId)
      return { completed: project.onboarded_at !== null, onboarded_at: project.onboarded_at }
    },

    // ── 담당자 마스터 (v12 · Phase 3.20 · §4-2b) ─────────────────────
    // profiles가 곧 주소록이다. 배정은 기존 addMember(add_member RPC)가 이메일로 같은 사람을 알아봐 재사용한다.
    async listPeople() {
      const rows = (await ctx.rpc<PeopleRow[] | null>('list_people')) ?? []
      return rows
        .map(
          (r): PersonWithAssignments => ({
            id: r.id,
            name: r.name,
            email: r.email,
            title: r.title ?? null,
            phone: r.phone ?? null,
            assignments: r.assignments ?? [],
          }),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
    },

    async createPerson(input) {
      await assertPersonAdmin()
      const name = input.name.trim()
      const email = input.email.trim()
      if (!name || !email) throw new ProviderError('validation', '이름과 이메일은 필수입니다.')
      const res = await ctx.sb
        .from('profiles')
        .insert({ display_name: name, email, title: input.title?.trim() || null, phone: input.phone?.trim() || null })
        .select('id, display_name, email, title, phone')
        .single()
      // 이메일 유일 인덱스(lower(email)) 위반 = 이미 등록된 사람 — mock의 사전 검사와 같은 메시지
      if (res.error) throw personEmailConflict(res.error)
      return toUserRef(normalizeRow(res.data) as ProfileRow)
    },

    async updatePerson(personId, patch) {
      await assertPersonAdmin()
      const existing = ctx.q(
        await ctx.sb.from('profiles').select('id, display_name, email, title, phone').eq('id', personId).maybeSingle(),
        '담당자를 찾을 수 없습니다.',
      ) as ProfileRow
      const row: Record<string, unknown> = {}
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (!name) throw new ProviderError('validation', '이름은 비울 수 없습니다.')
        row.display_name = name
      }
      if (patch.email !== undefined) {
        const email = patch.email.trim()
        if (!email) throw new ProviderError('validation', '이메일은 비울 수 없습니다.')
        row.email = email
      }
      // 직함·전화는 비우는 것도 뜻이 있는 편집이라 빈 문자열을 null로 받아 적는다
      if (patch.title !== undefined) row.title = patch.title?.trim() || null
      if (patch.phone !== undefined) row.phone = patch.phone?.trim() || null
      if (Object.keys(row).length === 0) return toUserRef(existing)
      // profiles 한 행이 곧 모든 행사·/c의 담당자 표기라, 여기서 고치면 전부 함께 반영된다(§4-2b)
      const res = await ctx.sb
        .from('profiles')
        .update(row)
        .eq('id', personId)
        .select('id, display_name, email, title, phone')
        .single()
      if (res.error) throw personEmailConflict(res.error)
      return toUserRef(normalizeRow(res.data) as ProfileRow)
    },

    async removePerson(personId) {
      await assertPersonAdmin()
      // 배정 잔존(사유에 행사명)·본인 삭제 409는 RPC가 mock과 같은 메시지로 판정한다
      await ctx.rpc<void>('remove_person', { p_id: personId })
    },

    // ── 설정 (S6, pm 전용 — §6.1) ─────────────────────────────────────
    async listClientContacts(projectId) {
      await ctx.project(projectId)
      return ctx.q(
        await ctx.sb.from('client_contacts').select('id, project_id, name, org, email').eq('project_id', projectId),
      ) as ClientContact[]
    },

    async createClientContact(input) {
      await ctx.assertPm(input.project_id)
      await ctx.assertWritable(input.project_id)
      return ctx.q(
        await ctx.sb
          .from('client_contacts')
          .insert({ project_id: input.project_id, name: input.name, org: input.org ?? null, email: input.email ?? null })
          .select('id, project_id, name, org, email')
          .single(),
      ) as ClientContact
    },

    async listClientTokens(projectId) {
      await ctx.assertPm(projectId)
      await ctx.project(projectId)
      return ctx.q(
        await ctx.sb.from('client_tokens').select('*').eq('project_id', projectId).order('created_at'),
      ) as ClientToken[]
    },

    async issueClientToken(input) {
      await ctx.assertPm(input.project_id)
      const project = await ctx.assertWritable(input.project_id)
      // §4 무결성 보조: contact의 project_id 일치를 앱 레벨에서 검증(교차 프로젝트 차단)
      const contact = await maybeRow(
        await ctx.sb
          .from('client_contacts')
          .select('id')
          .eq('id', input.contact_id)
          .eq('project_id', input.project_id)
          .maybeSingle(),
      )
      if (!contact) throw new ProviderError('validation', '이 프로젝트의 연락처가 아닙니다.')
      let expires = input.expires_at ?? null
      if (!expires && project.event_date) {
        const d = new Date(`${project.event_date}T00:00:00.000Z`)
        d.setUTCDate(d.getUTCDate() + 30) // §6.3 기본 만료 = 행사일+30일
        expires = d.toISOString()
      }
      const token = ctx.q(
        await ctx.sb
          .from('client_tokens')
          .insert({ project_id: input.project_id, contact_id: input.contact_id, expires_at: expires })
          .select('*')
          .single(),
      ) as ClientToken
      await ctx.log(input.project_id, 'token.issued', 'client_token', token.token)
      return token
    },

    async revokeClientToken(token) {
      // uuid가 아닌 문자열은 22P02 → not_found로 매핑되고, 아래 메시지로 바뀐다(mock의 미존재 토큰과 동일)
      const t = ctx.q(
        await ctx.sb.from('client_tokens').select('*').eq('token', token).maybeSingle(),
        '토큰을 찾을 수 없습니다.',
      ) as ClientToken
      await ctx.assertPm(t.project_id)
      let revoked = t
      if (!t.revoked_at) {
        revoked = ctx.q(
          await ctx.sb.from('client_tokens').update({ revoked_at: nowIso() }).eq('token', token).select('*').single(),
          '토큰을 찾을 수 없습니다.',
        ) as ClientToken
      }
      await ctx.log(t.project_id, 'token.revoked', 'client_token', t.token)
      return revoked
    },
  }
}
