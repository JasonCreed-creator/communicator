import type { ReactNode } from 'react'

/** 빈 상태 ④ 권한 없음 — 패턴 기준 시트 §06.
 *  역할 게이트에 막힌 화면은 **메뉴에서 지우지 않고**(§10 진입점 원칙) steel 배너로
 *  '왜 막혔는지 + 어떻게 요청하는지'를 보여준다. */
export default function PermissionNotice({
  reason,
  howToRequest,
  action,
}: {
  /** 막힌 이유 — 어떤 권한이 없어서인지 */
  reason: string
  /** 요청 경로 — 누구에게 무엇을 요청하면 열리는지 */
  howToRequest: string
  action?: ReactNode
}) {
  return (
    <div
      role="note"
      className="rounded-lg border border-steel/40 bg-steel-tint px-4 py-3 text-sm leading-relaxed text-steel"
    >
      <p className="font-medium">{reason}</p>
      <p className="mt-1 text-ink-sub">{howToRequest}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
