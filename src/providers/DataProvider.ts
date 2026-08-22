// ─────────────────────────────────────────────────────────────────────
// DataProvider 인터페이스 v4 — 2026-08-22 재동결 (CLAUDE.md §4 Phase 3.10a)
//   v1: 2026-08-19 동결(35메서드). v2: v1.2 승인 근거로 41메서드 재동결.
//   v3: 사용자 v1.4 승인(2026-08-22, v1.3 포함)을 근거로 동결 해제 →
//   온보딩·프로젝트 패치·큐시트 CRUD/스냅숏·WBS 전개/조회/패치·R&R 조회
//   12메서드 추가(53메서드) 후 재동결.
//   v3.1: 사용자 v1.4.1 승인(2026-08-22) — 메서드 수 53 불변, onboarded_at 필드 추가만.
//   v4: 사용자 v1.5 승인(2026-08-22, 시각안 3화면)을 근거로 동결 해제 → 다중 행사:
//   listProjects·createProject·closeProject·addMember·removeMember 5메서드 추가(58메서드),
//   Project·ProjectPatch 개요 필드 확장, ProjectSummary 뷰 타입 신설.
//   **기존 53메서드 시그니처 불변**(projectId 인자는 이미 전 메서드에 존재) 후 재동결.
//   경위는 PROGRESS.md 결정 로그 참조.
//
// 프론트(S0~S9)는 이 인터페이스만 호출한다. 구현체:
//   1단계 MockProvider     — 픽스처+메모리, 업로드=blob URL (Phase 1·3.5~3.7)
//   2단계 SupabaseProvider — DB·Auth·RLS 이식 (Phase 4, v1.4 스키마 기준)
//   3단계 + DriveFileStore — Drive 업로드·프록시 이식 (Phase 5)
//
// 동결 후 변경은 사용자 승인 + 설계서 개정을 동반한다 (CLAUDE.md §9).
// 오류는 ProviderError(code: validation|forbidden|not_found|conflict|gone)로 던진다.
// ─────────────────────────────────────────────────────────────────────
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
} from '../types/entities'
import type { DeliverableStatus } from '../types/enums'
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
  MemberInput,
  MemberWithProfile,
  MilestoneInput,
  OnboardingStatus,
  PlanData,
  ProgramSessionInput,
  ProjectCreateInput,
  ProjectOverviewPatch,
  ProjectPatch,
  ProjectSummary,
  RegistrationStats,
  RequestApprovalInput,
  RsvpContactPatch,
  UploadVersionInput,
  WbsTaskFilter,
  WbsTaskPatch,
} from '../types/views'

export interface DataProvider {
  // ── 세션 ──────────────────────────────────────────────────────────
  /** 현재 로그인 사용자 + 프로젝트 내 역할 (역할·영역 검증의 기준) */
  getCurrentUser(): Promise<CurrentUser>

  // ── 프로젝트·멤버 (S-1·S6) ────────────────────────────────────────
  /** v1.5 §8 GET /projects — 행사 목록+요약. 프로젝트 셀렉터·S-1 공용 */
  listProjects(): Promise<ProjectSummary[]>
  /** v1.5 §8 POST /projects — 행사 생성(생성자=pm 자동, onboarded_at=null). 빈 입력이면 자리표시 행사 */
  createProject(input: ProjectCreateInput): Promise<Project>
  /** v1.5 §8 POST /projects/{id}/close·reopen — status 토글 (pm). closed면 쓰기 전부 409 */
  closeProject(projectId: UUID, closed: boolean): Promise<Project>
  getProject(projectId: UUID): Promise<Project>
  listMembers(projectId: UUID): Promise<MemberWithProfile[]>
  /** v1.5 §8 POST /projects/{id}/members — 담당자 추가(mock은 즉시 멤버, Phase 4부터 초대 승격) */
  addMember(projectId: UUID, input: MemberInput): Promise<MemberWithProfile>
  /** v1.5 §8 DELETE /projects/{id}/members/{id} — 제거. 마지막 PM이면 409 */
  removeMember(projectId: UUID, memberId: UUID): Promise<void>
  /** v1.3 §8 PATCH /projects/{id} — 행사 유형·기본정보 수정 (pm). v1.5: 개요 전 필드 */
  updateProject(projectId: UUID, patch: ProjectPatch): Promise<Project>

