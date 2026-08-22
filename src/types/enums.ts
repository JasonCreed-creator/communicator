// 설계서 v1.4 §4 열거형과 1:1 (create type ... as enum)

export const MEMBER_ROLES = ['pm', 'design', 'ops', 'reg'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const DELIVERABLE_AREAS = ['design', 'ops', 'common'] as const
export type DeliverableArea = (typeof DELIVERABLE_AREAS)[number]

export const DELIVERABLE_STATUSES = [
  // v1.2: requested = PM 지시 발행 상태 (산출물 없음)
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
