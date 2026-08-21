import { useState, type ChangeEvent } from 'react'
import Card from '../components/internal/Card'
import ErrorAlert from '../components/internal/ErrorAlert'
import StatTile from '../components/internal/StatTile'
import { downloadCsv, parseCsv, toCsv } from '../components/internal/csvUtils'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync, useMutation } from '../hooks/useAsync'
import { INVITE_STATUS_LABELS, formatDateTime } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { RsvpContact } from '../types/entities'
import type { AttendeeChannel, InviteStatus } from '../types/enums'
import type { AttendeeWithRsvp, CsvImportRow } from '../types/views'

const provider = getDataProvider()

const CHANNEL_LABELS: Record<AttendeeChannel, string> = {
  rsvp: 'RSVP 전환',
  onsite: '현장 등록',
  import: '가져오기',
}

type Tab = 'rsvp' | 'attendees' | 'stats'
const TABS: { id: Tab; label: string }[] = [
  { id: 'rsvp', label: 'RSVP' },
  { id: 'attendees', label: '참관객' },
  { id: 'stats', label: '통계' },
]

export default function RegistrationPage() {
  const [tab, setTab] = useState<Tab>('rsvp')

  return (
    <section className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs text-gray-400">S4</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">등록</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rsvp' && <RsvpTab />}
      {tab === 'attendees' && <AttendeesTab />}
      {tab === 'stats' && <StatsTab />}
    </section>
  )
}

