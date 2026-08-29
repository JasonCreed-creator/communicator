// 화면(S1~S9)·API 계약(설계서 §8)이 요구하는 뷰 모델과 입력 타입.
// 엔티티(§4)와 달리 여기는 조합 형태라 프론트 편의에 맞춰 정의하되, 필드명은 snake_case로 통일한다.
import type { SettlementBoard, SettlementBucket, SettlementItem } from './entities'
import type { SettlementTotals } from '../lib/settlement'
import type { SectionMapping } from '../modules/quote/import/types'
import type {
  ActivityLogEntry,
  Approval,
  Attendee,
  Comment,
  Cue,
  Deliverable,
  IsoDate,
  IsoDateTime,
  Milestone,
  OverviewItem,
  Partner,
  PartnerTier,
  PartnerToken,
  ProgramSession,
  Project,
  ScenarioBlock,
  SheetColumnMapping,
  SheetConnection,
  UUID,
  Version,
  WbsTask,
} from './entities'
import type {
  AppRole,
  ApprovalDecision,
  CommentVisibility,
  DeliverableArea,
  DeliverableStatus,
  EventType,
  GuideSectionKind,
  MemberRole,
  PartnerStatus,
  ProjectKind,
  ProjectStatus,
  ScenarioBlockKind,
  AudienceModel,
  EventFormat,
  SheetDiffKind,
  SheetInvalidReason,
  SheetMappedField,
  WbsStatus,
} from './enums'
import type { ComplianceItem, Targeting } from './entities'

// ── 사용자 (auth.users의 앱 레벨 투영) ─────────────────────────────
export interface UserRef {
  id: UUID
  name: string
  email: string | null
}

export interface CurrentUser extends UserRef {
  role: MemberRole
  project_id: UUID
  /** v2.0 — 전역 역할 (profiles.app_role): 견적 메뉴·API 게이트 (admin·sales) */
  app_role: AppRole
}

export interface MemberWithProfile {
  project_id: UUID
  user_id: UUID
  role: MemberRole
  profile: UserRef
}

// ── S1 홈 대시보드 (§8 GET /projects/{id}/dashboard) ───────────────
export interface PendingApprovalItem {
  approval: Approval
  deliverable: Deliverable
  version: Version
}

export interface AreaProgress {
  area: DeliverableArea
  total: number
  /** status='final' 항목 수 */
  done: number
}

export interface DashboardData {
  project: Project
  /** 기한순 정렬 */
  pending_approvals: PendingApprovalItem[]
  /** 미완료, 기한순 */
  upcoming_milestones: Milestone[]
  inbox_count: number
  area_progress: AreaProgress[]
  recent_activity: ActivityLogEntry[]
  /** v1.2 — 현재 사용자가 담당자인 requested 항목(받은 가이드), 마감순 */
  my_requested: Deliverable[]
  /** v1.4 — 지연 WBS 태스크(미완료·end_date<오늘), 마감 오래된 순 */
  wbs_delayed: WbsTask[]
  /** v1.4 — 임박 WBS 태스크(미완료·오늘≤end_date≤오늘+2, 지연과 배타), 마감순 */
  wbs_imminent: WbsTask[]
}

// ── S3 항목 상세 ───────────────────────────────────────────────────
export interface DeliverableDetail extends Deliverable {
  /** version_no 내림차순 */
  versions: Version[]
  /** 작성순 — 내부 화면은 전체, 발주처 노출은 provider가 shared만 반환 */
  comments: Comment[]
  /** 요청순 */
  approvals: Approval[]
}

// ── S4 등록 ────────────────────────────────────────────────────────
export interface RegistrationStats {
  rsvp_total: number
  rsvp_sent: number
  rsvp_accepted: number
  rsvp_declined: number
  /** accepted+declined ÷ sent (0~1, sent=0이면 0) */
  response_rate: number
  attendee_total: number
  checked_in: number
  /** checked_in ÷ attendee_total (0~1, 0이면 0) */
  checkin_rate: number
}

/** §11 CSV 스키마 — 헤더 매핑 UI가 이 형태로 정규화해 전달 */
export interface CsvImportRow {
  name: string
  org?: string
  title?: string
  email?: string
  phone?: string
  group_tag?: string
  memo?: string
}

export interface CsvImportResult {
  inserted: number
  /** email(소문자) 기준 upsert된 기존 행 수 */
  updated: number
}

