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
import { ROLE_CHARTER_TEMPLATES, wbsTemplateFor } from '../../fixtures/wbsTemplates'
import type {
  ActivityLogEntry,
  Approval,
  Attendee,
  ClientContact,
  ClientToken,
  Comment,
  Cue,
  Deliverable,
  Milestone,
  ProgramSession,
  Project,
  RoleCharter,
  RsvpContact,
  UnregisteredFile,
  UUID,
  Version,
  WbsTask,
} from '../../types/entities'
import type { DeliverableArea, DeliverableStatus, MemberRole } from '../../types/enums'
import type {
  AddCommentInput,
  AttendeeWithRsvp,
  ClientContactInput,
  ClientDecisionInput,
  ClientQueue,
  ClientStatusData,
  CreateDeliverableInput,
  CsvImportResult,
  CsvImportRow,
  CueInput,
  CurrentUser,
  DashboardData,
  DeliverableDetail,
  DeliverableFilter,
  IssueTokenInput,
  MemberWithProfile,
  MilestoneInput,
  OnboardingStatus,
  PlanData,
  PlanVersionRef,
  ProgramSessionInput,
  ProjectOverviewPatch,
  ProjectPatch,
  RegistrationStats,
  RequestApprovalInput,
  RsvpContactPatch,
  UploadVersionInput,
  UserRef,
  WbsTaskFilter,
  WbsTaskPatch,
} from '../../types/views'
import type { DataProvider } from '../DataProvider'

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
    return { ...user, role: membership.role, project_id: membership.project_id }
  }

  private mustFindProject(projectId: UUID): Project {
    if (this.state.project.id !== projectId) {
      throw new ProviderError('not_found', '프로젝트를 찾을 수 없습니다.')
    }
    return this.state.project
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

  private log(actor: string, action: string, targetType: string, targetId: UUID, meta?: Record<string, unknown>): void {
    const maxId = this.state.activity_log.reduce((m, e) => Math.max(m, e.id), 0)
    this.state.activity_log.push({
      id: maxId + 1,
      project_id: this.state.project.id,
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

  private areaProgress(): { area: DeliverableArea; total: number; done: number }[] {
    const areas: DeliverableArea[] = ['design', 'ops', 'common']
    return areas.map((area) => {
      const items = this.state.deliverables.filter((d) => d.area === area)
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
    return this.state.members.map((m) => ({
      ...m,
      profile: this.mustFindUser(m.user_id),
    }))
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
      .filter(({ deliverable }) => deliverable.status === 'pending_approval')
      .sort((a, b) => (a.approval.due_at ?? '9999').localeCompare(b.approval.due_at ?? '9999'))

    return {
      project,
      pending_approvals: pending,
      upcoming_milestones: this.state.milestones
        .filter((m) => !m.done)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
      inbox_count: this.state.unregistered_files.filter((f) => !f.dismissed && !f.linked_deliverable_id).length,
      area_progress: this.areaProgress(),
      recent_activity: await this.listActivity(projectId, 10),
      // v1.2: 받은 가이드 — 내가 담당자인 requested 항목, 마감순
      my_requested: this.state.deliverables
        .filter((d) => d.status === 'requested' && d.assignee_id === user.id)
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
      // v1.4: 지연/임박 WBS 집계 (lib/wbs 정본 산식, 지연·임박 배타)
      wbs_delayed: this.wbsByUrgency('delayed'),
      wbs_imminent: this.wbsByUrgency('imminent'),
    }
  }

  private wbsByUrgency(kind: 'delayed' | 'imminent'): WbsTask[] {
    const today = toIsoDate(new Date())
    const pick = kind === 'delayed' ? isDelayed : isImminent
    return this.state.wbs_tasks
      .filter((task) => pick(task, today))
      .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
  }

  async listActivity(projectId: UUID, limit = 20): Promise<ActivityLogEntry[]> {
    this.mustFindProject(projectId)
    return [...this.state.activity_log]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
  }

  // ── 산출물 ────────────────────────────────────────────────────────
  async listDeliverables(projectId: UUID, filter?: DeliverableFilter): Promise<Deliverable[]> {
    this.mustFindProject(projectId)
    return this.state.deliverables.filter(
      (d) =>
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
    this.mustFindProject(input.project_id)
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
      this.log(`user:${user.id}`, 'deliverable.requested', 'deliverable', deliverable.id, {
        assignee_id: deliverable.assignee_id,
      })
    } else {
      this.log(`user:${user.id}`, 'deliverable.created', 'deliverable', deliverable.id)
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
    this.log(`user:${user.id}`, 'status.transitioned', 'deliverable', d.id, { from: rule.from, to })
    return d
  }

  async uploadVersion(deliverableId: UUID, input: UploadVersionInput): Promise<Version> {
    const user = this.currentUser()
    const d = this.mustFindDeliverable(deliverableId)
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
        project_code: this.state.project.code,
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
    this.log(`user:${user.id}`, 'version.uploaded', 'version', version.id, {
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
    this.log(`user:${user.id}`, 'approval.requested', 'approval', approval.id, {
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
    this.mustFindDeliverable(deliverableId)
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
    return [...this.state.milestones].sort((a, b) => a.due_date.localeCompare(b.due_date))
  }

  async createMilestone(projectId: UUID, input: MilestoneInput): Promise<Milestone> {
    this.currentUser()
    this.mustFindProject(projectId)
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
    return [...this.state.rsvp_contacts]
  }

  async updateRsvpContact(rsvpId: UUID, patch: RsvpContactPatch): Promise<RsvpContact> {
    this.assertRegRole()
    const r = this.state.rsvp_contacts.find((x) => x.id === rsvpId)
    if (!r) throw new ProviderError('not_found', 'RSVP 대상을 찾을 수 없습니다.')
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
    return this.state.attendees.map((a) => ({
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
    this.mustFindProject(projectId)
    let inserted = 0
    let updated = 0
    for (const row of rows) {
      if (!row.name?.trim()) continue
      const emailKey = row.email?.trim().toLowerCase() || null
      if (target === 'rsvp') {
        const existing = emailKey
          ? this.state.rsvp_contacts.find((r) => r.email?.toLowerCase() === emailKey)
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
          ? this.state.attendees.find((a) => a.email?.toLowerCase() === emailKey)
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
    a.checked_in_at = a.checked_in_at ? null : nowIso()
    return a
  }

  async convertRsvpToAttendee(rsvpId: UUID): Promise<Attendee> {
    this.assertRegRole()
    const r = this.state.rsvp_contacts.find((x) => x.id === rsvpId)
    if (!r) throw new ProviderError('not_found', 'RSVP 대상을 찾을 수 없습니다.')
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
    const rsvps = this.state.rsvp_contacts
    const attendees = this.state.attendees
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
    return [...this.state.client_contacts]
  }

  async createClientContact(input: ClientContactInput): Promise<ClientContact> {
    this.assertPm()
    this.mustFindProject(input.project_id)
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
    return [...this.state.client_tokens]
  }

  async issueClientToken(input: IssueTokenInput): Promise<ClientToken> {
    const user = this.assertPm()
    const project = this.mustFindProject(input.project_id)
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
    this.log(`user:${user.id}`, 'token.issued', 'client_token', token.token)
    return token
  }

  async revokeClientToken(token: string): Promise<ClientToken> {
    const user = this.assertPm()
    const t = this.state.client_tokens.find((x) => x.token === token)
    if (!t) throw new ProviderError('not_found', '토큰을 찾을 수 없습니다.')
    if (!t.revoked_at) t.revoked_at = nowIso()
    this.log(`user:${user.id}`, 'token.revoked', 'client_token', t.token)
    return t
  }

  // ── 미등록 파일 인박스 ────────────────────────────────────────────
  async listInbox(projectId: UUID): Promise<UnregisteredFile[]> {
    this.mustFindProject(projectId)
    return this.state.unregistered_files.filter((f) => !f.dismissed && !f.linked_deliverable_id)
  }

  async linkInboxFile(inboxId: UUID, deliverableId: UUID): Promise<Version> {
    const user = this.currentUser()
    const f = this.state.unregistered_files.find((x) => x.id === inboxId)
    if (!f) throw new ProviderError('not_found', '인박스 파일을 찾을 수 없습니다.')
    if (f.dismissed || f.linked_deliverable_id) {
      throw new ProviderError('conflict', '이미 처리된 인박스 파일입니다.')
    }
    const d = this.mustFindDeliverable(deliverableId)
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
    this.log(`user:${user.id}`, 'inbox.linked', 'version', version.id, {
      deliverable_id: deliverableId,
    })
    return version
  }

  async dismissInboxFile(inboxId: UUID): Promise<void> {
    const user = this.currentUser()
    const f = this.state.unregistered_files.find((x) => x.id === inboxId)
    if (!f) throw new ProviderError('not_found', '인박스 파일을 찾을 수 없습니다.')
    f.dismissed = true
    this.log(`user:${user.id}`, 'inbox.dismissed', 'unregistered_file', f.id)
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
    return [...this.state.program_sessions].sort((a, b) => a.sort_order - b.sort_order)
  }

  async createProgramSession(projectId: UUID, input: ProgramSessionInput): Promise<ProgramSession> {
    this.assertPmOps()
    this.mustFindProject(projectId)
    if (!input.title.trim()) throw new ProviderError('validation', '세션 제목은 필수입니다.')
    const maxOrder = this.state.program_sessions.reduce((m, s) => Math.max(m, s.sort_order), 0)
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
    this.state.program_sessions.splice(idx, 1)
  }

  async updateProjectOverview(projectId: UUID, patch: ProjectOverviewPatch): Promise<Project> {
    const user = this.assertPmOps()
    const project = this.mustFindProject(projectId)
    if (patch.event_date !== undefined) project.event_date = patch.event_date
    if (patch.theme !== undefined) project.theme = patch.theme
    if (patch.venue !== undefined) project.venue = patch.venue
    if (patch.mc_name !== undefined) project.mc_name = patch.mc_name
    if (patch.overview_items !== undefined) project.overview_items = patch.overview_items
    this.log(`user:${user.id}`, 'project.overview_updated', 'project', project.id)
    return project
  }

  // ── v1.3 프로젝트 기본정보·온보딩 ─────────────────────────────────
  async updateProject(projectId: UUID, patch: ProjectPatch): Promise<Project> {
    const user = this.assertPm()
    const project = this.mustFindProject(projectId)
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ProviderError('validation', '행사명은 비울 수 없습니다.')
      project.name = patch.name
    }
    if (patch.event_date !== undefined) project.event_date = patch.event_date
    if (patch.event_type !== undefined) project.event_type = patch.event_type
    // 행사일·유형 변경 후 WBS 날짜/구성 갱신은 명시적 재전개(expandWbs)로 수행 — S5 pm 버튼
    this.log(`user:${user.id}`, 'project.updated', 'project', project.id)
    return project
  }

  async getOnboardingStatus(projectId: UUID): Promise<OnboardingStatus> {
    this.mustFindProject(projectId)
    return { completed: this.state.onboarding_completed }
  }

  async completeOnboarding(projectId: UUID): Promise<void> {
    const user = this.assertPm()
    this.mustFindProject(projectId)
    this.state.onboarding_completed = true
    // v1.4 부수 효과: 유형별 WBS 자동 전개 + R&R 카드 시드
    await this.expandWbs(projectId)
    this.seedRoleCharters(projectId)
    this.log(`user:${user.id}`, 'onboarding.completed', 'project', projectId)
  }

  /** Mock 전용 (인터페이스 외) — S0 라우트 가드 테스트용 온보딩 리셋 */
  resetOnboarding(): void {
    this.state.onboarding_completed = false
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
    this.mustFindDeliverable(deliverableId)
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
        project_code: this.state.project.code,
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
    this.log(`user:${user.id}`, 'cue.snapshot', 'version', version.id, {
      deliverable_id: deliverableId,
    })
    return version
  }

  // ── v1.4 WBS·R&R ──────────────────────────────────────────────────
  async expandWbs(projectId: UUID): Promise<WbsTask[]> {
    const user = this.assertPm()
    const project = this.mustFindProject(projectId)
    if (!project.event_date) {
      throw new ProviderError('validation', '행사일이 있어야 WBS를 전개할 수 있습니다.')
    }
    const template = wbsTemplateFor(project.event_type)
    // 재전개: code 매칭으로 기존 진행 상태·연결·메모 보존 (PROGRESS 결정 로그)
    const prev = new Map(this.state.wbs_tasks.map((task) => [task.code, task]))
    this.state.wbs_tasks = template.map((tpl, i) => {
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
        status: old?.status ?? 'todo',
        done_at: old?.done_at ?? null,
        linked_deliverable_id: old?.linked_deliverable_id ?? null,
        note: old?.note ?? null,
        sort_order: i + 1,
      }
    })
    this.log(`user:${user.id}`, 'wbs.expanded', 'project', projectId, {
      event_type: project.event_type,
      count: this.state.wbs_tasks.length,
    })
    return [...this.state.wbs_tasks]
  }

  private seedRoleCharters(projectId: UUID): void {
    this.state.role_charters = ROLE_CHARTER_TEMPLATES[this.state.project.event_type].map((tpl) => ({
      id: this.nextId('rrc'),
      project_id: projectId,
      role: tpl.role,
      origin_role: tpl.origin_role,
      title: tpl.title,
      items: [...tpl.items],
    }))
  }

  async listWbsTasks(projectId: UUID, filter?: WbsTaskFilter): Promise<WbsTask[]> {
    this.mustFindProject(projectId)
    return this.state.wbs_tasks
      .filter(
        (task) =>
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
      this.log(`user:${user.id}`, 'wbs.status_changed', 'wbs_task', task.id, {
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
    return [...this.state.role_charters]
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
    const cueDeliverable = this.state.deliverables.find((d) => d.category === '큐시트')
    const cues = cueDeliverable ? await this.listCues(cueDeliverable.id) : []
    const cuesheet = cueDeliverable
      ? {
          deliverable_id: cueDeliverable.id,
          title: cueDeliverable.title,
          status: cueDeliverable.status,
          cues,
        }
      : null
    const opsItems = this.state.deliverables.filter((d) => d.area === 'ops')
    const designItems = this.state.deliverables.filter((d) => d.area === 'design')

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
    const milestones = [...this.state.milestones].sort((a, b) =>
      a.due_date.localeCompare(b.due_date),
    )

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

  // ── 발주처 뷰 (토큰 스코프 — §6.2 화이트리스트 쿼리 재현) ─────────
  async getClientQueue(token: string): Promise<ClientQueue> {
    const t = this.resolveToken(token)
    const contact = this.state.client_contacts.find((c) => c.id === t.contact_id)

    const queue = this.state.approvals
      .filter((a) => !a.decided_at)
      .map((a) => {
        const d = this.mustFindDeliverable(a.deliverable_id)
        const v = this.state.versions.find((x) => x.id === a.version_id)
        return { a, d, v }
      })
      .filter(({ d, v }) => d.status === 'pending_approval' && !!v)
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
      .filter((a) => a.decided_at && a.decision)
      .sort((a, b) => b.decided_at!.localeCompare(a.decided_at!))
      .map((a) => ({
        approval_id: a.id,
        deliverable_id: a.deliverable_id,
        title: this.mustFindDeliverable(a.deliverable_id).title,
        decision: a.decision!,
        decided_at: a.decided_at!,
      }))

    return {
      project_name: this.state.project.name,
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
    this.log(`client:${t.token}`, 'approval.decided', 'approval', approval.id, {
      decision: input.decision,
    })

    if (input.decision === 'approved') {
      d.status = 'approved'
      // §5·§7.5: 06_발주처공유 스냅숏 성공 후 final 커밋 — Mock은 복사가 항상 성공한다고 가정.
      // 실제 Drive copy·재시도 큐는 Phase 5 DriveFileStore에서 구현.
      assertTransition(d.status, 'final', 'system')
      d.status = 'final'
      this.log('system', 'deliverable.finalized', 'deliverable', d.id)
      // v1.4: 이 산출물에 연결된 WBS 태스크는 자동 done (§4-15)
      for (const task of this.state.wbs_tasks) {
        if (task.linked_deliverable_id === d.id && task.status !== 'done') {
          task.status = 'done'
          task.done_at = nowIso()
          this.log('system', 'wbs.auto_done', 'wbs_task', task.id, { deliverable_id: d.id })
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
    this.resolveToken(token)
    const finals = this.state.deliverables
      .filter((d) => d.status === 'final')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

    return {
      project_name: this.state.project.name,
      event_date: this.state.project.event_date,
      area_progress: this.areaProgress(),
      milestones: [...this.state.milestones].sort((a, b) => a.due_date.localeCompare(b.due_date)),
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
