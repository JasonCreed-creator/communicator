import { useCallback, useState, type ChangeEvent } from 'react'
import Card from '../components/internal/Card'
import DensityToggle from '../components/internal/DensityToggle'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import StatTile from '../components/internal/StatTile'
import TableSkeleton from '../components/internal/TableSkeleton'
import { LevelBadge } from '../components/internal/StatusBadge'
import { downloadCsv, parseCsv, toCsv } from '../components/internal/csvUtils'
import PaginationBar from '../components/registration/PaginationBar'
import RegistrationSearchBar from '../components/registration/RegistrationSearchBar'
import SheetConnectionCard from '../components/registration/SheetConnectionCard'
import InfoTip from '../components/internal/InfoTip'
import SnapshotBadge from '../components/registration/SnapshotBadge'
import SheetExcludedDialog from '../components/registration/SheetExcludedDialog'
import { maskedContact, percent1 } from '../components/registration/sheetFormat'
import { xlsxToTable } from '../components/registration/registrationXlsx'
import {
  filterAttendees,
  filterRsvps,
  paginate,
  type CheckinFilter,
  type RsvpStatusFilter,
} from '../components/registration/registrationFilters'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { INVITE_STATUS_LABELS, formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { RsvpContact } from '../types/entities'
import {
  SHEET_STATUS_LABELS,
  type AttendeeChannel,
  type AttendeeSheetStatus,
  type InviteStatus,
} from '../types/enums'
import type { AttendeeWithRsvp, CsvImportRow, RegistrationStats } from '../types/views'

const provider = getDataProvider()

const CHANNEL_LABELS: Record<AttendeeChannel, string> = {
  rsvp: 'RSVP 전환',
  onsite: '현장 등록',
  import: '가져오기',
}

/** 신청 상태 배지 — 디자인지시서 §7-1.1 시트 계열 매핑(제거됨은 중립) */
const SHEET_STATUS_LEVEL: Record<AttendeeSheetStatus, 'neutral' | 'progress' | 'positive' | 'blocked'> = {
  applied: 'progress',
  confirmed: 'positive',
  cancelled: 'blocked',
  removed: 'neutral',
}

// v2.6 §10 — 체크인 조작은 S-12 현장 체크인(/checkin) 한 곳으로 단일화한다(3.17.1 T1).
// 여기서는 체크인 **상태만** 읽는다.
type Tab = 'rsvp' | 'attendees' | 'stats'
const TABS: { id: Tab; label: string }[] = [
  { id: 'rsvp', label: 'RSVP' },
  { id: 'attendees', label: '참관객' },
  { id: 'stats', label: '통계' },
]

export default function RegistrationPage() {
  const { projectId } = useProject()
  const [tab, setTab] = useState<Tab>('rsvp')
  // 시트 반영·연결 변경이 일어나면 이 값을 올려 연결·명단·KPI를 한꺼번에 다시 읽는다.
  const [syncTick, setSyncTick] = useState(0)
  const bumpSync = useCallback(() => setSyncTick((t) => t + 1), [])

  const project = useAsync(() => provider.getProject(projectId), [projectId])
  // v1.3 유형 토글(§3): general(일반형)이면 RSVP 파이프라인은 표시 계층에서만 숨긴다 — 데이터는 보존.
  const isGeneral = project.data?.event_type === 'general'
  const visibleTabs = isGeneral ? TABS.filter((t) => t.id !== 'rsvp') : TABS
  const activeTab: Tab = isGeneral && tab === 'rsvp' ? 'attendees' : tab

  // v2.6 §24 — 시트 연결. 연결이 없으면 null이고 화면은 기존 통계로 폴백한다.
  const connection = useAsync(() => provider.getSheetConnection(projectId), [projectId, syncTick])
  const sheetStats = useAsync(
    () => provider.getSheetRegistrationStats(projectId),
    [projectId, syncTick, activeTab],
  )
  // 3.9.1 P3 — §6 S4: 상단 통계 카드 상시 노출. 탭 전환마다 재조회해 체크인 등 변경을 따라간다.
  const stats = useAsync(() => provider.getRegistrationStats(projectId), [projectId, activeTab, syncTick])
  const attendees = useAsync(() => provider.listAttendees(projectId), [projectId, syncTick])

  const sheetConnected = connection.data !== null
  // 3.17.1 T3 — 제외 건수는 클릭 가능한 진입점이다(숫자만 두면 탈락한 사람이 D-Day에 발견된다)
  const [excludedOpen, setExcludedOpen] = useState(false)

  return (
    <section className="space-y-6 p-6">
      <PageHeader caption="S4 · 등록" title="등록" />

      {isGeneral && (
        <div className="rounded-md border border-steel/20 bg-steel-tint px-3 py-2 text-xs text-steel">
          일반형 행사 — 모객(RSVP) 모듈은 숨김 처리됨(데이터는 보존)
        </div>
      )}

      {/* 연결 카드 — 탭 위 페이지 상단에 상시 노출(§24.5) */}
      <SheetConnectionCard
        projectId={projectId}
        connection={connection.data}
        loading={connection.loading}
        error={connection.error}
        onChanged={bumpSync}
      />

      {/* 상단 KPI — 연결이 있으면 시트 기준 4카드, 없으면 기존 3카드로 폴백 */}
      {sheetStats.data ? (
        <div data-testid="sheet-kpi" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="신청"
            value={sheetStats.data.applied}
            /* 3.17.1 T5 — 캡션이 스스로 설명해야 한다. 항등식의 모든 항을 드러낸다:
               시트 행 = 신청 + 제외 + 반영 대기 추가 − 반영 대기 제거 */
            support={
              <span data-testid="applied-support" className="flex flex-wrap items-center gap-x-1.5">
                <span>시트 행 {sheetStats.data.source_rows}</span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => setExcludedOpen(true)}
                  className="underline underline-offset-2 hover:text-accent-deep"
                >
                  제외 {sheetStats.data.excluded}
                </button>
                <span aria-hidden>·</span>
                <span>
                  반영 대기 +{sheetStats.data.pending_added} / −{sheetStats.data.pending_removed}
                </span>
                <InfoTip text="시트 행 = 신청 + 제외 + 반영 대기 추가 − 반영 대기 제거. '반영 대기'는 아직 차이를 확인하지 않아 화면에 들어오지 않은 행입니다." />
              </span>
            }
          />
          <StatTile
            label="확정"
            value={sheetStats.data.confirmed}
            /* 3.17.1 T4 — RSVP '응답률'(발송 대비 응답)과 분모가 달라 이름을 나눴다(확정 ÷ 신청) */
            support={`확정률 ${percent1(sheetStats.data.confirm_rate)}%`}
          />
          <StatTile
            label="취소"
            value={sheetStats.data.cancelled}
            support={`확정 후 취소 ${sheetStats.data.cancelled_after_confirm}`}
          />
          <StatTile
            label="체크인"
            value={sheetStats.data.checked_in}
            tone="accent"
            support={`체크인율 ${percent1(sheetStats.data.checkin_rate)}% · 확정 기준`}
          />
        </div>
      ) : (
        stats.data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {isGeneral ? (
              <StatTile label="참관객 수" value={stats.data.attendee_total} />
            ) : (
              <StatTile label="응답률" value={`${Math.round(stats.data.response_rate * 100)}%`} />
            )}
            <StatTile label="등록 수" value={stats.data.attendee_total} />
            <StatTile label="체크인율" value={`${Math.round(stats.data.checkin_rate * 100)}%`} />
          </div>
        )
      )}

      <div className="flex gap-1 border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={activeTab === t.id ? 'page' : undefined}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-sub hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'rsvp' && <RsvpTab sheetConnected={sheetConnected} />}
      {activeTab === 'attendees' && (
        <AttendeesTab
          sheetConnected={sheetConnected}
          snapshotAt={connection.data?.snapshot_at ?? null}
          attendees={attendees.data}
          loading={attendees.loading}
          error={attendees.error}
          onChanged={attendees.reload}
        />
      )}
      {activeTab === 'stats' && (
        <StatsTab showRsvp={!isGeneral} stats={stats.data} loading={stats.loading} error={stats.error} />
      )}

      {excludedOpen && sheetStats.data && (
        <SheetExcludedDialog
          rows={sheetStats.data.excluded_rows}
          sheetUrl={connection.data?.url ?? null}
          onClose={() => setExcludedOpen(false)}
        />
      )}
    </section>
  )
}