// ── S7·S8 발주처 뷰 (§8 GET /c/{token}/queue·status) ───────────────
export interface ClientQueueItem {
  approval_id: UUID
  deliverable_id: UUID
  title: string
  category: string
  area: DeliverableArea
  requested_at: IsoDateTime
  due_at: IsoDateTime | null
  version: {
    id: UUID
    version_no: number
    file_name: string
    preview_url: string
  }
  /** visibility='shared'만 — internal은 쿼리 자체에서 제외 (§6.2) */
  shared_comments: Comment[]
}

export interface ClientHistoryItem {
  approval_id: UUID
  deliverable_id: UUID
  title: string
  decision: ApprovalDecision
  decided_at: IsoDateTime
}

export interface ClientQueue {
  project_name: string
  contact_name: string | null
  queue: ClientQueueItem[]
  history: ClientHistoryItem[]
}

export interface ClientFinalItem {
  version_id: UUID
  deliverable_id: UUID
  deliverable_title: string
  file_name: string
  file_url: string
  finalized_at: IsoDateTime
}

export interface ClientStatusData {
  project_name: string
  event_date: IsoDate | null
  area_progress: AreaProgress[]
  milestones: Milestone[]
  recent_finals: ClientFinalItem[]
}

// ── 입력 타입 ──────────────────────────────────────────────────────
export interface DeliverableFilter {
  area?: DeliverableArea
  status?: DeliverableStatus
  assignee_id?: UUID
}

export interface CreateDeliverableInput {
  project_id: UUID
  area: DeliverableArea
  category: string
  title: string
  assignee_id?: UUID
  due_date?: IsoDate
  requires_approval?: boolean
  // v1.2 가이드 발행 (§8 POST /deliverables): brief·스펙 포함 시 status='requested', pm 전용
  brief?: string
  brief_refs?: string[]
  spec_size?: string
  spec_qty?: number
  spec_location?: string
  spec_type?: string
  content?: string
}

export interface UploadVersionInput {
  /** 원본 파일명 — 확장자 추출·규약화(§7.2)에 사용 */
  file_name: string
  note?: string
  /** Mock 단계: blob URL 생성용. 없으면 자리표시 URL */
  file?: Blob
}

export interface RequestApprovalInput {
  version_id: UUID
  due_at?: IsoDateTime
}

export interface AddCommentInput {
  body: string
  /** 기본 'internal' (CLAUDE.md §6) */
  visibility?: CommentVisibility
}

export interface MilestoneInput {
  title: string
  area?: DeliverableArea | null
  due_date: IsoDate
}

export interface RsvpContactPatch {
  invite_status?: import('./enums').InviteStatus
  invited_at?: IsoDateTime | null
  responded_at?: IsoDateTime | null
  group_tag?: string | null
  memo?: string | null
}

export interface ClientContactInput {
  project_id: UUID
  name: string
  org?: string
  email?: string
}

export interface IssueTokenInput {
  project_id: UUID
  contact_id: UUID
  /** 미지정 시 기본 만료 = 행사일+30일 (§6.3) */
  expires_at?: IsoDateTime
}

export interface ClientDecisionInput {
  approval_id: UUID
  decision: ApprovalDecision
  /** 수정요청 시 필수 (§5) */
  comment?: string
}

// ── 참관객 뷰 ──────────────────────────────────────────────────────
export interface AttendeeWithRsvp extends Attendee {
  rsvp_group_tag: string | null
}

// ── v1.2 프로그램표 (§8 /program-sessions, pm·ops) ─────────────────
export interface ProgramSessionInput {
  section?: string
  /** 'HH:MM' */
  start_time?: string
  end_time?: string
  title: string
  speaker_name?: string
  speaker_title?: string
  speaker_org?: string
  note?: string
  /** v2.6 §25.4 — 트랙 편성(판매 플래너 ③). 빈 문자열은 null로 저장한다 */
  track?: string | null
  sort_order?: number
}

// ── v1.2 행사개요 편집 (§8 PATCH /projects/{id}/overview, pm·ops) ──
export interface ProjectOverviewPatch {
  event_date?: IsoDate | null
  theme?: string | null
  venue?: string | null
  mc_name?: string | null
  overview_items?: OverviewItem[] | null
}

