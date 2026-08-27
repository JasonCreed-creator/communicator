// `/p/{token}` 주최 측 안내(host_notice) — 읽기 전용 목록.
// P6-④(3.15.1) — 마감 경과 기준으로 예정/완료를 나눠 보여준다(완료는 흐리게).
import { formatDate } from '../../lib/labels'
import type { PartnerPortalNotice } from '../../types'
import EmptyState from '../internal/EmptyState'
import { splitNoticesByTiming } from './deadlineGroups'

function NoticeRow({ notice }: { notice: PartnerPortalNotice }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{notice.task_title}</p>
        {notice.deadline && <span className="t-caption">{formatDate(notice.deadline)}</span>}
      </div>
      {notice.note && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-sub">{notice.note}</p>}
    </li>
  )
}

export default function PartnerPortalNoticeList({ notices }: { notices: PartnerPortalNotice[] }) {
  const { upcoming, done } = splitNoticesByTiming(notices)

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink-sub">주최 측 안내</h2>
      {notices.length === 0 ? (
        <div className="ui-card px-4">
          <EmptyState message="등록된 안내가 없습니다" />
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.length > 0 && (
            <div>
              {done.length > 0 && <p className="mb-1.5 text-xs font-medium text-ink-cap">예정</p>}
              <ul className="ui-card divide-y divide-border overflow-hidden">
                {upcoming.map((n) => (
                  <NoticeRow key={n.task_code} notice={n} />
                ))}
              </ul>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-cap">완료</p>
              <ul className="ui-card divide-y divide-border overflow-hidden opacity-60">
                {done.map((n) => (
                  <NoticeRow key={n.task_code} notice={n} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
