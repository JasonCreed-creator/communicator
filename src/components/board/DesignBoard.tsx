// 디자인 보드 — 디자인지시서 v1.4 §7-2.6 (Phase 3.23 PR-3 · 캔버스 "커뮤니케이터 UX 개편" 디자인 보드 v4).
// 진단 2 "상태만 보이고 다음에 무엇을 할지가 없다" → 행마다 '다음 행동' 1줄 + 버튼 1개, 차례 칩(우리·발주처·끝남)과 '지연만',
// 급한 순 한 표(카테고리 묶음 대신 카테고리는 제목 아래 한 줄), 목록 ↔ 갤러리(최신 시안 썸네일 — 사용자 결정 2026-09-25).
// 운영 보드는 v2.5 유형 우선 구조(유형 카드 + 인라인 빌더)를 그대로 둔다 — 이 파일은 디자인 영역만 그린다.
import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../internal/EmptyState'
import ErrorAlert from '../internal/ErrorAlert'
import FilterChip from '../internal/FilterChip'
import FilterEmptyState, { type AppliedFilter } from '../internal/FilterEmptyState'
import InfoTip from '../internal/InfoTip'
import PageHeader from '../internal/PageHeader'
import ProgressBar from '../internal/ProgressBar'
import SegmentedToggle from '../internal/SegmentedToggle'
import TableSkeleton from '../internal/TableSkeleton'
import { useProject } from '../../context/ProjectContext'
import { useAsync } from '../../hooks/useAsync'
import { BOARD_HELP } from '../../lib/helpTexts'
import { getDataProvider } from '../../providers'
import type { MemberRole } from '../../types/enums'
import BoardStatusLegend from './BoardStatusLegend'
import { DeliverableAddFormBody } from './DeliverableAddForm'
import { useClientLinkTarget } from './DesignNextAction'
import DesignBoardGallery from './DesignBoardGallery'
import DesignBoardTable, { type DesignRowView } from './DesignBoardTable'
import {
  designNextAction,
  designTurn,
  isDesignOverdue,
  matchesDesignFilter,
  sortDesignRows,
  toDesignRow,
  type DesignRow,
  type DesignTurnFilter,
} from './designBoardRows'

const provider = getDataProvider()

export type DesignBoardView = 'list' | 'gallery'

/** 보기 선택은 사람마다 다르다 — 이 브라우저에만 기억한다(없거나 막히면 목록) */
export const DESIGN_VIEW_STORAGE_KEY = 'communicator.designBoardView'

function readView(): DesignBoardView {
  try {
    return localStorage.getItem(DESIGN_VIEW_STORAGE_KEY) === 'gallery' ? 'gallery' : 'list'
  } catch {
    return 'list'
  }
}

const VIEW_OPTIONS = [
  { value: 'list', label: '목록' },
  { value: 'gallery', label: '갤러리' },
] as const