// ── v1.3 프로젝트 기본정보·온보딩 (§8 PATCH /projects/{id}, S0) ────
export interface ProjectPatch {
  name?: string
  /** v1.5 — 행사 코드 (전역 유일, 파일명 규약) */
  code?: string
  /** v2.4 §21 R-H1 — 전환은 표시 계층만 바꾼다(어떤 행도 삭제되지 않는다) */
  kind?: ProjectKind
  event_date?: IsoDate | null
  event_type?: EventType
  /** v2.6 §25 — format 전환은 확인 다이얼로그 + WBS 재전개(§4-15 보존 규칙)를 호출부가 동반한다 */
  format?: EventFormat
  psa_enabled?: boolean
  audience_model?: AudienceModel | null
  // v1.5 — 행사 설정 ① 개요 전 필드 (§8 PATCH /projects/{id})
  event_end_date?: IsoDate | null
  start_time?: string | null
  end_time?: string | null
  venue?: string | null
  expected_headcount?: number | null
  seating?: string | null
  theme?: string | null
  organizer?: string | null
  mc_name?: string | null
  target_audience?: string | null
  overview_items?: OverviewItem[] | null
  // v2.0 — 행사 설정 ① 모객형 전용 그룹 (일반형이면 숨김·데이터 보존)
  guarantee_pax?: number | null
  kpi_show_rate?: number | null
  targeting?: Targeting | null
  /** v2.0 — "견적 연결" 액션 (app_role admin·sales 전용, null = 해제) */
  quote_id?: UUID | null
  // v2.4.1 §21.1 — 행사 설정 ③ 주최형 블록 (kind='host'에서만 표시, 데이터는 항상 보존)
  partner_guide_url?: string | null
  partner_contact_email?: string | null
}

/** v1.5 — POST /projects 입력(§8): S0 ① 저장 시 개요 필드 일괄 수신, onboarded_at은 null.
 *  "새 행사 만들기"는 빈 입력으로 호출해 자리표시 행사를 만든 뒤 S0에서 채운다. */
export interface ProjectCreateInput {
  name?: string
  /** v2.6 §25 — 미지정이면 'conference'. S0 ③ 4카드가 이 값과 kind·event_type을 함께 시드한다 */
  format?: EventFormat
  psa_enabled?: boolean
  audience_model?: AudienceModel | null
  code?: string
  event_date?: IsoDate | null
  event_end_date?: IsoDate | null
  start_time?: string | null
  end_time?: string | null
  venue?: string | null
  expected_headcount?: number | null
  seating?: string | null
  theme?: string | null
  organizer?: string | null
  mc_name?: string | null
  target_audience?: string | null
  overview_items?: OverviewItem[] | null
  event_type?: EventType
}

/** v1.5 — 행사 설정 ② 담당자 입력(§8 POST /projects/{id}/members).
 *  mock은 추가 즉시 멤버로 취급, Phase 4부터 project_invites 경유 승격 */
export interface MemberInput {
  display_name: string
  email: string
  role: MemberRole
}

/** v1.5 — GET /projects 요약(§8): 프로젝트 셀렉터·S-1 행사 목록 공용 */
export interface ProjectSummary {
  id: UUID
  name: string
  code: string
  /** v2.4 §21 — 선택 배지용('agency'|'host') */
  kind: ProjectKind
  event_type: EventType
  event_date: IsoDate | null
  venue: string | null
  expected_headcount: number | null
  status: ProjectStatus
  /** onboarded_at !== null 파생값 */
  onboarded: boolean
  /** 온보딩 진행 단계(0~3): ①개요 필수 4(행사명·코드·시작일·장소) ②PM 지정 ③완료 처리 */
  onboarding_steps_done: number
  pm_name: string | null
  /** 미결 컨펌(pending_approval 항목 수) */
  pending_approvals: number
  /** 지연 WBS 태스크 수 (lib/wbs 산식) */
  delayed_tasks: number
  /** 확정(final) 항목 수 / 전체 항목 수 — 전체 진행률 소스 */
  finals: number
  deliverable_total: number
}

/** 온보딩 완료 상태 — 설계서 v1.4.1 §8 GET /projects/{id}/onboarding.
 *  정본은 projects.onboarded_at 컬럼: completed = onboarded_at !== null (파생값) */
export interface OnboardingStatus {
  completed: boolean
  onboarded_at: IsoDateTime | null
}

// ── v2.0 견적 (§8 /quotes, app_role admin·sales) ───────────────────
/** GET /quotes/{id}/export.xlsx — 자동 외부 업로드 없음. 저장 트리거는 modules/quote(saveQuoteFile) */
export interface QuoteExportResult {
  file_name: string
  blob: Blob
}

