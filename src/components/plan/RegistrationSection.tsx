import PlanSection from './PlanSection'
import { type SectionProgressData } from './planSections'
import { formatDateTime } from '../../lib/labels'
import type { RegistrationStats } from '../../types/views'

/**
 * 06 등록 통계 — 응답률·등록수·체크인율 3종 타일(숫자 + 미니바).
 * 등록수 막대의 분모는 **보장 인원(guarantee_pax)** 이다 — 모객형에서만 존재하므로,
 * 보장 인원이 없는 일반형에서는 막대 없이 숫자만 보여준다(비율이 없는데 바를 그리면 거짓말이 된다).
 */
export default function RegistrationSection({
  stats,
  progress,
  guaranteePax,
  sheetSnapshotAt,
}: {
  stats: RegistrationStats
  progress: SectionProgressData
  /** 모객형 Project.guarantee_pax — 일반형·미입력이면 null */
  guaranteePax?: number | null
  /** 3.17.1 T4 — 시트 연결 중이면 등록 수치의 기준 시각. 미연결이면 null이라 캡션도 없다 */
  sheetSnapshotAt?: string | null
}) {
  const guarantee = guaranteePax != null && guaranteePax > 0 ? guaranteePax : null
  const attendeeRatio = guarantee ? stats.attendee_total / guarantee : null

  return (
    <PlanSection sectionKey="registration" progress={progress}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="응답률"
          value={`${Math.round(stats.response_rate * 100)}%`}
          ratio={stats.response_rate}
          sub={`발송 ${stats.rsvp_sent}건 중 ${stats.rsvp_accepted + stats.rsvp_declined}건 응답`}
        />
        <StatTile
          label="등록수"
          value={stats.attendee_total}
          ratio={attendeeRatio}
          sub={
            guarantee
              ? `보장 인원 ${guarantee}명 대비 ${Math.round((stats.attendee_total / guarantee) * 1000) / 10}%`
              : `RSVP 전체 ${stats.rsvp_total}건`
          }
          sub2={guarantee ? `RSVP 전체 ${stats.rsvp_total}건` : undefined}
        />
        <StatTile
          label="체크인율"
          value={`${Math.round(stats.checkin_rate * 100)}%`}
          ratio={stats.checkin_rate}
          sub={`체크인 ${stats.checked_in} / ${stats.attendee_total}`}
        />
      </div>
      {/* 3.17.1 T4 — 숫자의 출처와 기준 시각을 밝힌다. 응답률만 RSVP 기준이라 함께 적는다. */}
      {sheetSnapshotAt && (
        <p className="mt-3 text-[11px] text-ink-cap">
          등록수·체크인은 시트 기준 · 스냅숏 {formatDateTime(sheetSnapshotAt)} (응답률은 RSVP 기준)
        </p>
      )}
    </PlanSection>
  )
}

function StatTile({
  label,
  value,
  sub,
  sub2,
  ratio,
}: {
  label: string
  value: string | number
  sub: string
  sub2?: string
  /** 0~1. null이면 막대 없이 숫자만(분모가 없는 경우) */
  ratio: number | null
}) {
  const pct = ratio == null ? null : Math.min(100, Math.max(0, Math.round(ratio * 100)))
  return (
    <div className="rounded-lg bg-canvas p-4">
      <div className="kpi-num">{value}</div>
      <div className="t-caption mt-1.5">{label}</div>
      {pct != null && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
          <div
            className={`h-1.5 rounded-[3px] ${pct >= 100 ? 'bg-positive' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="mt-1.5 text-[11px] leading-snug text-ink-cap">{sub}</div>
      {sub2 && <div className="mt-0.5 text-[11px] text-ink-cap">{sub2}</div>}
    </div>
  )
}