export default function DesignBoard() {
  const { projectId, summaries } = useProject()
  const summary = summaries.find((s) => s.id === projectId)
  const isClosed = summary?.status === 'closed'
  const isHost = summary?.kind === 'host'

  const [turn, setTurn] = useState<DesignTurnFilter>('all')
  const [lateOnly, setLateOnly] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [titleQuery, setTitleQuery] = useState('')
  const [view, setView] = useState<DesignBoardView>(readView)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(DESIGN_VIEW_STORAGE_KEY, view)
    } catch {
      // 저장이 막힌 브라우저 — 이번 화면에서만 유지한다
    }
  }, [view])

  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  // 필터는 전부 화면에서 건다 — 한 번 읽은 목록으로 칩 건수와 '전체 n건'(필터 결과 없음)을 같이 낸다
  const board = useAsync<DesignRow[]>(async () => {
    const items = await provider.listDeliverables(projectId, { area: 'design' })
    const details = await Promise.all(items.map((d) => provider.getDeliverable(d.id)))
    return details.map(toDesignRow)
  }, [projectId])

  const role = currentUser.data?.role ?? null
  const canWrite = !isClosed && (role === 'pm' || role === 'design')
  const isPm = !isClosed && role === 'pm'

  // 발주처 링크(재전달용) — 대행형 PM에게만 필요하다. 권한이 없어 조회가 실패하면 버튼을 그리지 않는다(추측 금지)
  const clientLink = useClientLinkTarget(projectId, isPm && !isHost)

  const memberOf = (userId: string | null) => members.data?.find((m) => m.user_id === userId)

  const allRows = board.data ?? []
  const baseRows = useMemo(() => {
    const q = titleQuery.trim().toLowerCase()
    return allRows.filter(
      (r) =>
        (!assigneeFilter || r.deliverable.assignee_id === assigneeFilter) &&
        (q === '' || r.deliverable.title.toLowerCase().includes(q)),
    )
  }, [allRows, assigneeFilter, titleQuery])

  const counts = useMemo(() => {
    const c = { all: baseRows.length, ours: 0, waiting: 0, done: 0, late: 0 }
    for (const r of baseRows) {
      c[designTurn(r.deliverable)] += 1
      if (isDesignOverdue(r)) c.late += 1
    }
    return c
  }, [baseRows])

  const views = useMemo<DesignRowView[]>(() => {
    const ctx = { canWrite, isPm, isHost }
    return sortDesignRows(baseRows.filter((r) => matchesDesignFilter(r, turn, lateOnly))).map((row) => {
      const m = members.data?.find((x) => x.user_id === row.deliverable.assignee_id)
      return {
        row,
        next: designNextAction(row, ctx),
        assigneeName: m?.profile.name ?? '미배정',
        assigneeRole: (m?.role ?? null) as MemberRole | null,
      }
    })
  }, [baseRows, turn, lateOnly, canWrite, isPm, isHost, members.data])

  const waitingLabel = isHost ? '파트너 차례' : '발주처 차례'
  const turnLabels: Record<DesignTurnFilter, string> = { all: '전체', ours: '우리 차례', waiting: waitingLabel, done: '끝남' }

  const appliedFilters: AppliedFilter[] = []
  if (turn !== 'all') appliedFilters.push({ label: '차례', value: turnLabels[turn] })
  if (lateOnly) appliedFilters.push({ label: '기한', value: '지연만' })
  if (assigneeFilter) appliedFilters.push({ label: '담당', value: memberOf(assigneeFilter)?.profile.name ?? '미배정' })
  if (titleQuery.trim()) appliedFilters.push({ label: '제목 검색', value: titleQuery.trim() })

  const resetFilters = () => {
    setTurn('all')
    setLateOnly(false)
    setAssigneeFilter('')
    setTitleQuery('')
  }

  const doneCount = allRows.filter((r) => r.deliverable.status === 'final').length
  const filtered = appliedFilters.length > 0

  return (
    <section className="space-y-5 p-6">
      <PageHeader
        caption="운영"
        title="디자인 보드"
        action={
          <>
            <InfoTip text={BOARD_HELP.design} />
            {/* 화면의 채운 버튼은 이것 하나 — 폼이 열리면 폼의 제출 버튼이 그 자리를 넘겨받는다 */}
            {canWrite && !adding && (
              <button type="button" className="btn btn-accent" onClick={() => setAdding(true)}>
                ＋ 항목 추가
              </button>
            )}
          </>
        }
      />

      {isClosed ? (
        <p className="-mt-2 text-sm text-ink-cap">종료된 행사입니다 — 열람만 가능합니다.</p>
      ) : currentUser.data && !canWrite ? (
        <p className="-mt-2 text-sm text-ink-cap">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
      ) : null}

      {adding && canWrite && (
        <DeliverableAddFormBody
          area="design"
          projectId={projectId}
          isPm={isPm}
          onCreated={() => {
            board.reload()
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <ErrorAlert message={board.error} />

      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="차례로 거르기" className="flex flex-wrap items-center gap-1.5">
          {(['all', 'ours', 'waiting', 'done'] as const).map((t) => (
            <FilterChip key={t} pressed={turn === t} onClick={() => setTurn(t)}>
              {turnLabels[t]} <b>{counts[t]}</b>
            </FilterChip>
          ))}
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <FilterChip pressed={lateOnly} onClick={() => setLateOnly((v) => !v)}>
            <span aria-hidden className="size-1.5 rounded-full bg-negative" />
            지연만 <b>{counts.late}</b>
          </FilterChip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle label="보기" value={view} options={VIEW_OPTIONS} onChange={setView} />
          <select
            aria-label="담당"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="ui-input ui-select w-[150px]"
          >
            <option value="">담당: 전체</option>
            {(members.data ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.name}
              </option>
            ))}
          </select>
          <span className="relative">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-ink-cap"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              aria-label="제목 검색"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              placeholder="제목으로 찾기"
              className="ui-input w-[220px] pl-8"
            />
          </span>
        </div>
      </div>

      {board.loading && !board.data ? (
        <div className="ui-card overflow-hidden">
          <TableSkeleton rows={4} columns={6} />
        </div>
      ) : board.data && allRows.length === 0 ? (
        <EmptyState message="아직 등록된 항목이 없습니다." />
      ) : board.data && views.length === 0 ? (
        <div className="ui-card">
          <FilterEmptyState totalCount={allRows.length} filters={appliedFilters} onReset={resetFilters} />
        </div>
      ) : board.data ? (
        view === 'list' ? (
          <section className="ui-card overflow-hidden" aria-label="디자인 항목 목록">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-3.5">
                <h2 className="t-card-title">
                  항목 {views.length}개{filtered ? ` · 전체 ${allRows.length}개` : ''}
                </h2>
                <span className="flex items-center gap-2" data-testid="design-board-progress">
                  <span className="w-[120px]">
                    <ProgressBar done={doneCount} total={allRows.length} hideValue />
                  </span>
                  <span className="t-caption">
                    확정 {doneCount}/{allRows.length}
                  </span>
                </span>
              </div>
              <span className="t-caption">급한 순 — 늦은 것, 우리 차례가 위로</span>
            </div>
            <DesignBoardTable views={views} clientLink={clientLink} onChanged={board.reload} />
          </section>
        ) : (
          <DesignBoardGallery views={views} clientLink={clientLink} canWrite={canWrite} onChanged={board.reload} />
        )
      ) : null}

      <BoardStatusLegend />
    </section>
  )
}
