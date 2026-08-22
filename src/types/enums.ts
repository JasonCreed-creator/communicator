// 설계서 v1.2 §4 열거형과 1:1 (create type ... as enum)

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