  // ── v1.3 S0 온보딩 ────────────────────────────────────────────────
  /** 완료 전 본체 라우트는 위저드로 차단 — 라우트 가드가 이 값을 본다.
   *  v1.4.1: 정본은 projects.onboarded_at — completed는 onboarded_at !== null 파생값 */
  getOnboardingStatus(projectId: UUID): Promise<OnboardingStatus>
  /**
   * 온보딩 완료 처리 (pm) — v1.4.1: onboarded_at=now 기록, 이미 완료면 409 CONFLICT.
   * v1.4 부수 효과: 유형별 WBS 템플릿을 event_date 기준으로 자동 전개(expandWbs)하고
   * R&R 카드를 유형별로 시드한다.
   */
  completeOnboarding(projectId: UUID): Promise<void>

  // ── 홈 대시보드 (S1) ──────────────────────────────────────────────
  getDashboard(projectId: UUID): Promise<DashboardData>
  listActivity(projectId: UUID, limit?: number): Promise<ActivityLogEntry[]>

  // ── 산출물 (S2·S3) ────────────────────────────────────────────────
  listDeliverables(projectId: UUID, filter?: DeliverableFilter): Promise<Deliverable[]>
  getDeliverable(deliverableId: UUID): Promise<DeliverableDetail>
  /**
   * 항목 생성 (§8 POST /deliverables). v1.2: brief·스펙 포함 시 지시 발행 —
   * pm 전용, status='requested', 담당자(assignee_id) 필수. 그 외에는 draft로 시작.
   */
  createDeliverable(input: CreateDeliverableInput): Promise<Deliverable>
  /**
   * 내부 멤버의 상태 전이 (§5 전이표 status_patch 경로만).
   * PM 반려(internal_review→draft)는 opts.comment 필수 — internal 코멘트로 기록된다.
   */
  transitionStatus(
    deliverableId: UUID,
    to: DeliverableStatus,
    opts?: { comment?: string },
  ): Promise<Deliverable>
  /**
   * 새 버전 업로드 (§7.2). version_no 자동 증가, 파일명 규약화.
   * 상태가 requested(v1.2 첫 업로드)·changes_requested면 draft로 자동 전이(assertTransition 경유).
   * requested·draft·internal_review·changes_requested 외 상태에서는 409.
   */
  uploadVersion(deliverableId: UUID, input: UploadVersionInput): Promise<Version>
  /**
   * 컨펌 발송 (pm 전용, §5). 발송 조건: 해당 버전이 미리보기 포맷(PDF·PNG·JPG).
   * internal_review → pending_approval 전이 + approvals 생성.
   */
  requestApproval(deliverableId: UUID, input: RequestApprovalInput): Promise<Approval>
  /** 버전 파일 접근 URL (Mock: blob/data URL, 이후: 프록시 GET /files/{version_id}) */
  getFileUrl(versionId: UUID): Promise<string>

  // ── 코멘트 (내부 작성 경로 — 발주처 작성은 submitClientDecision 경유) ──
  /** 기본 visibility='internal' (CLAUDE.md §6) */
  addComment(deliverableId: UUID, input: AddCommentInput): Promise<Comment>

  // ── 일정·마일스톤 (S5) ────────────────────────────────────────────
  listMilestones(projectId: UUID): Promise<Milestone[]>
  createMilestone(projectId: UUID, input: MilestoneInput): Promise<Milestone>
  updateMilestone(
    milestoneId: UUID,
    patch: Partial<MilestoneInput> & { done?: boolean },
  ): Promise<Milestone>
  deleteMilestone(milestoneId: UUID): Promise<void>

  // ── 등록 (S4) ─────────────────────────────────────────────────────
  listRsvpContacts(projectId: UUID): Promise<RsvpContact[]>
  updateRsvpContact(rsvpId: UUID, patch: RsvpContactPatch): Promise<RsvpContact>
  listAttendees(projectId: UUID): Promise<AttendeeWithRsvp[]>
  /** §11: email(소문자) 기준 중복 upsert */
  importRegistrationCsv(
    projectId: UUID,
    target: 'rsvp' | 'attendees',
    rows: CsvImportRow[],
  ): Promise<CsvImportResult>
  toggleCheckin(attendeeId: UUID): Promise<Attendee>
  convertRsvpToAttendee(rsvpId: UUID): Promise<Attendee>
  getRegistrationStats(projectId: UUID): Promise<RegistrationStats>