/** PATCH /compliance-cards — items 체크는 멤버, title 편집은 pm (§6.1·§8) */
export interface ComplianceCardPatch {
  items?: ComplianceItem[]
  title?: string
}

// ── v1.3 큐시트 (§8 /cues, pm·ops) ─────────────────────────────────
export interface CueInput {
  cue_no?: string
  /** 'HH:MM' */
  time_at?: string
  segment?: string
  body?: string
  console_audio?: string
  console_light?: string
  console_screen?: string
  sort_order?: number
}

// ── v1.4 WBS (§8 /wbs-tasks·wbs-expand) ────────────────────────────
export interface WbsTaskFilter {
  phase_no?: number
  role?: MemberRole
  status?: WbsStatus
}

/**
 * status 변경 = 담당 역할+pm / 그 외 필드 편집 = pm 전용 (§6.1·S5).
 * linked_deliverable_id는 null로 연결 해제 가능.
 */
export interface WbsTaskPatch {
  status?: WbsStatus
  title?: string
  start_date?: IsoDate
  end_date?: IsoDate
  role?: MemberRole
  note?: string | null
  linked_deliverable_id?: UUID | null
}

// ── v1.2 S9 운영계획서 (§8 GET /projects/{id}/plan) ────────────────
export type PlanSectionKey =
  | 'overview'
  | 'program'
  | 'cuesheet'
  | 'zones'
  | 'production'
  | 'registration'
  /** v2.5 §23 — ⑦비상 대응(운영가이드 emergency 섹션 조립) */
  | 'emergency'
  | 'schedule'

/** 섹션별 진행률 — done/total 산정 기준은 provider 구현(getPlan) 주석이 정본 */
export interface PlanSectionProgress {
  key: PlanSectionKey
  done: number
  total: number
}

export interface PlanVersionRef {
  id: UUID
  version_no: number
  file_name: string
  /** 미리보기 포맷(PDF·PNG·JPG)일 때만 — 그 외 null */
  preview_url: string | null
}

/** ③존별 운영 — ops 항목의 content(마크다운)+최신 도면 */
export interface PlanZoneItem {
  deliverable_id: UUID
  category: string
  title: string
  status: DeliverableStatus
  content: string | null
  latest_version: PlanVersionRef | null
}

/** ④제작물 리스트 — design 항목의 가이드 스펙 표+최신 시안·상태 */
export interface PlanProductionItem {
  deliverable_id: UUID
  category: string
  title: string
  status: DeliverableStatus
  spec_size: string | null
  spec_qty: number | null
  spec_location: string | null
  spec_type: string | null
  latest_version: PlanVersionRef | null
}

/** v1.3 — S9 ⑦큐시트 표 (프로그램 다음 배치): 첫 큐시트 항목의 큐 목록 */
export interface PlanCuesheet {
  deliverable_id: UUID
  title: string
  status: DeliverableStatus
  /** sort_order 순 */
  cues: Cue[]
}

/** v2.5 §23 — S9 ② 세션별 시나리오 펼침 소스. 첫 시나리오 항목이 없으면 null */
export interface PlanScenarioSection {
  deliverable_id: UUID
  title: string
  status: DeliverableStatus
  /** sort_order 순 */
  blocks: ScenarioBlock[]
}

/** v2.5 §23 — S9 ③ 존운영 확장 소스(가이드의 zone 섹션). 첫 운영가이드 항목이 없으면 null */
export interface PlanGuideZone {
  content: string | null
  source_stale: boolean
}

/**
 * v2.5 §23 — S9 ⑦비상 대응 섹션 소스(가이드의 emergency 섹션). 첫 운영가이드 항목이
 * 없거나 emergency 섹션이 없으면 null. **R-O6**: contacts 섹션은 이 타입에도, PlanData
 * 어디에도 담기지 않는다.
 */
export interface PlanEmergencySection {
  deliverable_id: UUID
  title: string
  content: string | null
  status: DeliverableStatus
}

