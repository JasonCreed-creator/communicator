// `/p/{token}` 주최 측 안내(host_notice) — 읽기 전용 목록.
import { formatDate } from '../../lib/labels'
import type { PartnerPortalNotice } from '../../types'
import EmptyState from '../internal/EmptyState'

export default function PartnerPortalNoticeList({ notices }: { notices: PartnerPortalNotice[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink-sub">주최 측 안내</h2>
      {notices.length === 0 ? (
        <div className="ui-card px-4">
          <EmptyState message="등록된 안내가 없습니다" />
        </div>
      ) : (
        <ul className="ui-card divide-y divide-border overflow-hidden">
          {notices.map((n) => (
            <li key={n.task_code} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{n.task_title}</p>
                {n.deadline && <span className="t-caption">{formatDate(n.deadline)}</span>}
              </div>
              {n.note && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-sub">{n.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
