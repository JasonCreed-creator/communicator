// 화면(S1~S8)·API 계약(설계서 §8)이 요구하는 뷰 모델과 입력 타입.
// 엔티티(§4)와 달리 여기는 조합 형태라 프론트 편의에 맞춰 정의하되, 필드명은 snake_case로 통일한다.
import type {
  ActivityLogEntry,
  Approval,
  Attendee,
  Comment,
  Deliverable,
  IsoDate,
  IsoDateTime,
  Milestone,
  Project,
  UUID,
  Version,
} from './entities'
import type {
  ApprovalDecision,
  CommentVisibility,
  DeliverableArea,
  DeliverableStatus,
  MemberRole,
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
