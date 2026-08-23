// MockProvider — DataProvider 1단계 구현 (Phase 1).
// 픽스처 + 인메모리 상태로 동작하며, 업로드 파일은 blob URL(새로고침 시 소실 허용 — CLAUDE.md §4).
// 역할·전이·토큰 검증은 설계서 §5·§6 규칙을 앱 레벨에서 재현한다 — Phase 4에서 RLS·Edge Function으로 이중화.
import { ProviderError } from '../../lib/errors'
import {
  assertTransition,
  buildVersionFileName,
  isPreviewFileName,
} from '../../lib/statusMachine'
import { isDelayed, isImminent, offsetToDate, toIsoDate } from '../../lib/wbs'
import { createFixtureState, type MockState } from '../../fixtures/sampleProject'
import { COMPLIANCE_CARD_TEMPLATES } from '../../fixtures/complianceTemplates'
import { defaultConsents, defaultFormFields, defaultSections } from '../../lib/landingTemplate'
import { ROLE_CHARTER_TEMPLATES, wbsTemplateFor } from '../../fixtures/wbsTemplates'
import { adjustmentDeltas, computeQuoteOutputs, toEngineConfig } from '../../modules/quote/engine/quoteInput'
import { effectiveAdjust } from '../../modules/quote/engine/quoteMode'
import { calcEstimate } from '../../modules/quote/engine/calcEstimate'
import { exportEstimate } from '../../modules/quote/export/exportEstimate'
import { quoteToProjectDraft } from '../../modules/quote/handoff'
import type {
  ActivityLogEntry,
  Approval,
  Attendee,
  ClientContact,
  ClientToken,
  Comment,
  ComplianceCard,
  Cue,
  Deliverable,
  LandingDailyMetric,
  LandingPage,
  SettlementBoard,
  SettlementBucket,
  SettlementItem,
  Vendor,
  Milestone,
  ProgramSession,
  Project,
  ProjectMember,
  Quote,
  QuoteInput,
  RoleCharter,
  RsvpContact,
  UnregisteredFile,
  UUID,
  Version,
  WbsTask,
} from '../../types/entities'
import type { AppRole, DeliverableArea, DeliverableStatus, MemberRole } from '../../types/enums'
import type {
  AddCommentInput,
  AttendeeWithRsvp,
  ClientContactInput,
  ClientDecisionInput,
  ClientQueue,
  ClientStatusData,
  ComplianceCardPatch,
  QuoteExportResult,
  CreateDeliverableInput,
  CsvImportResult,
  CsvImportRow,
  CueInput,
  CurrentUser,
  DashboardData,
  DeliverableDetail,
  DeliverableFilter,
  IssueTokenInput,
  MemberInput,
  MemberWithProfile,
  MilestoneInput,
  OnboardingStatus,
  PlanData,
  PlanVersionRef,
  ProgramSessionInput,
  ProjectCreateInput,
  ProjectOverviewPatch,
  ProjectPatch,
  ProjectSummary,
  RegistrationStats,
  RequestApprovalInput,
  RsvpContactPatch,
  UploadVersionInput,
  UserRef,
  WbsTaskFilter,
  WbsTaskPatch,
  SettlementBoardView,
} from '../../types/views'
import type {
  DataProvider,
  LandingPageInput,
  LandingPagePatch,
  SettlementBucketInput,
  SettlementItemInput,
  VendorInput,
} from '../DataProvider'
import {
  bucketActual,
  bucketMarkup,
  bucketMarkupRate,
  bucketOrdered,
  computeTotals,
  isOverBudget,
  quoteBucketSpec,
  toVatExcluded,
} from '../../lib/settlement'

const UPLOADABLE_STATUSES: readonly DeliverableStatus[] = [
  'requested', // v1.2: 첫 버전 업로드 시 draft 자동 전이
  'draft',
  'internal_review',
  'changes_requested',
]

