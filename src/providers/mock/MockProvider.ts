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
import { COMPLIANCE_CARD_TEMPLATES, HOST_COMPLIANCE_CARD_TEMPLATES } from '../../fixtures/complianceTemplates'
import { defaultConsents, defaultFormFields, defaultSections } from '../../lib/landingTemplate'
import {
  HOST_ROLE_CHARTER_TEMPLATE,
  HOST_TEMPLATE,
  ROLE_CHARTER_TEMPLATES,
  wbsTemplateFor,
} from '../../fixtures/wbsTemplates'
import { adjustmentDeltas, computeQuoteOutputs, toEngineConfig } from '../../modules/quote/engine/quoteInput'
import { effectiveAdjust } from '../../modules/quote/engine/quoteMode'
import { calcEstimate } from '../../modules/quote/engine/calcEstimate'
import { exportEstimate } from '../../modules/quote/export/exportEstimate'
import { quoteToProjectDraft } from '../../modules/quote/handoff'
import { parseQuoteWorkbook } from '../../modules/quote/import/parser'
import type { ParsedQuoteDoc, SectionMapping } from '../../modules/quote/import/types'
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
  GuideSection,
  LandingDailyMetric,
  LandingPage,
  Partner,
  PartnerTier,
  PartnerToken,
  QuoteBreakdown,
  QuoteImport,
  ScenarioBlock,
  SheetConnection,
  SheetSourceRow,
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
import type {
  AppRole,
  DeliverableArea,
  DeliverableStatus,
  MemberRole,
  QuoteImportFormat,
} from '../../types/enums'
import { isStructuredDocCategory, SHEET_FIELD_LABELS, SHEET_REQUIRED_FIELDS } from '../../types/enums'
import {
  buildColumnPreviews,
  buildProbe,
  computeSheetDiffRows,
  DEFAULT_SOURCE_MODIFIED_AT,
  generateSourceRows,
  mappedFields,
} from './sheetSync'
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
  GuideSectionInput,
  IssueTokenInput,
  MemberInput,
  MemberWithProfile,
  MilestoneInput,
  OnboardingStatus,
  PartnerInput,
  PartnerNextDeadline,
  PartnerPortalData,
  PartnerPortalItem,
  PartnerPortalNotice,
  PartnerReviewInput,
  PartnerSubmissionCounts,
  PartnerSubmissionInput,
  PartnerTierInput,
  PartnerTokenIssueInput,
  PartnerWithProgress,
  PlanData,
  PlanVersionRef,
  ProgramSessionInput,
  ProjectCreateInput,
  ProjectOverviewPatch,
  ProjectPatch,
  ProjectSummary,
  QuoteImportConfirmInput,
  QuoteImportDistributeInput,
  QuoteImportDistributeResult,
  RegistrationStats,
  RequestApprovalInput,
  SheetApplyResult,
  SheetColumnPreview,
  SheetConnectInput,
  SheetDiff,
  SheetDiffRow,
  SheetProbe,
  SheetRegistrationStats,
  RsvpContactPatch,
  ScenarioBlockInput,
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
import { buildGuideSeedSections } from '../../lib/guideAssembly'
import { buildCuesFromScenario, scenarioCueCandidates } from '../../lib/scenario'
import { SCENARIO_KIND_LABELS } from '../../lib/labels'

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

