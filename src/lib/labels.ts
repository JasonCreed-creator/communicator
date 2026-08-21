// UI 공용 어휘 — 상태·영역·역할의 한국어 라벨과 상태 뱃지 색.
// 내부(B)·발주처(C) 화면이 동일 매핑을 쓰도록 여기서만 정의한다.
// 상태 색은 시맨틱 고정: 색만으로 구분하지 않도록 항상 라벨 텍스트와 함께 쓴다.
import type { DeliverableArea, DeliverableStatus, InviteStatus, MemberRole } from '../types/enums'

export const STATUS_LABELS: Record<DeliverableStatus, string> = {
  draft: '초안',
  internal_review: '내부검토',
  pending_approval: '컨펌대기',
  changes_requested: '수정요청',
  approved: '승인',
  final: '확정',
}

/** 뱃지용 Tailwind 클래스 — 배경 연톤 + 진한 잉크 텍스트 (WCAG 대비 확보) */
export const STATUS_BADGE_CLASSES: Record<DeliverableStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  internal_review: 'bg-blue-50 text-blue-800',
  pending_approval: 'bg-amber-50 text-amber-800',
  changes_requested: 'bg-red-50 text-red-800',
  approved: 'bg-emerald-50 text-emerald-800',
  final: 'bg-emerald-600 text-white',
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