const RSVP_STATUS_OPTIONS: { value: RsvpStatusFilter; label: string }[] = [
  { value: 'all', label: '전체 상태' },
  ...(Object.keys(INVITE_STATUS_LABELS) as InviteStatus[]).map((s) => ({
    value: s as RsvpStatusFilter,
    label: INVITE_STATUS_LABELS[s],
  })),
]

// ── RSVP 탭 ───────────────────────────────────────────────────────────
function RsvpTab({ sheetConnected }: { sheetConnected: boolean }) {
  const { projectId } = useProject()
  const rsvps = useAsync(() => provider.listRsvpContacts(projectId), [projectId])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RsvpStatusFilter>('all')
  const [page, setPage] = useState(1)

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(1)
  }
  const handleStatusChange = (v: RsvpStatusFilter) => {
    setStatusFilter(v)
    setPage(1)
  }

  const filtered = filterRsvps(rsvps.data ?? [], search, statusFilter)
  const paged = paginate(filtered, page)

  const handleExport = () => {
    const headers = ['이름', '소속', '직함', '이메일', '전화', '그룹', '상태', '메모']
    const rows = (rsvps.data ?? []).map((r) => [
      r.name,
      r.org ?? '',
      r.title ?? '',
      r.email ?? '',
      r.phone ?? '',
      r.group_tag ?? '',
      INVITE_STATUS_LABELS[r.invite_status],
      r.memo ?? '',
    ])
    downloadCsv('rsvp.csv', toCsv(headers, rows))
  }

  return (
    <div className="space-y-6">
      <ErrorAlert message={rsvps.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CsvImportPanel target="rsvp" onImported={rsvps.reload} compact={sheetConnected} />
        </div>
        <button type="button" onClick={handleExport} className="btn btn-ghost shrink-0">
          내보내기
        </button>
      </div>

      <RegistrationSearchBar
        search={search}
        onSearchChange={handleSearchChange}
        statusValue={statusFilter}
        onStatusChange={handleStatusChange}
        statusOptions={RSVP_STATUS_OPTIONS}
        statusLabel="RSVP 상태 필터"
      />

      <Card title="RSVP 리스트">
        {rsvps.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
        {rsvps.data && rsvps.data.length === 0 && <p className="text-sm text-ink-cap">등록된 대상이 없습니다.</p>}
        {rsvps.data && rsvps.data.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-ink-cap">검색·필터 조건에 맞는 대상이 없습니다.</p>
        )}
        {paged.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="ui-th">이름</th>
                  <th className="ui-th">소속</th>
                  <th className="ui-th">직함</th>
                  <th className="ui-th">이메일</th>
                  <th className="ui-th">그룹</th>
                  <th className="ui-th">상태</th>
                  <th className="ui-th">메모</th>
                  <th className="ui-th">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.items.map((r) => (
                  <RsvpRow key={r.id} rsvp={r} onChanged={rsvps.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={paged.page}
          totalPages={paged.totalPages}
          totalCount={paged.totalCount}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

function RsvpRow({ rsvp, onChanged }: { rsvp: RsvpContact; onChanged: () => void }) {
  const updateStatus = useMutation((status: InviteStatus) =>
    provider.updateRsvpContact(rsvp.id, { invite_status: status }),
  )
  const convert = useMutation(() => provider.convertRsvpToAttendee(rsvp.id))

  const handleStatusChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const result = await updateStatus.run(e.target.value as InviteStatus)
    if (result) onChanged()
  }

  const handleConvert = async () => {
    await convert.run()
  }

  return (
    <tr className="h-11 hover:bg-accent-tint/30">
      <td className="py-2 pr-4 text-ink">{rsvp.name}</td>
      <td className="py-2 pr-4 text-ink-sub">{rsvp.org ?? '-'}</td>
      <td className="py-2 pr-4 text-ink-sub">{rsvp.title ?? '-'}</td>
      <td className="py-2 pr-4 text-ink-sub">{rsvp.email ?? '-'}</td>
      <td className="py-2 pr-4 text-ink-sub">{rsvp.group_tag ?? '-'}</td>
      <td className="py-2 pr-4">
        <select
          value={rsvp.invite_status}
          onChange={handleStatusChange}
          disabled={updateStatus.pending}
          className="ui-input ui-select text-xs"
        >
          {(Object.keys(INVITE_STATUS_LABELS) as InviteStatus[]).map((s) => (
            <option key={s} value={s}>
              {INVITE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <ErrorAlert message={updateStatus.error} />
      </td>
      <td className="py-2 pr-4 max-w-40 truncate text-ink-cap">{rsvp.memo ?? '-'}</td>
      <td className="py-2">
        <button type="button" onClick={handleConvert} disabled={convert.pending} className="btn btn-ghost btn-sm">
          참관객 전환
        </button>
        <ErrorAlert message={convert.error} />
      </td>
    </tr>
  )
}

// 라벨은 AttendeeRow 체크인 상태 문구('완료 · ...')와 겹치지 않게 고른다 — 검색으로 텍스트를
// 매칭하는 테스트(예: dod4)가 select 옵션까지 함께 집어 오탐하지 않도록.
const CHECKIN_FILTER_OPTIONS: { value: CheckinFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'checked', label: '체크인됨' },
  { value: 'not_checked', label: '미체크인' },
]

// ── 참관객 탭 ─────────────────────────────────────────────────────────
// 시트 연결 행사에서는 **읽기 전용 시트 명단**(§24.5)으로, 그 밖에는 기존 열 구성으로 렌더한다.
// 어느 쪽이든 편집 UI는 체크인·비고(앱 소유)뿐이고 시트 소유 필드에는 입력 요소를 두지 않는다.
function AttendeesTab({
  sheetConnected,
  snapshotAt,
  attendees,
  loading,
  error,
  onChanged,
}: {
  sheetConnected: boolean
  snapshotAt: string | null
  attendees: AttendeeWithRsvp[] | null
  loading: boolean
  error: string | null
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const [checkinFilter, setCheckinFilter] = useState<CheckinFilter>('all')
  const [page, setPage] = useState(1)
  const [dense, setDense] = useState(false)

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(1)
  }
  const handleCheckinFilterChange = (v: CheckinFilter) => {
    setCheckinFilter(v)
    setPage(1)
  }

  const filtered = filterAttendees(attendees ?? [], search, checkinFilter)
  const paged = paginate(filtered, page)

  const handleExport = () => {
    const headers = ['이름', '소속', '채널', '등록일', '뱃지번호', '체크인']
    const rows = (attendees ?? []).map((a) => [
      a.name,
      a.org ?? '',
      CHANNEL_LABELS[a.channel],
      formatDateTime(a.registered_at),
      a.badge_no ?? '',
      a.checked_in_at ? formatDateTime(a.checked_in_at) : '미체크인',
    ])
    downloadCsv('attendees.csv', toCsv(headers, rows))
  }

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CsvImportPanel target="attendees" onImported={onChanged} compact={sheetConnected} />
        </div>
        <button type="button" onClick={handleExport} className="btn btn-ghost shrink-0">
          내보내기
        </button>
      </div>

      <RegistrationSearchBar
        search={search}
        onSearchChange={handleSearchChange}
        statusValue={checkinFilter}
        onStatusChange={handleCheckinFilterChange}
        statusOptions={CHECKIN_FILTER_OPTIONS}
        statusLabel="체크인 여부 필터"
      />

      <Card
        title={sheetConnected ? '참관객 · 시트 명단' : '참관객'}
        action={
          <div className="flex items-center gap-2">
            {sheetConnected && <LevelBadge level="neutral" label="읽기 전용" />}
            {sheetConnected && <SnapshotBadge snapshotAt={snapshotAt} />}
            <DensityToggle dense={dense} onChange={setDense} />
          </div>
        }
      >
        {sheetConnected && (
          <div className="mb-3 rounded-md border border-steel/20 bg-steel-tint px-3 py-2 text-xs leading-relaxed text-steel">
            명단 필드(이름·소속·직함·연락처·구분·신청 상태)는 <strong className="font-semibold">시트 소유</strong>
            로 앱에서 수정할 수 없습니다. 체크인·비고는 <strong className="font-semibold">앱 소유</strong> 필드로
            시트를 덮어쓰지 않습니다. 연락처는 기본 마스킹으로 표시되며 내보내기 시에만 포함할 수 있습니다.
          </div>
        )}

        {loading && !attendees && <TableSkeleton rows={5} columns={6} dense={dense} />}
        {attendees && attendees.length === 0 && <EmptyState message="등록된 참관객이 없습니다." />}
        {attendees && attendees.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-ink-cap">검색·필터 조건에 맞는 참관객이 없습니다.</p>
        )}
        {paged.items.length > 0 && (
          <div className="overflow-x-auto">
            <table
              className={`ui-table text-left text-sm ${dense ? 'ui-table-dense' : ''}`}
              aria-label={sheetConnected ? '참관객 시트 명단' : '참관객 명단'}
            >
              <thead>
                <tr>
                  <th className="ui-th">이름</th>
                  <th className="ui-th">소속</th>
                  {sheetConnected ? (
                    <>
                      <th className="ui-th">직함</th>
                      <th className="ui-th">연락처</th>
                      <th className="ui-th">구분 · 그룹</th>
                      <th className="ui-th">신청 상태</th>
                    </>
                  ) : (
                    <>
                      <th className="ui-th">채널</th>
                      <th className="ui-th">등록일</th>
                      <th className="ui-th">뱃지번호</th>
                    </>
                  )}
                  <th className="ui-th">
                    체크인 <span className="text-accent-deep">· 앱 소유</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((a) => (
                  <AttendeeRow key={a.id} attendee={a} sheetConnected={sheetConnected} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={paged.page}
          totalPages={paged.totalPages}
          totalCount={paged.totalCount}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

function AttendeeRow({
  attendee,
  sheetConnected,
}: {
  attendee: AttendeeWithRsvp
  sheetConnected: boolean
}) {
  const removed = attendee.sheet_status === 'removed'

  return (
    <tr className={removed ? 'opacity-60' : undefined}>
      <td className="text-ink" title={attendee.name}>
        {attendee.name}
      </td>
      <td className="text-ink-sub" title={attendee.org ?? undefined}>
        {attendee.org ?? '-'}
      </td>
      {sheetConnected ? (
        <>
          <td className="text-ink-sub">{attendee.title ?? '-'}</td>
          <td className="text-ink-sub">{maskedContact(attendee.email, attendee.phone)}</td>
          <td className="text-ink-sub">{attendee.group_tag ?? '-'}</td>
          <td>
            {attendee.sheet_status ? (
              <LevelBadge
                level={SHEET_STATUS_LEVEL[attendee.sheet_status]}
                label={SHEET_STATUS_LABELS[attendee.sheet_status]}
              />
            ) : (
              '-'
            )}
          </td>
        </>
      ) : (
        <>
          <td className="text-ink-sub">{CHANNEL_LABELS[attendee.channel]}</td>
          <td className="text-ink-sub">{formatDateTime(attendee.registered_at)}</td>
          <td className="text-ink-sub">{attendee.badge_no ?? '-'}</td>
        </>
      )}
      <td>
        {removed ? (
          <span className="text-xs text-ink-cap">
            {attendee.checked_in_at ? `완료 · ${formatDateTime(attendee.checked_in_at)} (이력)` : '이력'}
          </span>
        ) : (
          /* 조작은 S-12 현장 체크인에서만 — 여기는 읽기 전용 상태 표시다(3.17.1 T1-3) */
          <span className="text-sm text-ink-sub">
            {attendee.checked_in_at ? `완료 · ${formatDateTime(attendee.checked_in_at)}` : '미체크인'}
          </span>
        )}
      </td>
    </tr>
  )
}

// ── 통계 탭 ───────────────────────────────────────────────────────────
// 3.9.1 P3: 통계 3종(응답률·등록 수·체크인율)은 페이지 상단 카드로 승격 — 탭에는 상세(보조 수치)만 남긴다.
// showRsvp=false(일반형)면 RSVP 보조 수치를 렌더하지 않는다 — 데이터는 그대로 조회만 생략.
function StatsTab({
  showRsvp,
  stats,
  loading,
  error,
}: {
  showRsvp: boolean
  stats: RegistrationStats | null
  loading: boolean
  error: string | null
}) {
  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />
      {loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
      {stats && !showRsvp && (
        <p className="text-sm text-ink-cap">일반형 행사 — 상세 통계는 상단 카드로 제공됩니다.</p>
      )}
      {stats && showRsvp && (
        <Card title="RSVP 보조 수치">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="RSVP 총원" value={stats.rsvp_total} />
            <StatTile label="발송" value={stats.rsvp_sent} />
            <StatTile label="참석" value={stats.rsvp_accepted} />
            <StatTile label="불참" value={stats.rsvp_declined} />
          </div>
        </Card>
      )}
    </div>
  )
}

// ── CSV 임포트 (RSVP·참관객 공용) ────────────────────────────────────
const FIELD_OPTIONS: { value: keyof CsvImportRow | 'ignore'; label: string }[] = [
  { value: 'name', label: '이름(name)' },
  { value: 'org', label: '소속(org)' },
  { value: 'title', label: '직함(title)' },
  { value: 'email', label: '이메일(email)' },
  { value: 'phone', label: '전화(phone)' },
  { value: 'group_tag', label: '그룹(group_tag)' },
  { value: 'memo', label: '메모(memo)' },
  { value: 'ignore', label: '무시' },
]

const HEADER_GUESSES: Record<string, keyof CsvImportRow> = {
  name: 'name',
  이름: 'name',
  성명: 'name',
  org: 'org',
  소속: 'org',
  회사: 'org',
  기관: 'org',
  title: 'title',
  직함: 'title',
  직책: 'title',
  email: 'email',
  'e-mail': 'email',
  이메일: 'email',
  phone: 'phone',
  tel: 'phone',
  전화: 'phone',
  연락처: 'phone',
  휴대폰: 'phone',
  group_tag: 'group_tag',
  group: 'group_tag',
  그룹: 'group_tag',
  태그: 'group_tag',
  구분: 'group_tag',
  memo: 'memo',
  note: 'memo',
  비고: 'memo',
  메모: 'memo',
}

function guessField(header: string): keyof CsvImportRow | 'ignore' {
  return HEADER_GUESSES[header.trim().toLowerCase()] ?? 'ignore'
}

/** parseCsv(csvUtils.ts)를 xlsxToTable과 동일한 {headers, rows} 모양으로 맞춘다 — 이후 헤더 매핑·
 *  임포트 경로는 두 형식이 완전히 같은 코드를 탄다(등가 보장의 핵심). */
function csvToTable(text: string): { headers: string[]; rows: string[][] } {
  const table = parseCsv(text)
  if (table.length === 0) return { headers: [], rows: [] }
  const [headers, ...rows] = table
  return { headers, rows }
}

function CsvImportPanel({
  target,
  onImported,
  compact = false,
}: {
  target: 'rsvp' | 'attendees'
  onImported: () => void
  /** 시트 연결 중 — 파일 임포트는 보조 수단이라 버튼이 아니라 작은 텍스트 링크로 내린다(§24.5) */
  compact?: boolean
}) {
  const { projectId } = useProject()
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<Record<number, keyof CsvImportRow | 'ignore'>>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null)
  const importMutation = useMutation((rows: CsvImportRow[]) =>
    provider.importRegistrationCsv(projectId, target, rows),
  )

  // P9 — xlsx도 같은 파이프라인(파일 선택→헤더 매핑 UI→importRegistrationCsv)을 탄다. 판별은
  // 확장자·MIME 우선, 나머지는 CSV로 취급(기존 동작 그대로 회귀 없음).
  const isXlsxFile = (file: File): boolean =>
    /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    setValidationError(null)
    const xlsx = isXlsxFile(file)
    const reader = new FileReader()
    reader.onerror = () => setValidationError('파일을 읽지 못했습니다.')
    reader.onload = () => {
      try {
        const { headers, rows } = xlsx
          ? xlsxToTable(reader.result as ArrayBuffer)
          : csvToTable(String(reader.result ?? ''))
        if (headers.length === 0 && rows.length === 0) return
        setParsed({ headers, rows })
        const guess: Record<number, keyof CsvImportRow | 'ignore'> = {}
        headers.forEach((h, i) => {
          guess[i] = guessField(h)
        })
        setMapping(guess)
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : '파일을 읽지 못했습니다.')
      }
    }
    if (xlsx) reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!parsed) return
    const hasName = Object.values(mapping).includes('name')
    if (!hasName) {
      setValidationError('name(이름) 매핑은 필수입니다.')
      return
    }
    setValidationError(null)
    const rows: CsvImportRow[] = parsed.rows
      .map((r) => {
        const row: Partial<CsvImportRow> = {}
        Object.entries(mapping).forEach(([idxStr, field]) => {
          if (field === 'ignore') return
          const value = r[Number(idxStr)]?.trim()
          if (value) row[field] = value
        })
        return row as CsvImportRow
      })
      .filter((r) => r.name)
    const outcome = await importMutation.run(rows)
    if (outcome) {
      setResult(outcome)
      setParsed(null)
      setMapping({})
      onImported()
    }
  }

  const targetLabel = target === 'rsvp' ? 'RSVP' : '참관객'
  const fileInput = (
    <input
      type="file"
      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      onChange={handleFile}
      className="hidden"
    />
  )

  return (
    <div className="min-w-0">
      {compact ? (
        <>
          <label className="inline-flex cursor-pointer text-sm text-ink-cap underline decoration-border underline-offset-2 hover:text-ink-sub">
            xlsx로 가져오기 ({targetLabel})
            {fileInput}
          </label>
          <p className="mt-0.5 text-[11px] text-ink-cap">시트 연결 중에는 보조 수단입니다.</p>
        </>
      ) : (
        <>
          <label className="btn btn-ghost inline-flex cursor-pointer">
            CSV 임포트 ({targetLabel})
            {fileInput}
          </label>
          <p className="mt-1 text-[11px] text-ink-cap">.csv 또는 .xlsx 파일을 선택하세요.</p>
        </>
      )}
      {result && (
        <p className="mt-2 text-sm text-ink-sub">
          신규 {result.inserted}건 · 갱신 {result.updated}건 반영되었습니다.
        </p>
      )}
      <ErrorAlert message={validationError} />
      <ErrorAlert message={importMutation.error} />

      {parsed && (
        <div className="mt-3 w-full max-w-2xl ui-card p-4">
          <p className="text-xs font-medium text-ink-cap">
            헤더 매핑 — {parsed.rows.length}행 감지됨. name(이름)은 필수 매핑입니다.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="ui-th">헤더</th>
                  <th className="ui-th">매핑 필드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.headers.map((h, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 text-ink-sub">{h || `(열 ${i + 1})`}</td>
                    <td className="py-2">
                      <select
                        value={mapping[i] ?? 'ignore'}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [i]: e.target.value as keyof CsvImportRow | 'ignore' }))
                        }
                        className="ui-input ui-select text-xs"
                      >
                        {FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleImport} disabled={importMutation.pending} className="btn btn-primary">
              가져오기 실행
            </button>
            <button
              type="button"
              onClick={() => {
                setParsed(null)
                setMapping({})
                setValidationError(null)
              }}
              className="btn btn-ghost"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
