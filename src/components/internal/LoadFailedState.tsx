import type { ReactNode } from 'react'
import ErrorAlert from './ErrorAlert'
import { formatDateTime } from '../../lib/labels'

/** 빈 상태 ⑤ 로드 실패 — 패턴 기준 시트 §06.
 *  ErrorAlert 원문을 그대로 노출하고(침묵 금지) 재시도를 붙인다.
 *  직전 스냅숏이 있으면 지우지 말고 **기준 시각을 명기해** 함께 보여준다. */
export default function LoadFailedState({
  message,
  onRetry,
  snapshotAt,
  children,
}: {
  message: string
  onRetry: () => void
  /** 직전에 성공적으로 받아둔 데이터의 기준 시각(ISO). 있으면 아래 children을 그 스냅숏으로 렌더한다. */
  snapshotAt?: string | null
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <ErrorAlert message={message} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={onRetry} className="btn btn-ghost btn-sm">
          재시도
        </button>
        {snapshotAt && (
          <span className="text-xs text-ink-cap">
            아래는 {formatDateTime(snapshotAt)} 기준 직전 화면입니다 — 최신 값이 아닙니다.
          </span>
        )}
      </div>
      {snapshotAt && children != null && (
        <div className="rounded-lg border border-dashed border-border-strong p-3 opacity-70">
          {children}
        </div>
      )}
    </div>
  )
}
