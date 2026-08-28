// v2.6 §24.5 — 등록 보드의 **체크인 탭**(사용자 결정 A안 — 새 사이드바 라우트를 만들지 않는다).
//
// 현장 데스크용이므로 표 정본 조건 1을 그대로 따른다: **밀집 모드 금지 · 터치 타깃 44 고정**.
// 큰 검색창(이름·소속·뱃지번호)·큰 행·큰 [체크인] 버튼만 두고, 시트 소유 필드는 어디서도 편집하지 않는다.
import { useState } from 'react'
import EmptyState from '../internal/EmptyState'
import ErrorAlert from '../internal/ErrorAlert'
import FilterEmptyState from '../internal/FilterEmptyState'
import TableSkeleton from '../internal/TableSkeleton'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import { formatDateTime } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import { SHEET_STATUS_LABELS } from '../../types/enums'
import type { AttendeeWithRsvp } from '../../types/views'
import { matchesSearch } from './registrationFilters'

const provider = getDataProvider()

/** 현장 컨트롤 높이 — 44(h-11). btn-sm(28)은 이 탭에서 쓰지 않는다. */
const TOUCH = 'h-11'

export default function CheckinTab({
  attendees,
  loading,
  error,
  onChanged,
}: {
  attendees: AttendeeWithRsvp[] | null
  loading: boolean
  error: string | null
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')

  const list = attendees ?? []
  // 시트에서 제거된 행은 체크인 대상이 아니다(이력은 참관객 탭에 남는다)
  const active = list.filter((a) => a.sheet_status !== 'removed')
  const filtered = active.filter((a) => matchesSearch([a.name, a.org, a.badge_no], search))

  // '체크인 n / m' — 시트 연결 행사는 확정(confirmed) 기준, 그 밖에는 전체 명단 기준
  const hasSheetStatus = active.some((a) => a.sheet_status)
  const target = hasSheetStatus ? active.filter((a) => a.sheet_status === 'confirmed') : active
  const checkedIn = target.filter((a) => a.checked_in_at).length

  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />

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

      {loading && !attendees && <TableSkeleton rows={6} columns={2} />}

      {attendees && active.length === 0 && <EmptyState message="체크인할 참관객이 아직 없습니다." />}

      {attendees && active.length > 0 && filtered.length === 0 && (
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
            <CheckinRow key={a.id} attendee={a} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {filtered.length > 100 && (
        <p className="text-xs text-ink-cap">
          검색 결과 {filtered.length}명 중 100명까지 표시합니다 — 이름·소속·뱃지번호로 좁혀 주세요.
        </p>
      )}
    </div>
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
          <span className="ml-2 text-xs text-ink-cap">({SHEET_STATUS_LABELS[attendee.sheet_status]})</span>
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
