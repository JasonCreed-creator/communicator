// S-11 파트너 보드 — **접수 대장** 어휘 (시안 '파트너 보드.dc.html' · Phase 3.17b).
//
// 전제 변경: 파트너는 커뮤니케이터에 로그인하지 않는다는 전제로 보드를 PM 접수 대장으로 다시 짠다.
// 다만 사용자 결정으로 제출 포털(`/p`)은 **제출 기능 포함 현행 유지**다 — 그래서 이 화면은
// 포털을 대체하지 않고 같은 데이터의 PM 측 뷰다. 포털 제출분과 PM 접수분이 한 표에 공존한다.
//
// ★ 저장 계층은 손대지 않는다(표시 계층 전용):
//   · 수신 경로 — 포털 제출(version.uploaded_by === null)만 데이터에서 '포털'로 확정 파생한다.
//     그 외(내부 사용자가 올린 대리 등록분)는 경로를 저장하는 필드가 없으므로 **'미기록'**이
//     기본이고, PM이 화면에서 고른 값은 그 세션의 표시값일 뿐이다(새로고침하면 미기록으로 복귀).
//   · 접수자 — version.uploaded_by(내부 사용자)로만 파생한다. 포털 제출은 접수자가 없다.
// 금액 키(계약액 등)는 이 파일이 다루는 어떤 값에도 없다(§21.2 R-H3).
import type { Version } from '../../types/entities'
import type { PartnerSubmissionCounts } from '../../types/views'

export const RECEIPT_CHANNELS = ['portal', 'email', 'messenger', 'phone'] as const
export type ReceiptChannel = (typeof RECEIPT_CHANNELS)[number]

export const RECEIPT_CHANNEL_LABELS: Record<ReceiptChannel, string> = {
  portal: '포털',
  email: '메일',
  messenger: '메신저',
  phone: '유선',
}

/** 경로를 알 수 없을 때의 정직한 표기 — 추측해서 '메일'로 적지 않는다 */
export const RECEIPT_UNRECORDED_LABEL = '미기록'
/** 아직 아무것도 들어오지 않은 항목 */
export const RECEIPT_NONE_LABEL = '미접수'

export interface ReceiptInfo {
  /** 데이터에서 확정된 경로(포털)면 채워지고, 그 외는 null(=미기록 또는 PM의 표시용 선택) */
  derivedChannel: ReceiptChannel | null
  /** 내부 사용자가 접수 기록한 경우의 접수자 표시명 — 포털 제출이면 null */
  receiverName: string | null
  receivedAt: string | null
}

/**
 * 최신 버전 1건에서 수신 경로·접수자를 파생한다.
 * uploaded_by === null = 파트너가 포털로 직접 올린 제출(MockProvider.submitPartnerItem 관례).
 */
export function receiptOf(
  version: Version | undefined,
  memberNameById: Map<string, string>,
): ReceiptInfo | null {
  if (!version) return null
  if (version.uploaded_by === null) {
    return { derivedChannel: 'portal', receiverName: null, receivedAt: version.created_at }
  }
  return {
    derivedChannel: null,
    receiverName: memberNameById.get(version.uploaded_by) ?? RECEIPT_UNRECORDED_LABEL,
    receivedAt: version.created_at,
  }
}

export interface ReceiptProgress {
  received: number
  total: number
  ratio: number
}

/** 접수 진행 = (전체 제출 항목 − 아직 안 들어온 항목) / 전체. 수정요청 상태도 '받긴 받은' 것이다 */
export function receiptProgress(counts: PartnerSubmissionCounts): ReceiptProgress {
  const total =
    counts.requested + counts.pending_approval + counts.changes_requested + counts.approved_or_final
  const received = total - counts.requested
  return { received, total, ratio: total === 0 ? 0 : received / total }
}

/** 연락처 마스킹 — 화면·인쇄 어디에도 원문 주소를 노출하지 않는다(시안 좌측 담당 정보) */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const maskedLocal = local.slice(0, 2) + '*'.repeat(Math.max(2, local.length - 2))
  const parts = domain.split('.')
  const maskedDomain = parts
    .map((p, i) => (i === parts.length - 1 ? p : p.slice(0, 1) + '*'.repeat(Math.max(2, p.length - 1))))
    .join('.')
  return `${maskedLocal}@${maskedDomain}`
}

/** 요청 메일 — 앱이 발송하지 않는다. 사용자의 메일 클라이언트를 여는 mailto 링크만 만든다 */
export function buildMailto({
  to,
  bcc,
  subject,
  body,
}: {
  to?: string
  bcc?: string[]
  subject: string
  body: string
}): string {
  const params = new URLSearchParams()
  if (bcc && bcc.length > 0) params.set('bcc', bcc.join(','))
  params.set('subject', subject)
  params.set('body', body)
  return `mailto:${to ?? ''}?${params.toString()}`
}