export interface PlanData {
  project: Project
  /** sort_order 순 */
  program_sessions: ProgramSession[]
  /** 큐시트 항목이 없으면 null */
  cuesheet: PlanCuesheet | null
  /** v2.5 §23 — 신설 정형 2종(시나리오·운영가이드)은 제외(큐시트는 기존대로 포함) */
  zones: PlanZoneItem[]
  production_items: PlanProductionItem[]
  registration_stats: RegistrationStats
  /** 3.17.1 T4 — 시트가 연결돼 있으면 등록 수치가 서 있는 스냅숏 시각. 미연결이면 null.
   *  §4-22 GA 캡션 규약 준용 — 출처와 기준 시각을 지면에 밝힌다. */
  sheet_snapshot_at: IsoDateTime | null
  /** 기한순 */
  milestones: Milestone[]
  section_progress: PlanSectionProgress[]
  /** v2.5 §23 — 첫 시나리오 항목 (없으면 null) */
  scenario: PlanScenarioSection | null
  /** v2.5 §23 — 첫 운영가이드 항목의 zone 섹션 (없으면 null) */
  guide_zone: PlanGuideZone | null
  /** v2.5 §23 — 첫 운영가이드 항목의 emergency 섹션 (없으면 null) */
  emergency: PlanEmergencySection | null
}

// ── 운영보드 재구성 입력 (v2.5 §23·§8.2) ───────────────────────────────

/** PUT scenario-blocks 벌크 교체 입력 — id 없음, sort_order는 배열 순서로 유도 */
export interface ScenarioBlockInput {
  session_id?: UUID | null
  time?: string | null
  kind: ScenarioBlockKind
  script?: string | null
  note?: string | null
}

/** PUT guide-sections 벌크 교체 입력 — id를 넘기면 재사용(연동 identity 유지), 없으면 새로 생성 */
export interface GuideSectionInput {
  id?: UUID
  kind: GuideSectionKind
  title: string
  content?: string | null
  source_ref?: 'zone_items' | 'role_charters' | null
  source_stale?: boolean
}

// ── S-10 정산보드 뷰 (v2.2 §19) ───────────────────────────────────────

/** 버킷 + 그 버킷의 항목 + 파생 수치 (화면이 바로 그릴 수 있는 형태) */
export interface SettlementBucketView {
  bucket: SettlementBucket
  items: SettlementItem[]
  /** 발주 합 (표시용 — 마진 식에는 쓰지 않는다) */
  ordered: number
  /** 실집행 합 */
  actual: number
  /** quote_amount − actual */
  markup: number
  /** quote_amount가 0이면 null */
  markup_rate: number | null
  over_budget: boolean
}

/**
 * 정산보드 전체. 금액은 전부 부가세 별도이며 **내부 전용**이다 —
 * 이 타입은 발주처 뷰·운영계획서·랜딩 어디에도 흘러가지 않는다(§4-24 R-S9).
 */
export interface SettlementBoardView {
  board: SettlementBoard
  /** 기준 견적 표시용 — 금액이 아니라 버전·제목만 */
  quote_label: string | null
  buckets: SettlementBucketView[]
  totals: SettlementTotals
}

// ── S-11 파트너 (v2.4 §21) ────────────────────────────────────────────

export interface PartnerTierInput {
  code: string
  name: string
  description?: string | null
  capacity?: number | null
  sort?: number
  // v2.6 §25.4 — 판매 상품 정의. price는 내부 전용(§25.8 비노출 가드 대상)
  session_slots?: number
  booth_included?: boolean
  staff_cap?: number | null
  price?: number | null
}

export interface PartnerInput {
  name: string
  tier_id?: UUID | null
  status?: PartnerStatus
  contract_amount?: number | null
  note?: string | null
  // v2.6 §25.4 — 부스 필드 그룹(HT-4·HT-7 매핑)
  booth_no?: string | null
  booth_size?: string | null
  booth_power?: string | null
  booth_internet?: boolean | null
}

/** 다음 마감(오늘 이후 미완료 partner_submit 태스크 중 가장 가까운 것) */
export interface PartnerNextDeadline {
  code: string
  title: string
  end_date: IsoDate | null
}

/** S-11 카드용 제출 진행 요약 — linked_deliverable의 상태 분포 */
export interface PartnerSubmissionCounts {
  requested: number
  pending_approval: number
  changes_requested: number
  approved_or_final: number
}

/** listPartners 응답 — 등급·최신 토큰·제출 진행을 한 번에 그릴 수 있는 형태 */
export interface PartnerWithProgress extends Partner {
  tier: PartnerTier | null
  /** 회수되지 않은 것 중 가장 최근 발급분 — 없으면 null */
  token: PartnerToken | null
  submission_counts: PartnerSubmissionCounts
  next_deadline: PartnerNextDeadline | null
}

