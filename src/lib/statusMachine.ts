// 컨펌 워크플로우 상태 머신 — 설계서 §5 전이표의 단일 정본.
// 모든 상태 전이는 이 모듈의 검증을 거친다(CLAUDE.md §6: transitionStatus 단일 경유, 전이표 밖 전이는 409).
import { ProviderError } from './errors'
import type { DeliverableStatus, MemberRole } from '../types/enums'

/** 전이가 일어나는 경로 — 같은 (from,to)라도 경로가 다르면 별개 규칙 */
export type TransitionVia =
  | 'status_patch' // PATCH /deliverables/{id}/status (내부 멤버 조작)
  | 'approval_request' // POST /deliverables/{id}/approvals (컨펌 발송)
  | 'client_decision' // POST /c/{token}/decisions
  | 'version_upload' // 새 버전 업로드 부수 효과
  | 'system' // approved → final 자동 전이

export interface TransitionRule {
  from: DeliverableStatus
  to: DeliverableStatus
  via: TransitionVia
  /** status_patch·approval_request 경로에서 허용되는 역할 (pm은 항상 포함) */
  roles?: MemberRole[]
  /** true면 코멘트 필수 (§5: PM 반려, 발주처 수정요청) */
  requires_comment?: boolean
}

/** 설계서 §5 전이표와 1:1 */
export const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: 'draft', to: 'internal_review', via: 'status_patch', roles: ['pm', 'design', 'ops'] },
  { from: 'internal_review', to: 'draft', via: 'status_patch', roles: ['pm'], requires_comment: true },
  { from: 'internal_review', to: 'pending_approval', via: 'approval_request', roles: ['pm'] },
  { from: 'pending_approval', to: 'approved', via: 'client_decision' },
  { from: 'pending_approval', to: 'changes_requested', via: 'client_decision', requires_comment: true },
  { from: 'approved', to: 'final', via: 'system' },
  { from: 'changes_requested', to: 'draft', via: 'version_upload' },
]

export function findTransitionRule(
  from: DeliverableStatus,
  to: DeliverableStatus,
  via: TransitionVia,
): TransitionRule | undefined {
  return TRANSITION_RULES.find((r) => r.from === from && r.to === to && r.via === via)
}

/** 전이표에 없는 전이는 409 conflict (CLAUDE.md §6) */
export function assertTransition(
  from: DeliverableStatus,
  to: DeliverableStatus,
  via: TransitionVia,
): TransitionRule {
  const rule = findTransitionRule(from, to, via)
  if (!rule) {
    throw new ProviderError('conflict', `허용되지 않는 상태 전이입니다: ${from} → ${to} (${via})`)
  }
  return rule
}

// ── 컨펌 발송 조건 — 미리보기 포맷 (§5: PDF·PNG·JPG) ────────────────
export const PREVIEW_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'] as const

export function fileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx < 0 ? '' : fileName.slice(idx + 1).toLowerCase()
}

export function isPreviewFileName(fileName: string): boolean {
  return (PREVIEW_EXTENSIONS as readonly string[]).includes(fileExtension(fileName))
}

// ── 파일명 규약 (§7.2): YYMMDD_{code}_{category}_{title}_v{n}.{ext} ──
export function buildVersionFileName(params: {
  date: Date
  project_code: string
  category: string
  title: string
  version_no: number
  original_file_name: string
}): string {
  const { date, project_code, category, title, version_no, original_file_name } = params
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const ext = fileExtension(original_file_name)
  const base = `${yy}${mm}${dd}_${project_code}_${category}_${title}_v${version_no}`
  return ext ? `${base}.${ext}` : base
}
