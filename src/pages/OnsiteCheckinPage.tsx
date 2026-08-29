// S-12 현장 체크인 — v2.6 §10 / 설계서 §24.5.
//
// **사용자 결정 B안**: 등록 보드의 탭이 아니라 사이드바의 별도 화면이다(3.17.1 T1에서 A안 구현을 복원).
// 이유는 레이아웃이 아니라 권한이다 — 현장 접수 담당(협력사·단기 인력)에게 등록 보드를 열면
// 전체 명단 · 시트 URL · 연결 설정 · 내보내기가 함께 열린다. 이 화면에는 그 경로가 **존재하지 않는다**.
//
// 현장 데스크용이므로 표 정본 조건 1을 그대로 따른다: **밀집 모드 금지 · 터치 타깃 44 고정**.
// 큰 검색창(이름·소속·뱃지번호)·큰 행·큰 [체크인] 버튼만 두고, 시트 소유 필드는 어디서도 편집하지 않는다.
// 전용 롤 onsite는 Phase 5 — 지금은 pm·ops·reg가 열람·토글한다.
import { useState } from 'react'
import PageHeader from '../components/internal/PageHeader'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import FilterEmptyState from '../components/internal/FilterEmptyState'
import TableSkeleton from '../components/internal/TableSkeleton'
import { LevelBadge } from '../components/internal/StatusBadge'
import SnapshotBadge from '../components/registration/SnapshotBadge'
import { matchesSearch } from '../components/registration/registrationFilters'
import { useAsync, useMutation } from '../hooks/useAsync'
import { useProject } from '../context/ProjectContext'
import { formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import { SHEET_STATUS_LABELS } from '../types/enums'
import type { AttendeeWithRsvp } from '../types/views'

const provider = getDataProvider()

/** 현장 컨트롤 높이 — 44(h-11). btn-sm(28)은 이 화면에서 쓰지 않는다. */
const TOUCH = 'h-11'

export default function OnsiteCheckinPage() {
  const { projectId } = useProject()
  const [search, setSearch] = useState('')

  const attendees = useAsync(() => provider.listAttendees(projectId), [projectId])
  // 등록 보드와 같은 스냅숏을 보고 있는지 확인할 수 있도록 연결의 기준 시각만 읽는다.
  const connection = useAsync(() => provider.getSheetConnection(projectId), [projectId])

  const list = attendees.data ?? []
  // 시트에서 제거된 행은 체크인 대상이 아니다(이력은 등록 보드 참관객 표에 남는다)
  const active = list.filter((a) => a.sheet_status !== 'removed')
  const filtered = active.filter((a) => matchesSearch([a.name, a.org, a.badge_no], search))

  // '체크인 n / m' — 시트 연결 행사는 확정(confirmed) 기준, 그 밖에는 전체 명단 기준
  const hasSheetStatus = active.some((a) => a.sheet_status)
  const target = hasSheetStatus ? active.filter((a) => a.sheet_status === 'confirmed') : active
  const checkedIn = target.filter((a) => a.checked_in_at).length

  return (
    <section className="space-y-4 p-6">
      <PageHeader
        caption="S-12 · 현장 체크인"
        title="현장 체크인"
        action={<SnapshotBadge snapshotAt={connection.data?.snapshot_at ?? null} />}
      />

      <ErrorAlert message={attendees.error} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 · 소속 · 뱃지번호 검색"
          aria-label="이름 · 소속 · 뱃지번호 검색"
          className={`ui-input ${TOUCH} min-w-0 flex-1 text-base sm:max-w-md`}
        />
        <LevelBadge level="attention" label={`체크인 ${checkedIn} / ${target.length}`} />
      </div>

      {attendees.loading && !attendees.data && <TableSkeleton rows={6} columns={2} />}

      {attendees.data && active.length === 0 && (
        <EmptyState message="체크인할 참관객이 아직 없습니다." />
      )}

      {attendees.data && active.length > 0 && filtered.length === 0 && (
        <FilterEmptyState
          totalCount={active.length}
          filters={[{ label: '검색', value: search }]}
          onReset={() => setSearch('')}
          unit="명"
        />
      )}

      {filtered.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {filtered.slice(0, 100).map((a) => (
            <CheckinRow key={a.id} attendee={a} onChanged={attendees.reload} />
          ))}
        </ul>
      )}
      {filtered.length > 100 && (
        <p className="text-xs text-ink-cap">
          검색 결과 {filtered.length}명 중 100명까지 표시합니다 — 이름·소속·뱃지번호로 좁혀 주세요.
        </p>
      )}
    </section>
  )
}

function CheckinRow({ attendee, onChanged }: { attendee: AttendeeWithRsvp; onChanged: () => void }) {
  const toggle = useMutation(() => provider.toggleCheckin(attendee.id))

  const handleToggle = async () => {
    const result = await toggle.run()
    if (result) onChanged()
  }

  const meta = [attendee.org, attendee.group_tag, attendee.badge_no].filter(Boolean).join(' · ')

  return (
    <li className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">
        <span className="text-base text-ink">{attendee.name}</span>
        {meta && <span className="ml-2 text-sm text-ink-cap">· {meta}</span>}
        {attendee.sheet_status && (
          <span className="ml-2 text-xs text-ink-cap">
            ({SHEET_STATUS_LABELS[attendee.sheet_status]})
          </span>
        )}
        <ErrorAlert message={toggle.error} />
      </span>
      {attendee.checked_in_at ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-ink-sub">완료 · {formatDateTime(attendee.checked_in_at)}</span>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggle.pending}
            className={`btn btn-ghost ${TOUCH}`}
          >
            체크인 취소
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggle.pending}
          className={`btn btn-ghost ${TOUCH} shrink-0`}
        >
          체크인
        </button>
      )}
    </li>
  )
}