// ── RSVP 탭 ───────────────────────────────────────────────────────────
function RsvpTab() {
  const rsvps = useAsync(() => provider.listRsvpContacts(PROJECT_ID), [])

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
        <CsvImportPanel target="rsvp" onImported={rsvps.reload} />
        <button
          type="button"
          onClick={handleExport}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          내보내기
        </button>
      </div>

      <Card title="RSVP 리스트">
        {rsvps.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
        {rsvps.data && rsvps.data.length === 0 && <p className="text-sm text-gray-400">등록된 대상이 없습니다.</p>}
        {rsvps.data && rsvps.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="pb-2 pr-4 font-medium">이름</th>
                  <th className="pb-2 pr-4 font-medium">소속</th>
                  <th className="pb-2 pr-4 font-medium">직함</th>
                  <th className="pb-2 pr-4 font-medium">이메일</th>
                  <th className="pb-2 pr-4 font-medium">그룹</th>
                  <th className="pb-2 pr-4 font-medium">상태</th>
                  <th className="pb-2 pr-4 font-medium">메모</th>
                  <th className="pb-2 font-medium">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rsvps.data.map((r) => (
                  <RsvpRow key={r.id} rsvp={r} onChanged={rsvps.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    <tr>
      <td className="py-2 pr-4 text-gray-900">{rsvp.name}</td>
      <td className="py-2 pr-4 text-gray-700">{rsvp.org ?? '-'}</td>
      <td className="py-2 pr-4 text-gray-700">{rsvp.title ?? '-'}</td>
      <td className="py-2 pr-4 text-gray-700">{rsvp.email ?? '-'}</td>
      <td className="py-2 pr-4 text-gray-700">{rsvp.group_tag ?? '-'}</td>
      <td className="py-2 pr-4">
        <select
          value={rsvp.invite_status}
          onChange={handleStatusChange}
          disabled={updateStatus.pending}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
        >
          {(Object.keys(INVITE_STATUS_LABELS) as InviteStatus[]).map((s) => (
            <option key={s} value={s}>
              {INVITE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <ErrorAlert message={updateStatus.error} />
      </td>
      <td className="py-2 pr-4 max-w-40 truncate text-gray-500">{rsvp.memo ?? '-'}</td>
      <td className="py-2">
        <button
          type="button"
          onClick={handleConvert}
          disabled={convert.pending}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          참관객 전환
        </button>
        <ErrorAlert message={convert.error} />
      </td>
    </tr>
  )
}

// ── 참관객 탭 ─────────────────────────────────────────────────────────
function AttendeesTab() {
  const attendees = useAsync(() => provider.listAttendees(PROJECT_ID), [])

  const handleExport = () => {
    const headers = ['이름', '소속', '채널', '등록일', '뱃지번호', '체크인']
    const rows = (attendees.data ?? []).map((a) => [
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
      <ErrorAlert message={attendees.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CsvImportPanel target="attendees" onImported={attendees.reload} />
        <button
          type="button"
          onClick={handleExport}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          내보내기
        </button>
      </div>

      <Card title="참관객">
        {attendees.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
        {attendees.data && attendees.data.length === 0 && (
          <p className="text-sm text-gray-400">등록된 참관객이 없습니다.</p>
        )}
        {attendees.data && attendees.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="pb-2 pr-4 font-medium">이름</th>
                  <th className="pb-2 pr-4 font-medium">소속</th>
                  <th className="pb-2 pr-4 font-medium">채널</th>
                  <th className="pb-2 pr-4 font-medium">등록일</th>
                  <th className="pb-2 pr-4 font-medium">뱃지번호</th>
                  <th className="pb-2 font-medium">체크인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendees.data.map((a) => (
                  <AttendeeRow key={a.id} attendee={a} onChanged={attendees.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function AttendeeRow({ attendee, onChanged }: { attendee: AttendeeWithRsvp; onChanged: () => void }) {
  const toggle = useMutation(() => provider.toggleCheckin(attendee.id))

  const handleToggle = async () => {
    const result = await toggle.run()
    if (result) onChanged()
  }

  return (
    <tr>
      <td className="py-2 pr-4 text-gray-900">{attendee.name}</td>
      <td className="py-2 pr-4 text-gray-700">{attendee.org ?? '-'}</td>
      <td className="py-2 pr-4 text-gray-700">{CHANNEL_LABELS[attendee.channel]}</td>
      <td className="py-2 pr-4 text-gray-700">{formatDateTime(attendee.registered_at)}</td>
      <td className="py-2 pr-4 text-gray-700">{attendee.badge_no ?? '-'}</td>
      <td className="py-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggle.pending}
          className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
            attendee.checked_in_at
              ? 'bg-gray-900 text-white'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {attendee.checked_in_at ? `체크인 완료 (${formatDateTime(attendee.checked_in_at)})` : '체크인'}
        </button>
        <ErrorAlert message={toggle.error} />
      </td>
    </tr>
  )
}

// ── 통계 탭 ───────────────────────────────────────────────────────────
function StatsTab() {
  const stats = useAsync(() => provider.getRegistrationStats(PROJECT_ID), [])

  return (
    <div className="space-y-6">
      <ErrorAlert message={stats.error} />
      {stats.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {stats.data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label="응답률" value={`${Math.round(stats.data.response_rate * 100)}%`} />
            <StatTile label="등록 수" value={stats.data.attendee_total} />
            <StatTile label="체크인율" value={`${Math.round(stats.data.checkin_rate * 100)}%`} />
          </div>
          <Card title="RSVP 보조 수치">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="RSVP 총원" value={stats.data.rsvp_total} />
              <StatTile label="발송" value={stats.data.rsvp_sent} />
              <StatTile label="참석" value={stats.data.rsvp_accepted} />
              <StatTile label="불참" value={stats.data.rsvp_declined} />
            </div>
          </Card>
        </>
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

function CsvImportPanel({ target, onImported }: { target: 'rsvp' | 'attendees'; onImported: () => void }) {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<Record<number, keyof CsvImportRow | 'ignore'>>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null)
  const importMutation = useMutation((rows: CsvImportRow[]) =>
    provider.importRegistrationCsv(PROJECT_ID, target, rows),
  )

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    setValidationError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const table = parseCsv(String(reader.result ?? ''))
      if (table.length === 0) return
      const [headers, ...rows] = table
      setParsed({ headers, rows })
      const guess: Record<number, keyof CsvImportRow | 'ignore'> = {}
      headers.forEach((h, i) => {
        guess[i] = guessField(h)
      })
      setMapping(guess)
    }
    reader.readAsText(file)
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

  return (
    <div className="min-w-0">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
        CSV 임포트 ({targetLabel})
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
      </label>
      {result && (
        <p className="mt-2 text-sm text-gray-700">
          신규 {result.inserted}건 · 갱신 {result.updated}건 반영되었습니다.
        </p>
      )}
      <ErrorAlert message={validationError} />
      <ErrorAlert message={importMutation.error} />

      {parsed && (
        <div className="mt-3 w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">
            헤더 매핑 — {parsed.rows.length}행 감지됨. name(이름)은 필수 매핑입니다.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="pb-1 pr-4 font-medium">CSV 헤더</th>
                  <th className="pb-1 font-medium">매핑 필드</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((h, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4 text-gray-700">{h || `(열 ${i + 1})`}</td>
                    <td className="py-1">
                      <select
                        value={mapping[i] ?? 'ignore'}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [i]: e.target.value as keyof CsvImportRow | 'ignore' }))
                        }
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
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
            <button
              type="button"
              onClick={handleImport}
              disabled={importMutation.pending}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              가져오기 실행
            </button>
            <button
              type="button"
              onClick={() => {
                setParsed(null)
                setMapping({})
                setValidationError(null)
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
