// ─────────────────────────────────────────────────────────────────────
// DataProvider 인터페이스 v1 — 2026-08-19 동결 (CLAUDE.md §4 Phase 1)
//
// 프론트(S1~S8)는 이 인터페이스만 호출한다. 구현체:
//   1단계 MockProvider     — 픽스처+메모리, 업로드=blob URL (Phase 1)
//   2단계 SupabaseProvider — DB·Auth·RLS 이식 (Phase 4)
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
  Deliverable,
  Milestone,
  Project,
  RsvpContact,
  UnregisteredFile,
  UUID,
  Version,
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
  CurrentUser,
  DashboardData,
  DeliverableDetail,
  DeliverableFilter,
  IssueTokenInput,
  MemberWithProfile,
  MilestoneInput,
  RegistrationStats,
  RequestApprovalInput,
  RsvpContactPatch,
  UploadVersionInput,
} from '../types/views'

export interface DataProvider {
  // ── 세션 ──────────────────────────────────────────────────────────
  /** 현재 로그인 사용자 + 프로젝트 내 역할 (역할·영역 검증의 기준) */
  getCurrentUser(): Promise<CurrentUser>

  // ── 프로젝트·멤버 (S6) ────────────────────────────────────────────
  getProject(projectId: UUID): Promise<Project>
  listMembers(projectId: UUID): Promise<MemberWithProfile[]>

  // ── 홈 대시보드 (S1) ──────────────────────────────────────────────
  getDashboard(projectId: UUID): Promise<DashboardData>
  listActivity(projectId: UUID, limit?: number): Promise<ActivityLogEntry[]>

  // ── 산출물 (S2·S3) ────────────────────────────────────────────────
  listDeliverables(projectId: UUID, filter?: DeliverableFilter): Promise<Deliverable[]>
  getDeliverable(deliverableId: UUID): Promise<DeliverableDetail>
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
   * 상태가 changes_requested면 draft로 자동 전이.
   * draft·internal_review·changes_requested 외 상태에서는 409.
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

  // ── 발주처 뷰 (S7·S8) — 토큰 스코프, 만료·회수 시 410 ─────────────
  /** 컨펌 대기 큐 + 처리 이력. 코멘트는 shared만 포함(§6.2) */
  getClientQueue(token: string): Promise<ClientQueue>
  /** 승인/수정요청 (§5 client_decision). 수정요청은 comment 필수 */
  submitClientDecision(token: string, input: ClientDecisionInput): Promise<void>
  getClientStatus(token: string): Promise<ClientStatusData>
}
