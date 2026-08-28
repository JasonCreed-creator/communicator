// ─────────────────────────────────────────────────────────────────────
// DataProvider 인터페이스 v10 — 2026-08-28 재동결 (설계서 v2.6 §24) — 120메서드
//   (아래 이력 전체를 유지한다. v7 표기는 2026-08-23 시점의 스냅숏이었다 — v8·v8.1·v9은
//   그 뒤에 이어 붙은 것이므로 제목 줄만 최신으로 갱신한다.)
//   v1: 2026-08-19 동결(35메서드). v2: v1.2 승인 근거로 41메서드 재동결.
//   v3: 사용자 v1.4 승인(2026-08-22, v1.3 포함)을 근거로 동결 해제 →
//   온보딩·프로젝트 패치·큐시트 CRUD/스냅숏·WBS 전개/조회/패치·R&R 조회
//   12메서드 추가(53메서드) 후 재동결.
//   v3.1: 사용자 v1.4.1 승인(2026-08-22) — 메서드 수 53 불변, onboarded_at 필드 추가만.
//   v4: 사용자 v1.5 승인(2026-08-22, 시각안 3화면)을 근거로 동결 해제 → 다중 행사:
//   listProjects·createProject·closeProject·addMember·removeMember 5메서드 추가(58메서드).
//   v5: 사용자 v2.0 승인(2026-08-22, 시각안 3화면)을 근거로 동결 해제 → 견적 모듈:
//   listQuotes·getQuote·createQuote·saveQuoteVersion·finalizeQuote·createProjectFromQuote·
//   exportQuoteXlsx·listComplianceCards 8메서드(설계서 §2.1 열거) + updateComplianceCard
//   (§8 PATCH /compliance-cards·DoD 25 체크 왕복 대응 — §2.1 열거와의 충돌은 §8 우선 해석,
//   PROGRESS 열린 질문 기록) 추가 = 67메서드. Project 모객 필드 4종·WbsTask.target·
//   CurrentUser.app_role·ProjectPatch 확장(필드 추가만). **기존 58메서드 시그니처 불변** 후 재동결.
//   v6: 사용자 v2.1 승인(2026-08-22, 랜딩보드 4문항 승인)을 근거로 동결 해제 → 랜딩보드:
//   listLandingPages·getLandingPage·createLandingPage·updateLandingPage·publishLandingPage·
//   deleteLandingPage·listLandingMetrics·submitLandingLead 8메서드 추가 = 75메서드.
//   **기존 67메서드 시그니처 불변** 후 재동결. 단 v6은 설계서 선행 없이 코드가 먼저 나간
//   사례이며, 설계서 v2.1이 이를 사후 정본화했다(§2.1 동결 이력 · §4-21 말미 재발 방지).
//   v6.1: 사용자 승인(2026-08-23) + 설계서 v2.1 §4-21을 근거로 동결 해제 → 랜딩 스코프 정정:
//   listLandingPages(projectId)·createLandingPage(projectId, input) 2메서드의 시그니처만 변경
//   (프로젝트 스코프는 인자로 받는다 — R-L1). 나머지 6메서드는 landingId로 대상을 찾고
//   가드를 landing.project_id로 판정하므로 불변(R-L2). 메서드 수 75 불변 후 재동결.
//   v7: 사용자 승인(2026-08-23, 시각안) + 설계서 v2.2 §19를 근거로 동결 해제 → 정산보드:
//   getSettlementBoard·createSettlementBoard·rebaseSettlementBoard·createSettlementBucket·
//   updateSettlementBucket·deleteSettlementBucket·createSettlementItem·updateSettlementItem·
//   deleteSettlementItem·listVendors·upsertVendor 11메서드 추가 = 86메서드.
//   **기존 75메서드 시그니처 불변** 후 재동결. v6과 달리 **설계서가 선행했다**.
//   `importVendorQuote`(업로드 파싱)는 서버 의존이라 **v8 예약 — 지금 만들지 않는다**(§19.5).
//   경위는 PROGRESS.md 결정 로그 참조.
//   v8: 사용자 v2.4 승인(2026-08-27, 시각안 4화면) + 설계서 v2.4 §21·§22를 근거로 동결 해제 →
//   주최형(파트너) 확장 + 견적서 임포트: listPartnerTiers·upsertPartnerTier·deletePartnerTier·
//   listPartners·createPartner·updatePartner·removePartner·issuePartnerToken·revokePartnerToken·
//   getPartnerPortal·submitPartnerItem·reviewPartnerSubmission·expandHostWbs·importQuoteFile·
//   confirmQuoteImport·distributeQuoteImport 16메서드 추가 = 102메서드.
//   **기존 86메서드 시그니처 불변** 후 재동결. Project.kind·Deliverable.partner_id·
//   WbsTask.direction/partner_id·Quote.source·QuoteBreakdown.custom_sections(필드 추가만).
//   `importVendorQuote`(§19.5 협력사 견적서 파싱)는 여전히 **v9 예약 — 지금 만들지 않는다**.
//   v8.1: 사용자 3.15.1 승인(2026-08-27) + 설계서 v2.4.1(§21.1, v2.5에 승계)를 근거로 동결 해제 →
//   partner_guide_url·partner_contact_email 필드 추가만, 메서드 수 102 불변(v3.1 전례).
//   v9: 사용자 v2.5 승인(2026-08-28, 시각안 3화면) + 설계서 v2.5 §23을 근거로 동결 해제 →
//   운영보드 재구성(시나리오·운영가이드 빌더): listScenarioBlocks·saveScenarioBlocks·
//   seedScenarioFromProgram·exportScenarioToCues·listGuideSections·saveGuideSections·
//   seedGuideFromSources·createDocSnapshot 8메서드 추가 = 110메서드. **기존 102메서드
//   시그니처 불변** 후 재동결. 기존 createCueSnapshot은 createDocSnapshot에 위임하도록
//   내부 리팩터만 하고 시그니처·동작·activity log 의미는 그대로 둔다(R-O2). `importVendorQuote`는
//   여전히 **v10 예약 — 지금 만들지 않는다**(§19.5). 경위는 PROGRESS.md 결정 로그 참조.
//   v10: 사용자 v2.6 승인(2026-08-28, 등록 보드 · 구글시트 연동 시안) + 설계서 v2.6 §24를 근거로
//   동결 해제 → 등록 시트 연동: getSheetConnection·probeSheet·previewSheetColumns·connectSheet·
//   disconnectSheet·reauthorizeSheet·checkSheetUpdates·getSheetDiff·applySheetDiff·
//   getSheetRegistrationStats 10메서드 추가 = 120메서드. **기존 110메서드 시그니처 불변** 후 재동결.
//   Attendee 확장(sheet_row_id·title·group_tag·sheet_status·note)은 전부 optional이라 기존 생성
//   경로·픽스처를 건드리지 않는다. `importVendorQuote`는 이제 **v11 예약 — 지금 만들지 않는다**.
//
// 프로젝트 스코프 규칙(설계서 v2.1 §4-21 R-L1): 프로젝트 단위 조회·생성 메서드는 projectId를
// 인자로 받는다. currentUser()는 행위자 신원·권한 판정 전용이며 스코프 유도에 쓰지 않는다.
//
// 프론트(S-2·S0~S9)는 이 인터페이스만 호출한다. 구현체:
//   1단계 MockProvider     — 픽스처+메모리, 업로드=blob URL (Phase 1·3.5~3.11)
//   2단계 SupabaseProvider — DB·Auth·RLS 이식 (Phase 4, v2.0 스키마 기준 — 견적 저장은 서버 재계산)
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
  ComplianceCard,
  Cue,
  Deliverable,
  GuideSection,
  LandingDailyMetric,
  LandingPage,
  Partner,
  PartnerTier,
  PartnerToken,
  QuoteImport,
  ScenarioBlock,
  SettlementBucket,
  SettlementItem,
  SettlementItemStatus,
  Vendor,
  Milestone,
  ProgramSession,
  Project,
  Quote,
  QuoteInput,
  RoleCharter,
  RsvpContact,
  UnregisteredFile,
  UUID,
  Version,
  WbsTask,
  SheetConnection,
} from '../types/entities'
import type { DeliverableStatus } from '../types/enums'
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
  PartnerPortalData,
  PartnerReviewInput,
  PartnerSubmissionInput,
  PartnerTierInput,
  PartnerTokenIssueInput,
  PartnerWithProgress,
  PlanData,
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
  RsvpContactPatch,
  ScenarioBlockInput,
  UploadVersionInput,
  WbsTaskFilter,
  WbsTaskPatch,
  SettlementBoardView,
  SheetApplyResult,
  SheetColumnPreview,
  SheetConnectInput,
  SheetDiff,
  SheetProbe,
  SheetRegistrationStats,
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
   * 항목 생성 (§8 POST /deliverables). v1.2: brief·스펙 포함 시 가이드 발행 —
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

  // ── v2.4 §21 주최형(파트너) — 등급·파트너·토큰 CRUD는 pm, 열람은 멤버 전원 ────
  /** sort 순 */
  listPartnerTiers(projectId: UUID): Promise<PartnerTier[]>
  /** code가 이미 있으면 갱신, 없으면 생성(§8.1) — 기본 3종(DIAMOND·GOLD·SILVER) 시드는 픽스처 담당 */
  upsertPartnerTier(projectId: UUID, input: PartnerTierInput): Promise<PartnerTier>
  /** 이 등급을 쓰는 파트너가 있으면 409 */
  deletePartnerTier(tierId: UUID): Promise<void>
  /** 등급·최신 토큰·제출 진행 요약(S-11 카드) 포함 */
  listPartners(projectId: UUID): Promise<PartnerWithProgress[]>
  createPartner(projectId: UUID, input: PartnerInput): Promise<Partner>
  updatePartner(partnerId: UUID, patch: Partial<PartnerInput>): Promise<Partner>
  /** 제출 이력(WBS 인스턴스·inbound 산출물)이 있으면 409 — 철회(status='withdrawn')로 대신한다 */
  removePartner(partnerId: UUID): Promise<void>
  /** 파트너 제출 링크 발급 — 기본 만료 = 행사일+30일(§6.3과 동일 원칙) */
  issuePartnerToken(partnerId: UUID, input: PartnerTokenIssueInput): Promise<PartnerToken>
  revokePartnerToken(token: string): Promise<PartnerToken>
  /**
   * `/p/{token}` 제출 포털 데이터 — 자기 partner_id 행만(R-H2), contract_amount·정산·견적
   * 금액 키는 반환 타입 자체에 없다(R-H3). 만료·회수 토큰은 410.
   */
  getPartnerPortal(token: string): Promise<PartnerPortalData>
  /**
   * 파트너 제출(파일 또는 텍스트) — requested→pending_approval(첫 제출, via partner_submit)
   * 또는 changes_requested→pending_approval(재제출, via version_upload) 전이(§5.1, R-H4).
   */
  submitPartnerItem(
    token: string,
    deliverableId: UUID,
    input: PartnerSubmissionInput,
  ): Promise<Deliverable>
  /**
   * 내부 검토(pm·담당) — approved면 발주처 승인과 동일하게 final까지 마감,
   * changes_requested면 코멘트 필수(422)이며 shared로 기록한다(파트너가 봐야 하므로).
   */
  reviewPartnerSubmission(deliverableId: UUID, input: PartnerReviewInput): Promise<Deliverable>
  /**
   * 주최형 WBS 템플릿(§15.3 HT-1~12)을 event_date 기준 전개(pm). partner_submit 방향은
   * 활성 파트너 수만큼 인스턴스를 만들고 inbound deliverable을 자동 생성한다(§5.1).
   * 재전개는 code+partner_id 매칭으로 기존 상태를 보존한다(R-H5).
   */
  expandHostWbs(projectId: UUID): Promise<WbsTask[]>

  // ── v1.2 행사개요 (§8 PATCH /projects/{id}/overview, pm·ops) ──────
  updateProjectOverview(projectId: UUID, patch: ProjectOverviewPatch): Promise<Project>

  // ── v1.2 S9 운영계획서 (§8 GET /projects/{id}/plan, 멤버) ─────────
  /** 전 섹션 조립 데이터 + 섹션별 진행률 */
  getPlan(projectId: UUID): Promise<PlanData>

  // ── v2.0 견적 S-2 (§8 /quotes — app_role admin·sales, 금액은 이 경로에만) ──
  /** 견적 목록(버전 체인·상태·총액) — 행사 연결·미연결 전부. created_at 오름차순 */
  listQuotes(): Promise<Quote[]>
  /** 상세 — admin·sales, 또는 연결 행사의 pm(요약 열람 §6.1) */
  getQuote(quoteId: UUID): Promise<Quote>
  /** 새 견적(version 1, draft). breakdown·total_amount는 provider가 엔진으로 재계산해 저장 */
  createQuote(input: QuoteInput): Promise<Quote>
  /** 새 버전 — 이전 버전은 superseded 체인으로 보존(§4-18). 확정본 수정도 새 버전 경로 */
  saveQuoteVersion(quoteId: UUID, input: QuoteInput): Promise<Quote>
  /** 확정: is_final·locked_at 기록, 같은 행사의 다른 final은 archived (§8) */
  finalizeQuote(quoteId: UUID): Promise<Quote>
  /** §16 핸드오프: 확정 견적 → 행사 생성(프리필, onboarded_at null) + 상호 링크. 미확정이면 409 */
  createProjectFromQuote(quoteId: UUID): Promise<Project>
  /** §8 GET /quotes/{id}/export.xlsx — 자동 외부 업로드 없음. 저장은 modules/quote saveQuoteFile */
  exportQuoteXlsx(quoteId: UUID, lang?: 'ko' | 'en'): Promise<QuoteExportResult>

  // ── v2.4 §22 견적서 임포트 (app_role admin·sales) ──────────────────
  /**
   * xlsx 업로드 → 서식 감지(A·B·C형)·섹션·항목·검산 결과 반환. **커밋 없음**(R-Q1) —
   * quotes는 confirmQuoteImport를 거쳐야만 생긴다.
   */
  importQuoteFile(fileName: string, data: ArrayBuffer): Promise<QuoteImport>
  /** 확인 큐에서 수정한 매핑을 확정 → quotes 등록(source='imported', 새 버전) */
  confirmQuoteImport(importId: UUID, input: QuoteImportConfirmInput): Promise<Quote>
  /** 분배 실행 — {project_prefill?·settlement_base?·board_seed?}(§22.4). confirmed 전제, 아니면 409 */
  distributeQuoteImport(
    importId: UUID,
    input: QuoteImportDistributeInput,
  ): Promise<QuoteImportDistributeResult>

  // ── v2.0 컴플라이언스 카드 (§8 /compliance-cards — 체크 멤버·편집 pm) ──
  /** sort_order 순 */
  listComplianceCards(projectId: UUID): Promise<ComplianceCard[]>
  /** items 체크 = 멤버 / title 편집 = pm (§6.1) */
  updateComplianceCard(cardId: UUID, patch: ComplianceCardPatch): Promise<ComplianceCard>

  // ── S-3 랜딩보드 (v2.1 §4-19~§4-22) ───────────────────────────────
  /** 그 행사의 랜딩 목록 (최신 수정순). projectId 필수 — §4-21 R-L1 */
  listLandingPages(projectId: UUID): Promise<LandingPage[]>
  getLandingPage(landingId: UUID): Promise<LandingPage>
  /**
   * 새 랜딩. 섹션·폼·동의는 기본 템플릿으로 시드되고,
   * autofill 섹션은 행사 데이터(개요·세션·존)에서 즉시 조립된다.
   * projectId 필수 — 쓰기 가드·slug 유일성 판정 대상이다(§4-21 R-L1·R-L3·R-L4).
   */
  createLandingPage(projectId: UUID, input: LandingPageInput): Promise<LandingPage>
  /** 부분 수정 — 배열 필드(sections·form_fields·consents)는 통째로 교체된다 */
  updateLandingPage(landingId: UUID, patch: LandingPagePatch): Promise<LandingPage>
  /**
   * 발행 표시. 내보낸 HTML을 올린 공개 주소를 기록한다 (앱이 서빙하지는 않는다).
   * publicUrl을 null로 주면 draft로 되돌린다.
   */
  publishLandingPage(landingId: UUID, publicUrl: string | null): Promise<LandingPage>
  deleteLandingPage(landingId: UUID): Promise<void>
  /** 일자별 유입 지표 (mock=픽스처 / Phase 4=GA Data API) */
  listLandingMetrics(landingId: UUID): Promise<LandingDailyMetric[]>
  /**
   * 랜딩 폼 제출 → 등록(S4) 유입. submit_target='registration'일 때만 유효하며
   * Attendee(channel='rsvp')로 적재하고 그 행을 돌려준다.
   */
  submitLandingLead(landingId: UUID, values: Record<string, string>): Promise<Attendee>

  // ── S-10 정산보드 (v2.2 §19 · 계약 §4-24) ─────────────────────────
  // 내부 한정. 발주처 토큰 경로에는 어떤 정산 데이터도 나가지 않는다(R-S9).
  /** 그 행사의 정산 보드. 아직 없으면 null — 화면은 "확정 견적에서 시작" 빈 상태를 띄운다 */
  getSettlementBoard(projectId: UUID): Promise<SettlementBoardView | null>
  /**
   * 확정 견적 breakdown을 버킷 9종으로 **스냅숏**해 보드를 만든다(R-S2).
   * `recruit`를 rc(RSVP 운영비)·ld(리드젠)로 쪼개는 것이 유일한 비자명 매핑이며,
   * 값은 견적 input에서 재유도하지 않고 엔진 산출값을 그대로 쓴다(§19.2).
   */
  createSettlementBoard(projectId: UUID, quoteId: UUID): Promise<SettlementBoardView>
  /** 기준 견적 갱신. 이전 기준과의 차이를 남기고 activity_log에 기록한다(R-S2) */
  rebaseSettlementBoard(projectId: UUID, quoteId: UUID): Promise<SettlementBoardView>
  /** 행사별 버킷 추가 — source='custom'·quote_amount=0이 기본(§19.2) */
  createSettlementBucket(projectId: UUID, input: SettlementBucketInput): Promise<SettlementBucket>
  updateSettlementBucket(
    bucketId: UUID,
    patch: Partial<SettlementBucketInput>,
  ): Promise<SettlementBucket>
  deleteSettlementBucket(bucketId: UUID): Promise<void>
  /** 발주 항목 생성(pm). has_cost=false 버킷에 금액을 넣으면 422(R-S4) */
  createSettlementItem(
    projectId: UUID,
    bucketId: UUID,
    input: SettlementItemInput,
  ): Promise<SettlementItem>
  /** 발주액·실비 입력 — pm 또는 assignee 본인. 부가세 포함 입력은 저장 직전 분리(R-S3) */
  updateSettlementItem(itemId: UUID, patch: Partial<SettlementItemInput>): Promise<SettlementItem>
  deleteSettlementItem(itemId: UUID): Promise<void>
  /** 협력사 마스터 — 프로젝트 비종속(§19.6) */
  listVendors(): Promise<Vendor[]>
  upsertVendor(input: VendorInput): Promise<Vendor>

  // ── 운영보드 재구성 — 시나리오·운영가이드 (v2.5 §23·§8.2) ─────────
  // 쓰기(save·seed·export) = pm·ops / 읽기(list) = 멤버 전원. category 불일치는 409(conflict).
  /** GET scenario-blocks — sort_order 순. category='시나리오' 항목만(그 외는 409) */
  listScenarioBlocks(deliverableId: UUID): Promise<ScenarioBlock[]>
  /** PUT scenario-blocks — 벌크 전체 교체(정렬 포함, id는 매번 새로 발급) */
  saveScenarioBlocks(deliverableId: UUID, blocks: ScenarioBlockInput[]): Promise<ScenarioBlock[]>
  /**
   * 프로그램표 세션에서 뼈대 생성(세션당 그룹 헤더 + 기본 진행 블록, §8.2).
   * **빈 문서에서만** — 기존 블록이 있으면 409(R-O3, 덮어쓰기 금지).
   */
  seedScenarioFromProgram(deliverableId: UUID): Promise<ScenarioBlock[]>
  /**
   * kind가 video·transition이고 큐 표기 토큰(예: M-02·C-11)이 있는 블록만 큐로 변환해
   * 대상 큐시트 항목에 추가한다. **기존 큐를 보존하고 후미에만 삽입**한다(R-O5, §23.3).
   * 대본 전문은 복사하지 않는다. 응답 = 새로 추가된 큐만(변환 건수 = length).
   */
  exportScenarioToCues(deliverableId: UUID, targetDeliverableId: UUID): Promise<Cue[]>
  /** GET guide-sections — sort_order 순. category='운영가이드' 항목만(그 외는 409) */
  listGuideSections(deliverableId: UUID): Promise<GuideSection[]>
  /** PUT guide-sections — 벌크 전체 교체. id를 넘긴 섹션은 identity 유지(연동 stale 판정용) */
  saveGuideSections(deliverableId: UUID, sections: GuideSectionInput[]): Promise<GuideSection[]>
  /**
   * 존별 운영(비정형 ops 항목)·역할별 체크리스트(R&R)에서 4섹션(존별 운영·역할별 체크리스트·
   * 비상 대응·연락망)을 초기 로드한다. **빈 문서에서만** — 기존 섹션이 있으면 409(R-O3).
   */
  seedGuideFromSources(deliverableId: UUID): Promise<GuideSection[]>
  /**
   * 정형 문서(큐시트·시나리오·운영가이드) 공통 인쇄 스냅숏 → 버전 등록 (pm, §8 doc-snapshot —
   * 기존 cue-snapshot의 일반화, createCueSnapshot은 이 메서드에 위임한다 R-O2). 컨펌 발송 전처리로
   * requestApproval이 정형 3종 항목에서 자동 호출한다. **R-O6**: 운영가이드의 contacts 섹션은
   * include_contacts=true일 때만 인쇄에 포함되고, 기본은 제외된다.
   */
  createDocSnapshot(deliverableId: UUID, opts?: { include_contacts?: boolean }): Promise<Version>

  // ── 발주처 뷰 (S7·S8) — 토큰 스코프, 만료·회수 시 410 ─────────────
  /** 컨펌 대기 큐 + 처리 이력. 코멘트는 shared만 포함(§6.2) */
  getClientQueue(token: string): Promise<ClientQueue>
  /** 승인/수정요청 (§5 client_decision). 수정요청은 comment 필수 */
  submitClientDecision(token: string, input: ClientDecisionInput): Promise<void>
  getClientStatus(token: string): Promise<ClientStatusData>

  // ── 등록 · 구글 시트 연동 (S4, v2.6 §24) ──────────────────────────
  // 시트 → 앱 단방향이다. 이 절에 시트로 쓰는 메서드는 없고, 앞으로도 추가하지 않는다(§24.6).
  /** 행사의 시트 연결 1건. 연결한 적이 없으면 null(화면은 미연결 빈 상태로 분기) */
  getSheetConnection(projectId: UUID): Promise<SheetConnection | null>
  /** 위저드 1·2단계 — URL 확인(문서 제목·최종 수정 시각·공유 대상 계정·탭 목록) */
  probeSheet(projectId: UUID, url: string): Promise<SheetProbe>
  /** 위저드 3단계 — 선택한 탭의 컬럼별 첫 행 미리보기(연락처는 마스킹된 값만) */
  previewSheetColumns(projectId: UUID, url: string, tabName: string): Promise<SheetColumnPreview[]>
  /** 연결 확정 (pm·reg). 필수 매핑 name+email이 없으면 422 validation */
  connectSheet(projectId: UUID, input: SheetConnectInput): Promise<SheetConnection>
  /** 연결 해제 (pm·reg). 이미 적재된 참관객 행은 이력으로 남긴다(하드 삭제 금지) */
  disconnectSheet(projectId: UUID): Promise<void>
  /** 권한 끊김(revoked) 복구 — 재인증 후 connected로 (pm·reg) */
  reauthorizeSheet(projectId: UUID): Promise<SheetConnection>
  /** 주기 자동/수동 확인. **감지만** 한다 — 상태·확인 시각·미확인 건수만 갱신(R-S2) */
  checkSheetUpdates(projectId: UUID): Promise<SheetConnection>
  /** 미확인 차이 목록. 차이가 없으면 rows=[](오류가 아니다) */
  getSheetDiff(projectId: UUID): Promise<SheetDiff>
  /**
   * 사람이 차이를 확인한 뒤의 반영 (pm·reg). snapshotVersion은 **호출자가 보고 있던** 버전이며,
   * 저장값과 다르면 409 conflict(R-S1 — 다른 담당자가 이미 반영했다는 뜻).
   * 성공 시 snapshot_version 증가 · snapshot_at = 원본 수정 시각(R-S3).
   * 체크인·비고(앱 소유)는 어떤 경우에도 덮어쓰지 않고, 사라진 행은 sheet_status='removed'로 남긴다.
   */
  applySheetDiff(projectId: UUID, snapshotVersion: number): Promise<SheetApplyResult>
  /**
   * 시트 기준 등록 통계(KPI 4카드). 연결이 없으면 **null** — 화면은 기존 getRegistrationStats
   * (응답률·등록 수·체크인율)로 폴백한다. §24.4는 반환형을 SheetRegistrationStats로만 적었으나,
   * 미연결 행사에서 404를 던지면 상시 노출 카드가 오류로 보이므로 null 분기로 확정한다.
   */
  getSheetRegistrationStats(projectId: UUID): Promise<SheetRegistrationStats | null>
}