export interface PartnerTokenIssueInput {
  contact_name: string
  contact_email: string
  /** 미지정 시 기본 만료 = 행사일+30일 (§6.3과 동일 원칙) */
  expires_at?: IsoDateTime
}

/** 파일 제출 또는 텍스트 제출 — 어느 쪽이든 versions 이력으로 통일해 남긴다(설계 결정, 3.15a) */
export type PartnerSubmissionInput = { file_name: string; note?: string } | { text: string }

export interface PartnerReviewInput {
  decision: 'approved' | 'changes_requested'
  /** 수정요청 시 필수(422, R-H4) */
  comment?: string
}

/** getPartnerPortal(token) 응답의 제출 항목 카드 — 마감(task.end_date) 기준으로 이미 정렬돼 있다 */
export interface PartnerPortalItem {
  task_code: string
  task_title: string
  deadline: IsoDate | null
  deliverable_id: UUID
  status: DeliverableStatus
  /** shared만(R-H6 — 발주처 규칙 재사용) */
  comments: Comment[]
  versions: Version[]
}

/** host_notice 태스크 — 파트너에게는 읽기 전용 안내 */
export interface PartnerPortalNotice {
  task_code: string
  task_title: string
  deadline: IsoDate | null
  note: string | null
}

/**
 * 파트너 제출 포털(`/p/{token}`) 응답. **contract_amount·정산·견적 금액 키, 타 파트너의
 * 어떤 행도 구조적으로 담을 수 없다** — partner_name·tier_name만 노출하고 Partner·PartnerTier
 * 엔티티 전체를 스프레드하지 않는다(§21.2 R-H2·R-H3).
 */
export interface PartnerPortalData {
  project_name: string
  event_date: IsoDate | null
  venue: string | null
  partner_name: string
  tier_name: string | null
  /** 마감별 그룹은 화면이 deadline으로 묶는다 — provider는 정렬만 보장 */
  submission_items: PartnerPortalItem[]
  notices: PartnerPortalNotice[]
  /** v2.4.1 §21.1 — 프로젝트에서 채워진다(값 없으면 null). 금액 키가 아니라 R-H3와 무관하고,
   *  타 파트너 데이터도 아니므로 격리 위반이 아니다(전 파트너 공통 안내) */
  guide_url: string | null
  contact_email: string | null
}

// ── 견적서 임포트 (v2.4 §22) ───────────────────────────────────────────

export interface QuoteImportConfirmInput {
  /** 확인 큐에서 사람이 수정한 최종 매핑 (비우면 기본 매핑을 그대로 확정) */
  mapping: SectionMapping[]
}

export interface QuoteImportDistributeInput {
  /** §16 매핑 재사용 — 새 행사 생성+상호 링크(임포트 견적은 is_final 불요) */
  project_prefill?: boolean
  /** 확정 견적만 가능 — 아니면 validation */
  settlement_base?: boolean
  /** s2·s3·s4 매핑 항목을 design·ops 보드에 시드(금액 키 없음) */
  board_seed?: boolean
}

export interface QuoteImportDistributeResult {
  quote_id: UUID
  /** project_prefill을 켜지 않았고 이미 연결된 행사도 없으면 null */
  project_id: UUID | null
  settlement_created: boolean
  deliverables_seeded: number
}

// ── 등록 구글 시트 연동 입출력 (v2.6 §24, S4) ──────────────────────────
// 화면(S4)은 이 6종만 본다. 시트에 쓰는 입력 타입은 존재하지 않는다(§24.6).

/** 위저드 1·2단계 — URL 확인 결과(문서 제목·수정 시각·공유 대상 계정·탭 목록) */
export interface SheetProbe {
  title: string
  /** 원본 시트 최종 수정 시각 */
  source_modified_at: IsoDateTime
  /** 뷰어로 초대할 서비스 계정 주소 (읽기 권한만 필요) */
  service_account: string
  tabs: SheetTabInfo[]
}

export interface SheetTabInfo {
  name: string
  rows: number
  columns: number
  headers: string[]
  /** 표 형태가 아니면 false — 명단으로 선택할 수 없다 */
  selectable: boolean
  /** 선택 불가 사유 등 보조 설명 (없으면 null) */
  note: string | null
}

