import { formatDateTime } from '../../lib/labels'

/** 시트 스냅숏 기준 시각 배지 — v2.6 §24.5.
 *  등록 보드(S4)와 현장 체크인(S-12)이 **같은 값을 같은 형식으로** 표기해야 한다.
 *  두 화면을 나란히 띄운 담당자가 서로 같은 시점을 보고 있는지 확인하는 유일한 단서다(3.17.1 T1-4). */
export default function SnapshotBadge({ snapshotAt }: { snapshotAt: string | null }) {
  if (!snapshotAt) return null
  return (
    <span
      data-testid="snapshot-badge"
      data-snapshot-at={snapshotAt}
      className="ui-badge inline-flex shrink-0 items-center rounded-full bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel"
    >
      스냅숏 {formatDateTime(snapshotAt)}
    </span>
  )
}
