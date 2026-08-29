// 설계서 v1.4 §4 열거형과 1:1 (create type ... as enum)

export const MEMBER_ROLES = ['pm', 'design', 'ops', 'reg'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const DELIVERABLE_AREAS = ['design', 'ops', 'common'] as const
export type DeliverableArea = (typeof DELIVERABLE_AREAS)[number]

export const DELIVERABLE_STATUSES = [
  // v1.2: requested = PM 가이드 발행 상태 (산출물 없음)
  'requested',
  'draft',
  'internal_review',
  'pending_approval',
  'changes_requested',
  'approved',
  'final',
] as const
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

export const APPROVAL_DECISIONS = ['approved', 'changes_requested'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export const INVITE_STATUSES = ['none', 'sent', 'accepted', 'declined'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

export const ATTENDEE_CHANNELS = ['rsvp', 'onsite', 'import'] as const
export type AttendeeChannel = (typeof ATTENDEE_CHANNELS)[number]

export const COMMENT_VISIBILITIES = ['internal', 'shared'] as const
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number]

// v1.3: 행사 유형 — 일반형·모객형 (표시 계층 토글, 데이터 손실 없음)
export const EVENT_TYPES = ['general', 'recruiting'] as const
export type EventType = (typeof EVENT_TYPES)[number]

// v1.4: WBS 태스크 상태
export const WBS_STATUSES = ['todo', 'doing', 'done'] as const
export type WbsStatus = (typeof WBS_STATUSES)[number]

// v1.5: 프로젝트 상태 — 종료 행사는 읽기 전용·목록 접힘 (§4-1)
export const PROJECT_STATUSES = ['active', 'closed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

// v2.0: 전역 역할 (§4-1b profiles.app_role) — 견적 권한은 admin·sales
export const APP_ROLES = ['admin', 'sales', 'staff'] as const
export type AppRole = (typeof APP_ROLES)[number]

// v2.0: 견적 상태 (§4-18 — Configurator estimates.status 승계)
export const QUOTE_STATUSES = ['draft', 'proposed', 'accepted', 'archived', 'superseded'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

// v2.0: 컴플라이언스 카드 종류 (§4-17)
export const COMPLIANCE_KINDS = ['internal', 'client'] as const
export type ComplianceKind = (typeof COMPLIANCE_KINDS)[number]

// v2.1: 랜딩 페이지 상태 (§4-19) — closed = 신청 마감(페이지는 살아 있고 CTA만 잠김)
export const LANDING_STATUSES = ['draft', 'published', 'closed'] as const
export type LandingStatus = (typeof LANDING_STATUSES)[number]

// v2.1: 랜딩 섹션 블록 13종 (§4-20). 순서는 기본 조립 순서이기도 하다.
export const LANDING_SECTION_TYPES = [
  'hero',     // 타이틀·일시·장소·태그라인·CTA
  'lead',     // 포지셔닝 카피
  'speakers', // 연사 카드 그리드
  'agenda',   // 세션 타임테이블
  'tickets',  // 티켓 종류·가격
  'pitch',    // 가치 제안 카피
  'benefits', // 참가 혜택 그리드
  'zones',    // 존 운영 안내
  'sponsors', // 스폰서·참여 기업 로고
  'venue',    // 오시는 길 (주소·약도·길찾기)
  'faq',      // 자주 묻는 질문
  'form',     // 신청 폼
  'footer',   // 사업자 정보·법적 고지
] as const
export type LandingSectionType = (typeof LANDING_SECTION_TYPES)[number]

// v2.1: 랜딩 폼 필드 입력 종류 (§4-21). rank = 우선순위 정렬형(샘플의 파이프라인 고민 순위)
export const LANDING_FIELD_KINDS = ['text', 'email', 'tel', 'select', 'textarea', 'rank'] as const
export type LandingFieldKind = (typeof LANDING_FIELD_KINDS)[number]

// v2.1: 폼 제출 대상 — registration이면 등록(S4) Attendee로 유입, external이면 외부 URL로 보냄
export const LANDING_SUBMIT_TARGETS = ['registration', 'external'] as const
export type LandingSubmitTarget = (typeof LANDING_SUBMIT_TARGETS)[number]

// v2.4 §21: 주최형(파트너) 확장 — kind는 event_type과 직교하는 축(표시 계층 토글, R-H1)
export const PROJECT_KINDS = ['agency', 'host'] as const
export type ProjectKind = (typeof PROJECT_KINDS)[number]

export const PARTNER_STATUSES = ['active', 'withdrawn'] as const
export type PartnerStatus = (typeof PARTNER_STATUSES)[number]

/** wbs_tasks.direction — partner_submit는 파트너별 인스턴스 전개(§15.3) */
export const WBS_DIRECTIONS = ['partner_submit', 'host_notice', 'internal'] as const
export type WbsDirection = (typeof WBS_DIRECTIONS)[number]

// v2.4 §22: 견적서 임포트 — quotes.source
export const QUOTE_SOURCES = ['engine', 'imported'] as const
export type QuoteSource = (typeof QUOTE_SOURCES)[number]

/** quote_imports.status — detected(파싱 직후) → confirmed(매핑 확정) → distributed(분배 완료) */
export const QUOTE_IMPORT_STATUSES = ['detected', 'confirmed', 'distributed'] as const
export type QuoteImportStatus = (typeof QUOTE_IMPORT_STATUSES)[number]

/** §22.1 지원 서식 3형 — A 단가·수량형 / B 금액 단식 / C 패키지형 */
export const QUOTE_IMPORT_FORMATS = ['A', 'B', 'C'] as const
export type QuoteImportFormat = (typeof QUOTE_IMPORT_FORMATS)[number]

// v2.5 §23: 운영보드 재구성 — scenario_blocks.kind
export const SCENARIO_BLOCK_KINDS = ['mc', 'video', 'protocol', 'transition', 'custom'] as const
export type ScenarioBlockKind = (typeof SCENARIO_BLOCK_KINDS)[number]

// v2.5 §23: guide_sections.kind
export const GUIDE_SECTION_KINDS = ['zone', 'role', 'emergency', 'contacts', 'custom'] as const
export type GuideSectionKind = (typeof GUIDE_SECTION_KINDS)[number]

/**
 * v2.5 §23 — deliverables.category 정형 3종. "카테고리가 빌더를 결정한다" 원칙의 보드 레벨
 * 확장(§10.2) — 이 3종을 고르면 파일 업로드 대신 전용 빌더가 인라인으로 열린다.
 */
export const STRUCTURED_DOC_CATEGORIES = ['큐시트', '시나리오', '운영가이드'] as const
export type StructuredDocCategory = (typeof STRUCTURED_DOC_CATEGORIES)[number]

export function isStructuredDocCategory(category: string): category is StructuredDocCategory {
  return (STRUCTURED_DOC_CATEGORIES as readonly string[]).includes(category)
}

// ── v2.6 §24: 등록 구글 시트 연동 (S4) ─────────────────────────────────
/**
 * sheet_connections.state — 연결 카드 4상태(§24.5).
 * disconnected = 행 자체가 없거나 해제 직후 / connected = 원본과 일치 /
 * stale = 원본이 바뀜(감지만 됨, 반영 전) / revoked = 권한 끊김(마지막 스냅숏 유지)
 */
export const SHEET_CONNECTION_STATES = ['disconnected', 'connected', 'stale', 'revoked'] as const
export type SheetConnectionState = (typeof SHEET_CONNECTION_STATES)[number]

/** 차이 표의 구분 — 추가 / 변경 / 시트에서 제거(하드 삭제 금지, §24.1-4) */
// v2.6 §24 / 3.17.1 T3 — 시트 행이 앱에 적재되지 못한 사유.
// 이메일 필수 결정을 유지하는 대신 **탈락한 행을 화면에서 볼 수 있어야** 한다 —
// 그러지 않으면 시트엔 있는데 앱엔 없는 사람이 D-Day에 발견된다.
export const SHEET_INVALID_REASONS = ['no_email', 'duplicate_email', 'missing_required'] as const
export type SheetInvalidReason = (typeof SHEET_INVALID_REASONS)[number]

export const SHEET_INVALID_REASON_LABELS: Record<SheetInvalidReason, string> = {
  no_email: '이메일 없음',
  duplicate_email: '이메일 중복',
  missing_required: '필수 항목 누락',
}

export const SHEET_DIFF_KINDS = ['added', 'changed', 'removed'] as const
export type SheetDiffKind = (typeof SHEET_DIFF_KINDS)[number]

/** attendees.sheet_status — 신청·확정·취소·시트에서 제거됨. removed는 이력 보존 표시다 */
export const ATTENDEE_SHEET_STATUSES = ['applied', 'confirmed', 'cancelled', 'removed'] as const
export type AttendeeSheetStatus = (typeof ATTENDEE_SHEET_STATUSES)[number]

/** 매핑 가능한 등록 필드 — 이 7종이 '시트 소유' 필드다(앱에서 수정 불가, §24.1-3) */
export const SHEET_MAPPED_FIELDS = [
  'name',
  'org',
  'title',
  'email',
  'phone',
  'group_tag',
  'registered_at',
] as const
export type SheetMappedField = (typeof SHEET_MAPPED_FIELDS)[number]

/** 연결에 반드시 있어야 하는 매핑 — 없으면 connectSheet가 422(§24.4) */
export const SHEET_REQUIRED_FIELDS: readonly SheetMappedField[] = ['name', 'email']

/**
 * 시트 연동 표시 라벨 — 화면(S4)과 provider가 같은 문구를 쓰도록 여기에 한 벌만 둔다.
 * (기존 `src/lib/labels.ts`는 상태 머신 계열 정본이라 건드리지 않는다.)
 */
export const SHEET_STATE_LABELS: Record<SheetConnectionState, string> = {
  disconnected: '미연결',
  connected: '연결됨',
  stale: '갱신 있음',
  revoked: '권한 끊김',
}

export const SHEET_STATUS_LABELS: Record<AttendeeSheetStatus, string> = {
  applied: '신청',
  confirmed: '확정',
  cancelled: '취소',
  removed: '시트에서 제거됨',
}

export const SHEET_DIFF_KIND_LABELS: Record<SheetDiffKind, string> = {
  added: '추가',
  changed: '변경',
  removed: '제거',
}

export const SHEET_FIELD_LABELS: Record<SheetMappedField, string> = {
  name: '이름',
  org: '소속',
  title: '직함',
  email: '이메일',
  phone: '전화',
  group_tag: '구분',
  registered_at: '신청 일시',
}