  // ── 설정 (S6, pm 전용) ────────────────────────────────────────────
  listClientContacts(projectId: UUID): Promise<ClientContact[]>
  createClientContact(input: ClientContactInput): Promise<ClientContact>
  listClientTokens(projectId: UUID): Promise<ClientToken[]>
  /** 기본 만료 = 행사일+30일 (§6.3) */
  issueClientToken(input: IssueTokenInput): Promise<ClientToken>
  revokeClientToken(token: string): Promise<ClientToken>

  // ── 미등록 파일 인박스 (S1) ───────────────────────────────────────
  listInbox(projectId: UUID): Promise<UnregisteredFile[]>
  /** 기존 항목에 새 버전으로 연결 — 파일명 rename은 하지 않는다(§7.3 기본 off) */
  linkInboxFile(inboxId: UUID, deliverableId: UUID): Promise<Version>
  dismissInboxFile(inboxId: UUID): Promise<void>

  // ── v1.2 프로그램표 (S9 §프로그램 소스 — §8 /program-sessions, pm·ops) ──
  /** sort_order 순 */
  listProgramSessions(projectId: UUID): Promise<ProgramSession[]>
  createProgramSession(projectId: UUID, input: ProgramSessionInput): Promise<ProgramSession>
  updateProgramSession(
    sessionId: UUID,
    patch: Partial<ProgramSessionInput>,
  ): Promise<ProgramSession>
  deleteProgramSession(sessionId: UUID): Promise<void>

  // ── v1.3 큐시트 (§8 /cues, pm·ops — category='큐시트' 항목 귀속) ──
  /** sort_order 순 */
  listCues(deliverableId: UUID): Promise<Cue[]>
  createCue(deliverableId: UUID, input: CueInput): Promise<Cue>
  updateCue(cueId: UUID, patch: Partial<CueInput>): Promise<Cue>
  deleteCue(cueId: UUID): Promise<void>
  /**
   * 큐시트 스냅숏 버전 생성 (pm — §8 cue-snapshot). 컨펌 발송 전처리로 requestApproval이
   * 큐시트 항목에서 자동 호출한다. mock 단계는 파일명 .pdf 규약+인쇄용 HTML blob(Phase 5에서 PDF).
   */
  createCueSnapshot(deliverableId: UUID): Promise<Version>

  // ── v1.4 WBS (§8 /wbs-expand·/wbs-tasks) ──────────────────────────
  /**
   * 유형별 템플릿을 event_date 기준 실제 날짜로 전개 (pm). 재전개 시 code 매칭으로
   * 기존 status·done_at·linked_deliverable_id·note를 보존한다.
   */
  expandWbs(projectId: UUID): Promise<WbsTask[]>
  /** sort_order 순 */
  listWbsTasks(projectId: UUID, filter?: WbsTaskFilter): Promise<WbsTask[]>
  /** status 변경 = 담당 역할+pm / 그 외 필드 편집 = pm 전용 */
  updateWbsTask(taskId: UUID, patch: WbsTaskPatch): Promise<WbsTask>

  // ── v1.4 R&R (§8 GET /role-charters, 멤버) ────────────────────────
  listRoleCharters(projectId: UUID): Promise<RoleCharter[]>

  // ── v1.2 행사개요 (§8 PATCH /projects/{id}/overview, pm·ops) ──────
  updateProjectOverview(projectId: UUID, patch: ProjectOverviewPatch): Promise<Project>

  // ── v1.2 S9 운영계획서 (§8 GET /projects/{id}/plan, 멤버) ─────────
  /** 전 섹션 조립 데이터 + 섹션별 진행률 */
  getPlan(projectId: UUID): Promise<PlanData>

  // ── 발주처 뷰 (S7·S8) — 토큰 스코프, 만료·회수 시 410 ─────────────
  /** 컨펌 대기 큐 + 처리 이력. 코멘트는 shared만 포함(§6.2) */
  getClientQueue(token: string): Promise<ClientQueue>
  /** 승인/수정요청 (§5 client_decision). 수정요청은 comment 필수 */
  submitClientDecision(token: string, input: ClientDecisionInput): Promise<void>
  getClientStatus(token: string): Promise<ClientStatusData>
}
