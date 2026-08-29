// `/p/{token}` 제출 카드의 **수신 경로** 표기 — PM 접수 대장(S-11 PartnerDetailPanel)과 같은 어휘를
// 쓰기 위해 파생 규칙·라벨을 그대로 재사용한다(components/partner/partnerReceipt.ts, 읽기 전용 참조).
//
// 왜 표기를 맞추나: 파트너가 "8월 28일 포털로 냈다"고 말하는데 PM 대장에는 '미기록'으로 보이면
// 같은 사건을 두 이름으로 부르게 된다. 포털 제출(version.uploaded_by === null)만 '포털'로 확정하고,
// PM이 외부(메일 등)에서 받아 대리 등록한 분은 저장 필드가 없으므로 '경로 미기록'으로 정직하게 적는다.
import {
  RECEIPT_CHANNEL_LABELS,
  RECEIPT_NONE_LABEL,
  RECEIPT_UNRECORDED_LABEL,
  receiptOf,
} from '../partner/partnerReceipt'
import type { Version } from '../../types/entities'

export interface PortalReceipt {
  /** 예: '포털' · '미기록' */
  channelLabel: string
  receivedAt: string
}

/** 최신 버전 1건에서 수신 경로를 파생한다. 아직 아무것도 안 들어왔으면 null. */
export function portalReceiptOf(versions: readonly Version[]): PortalReceipt | null {
  // receiptOf는 접수자 표시명 조회용 맵을 받지만 포털 화면은 내부 접수자를 노출하지 않는다(빈 맵).
  const info = receiptOf(versions[0], new Map())
  if (!info || !info.receivedAt) return null
  return {
    channelLabel: info.derivedChannel
      ? RECEIPT_CHANNEL_LABELS[info.derivedChannel]
      : RECEIPT_UNRECORDED_LABEL,
    receivedAt: info.receivedAt,
  }
}

/** 아직 접수되지 않은 항목의 표기 — PM 대장과 동일 어휘 */
export const PORTAL_NOT_RECEIVED_LABEL = RECEIPT_NONE_LABEL
