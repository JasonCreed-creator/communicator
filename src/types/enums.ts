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