/** 위저드 3단계 — 컬럼별 첫 행 미리보기. 연락처는 마스킹된 값만 내려온다(§24.1-5) */
export interface SheetColumnPreview {
  column: string
  /** 첫 데이터 행의 값 — masked=true면 이미 가려진 문자열이다(원문은 내려보내지 않는다) */
  sample: string
  masked: boolean
  /** 헤더 이름으로 추측한 기본 매핑 (없으면 null = 무시) */
  suggested: SheetMappedField | null
}

/** 위저드 완료 입력 — 필수 매핑은 name + email(없으면 422) */
export interface SheetConnectInput {
  url: string
  tab_name: string
  mapping: SheetColumnMapping[]
  /** 첫 행을 헤더로 사용할지 (false면 열 문자 A·B…를 컬럼명으로 쓴다) */
  first_row_is_header: boolean
}

/** 차이 표 1행 — 화면의 4열(구분 / 대상 / 현재 화면 / 시트 원본)과 1:1 */
export interface SheetDiffRow {
  kind: SheetDiffKind
  /** 대상 — '이름 · 소속' 형태의 사람 읽는 라벨 */
  subject: string
  /** 현재 화면(직전 스냅숏) 값 요약. added면 null(화면에 아직 없음) */
  current: string | null
  /** 시트 원본 값 요약. removed면 null(원본에서 사라짐) */
  source: string | null
  /** 화면에 이미 있는 행이면 그 참관객 id (added면 null) */
  attendee_id: UUID | null
  sheet_row_id: string
}

export interface SheetDiff {
  /** 현재 화면이 서 있는 스냅숏 시각 */
  snapshot_at: IsoDateTime | null
  /** 이 값을 그대로 applySheetDiff에 넘긴다 (§24.3 R-S1) */
  snapshot_version: number
  /** 원본 시트 최종 수정 시각 */
  source_modified_at: IsoDateTime | null
  rows: SheetDiffRow[]
  added: number
  changed: number
  removed: number
}

export interface SheetApplyResult {
  /** 반영된 총 건수 = added + changed + removed */
  applied: number
  added: number
  changed: number
  removed: number
  /** 반영 후 연결 상태(snapshot_version이 1 증가해 있다 — R-S3) */
  connection: SheetConnection
}

/**
 * 시트 기준 등록 통계 (KPI 4카드 + 보조 수치). 연결이 없는 행사에서는
 * getSheetRegistrationStats가 **null**을 돌려주고 화면은 기존 getRegistrationStats로 폴백한다.
 */
/** 3.17.1 T3 — 제외 목록의 한 행. 원본 값은 확인용 미리보기이므로 연락처는 화면이 마스킹한다. */
export interface SheetExcludedRow {
  sheet_row_id: string
  /** 시트에서 몇 번째 행인지 — 사용자가 시트로 건너가 고칠 때 쓰는 좌표 */
  row_number: number
  reason: SheetInvalidReason
  name: string
  org: string | null
  email: string | null
  phone: string | null
}

export interface SheetRegistrationStats {
  /** ① 신청 — removed를 뺀 명단 총계(상태 무관) */
  applied: number
  /** ② 확정 — sheet_status='confirmed' */
  confirmed: number
  /** ③ 취소 — sheet_status='cancelled' */
  cancelled: number
  /** ④ 체크인 — 앱 소유 필드 기준(removed 제외) */
  checked_in: number
  /** 원본 시트 행 수(무효 행 포함) */
  source_rows: number
  /** 중복·형식 오류로 적재하지 않은 행 수 */
  excluded: number
  /** confirmed ÷ applied (applied=0이면 0).
   *  3.17.1 T4 — RSVP '응답률'(발송 대비 응답)과 **분모가 달라** 이름을 나눴다. 화면 라벨도 '확정률'이다. */
  confirm_rate: number
  /** checked_in ÷ confirmed — 확정 기준(confirmed=0이면 0) */
  checkin_rate: number
  /** 취소 중 '확정 후 취소'였던 건수 */
  cancelled_after_confirm: number
  /** 이 통계가 서 있는 스냅숏 시각 */
  snapshot_at: IsoDateTime | null
  /** 3.17.1 T5 — 아직 확인·반영되지 않은 차이. 캡션 항등식의 항이다:
   *  `source_rows = applied + excluded + pending_added − pending_removed` */
  pending_added: number
  pending_removed: number
  /** 3.17.1 T3 — 적재되지 못한 행. 연락처는 화면에서 마스킹해 렌더한다 */
  excluded_rows: SheetExcludedRow[]
}
