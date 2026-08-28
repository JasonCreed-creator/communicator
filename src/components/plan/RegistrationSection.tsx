import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'
import type { RegistrationStats } from '../../types/views'

/** 06 등록 통계 — 응답률·등록수·체크인율 3종 타일 */
export default function RegistrationSection({
  stats,
  progress,
}: {
  stats: RegistrationStats
  progress: SectionProgressData
}) {
  return (
    <PlanSection number={PLAN_SECTION_META.registration.number} title={PLAN_SECTION_META.registration.title} progress={progress}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="응답률"
          value={`${Math.round(stats.response_rate * 100)}%`}
          sub={`발송 ${stats.rsvp_sent}건 중 ${stats.rsvp_accepted + stats.rsvp_declined}건 응답`}
        />
        <StatTile label="등록수" value={stats.attendee_total} sub={`RSVP 전체 ${stats.rsvp_total}건`} />
        <StatTile
          label="체크인율"
          value={`${Math.round(stats.checkin_rate * 100)}%`}
          sub={`체크인 ${stats.checked_in} / ${stats.attendee_total}`}
        />
      </div>
    </PlanSection>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-lg bg-canvas p-4">
      <div className="kpi-num">{value}</div>
      <div className="t-caption mt-1.5">{label}</div>
      <div className="mt-1 text-[11px] text-ink-cap">{sub}</div>
    </div>
  )
}