// ── S-3 랜딩보드 입출력 (v2.1) ────────────────────────────────────────
export interface LandingPageInput {
  title: string
  slug: string
  /** 미지정 시 샘플 구조(13섹션)로 시드 */
  sections?: LandingPage['sections']
  form_fields?: LandingPage['form_fields']
  consents?: LandingPage['consents']
  analytics?: Partial<LandingPage['analytics']>
}

export type LandingPagePatch = Partial<
  Pick<
    LandingPage,
    | 'title'
    | 'slug'
    | 'status'
    | 'sticky_nav'
    | 'cta_label'
    | 'submit_target'
    | 'external_submit_url'
    | 'analytics'
    | 'sections'
    | 'form_fields'
    | 'consents'
  >
>


// ── S-10 정산 입출력 (v2.2) ───────────────────────────────────────────
export interface SettlementBucketInput {
  code: string
  label: string
  quote_amount?: number
  has_cost?: boolean
  is_margin_base?: boolean
  sort_order?: number
}

export interface SettlementItemInput {
  title: string
  spec?: string | null
  vendor_id?: UUID | null
  assignee_id?: UUID | null
  ordered_amount?: number | null
  actual_amount?: number | null
  /** true면 위 금액을 부가세 포함으로 보고 저장 직전 분리한다(§19.4) */
  vat_included_input?: boolean
  status?: SettlementItemStatus
  evidence?: string | null
  note?: string | null
  bucket_id?: UUID
}

export interface VendorInput {
  id?: UUID
  name: string
  biz_no?: string | null
  note?: string | null
}
