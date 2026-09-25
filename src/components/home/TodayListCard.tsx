// 홈 '오늘 할 일' 카드 (디자인지시서 v1.4 §7-2.5) — 흩어진 큐를 급한 순 한 목록으로.
// 행마다 '바로 하기' 1개: 대부분은 그 자리로 가는 링크, 미등록 파일은 행 아래에서 바로 연결·무시.
// 리마인드·독촉은 행 단위가 아니라 목록 전체(서버가 지연 전부 / 컨펌 전부를 한 메시지로 보낸다) — 머리의 일괄 버튼.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../internal/EmptyState'
import FilterChip from '../internal/FilterChip'
import ErrorAlert from '../internal/ErrorAlert'
import FilterEmptyState from '../internal/FilterEmptyState'
import { LevelBadge } from '../internal/StatusBadge'
import TableSkeleton from '../internal/TableSkeleton'
import { useMutation } from '../../hooks/useAsync'
import { getDriveGateway } from '../../lib/drive/driveGateway'
import { useDriveStatus } from '../../lib/drive/useDriveStatus'
import { AREA_LABELS, ROLE_BAR_CLASSES, ROLE_LABELS, daysUntil, dueLabel, formatDate } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { Deliverable } from '../../types/entities'
import { matchesTodayFilter, type TodayFilter, type TodayRow } from './todayItems'

const provider = getDataProvider()

const FILTER_LABELS = (isHost: boolean): Record<TodayFilter, string> => ({
  all: '전체',
  mine: '내 차례',
  late: '지연',
  review: isHost ? '검토·정산' : '컨펌·정산',
})

const FILTER_ORDER: TodayFilter[] = ['all', 'mine', 'late', 'review']

/**
 * 처음에 보이는 **일정 행**(지연 태스크·지난 마일스톤·임박) 수 — 지난 행사처럼 지연이 수십 건이면 목록이 화면을 덮는다.
 * 넘겨받은 일(컨펌대기·파트너 검토·정산·미등록 파일·받은 가이드)은 건수가 적고 놓치면 안 되므로 **항상 보인다** —
 * 전체 행 수로 자르면 이것들이 지연 행 뒤로 밀려 가려진다(2026-09-25 데모 RB27 실측: 지연 25건에 컨펌대기 2건이 묻힘).
 */
export const TODAY_TASK_LIMIT = 8

const isScheduleRow = (r: TodayRow) => r.kind === 'delayed' || r.kind === 'milestone' || r.kind === 'imminent'