function nowIso(): string {
  return new Date().toISOString()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 큐시트 스냅숏 본문 — mock은 인쇄용 HTML로 갈음(실제 PDF 생성은 Phase 5) */
function renderCueSnapshotHtml(deliverable: Deliverable, cues: Cue[]): string {
  const rows = cues
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.cue_no ?? '')}</td><td>${escapeHtml(c.time_at ?? '')}</td>` +
        `<td>${escapeHtml(c.segment ?? '')}</td><td>${escapeHtml(c.body ?? '')}</td>` +
        `<td>${escapeHtml(c.console_audio ?? '')}</td><td>${escapeHtml(c.console_light ?? '')}</td>` +
        `<td>${escapeHtml(c.console_screen ?? '')}</td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(deliverable.title)}</title>` +
    `<table border="1" cellspacing="0" cellpadding="6">` +
    `<tr><th>큐</th><th>시간</th><th>구분</th><th>내용·대본</th><th>음향</th><th>조명</th><th>스크린</th></tr>` +
    `${rows}</table>`
  )
}

/** 미리보기 자리표시 이미지 — 픽스처 버전 파일용 (실파일은 Phase 5 Drive 이식에서) */
function placeholderPreviewUrl(fileName: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">` +
    `<rect width="100%" height="100%" fill="#e5e7eb"/>` +
    `<text x="50%" y="50%" text-anchor="middle" font-size="16" fill="#6b7280">${fileName}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export class MockProvider implements DataProvider {
  private state: MockState
  private idCounters = new Map<string, number>()
  private uploadedFileUrls = new Map<UUID, string>()

  constructor(state: MockState = createFixtureState()) {
    this.state = state
  }

  // ── Mock 전용 헬퍼 (인터페이스 외 — 개발·테스트 편의) ─────────────
  /** 현재 사용자 전환 — 역할별 UI·권한 검증용 */
  switchUser(userId: UUID): void {
    this.mustFindUser(userId)
    this.state.current_user_id = userId
  }

  /** v2.0 mock 전용 — 현재 사용자의 app_role 전환 (견적 게이트 검증용, 세션 브리프 W-5) */
  setAppRole(role: AppRole): void {
    const userId = this.state.current_user_id
    const profile = this.state.profiles.find((p) => p.id === userId)
    if (profile) {
      profile.app_role = role
    } else {
      const user = this.mustFindUser(userId)
      this.state.profiles.push({
        id: user.id,
        display_name: user.name,
        email: user.email ?? '',
        app_role: role,
        created_at: nowIso(),
      })
    }
  }

  // ── 내부 공통 ─────────────────────────────────────────────────────
  private nextId(prefix: string): string {
    const n = (this.idCounters.get(prefix) ?? 100) + 1
    this.idCounters.set(prefix, n)
    return `${prefix}-${String(n).padStart(3, '0')}`
  }

  private mustFindUser(userId: UUID): UserRef {
    const user = this.state.users.find((u) => u.id === userId)
    if (!user) throw new ProviderError('not_found', '사용자를 찾을 수 없습니다.')
    return user
  }

  private currentUser(): CurrentUser {
    const user = this.mustFindUser(this.state.current_user_id)
    const membership = this.state.members.find((m) => m.user_id === user.id)
    if (!membership) throw new ProviderError('forbidden', '프로젝트 멤버가 아닙니다.')
    return { ...user, role: membership.role, project_id: membership.project_id, app_role: this.appRoleOf(user.id) }
  }

  /** §4-1b — profiles 행이 없으면 가입 기본값 'staff' */
  private appRoleOf(userId: UUID): AppRole {
    return this.state.profiles.find((p) => p.id === userId)?.app_role ?? 'staff'
  }

  private mustFindProject(projectId: UUID): Project {
    const project = this.state.projects.find((p) => p.id === projectId)
    if (!project) {
      throw new ProviderError('not_found', '프로젝트를 찾을 수 없습니다.')
    }
    return project
  }

  /** v1.5 §8: closed 행사에 대한 쓰기 API는 전부 409 */
  private assertWritable(projectId: UUID): Project {
    const project = this.mustFindProject(projectId)
    if (project.status === 'closed') {
      throw new ProviderError('conflict', '종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.')
    }
    return project
  }

  /** 산출물이 속한 프로젝트 (파일명 규약·쓰기 가드용) */
  private projectOf(deliverable: Deliverable): Project {
    return this.mustFindProject(deliverable.project_id)
  }

  private mustFindDeliverable(deliverableId: UUID): Deliverable {
    const d = this.state.deliverables.find((x) => x.id === deliverableId)
    if (!d) throw new ProviderError('not_found', '항목을 찾을 수 없습니다.')
    return d
  }

  /** §6.1 역할-영역 일치: pm=전 영역, design/ops=자기 영역, common=pm 전용, reg=쓰기 불가 */
  private assertAreaRole(area: DeliverableArea, role: MemberRole): void {
    if (role === 'pm') return
    if ((role === 'design' || role === 'ops') && area === role) return
    throw new ProviderError('forbidden', '해당 영역에 대한 쓰기 권한이 없습니다.')
  }

  private log(
    projectId: UUID,
    actor: string,
    action: string,
    targetType: string,
    targetId: UUID,
    meta?: Record<string, unknown>,
  ): void {
    const maxId = this.state.activity_log.reduce((m, e) => Math.max(m, e.id), 0)
    this.state.activity_log.push({
      id: maxId + 1,
      project_id: projectId,
      actor,
      action,
      target_type: targetType,
      target_id: targetId,
      meta: meta ?? null,
      created_at: nowIso(),
    })
  }

  /** 토큰 검증 (§6.3): 미존재=404, 회수·만료=410. 접근 시 last_seen_at 갱신 */
  private resolveToken(token: string): ClientToken {
    const t = this.state.client_tokens.find((x) => x.token === token)
    if (!t) throw new ProviderError('not_found', '유효하지 않은 링크입니다.')
    if (t.revoked_at || (t.expires_at && new Date(t.expires_at).getTime() < Date.now())) {
      throw new ProviderError('gone', '링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.')
    }
    t.last_seen_at = nowIso()
    return t
  }

  private versionsOf(deliverableId: UUID): Version[] {
    return this.state.versions
      .filter((v) => v.deliverable_id === deliverableId)
      .sort((a, b) => b.version_no - a.version_no)
  }

  private areaProgress(projectId: UUID): { area: DeliverableArea; total: number; done: number }[] {
    const areas: DeliverableArea[] = ['design', 'ops', 'common']
    return areas.map((area) => {
      const items = this.state.deliverables.filter(
        (d) => d.project_id === projectId && d.area === area,
      )
      return { area, total: items.length, done: items.filter((d) => d.status === 'final').length }
    })
  }

  // ── 세션 ──────────────────────────────────────────────────────────
  async getCurrentUser(): Promise<CurrentUser> {
    return this.currentUser()
  }

  // ── 프로젝트·멤버 ─────────────────────────────────────────────────
  async getProject(projectId: UUID): Promise<Project> {
    return this.mustFindProject(projectId)
  }

  async listMembers(projectId: UUID): Promise<MemberWithProfile[]> {
    this.mustFindProject(projectId)
    return this.state.members
      .filter((m) => m.project_id === projectId)
      .map((m) => ({
        ...m,
        profile: this.mustFindUser(m.user_id),
      }))
  }

  // ── v1.5 다중 행사 (§8 GET/POST /projects·close·members) ──────────
  async listProjects(): Promise<ProjectSummary[]> {
    this.currentUser()
    const today = toIsoDate(new Date())
    const summaries = this.state.projects.map((p) => {
      const deliverables = this.state.deliverables.filter((d) => d.project_id === p.id)
      const pmMember = this.state.members.find((m) => m.project_id === p.id && m.role === 'pm')
      const overviewComplete = !!(p.name.trim() && p.code.trim() && p.event_date && p.venue)
      const steps = (overviewComplete ? 1 : 0) + (pmMember ? 1 : 0) + (p.onboarded_at ? 1 : 0)
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        event_type: p.event_type,
        event_date: p.event_date,
        venue: p.venue,
        expected_headcount: p.expected_headcount,
        status: p.status,
        onboarded: p.onboarded_at !== null,
        onboarding_steps_done: steps,
        pm_name: pmMember ? this.mustFindUser(pmMember.user_id).name : null,
        pending_approvals: deliverables.filter((d) => d.status === 'pending_approval').length,
        delayed_tasks: this.state.wbs_tasks.filter(
          (t) => t.project_id === p.id && isDelayed(t, today),
        ).length,
        finals: deliverables.filter((d) => d.status === 'final').length,
        deliverable_total: deliverables.length,
      }
    })
    // 진행 중 먼저(등록순 — 기본 선택이 결정적이도록 created_at 기준), 종료는 뒤로(최근 종료순)
    const createdAt = (id: UUID) => this.mustFindProject(id).created_at
    return summaries.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      if (a.status === 'closed') return createdAt(b.id).localeCompare(createdAt(a.id))
      return createdAt(a.id).localeCompare(createdAt(b.id))
    })
  }

  async createProject(input: ProjectCreateInput): Promise<Project> {
    const user = this.currentUser()
    const code = input.code?.trim() || this.nextId('EVT')
    if (this.state.projects.some((p) => p.code === code)) {
      throw new ProviderError('conflict', '이미 사용 중인 행사 코드입니다.')
    }
    const project: Project = {
      id: this.nextId('prj'),
      name: input.name?.trim() || '새 행사',
      code,
      event_date: input.event_date ?? null,
      event_end_date: input.event_end_date ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      expected_headcount: input.expected_headcount ?? null,
      seating: input.seating ?? null,
      organizer: input.organizer ?? null,
      target_audience: input.target_audience ?? null,
      status: 'active',
      closed_at: null,
      guarantee_pax: null,
      kpi_show_rate: null,
      targeting: null,
      quote_id: null,
      drive_root_folder_id: null, // Drive 표준 트리 생성은 Phase 5
      slack_webhook_url: null,
      event_type: input.event_type ?? 'general',
      theme: input.theme ?? null,
      venue: input.venue ?? null,
      mc_name: input.mc_name ?? null,
      overview_items: input.overview_items ?? null,
      onboarded_at: null, // §8: S0 완료 전까지 null
      created_by: user.id,
      created_at: nowIso(),
    }
    this.state.projects.push(project)
    // §8: 생성자 = pm 자동
    this.state.members.push({ project_id: project.id, user_id: user.id, role: 'pm' })
    this.log(project.id, `user:${user.id}`, 'project.created', 'project', project.id)
    return project
  }

  async closeProject(projectId: UUID, closed: boolean): Promise<Project> {
    const user = this.assertPm()
    const project = this.mustFindProject(projectId)
    project.status = closed ? 'closed' : 'active'
    project.closed_at = closed ? nowIso() : null
    this.log(projectId, `user:${user.id}`, closed ? 'project.closed' : 'project.reopened', 'project', projectId)
    return project
  }

  async addMember(projectId: UUID, input: MemberInput): Promise<MemberWithProfile> {
    const user = this.assertPm()
    this.assertWritable(projectId)
    const name = input.display_name.trim()
    const email = input.email.trim().toLowerCase()
    if (!name || !email) {
      throw new ProviderError('validation', '이름과 이메일은 필수입니다.')
    }
    // §4-2 invites: unique(project_id, lower(email)) — mock은 즉시 멤버라 멤버 기준으로 검증
    let profile = this.state.users.find((u) => u.email?.toLowerCase() === email)
    if (profile && this.state.members.some((m) => m.project_id === projectId && m.user_id === profile!.id)) {
      throw new ProviderError('conflict', '이미 이 행사의 담당자입니다.')
    }
    if (!profile) {
      profile = { id: this.nextId('usr'), name, email: input.email.trim() }
      this.state.users.push(profile)
    }
    const member: ProjectMember = { project_id: projectId, user_id: profile.id, role: input.role }
    this.state.members.push(member)
    this.log(projectId, `user:${user.id}`, 'member.added', 'project', projectId, {
      user_id: profile.id,
      role: input.role,
    })
    return { ...member, profile }
  }

  async removeMember(projectId: UUID, memberId: UUID): Promise<void> {
    const user = this.assertPm()
    this.assertWritable(projectId)
    const idx = this.state.members.findIndex(
      (m) => m.project_id === projectId && m.user_id === memberId,
    )
    if (idx < 0) throw new ProviderError('not_found', '담당자를 찾을 수 없습니다.')
    // §4-2 앱 레벨 제약: 행사당 pm 최소 1명 — 마지막 PM 삭제 거부
    const target = this.state.members[idx]
    if (
      target.role === 'pm' &&
      this.state.members.filter((m) => m.project_id === projectId && m.role === 'pm').length <= 1
    ) {
      throw new ProviderError('conflict', '마지막 PM은 삭제할 수 없습니다 — 먼저 다른 PM을 지정하세요.')
    }
    this.state.members.splice(idx, 1)
    this.log(projectId, `user:${user.id}`, 'member.removed', 'project', projectId, {
      user_id: memberId,
    })
  }

  // ── 홈 대시보드 ───────────────────────────────────────────────────
  async getDashboard(projectId: UUID): Promise<DashboardData> {
    const user = this.currentUser()
    const project = this.mustFindProject(projectId)
    const pending = this.state.approvals
      .filter((a) => !a.decided_at)
      .map((approval) => {
        const deliverable = this.mustFindDeliverable(approval.deliverable_id)
        const version = this.state.versions.find((v) => v.id === approval.version_id)
        if (!version) throw new ProviderError('not_found', '컨펌 대상 버전이 없습니다.')
        return { approval, deliverable, version }
      })
      .filter(
        ({ deliverable }) =>
          deliverable.project_id === projectId && deliverable.status === 'pending_approval',
      )
      .sort((a, b) => (a.approval.due_at ?? '9999').localeCompare(b.approval.due_at ?? '9999'))

    return {
      project,
      pending_approvals: pending,
      upcoming_milestones: this.state.milestones
        .filter((m) => m.project_id === projectId && !m.done)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
      inbox_count: this.state.unregistered_files.filter(
        (f) => f.project_id === projectId && !f.dismissed && !f.linked_deliverable_id,
      ).length,
      area_progress: this.areaProgress(projectId),
      recent_activity: await this.listActivity(projectId, 10),
      // v1.2: 받은 가이드 — 내가 담당자인 requested 항목, 마감순
      my_requested: this.state.deliverables
        .filter(
          (d) => d.project_id === projectId && d.status === 'requested' && d.assignee_id === user.id,
        )
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
      // v1.4: 지연/임박 WBS 집계 (lib/wbs 정본 산식, 지연·임박 배타)
      wbs_delayed: this.wbsByUrgency(projectId, 'delayed'),
      wbs_imminent: this.wbsByUrgency(projectId, 'imminent'),
    }
  }

  private wbsByUrgency(projectId: UUID, kind: 'delayed' | 'imminent'): WbsTask[] {
    const today = toIsoDate(new Date())
    const pick = kind === 'delayed' ? isDelayed : isImminent
    return this.state.wbs_tasks
      .filter((task) => task.project_id === projectId && pick(task, today))
      .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
  }

  async listActivity(projectId: UUID, limit = 20): Promise<ActivityLogEntry[]> {
    this.mustFindProject(projectId)
    return this.state.activity_log
      .filter((e) => e.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
  }

  // ── 산출물 ────────────────────────────────────────────────────────
  async listDeliverables(projectId: UUID, filter?: DeliverableFilter): Promise<Deliverable[]> {
    this.mustFindProject(projectId)
    return this.state.deliverables.filter(
      (d) =>
        d.project_id === projectId &&
        (!filter?.area || d.area === filter.area) &&
        (!filter?.status || d.status === filter.status) &&
        (!filter?.assignee_id || d.assignee_id === filter.assignee_id),
    )
  }

  async getDeliverable(deliverableId: UUID): Promise<DeliverableDetail> {
    const d = this.mustFindDeliverable(deliverableId)
    return {
      ...d,
      versions: this.versionsOf(deliverableId),
      comments: this.state.comments
        .filter((c) => c.deliverable_id === deliverableId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      approvals: this.state.approvals
        .filter((a) => a.deliverable_id === deliverableId)
        .sort((a, b) => a.requested_at.localeCompare(b.requested_at)),
    }
  }

  async createDeliverable(input: CreateDeliverableInput): Promise<Deliverable> {
    const user = this.currentUser()
    this.assertWritable(input.project_id)
    this.assertAreaRole(input.area, user.role)
    if (!input.title.trim() || !input.category.trim()) {
      throw new ProviderError('validation', '카테고리와 제목은 필수입니다.')
    }
    // v1.2 §8: brief·스펙 포함 시 가이드 발행 — pm 전용, status='requested', 담당자 필수
    const isBriefIssue =
      !!input.brief?.trim() ||
      input.spec_size !== undefined ||
      input.spec_qty !== undefined ||
      input.spec_location !== undefined ||
      input.spec_type !== undefined
    if (isBriefIssue) {
      if (user.role !== 'pm') {
        throw new ProviderError('forbidden', '가이드 발행은 PM만 할 수 있습니다.')
      }
      if (!input.assignee_id) {
        throw new ProviderError('validation', '가이드에는 담당자 지정이 필요합니다.')
      }
    }
    const deliverable: Deliverable = {
      id: this.nextId('dlv'),
      project_id: input.project_id,
      area: input.area,
      category: input.category,
      title: input.title,
      status: isBriefIssue ? 'requested' : 'draft',
      assignee_id: input.assignee_id ?? user.id,
      due_date: input.due_date ?? null,
      drive_folder_id: null, // Drive 폴더 생성은 Phase 5
      requires_approval: input.requires_approval ?? input.area !== 'common',
      brief: input.brief ?? null,
      brief_refs: input.brief_refs ?? null,
      spec_size: input.spec_size ?? null,
      spec_qty: input.spec_qty ?? null,
      spec_location: input.spec_location ?? null,
      spec_type: input.spec_type ?? null,
      content: input.content ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.deliverables.push(deliverable)
    if (isBriefIssue) {
      // §5 부수 효과: 가이드 문서 작성 + 담당자 알림 (Slack 실연동은 Phase 6)
      this.log(deliverable.project_id, `user:${user.id}`, 'deliverable.requested', 'deliverable', deliverable.id, {
        assignee_id: deliverable.assignee_id,
      })
    } else {
      this.log(deliverable.project_id, `user:${user.id}`, 'deliverable.created', 'deliverable', deliverable.id)
    }
    return deliverable
  }

  async transitionStatus(
    deliverableId: UUID,
    to: DeliverableStatus,
    opts?: { comment?: string },
  ): Promise<Deliverable> {
    const user = this.currentUser()
    const d = this.mustFindDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    const rule = assertTransition(d.status, to, 'status_patch')
    if (rule.roles && !rule.roles.includes(user.role)) {
      throw new ProviderError('forbidden', '이 전이를 수행할 권한이 없습니다.')
    }
    // draft→internal_review는 '영역 담당 또는 PM' (§5)
    if (rule.from === 'draft') this.assertAreaRole(d.area, user.role)
    if (rule.requires_comment) {
      if (!opts?.comment?.trim()) {
        throw new ProviderError('validation', '반려 사유 코멘트가 필요합니다.')
      }
      await this.addComment(deliverableId, { body: opts.comment, visibility: 'internal' })
    }
    d.status = to
    d.updated_at = nowIso()
    this.log(d.project_id, `user:${user.id}`, 'status.transitioned', 'deliverable', d.id, { from: rule.from, to })
    return d
  }

  async uploadVersion(deliverableId: UUID, input: UploadVersionInput): Promise<Version> {
    const user = this.currentUser()
    const d = this.mustFindDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    this.assertAreaRole(d.area, user.role)
    if (!UPLOADABLE_STATUSES.includes(d.status)) {
      throw new ProviderError('conflict', `현재 상태(${d.status})에서는 업로드할 수 없습니다.`)
    }
    const versionNo = (this.versionsOf(deliverableId)[0]?.version_no ?? 0) + 1
    const version: Version = {
      id: this.nextId('ver'),
      deliverable_id: deliverableId,
      version_no: versionNo,
      drive_file_id: this.nextId('drv-f'),
      file_name: buildVersionFileName({
        date: new Date(),
        project_code: this.projectOf(d).code,
        category: d.category,
        title: d.title,
        version_no: versionNo,
        original_file_name: input.file_name,
      }),
      note: input.note ?? null,
      uploaded_by: user.id,
      created_at: nowIso(),
    }
    this.state.versions.push(version)

    // Mock 파일 저장: blob URL (테스트 등 비 DOM 환경은 자리표시 URL)
    const canBlob = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    this.uploadedFileUrls.set(
      version.id,
      input.file && canBlob ? URL.createObjectURL(input.file) : `mock://files/${version.id}`,
    )

    // §5: requested(v1.2 첫 업로드)·changes_requested 상태에서 새 버전 업로드 시 draft 자동 전이
    if (d.status === 'requested' || d.status === 'changes_requested') {
      assertTransition(d.status, 'draft', 'version_upload')
      d.status = 'draft'
    }
    d.updated_at = nowIso()
    this.log(d.project_id, `user:${user.id}`, 'version.uploaded', 'version', version.id, {
      deliverable_id: deliverableId,
      version_no: versionNo,
    })
    return version
  }

  async requestApproval(deliverableId: UUID, input: RequestApprovalInput): Promise<Approval> {
    const user = this.currentUser()
    if (user.role !== 'pm') {
      throw new ProviderError('forbidden', '컨펌 발송은 PM만 할 수 있습니다.')
    }
    const d = this.mustFindDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    if (!d.requires_approval) {
      throw new ProviderError('conflict', '컨펌 루프를 사용하지 않는 항목입니다.')
    }
    assertTransition(d.status, 'pending_approval', 'approval_request')
    // v1.3: 큐시트 항목은 발송 시 표의 스냅숏 버전이 자동 등록되어 발송 조건 충족 (§5)
    const version =
      d.category === '큐시트'
        ? await this.createCueSnapshot(deliverableId)
        : this.state.versions.find(
            (v) => v.id === input.version_id && v.deliverable_id === deliverableId,
          )
    if (!version) throw new ProviderError('not_found', '해당 항목의 버전이 아닙니다.')
    // §5 발송 조건: 미리보기 포맷(PDF·PNG·JPG) 버전만
    if (!isPreviewFileName(version.file_name)) {
      throw new ProviderError(
        'validation',
        '컨펌 발송은 미리보기 포맷(PDF·PNG·JPG) 버전만 가능합니다.',
      )
    }
    const approval: Approval = {
      id: this.nextId('apr'),
      deliverable_id: deliverableId,
      version_id: version.id,
      requested_by: user.id,
      requested_at: nowIso(),
      due_at: input.due_at ?? null,
      decided_at: null,
      decision: null,
      client_comment: null,
      decided_via_token: null,
    }
    this.state.approvals.push(approval)
    d.status = 'pending_approval'
    d.updated_at = nowIso()
    this.log(d.project_id, `user:${user.id}`, 'approval.requested', 'approval', approval.id, {
      deliverable_id: deliverableId,
    })
    return approval
  }

  async getFileUrl(versionId: UUID): Promise<string> {
    const uploaded = this.uploadedFileUrls.get(versionId)
    if (uploaded) return uploaded
    const version = this.state.versions.find((v) => v.id === versionId)
    if (!version) throw new ProviderError('not_found', '버전을 찾을 수 없습니다.')
    return placeholderPreviewUrl(version.file_name)
  }

  // ── 코멘트 ────────────────────────────────────────────────────────
  async addComment(deliverableId: UUID, input: AddCommentInput): Promise<Comment> {
    const user = this.currentUser()
    this.assertWritable(this.mustFindDeliverable(deliverableId).project_id)
    if (!input.body.trim()) throw new ProviderError('validation', '코멘트 내용이 비어 있습니다.')
    const comment: Comment = {
      id: this.nextId('cmt'),
      deliverable_id: deliverableId,
      author_user_id: user.id,
      author_token: null,
      visibility: input.visibility ?? 'internal',
      body: input.body,
      created_at: nowIso(),
    }
    this.state.comments.push(comment)
    return comment
  }

  // ── 일정·마일스톤 ─────────────────────────────────────────────────
  async listMilestones(projectId: UUID): Promise<Milestone[]> {
    this.mustFindProject(projectId)
    return this.state.milestones
      .filter((m) => m.project_id === projectId)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  }

  async createMilestone(projectId: UUID, input: MilestoneInput): Promise<Milestone> {
    this.currentUser()
    this.assertWritable(projectId)
    const milestone: Milestone = {
      id: this.nextId('mls'),
      project_id: projectId,
      title: input.title,
      area: input.area ?? null,
      due_date: input.due_date,
      done: false,
    }
    this.state.milestones.push(milestone)
    return milestone
  }

  async updateMilestone(
    milestoneId: UUID,
    patch: Partial<MilestoneInput> & { done?: boolean },
  ): Promise<Milestone> {
    this.currentUser()
    const m = this.state.milestones.find((x) => x.id === milestoneId)
    if (!m) throw new ProviderError('not_found', '마일스톤을 찾을 수 없습니다.')
    this.assertWritable(m.project_id)
    if (patch.title !== undefined) m.title = patch.title
    if (patch.area !== undefined) m.area = patch.area ?? null
    if (patch.due_date !== undefined) m.due_date = patch.due_date
    if (patch.done !== undefined) m.done = patch.done
    return m
  }

  async deleteMilestone(milestoneId: UUID): Promise<void> {
    this.currentUser()
    const idx = this.state.milestones.findIndex((x) => x.id === milestoneId)
    if (idx < 0) throw new ProviderError('not_found', '마일스톤을 찾을 수 없습니다.')
    this.assertWritable(this.state.milestones[idx].project_id)
    this.state.milestones.splice(idx, 1)
  }

  // ── 등록 (pm·reg — §6.1 등록 데이터 CRUD) ─────────────────────────
  private assertRegRole(): CurrentUser {
    const user = this.currentUser()
    if (user.role !== 'pm' && user.role !== 'reg') {
      throw new ProviderError('forbidden', '등록 데이터 권한이 없습니다.')
    }
    return user
  }

  async listRsvpContacts(projectId: UUID): Promise<RsvpContact[]> {
    this.mustFindProject(projectId)
    return this.state.rsvp_contacts.filter((r) => r.project_id === projectId)
  }

  async updateRsvpContact(rsvpId: UUID, patch: RsvpContactPatch): Promise<RsvpContact> {
    this.assertRegRole()
    const r = this.state.rsvp_contacts.find((x) => x.id === rsvpId)
    if (!r) throw new ProviderError('not_found', 'RSVP 대상을 찾을 수 없습니다.')
    this.assertWritable(r.project_id)
    if (patch.invite_status !== undefined) {
      r.invite_status = patch.invite_status
      if (patch.invite_status === 'sent' && !r.invited_at) r.invited_at = nowIso()
      if ((patch.invite_status === 'accepted' || patch.invite_status === 'declined') && !r.responded_at) {
        r.responded_at = nowIso()
      }
    }
    if (patch.invited_at !== undefined) r.invited_at = patch.invited_at
    if (patch.responded_at !== undefined) r.responded_at = patch.responded_at
    if (patch.group_tag !== undefined) r.group_tag = patch.group_tag
    if (patch.memo !== undefined) r.memo = patch.memo
    return r
  }

  async listAttendees(projectId: UUID): Promise<AttendeeWithRsvp[]> {
    this.mustFindProject(projectId)
    return this.state.attendees
      .filter((a) => a.project_id === projectId)
      .map((a) => ({
        ...a,
        rsvp_group_tag:
          this.state.rsvp_contacts.find((r) => r.id === a.rsvp_contact_id)?.group_tag ?? null,
      }))
  }

  async importRegistrationCsv(
    projectId: UUID,
    target: 'rsvp' | 'attendees',
    rows: CsvImportRow[],
  ): Promise<CsvImportResult> {
    this.assertRegRole()
    this.assertWritable(projectId)
    let inserted = 0
    let updated = 0
    for (const row of rows) {
      if (!row.name?.trim()) continue
      const emailKey = row.email?.trim().toLowerCase() || null
      if (target === 'rsvp') {
        const existing = emailKey
          ? this.state.rsvp_contacts.find(
              (r) => r.project_id === projectId && r.email?.toLowerCase() === emailKey,
            )
          : undefined
        if (existing) {
          existing.name = row.name
          existing.org = row.org ?? existing.org
          existing.title = row.title ?? existing.title
          existing.phone = row.phone ?? existing.phone
          existing.group_tag = row.group_tag ?? existing.group_tag
          existing.memo = row.memo ?? existing.memo
          updated++
        } else {
          this.state.rsvp_contacts.push({
            id: this.nextId('rsv'),
            project_id: projectId,
            name: row.name,
            org: row.org ?? null,
            title: row.title ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            group_tag: row.group_tag ?? null,
            invite_status: 'none',
            invited_at: null,
            responded_at: null,
            memo: row.memo ?? null,
          })
          inserted++
        }
      } else {
        const existing = emailKey
          ? this.state.attendees.find(
              (a) => a.project_id === projectId && a.email?.toLowerCase() === emailKey,
            )
          : undefined
        if (existing) {
          existing.name = row.name
          existing.org = row.org ?? existing.org
          existing.phone = row.phone ?? existing.phone
          updated++
        } else {
          this.state.attendees.push({
            id: this.nextId('att'),
            project_id: projectId,
            rsvp_contact_id: null,
            name: row.name,
            org: row.org ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            channel: 'import',
            registered_at: nowIso(),
            checked_in_at: null,
            badge_no: null,
          })
          inserted++
        }
      }
    }
    return { inserted, updated }
  }

  async toggleCheckin(attendeeId: UUID): Promise<Attendee> {
    this.assertRegRole()
    const a = this.state.attendees.find((x) => x.id === attendeeId)
    if (!a) throw new ProviderError('not_found', '참관객을 찾을 수 없습니다.')
    this.assertWritable(a.project_id)
    a.checked_in_at = a.checked_in_at ? null : nowIso()
    return a
  }

  async convertRsvpToAttendee(rsvpId: UUID): Promise<Attendee> {
    this.assertRegRole()
    const r = this.state.rsvp_contacts.find((x) => x.id === rsvpId)
    if (!r) throw new ProviderError('not_found', 'RSVP 대상을 찾을 수 없습니다.')
    this.assertWritable(r.project_id)
    if (this.state.attendees.some((a) => a.rsvp_contact_id === rsvpId)) {
      throw new ProviderError('conflict', '이미 참관객으로 전환된 대상입니다.')
    }
    const attendee: Attendee = {
      id: this.nextId('att'),
      project_id: r.project_id,
      rsvp_contact_id: r.id,
      name: r.name,
      org: r.org,
      email: r.email,
      phone: r.phone,
      channel: 'rsvp',
      registered_at: nowIso(),
      checked_in_at: null,
      badge_no: null,
    }
    this.state.attendees.push(attendee)
    return attendee
  }

  async getRegistrationStats(projectId: UUID): Promise<RegistrationStats> {
    this.mustFindProject(projectId)
    const rsvps = this.state.rsvp_contacts.filter((r) => r.project_id === projectId)
    const attendees = this.state.attendees.filter((a) => a.project_id === projectId)
    const sent = rsvps.filter((r) => r.invite_status !== 'none').length
    const accepted = rsvps.filter((r) => r.invite_status === 'accepted').length
    const declined = rsvps.filter((r) => r.invite_status === 'declined').length
    const checkedIn = attendees.filter((a) => a.checked_in_at).length
    return {
      rsvp_total: rsvps.length,
      rsvp_sent: sent,
      rsvp_accepted: accepted,
      rsvp_declined: declined,
      response_rate: sent === 0 ? 0 : (accepted + declined) / sent,
      attendee_total: attendees.length,
      checked_in: checkedIn,
      checkin_rate: attendees.length === 0 ? 0 : checkedIn / attendees.length,
    }
  }

  // ── 설정 (pm 전용 — §6.1) ─────────────────────────────────────────
  private assertPm(): CurrentUser {
    const user = this.currentUser()
    if (user.role !== 'pm') throw new ProviderError('forbidden', 'PM 전용 기능입니다.')
    return user
  }

  async listClientContacts(projectId: UUID): Promise<ClientContact[]> {
    this.mustFindProject(projectId)
    return this.state.client_contacts.filter((c) => c.project_id === projectId)
  }

  async createClientContact(input: ClientContactInput): Promise<ClientContact> {
    this.assertPm()
    this.assertWritable(input.project_id)
    const contact: ClientContact = {
      id: this.nextId('cct'),
      project_id: input.project_id,
      name: input.name,
      org: input.org ?? null,
      email: input.email ?? null,
    }
    this.state.client_contacts.push(contact)
    return contact
  }

  async listClientTokens(projectId: UUID): Promise<ClientToken[]> {
    this.assertPm()
    this.mustFindProject(projectId)
    return this.state.client_tokens.filter((t) => t.project_id === projectId)
  }

  async issueClientToken(input: IssueTokenInput): Promise<ClientToken> {
    const user = this.assertPm()
    const project = this.assertWritable(input.project_id)
    // §4 무결성 보조: contact의 project_id 일치를 앱 레벨에서 검증(교차 프로젝트 차단)
    const contact = this.state.client_contacts.find(
      (c) => c.id === input.contact_id && c.project_id === input.project_id,
    )
    if (!contact) throw new ProviderError('validation', '이 프로젝트의 연락처가 아닙니다.')
    let expires = input.expires_at ?? null
    if (!expires && project.event_date) {
      const d = new Date(`${project.event_date}T00:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() + 30) // §6.3 기본 만료 = 행사일+30일
      expires = d.toISOString()
    }
    const token: ClientToken = {
      token: this.nextId('tok'),
      project_id: input.project_id,
      contact_id: input.contact_id,
      expires_at: expires,
      revoked_at: null,
      last_seen_at: null,
      created_at: nowIso(),
    }
    this.state.client_tokens.push(token)
    this.log(input.project_id, `user:${user.id}`, 'token.issued', 'client_token', token.token)
    return token
  }

  async revokeClientToken(token: string): Promise<ClientToken> {
    const user = this.assertPm()
    const t = this.state.client_tokens.find((x) => x.token === token)
    if (!t) throw new ProviderError('not_found', '토큰을 찾을 수 없습니다.')
    if (!t.revoked_at) t.revoked_at = nowIso()
    this.log(t.project_id, `user:${user.id}`, 'token.revoked', 'client_token', t.token)
    return t
  }

  // ── 미등록 파일 인박스 ────────────────────────────────────────────
  async listInbox(projectId: UUID): Promise<UnregisteredFile[]> {
    this.mustFindProject(projectId)
    return this.state.unregistered_files.filter(
      (f) => f.project_id === projectId && !f.dismissed && !f.linked_deliverable_id,
    )
  }

  async linkInboxFile(inboxId: UUID, deliverableId: UUID): Promise<Version> {
    const user = this.currentUser()
    const f = this.state.unregistered_files.find((x) => x.id === inboxId)
    if (!f) throw new ProviderError('not_found', '인박스 파일을 찾을 수 없습니다.')
    if (f.dismissed || f.linked_deliverable_id) {
      throw new ProviderError('conflict', '이미 처리된 인박스 파일입니다.')
    }
    const d = this.mustFindDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    this.assertAreaRole(d.area, user.role)
    if (!UPLOADABLE_STATUSES.includes(d.status)) {
      throw new ProviderError('conflict', `현재 상태(${d.status})에서는 버전을 추가할 수 없습니다.`)
    }
    const versionNo = (this.versionsOf(deliverableId)[0]?.version_no ?? 0) + 1
    // §7.3: 직접 업로드 파일의 rename은 기본 off — 파일명을 그대로 보존
    const version: Version = {
      id: this.nextId('ver'),
      deliverable_id: deliverableId,
      version_no: versionNo,
      drive_file_id: f.drive_file_id,
      file_name: f.file_name ?? `unnamed-${f.drive_file_id}`,
      note: '인박스에서 연결됨',
      uploaded_by: user.id,
      created_at: nowIso(),
    }
    this.state.versions.push(version)
    f.linked_deliverable_id = deliverableId
    // §5: 인박스 연결도 requested(v1.2)·changes_requested → draft 자동 전이
    if (d.status === 'requested' || d.status === 'changes_requested') {
      assertTransition(d.status, 'draft', 'version_upload')
      d.status = 'draft'
    }
    d.updated_at = nowIso()
    this.log(d.project_id, `user:${user.id}`, 'inbox.linked', 'version', version.id, {
      deliverable_id: deliverableId,
    })
    return version
  }

  async dismissInboxFile(inboxId: UUID): Promise<void> {
    const user = this.currentUser()
    const f = this.state.unregistered_files.find((x) => x.id === inboxId)
    if (!f) throw new ProviderError('not_found', '인박스 파일을 찾을 수 없습니다.')
    this.assertWritable(f.project_id)
    f.dismissed = true
    this.log(f.project_id, `user:${user.id}`, 'inbox.dismissed', 'unregistered_file', f.id)
  }

  // ── v1.2 프로그램표·행사개요·운영계획서 ───────────────────────────
  /** §6.1: 행사개요·프로그램표·큐시트 편집은 pm·ops만 */
  private assertPmOps(): CurrentUser {
    const user = this.currentUser()
    if (user.role !== 'pm' && user.role !== 'ops') {
      throw new ProviderError('forbidden', '이 편집은 PM·운영 담당만 가능합니다.')
    }
    return user
  }

  async listProgramSessions(projectId: UUID): Promise<ProgramSession[]> {
    this.mustFindProject(projectId)
    return this.state.program_sessions
      .filter((s) => s.project_id === projectId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async createProgramSession(projectId: UUID, input: ProgramSessionInput): Promise<ProgramSession> {
    this.assertPmOps()
    this.assertWritable(projectId)
    if (!input.title.trim()) throw new ProviderError('validation', '세션 제목은 필수입니다.')
    const maxOrder = this.state.program_sessions
      .filter((s) => s.project_id === projectId)
      .reduce((m, s) => Math.max(m, s.sort_order), 0)
    const session: ProgramSession = {
      id: this.nextId('pgs'),
      project_id: projectId,
      section: input.section?.trim() || null,
      start_time: input.start_time || null,
      end_time: input.end_time || null,
      title: input.title,
      speaker_name: input.speaker_name?.trim() || null,
      speaker_title: input.speaker_title?.trim() || null,
      speaker_org: input.speaker_org?.trim() || null,
      note: input.note?.trim() || null,
      sort_order: input.sort_order ?? maxOrder + 1,
    }
    this.state.program_sessions.push(session)
    return session
  }

  async updateProgramSession(
    sessionId: UUID,
    patch: Partial<ProgramSessionInput>,
  ): Promise<ProgramSession> {
    this.assertPmOps()
    const s = this.state.program_sessions.find((x) => x.id === sessionId)
    if (!s) throw new ProviderError('not_found', '프로그램 세션을 찾을 수 없습니다.')
    this.assertWritable(s.project_id)
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ProviderError('validation', '세션 제목은 필수입니다.')
      s.title = patch.title
    }
    if (patch.section !== undefined) s.section = patch.section.trim() || null
    if (patch.start_time !== undefined) s.start_time = patch.start_time || null
    if (patch.end_time !== undefined) s.end_time = patch.end_time || null
    if (patch.speaker_name !== undefined) s.speaker_name = patch.speaker_name.trim() || null
    if (patch.speaker_title !== undefined) s.speaker_title = patch.speaker_title.trim() || null
    if (patch.speaker_org !== undefined) s.speaker_org = patch.speaker_org.trim() || null
    if (patch.note !== undefined) s.note = patch.note.trim() || null
    if (patch.sort_order !== undefined) s.sort_order = patch.sort_order
    return s
  }

  async deleteProgramSession(sessionId: UUID): Promise<void> {
    this.assertPmOps()
    const idx = this.state.program_sessions.findIndex((x) => x.id === sessionId)
    if (idx < 0) throw new ProviderError('not_found', '프로그램 세션을 찾을 수 없습니다.')
    this.assertWritable(this.state.program_sessions[idx].project_id)
    this.state.program_sessions.splice(idx, 1)
  }

  async updateProjectOverview(projectId: UUID, patch: ProjectOverviewPatch): Promise<Project> {
    const user = this.assertPmOps()
    const project = this.assertWritable(projectId)
    if (patch.event_date !== undefined) project.event_date = patch.event_date
    if (patch.theme !== undefined) project.theme = patch.theme
    if (patch.venue !== undefined) project.venue = patch.venue
    if (patch.mc_name !== undefined) project.mc_name = patch.mc_name
    if (patch.overview_items !== undefined) project.overview_items = patch.overview_items
    this.log(projectId, `user:${user.id}`, 'project.overview_updated', 'project', project.id)
    return project
  }

  // ── v1.3 프로젝트 기본정보·온보딩 (v1.5: 개요 전 필드 §8 PATCH /projects/{id}) ──
  async updateProject(projectId: UUID, patch: ProjectPatch): Promise<Project> {
    const user = this.assertPm()
    const project = this.assertWritable(projectId)
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ProviderError('validation', '행사명은 비울 수 없습니다.')
      project.name = patch.name
    }
    if (patch.code !== undefined) {
      const code = patch.code.trim()
      if (!code) throw new ProviderError('validation', '행사 코드는 비울 수 없습니다.')
      if (this.state.projects.some((p) => p.id !== projectId && p.code === code)) {
        throw new ProviderError('conflict', '이미 사용 중인 행사 코드입니다.')
      }
      project.code = code
    }
    if (patch.event_date !== undefined) project.event_date = patch.event_date
    if (patch.event_type !== undefined) project.event_type = patch.event_type
    if (patch.event_end_date !== undefined) project.event_end_date = patch.event_end_date
    if (patch.start_time !== undefined) project.start_time = patch.start_time
    if (patch.end_time !== undefined) project.end_time = patch.end_time
    if (patch.venue !== undefined) project.venue = patch.venue
    if (patch.expected_headcount !== undefined) project.expected_headcount = patch.expected_headcount
    if (patch.seating !== undefined) project.seating = patch.seating
    if (patch.theme !== undefined) project.theme = patch.theme
    if (patch.organizer !== undefined) project.organizer = patch.organizer
    if (patch.mc_name !== undefined) project.mc_name = patch.mc_name
    if (patch.target_audience !== undefined) project.target_audience = patch.target_audience
    if (patch.overview_items !== undefined) project.overview_items = patch.overview_items
    // v2.0 — 행사 설정 ① 모객형 전용 그룹 (일반형이면 UI 숨김·데이터 보존)
    if (patch.guarantee_pax !== undefined) project.guarantee_pax = patch.guarantee_pax
    if (patch.kpi_show_rate !== undefined) project.kpi_show_rate = patch.kpi_show_rate
    if (patch.targeting !== undefined) project.targeting = patch.targeting
    // v2.0 — "견적 연결" 액션: app_role admin·sales 전용 (§6.1·§10), 상호 링크 동기화
    if (patch.quote_id !== undefined) {
      if (user.app_role !== 'admin' && user.app_role !== 'sales') {
        throw new ProviderError('forbidden', '견적 연결은 영업·관리자 권한이 필요합니다.')
      }
      if (patch.quote_id === null) {
        const prev = this.state.quotes.find((q) => q.id === project.quote_id)
        if (prev) prev.project_id = null
        project.quote_id = null
      } else {
        const quote = this.mustFindQuote(patch.quote_id)
        if (quote.project_id && quote.project_id !== projectId) {
          throw new ProviderError('conflict', '이미 다른 행사에 연결된 견적입니다.')
        }
        quote.project_id = projectId
        project.quote_id = quote.id
      }
    }
    // 행사일·유형 변경 후 WBS 날짜/구성 갱신은 명시적 재전개(expandWbs)로 수행 — S5 pm 배너·버튼
    this.log(projectId, `user:${user.id}`, 'project.updated', 'project', project.id)
    return project
  }

  async getOnboardingStatus(projectId: UUID): Promise<OnboardingStatus> {
    const project = this.mustFindProject(projectId)
    // v1.4.1 — 정본은 projects.onboarded_at: completed는 파생값
    return { completed: project.onboarded_at !== null, onboarded_at: project.onboarded_at }
  }

  async completeOnboarding(projectId: UUID): Promise<void> {
    const user = this.assertPm()
    const project = this.assertWritable(projectId)
    if (project.onboarded_at !== null) {
      throw new ProviderError('conflict', '이미 온보딩이 완료된 프로젝트입니다.')
    }
    project.onboarded_at = new Date().toISOString()
    // v1.4 부수 효과: 유형별 WBS 자동 전개 + R&R 카드 시드
    await this.expandWbs(projectId)
    this.seedRoleCharters(projectId)
    // v2.0 부수 효과: 컴플라이언스 카드 2종 시드 (§4-17)
    this.seedComplianceCards(projectId)
    this.log(projectId, `user:${user.id}`, 'onboarding.completed', 'project', projectId)
  }

  /** Mock 전용 (인터페이스 외) — S0 라우트 가드 테스트용 온보딩 리셋 (v1.4.1: onboarded_at=null 복원).
   *  대상 미지정 시 픽스처 첫 행사(샘플 테크 컨퍼런스) 기준 — 기존 테스트 시그니처 유지 */
  resetOnboarding(projectId?: UUID): void {
    const project = projectId ? this.mustFindProject(projectId) : this.state.projects[0]
    project.onboarded_at = null
  }

  // ── v1.3 큐시트 (pm·ops — §8 /cues) ───────────────────────────────
  async listCues(deliverableId: UUID): Promise<Cue[]> {
    this.mustFindDeliverable(deliverableId)
    return this.state.cues
      .filter((c) => c.deliverable_id === deliverableId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async createCue(deliverableId: UUID, input: CueInput): Promise<Cue> {
    this.assertPmOps()
    this.assertWritable(this.mustFindDeliverable(deliverableId).project_id)
    const siblings = await this.listCues(deliverableId)
    const maxOrder = siblings.reduce((m, c) => Math.max(m, c.sort_order), 0)
    const cue: Cue = {
      id: this.nextId('cue'),
      deliverable_id: deliverableId,
      cue_no: input.cue_no?.trim() || null,
      time_at: input.time_at || null,
      segment: input.segment?.trim() || null,
      body: input.body ?? null,
      console_audio: input.console_audio?.trim() || null,
      console_light: input.console_light?.trim() || null,
      console_screen: input.console_screen?.trim() || null,
      sort_order: input.sort_order ?? maxOrder + 1,
    }
    this.state.cues.push(cue)
    return cue
  }

  async updateCue(cueId: UUID, patch: Partial<CueInput>): Promise<Cue> {
    this.assertPmOps()
    const cue = this.state.cues.find((c) => c.id === cueId)
    if (!cue) throw new ProviderError('not_found', '큐를 찾을 수 없습니다.')
    this.assertWritable(this.mustFindDeliverable(cue.deliverable_id).project_id)
    if (patch.cue_no !== undefined) cue.cue_no = patch.cue_no.trim() || null
    if (patch.time_at !== undefined) cue.time_at = patch.time_at || null
    if (patch.segment !== undefined) cue.segment = patch.segment.trim() || null
    if (patch.body !== undefined) cue.body = patch.body || null
    if (patch.console_audio !== undefined) cue.console_audio = patch.console_audio.trim() || null
    if (patch.console_light !== undefined) cue.console_light = patch.console_light.trim() || null
    if (patch.console_screen !== undefined) cue.console_screen = patch.console_screen.trim() || null
    if (patch.sort_order !== undefined) cue.sort_order = patch.sort_order
    return cue
  }

  async deleteCue(cueId: UUID): Promise<void> {
    this.assertPmOps()
    const idx = this.state.cues.findIndex((c) => c.id === cueId)
    if (idx < 0) throw new ProviderError('not_found', '큐를 찾을 수 없습니다.')
    this.assertWritable(this.mustFindDeliverable(this.state.cues[idx].deliverable_id).project_id)
    this.state.cues.splice(idx, 1)
  }

  async createCueSnapshot(deliverableId: UUID): Promise<Version> {
    const user = this.assertPm()
    const d = this.mustFindDeliverable(deliverableId)
    if (d.category !== '큐시트') {
      throw new ProviderError('conflict', '큐시트 항목이 아닙니다.')
    }
    const cues = await this.listCues(deliverableId)
    if (cues.length === 0) {
      throw new ProviderError('validation', '스냅숏을 만들 큐가 없습니다.')
    }
    const versionNo = (this.versionsOf(deliverableId)[0]?.version_no ?? 0) + 1
    const version: Version = {
      id: this.nextId('ver'),
      deliverable_id: deliverableId,
      version_no: versionNo,
      drive_file_id: this.nextId('drv-f'),
      // 파일명은 .pdf 규약(§5 발송 조건) — mock 내용물은 인쇄용 HTML, 실제 PDF는 Phase 5
      file_name: buildVersionFileName({
        date: new Date(),
        project_code: this.projectOf(d).code,
        category: d.category,
        title: d.title,
        version_no: versionNo,
        original_file_name: '스냅숏.pdf',
      }),
      note: '큐시트 스냅숏 — 컨펌 발송용 자동 생성',
      uploaded_by: user.id,
      created_at: nowIso(),
    }
    this.state.versions.push(version)
    const canBlob =
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof Blob !== 'undefined'
    this.uploadedFileUrls.set(
      version.id,
      canBlob
        ? URL.createObjectURL(new Blob([renderCueSnapshotHtml(d, cues)], { type: 'text/html' }))
        : `mock://files/${version.id}`,
    )
    this.log(d.project_id, `user:${user.id}`, 'cue.snapshot', 'version', version.id, {
      deliverable_id: deliverableId,
    })
    return version
  }

  // ── v1.4 WBS·R&R ──────────────────────────────────────────────────
  async expandWbs(projectId: UUID): Promise<WbsTask[]> {
    const user = this.assertPm()
    const project = this.assertWritable(projectId)
    if (!project.event_date) {
      throw new ProviderError('validation', '행사일이 있어야 WBS를 전개할 수 있습니다.')
    }
    const template = wbsTemplateFor(project.event_type)
    // 재전개: code 매칭으로 기존 진행 상태·연결·메모 보존 (설계서 v1.4.1 §4-15) —
    // v1.5: 다른 행사 태스크는 건드리지 않는다(프로젝트 단위 치환)
    const mine = this.state.wbs_tasks.filter((task) => task.project_id === projectId)
    const others = this.state.wbs_tasks.filter((task) => task.project_id !== projectId)
    const prev = new Map(mine.map((task) => [task.code, task]))
    const expanded = template.map((tpl, i) => {
      const old = prev.get(tpl.code)
      return {
        id: old?.id ?? this.nextId('wbs'),
        project_id: projectId,
        phase_no: tpl.phase_no,
        phase_name: tpl.phase_name,
        code: tpl.code,
        title: tpl.title,
        offset_start: tpl.offset_start,
        offset_end: tpl.offset_end,
        start_date: offsetToDate(project.event_date!, tpl.offset_start),
        end_date: offsetToDate(project.event_date!, tpl.offset_end),
        role: tpl.role,
        origin_role: tpl.origin_role,
        status: old?.status ?? ('todo' as const),
        done_at: old?.done_at ?? null,
        linked_deliverable_id: old?.linked_deliverable_id ?? null,
        target: tpl.target, // v2.0 §4-15b — 소통 대상은 템플릿 정본에서 재시드
        note: old?.note ?? null,
        sort_order: i + 1,
      }
    })
    this.state.wbs_tasks = [...others, ...expanded]
    this.log(projectId, `user:${user.id}`, 'wbs.expanded', 'project', projectId, {
      event_type: project.event_type,
      count: expanded.length,
    })
    return [...expanded]
  }

  private seedRoleCharters(projectId: UUID): void {
    const project = this.mustFindProject(projectId)
    const others = this.state.role_charters.filter((c) => c.project_id !== projectId)
    const seeded = ROLE_CHARTER_TEMPLATES[project.event_type].map((tpl) => ({
      id: this.nextId('rrc'),
      project_id: projectId,
      role: tpl.role,
      origin_role: tpl.origin_role,
      title: tpl.title,
      items: [...tpl.items],
    }))
    this.state.role_charters = [...others, ...seeded]
  }

  async listWbsTasks(projectId: UUID, filter?: WbsTaskFilter): Promise<WbsTask[]> {
    this.mustFindProject(projectId)
    return this.state.wbs_tasks
      .filter(
        (task) =>
          task.project_id === projectId &&
          (filter?.phase_no === undefined || task.phase_no === filter.phase_no) &&
          (filter?.role === undefined || task.role === filter.role) &&
          (filter?.status === undefined || task.status === filter.status),
      )
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async updateWbsTask(taskId: UUID, patch: WbsTaskPatch): Promise<WbsTask> {
    const user = this.currentUser()
    const task = this.state.wbs_tasks.find((t) => t.id === taskId)
    if (!task) throw new ProviderError('not_found', 'WBS 태스크를 찾을 수 없습니다.')
    this.assertWritable(task.project_id)
    // §6.1·S5: status 체크 = 담당 역할+pm / 그 외 필드 편집 = pm 전용
    const editKeys = Object.keys(patch).filter((k) => k !== 'status')
    if (editKeys.length > 0 && user.role !== 'pm') {
      throw new ProviderError('forbidden', '태스크 편집은 PM만 할 수 있습니다.')
    }
    if (patch.status !== undefined && user.role !== 'pm' && user.role !== task.role) {
      throw new ProviderError('forbidden', '태스크 체크는 담당 역할과 PM만 할 수 있습니다.')
    }
    if (patch.status !== undefined && patch.status !== task.status) {
      task.status = patch.status
      task.done_at = patch.status === 'done' ? nowIso() : null
      this.log(task.project_id, `user:${user.id}`, 'wbs.status_changed', 'wbs_task', task.id, {
        status: patch.status,
      })
    }
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ProviderError('validation', '태스크 제목은 필수입니다.')
      task.title = patch.title
    }
    if (patch.start_date !== undefined) task.start_date = patch.start_date
    if (patch.end_date !== undefined) task.end_date = patch.end_date
    if (patch.role !== undefined) task.role = patch.role
    if (patch.note !== undefined) task.note = patch.note
    if (patch.linked_deliverable_id !== undefined) {
      if (patch.linked_deliverable_id) this.mustFindDeliverable(patch.linked_deliverable_id)
      task.linked_deliverable_id = patch.linked_deliverable_id
    }
    return task
  }

  async listRoleCharters(projectId: UUID): Promise<RoleCharter[]> {
    this.mustFindProject(projectId)
    return this.state.role_charters.filter((c) => c.project_id === projectId)
  }

  // ── v2.0 견적 S-2 (§8 /quotes — app_role 게이트, 금액은 이 경로에만) ──
  /** §6.1: 견적 생성·버전·확정·Excel = app_role admin·sales만 (프로젝트 역할과 무관) */
  private assertQuoteRole(): CurrentUser {
    const user = this.currentUser()
    if (user.app_role !== 'admin' && user.app_role !== 'sales') {
      throw new ProviderError('forbidden', '견적 메뉴는 영업·관리자 권한이 필요합니다.')
    }
    return user
  }

  private mustFindQuote(quoteId: UUID): Quote {
    const quote = this.state.quotes.find((q) => q.id === quoteId)
    if (!quote) throw new ProviderError('not_found', '견적을 찾을 수 없습니다.')
    return quote
  }

  async listQuotes(): Promise<Quote[]> {
    this.assertQuoteRole()
    return [...this.state.quotes].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.version - b.version,
    )
  }

  async getQuote(quoteId: UUID): Promise<Quote> {
    const user = this.currentUser()
    const quote = this.mustFindQuote(quoteId)
    const hasQuoteRole = user.app_role === 'admin' || user.app_role === 'sales'
    // §6.1: 연결 행사의 pm은 요약 열람 허용
    const isLinkedPm =
      !!quote.project_id &&
      this.state.members.some(
        (m) => m.project_id === quote.project_id && m.user_id === user.id && m.role === 'pm',
      )
    if (!hasQuoteRole && !isLinkedPm) {
      throw new ProviderError('forbidden', '견적 메뉴는 영업·관리자 권한이 필요합니다.')
    }
    return quote
  }

  async createQuote(input: QuoteInput): Promise<Quote> {
    const user = this.assertQuoteRole()
    // §8: breakdown·total_amount는 provider가 엔진으로 재계산해 저장 (클라이언트 값 불신)
    const { breakdown, total_amount } = computeQuoteOutputs(input)
    const quote: Quote = {
      id: this.nextId('quo'),
      project_id: null,
      title: input.event_name?.trim() || '새 견적',
      version: 1,
      status: 'draft',
      is_final: false,
      locked_at: null,
      superseded_by: null,
      input: structuredClone(input),
      breakdown,
      total_amount,
      created_by: user.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.quotes.push(quote)
    return quote
  }

  async saveQuoteVersion(quoteId: UUID, input: QuoteInput): Promise<Quote> {
    const user = this.assertQuoteRole()
    const prev = this.mustFindQuote(quoteId)
    if (prev.superseded_by) {
      throw new ProviderError('conflict', '이미 새 버전이 있는 견적입니다 — 최신 버전에서 수정하세요.')
    }
    const { breakdown, total_amount } = computeQuoteOutputs(input)
    const next: Quote = {
      id: this.nextId('quo'),
      project_id: prev.project_id,
      title: input.event_name?.trim() || prev.title,
      version: prev.version + 1,
      status: 'draft',
      is_final: false,
      locked_at: null,
      superseded_by: null,
      input: structuredClone(input),
      breakdown,
      total_amount,
      created_by: user.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    // §4-18: 확정본은 잠금 유지(archived는 finalize에서), 미확정 이전 버전은 superseded 체인
    prev.superseded_by = next.id
    if (!prev.is_final) prev.status = 'superseded'
    prev.updated_at = nowIso()
    this.state.quotes.push(next)
    return next
  }

  async finalizeQuote(quoteId: UUID): Promise<Quote> {
    const user = this.assertQuoteRole()
    const quote = this.mustFindQuote(quoteId)
    if (quote.is_final) throw new ProviderError('conflict', '이미 확정된 견적입니다.')
    if (quote.superseded_by) {
      throw new ProviderError('conflict', '새 버전이 있는 견적은 확정할 수 없습니다 — 최신 버전을 확정하세요.')
    }
    // §8: 같은 프로젝트의 다른 final은 archived (uq_quote_final_per_project)
    if (quote.project_id) {
      for (const other of this.state.quotes) {
        if (other.id !== quote.id && other.project_id === quote.project_id && other.is_final) {
          other.is_final = false
          other.status = 'archived'
          other.updated_at = nowIso()
        }
      }
    }
    quote.is_final = true
    quote.locked_at = nowIso()
    quote.status = 'accepted'
    quote.updated_at = nowIso()
    if (quote.project_id) {
      const project = this.state.projects.find((p) => p.id === quote.project_id)
      if (project) project.quote_id = quote.id
      // §12: 활동 로그에 금액 필드 포함 금지 — 식별자만 기록
      this.log(quote.project_id, `user:${user.id}`, 'quote.finalized', 'quote', quote.id)
    }
    return quote
  }

  async createProjectFromQuote(quoteId: UUID): Promise<Project> {
    const user = this.assertQuoteRole()
    const quote = this.mustFindQuote(quoteId)
    if (!quote.is_final) {
      throw new ProviderError('conflict', '확정된 견적에서만 행사를 만들 수 있습니다.')
    }
    if (quote.project_id) {
      throw new ProviderError('conflict', '이미 행사가 연결된 견적입니다.')
    }
    // §16 매핑 — 금액·섹션 산출은 어떤 키로도 넘기지 않는다
    const draft = quoteToProjectDraft(quote)
    let code = draft.code_suggestion
    let suffix = 2
    while (this.state.projects.some((p) => p.code === code)) {
      code = `${draft.code_suggestion}-${suffix++}`
    }
    const project: Project = {
      id: this.nextId('prj'),
      name: draft.name,
      code,
      event_date: draft.event_date,
      event_end_date: draft.event_end_date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      expected_headcount: draft.expected_headcount,
      seating: draft.seating,
      organizer: draft.organizer,
      target_audience: draft.target_audience,
      status: 'active',
      closed_at: null,
      guarantee_pax: draft.guarantee_pax,
      kpi_show_rate: draft.kpi_show_rate,
      targeting: draft.targeting,
      quote_id: quote.id,
      drive_root_folder_id: null,
      slack_webhook_url: null,
      event_type: draft.event_type,
      theme: null,
      venue: draft.venue,
      mc_name: null,
      overview_items: draft.overview_items,
      onboarded_at: null, // §8: S0 ① 프리필 상태로 진입 — 완료는 S0 위저드에서
      created_by: user.id,
      created_at: nowIso(),
    }
    this.state.projects.push(project)
    this.state.members.push({ project_id: project.id, user_id: user.id, role: 'pm' })
    // 상호 링크 (§16 — 한 트랜잭션)
    quote.project_id = project.id
    quote.updated_at = nowIso()
    this.log(project.id, `user:${user.id}`, 'project.created_from_quote', 'project', project.id, {
      quote_id: quote.id,
    })
    return project
  }

  async exportQuoteXlsx(quoteId: UUID, lang: 'ko' | 'en' = 'ko'): Promise<QuoteExportResult> {
    this.assertQuoteRole()
    const quote = this.mustFindQuote(quoteId)
    const input = quote.input
    const cfg = toEngineConfig(input)
    const base = calcEstimate(input.include_leads ? cfg : { ...cfg, guarantee: 0 })
    const adjustments = effectiveAdjust(
      adjustmentDeltas(input.adjustments) as Record<string, number>,
      input.include_leads,
    )
    // 자동 외부 업로드 없음(§12 4중 차단 ③) — 저장 트리거는 UI가 modules/quote(saveQuoteFile)로 수행
    const { fn, blob } = await exportEstimate(cfg, base, {
      download: false,
      excludeLeads: !input.include_leads,
      lang,
      adjustments,
    })
    return { file_name: fn, blob }
  }

  // ── v2.0 컴플라이언스 카드 (§8 /compliance-cards — 체크 멤버·편집 pm) ──
  private seedComplianceCards(projectId: UUID): void {
    const others = this.state.compliance_cards.filter((c) => c.project_id !== projectId)
    const seeded: ComplianceCard[] = COMPLIANCE_CARD_TEMPLATES.map((tpl) => ({
      id: this.nextId('cmp'),
      project_id: projectId,
      kind: tpl.kind,
      title: tpl.title,
      items: tpl.items.map((text) => ({ text, checked: false, checked_at: null })),
      sort_order: tpl.sort_order,
    }))
    this.state.compliance_cards = [...others, ...seeded]
  }

  async listComplianceCards(projectId: UUID): Promise<ComplianceCard[]> {
    this.currentUser()
    this.mustFindProject(projectId)
    return this.state.compliance_cards
      .filter((c) => c.project_id === projectId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async updateComplianceCard(cardId: UUID, patch: ComplianceCardPatch): Promise<ComplianceCard> {
    const user = this.currentUser()
    const card = this.state.compliance_cards.find((c) => c.id === cardId)
    if (!card) throw new ProviderError('not_found', '컴플라이언스 카드를 찾을 수 없습니다.')
    this.assertWritable(card.project_id)
    if (patch.title !== undefined) {
      if (user.role !== 'pm') {
        throw new ProviderError('forbidden', '카드 편집은 PM만 할 수 있습니다.')
      }
      if (!patch.title.trim()) throw new ProviderError('validation', '카드 제목은 필수입니다.')
      card.title = patch.title
    }
    if (patch.items !== undefined) {
      // §6.1: 체크는 멤버 전원 — checked 전환 시 checked_at 자동 기록/해제
      card.items = patch.items.map((item, i) => {
        const prev = card.items[i]
        const checked = !!item.checked
        return {
          text: item.text ?? prev?.text ?? '',
          checked,
          checked_at: checked ? (prev?.checked && prev.checked_at ? prev.checked_at : nowIso()) : null,
        }
      })
    }
    return card
  }

  /** 최신 버전 참조 — 미리보기 포맷일 때만 preview_url 세팅 */
  private async planVersionRef(deliverableId: UUID): Promise<PlanVersionRef | null> {
    const latest = this.versionsOf(deliverableId)[0]
    if (!latest) return null
    return {
      id: latest.id,
      version_no: latest.version_no,
      file_name: latest.file_name,
      preview_url: isPreviewFileName(latest.file_name) ? await this.getFileUrl(latest.id) : null,
    }
  }

  /**
   * S9 운영계획서 조립 (§8 GET /projects/{id}/plan).
   * 섹션별 진행률 산정 기준 (Mock 정본 — SupabaseProvider도 동일 산식 유지):
   *   overview      개요 슬롯 5개(event_date·theme·venue·mc_name·overview_items≥1) 중 채워진 수
   *   program       start_time 있는 세션 수 / 전체 세션 수
   *   cuesheet      구분·본문 채워진 큐 수 / 전체 큐 수 (v1.3)
   *   zones         content 있는 ops 항목 수 / ops 항목 수
   *   production    스펙 4필드(size·qty·location·type) 완비 design 항목 수 / design 항목 수
   *   registration  등록 데이터(RSVP+참관객) 존재 여부 (0/1)
   *   schedule      완료 마일스톤 수 / 전체 마일스톤 수
   */
  async getPlan(projectId: UUID): Promise<PlanData> {
    this.currentUser()
    const project = this.mustFindProject(projectId)
    const sessions = await this.listProgramSessions(projectId)
    // v1.3 ⑦큐시트 — 첫 큐시트 항목의 큐 표 (프로그램 다음 배치)
    const cueDeliverable = this.state.deliverables.find(
      (d) => d.project_id === projectId && d.category === '큐시트',
    )
    const cues = cueDeliverable ? await this.listCues(cueDeliverable.id) : []
    const cuesheet = cueDeliverable
      ? {
          deliverable_id: cueDeliverable.id,
          title: cueDeliverable.title,
          status: cueDeliverable.status,
          cues,
        }
      : null
    const opsItems = this.state.deliverables.filter(
      (d) => d.project_id === projectId && d.area === 'ops',
    )
    const designItems = this.state.deliverables.filter(
      (d) => d.project_id === projectId && d.area === 'design',
    )

    const zones = await Promise.all(
      opsItems.map(async (d) => ({
        deliverable_id: d.id,
        category: d.category,
        title: d.title,
        status: d.status,
        content: d.content,
        latest_version: await this.planVersionRef(d.id),
      })),
    )
    const production = await Promise.all(
      designItems.map(async (d) => ({
        deliverable_id: d.id,
        category: d.category,
        title: d.title,
        status: d.status,
        spec_size: d.spec_size,
        spec_qty: d.spec_qty,
        spec_location: d.spec_location,
        spec_type: d.spec_type,
        latest_version: await this.planVersionRef(d.id),
      })),
    )
    const stats = await this.getRegistrationStats(projectId)
    const milestones = this.state.milestones
      .filter((m) => m.project_id === projectId)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))

    const overviewSlots = [
      project.event_date,
      project.theme,
      project.venue,
      project.mc_name,
      project.overview_items?.length ? 'y' : null,
    ]
    const specComplete = (d: Deliverable) =>
      !!(d.spec_size && d.spec_qty != null && d.spec_location && d.spec_type)

    return {
      project,
      program_sessions: sessions,
      cuesheet,
      zones,
      production_items: production,
      registration_stats: stats,
      milestones,
      section_progress: [
        { key: 'overview', done: overviewSlots.filter(Boolean).length, total: overviewSlots.length },
        { key: 'program', done: sessions.filter((s) => s.start_time).length, total: sessions.length },
        // cuesheet: 구분·본문이 채워진 큐 수 / 전체 큐 수
        { key: 'cuesheet', done: cues.filter((c) => c.segment && c.body).length, total: cues.length },
        { key: 'zones', done: opsItems.filter((d) => d.content?.trim()).length, total: opsItems.length },
        { key: 'production', done: designItems.filter(specComplete).length, total: designItems.length },
        { key: 'registration', done: stats.rsvp_total + stats.attendee_total > 0 ? 1 : 0, total: 1 },
        { key: 'schedule', done: milestones.filter((m) => m.done).length, total: milestones.length },
      ],
    }
  }

  // ── S-3 랜딩보드 (v2.1 §4-19~§4-22) ───────────────────────────────

  private mustFindLanding(landingId: UUID): LandingPage {
    const lp = this.state.landing_pages.find((l) => l.id === landingId)
    if (!lp) throw new ProviderError('not_found', '랜딩을 찾을 수 없습니다.')
    return lp
  }

  /** slug는 행사 안에서 유일해야 한다 — 내보낸 파일명·공개 주소가 겹치지 않도록 */
  private assertSlugFree(projectId: UUID, slug: string, exceptId?: UUID): void {
    const taken = this.state.landing_pages.some(
      (l) => l.project_id === projectId && l.slug === slug && l.id !== exceptId,
    )
    if (taken) throw new ProviderError('conflict', '이미 사용 중인 slug입니다.')
  }

  private assertSlugShape(slug: string): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new ProviderError('validation', 'slug는 영소문자·숫자·하이픈만 쓸 수 있습니다.')
    }
  }

  async listLandingPages(projectId: UUID): Promise<LandingPage[]> {
    // 스코프는 인자로만 정한다 — currentUser()의 멤버십에서 유도하지 않는다(§4-21 R-L1)
    return this.state.landing_pages
      .filter((l) => l.project_id === projectId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((l) => structuredClone(l))
  }

  async getLandingPage(landingId: UUID): Promise<LandingPage> {
    return structuredClone(this.mustFindLanding(landingId))
  }

  async createLandingPage(projectId: UUID, input: LandingPageInput): Promise<LandingPage> {
    // currentUser()는 행위자 신원(활동 로그)에만 쓴다. 쓰기 가드·slug 유일성·소속은
    // 전부 인자로 받은 projectId로 판정한다(§4-21 R-L1·R-L3·R-L4)
    const user = this.currentUser()
    this.assertWritable(projectId)
    const title = input.title?.trim()
    if (!title) throw new ProviderError('validation', '랜딩 제목은 필수입니다.')
    const slug = input.slug?.trim()
    if (!slug) throw new ProviderError('validation', 'slug는 필수입니다.')
    this.assertSlugShape(slug)
    this.assertSlugFree(projectId, slug)

    const id = this.nextId('lnd')
    const idFor = (kind: string) => `${id}-${kind}`
    const now = nowIso()
    const landing: LandingPage = {
      id,
      project_id: projectId,
      title,
      slug,
      status: 'draft',
      public_url: null,
      sticky_nav: true,
      cta_label: '참가 신청하기',
      submit_target: 'registration',
      external_submit_url: null,
      analytics: {
        ga_measurement_id: input.analytics?.ga_measurement_id ?? null,
        gtm_container_id: input.analytics?.gtm_container_id ?? null,
        conversion_event: input.analytics?.conversion_event ?? 'generate_lead',
      },
      sections: input.sections ?? defaultSections(idFor),
      form_fields: input.form_fields ?? defaultFormFields(idFor),
      consents: input.consents ?? defaultConsents(idFor),
      created_at: now,
      updated_at: now,
      published_at: null,
    }
    this.state.landing_pages.push(landing)
    this.state.landing_metrics[id] = []
    this.log(projectId, `user:${user.id}`, 'landing.created', 'landing', id, { title })
    return structuredClone(landing)
  }

  async updateLandingPage(landingId: UUID, patch: LandingPagePatch): Promise<LandingPage> {
    const user = this.currentUser()
    const landing = this.mustFindLanding(landingId)
    this.assertWritable(landing.project_id)

    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ProviderError('validation', '랜딩 제목은 필수입니다.')
      landing.title = patch.title.trim()
    }
    if (patch.slug !== undefined) {
      const slug = patch.slug.trim()
      this.assertSlugShape(slug)
      this.assertSlugFree(landing.project_id, slug, landing.id)
      landing.slug = slug
    }
    if (patch.status !== undefined) landing.status = patch.status
    if (patch.sticky_nav !== undefined) landing.sticky_nav = patch.sticky_nav
    if (patch.cta_label !== undefined) landing.cta_label = patch.cta_label
    if (patch.submit_target !== undefined) landing.submit_target = patch.submit_target
    if (patch.external_submit_url !== undefined) {
      landing.external_submit_url = patch.external_submit_url
    }
    if (patch.analytics !== undefined) landing.analytics = { ...patch.analytics }
    // 배열은 통째 교체 — 빌더가 항상 전체 순서를 들고 저장한다
    if (patch.sections !== undefined) {
      landing.sections = patch.sections.map((sec, i) => ({ ...sec, sort_order: i + 1 }))
    }
    if (patch.form_fields !== undefined) {
      landing.form_fields = patch.form_fields.map((f, i) => ({ ...f, sort_order: i + 1 }))
    }
    if (patch.consents !== undefined) {
      landing.consents = patch.consents.map((c, i) => ({ ...c, sort_order: i + 1 }))
    }
    landing.updated_at = nowIso()
    this.log(landing.project_id, `user:${user.id}`, 'landing.updated', 'landing', landing.id, {})
    return structuredClone(landing)
  }

  async publishLandingPage(landingId: UUID, publicUrl: string | null): Promise<LandingPage> {
    const user = this.currentUser()
    const landing = this.mustFindLanding(landingId)
    this.assertWritable(landing.project_id)
    if (publicUrl === null) {
      landing.status = 'draft'
      landing.public_url = null
      landing.published_at = null
    } else {
      const url = publicUrl.trim()
      if (!/^https?:\/\/.+/.test(url)) {
        throw new ProviderError('validation', '공개 주소는 http(s) URL이어야 합니다.')
      }
      landing.status = 'published'
      landing.public_url = url
      landing.published_at = nowIso()
    }
    landing.updated_at = nowIso()
    this.log(landing.project_id, `user:${user.id}`, 'landing.published', 'landing', landing.id, {
      public_url: landing.public_url,
    })
    return structuredClone(landing)
  }

  async deleteLandingPage(landingId: UUID): Promise<void> {
    const user = this.currentUser()
    const landing = this.mustFindLanding(landingId)
    this.assertWritable(landing.project_id)
    if (user.role !== 'pm') {
      throw new ProviderError('forbidden', '랜딩 삭제는 PM만 할 수 있습니다.')
    }
    this.state.landing_pages = this.state.landing_pages.filter((l) => l.id !== landingId)
    delete this.state.landing_metrics[landingId]
  }

  async listLandingMetrics(landingId: UUID): Promise<LandingDailyMetric[]> {
    this.mustFindLanding(landingId)
    return (this.state.landing_metrics[landingId] ?? []).map((m) => ({ ...m }))
  }

  async submitLandingLead(landingId: UUID, values: Record<string, string>): Promise<Attendee> {
    const landing = this.mustFindLanding(landingId)
    this.assertWritable(landing.project_id)
    if (landing.submit_target !== 'registration') {
      throw new ProviderError('conflict', '이 랜딩은 외부로 제출되도록 설정돼 있습니다.')
    }
    if (landing.status === 'closed') {
      throw new ProviderError('conflict', '신청이 마감된 랜딩입니다.')
    }
    // 폼 필드 라벨로 표준 항목을 찾는다 — 빌더에서 라벨을 바꿔도 동작하도록 부분 일치 허용
    const pick = (needle: string): string | null => {
      const field = landing.form_fields.find((f) => f.label.includes(needle))
      const v = field ? values[`f_${field.id}`] : undefined
      return v?.trim() ? v.trim() : null
    }
    const name = pick('성함') ?? pick('이름')
    if (!name) throw new ProviderError('validation', '성함은 필수입니다.')
    for (const consent of landing.consents.filter((c) => c.required)) {
      if (!values[`c_${consent.id}`]) {
        throw new ProviderError('validation', `필수 동의가 누락됐습니다 — ${consent.title}`)
      }
    }
    const attendee: Attendee = {
      id: this.nextId('att'),
      project_id: landing.project_id,
      rsvp_contact_id: null,
      name,
      org: pick('회사'),
      email: pick('이메일'),
      phone: pick('휴대전화') ?? pick('연락처'),
      channel: 'rsvp',
      registered_at: nowIso(),
      checked_in_at: null,
      badge_no: null,
    }
    // 유입 출처(어느 랜딩에서 왔는지)는 Attendee 스키마를 늘리지 않고 활동 로그에 남긴다
    this.state.attendees.push(attendee)
    // 제출은 지표에도 반영해 대시보드가 즉시 움직이도록 한다
    const today = nowIso().slice(0, 10)
    const series = (this.state.landing_metrics[landingId] ??= [])
    const row = series.find((m) => m.date === today)
    if (row) {
      row.submits += 1
      row.form_starts = Math.max(row.form_starts, row.submits)
    } else {
      series.push({ date: today, views: 1, unique_visitors: 1, form_starts: 1, submits: 1 })
    }
    this.log(landing.project_id, 'landing', 'landing.lead', 'attendee', attendee.id, {
      landing_id: landingId,
    })
    return structuredClone(attendee)
  }

  // ── 발주처 뷰 (토큰 스코프 — §6.2 화이트리스트 쿼리 재현) ─────────
  // ── S-10 정산보드 (v2.2 §19 · 계약 §4-24) ─────────────────────────
  // 스코프는 인자로만 정한다(R-S1 · §4-21 R-L1 승계). currentUser()는 행위자 신원 전용.

  private mustFindBoard(projectId: UUID): SettlementBoard {
    const b = this.state.settlement_boards.find((x) => x.project_id === projectId)
    if (!b) throw new ProviderError('not_found', '정산 보드가 없습니다.')
    return b
  }

  private mustFindBucket(bucketId: UUID): SettlementBucket {
    const b = this.state.settlement_buckets.find((x) => x.id === bucketId)
    if (!b) throw new ProviderError('not_found', '버킷을 찾을 수 없습니다.')
    return b
  }

  private mustFindItem(itemId: UUID): SettlementItem {
    const i = this.state.settlement_items.find((x) => x.id === itemId)
    if (!i) throw new ProviderError('not_found', '발주 항목을 찾을 수 없습니다.')
    return i
  }

  /** 버킷 → 그 버킷이 속한 행사. 가드는 항상 이 값으로 판정한다(R-S1) */
  private projectOfBucket(bucket: SettlementBucket): UUID {
    const board = this.state.settlement_boards.find((b) => b.id === bucket.board_id)
    if (!board) throw new ProviderError('not_found', '정산 보드가 없습니다.')
    return board.project_id
  }

  /**
   * 확정 견적 breakdown → 버킷 9종 스냅숏 (§19.2).
   * `recruit`를 rc/ld로 쪼개는 것이 유일한 비자명 매핑이며, 값은 견적 input에서
   * 재유도하지 않고 **엔진 산출값(rsvpPkg·showup)을 그대로** 쓴다.
   */
  private snapshotBuckets(boardId: UUID, quote: Quote): SettlementBucket[] {
    const engine = computeQuoteOutputs(quote.input).result
    const now = nowIso()
    return quoteBucketSpec(quote.breakdown, engine).map((row, i) => ({
      id: this.nextId('bkt'),
      board_id: boardId,
      code: row.code,
      label: row.label,
      quote_amount: row.quote_amount,
      has_cost: row.has_cost,
      is_margin_base: row.is_margin_base,
      source: 'quote' as const,
      sort_order: i + 1,
      created_at: now,
    }))
  }

  private buildBoardView(board: SettlementBoard): SettlementBoardView {
    const buckets = this.state.settlement_buckets
      .filter((b) => b.board_id === board.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    const items = this.state.settlement_items.filter((i) => i.board_id === board.id)
    const quote = board.quote_id ? this.state.quotes.find((q) => q.id === board.quote_id) : undefined
    return {
      board: { ...board },
      // 기준 견적은 **버전·제목만** 노출한다 — 금액은 버킷 스냅숏이 이미 갖고 있다
      quote_label: quote ? `${quote.title} v${quote.version}` : null,
      buckets: buckets.map((bucket) => ({
        bucket: { ...bucket },
        items: items
          .filter((i) => i.bucket_id === bucket.id)
          .map((i) => ({ ...i }))
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
        ordered: bucketOrdered(bucket, items),
        actual: bucketActual(bucket, items),
        markup: bucketMarkup(bucket, items),
        markup_rate: bucketMarkupRate(bucket, items),
        over_budget: isOverBudget(bucket, items),
      })),
      totals: computeTotals(buckets, items),
    }
  }

  async getSettlementBoard(projectId: UUID): Promise<SettlementBoardView | null> {
    this.mustFindProject(projectId)
    const board = this.state.settlement_boards.find((b) => b.project_id === projectId)
    return board ? this.buildBoardView(board) : null
  }

  async createSettlementBoard(projectId: UUID, quoteId: UUID): Promise<SettlementBoardView> {
    this.assertWritable(projectId)
    this.assertPm()
    if (this.state.settlement_boards.some((b) => b.project_id === projectId)) {
      throw new ProviderError('conflict', '이미 정산 보드가 있습니다.')
    }
    const quote = this.state.quotes.find((q) => q.id === quoteId)
    if (!quote) throw new ProviderError('not_found', '견적을 찾을 수 없습니다.')
    if (!quote.is_final) {
      throw new ProviderError('validation', '확정된 견적만 정산 기준으로 쓸 수 있습니다.')
    }
    const now = nowIso()
    const board: SettlementBoard = {
      id: this.nextId('brd'),
      project_id: projectId,
      quote_id: quote.id,
      quote_version: quote.version,
      baselined_at: now,
      created_at: now,
      updated_at: now,
    }
    this.state.settlement_boards.push(board)
    this.state.settlement_buckets.push(...this.snapshotBuckets(board.id, quote))
    this.log(projectId, `user:${this.currentUser().id}`, 'settlement.baselined', 'settlement', board.id, {
      quote_version: quote.version,
    })
    return this.buildBoardView(board)
  }

  /**
   * 기준 견적 갱신 (R-S2). 버킷의 quote_amount만 새 스냅숏으로 갈고,
   * **항목은 그대로 둔다** — 이미 집행된 발주를 기준 변경이 지우면 안 된다.
   * quote 버킷은 code 매칭으로 금액만 교체하고, custom 버킷은 손대지 않는다.
   */
  async rebaseSettlementBoard(projectId: UUID, quoteId: UUID): Promise<SettlementBoardView> {
    this.assertWritable(projectId)
    this.assertPm()
    const board = this.mustFindBoard(projectId)
    const quote = this.state.quotes.find((q) => q.id === quoteId)
    if (!quote) throw new ProviderError('not_found', '견적을 찾을 수 없습니다.')
    if (!quote.is_final) {
      throw new ProviderError('validation', '확정된 견적만 정산 기준으로 쓸 수 있습니다.')
    }
    const fresh = this.snapshotBuckets(board.id, quote)
    const prevVersion = board.quote_version
    for (const next of fresh) {
      const cur = this.state.settlement_buckets.find(
        (b) => b.board_id === board.id && b.code === next.code,
      )
      if (cur) {
        cur.quote_amount = next.quote_amount
        cur.has_cost = next.has_cost
        cur.is_margin_base = next.is_margin_base
      } else {
        this.state.settlement_buckets.push(next)
      }
    }
    board.quote_id = quote.id
    board.quote_version = quote.version
    board.baselined_at = nowIso()
    board.updated_at = nowIso()
    this.log(projectId, `user:${this.currentUser().id}`, 'settlement.rebased', 'settlement', board.id, {
      from_version: prevVersion,
      to_version: quote.version,
    })
    return this.buildBoardView(board)
  }

  async createSettlementBucket(
    projectId: UUID,
    input: SettlementBucketInput,
  ): Promise<SettlementBucket> {
    this.assertWritable(projectId)
    this.assertPm()
    const board = this.mustFindBoard(projectId)
    const code = input.code?.trim()
    if (!code) throw new ProviderError('validation', '버킷 코드는 필수입니다.')
    if (!input.label?.trim()) throw new ProviderError('validation', '버킷 이름은 필수입니다.')
    if (this.state.settlement_buckets.some((b) => b.board_id === board.id && b.code === code)) {
      throw new ProviderError('conflict', '이미 있는 버킷 코드입니다.')
    }
    const bucket: SettlementBucket = {
      id: this.nextId('bkt'),
      board_id: board.id,
      code,
      label: input.label.trim(),
      // 행사별 추가 버킷은 견적에 없던 비용이다 — 0원에서 시작해 마크업이 음수로 잡히는 게 맞다(§19.2)
      quote_amount: input.quote_amount ?? 0,
      has_cost: input.has_cost ?? true,
      is_margin_base: input.is_margin_base ?? true,
      source: 'custom',
      sort_order:
        input.sort_order ??
        this.state.settlement_buckets.filter((b) => b.board_id === board.id).length + 1,
      created_at: nowIso(),
    }
    this.state.settlement_buckets.push(bucket)
    return { ...bucket }
  }

  async updateSettlementBucket(
    bucketId: UUID,
    patch: Partial<SettlementBucketInput>,
  ): Promise<SettlementBucket> {
    const bucket = this.mustFindBucket(bucketId)
    this.assertWritable(this.projectOfBucket(bucket))
    this.assertPm()
    if (patch.label !== undefined) {
      if (!patch.label.trim()) throw new ProviderError('validation', '버킷 이름은 필수입니다.')
      bucket.label = patch.label.trim()
    }
    if (patch.quote_amount !== undefined) bucket.quote_amount = patch.quote_amount
    // R-S4 역방향: 원가를 **끄는** 것도 막는다. 끄는 순간 그 버킷의 실집행이 집계에서
    // 통째로 빠지면서 마진이 같은 크기로 부풀고, 두 값이 함께 움직여 상쇄되므로
    // 항등식(marginBase − totalActual === finalMargin)은 이 조작을 구조적으로 못 잡는다.
    // 그래서 검사는 여기(입력 경로)에 둔다 — 마진 식은 손대지 않는다(§19.1 · R-S10).
    if (patch.has_cost === false && this.bucketHasEnteredAmounts(bucket)) {
      throw new ProviderError(
        'conflict',
        '이미 발주·실비가 입력된 버킷은 원가 없음으로 바꿀 수 없습니다. 항목을 먼저 정리하세요.',
      )
    }
    if (patch.has_cost !== undefined) bucket.has_cost = patch.has_cost
    if (patch.is_margin_base !== undefined) bucket.is_margin_base = patch.is_margin_base
    if (patch.sort_order !== undefined) bucket.sort_order = patch.sort_order
    return { ...bucket }
  }

  async deleteSettlementBucket(bucketId: UUID): Promise<void> {
    const bucket = this.mustFindBucket(bucketId)
    this.assertWritable(this.projectOfBucket(bucket))
    this.assertPm()
    if (bucket.source === 'quote') {
      throw new ProviderError('conflict', '견적에서 온 버킷은 삭제할 수 없습니다.')
    }
    if (this.state.settlement_items.some((i) => i.bucket_id === bucketId)) {
      throw new ProviderError('conflict', '발주 항목이 있는 버킷은 삭제할 수 없습니다.')
    }
    this.state.settlement_buckets = this.state.settlement_buckets.filter((b) => b.id !== bucketId)
  }

  /** 그 버킷에 금액이 실제로 들어간 항목이 있는가 (취소 항목은 제외 — 집계에서 빠지므로) */
  private bucketHasEnteredAmounts(bucket: SettlementBucket): boolean {
    return this.state.settlement_items.some(
      (i) =>
        i.bucket_id === bucket.id &&
        i.status !== 'cancelled' &&
        (i.ordered_amount !== null || i.actual_amount !== null),
    )
  }

  /** has_cost=false 버킷에 금액을 넣으려 하면 422 (R-S4) */
  private assertCostAllowed(bucket: SettlementBucket, input: Partial<SettlementItemInput>): void {
    const wantsAmount = input.ordered_amount != null || input.actual_amount != null
    if (!bucket.has_cost && wantsAmount) {
      throw new ProviderError(
        'validation',
        `'${bucket.label}'은 원가가 없는 항목이라 발주·실비를 넣을 수 없습니다.`,
      )
    }
  }

  /** 금액 입력 권한 — pm 또는 그 항목의 담당자 본인 (§6.1) */
  private assertItemWritable(item: SettlementItem): void {
    const user = this.currentUser()
    if (user.role === 'pm') return
    if (item.assignee_id && item.assignee_id === user.id) return
    throw new ProviderError('forbidden', '본인이 담당한 발주 항목만 입력할 수 있습니다.')
  }

  async createSettlementItem(
    projectId: UUID,
    bucketId: UUID,
    input: SettlementItemInput,
  ): Promise<SettlementItem> {
    this.assertWritable(projectId)
    this.assertPm()
    const bucket = this.mustFindBucket(bucketId)
    if (this.projectOfBucket(bucket) !== projectId) {
      throw new ProviderError('validation', '다른 행사의 버킷입니다.')
    }
    if (!input.title?.trim()) throw new ProviderError('validation', '항목명은 필수입니다.')
    this.assertCostAllowed(bucket, input)

    const vatIncluded = input.vat_included_input ?? false
    const raw = input.actual_amount ?? input.ordered_amount ?? null
    const now = nowIso()
    const item: SettlementItem = {
      id: this.nextId('sti'),
      board_id: bucket.board_id,
      bucket_id: bucketId,
      title: input.title.trim(),
      spec: input.spec ?? null,
      vendor_id: input.vendor_id ?? null,
      assignee_id: input.assignee_id ?? null,
      ordered_amount:
        input.ordered_amount == null ? null : toVatExcluded(input.ordered_amount, vatIncluded),
      actual_amount:
        input.actual_amount == null ? null : toVatExcluded(input.actual_amount, vatIncluded),
      input_amount_raw: vatIncluded ? raw : null,
      vat_included_input: vatIncluded,
      status: input.status ?? 'planned',
      evidence: input.evidence ?? null,
      import_id: null,
      note: input.note ?? null,
      created_at: now,
      updated_at: now,
    }
    this.state.settlement_items.push(item)
    return { ...item }
  }

  async updateSettlementItem(
    itemId: UUID,
    patch: Partial<SettlementItemInput>,
  ): Promise<SettlementItem> {
    const item = this.mustFindItem(itemId)
    const bucket = this.mustFindBucket(patch.bucket_id ?? item.bucket_id)
    this.assertWritable(this.projectOfBucket(bucket))
    this.assertItemWritable(item)
    this.assertCostAllowed(bucket, patch)

    if (patch.bucket_id !== undefined) item.bucket_id = patch.bucket_id
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ProviderError('validation', '항목명은 필수입니다.')
      item.title = patch.title.trim()
    }
    if (patch.spec !== undefined) item.spec = patch.spec
    if (patch.vendor_id !== undefined) item.vendor_id = patch.vendor_id
    if (patch.assignee_id !== undefined) item.assignee_id = patch.assignee_id
    if (patch.status !== undefined) item.status = patch.status
    if (patch.evidence !== undefined) item.evidence = patch.evidence
    if (patch.note !== undefined) item.note = patch.note

    // 부가세 처리 — 이번 patch가 금액을 건드릴 때만 재계산한다(§19.4)
    const touchesAmount = patch.ordered_amount !== undefined || patch.actual_amount !== undefined
    if (touchesAmount) {
      const vatIncluded = patch.vat_included_input ?? false
      if (patch.ordered_amount !== undefined) {
        item.ordered_amount =
          patch.ordered_amount == null ? null : toVatExcluded(patch.ordered_amount, vatIncluded)
      }
      if (patch.actual_amount !== undefined) {
        item.actual_amount =
          patch.actual_amount == null ? null : toVatExcluded(patch.actual_amount, vatIncluded)
      }
      const raw = patch.actual_amount ?? patch.ordered_amount ?? null
      item.vat_included_input = vatIncluded
      item.input_amount_raw = vatIncluded ? raw : null
    }
    item.updated_at = nowIso()
    return { ...item }
  }

  async deleteSettlementItem(itemId: UUID): Promise<void> {
    const item = this.mustFindItem(itemId)
    const bucket = this.mustFindBucket(item.bucket_id)
    this.assertWritable(this.projectOfBucket(bucket))
    this.assertItemWritable(item)
    this.state.settlement_items = this.state.settlement_items.filter((i) => i.id !== itemId)
  }

  async listVendors(): Promise<Vendor[]> {
    // 협력사는 프로젝트 비종속 조직 마스터다(§19.6) — projectId를 받지 않는 것이 맞다
    return this.state.vendors
      .filter((v) => v.archived_at === null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((v) => ({ ...v }))
  }

  async upsertVendor(input: VendorInput): Promise<Vendor> {
    this.currentUser()
    const name = input.name?.trim()
    if (!name) throw new ProviderError('validation', '협력사명은 필수입니다.')
    const existing = input.id
      ? this.state.vendors.find((v) => v.id === input.id)
      : this.state.vendors.find((v) => v.archived_at === null && v.name === name)
    if (existing) {
      existing.name = name
      if (input.biz_no !== undefined) existing.biz_no = input.biz_no
      if (input.note !== undefined) existing.note = input.note
      return { ...existing }
    }
    const vendor: Vendor = {
      id: this.nextId('ven'),
      name,
      biz_no: input.biz_no ?? null,
      note: input.note ?? null,
      archived_at: null,
      created_at: nowIso(),
    }
    this.state.vendors.push(vendor)
    return { ...vendor }
  }

  async getClientQueue(token: string): Promise<ClientQueue> {
    const t = this.resolveToken(token)
    const project = this.mustFindProject(t.project_id)
    const contact = this.state.client_contacts.find((c) => c.id === t.contact_id)

    const queue = this.state.approvals
      .filter((a) => !a.decided_at)
      .map((a) => {
        const d = this.mustFindDeliverable(a.deliverable_id)
        const v = this.state.versions.find((x) => x.id === a.version_id)
        return { a, d, v }
      })
      .filter(
        ({ d, v }) => d.project_id === t.project_id && d.status === 'pending_approval' && !!v,
      )
      .sort((x, y) => (x.a.due_at ?? '9999').localeCompare(y.a.due_at ?? '9999'))

    const items = await Promise.all(
      queue.map(async ({ a, d, v }) => ({
        approval_id: a.id,
        deliverable_id: d.id,
        title: d.title,
        category: d.category,
        area: d.area,
        requested_at: a.requested_at,
        due_at: a.due_at,
        version: {
          id: v!.id,
          version_no: v!.version_no,
          file_name: v!.file_name,
          preview_url: await this.getFileUrl(v!.id),
        },
        // §6.2: visibility='shared'만 — internal은 쿼리 자체에서 제외
        shared_comments: this.state.comments
          .filter((c) => c.deliverable_id === d.id && c.visibility === 'shared')
          .sort((c1, c2) => c1.created_at.localeCompare(c2.created_at)),
      })),
    )

    const history = this.state.approvals
      .filter(
        (a) =>
          a.decided_at &&
          a.decision &&
          this.mustFindDeliverable(a.deliverable_id).project_id === t.project_id,
      )
      .sort((a, b) => b.decided_at!.localeCompare(a.decided_at!))
      .map((a) => ({
        approval_id: a.id,
        deliverable_id: a.deliverable_id,
        title: this.mustFindDeliverable(a.deliverable_id).title,
        decision: a.decision!,
        decided_at: a.decided_at!,
      }))

    return {
      project_name: project.name,
      contact_name: contact?.name ?? null,
      queue: items,
      history,
    }
  }

  async submitClientDecision(token: string, input: ClientDecisionInput): Promise<void> {
    const t = this.resolveToken(token)
    const approval = this.state.approvals.find((a) => a.id === input.approval_id)
    if (!approval) throw new ProviderError('not_found', '컨펌 요청을 찾을 수 없습니다.')
    if (approval.decided_at) throw new ProviderError('conflict', '이미 처리된 컨펌 요청입니다.')
    const d = this.mustFindDeliverable(approval.deliverable_id)
    if (d.project_id !== t.project_id) {
      throw new ProviderError('forbidden', '이 링크로 처리할 수 없는 항목입니다.')
    }

    const rule = assertTransition(d.status, input.decision === 'approved' ? 'approved' : 'changes_requested', 'client_decision')
    if (rule.requires_comment && !input.comment?.trim()) {
      throw new ProviderError('validation', '수정요청 시 코멘트는 필수입니다.')
    }

    approval.decided_at = nowIso()
    approval.decision = input.decision
    approval.decided_via_token = t.token
    this.log(d.project_id, `client:${t.token}`, 'approval.decided', 'approval', approval.id, {
      decision: input.decision,
    })

    if (input.decision === 'approved') {
      d.status = 'approved'
      // §5·§7.5: 06_발주처공유 스냅숏 성공 후 final 커밋 — Mock은 복사가 항상 성공한다고 가정.
      // 실제 Drive copy·재시도 큐는 Phase 5 DriveFileStore에서 구현.
      assertTransition(d.status, 'final', 'system')
      d.status = 'final'
      this.log(d.project_id, 'system', 'deliverable.finalized', 'deliverable', d.id)
      // v1.4: 이 산출물에 연결된 WBS 태스크는 자동 done (§4-15)
      for (const task of this.state.wbs_tasks) {
        if (task.linked_deliverable_id === d.id && task.status !== 'done') {
          task.status = 'done'
          task.done_at = nowIso()
          this.log(d.project_id, 'system', 'wbs.auto_done', 'wbs_task', task.id, { deliverable_id: d.id })
        }
      }
    } else {
      approval.client_comment = input.comment ?? null
      d.status = 'changes_requested'
      // 발주처 코멘트는 shared 강제 (§4 check 제약)
      this.state.comments.push({
        id: this.nextId('cmt'),
        deliverable_id: d.id,
        author_user_id: null,
        author_token: t.token,
        visibility: 'shared',
        body: input.comment!,
        created_at: nowIso(),
      })
    }
    d.updated_at = nowIso()
  }

  async getClientStatus(token: string): Promise<ClientStatusData> {
    const t = this.resolveToken(token)
    const project = this.mustFindProject(t.project_id)
    const finals = this.state.deliverables
      .filter((d) => d.project_id === t.project_id && d.status === 'final')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

    return {
      project_name: project.name,
      event_date: project.event_date,
      area_progress: this.areaProgress(t.project_id),
      milestones: this.state.milestones
        .filter((m) => m.project_id === t.project_id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
      recent_finals: await Promise.all(
        finals.map(async (d) => {
          const latest = this.versionsOf(d.id)[0]
          if (!latest) throw new ProviderError('not_found', '확정본 버전이 없습니다.')
          return {
            version_id: latest.id,
            deliverable_id: d.id,
            deliverable_title: d.title,
            file_name: latest.file_name,
            file_url: await this.getFileUrl(latest.id),
            finalized_at: d.updated_at,
          }
        }),
      ),
    }
  }
}
