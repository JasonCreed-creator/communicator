// S-11 마감 타임라인 스트립 (§10.1 / 시안 '파트너 보드.dc.html') — 주최형 WBS 태스크를 code
// 단위로 묶어 end_date 순으로 나열. 방향 뱃지(WBS_DIRECTION_LABELS) + 지난/이번/다가오는 3단.
// 접수 대장 전환(Phase 3.17b)으로 건수 문구가 '제출'에서 **'접수'**로 바뀐다. 금액은 다루지 않는다.
// 168px 카드 · overflow-x:auto(클립 금지, §07).
import DdayBadge from '../internal/DdayBadge'
import { formatDate, WBS_DIRECTION_LABELS } from '../../lib/labels'
import {
  currentSubmitGroup,
  deadlineTiming,
  type HostTaskGroup,
} from './partnerBoardUtils'

const DIRECTION_DOT: Record<HostTaskGroup['direction'], string> = {
  partner_submit: 'bg-accent',
  host_notice: 'bg-steel',
  internal: 'bg-ink-cap',
}

export default function PartnerDeadlineTimeline({ groups }: { groups: HostTaskGroup[] }) {
  const current = currentSubmitGroup(groups)

  if (groups.length === 0) {
    return <p className="text-sm text-ink-cap">전개된 주최형 태스크가 없습니다.</p>
  }

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-2 pb-1">
        {groups.map((g) => {
          const timing = deadlineTiming(g, current)
          return (
            <li
              key={g.code}
              className={`w-[168px] shrink-0 rounded-[10px] border p-3 ${
                timing === 'current'
                  ? 'border-accent bg-accent-tint'
                  : timing === 'past'
                    ? 'border-border bg-canvas'
                    : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-cap">
                  <span aria-hidden className={`size-1.5 rounded-full ${DIRECTION_DOT[g.direction]}`} />
                  {WBS_DIRECTION_LABELS[g.direction]}
                </span>
                {timing === 'current' && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    이번 마감
                  </span>
                )}
                {timing === 'past' && (
                  <span className="text-[10px] font-medium text-ink-cap">지난 마감</span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs font-medium text-ink" title={g.title}>
                <span className="mr-1 font-mono text-ink-cap">{g.code}</span>
                {g.title}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                {g.end_date ? (
                  <>
                    <span className="text-[11px] text-ink-sub">{formatDate(g.end_date)}</span>
                    <DdayBadge isoDate={g.end_date} />
                  </>
                ) : (
                  <span className="text-[11px] text-ink-cap">일정 미정</span>
                )}
              </div>
              {g.direction === 'partner_submit' && (
                <p className="mt-1.5 text-[11px] text-ink-cap">
                  접수 {g.submitted}/{g.total}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