function DueCell({ row }: { row: TodayRow }) {
  if (row.dueText) return <span className="text-sm text-ink-sub">{row.dueText}</span>
  if (!row.due) return <span className="text-sm text-ink-cap">—</span>
  const overdue = daysUntil(row.due) < 0
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm text-ink">{formatDate(row.due.slice(0, 10))}</span>
      <span
        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
          overdue ? 'bg-negative-tint text-negative' : 'bg-track text-ink-sub'
        }`}
      >
        {dueLabel(row.due)}
      </span>
    </span>
  )
}

function OwnerCell({ row }: { row: TodayRow }) {
  if (!row.role && !row.owner) return <span className="text-sm text-ink-cap">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      {row.role && <span aria-hidden className={`size-2 shrink-0 rounded-full ${ROLE_BAR_CLASSES[row.role]}`} />}
      {row.owner ?? (row.role ? `${ROLE_LABELS[row.role]} 담당` : '')}
    </span>
  )
}

export interface TodayListCardProps {
  projectId: string
  rows: TodayRow[]
  loading: boolean
  isHost: boolean
  /** 미등록 파일을 연결할 항목 후보 */
  deliverables: Deliverable[]
  onInboxChanged: () => void
  onRemind: (target: 'delayed' | 'approval') => void
  remindBusy: boolean
  /** 리마인드 결과·안내(있을 때만 role=status로) */
  remindNotice: string | null
}

export default function TodayListCard({
  projectId,
  rows,
  loading,
  isHost,
  deliverables,
  onInboxChanged,
  onRemind,
  remindBusy,
  remindNotice,
}: TodayListCardProps) {
  const [filter, setFilter] = useState<TodayFilter>('all')
  const [expanded, setExpanded] = useState(false)
  const [openInbox, setOpenInbox] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, string>>({})
  const labels = FILTER_LABELS(isHost)

  const counts = useMemo(() => {
    const c = {} as Record<TodayFilter, number>
    for (const f of FILTER_ORDER) c[f] = rows.filter((r) => matchesTodayFilter(r, f)).length
    return c
  }, [rows])
  const visible = useMemo(() => rows.filter((r) => matchesTodayFilter(r, filter)), [rows, filter])
  const { shown, hiddenCount } = useMemo(() => {
    if (expanded) return { shown: visible, hiddenCount: visible.filter(isScheduleRow).length - TODAY_TASK_LIMIT }
    let budget = TODAY_TASK_LIMIT
    const out: TodayRow[] = []
    for (const r of visible) {
      if (!isScheduleRow(r)) out.push(r)
      else if (budget > 0) {
        out.push(r)
        budget -= 1
      }
    }
    return { shown: out, hiddenCount: visible.length - out.length }
  }, [visible, expanded])

  // Drive 인박스 — 실서버 + 연결됨이면 '지금 확인'으로 바로 훑는다(mock은 픽스처 인박스라 버튼이 없다)
  const drive = useDriveStatus()
  const gateway = getDriveGateway()
  const canScan = gateway.mode === 'server' && !!drive.status?.configured && drive.status.connected
  const [scanNote, setScanNote] = useState<string | null>(null)
  const scan = useMutation(async () => {
    if (gateway.mode !== 'server') throw new Error('실서버 모드에서만 Drive를 확인할 수 있습니다.')
    return gateway.client.scan(projectId)
  })
  const handleScan = async () => {
    setScanNote(null)
    const r = await scan.run()
    if (!r) return
    if (r.skipped === 'no_tree') setScanNote('아직 이 행사의 Drive 폴더가 없습니다 — 행사 설정 ③에서 만들거나 첫 업로드 때 생깁니다.')
    else if (r.skipped === 'tree_missing') setScanNote('행사 폴더를 Drive에서 찾을 수 없습니다(휴지통·이동) — 행사 설정 ③에서 폴더 구조를 확인하세요.')
    else {
      const parts = [`새 파일 ${r.added}건`]
      if (r.removed) parts.push(`사라진 파일 ${r.removed}건 정리`)
      if (r.finalized) parts.push(`확정 복사 ${r.finalized}건 완료`)
      if (r.failed) parts.push(`확정 복사 ${r.failed}건 재시도 대기`)
      setScanNote(`Drive 확인 — ${parts.join(' · ')}`)
    }
    onInboxChanged()
  }

  // 성공을 true로 돌려준다 — dismissInboxFile은 void라 run()이 성공·실패 모두 undefined를 주면 목록이 새로 고쳐지지 않는다
  // (옛 홈 인박스 카드의 '무시'가 그래서 새로고침 전까지 남아 있었다 — DoD 71 ⑤가 잡은 결함)
  const link = useMutation(async (inboxId: string, deliverableId: string) => {
    await provider.linkInboxFile(inboxId, deliverableId)
    return true as const
  })
  const dismiss = useMutation(async (inboxId: string) => {
    await provider.dismissInboxFile(inboxId)
    return true as const
  })
  const handleLink = async (inboxId: string) => {
    const deliverableId = selected[inboxId]
    if (!deliverableId) {
      link.setError('연결할 항목을 선택하세요.')
      return
    }
    if (await link.run(inboxId, deliverableId)) {
      setOpenInbox(null)
      onInboxChanged()
    }
  }
  const handleDismiss = async (inboxId: string) => {
    if (await dismiss.run(inboxId)) {
      setOpenInbox(null)
      onInboxChanged()
    }
  }

  return (
    <section className="ui-card" aria-labelledby="today-title" data-testid="today-list">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-baseline gap-2.5">
          <h2 id="today-title" className="t-card-title">
            오늘 할 일
          </h2>
          <span className="t-caption">급한 순 · {rows.length}건</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_ORDER.map((f) => (
            <FilterChip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {labels[f]} <b className="font-semibold">{counts[f]}</b>
            </FilterChip>
          ))}
        </div>
      </div>

      {/* 일괄 동작 — 리마인드(지연 전부) · 독촉(컨펌 대기 전부) · Drive 확인. 채운 버튼 없음(홈 = 훑는 화면) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-5 py-2.5">
        <span className="t-caption mr-1">한 번에</span>
        <button type="button" onClick={() => onRemind('delayed')} disabled={remindBusy} className="btn btn-ghost btn-sm">
          담당에게 리마인드
        </button>
        {!isHost && (
          <button type="button" onClick={() => onRemind('approval')} disabled={remindBusy} className="btn btn-ghost btn-sm">
            컨펌 독촉
          </button>
        )}
        {canScan && (
          <button type="button" onClick={handleScan} disabled={scan.pending} className="btn btn-ghost btn-sm">
            {scan.pending ? '확인 중…' : 'Drive 지금 확인'}
          </button>
        )}
        <span className="text-xs text-ink-sub">리마인드는 지연 태스크 전부, 독촉은 발주처 답을 기다리는 컨펌 전부를 이 행사 Slack 채널로 보냅니다.</span>
      </div>

      {(remindNotice || scanNote) && (
        <div className="space-y-1.5 px-5 pt-3">
          {remindNotice && (
            <p role="status" className="rounded-md border border-border bg-steel-tint px-2.5 py-2 text-xs text-steel">
              {remindNotice}
            </p>
          )}
          {scanNote && (
            <p className="text-xs text-ink-sub" aria-live="polite">
              {scanNote}
            </p>
          )}
        </div>
      )}
      <div className="px-5 empty:hidden">
        <ErrorAlert message={scan.error} />
        <ErrorAlert message={link.error} />
        <ErrorAlert message={dismiss.error} />
      </div>

      {loading ? (
        <div className="p-5">
          <TableSkeleton rows={5} columns={5} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message="지금 처리할 일이 없습니다 — 지연·컨펌 대기·미등록 파일이 생기면 여기에 모입니다." />
      ) : visible.length === 0 ? (
        <FilterEmptyState
          totalCount={rows.length}
          filters={[{ label: '보기', value: labels[filter] }]}
          onReset={() => setFilter('all')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="ui-th w-[112px]">상태</th>
                <th className="ui-th">할 일</th>
                <th className="ui-th w-[132px]">담당</th>
                <th className="ui-th w-[200px]">마감</th>
                <th className="ui-th w-[168px] text-right">바로 하기</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <TodayTableRow
                  key={row.key}
                  row={row}
                  inboxOpen={openInbox === row.inboxId && row.inboxId !== null}
                  onToggleInbox={() => setOpenInbox((cur) => (cur === row.inboxId ? null : row.inboxId))}
                  deliverables={deliverables}
                  selectedDeliverable={row.inboxId ? (selected[row.inboxId] ?? '') : ''}
                  onSelectDeliverable={(id) => row.inboxId && setSelected((s) => ({ ...s, [row.inboxId as string]: id }))}
                  onLink={() => row.inboxId && void handleLink(row.inboxId)}
                  onDismiss={() => row.inboxId && void handleDismiss(row.inboxId)}
                  busy={link.pending || dismiss.pending}
                />
              ))}
            </tbody>
          </table>
          {hiddenCount > 0 && (
            <div className="flex justify-center border-t border-border px-5 py-2.5">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((e) => !e)}
                className="btn btn-ghost btn-sm"
              >
                {expanded ? '일정 행 접기' : `일정 행 ${hiddenCount}건 더 보기`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function TodayTableRow({
  row,
  inboxOpen,
  onToggleInbox,
  deliverables,
  selectedDeliverable,
  onSelectDeliverable,
  onLink,
  onDismiss,
  busy,
}: {
  row: TodayRow
  inboxOpen: boolean
  onToggleInbox: () => void
  deliverables: Deliverable[]
  selectedDeliverable: string
  onSelectDeliverable: (id: string) => void
  onLink: () => void
  onDismiss: () => void
  busy: boolean
}) {
  return (
    <>
      <tr data-testid="today-row" data-kind={row.kind}>
        <td>
          <LevelBadge level={row.level} label={row.status} dot={row.dot} />
        </td>
        <td className="whitespace-normal py-2.5">
          <span className="block font-semibold text-ink">
            {row.code && <span className="mr-1.5 text-ink-cap">{row.code}</span>}
            {row.title}
          </span>
          {row.sub && <span className="mt-0.5 block text-xs text-ink-sub">{row.sub}</span>}
        </td>
        <td>
          <OwnerCell row={row} />
        </td>
        <td>
          <DueCell row={row} />
        </td>
        <td className="text-right">
          {row.to ? (
            <Link to={row.to} className="btn btn-ghost btn-sm">
              {row.action}
            </Link>
          ) : (
            <button type="button" onClick={onToggleInbox} aria-expanded={inboxOpen} className="btn btn-ghost btn-sm">
              {row.action}
            </button>
          )}
        </td>
      </tr>
      {inboxOpen && row.inboxId && (
        <tr data-testid="today-inbox-panel">
          <td colSpan={5} className="whitespace-normal bg-canvas">
            <div className="flex flex-wrap items-center gap-2 py-1">
              <span className="text-xs text-ink-sub">이 파일을 버전으로 등록할 항목</span>
              <select
                aria-label={`${row.title} 연결할 항목`}
                className="ui-input ui-select min-w-[240px] flex-1 text-sm"
                value={selectedDeliverable}
                onChange={(e) => onSelectDeliverable(e.target.value)}
              >
                <option value="">항목 선택…</option>
                {deliverables.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{AREA_LABELS[d.area]}] {d.title}
                  </option>
                ))}
              </select>
              <button type="button" onClick={onLink} disabled={busy} className="btn btn-primary btn-sm">
                연결
              </button>
              <button type="button" onClick={onDismiss} disabled={busy} className="btn btn-ghost btn-sm">
                무시
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
