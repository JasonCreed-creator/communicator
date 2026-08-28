// UI 공용 어휘 — 상태·영역·역할의 한국어 라벨과 상태 뱃지 색.
// 내부(B)·발주처(C) 화면이 동일 매핑을 쓰도록 여기서만 정의한다.
// 상태 색은 시맨틱 고정: 색만으로 구분하지 않도록 항상 라벨 텍스트와 함께 쓴다.
import type {
  DeliverableArea,
  DeliverableStatus,
  EventType,
  GuideSectionKind,
  InviteStatus,
  MemberRole,
  PartnerStatus,
  ProjectKind,
  ScenarioBlockKind,
  WbsDirection,
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

/** v2.4 §21 §5.1 — 주최형 화면에서 쓰는 상태 표기(기존 STATUS_LABELS와 값·전이는 동일, 문구만 다름) */
export const HOST_STATUS_LABELS: Record<DeliverableStatus, string> = {
  requested: '제출 요청됨',
  draft: '초안',
  internal_review: '내부검토',
  pending_approval: '검토중',
  changes_requested: '수정요청',
  approved: '승인됨',
  final: '승인됨',
}

/** v2.4 §15.3 — WBS 태스크 방향 뱃지 문구 */
export const WBS_DIRECTION_LABELS: Record<WbsDirection, string> = {
  partner_submit: '▲ 파트너 제출',
  host_notice: '▼ 주최 통지',
  internal: '■ 내부',
}

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  agency: '대행형',
  host: '주최형',
}

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  active: '참여 중',
  withdrawn: '철회',
}

/** v2.5 §23 — 시나리오 빌더 진행 블록 구분 칩 */
export const SCENARIO_KIND_LABELS: Record<ScenarioBlockKind, string> = {
  mc: 'MC',
  video: '영상',
  protocol: '의전',
  transition: '전환',
  custom: '커스텀',
}

/** 3.16.4 화면 B — 구분 배지 컬러(tokens.css 토큰 조합만 — 임의 팔레트 금지).
 *  mc=steel 틴트(목업 파랑 그대로), video=steel 솔리드(목업 보라 — 토큰에 보라가 없어 같은
 *  한색 계열의 진한 단계로 구분), transition=accent 틴트(목업 앰버 — 앱의 대기/주의 관례),
 *  protocol·custom=중립(목업 기본 칩). */
export const SCENARIO_KIND_CHIP_CLASSES: Record<ScenarioBlockKind, string> = {
  mc: 'bg-steel-tint text-steel',
  video: 'bg-steel text-card',
  protocol: 'bg-track text-ink-sub',
  transition: 'bg-accent-tint text-accent-deep',
  custom: 'bg-track text-ink-sub',
}

/** v2.5 §23 — 운영가이드 빌더 섹션 카드 4종 라벨 */
export const GUIDE_KIND_LABELS: Record<GuideSectionKind, string> = {
  zone: '존별 운영',
  role: '역할별 체크리스트',
  emergency: '비상 대응',
  contacts: '연락망/비품',
  custom: '커스텀',
}

/** v2.5 §23 — 운영보드 홈 유형 카드 4종 라벨(정형 3종 + 기타 제작물) */
export const OPS_DOC_CARD_LABELS = {
  cuesheet: '큐시트',
  scenario: '시나리오',
  guide: '운영가이드',
  other: '기타 제작물',
} as const

/** P11(3.16.2) 유형 카드 아이콘·설명 — 시각 정본 = 목업 화면 A(문구 그대로) */
export const OPS_DOC_CARD_ICONS = {
  cuesheet: '🎛',
  scenario: '🎤',
  guide: '📒',
  other: '📁',
} as const

export const OPS_DOC_CARD_BLURBS = {
  cuesheet: '콘솔 오퍼용 3채널 큐 (음향·조명·영상)',
  scenario: 'MC·진행 대본 — 프로그램표에서 자동 뼈대',
  guide: '존·역할별 지침 + 비상 대응 (스태프 배포용)',
  other: '파일 업로드형 항목 (기존 방식)',
} as const

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
