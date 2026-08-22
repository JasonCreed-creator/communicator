// UI 공용 어휘 — 상태·영역·역할의 한국어 라벨과 상태 뱃지 색.
// 내부(B)·발주처(C) 화면이 동일 매핑을 쓰도록 여기서만 정의한다.
// 상태 색은 시맨틱 고정: 색만으로 구분하지 않도록 항상 라벨 텍스트와 함께 쓴다.
import type {
  DeliverableArea,
  DeliverableStatus,
  EventType,
  InviteStatus,
  MemberRole,
} from '../types/enums'

export const STATUS_LABELS: Record<DeliverableStatus, string> = {
  requested: '가이드됨',
  draft: '초안',
  internal_review: '내부검토',
  pending_approval: '컨펌대기',
  changes_requested: '수정요청',
  approved: '승인',
  final: '확정',
}

/** 뱃지용 Tailwind 클래스 — 디자인지시서 v1 §3 (틴트 bg / 텍스트). pending_approval의 좌측
 *  도트는 StatusBadge·StatusPill 컴포넌트가 렌더한다(클래스만으로 표현 불가). */
export const STATUS_BADGE_CLASSES: Record<DeliverableStatus, string> = {
  requested: 'bg-accent-tint text-accent-deep',
  draft: 'bg-track text-ink-sub',
  internal_review: 'bg-steel-tint text-steel',
  pending_approval: 'bg-accent-tint text-accent-deep',
  changes_requested: 'bg-negative-tint text-negative',
  approved: 'bg-positive-tint text-positive',
  final: 'bg-positive-tint text-positive',
}

/** S2 보드 항목 카드 좌측 상태 스트립(3px) — §6 S2: 목록만 봐도 상태 분포가 보이게.
 *  뱃지 틴트의 원색 계열을 쓰되 draft만 중립(웜 보더 진한 값)으로 가라앉힌다. */
export const STATUS_STRIP_CLASSES: Record<DeliverableStatus, string> = {
  requested: 'bg-accent',
  draft: 'bg-border-strong',
  internal_review: 'bg-steel',
  pending_approval: 'bg-accent',
  changes_requested: 'bg-negative',
  approved: 'bg-positive',
  final: 'bg-positive',
}

/** §3 간트·담당 역할 컬러 — pm #4A463F(brown) · design #EB6F2A(accent) · ops #476580(steel) ·
 *  reg #F3B48A(role-reg). R&R 카드 좌측 보더·간트 바에 동일 적용. */
export const ROLE_BAR_CLASSES: Record<MemberRole, string> = {
  pm: 'bg-brown',
  design: 'bg-accent',
  ops: 'bg-steel',
  reg: 'bg-role-reg',
}

export const ROLE_BORDER_CLASSES: Record<MemberRole, string> = {
  pm: 'border-l-brown',
  design: 'border-l-accent',
  ops: 'border-l-steel',
  reg: 'border-l-role-reg',
}

export const ROLE_TEXT_CLASSES: Record<MemberRole, string> = {
  pm: 'text-brown',
  design: 'text-accent-deep',
  ops: 'text-steel',
  reg: 'text-accent-deep',
}

export const AREA_LABELS: Record<DeliverableArea, string> = {
  design: '디자인',
  ops: '운영',
  common: '공통',
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  pm: 'PM',
  design: '디자인',
  ops: '운영',
  reg: '등록',
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  general: '일반형',
  recruiting: '모객형',
}

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  none: '미발송',
  sent: '발송됨',
  accepted: '참석',
  declined: '불참',
}

/** YYYY-MM-DD → 'M월 D일' */
export function formatDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

/** ISO datetime → 'M월 D일 HH:mm' (로컬 시간) */
export function formatDateTime(isoDateTime: string): string {
  const d = new Date(isoDateTime)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`
}

/** 기준일 대비 D-day 라벨: 'D-7' | 'D-day' | 'D+3' */
export function ddayLabel(isoDate: string, today: Date = new Date()): string {
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === 0) return 'D-day'
  return diff > 0 ? `D-${diff}` : `D+${-diff}`
}
