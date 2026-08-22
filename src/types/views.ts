// 화면(S1~S9)·API 계약(설계서 §8)이 요구하는 뷰 모델과 입력 타입.
// 엔티티(§4)와 달리 여기는 조합 형태라 프론트 편의에 맞춰 정의하되, 필드명은 snake_case로 통일한다.
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
  ProgramSession,
  Project,
  UUID,
  Version,
  WbsTask,
} from './entities'
import type {
  ApprovalDecision,
  CommentVisibility,
  DeliverableArea,
  DeliverableStatus,
  EventType,
  MemberRole,
  WbsStatus,
} from './enums'

// ── 사용자 (auth.users의 앱 레벨 투영) ─────────────────────────────
export interface UserRef {
  id: UUID
  name: string
  email: string | null
}

export interface CurrentUser extends UserRef {
  role: MemberRole
  project_id: UUID
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
  /** v1.2 — 현재 사용자가 담당자인 requested 항목(받은 지시), 마감순 */
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
  // v1.2 지시 발행 (§8 POST /deliverables): brief·스펙 포함 시 status='requested', pm 전용
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
  event_date?: IsoDate | null
  event_type?: EventType
}

/** 온보딩 완료 상태 — 설계서 v1.4.1 §8 GET /projects/{id}/onboarding.
 *  정본은 projects.onboarded_at 컬럼: completed = onboarded_at !== null (파생값) */
export interface OnboardingStatus {
  completed: boolean
  onboarded_at: IsoDateTime | null
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

/** ④제작물 리스트 — design 항목의 지시 스펙 표+최신 시안·상태 */
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

export interface PlanData {
  project: Project
  /** sort_order 순 */
  program_sessions: ProgramSession[]
  /** 큐시트 항목이 없으면 null */
  cuesheet: PlanCuesheet | null
  zones: PlanZoneItem[]
  production_items: PlanProductionItem[]
  registration_stats: RegistrationStats
  /** 기한순 */
  milestones: Milestone[]
  section_progress: PlanSectionProgress[]
}