/** v2.5 §23 — 시나리오 스냅숏 본문(doc-snapshot의 정형 3종 공통 규약, R-O2 일반화) */
function renderScenarioSnapshotHtml(deliverable: Deliverable, blocks: ScenarioBlock[]): string {
  const rows = blocks
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.time ?? '')}</td><td>${escapeHtml(SCENARIO_KIND_LABELS[b.kind])}</td>` +
        `<td>${escapeHtml(b.script ?? '')}</td><td>${escapeHtml(b.note ?? '')}</td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(deliverable.title)}</title>` +
    `<table border="1" cellspacing="0" cellpadding="6">` +
    `<tr><th>시각</th><th>구분</th><th>대본</th><th>비고</th></tr>${rows}</table>`
  )
}

/** v2.5 §23 — 운영가이드 스냅숏 본문. contacts 섹션 포함 여부는 호출부가 걸러 넘긴다(R-O6) */
function renderGuideSnapshotHtml(deliverable: Deliverable, sections: GuideSection[]): string {
  const body = sections
    .map((s) => `<h2>${escapeHtml(s.title)}</h2><pre>${escapeHtml(s.content ?? '')}</pre>`)
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(deliverable.title)}</title>${body}`
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

  /**
   * v2.5 §23 — "실제로 빌더 데이터를 가진" 시나리오 항목인지. category 문자열만으로 판정하지
   * 않는 이유: 이 레포의 기존 샘플 픽스처(prj-stc26)의 dlv-005는 v2.5 이전부터 자유 카테고리로
   * '시나리오'를 썼고 scenario_blocks가 없다 — 그런 레거시 항목은 종전처럼 일반 ops 항목·수동
   * 버전 컨펌 흐름으로 남아야 한다(DoD-1). 실제 빌더를 거쳐 블록이 있는 항목만 정형 취급한다.
   */
  private hasScenarioBuilderData(d: Deliverable): boolean {
    return d.category === '시나리오' && this.state.scenario_blocks.some((b) => b.deliverable_id === d.id)
  }

  /** v2.5 §23 — 위와 같은 이유로, 운영가이드도 실제 guide_sections 행이 있어야 정형 취급한다 */
  private hasGuideBuilderData(d: Deliverable): boolean {
    return d.category === '운영가이드' && this.state.guide_sections.some((s) => s.deliverable_id === d.id)
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
        kind: p.kind,
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
      partner_guide_url: null, // v2.4.1 §21.1 — 기본 null(주최형 전환 후 행사 설정 ③에서 입력)
      partner_contact_email: null,
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
      partner_id: null, // v2.4 §21 — 이 경로(내부 수동 생성)는 파트너 제출물을 만들지 않는다(전개 전용)
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
    // v2.5 §23 R-O4 — 존별 운영 원본(ops 비정형 항목) 추가는 이 행사 운영가이드의 zone 섹션을
    // stale 표시한다. 자동 반영은 하지 않는다 — 사람이 차이를 확인하고 saveGuideSections로 반영.
    if (deliverable.area === 'ops' && !isStructuredDocCategory(deliverable.category)) {
      this.markGuideZoneStale(deliverable.project_id)
    }
    return deliverable
  }

  /** v2.5 §23 R-O4 — 이 프로젝트의 운영가이드 문서(들)의 zone 섹션에 stale=true를 마킹한다 */
  private markGuideZoneStale(projectId: UUID): void {
    const guideIds = new Set(
      this.state.deliverables
        .filter((d) => d.project_id === projectId && d.category === '운영가이드')
        .map((d) => d.id),
    )
    if (guideIds.size === 0) return
    for (const section of this.state.guide_sections) {
      if (guideIds.has(section.deliverable_id) && section.kind === 'zone') {
        section.source_stale = true
      }
    }
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

    // §5: requested(v1.2 첫 업로드)·changes_requested 상태에서 새 버전 업로드 시 draft 자동 전이.
    // v2.4 §5.1: 주최형 inbound(partner_id 보유) 항목은 version_upload의 목적지가 분기된다 —
    // 수정요청 상태의 내부 업로드(파트너 파일 대리 등록)도 재제출과 같이 pending_approval로
    // 복귀하고, 아직 제출 전(requested)인 항목은 파트너 제출(partner_submit) 경로만 있으므로
    // 내부 업로드를 409로 막는다(전이표에 requested→draft(inbound) 갈래를 쓰지 않는다).
    if (d.partner_id !== null && d.status === 'requested') {
      throw new ProviderError(
        'conflict',
        '파트너 제출 항목은 파트너가 제출 링크로 첫 제출을 해야 합니다.',
      )
    }
    if (d.status === 'requested' || d.status === 'changes_requested') {
      const to = d.partner_id !== null ? 'pending_approval' : 'draft'
      assertTransition(d.status, to, 'version_upload')
      d.status = to
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
    // v1.3→v2.5: 정형 문서(큐시트·시나리오·운영가이드) 항목은 발송 시 스냅숏 버전이 자동
    // 등록되어 발송 조건을 충족한다(§5, §23.2 R-O2 — doc-snapshot이 cue-snapshot을 일반화).
    // 시나리오·운영가이드는 실제 빌더 데이터가 있을 때만(hasScenarioBuilderData 등 — 레거시
    // 자유 카테고리 충돌 방지, DoD-1 dlv-005 참조) 자동 스냅숏 경로를 탄다.
    const isAutoSnapshotDoc =
      d.category === '큐시트' || this.hasScenarioBuilderData(d) || this.hasGuideBuilderData(d)
    const version = isAutoSnapshotDoc
      ? await this.createDocSnapshot(deliverableId)
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

  // ── 등록 · 구글 시트 연동 (S4, v2.6 §24) ──────────────────────────
  // 이 절에는 시트로 쓰는 코드가 없다(§24.6). 원본 행(state.sheet_source_rows)은 mock이
  // 재현한 '시트의 현재 모습'이고, 앱은 그것을 읽어 차이만 보여준다.

  private sheetConnOf(projectId: UUID): SheetConnection | undefined {
    return this.state.sheet_connections.find((c) => c.project_id === projectId)
  }

  private mustSheetConn(projectId: UUID): SheetConnection {
    this.mustFindProject(projectId)
    const conn = this.sheetConnOf(projectId)
    if (!conn) throw new ProviderError('not_found', '연결된 시트가 없습니다.')
    return conn
  }

  private sheetRowsOf(projectId: UUID): SheetSourceRow[] {
    return this.state.sheet_source_rows.filter((r) => r.project_id === projectId)
  }

  private sheetDiffRows(conn: SheetConnection): SheetDiffRow[] {
    return computeSheetDiffRows({
      mapping: conn.mapping,
      sourceRows: this.sheetRowsOf(conn.project_id),
      attendees: this.state.attendees.filter((a) => a.project_id === conn.project_id),
    })
  }

  async getSheetConnection(projectId: UUID): Promise<SheetConnection | null> {
    this.mustFindProject(projectId)
    const conn = this.sheetConnOf(projectId)
    return conn ? structuredClone(conn) : null
  }

  async probeSheet(projectId: UUID, url: string): Promise<SheetProbe> {
    const project = this.mustFindProject(projectId)
    if (!/^https?:\/\/\S+$/.test(url.trim())) {
      throw new ProviderError('validation', '시트 URL을 확인해 주세요 — http로 시작하는 주소여야 합니다.')
    }
    const modified = this.sheetConnOf(projectId)?.source_modified_at ?? DEFAULT_SOURCE_MODIFIED_AT
    return buildProbe(`${project.name} — 참가자 명단`, modified)
  }

  async previewSheetColumns(
    projectId: UUID,
    url: string,
    tabName: string,
  ): Promise<SheetColumnPreview[]> {
    const probe = await this.probeSheet(projectId, url)
    const tab = probe.tabs.find((t) => t.name === tabName)
    if (!tab) throw new ProviderError('not_found', '해당 이름의 탭을 찾을 수 없습니다.')
    if (!tab.selectable) {
      throw new ProviderError('validation', '표 형태가 아닌 탭입니다 — 명단으로 쓸 수 없습니다.')
    }
    return buildColumnPreviews(tab)
  }

  async connectSheet(projectId: UUID, input: SheetConnectInput): Promise<SheetConnection> {
    const user = this.assertRegRole()
    this.assertWritable(projectId)
    if (this.sheetConnOf(projectId)) {
      throw new ProviderError('conflict', '이미 연결된 시트가 있습니다 — 연결을 해제한 뒤 다시 연결해 주세요.')
    }
    const probe = await this.probeSheet(projectId, input.url)
    const tab = probe.tabs.find((t) => t.name === input.tab_name)
    if (!tab || !tab.selectable) {
      throw new ProviderError('validation', '명단으로 쓸 수 있는 탭을 선택해 주세요.')
    }
    const mapped = mappedFields(input.mapping)
    const missing = SHEET_REQUIRED_FIELDS.filter((f) => !mapped.includes(f))
    if (missing.length > 0) {
      const labels = missing.map((f) => SHEET_FIELD_LABELS[f]).join('·')
      throw new ProviderError('validation', `필수 매핑이 없습니다 — ${labels} 컬럼을 지정해 주세요.`)
    }
    // mock의 '시트 내용' — 이 행사에 원본 행이 없으면 결정적 데모 행을 만들어 둔다
    if (this.sheetRowsOf(projectId).length === 0) {
      this.state.sheet_source_rows.push(...generateSourceRows(projectId, 12))
    }
    const now = nowIso()
    const conn: SheetConnection = {
      id: this.nextId('sht'),
      project_id: projectId,
      state: 'connected',
      title: probe.title,
      url: input.url.trim(),
      tab_name: input.tab_name,
      mapping: input.mapping.map((m) => ({ ...m })),
      connected_at: now,
      connected_by: user.name,
      snapshot_at: now,
      snapshot_version: 1,
      checked_at: now,
      auto_check_minutes: 15,
      source_modified_at: probe.source_modified_at,
      pending_added: 0,
      pending_changed: 0,
      pending_removed: 0,
      failure_times: [],
      last_success_at: now,
    }
    this.state.sheet_connections.push(conn)
    // 최초 적재는 사람이 위저드로 명시한 행동이라 그 자리에서 읽어 온다. 단 **추가만** 한다 —
    // 기존 행의 값 변경·삭제는 언제나 차이 확인을 거친다(§24.1-2).
    let seeded = 0
    for (const row of this.sheetRowsOf(projectId)) {
      if (row.invalid) continue
      if (this.state.attendees.some((a) => a.project_id === projectId && a.sheet_row_id === row.sheet_row_id)) {
        continue
      }
      this.state.attendees.push(this.attendeeFromSheetRow(projectId, row))
      seeded += 1
    }
    this.log(projectId, `user:${user.id}`, 'sheet.connected', 'sheet_connection', conn.id, {
      tab_name: input.tab_name,
      seeded,
    })
    return structuredClone(conn)
  }

  private attendeeFromSheetRow(projectId: UUID, row: SheetSourceRow): Attendee {
    return {
      id: this.nextId('att'),
      project_id: projectId,
      rsvp_contact_id: null,
      name: row.name,
      org: row.org,
      email: row.email,
      phone: row.phone,
      channel: 'import',
      registered_at: row.registered_at,
      // 앱 소유 필드는 비어 있는 상태로 시작한다 — 시트가 채우지 않는다
      checked_in_at: null,
      badge_no: null,
      sheet_row_id: row.sheet_row_id,
      title: row.title,
      group_tag: row.group_tag,
      sheet_status: row.status,
      note: null,
    }
  }

  async disconnectSheet(projectId: UUID): Promise<void> {
    const user = this.assertRegRole()
    this.assertWritable(projectId)
    const conn = this.mustSheetConn(projectId)
    this.state.sheet_connections = this.state.sheet_connections.filter((c) => c.id !== conn.id)
    // 참관객 행은 남긴다(이력 보존) — 시트 소유 필드도 마지막 스냅숏 그대로 둔다
    this.log(projectId, `user:${user.id}`, 'sheet.disconnected', 'sheet_connection', conn.id)
  }

  async reauthorizeSheet(projectId: UUID): Promise<SheetConnection> {
    const user = this.assertRegRole()
    this.assertWritable(projectId)
    const conn = this.mustSheetConn(projectId)
    const now = nowIso()
    conn.failure_times = []
    conn.checked_at = now
    conn.last_success_at = now
    const rows = this.sheetDiffRows(conn)
    this.applyPendingCounts(conn, rows)
    this.log(projectId, `user:${user.id}`, 'sheet.reauthorized', 'sheet_connection', conn.id)
    return structuredClone(conn)
  }

  /** 감지 결과를 연결 행에 적는다 — 참관객 데이터는 건드리지 않는다(R-S2) */
  private applyPendingCounts(conn: SheetConnection, rows: SheetDiffRow[]): void {
    conn.pending_added = rows.filter((r) => r.kind === 'added').length
    conn.pending_changed = rows.filter((r) => r.kind === 'changed').length
    conn.pending_removed = rows.filter((r) => r.kind === 'removed').length
    conn.state = rows.length > 0 ? 'stale' : 'connected'
  }

  async checkSheetUpdates(projectId: UUID): Promise<SheetConnection> {
    const conn = this.mustSheetConn(projectId)
    const now = nowIso()
    conn.checked_at = now
    if (conn.state === 'revoked') {
      // 권한이 끊긴 동안에는 읽기 자체가 실패한다 — 실패 시각만 쌓고 스냅숏은 그대로 유지한다
      conn.failure_times = [...conn.failure_times, now].slice(-5)
      return structuredClone(conn)
    }
    conn.last_success_at = now
    this.applyPendingCounts(conn, this.sheetDiffRows(conn))
    return structuredClone(conn)
  }

  async getSheetDiff(projectId: UUID): Promise<SheetDiff> {
    const conn = this.mustSheetConn(projectId)
    const rows = this.sheetDiffRows(conn)
    return {
      snapshot_at: conn.snapshot_at,
      snapshot_version: conn.snapshot_version,
      source_modified_at: conn.source_modified_at,
      rows,
      added: rows.filter((r) => r.kind === 'added').length,
      changed: rows.filter((r) => r.kind === 'changed').length,
      removed: rows.filter((r) => r.kind === 'removed').length,
    }
  }

  async applySheetDiff(projectId: UUID, snapshotVersion: number): Promise<SheetApplyResult> {
    const user = this.assertRegRole()
    this.assertWritable(projectId)
    const conn = this.mustSheetConn(projectId)
    if (conn.state === 'revoked') {
      throw new ProviderError(
        'forbidden',
        '시트 접근 권한이 끊겼습니다 — 재인증한 뒤 다시 반영해 주세요.',
      )
    }
    if (snapshotVersion !== conn.snapshot_version) {
      throw new ProviderError(
        'conflict',
        '다른 담당자가 이미 반영했습니다. 최신 차이를 다시 확인해 주세요.',
      )
    }
    const rows = this.sheetDiffRows(conn)
    if (rows.length === 0) {
      // 반영할 것이 없으면 버전을 올리지 않는다 — 다른 담당자의 화면을 헛되이 낡게 만들지 않기 위함
      return { applied: 0, added: 0, changed: 0, removed: 0, connection: structuredClone(conn) }
    }
    const sourceById = new Map(this.sheetRowsOf(projectId).map((r) => [r.sheet_row_id, r]))
    const fields = mappedFields(conn.mapping)
    let added = 0
    let changed = 0
    let removed = 0

    for (const row of rows) {
      if (row.kind === 'added') {
        const source = sourceById.get(row.sheet_row_id)
        if (!source) continue
        this.state.attendees.push(this.attendeeFromSheetRow(projectId, source))
        added += 1
        continue
      }
      const attendee = this.state.attendees.find((a) => a.id === row.attendee_id)
      if (!attendee) continue
      if (row.kind === 'removed') {
        // 하드 삭제 금지 — 상태만 바꿔 이력을 남긴다(체크인·비고는 그대로)
        attendee.sheet_status = 'removed'
        removed += 1
        continue
      }
      const source = sourceById.get(row.sheet_row_id)
      if (!source) continue
      // 시트 소유 필드만 갱신한다 — checked_in_at·note·badge_no(앱 소유)는 손대지 않는다
      for (const field of fields) {
        if (field === 'name') attendee.name = source.name
        if (field === 'org') attendee.org = source.org
        if (field === 'title') attendee.title = source.title
        if (field === 'email') attendee.email = source.email
        if (field === 'phone') attendee.phone = source.phone
        if (field === 'group_tag') attendee.group_tag = source.group_tag
        if (field === 'registered_at') attendee.registered_at = source.registered_at
      }
      attendee.sheet_status = source.status
      changed += 1
    }

    const now = nowIso()
    conn.snapshot_version += 1
    conn.snapshot_at = conn.source_modified_at ?? now
    conn.state = 'connected'
    conn.pending_added = 0
    conn.pending_changed = 0
    conn.pending_removed = 0
    conn.checked_at = now
    conn.last_success_at = now
    this.log(projectId, `user:${user.id}`, 'sheet.applied', 'sheet_connection', conn.id, {
      added,
      changed,
      removed,
      snapshot_version: conn.snapshot_version,
    })
    return {
      applied: added + changed + removed,
      added,
      changed,
      removed,
      connection: structuredClone(conn),
    }
  }

  async getSheetRegistrationStats(projectId: UUID): Promise<SheetRegistrationStats | null> {
    this.mustFindProject(projectId)
    const conn = this.sheetConnOf(projectId)
    if (!conn) return null // 미연결 — 화면은 기존 getRegistrationStats로 폴백한다
    const linked = this.state.attendees.filter(
      (a) => a.project_id === projectId && a.sheet_row_id && a.sheet_status !== 'removed',
    )
    const rows = this.sheetRowsOf(projectId)
    const bySourceRow = new Map(rows.map((r) => [r.sheet_row_id, r]))
    const confirmed = linked.filter((a) => a.sheet_status === 'confirmed').length
    const cancelled = linked.filter((a) => a.sheet_status === 'cancelled')
    const checkedIn = linked.filter((a) => a.checked_in_at).length
    const applied = linked.length
    return {
      applied,
      confirmed,
      cancelled: cancelled.length,
      checked_in: checkedIn,
      source_rows: rows.length,
      excluded: rows.filter((r) => r.invalid).length,
      response_rate: applied === 0 ? 0 : confirmed / applied,
      checkin_rate: confirmed === 0 ? 0 : checkedIn / confirmed,
      cancelled_after_confirm: cancelled.filter(
        (a) => bySourceRow.get(a.sheet_row_id as string)?.previously_confirmed,
      ).length,
      snapshot_at: conn.snapshot_at,
    }
  }

  /**
   * mock 전용 — 공유 해제·인증 만료를 재현한다(인터페이스에는 없다). 화면의 '권한 끊김' 카드와
   * reauthorizeSheet 복구 경로를 데모·테스트에서 밟기 위한 스위치다.
   */
  simulateSheetRevoke(projectId: UUID): SheetConnection {
    const conn = this.mustSheetConn(projectId)
    const base = Date.parse(conn.checked_at ?? nowIso())
    conn.state = 'revoked'
    conn.failure_times = [0, 15, 30].map((m) => new Date(base + m * 60_000).toISOString())
    return structuredClone(conn)
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
    // v2.4 §21 R-H1 — kind 전환은 표시 계층만 바꾼다. 파트너·WBS·산출물 등 어떤 행도 지우지
    // 않는다(지울 행이 없다 — 그냥 필드 하나를 바꿀 뿐이다).
    if (patch.kind !== undefined) project.kind = patch.kind
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
    // v2.4.1 §21.1 — 행사 설정 ③ 주최형 블록 (kind 무관하게 저장은 허용, 표시만 host에서 게이트)
    if (patch.partner_guide_url !== undefined) project.partner_guide_url = patch.partner_guide_url
    if (patch.partner_contact_email !== undefined) project.partner_contact_email = patch.partner_contact_email
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
    // v2.4 §21 — kind='host'면 파트너별 WBS(HT 템플릿+inbound 자동 생성)로 분기, 대행형 경로는 불변
    // v2.4.1(3.15.1 폴리시 P4) — host 분기는 R&R·컴플라이언스를 여기서 따로 부르지 않는다:
    // expandHostWbs 내부의 백필 가드(§15.3b·§15.3c, "비어 있으면 시드")가 이미 채운다 — 신규
    // 온보딩이면 이 시점에 두 테이블이 비어 있어 백필 가드가 그대로 최초 시드 경로가 된다.
    // 대행형은 event_type별 템플릿이 필요해 expandWbs가 모르는 정보이므로 여기서 명시 호출한다.
    if (project.kind === 'host') {
      await this.expandHostWbs(projectId)
    } else {
      await this.expandWbs(projectId)
      this.seedRoleCharters(projectId)
      // v2.0 부수 효과: 컴플라이언스 카드 시드 (§4-17)
      this.seedComplianceCards(projectId)
    }
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

  /**
   * §8 cue-snapshot — 큐시트 검증 후 createDocSnapshot에 위임(R-O2 — 새 스냅숏 규약을
   * 만들지 않는다). 시그니처·동작·activity log 의미는 v1.3부터 그대로 보존한다.
   */
  async createCueSnapshot(deliverableId: UUID): Promise<Version> {
    // pm 체크를 먼저 해 기존 오류 우선순위(pm→존재→카테고리)를 그대로 보존한다
    this.assertPm()
    const d = this.mustFindDeliverable(deliverableId)
    if (d.category !== '큐시트') {
      throw new ProviderError('conflict', '큐시트 항목이 아닙니다.')
    }
    return this.createDocSnapshot(deliverableId)
  }

  /** 정형 문서 스냅숏 공용 — 버전 레코드만 만든다(파일 저장은 persistSnapshotVersion) */
  private buildSnapshotVersion(d: Deliverable, note: string): Version {
    const versionNo = (this.versionsOf(d.id)[0]?.version_no ?? 0) + 1
    return {
      id: this.nextId('ver'),
      deliverable_id: d.id,
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
      note,
      uploaded_by: this.currentUser().id,
      created_at: nowIso(),
    }
  }

  private persistSnapshotVersion(version: Version, html: string): void {
    this.state.versions.push(version)
    const canBlob =
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof Blob !== 'undefined'
    this.uploadedFileUrls.set(
      version.id,
      canBlob ? URL.createObjectURL(new Blob([html], { type: 'text/html' })) : `mock://files/${version.id}`,
    )
  }

  /** §8 doc-snapshot(pm) — 정형 문서(큐시트·시나리오·운영가이드) 공통 인쇄 스냅숏 → 버전 등록 */
  async createDocSnapshot(deliverableId: UUID, opts?: { include_contacts?: boolean }): Promise<Version> {
    const user = this.assertPm()
    const d = this.mustFindDeliverable(deliverableId)

    if (d.category === '큐시트') {
      const cues = await this.listCues(deliverableId)
      if (cues.length === 0) {
        throw new ProviderError('validation', '스냅숏을 만들 큐가 없습니다.')
      }
      const version = this.buildSnapshotVersion(d, '큐시트 스냅숏 — 컨펌 발송용 자동 생성')
      this.persistSnapshotVersion(version, renderCueSnapshotHtml(d, cues))
      this.log(d.project_id, `user:${user.id}`, 'cue.snapshot', 'version', version.id, {
        deliverable_id: deliverableId,
      })
      return version
    }

    if (d.category === '시나리오') {
      const blocks = await this.listScenarioBlocks(deliverableId)
      if (blocks.length === 0) {
        throw new ProviderError('validation', '스냅숏을 만들 진행 블록이 없습니다.')
      }
      const version = this.buildSnapshotVersion(d, '시나리오 스냅숏 — 컨펌 발송용 자동 생성')
      this.persistSnapshotVersion(version, renderScenarioSnapshotHtml(d, blocks))
      this.log(d.project_id, `user:${user.id}`, 'doc.snapshot', 'version', version.id, {
        deliverable_id: deliverableId,
        category: d.category,
      })
      return version
    }

    if (d.category === '운영가이드') {
      const sections = await this.listGuideSections(deliverableId)
      if (sections.length === 0) {
        throw new ProviderError('validation', '스냅숏을 만들 섹션이 없습니다.')
      }
      // R-O6 — 개인 연락처(contacts 섹션)는 명시 옵션일 때만 인쇄에 포함, 기본은 제외
      const includeContacts = opts?.include_contacts === true
      const visible = includeContacts ? sections : sections.filter((s) => s.kind !== 'contacts')
      const version = this.buildSnapshotVersion(d, '운영가이드 스냅숏 — 컨펌 발송용 자동 생성')
      this.persistSnapshotVersion(version, renderGuideSnapshotHtml(d, visible))
      this.log(d.project_id, `user:${user.id}`, 'doc.snapshot', 'version', version.id, {
        deliverable_id: deliverableId,
        category: d.category,
        include_contacts: includeContacts,
      })
      return version
    }

    throw new ProviderError('conflict', '정형 문서(큐시트·시나리오·운영가이드) 항목이 아닙니다.')
  }

  // ── v2.5 §23 시나리오 (pm·ops 쓰기 / 멤버 읽기 — category='시나리오' 항목만) ──
  private mustFindScenarioDeliverable(deliverableId: UUID): Deliverable {
    const d = this.mustFindDeliverable(deliverableId)
    if (d.category !== '시나리오') {
      throw new ProviderError('conflict', '시나리오 항목이 아닙니다.')
    }
    return d
  }

  async listScenarioBlocks(deliverableId: UUID): Promise<ScenarioBlock[]> {
    this.mustFindScenarioDeliverable(deliverableId)
    return this.state.scenario_blocks
      .filter((b) => b.deliverable_id === deliverableId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async saveScenarioBlocks(deliverableId: UUID, blocks: ScenarioBlockInput[]): Promise<ScenarioBlock[]> {
    const user = this.assertPmOps()
    const d = this.mustFindScenarioDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    const built: ScenarioBlock[] = blocks.map((b, i) => ({
      id: this.nextId('scb'),
      deliverable_id: deliverableId,
      session_id: b.session_id ?? null,
      time: b.time ?? null,
      kind: b.kind,
      script: b.script ?? null,
      note: b.note ?? null,
      sort_order: i + 1,
    }))
    this.state.scenario_blocks = this.state.scenario_blocks
      .filter((x) => x.deliverable_id !== deliverableId)
      .concat(built)
    this.log(d.project_id, `user:${user.id}`, 'scenario.saved', 'deliverable', deliverableId, {
      count: built.length,
    })
    return built
  }

  /** §8.2 scenario-seed — 프로그램표 세션당 그룹 헤더 + 기본 진행 블록. 빈 문서에서만(R-O3) */
  async seedScenarioFromProgram(deliverableId: UUID): Promise<ScenarioBlock[]> {
    const user = this.assertPmOps()
    const d = this.mustFindScenarioDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    if (this.state.scenario_blocks.some((b) => b.deliverable_id === deliverableId)) {
      throw new ProviderError(
        'conflict',
        '이미 진행 블록이 있는 문서입니다 — 빈 문서에서만 시드할 수 있습니다.',
      )
    }
    const sessions = await this.listProgramSessions(d.project_id)
    const built: ScenarioBlock[] = []
    let order = 0
    for (const s of sessions) {
      order += 1
      built.push({
        id: this.nextId('scb'),
        deliverable_id: deliverableId,
        session_id: s.id,
        time: s.start_time,
        kind: 'custom',
        script: null,
        note: `세션: ${s.title}`,
        sort_order: order,
      })
      order += 1
      built.push({
        id: this.nextId('scb'),
        deliverable_id: deliverableId,
        session_id: s.id,
        time: s.start_time,
        kind: 'mc',
        script: '',
        note: null,
        sort_order: order,
      })
    }
    this.state.scenario_blocks.push(...built)
    this.log(d.project_id, `user:${user.id}`, 'scenario.seed', 'deliverable', deliverableId, {
      session_count: sessions.length,
    })
    return built
  }

  /**
   * §8.2 scenario-export-cues — 큐 후보(kind video·transition + 큐 표기 토큰)만 변환해
   * 대상 큐시트에 추가한다. 기존 큐 보존·후미 삽입(R-O5), 대본 전문은 복사하지 않는다(§23.3).
   */
  async exportScenarioToCues(deliverableId: UUID, targetDeliverableId: UUID): Promise<Cue[]> {
    const user = this.assertPmOps()
    const scenario = this.mustFindScenarioDeliverable(deliverableId)
    const target = this.mustFindDeliverable(targetDeliverableId)
    if (target.category !== '큐시트') {
      throw new ProviderError('conflict', '대상이 큐시트 항목이 아닙니다.')
    }
    this.assertWritable(scenario.project_id)
    const blocks = await this.listScenarioBlocks(deliverableId)
    const candidates = scenarioCueCandidates(blocks)
    if (candidates.length === 0) return []
    const existingCues = await this.listCues(targetDeliverableId)
    const maxOrder = existingCues.reduce((m, c) => Math.max(m, c.sort_order), 0)
    const newCues = buildCuesFromScenario({
      candidates,
      targetDeliverableId,
      existingCueNos: existingCues.map((c) => c.cue_no),
      startSortOrder: maxOrder,
      scenarioTitle: scenario.title,
      makeId: () => this.nextId('cue'),
    })
    this.state.cues.push(...newCues)
    this.log(scenario.project_id, `user:${user.id}`, 'scenario.export_cues', 'deliverable', deliverableId, {
      target_deliverable_id: targetDeliverableId,
      count: newCues.length,
    })
    return newCues
  }

  // ── v2.5 §23 운영가이드 (pm·ops 쓰기 / 멤버 읽기 — category='운영가이드' 항목만) ──
  private mustFindGuideDeliverable(deliverableId: UUID): Deliverable {
    const d = this.mustFindDeliverable(deliverableId)
    if (d.category !== '운영가이드') {
      throw new ProviderError('conflict', '운영가이드 항목이 아닙니다.')
    }
    return d
  }

  async listGuideSections(deliverableId: UUID): Promise<GuideSection[]> {
    this.mustFindGuideDeliverable(deliverableId)
    return this.state.guide_sections
      .filter((s) => s.deliverable_id === deliverableId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async saveGuideSections(deliverableId: UUID, sections: GuideSectionInput[]): Promise<GuideSection[]> {
    const user = this.assertPmOps()
    const d = this.mustFindGuideDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    const built: GuideSection[] = sections.map((s, i) => ({
      id: s.id ?? this.nextId('gds'),
      deliverable_id: deliverableId,
      kind: s.kind,
      title: s.title,
      content: s.content ?? null,
      source_ref: s.source_ref ?? null,
      // 사람이 직접 저장하면 반영 완료 — stale 해제(입력에 명시하지 않으면 false)
      source_stale: s.source_stale ?? false,
      sort_order: i + 1,
    }))
    this.state.guide_sections = this.state.guide_sections
      .filter((x) => x.deliverable_id !== deliverableId)
      .concat(built)
    this.log(d.project_id, `user:${user.id}`, 'guide.saved', 'deliverable', deliverableId, {
      count: built.length,
    })
    return built
  }

  /** §8.2 guide-seed — 존별 운영·R&R에서 4섹션 초기 로드. 빈 문서에서만(R-O3) */
  async seedGuideFromSources(deliverableId: UUID): Promise<GuideSection[]> {
    const user = this.assertPmOps()
    const d = this.mustFindGuideDeliverable(deliverableId)
    this.assertWritable(d.project_id)
    if (this.state.guide_sections.some((s) => s.deliverable_id === deliverableId)) {
      throw new ProviderError(
        'conflict',
        '이미 섹션이 있는 문서입니다 — 빈 문서에서만 시드할 수 있습니다.',
      )
    }
    const opsItems = this.state.deliverables.filter(
      (x) => x.project_id === d.project_id && x.area === 'ops',
    )
    const charters = await this.listRoleCharters(d.project_id)
    const seeds = buildGuideSeedSections(opsItems, charters)
    const built: GuideSection[] = seeds.map((s, i) => ({
      id: this.nextId('gds'),
      deliverable_id: deliverableId,
      kind: s.kind,
      title: s.title,
      content: s.content,
      source_ref: s.source_ref,
      source_stale: false,
      sort_order: i + 1,
    }))
    this.state.guide_sections.push(...built)
    this.log(d.project_id, `user:${user.id}`, 'guide.seed', 'deliverable', deliverableId, {})
    return built
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
        direction: 'internal' as const, // v2.4 §21 — 대행형 템플릿(모객형·일반형)은 항상 내부 태스크
        partner_id: null,
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

  /**
   * v2.4 §21·§15.3 — 주최형 WBS 전개. HT-1~12를 event_date 기준으로 펼치되,
   * partner_submit 방향은 활성 파트너 수만큼 인스턴스를 만들고(파트너별 상태 독립),
   * host_notice·internal은 단일 인스턴스로 둔다. partner_submit 인스턴스는 전개와 동시에
   * inbound deliverable(status='requested')을 자동 생성해 linked_deliverable_id로 연결한다(§5.1).
   * 재전개는 code+partner_id 매칭으로 기존 상태·연결·메모를 보존한다(R-H5).
   */
  async expandHostWbs(projectId: UUID): Promise<WbsTask[]> {
    const user = this.assertPm()
    const project = this.assertWritable(projectId)
    if (!project.event_date) {
      throw new ProviderError('validation', '행사일이 있어야 WBS를 전개할 수 있습니다.')
    }
    const activePartners = this.state.partners.filter(
      (p) => p.project_id === projectId && p.status === 'active',
    )
    const mine = this.state.wbs_tasks.filter((task) => task.project_id === projectId)
    const others = this.state.wbs_tasks.filter((task) => task.project_id !== projectId)
    // R-H5: code+partner_id 매칭으로 재전개 보존 ('' = partner_id 없음, host_notice·internal용)
    const prevByKey = new Map(mine.map((task) => [`${task.code}:${task.partner_id ?? ''}`, task]))
    const areaByRole: Record<MemberRole, DeliverableArea> = {
      design: 'design',
      ops: 'ops',
      pm: 'common',
      reg: 'common',
    }

    const expanded: WbsTask[] = []
    let sortOrder = 1
    for (const tpl of HOST_TEMPLATE) {
      const direction = tpl.direction ?? 'internal'
      const instances: (Partner | null)[] = direction === 'partner_submit' ? activePartners : [null]
      for (const partner of instances) {
        const old = prevByKey.get(`${tpl.code}:${partner?.id ?? ''}`)
        const task: WbsTask = {
          id: old?.id ?? this.nextId('wbs'),
          project_id: projectId,
          phase_no: tpl.phase_no,
          phase_name: tpl.phase_name,
          code: tpl.code,
          title: partner ? `${tpl.title} — ${partner.name}` : tpl.title,
          offset_start: tpl.offset_start,
          offset_end: tpl.offset_end,
          start_date: offsetToDate(project.event_date!, tpl.offset_start),
          end_date: offsetToDate(project.event_date!, tpl.offset_end),
          role: tpl.role,
          origin_role: null,
          status: old?.status ?? 'todo',
          done_at: old?.done_at ?? null,
          linked_deliverable_id: old?.linked_deliverable_id ?? null,
          // v2.4.1(3.15.1 폴리시 P6-①) — S5 '소통 대상' 열 공란 해소: partner_submit 인스턴스는
          // 해당 파트너명을 target으로 시드한다(host_notice·internal은 파트너 단위가 아니므로 null 유지).
          target: partner ? partner.name : null,
          direction,
          partner_id: partner?.id ?? null,
          note: old?.note ?? null,
          sort_order: sortOrder++,
        }
        expanded.push(task)

        if (direction === 'partner_submit' && partner && !task.linked_deliverable_id) {
          const deliverable: Deliverable = {
            id: this.nextId('dlv'),
            project_id: projectId,
            area: areaByRole[tpl.role],
            category: '파트너 제출',
            title: `${tpl.title} — ${partner.name}`,
            status: 'requested',
            assignee_id: null,
            due_date: task.end_date,
            drive_folder_id: null,
            requires_approval: true,
            brief: null,
            brief_refs: null,
            spec_size: null,
            spec_qty: null,
            spec_location: null,
            spec_type: null,
            content: null,
            partner_id: partner.id,
            created_at: nowIso(),
            updated_at: nowIso(),
          }
          this.state.deliverables.push(deliverable)
          task.linked_deliverable_id = deliverable.id
          this.log(projectId, `user:${user.id}`, 'deliverable.requested', 'deliverable', deliverable.id, {
            partner_id: partner.id,
            wbs_code: tpl.code,
          })
        }
      }
    }
    this.state.wbs_tasks = [...others, ...expanded]
    // v2.4.1(3.15.1 폴리시 P4 백필 경로) — expandHostWbs는 completeOnboarding(신규 온보딩)과
    // S5 '템플릿 재전개' 버튼(기존 host 행사) 양쪽의 유일한 진입점이라, 새 provider 메서드를
    // 추가하지 않고 여기서 R&R·컴플라이언스 유무를 확인해 없을 때만 §15.3b·§15.3c 세트를
    // 멱등 시드한다(이미 있으면 손대지 않는다 — 체크 상태 보존, 중복 생성 금지).
    if (!this.state.role_charters.some((c) => c.project_id === projectId)) {
      this.seedRoleCharters(projectId)
    }
    if (!this.state.compliance_cards.some((c) => c.project_id === projectId)) {
      this.seedComplianceCards(projectId)
    }
    this.log(projectId, `user:${user.id}`, 'wbs.expanded_host', 'project', projectId, {
      count: expanded.length,
      partners: activePartners.length,
    })
    return [...expanded]
  }

  private seedRoleCharters(projectId: UUID): void {
    const project = this.mustFindProject(projectId)
    const others = this.state.role_charters.filter((c) => c.project_id !== projectId)
    // v2.4.1 §15.3b — kind='host'는 event_type과 무관하게 주최형 4카드로 고정(직교 축)
    const templates = project.kind === 'host' ? HOST_ROLE_CHARTER_TEMPLATE : ROLE_CHARTER_TEMPLATES[project.event_type]
    const seeded = templates.map((tpl) => ({
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

  // ── v2.4 §21 주최형(파트너) — 등급·파트너·토큰 CRUD는 pm, 열람은 멤버 전원 ───
  private mustFindPartner(partnerId: UUID): Partner {
    const p = this.state.partners.find((x) => x.id === partnerId)
    if (!p) throw new ProviderError('not_found', '파트너를 찾을 수 없습니다.')
    return p
  }

  async listPartnerTiers(projectId: UUID): Promise<PartnerTier[]> {
    this.currentUser()
    this.mustFindProject(projectId)
    return this.state.partner_tiers
      .filter((t) => t.project_id === projectId)
      .sort((a, b) => a.sort - b.sort)
  }

  async upsertPartnerTier(projectId: UUID, input: PartnerTierInput): Promise<PartnerTier> {
    this.assertPm()
    this.assertWritable(projectId)
    const code = input.code?.trim()
    if (!code) throw new ProviderError('validation', '등급 코드는 필수입니다.')
    if (!input.name?.trim()) throw new ProviderError('validation', '등급명은 필수입니다.')
    const existing = this.state.partner_tiers.find(
      (t) => t.project_id === projectId && t.code === code,
    )
    if (existing) {
      existing.name = input.name.trim()
      existing.description = input.description ?? null
      existing.capacity = input.capacity ?? null
      if (input.sort !== undefined) existing.sort = input.sort
      return { ...existing }
    }
    const tier: PartnerTier = {
      id: this.nextId('tier'),
      project_id: projectId,
      code,
      name: input.name.trim(),
      description: input.description ?? null,
      capacity: input.capacity ?? null,
      sort:
        input.sort ?? this.state.partner_tiers.filter((t) => t.project_id === projectId).length + 1,
    }
    this.state.partner_tiers.push(tier)
    return { ...tier }
  }

  async deletePartnerTier(tierId: UUID): Promise<void> {
    this.assertPm()
    const tier = this.state.partner_tiers.find((t) => t.id === tierId)
    if (!tier) throw new ProviderError('not_found', '등급을 찾을 수 없습니다.')
    this.assertWritable(tier.project_id)
    if (this.state.partners.some((p) => p.tier_id === tierId)) {
      throw new ProviderError('conflict', '이 등급을 쓰는 파트너가 있어 삭제할 수 없습니다.')
    }
    this.state.partner_tiers = this.state.partner_tiers.filter((t) => t.id !== tierId)
  }

  /** 오늘 이후 미완료 partner_submit 태스크 중 가장 가까운 마감 — S-11 카드용 */
  private partnerNextDeadline(partnerId: UUID, today: string): PartnerNextDeadline | null {
    const next = this.state.wbs_tasks
      .filter(
        (t) =>
          t.partner_id === partnerId &&
          t.direction === 'partner_submit' &&
          t.status !== 'done' &&
          t.end_date &&
          t.end_date >= today,
      )
      .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))[0]
    return next ? { code: next.code, title: next.title, end_date: next.end_date } : null
  }

  private partnerWithProgress(partner: Partner, today: string): PartnerWithProgress {
    const tier = partner.tier_id
      ? this.state.partner_tiers.find((t) => t.id === partner.tier_id) ?? null
      : null
    const token =
      this.state.partner_tokens
        .filter((t) => t.partner_id === partner.id && !t.revoked_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null

    const counts: PartnerSubmissionCounts = {
      requested: 0,
      pending_approval: 0,
      changes_requested: 0,
      approved_or_final: 0,
    }
    for (const task of this.state.wbs_tasks) {
      if (task.partner_id !== partner.id || task.direction !== 'partner_submit') continue
      if (!task.linked_deliverable_id) continue
      const d = this.state.deliverables.find((x) => x.id === task.linked_deliverable_id)
      if (!d) continue
      if (d.status === 'requested') counts.requested++
      else if (d.status === 'pending_approval') counts.pending_approval++
      else if (d.status === 'changes_requested') counts.changes_requested++
      else if (d.status === 'approved' || d.status === 'final') counts.approved_or_final++
    }

    return {
      ...partner,
      tier,
      token,
      submission_counts: counts,
      next_deadline: this.partnerNextDeadline(partner.id, today),
    }
  }

  async listPartners(projectId: UUID): Promise<PartnerWithProgress[]> {
    this.currentUser()
    this.mustFindProject(projectId)
    const today = toIsoDate(new Date())
    return this.state.partners
      .filter((p) => p.project_id === projectId)
      .map((p) => this.partnerWithProgress(p, today))
  }

  async createPartner(projectId: UUID, input: PartnerInput): Promise<Partner> {
    const user = this.assertPm()
    this.assertWritable(projectId)
    const name = input.name?.trim()
    if (!name) throw new ProviderError('validation', '파트너명은 필수입니다.')
    if (input.tier_id) {
      const tier = this.state.partner_tiers.find(
        (t) => t.id === input.tier_id && t.project_id === projectId,
      )
      if (!tier) throw new ProviderError('validation', '이 행사의 등급이 아닙니다.')
    }
    const partner: Partner = {
      id: this.nextId('ptn'),
      project_id: projectId,
      name,
      tier_id: input.tier_id ?? null,
      status: input.status ?? 'active',
      contract_amount: input.contract_amount ?? null,
      note: input.note ?? null,
      created_at: nowIso(),
    }
    this.state.partners.push(partner)
    this.log(projectId, `user:${user.id}`, 'partner.created', 'partner', partner.id)
    return { ...partner }
  }

  async updatePartner(partnerId: UUID, patch: Partial<PartnerInput>): Promise<Partner> {
    this.assertPm()
    const partner = this.mustFindPartner(partnerId)
    this.assertWritable(partner.project_id)
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ProviderError('validation', '파트너명은 필수입니다.')
      partner.name = patch.name.trim()
    }
    if (patch.tier_id !== undefined) {
      if (patch.tier_id) {
        const tier = this.state.partner_tiers.find(
          (t) => t.id === patch.tier_id && t.project_id === partner.project_id,
        )
        if (!tier) throw new ProviderError('validation', '이 행사의 등급이 아닙니다.')
      }
      partner.tier_id = patch.tier_id
    }
    if (patch.status !== undefined) partner.status = patch.status
    if (patch.contract_amount !== undefined) partner.contract_amount = patch.contract_amount
    if (patch.note !== undefined) partner.note = patch.note
    return { ...partner }
  }

  async removePartner(partnerId: UUID): Promise<void> {
    const user = this.assertPm()
    const partner = this.mustFindPartner(partnerId)
    this.assertWritable(partner.project_id)
    // 이미 제출 이력(WBS 인스턴스·inbound 산출물)이 있는 파트너는 하드 삭제하지 않는다 —
    // 재전개 매칭(code+partner_id)이 깨지고 이력이 사라진다. status='withdrawn'으로 대신한다
    // (설계 결정, 3.15a — §21.2에 하드 삭제 금지가 명문화돼 있지 않아 안전한 쪽을 택했다).
    const hasWork =
      this.state.wbs_tasks.some((t) => t.partner_id === partnerId) ||
      this.state.deliverables.some((d) => d.partner_id === partnerId)
    if (hasWork) {
      throw new ProviderError(
        'conflict',
        '이미 제출 이력이 있는 파트너는 삭제할 수 없습니다 — 상태를 철회로 변경하세요.',
      )
    }
    this.state.partner_tokens = this.state.partner_tokens.filter((t) => t.partner_id !== partnerId)
    this.state.partners = this.state.partners.filter((p) => p.id !== partnerId)
    this.log(partner.project_id, `user:${user.id}`, 'partner.removed', 'partner', partnerId)
  }

  async issuePartnerToken(partnerId: UUID, input: PartnerTokenIssueInput): Promise<PartnerToken> {
    const user = this.assertPm()
    const partner = this.mustFindPartner(partnerId)
    const project = this.assertWritable(partner.project_id)
    const name = input.contact_name?.trim()
    const email = input.contact_email?.trim()
    if (!name || !email) throw new ProviderError('validation', '담당자명과 이메일은 필수입니다.')
    let expires = input.expires_at ?? null
    if (!expires && project.event_date) {
      // §6.3과 동일 원칙 — 기본 만료 = 행사일+30일
      const d = new Date(`${project.event_date}T00:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() + 30)
      expires = d.toISOString()
    }
    const token: PartnerToken = {
      id: this.nextId('ptok'),
      partner_id: partnerId,
      contact_name: name,
      contact_email: email,
      token: this.nextId('ptk'),
      expires_at: expires,
      revoked_at: null,
      last_seen_at: null,
      created_at: nowIso(),
    }
    this.state.partner_tokens.push(token)
    this.log(partner.project_id, `user:${user.id}`, 'partner_token.issued', 'partner_token', token.id)
    return { ...token }
  }

  async revokePartnerToken(token: string): Promise<PartnerToken> {
    const user = this.assertPm()
    const t = this.state.partner_tokens.find((x) => x.token === token)
    if (!t) throw new ProviderError('not_found', '토큰을 찾을 수 없습니다.')
    if (!t.revoked_at) t.revoked_at = nowIso()
    const partner = this.mustFindPartner(t.partner_id)
    this.log(partner.project_id, `user:${user.id}`, 'partner_token.revoked', 'partner_token', t.id)
    return { ...t }
  }

  /** 파트너 토큰 검증 (§6.2 R-H2 승계) — 미존재=404, 회수·만료=410. 접근 시 last_seen_at 갱신 */
  private resolvePartnerToken(token: string): PartnerToken {
    const t = this.state.partner_tokens.find((x) => x.token === token)
    if (!t) throw new ProviderError('not_found', '유효하지 않은 링크입니다.')
    if (t.revoked_at || (t.expires_at && new Date(t.expires_at).getTime() < Date.now())) {
      throw new ProviderError('gone', '링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.')
    }
    t.last_seen_at = nowIso()
    return t
  }

  /**
   * §6.2 R-H2 — `/p/{token}` 응답에 타 파트너의 어떤 행도 포함되지 않는다: 쿼리 자체에서
   * `task.partner_id === partner.id`로 걸러 다른 파트너 인스턴스를 애초에 후보에 넣지 않는다.
   * §21.2 R-H3 — 반환 타입(PartnerPortalData)이 partner_name·tier_name만 노출하고 Partner
   * 엔티티를 통째로 스프레드하지 않으므로 contract_amount는 구조적으로 여기 들어올 수 없다.
   */
  async getPartnerPortal(token: string): Promise<PartnerPortalData> {
    const t = this.resolvePartnerToken(token)
    const partner = this.mustFindPartner(t.partner_id)
    const project = this.mustFindProject(partner.project_id)
    const tier = partner.tier_id
      ? this.state.partner_tiers.find((x) => x.id === partner.tier_id)
      : undefined

    const submission_items: PartnerPortalItem[] = this.state.wbs_tasks
      .filter(
        (task) =>
          task.project_id === partner.project_id &&
          task.partner_id === partner.id &&
          task.direction === 'partner_submit' &&
          task.linked_deliverable_id,
      )
      .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
      .map((task) => {
        const d = this.mustFindDeliverable(task.linked_deliverable_id!)
        return {
          task_code: task.code,
          task_title: task.title,
          deadline: task.end_date,
          deliverable_id: d.id,
          status: d.status,
          // R-H6: 발주처 코멘트 규칙과 동일 — shared만
          comments: this.state.comments
            .filter((c) => c.deliverable_id === d.id && c.visibility === 'shared')
            .sort((a, b) => a.created_at.localeCompare(b.created_at)),
          versions: this.versionsOf(d.id),
        }
      })

    const notices: PartnerPortalNotice[] = this.state.wbs_tasks
      .filter((task) => task.project_id === partner.project_id && task.direction === 'host_notice')
      .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
      .map((task) => ({
        task_code: task.code,
        task_title: task.title,
        deadline: task.end_date,
        note: task.note,
      }))

    return {
      project_name: project.name,
      event_date: project.event_date,
      venue: project.venue,
      partner_name: partner.name,
      tier_name: tier?.name ?? null,
      submission_items,
      notices,
      // v2.4.1 §21.1 — 프로젝트 필드를 그대로 노출(전 파트너 공통 안내, 값 없으면 null)
      guide_url: project.partner_guide_url,
      contact_email: project.partner_contact_email,
    }
  }

  /**
   * 파트너 제출 — 파일이면 blob 버전으로 기존 uploadVersion 관례를 재사용하고, 텍스트도
   * 근거가 남아야 하므로 동일하게 versions 이력(텍스트를 담은 blob)으로 통일한다(설계 결정,
   * 3.15a — 파일·텍스트 두 경로가 갈리면 재제출·컨펌 규칙을 두 벌 유지해야 한다).
   * 상태 전이: requested→pending_approval(via partner_submit, 첫 제출) 또는
   * changes_requested→pending_approval(via version_upload, host_inbound 분기 — 재제출).
   * 두 경로 모두 assertTransition을 경유한다(R-H4).
   */
  async submitPartnerItem(
    token: string,
    deliverableId: UUID,
    input: PartnerSubmissionInput,
  ): Promise<Deliverable> {
    const t = this.resolvePartnerToken(token)
    const partner = this.mustFindPartner(t.partner_id)
    const d = this.mustFindDeliverable(deliverableId)
    if (d.partner_id !== partner.id) {
      throw new ProviderError('forbidden', '이 파트너가 제출할 수 있는 항목이 아닙니다.')
    }
    this.assertWritable(d.project_id)
    if (d.status !== 'requested' && d.status !== 'changes_requested') {
      throw new ProviderError('conflict', `현재 상태(${d.status})에서는 제출할 수 없습니다.`)
    }

    const isFirstSubmission = d.status === 'requested'
    const via = isFirstSubmission ? 'partner_submit' : 'version_upload'
    assertTransition(d.status, 'pending_approval', via)

    const versionNo = (this.versionsOf(deliverableId)[0]?.version_no ?? 0) + 1
    const isText = 'text' in input
    const originalFileName = isText ? `${d.title}_텍스트제출.txt` : input.file_name
    if (isText) d.content = input.text

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
        original_file_name: originalFileName,
      }),
      note: isText ? '파트너 텍스트 제출' : input.note ?? null,
      uploaded_by: null, // 파트너는 내부 사용자가 아니다 — 토큰 경로는 activity_log의 actor로 식별
      created_at: nowIso(),
    }
    this.state.versions.push(version)

    const canBlob =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined'
    this.uploadedFileUrls.set(
      version.id,
      isText && canBlob
        ? URL.createObjectURL(new Blob([input.text], { type: 'text/plain' }))
        : `mock://files/${version.id}`,
    )

    d.status = 'pending_approval'
    d.updated_at = nowIso()
    this.log(d.project_id, `partner:${t.token}`, 'partner.submitted', 'deliverable', d.id, {
      partner_id: partner.id,
      version_no: versionNo,
    })
    return { ...d }
  }

  /**
   * approved → assertTransition(partner_review)으로 승인 후, 발주처 승인 처리와 동일한
   * system 전이로 final까지 마감한다(§5.1 "승인 시 final 동일 규칙"). changes_requested는
   * 코멘트가 없으면 422 — 코멘트는 파트너가 봐야 하므로 shared로 기록한다(R-H4·§10.1 화면 C).
   */
  async reviewPartnerSubmission(deliverableId: UUID, input: PartnerReviewInput): Promise<Deliverable> {
    const user = this.currentUser()
    const d = this.mustFindDeliverable(deliverableId)
    if (d.partner_id === null) {
      throw new ProviderError('conflict', '파트너 제출 항목이 아닙니다.')
    }
    this.assertWritable(d.project_id)
    // §8.1 "pm·담당" — 기존 역할-영역 일치 원칙 재사용(pm은 항상, design·ops는 자기 영역만, reg 제외)
    this.assertAreaRole(d.area, user.role)

    if (input.decision === 'approved') {
      assertTransition(d.status, 'approved', 'partner_review')
      d.status = 'approved'
      d.updated_at = nowIso()
      this.log(d.project_id, `user:${user.id}`, 'partner.reviewed', 'deliverable', d.id, {
        decision: 'approved',
      })
      assertTransition(d.status, 'final', 'system')
      d.status = 'final'
      this.log(d.project_id, 'system', 'deliverable.finalized', 'deliverable', d.id)
      for (const task of this.state.wbs_tasks) {
        if (task.linked_deliverable_id === d.id && task.status !== 'done') {
          task.status = 'done'
          task.done_at = nowIso()
          this.log(d.project_id, 'system', 'wbs.auto_done', 'wbs_task', task.id, { deliverable_id: d.id })
        }
      }
    } else {
      if (!input.comment?.trim()) {
        throw new ProviderError('validation', '수정요청 시 코멘트는 필수입니다.')
      }
      assertTransition(d.status, 'changes_requested', 'partner_review')
      d.status = 'changes_requested'
      d.updated_at = nowIso()
      this.state.comments.push({
        id: this.nextId('cmt'),
        deliverable_id: d.id,
        author_user_id: user.id,
        author_token: null,
        visibility: 'shared', // 파트너가 봐야 하는 검토 코멘트 — internal이면 전달되지 않는다
        body: input.comment,
        created_at: nowIso(),
      })
      this.log(d.project_id, `user:${user.id}`, 'partner.reviewed', 'deliverable', d.id, {
        decision: 'changes_requested',
      })
    }
    return { ...d }
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
      source: 'engine', // v2.4 §22 — 견적 모듈 에디터로 만든 견적은 항상 엔진 산출
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
      source: 'engine',
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

  /**
   * §16 매핑 실행 — 견적을 행사로 굳힌다(금액·섹션 산출은 어떤 키로도 넘기지 않는다).
   * is_final 여부는 호출자가 판정한다: createProjectFromQuote는 확정 견적만 허용하고,
   * distributeQuoteImport의 project_prefill은 임포트 견적에 그 제약을 적용하지 않는다
   * (§22.4 — 프리필 목적이라 is_final 불요).
   */
  private materializeProjectFromQuote(quote: Quote, user: CurrentUser): Project {
    if (quote.project_id) {
      throw new ProviderError('conflict', '이미 행사가 연결된 견적입니다.')
    }
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
      kind: 'agency', // v2.4 §21 — 핸드오프로 만든 행사는 기본 대행형(행사 설정에서 전환 가능)
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
      partner_guide_url: null, // v2.4.1 §21.1
      partner_contact_email: null,
      created_by: user.id,
      created_at: nowIso(),
    }
    this.state.projects.push(project)
    this.state.members.push({ project_id: project.id, user_id: user.id, role: 'pm' })
    // 상호 링크 (§16 — 한 트랜잭션)
    quote.project_id = project.id
    quote.updated_at = nowIso()
    return project
  }

  async createProjectFromQuote(quoteId: UUID): Promise<Project> {
    const user = this.assertQuoteRole()
    const quote = this.mustFindQuote(quoteId)
    if (!quote.is_final) {
      throw new ProviderError('conflict', '확정된 견적에서만 행사를 만들 수 있습니다.')
    }
    const project = this.materializeProjectFromQuote(quote, user)
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

  // ── v2.4 §22 견적서 임포트 (app_role admin·sales — R-Q1~R-Q4) ──────
  private mustFindQuoteImport(importId: UUID): QuoteImport {
    const imp = this.state.quote_imports.find((x) => x.id === importId)
    if (!imp) throw new ProviderError('not_found', '임포트를 찾을 수 없습니다.')
    return imp
  }

  /**
   * §22.2-6 기본 매핑표 — 신뢰도 낮은 항목(키워드 무매칭·복수매칭)만 확인 필요로 표시한다.
   * `recruit`는 매핑 결과에서 곧바로 breakdown 필드명으로 쓴다(§22.2-6 원문의 'rc' 표기를
   * 여기서는 엔진 breakdown 키와 맞춘 것 — 설계 결정, 3.15a).
   */
  private defaultSectionMapping(parsed: ParsedQuoteDoc): SectionMapping[] {
    const RULES: { bucket: string; keywords: string[] }[] = [
      { bucket: 's1', keywords: ['베뉴', '대관', '장소'] },
      { bucket: 's2', keywords: ['무대', '시스템', 'av', 'led', '음향', '조명', '중계', '전기', '부스'] },
      { bucket: 's3', keywords: ['디자인', '브랜딩', '콘텐츠', '사인'] },
      { bucket: 's4', keywords: ['인력', '운영', '보험', 'mc'] },
      { bucket: 's5', keywords: ['대행료', '기획료'] },
      { bucket: 'recruit', keywords: ['등록', 'rsvp', '모객'] },
      { bucket: 'custom', keywords: ['기념품', '경품', 'f&b', '웰컴', '애드온'] },
    ]
    return parsed.sections.map((section) => {
      const name = section.name.toLowerCase()
      const matched = RULES.filter((r) => r.keywords.some((k) => name.includes(k.toLowerCase())))
      // 무매칭·복수매칭은 custom으로 잠정 배정 + 확인 필요(낮은 신뢰도) — §22.2-6 말미
      if (matched.length === 1) {
        return { section: section.name, bucket: matched[0].bucket, confidence: 'high' as const }
      }
      return { section: section.name, bucket: 'custom', confidence: 'low' as const }
    })
  }

  async importQuoteFile(fileName: string, data: ArrayBuffer): Promise<QuoteImport> {
    const user = this.assertQuoteRole()
    // 서식 감지·파싱은 3.15d(에이전트 AD) 담당 — 지금은 스텁이 항상 던진다(R-Q4, 의도된 동작).
    // 배선(호출 자체)은 여기서 갖추고, 실제 파싱이 열리면 아래 로직이 그대로 작동한다.
    const parsed = parseQuoteWorkbook(data, fileName)
    const imp: QuoteImport = {
      id: this.nextId('qim'),
      project_id: null,
      file_name: fileName,
      format: parsed.format,
      parsed,
      mapping: this.defaultSectionMapping(parsed),
      status: 'detected',
      quote_id: null,
      created_by: user.id,
      created_at: nowIso(),
    }
    this.state.quote_imports.push(imp)
    return { ...imp }
  }

  /**
   * 확인된 매핑으로 버킷별 합산 — engine-shape 8키(s1~s5·options·recruit·attendee) +
   * custom_sections(§22.4). 부가세 별도 총액은 grand_total에서 vat를 뺀 값을 우선하고,
   * vat 자체가 없으면 §19.4와 동일한 round(v/1.1)로 역산한다(설계 결정, 3.15a).
   */
  private buildImportedBreakdown(
    parsed: ParsedQuoteDoc,
    mapping: SectionMapping[],
  ): { breakdown: QuoteBreakdown; total_amount: number } {
    const STANDARD = ['s1', 's2', 's3', 's4', 's5', 'options', 'recruit', 'attendee'] as const
    const sums: Record<(typeof STANDARD)[number], number> = {
      s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, options: 0, recruit: 0, attendee: 0,
    }
    const customByCode = new Map<string, { code: string; label: string; amount: number }>()

    for (const row of mapping) {
      const section = parsed.sections.find((s) => s.name === row.section)
      if (!section) continue
      const amount = section.subtotal ?? section.items.reduce((s, it) => s + (it.amount || 0), 0)
      if ((STANDARD as readonly string[]).includes(row.bucket)) {
        sums[row.bucket as (typeof STANDARD)[number]] += amount
      } else {
        // 'custom' 자체는 여러 섹션이 공유하는 잠정 배정일 수 있어 섹션별로 분리 보존한다
        const code = row.bucket === 'custom' ? `custom:${section.name}` : row.bucket
        const prev = customByCode.get(code)
        customByCode.set(code, { code, label: section.name, amount: (prev?.amount ?? 0) + amount })
      }
    }

    const mappedTotal =
      Object.values(sums).reduce((s, v) => s + v, 0) +
      [...customByCode.values()].reduce((s, v) => s + v.amount, 0)
    const totals = parsed.totals
    const subtotal =
      totals.grand_total != null
        ? totals.vat != null
          ? totals.grand_total - totals.vat
          : toVatExcluded(totals.grand_total, true)
        : totals.items_sum ?? mappedTotal
    const vat = Math.round(subtotal * 0.1)

    const breakdown: QuoteBreakdown = {
      s1: sums.s1,
      s2: sums.s2,
      s3: sums.s3,
      s4: sums.s4,
      s5: sums.s5,
      options: sums.options,
      recruit: sums.recruit,
      attendee: sums.attendee,
      subtotal,
      vat,
      total: subtotal + vat,
      custom_sections: [...customByCode.values()],
    }
    return { breakdown, total_amount: subtotal }
  }

  /** 파싱 헤더 요약을 QuoteInput 형태로 옮긴다 — §16 핸드오프가 그대로 읽을 수 있게 하기 위함 */
  private buildImportedQuoteInput(imp: QuoteImport): QuoteInput {
    const header = imp.parsed.header
    const venueName = header.venue?.trim() || null
    return {
      event_name: header.event_name?.trim() || imp.file_name,
      event_date: null, // date_range는 자유 텍스트 — 이 단계에서 파싱하지 않는다(확인 큐 영역)
      event_end_date: null,
      start_time: null,
      end_time: null,
      event_type: null,
      include_leads: false,
      headcount: 0,
      guarantee: 0,
      venues: venueName ? [{ venue_id: null, name: venueName, hall: null, date: null, rental: 0 }] : [],
      selected_venue: venueName
        ? { venue_id: null, name: venueName, hall: null, date: null, rental: 0, index: 0 }
        : null,
      options: {},
      display_type: 'led',
      targeting: null,
      client_company: header.client?.trim() || null,
      contact: null,
      manager: header.manager?.trim() || null,
      notes: `임포트(${imp.format}형) — ${imp.file_name}`,
      adjustments: [],
    }
  }

  /** R-Q1: confirm 경유 없이 quotes가 생기는 경로는 없다 — 이 메서드만 quotes를 만든다 */
  async confirmQuoteImport(importId: UUID, input: QuoteImportConfirmInput): Promise<Quote> {
    const user = this.assertQuoteRole()
    const imp = this.mustFindQuoteImport(importId)
    if (imp.status !== 'detected') {
      throw new ProviderError('conflict', '이미 확정되었거나 배포된 임포트입니다.')
    }
    const mapping = input.mapping?.length ? input.mapping : imp.mapping
    const { breakdown, total_amount } = this.buildImportedBreakdown(imp.parsed, mapping)
    const quote: Quote = {
      id: this.nextId('quo'),
      project_id: null,
      title: imp.parsed.header.event_name?.trim() || imp.file_name,
      version: 1,
      status: 'draft',
      is_final: false,
      locked_at: null,
      superseded_by: null,
      input: this.buildImportedQuoteInput(imp),
      breakdown,
      total_amount,
      source: 'imported',
      created_by: user.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.quotes.push(quote)
    imp.mapping = mapping
    imp.status = 'confirmed'
    imp.quote_id = quote.id
    return quote
  }

  /**
   * §22.4 분배 3종. project_prefill은 §16 매핑을 재사용하되 임포트 견적은 is_final을
   * 요구하지 않는다(프리필 목적). settlement_base·board_seed는 행사가 있어야 하고,
   * settlement_base는 확정 견적일 때만 허용한다(정산 스냅숏 규칙 §19.2 그대로).
   */
  async distributeQuoteImport(
    importId: UUID,
    input: QuoteImportDistributeInput,
  ): Promise<QuoteImportDistributeResult> {
    const user = this.assertQuoteRole()
    const imp = this.mustFindQuoteImport(importId)
    if (imp.status !== 'confirmed') {
      throw new ProviderError('conflict', '확인 큐를 거쳐 확정된 임포트만 배포할 수 있습니다.')
    }
    if (!imp.quote_id) throw new ProviderError('not_found', '연결된 견적이 없습니다.')
    const quote = this.mustFindQuote(imp.quote_id)

    let project: Project | undefined = quote.project_id
      ? this.mustFindProject(quote.project_id)
      : undefined

    if (input.project_prefill && !project) {
      project = this.materializeProjectFromQuote(quote, user)
      imp.project_id = project.id
      this.log(project.id, `user:${user.id}`, 'project.created_from_quote_import', 'project', project.id, {
        quote_id: quote.id,
        import_id: imp.id,
      })
    }

    let settlementCreated = false
    if (input.settlement_base) {
      if (!quote.is_final) {
        throw new ProviderError(
          'validation',
          '정산 기준은 확정된 견적만 가능합니다 — 먼저 이 견적을 확정하세요.',
        )
      }
      if (!project) {
        throw new ProviderError(
          'validation',
          '정산 기준을 적용할 행사가 없습니다 — 프리필을 함께 켜거나 먼저 행사를 연결하세요.',
        )
      }
      await this.createSettlementBoard(project.id, quote.id)
      settlementCreated = true
    }

    let seeded = 0
    if (input.board_seed) {
      if (!project) {
        throw new ProviderError(
          'validation',
          '보드 시드를 적용할 행사가 없습니다 — 프리필을 함께 켜거나 먼저 행사를 연결하세요.',
        )
      }
      seeded = this.seedBoardFromImport(project.id, imp)
    }

    imp.status = 'distributed'
    if (project) {
      this.log(project.id, `user:${user.id}`, 'quote_import.distributed', 'quote_import', imp.id, {
        settlement_base: settlementCreated,
        board_seed: seeded,
      })
    }
    return {
      quote_id: quote.id,
      project_id: project?.id ?? null,
      settlement_created: settlementCreated,
      deliverables_seeded: seeded,
    }
  }

  /**
   * board_seed(§22.4) — s3 매핑은 design 보드, s2·s4 매핑은 ops 보드에 항목 단위로 시드한다.
   * **금액 키는 절대 넣지 않는다** — 품목(title)·규격(spec)·수량(qty)만 brief/spec_* 필드로 옮긴다.
   */
  private seedBoardFromImport(projectId: UUID, imp: QuoteImport): number {
    const areaByBucket: Record<string, DeliverableArea> = { s3: 'design', s2: 'ops', s4: 'ops' }
    let count = 0
    const now = nowIso()
    for (const row of imp.mapping) {
      const area = areaByBucket[row.bucket]
      if (!area) continue
      const section = imp.parsed.sections.find((s) => s.name === row.section)
      if (!section) continue
      for (const item of section.items) {
        count++
        this.state.deliverables.push({
          id: this.nextId('dlv'),
          project_id: projectId,
          area,
          category: '견적 임포트',
          title: item.title,
          status: 'draft',
          assignee_id: null,
          due_date: null,
          drive_folder_id: null,
          requires_approval: true,
          brief: `임포트(${imp.file_name}) — ${section.name}`,
          brief_refs: null,
          spec_size: item.spec ?? null,
          spec_qty: item.qty ?? null,
          spec_location: null,
          spec_type: null,
          content: null,
          partner_id: null,
          created_at: now,
          updated_at: now,
        })
      }
    }
    return count
  }

  /**
   * Mock 전용(인터페이스 외) — 파서(3.15d)가 아직 스텁이라 importQuoteFile은 항상 던진다.
   * confirm·distribute 흐름을 독립적으로 테스트하기 위해 'detected' 임포트를 직접 시딩한다.
   */
  seedQuoteImportForTest(input: {
    file_name: string
    format: QuoteImportFormat
    parsed: ParsedQuoteDoc
    mapping?: SectionMapping[]
  }): QuoteImport {
    const imp: QuoteImport = {
      id: this.nextId('qim'),
      project_id: null,
      file_name: input.file_name,
      format: input.format,
      parsed: input.parsed,
      mapping: input.mapping ?? this.defaultSectionMapping(input.parsed),
      status: 'detected',
      quote_id: null,
      created_by: this.state.current_user_id,
      created_at: nowIso(),
    }
    this.state.quote_imports.push(imp)
    return imp
  }

  // ── v2.0 컴플라이언스 카드 (§8 /compliance-cards — 체크 멤버·편집 pm) ──
  private seedComplianceCards(projectId: UUID): void {
    const project = this.mustFindProject(projectId)
    const others = this.state.compliance_cards.filter((c) => c.project_id !== projectId)
    // v2.4.1 §15.3c — kind='host'는 주최형 3카드(C-H1~C-H3)로 고정
    const templates = project.kind === 'host' ? HOST_COMPLIANCE_CARD_TEMPLATES : COMPLIANCE_CARD_TEMPLATES
    const seeded: ComplianceCard[] = templates.map((tpl) => ({
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
   *   zones         content 있는 ops 항목 수 / ops 항목 수(v2.5: 시나리오·운영가이드 제외)
   *   production    스펙 4필드(size·qty·location·type) 완비 design 항목 수 / design 항목 수
   *   registration  등록 데이터(RSVP+참관객) 존재 여부 (0/1)
   *   emergency     운영가이드 emergency 섹션 content 비어있지 않으면 1 / 1 (v2.5)
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
    // v2.5 §23 — zones에서는 **실제로 빌더 데이터(scenario_blocks·guide_sections)를 가진**
    // 시나리오·운영가이드 항목만 제외한다(큐시트는 기존대로 포함) — hasScenarioBuilderData·
    // hasGuideBuilderData 참조(레거시 자유 카테고리 충돌 방지, dlv-005).
    const opsItems = this.state.deliverables.filter(
      (d) =>
        d.project_id === projectId &&
        d.area === 'ops' &&
        !this.hasScenarioBuilderData(d) &&
        !this.hasGuideBuilderData(d),
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

    // v2.5 §23 — ② 세션별 시나리오 펼침 소스(빌더 데이터를 가진 첫 시나리오 항목)
    const scenarioDeliverable = this.state.deliverables.find(
      (d) => d.project_id === projectId && this.hasScenarioBuilderData(d),
    )
    const scenario = scenarioDeliverable
      ? {
          deliverable_id: scenarioDeliverable.id,
          title: scenarioDeliverable.title,
          status: scenarioDeliverable.status,
          blocks: await this.listScenarioBlocks(scenarioDeliverable.id),
        }
      : null

    // v2.5 §23 — ③존운영 확장·⑦비상 대응 소스(빌더 데이터를 가진 첫 운영가이드 항목).
    // R-O6: contacts는 담지 않는다.
    const guideDeliverable = this.state.deliverables.find(
      (d) => d.project_id === projectId && this.hasGuideBuilderData(d),
    )
    const guideSections = guideDeliverable ? await this.listGuideSections(guideDeliverable.id) : []
    const zoneSection = guideSections.find((s) => s.kind === 'zone') ?? null
    const guide_zone = zoneSection
      ? { content: zoneSection.content, source_stale: zoneSection.source_stale }
      : null
    const emergencySection = guideSections.find((s) => s.kind === 'emergency') ?? null
    const emergency =
      guideDeliverable && emergencySection
        ? {
            deliverable_id: guideDeliverable.id,
            title: emergencySection.title,
            content: emergencySection.content,
            status: guideDeliverable.status,
          }
        : null

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
      scenario,
      guide_zone,
      emergency,
      section_progress: [
        { key: 'overview', done: overviewSlots.filter(Boolean).length, total: overviewSlots.length },
        { key: 'program', done: sessions.filter((s) => s.start_time).length, total: sessions.length },
        // cuesheet: 구분·본문이 채워진 큐 수 / 전체 큐 수
        { key: 'cuesheet', done: cues.filter((c) => c.segment && c.body).length, total: cues.length },
        { key: 'zones', done: opsItems.filter((d) => d.content?.trim()).length, total: opsItems.length },
        { key: 'production', done: designItems.filter(specComplete).length, total: designItems.length },
        { key: 'registration', done: stats.rsvp_total + stats.attendee_total > 0 ? 1 : 0, total: 1 },
        { key: 'emergency', done: emergency?.content?.trim() ? 1 : 0, total: 1 },
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

    // 스냅숏은 code마다 has_cost를 고정값으로 되돌린다. PM이 원가를 켜 두고(허용된 동작)
    // 금액을 입력한 버킷이라면 그 되돌림이 F1과 같은 부풀림을 일으키므로 — 실집행이 통째로
    // 빠지고 마진이 같은 크기로 오르며 항등식은 상쇄돼 조용히 통과한다 — 갱신 자체를 막는다.
    const wouldSilenceCost = fresh
      .filter((next) => !next.has_cost)
      .map((next) => this.state.settlement_buckets.find((b) => b.board_id === board.id && b.code === next.code))
      .filter(
        (cur): cur is SettlementBucket =>
          !!cur && cur.has_cost && this.bucketHasEnteredAmounts(cur),
      )
    if (wouldSilenceCost.length > 0) {
      throw new ProviderError(
        'conflict',
        `기준을 갱신하면 ${wouldSilenceCost
          .map((b) => `'${b.label}'`)
          .join('·')}이(가) 원가 없음으로 되돌아가 이미 입력된 금액이 집계에서 빠집니다. 항목을 먼저 정리하세요.`,
      )
    }

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

  /**
   * 원가 없는 버킷에 금액이 얹히는 것을 막는다 — 422 (R-S4).
   *
   * 판정 대상은 **patch가 아니라 patch를 적용한 뒤 항목의 최종 상태**다. patch만 보면
   * `bucket_id`만 바꾸는 이동(금액은 항목에 이미 들어 있는)이 검사를 통과해 버리고,
   * 그 순간 실집행이 집계에서 빠지며 마진이 같은 크기로 부푼다 — F1과 같은 실패 모드다.
   * 취소 항목은 애초에 집계에 들어가지 않으므로 이동을 막지 않는다.
   */
  private assertCostAllowed(
    bucket: SettlementBucket,
    input: Partial<SettlementItemInput>,
    existing?: SettlementItem,
  ): void {
    if (bucket.has_cost) return

    const pick = <K extends 'ordered_amount' | 'actual_amount'>(key: K): number | null =>
      input[key] !== undefined ? (input[key] ?? null) : (existing?.[key] ?? null)
    const status = input.status ?? existing?.status ?? 'planned'
    if (status === 'cancelled') return
    if (pick('ordered_amount') === null && pick('actual_amount') === null) return

    // 같은 금지 규칙이지만 사용자가 한 동작이 다르므로 안내도 다르게 준다
    const isMove = existing !== undefined && input.bucket_id !== undefined && input.bucket_id !== existing.bucket_id
    throw new ProviderError(
      'validation',
      isMove
        ? `'${bucket.label}'은 원가가 없는 항목이라 금액이 든 발주 항목을 옮길 수 없습니다. 금액을 지우거나 다른 버킷으로 옮기세요.`
        : `'${bucket.label}'은 원가가 없는 항목이라 발주·실비를 넣을 수 없습니다.`,
    )
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
    this.assertCostAllowed(bucket, patch, item)

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
