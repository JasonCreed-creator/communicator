// Slack 의뢰 카드 '확인했어요' 표식 → 화면 한 줄 (설계서 v2.12 §9 · Phase 6.1). 디자인 보드 '다음 행동'·항목 상세 '다음 단계'가 같이 쓴다.
// 확인은 상태가 아니라 표식이다 — 지금 상태에 맞는 의뢰만 보여 준다(제작 요청 = 아직 우리 손에 있는 동안 · 검토 요청 = 내부검토·파트너 검토 동안).
import type { DeliverableStatus } from '../types/enums'
import type { RequestAck } from '../types/views'

export interface RequestAckLine {
  /** ok = 확인함 · wait = 아직(하루 넘으면 강조) */
  tone: 'ok' | 'wait'
  text: string
  /** 요청 뒤 지난 날(확인 전만) */
  days: number | null
}

const WORK_STATUSES: readonly DeliverableStatus[] = ['requested', 'draft', 'changes_requested']
const REVIEW_STATUSES: readonly DeliverableStatus[] = ['internal_review', 'pending_approval']

function md(iso: string): string {
  const k = new Date(Date.parse(iso) + 9 * 3600 * 1000)
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`
}

export function requestAckLine(
  acks: readonly RequestAck[] | undefined,
  status: DeliverableStatus,
  opts: { hasPartner: boolean; now?: number } = { hasPartner: false },
): RequestAckLine | null {
  if (!acks?.length) return null
  // 파트너 항목의 컨펌대기 = 우리(PM) 검토 차례 — 대행형 컨펌대기는 발주처 차례라 PM 검토 요청이 아니다
  const kind: RequestAck['kind'] | null = WORK_STATUSES.includes(status)
    ? 'work'
    : REVIEW_STATUSES.includes(status) && (status !== 'pending_approval' || opts.hasPartner)
      ? 'review'
      : null
  if (!kind) return null
  const latest = [...acks].filter((a) => a.kind === kind).sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]
  if (!latest) return null
  const what = kind === 'work' ? '제작 요청' : '검토 요청'
  if (latest.acknowledged_at) {
    return { tone: 'ok', text: `Slack ${what} 확인함 · ${latest.acknowledged_by_name ?? '담당자'} ${md(latest.acknowledged_at)}`, days: null }
  }
  const days = Math.max(0, Math.floor(((opts.now ?? Date.now()) - Date.parse(latest.requested_at)) / 86_400_000))
  return { tone: 'wait', text: `Slack ${what} 아직 확인 안 함${days >= 1 ? ` · ${days}일째` : ''}`, days }
}
