import { useMemo, useState, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import InfoTip from '../components/internal/InfoTip'
import PageHeader from '../components/internal/PageHeader'
import StatusBadge from '../components/internal/StatusBadge'
import DeliverableAddForm from '../components/board/DeliverableAddForm'
import CuesheetEditor from '../components/cue/CuesheetEditor'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, STATUS_BADGE_CLASSES, STATUS_LABELS, STATUS_STRIP_CLASSES, formatDate } from '../lib/labels'
import { categoryGroupLabel } from '../lib/boardPresets'
import { BOARD_HELP, STATUS_HELP } from '../lib/helpTexts'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'
import type { DeliverableArea, DeliverableStatus } from '../types/enums'
import NotFoundPage from './NotFoundPage'

const provider = getDataProvider()
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

interface BoardRow {
  deliverable: Deliverable
  latestVersionNo: number
}

export default function AreaBoardPage() {
  const { area } = useParams<{ area: string }>()
  if (!area || !BOARD_AREAS.includes(area as DeliverableArea)) return <NotFoundPage />
  return <AreaBoard area={area as DeliverableArea} />
}

function AreaBoard({ area }: { area: DeliverableArea }) {
  const { projectId, summaries } = useProject()
  const [statusFilter, setStatusFilter] = useState<DeliverableStatus | ''>('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  // P5-③(3.15.1) — 제목 검색. 목록 조회 자체는 그대로 두고 클라이언트에서 부분 일치로 거른다
  // (provider 필터 계약을 넓히지 않기 위함 — 이 화면 밖 다른 소비자에겐 영향 없음).
  const [titleQuery, setTitleQuery] = useState('')
  // P7(3.15.1) "카테고리가 빌더를 결정한다" — 방금 만든 항목이 큐시트면 인라인 에디터를 바로 연다
  const [justCreatedCue, setJustCreatedCue] = useState<Deliverable | null>(null)

  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])

  const board = useAsync<BoardRow[]>(async () => {
    const items = await provider.listDeliverables(projectId, {
      area,
      status: statusFilter || undefined,
      assignee_id: assigneeFilter || undefined,
    })
    return Promise.all(
      items.map(async (deliverable) => {
        const detail = await provider.getDeliverable(deliverable.id)
        return { deliverable, latestVersionNo: detail.versions[0]?.version_no ?? 0 }
      }),
    )
  }, [projectId, area, statusFilter, assigneeFilter])

  const memberName = (userId: string | null) =>
    members.data?.find((m) => m.user_id === userId)?.profile.name ?? '미배정'

  // v1.5 §8: 종료 행사는 읽기 전용 — provider가 쓰기 API를 409로 막으므로 생성 폼도 내린다.
  // (폼이 남아 있으면 지난 행사를 참고 자료로 열람할 때 아직 쓸 수 있는 것처럼 읽힌다.)
  const isClosed = summaries.find((s) => s.id === projectId)?.status === 'closed'
  const canWrite =
    !isClosed && currentUser.data && (currentUser.data.role === 'pm' || currentUser.data.role === area)
  const isPm = !isClosed && currentUser.data?.role === 'pm'
  // ItemDetailPage와 동일 기준(§6.1) — 큐시트 편집은 pm·ops만
  const canEditCue = currentUser.data?.role === 'pm' || currentUser.data?.role === 'ops'

  const visibleRows = useMemo(() => {
    const q = titleQuery.trim().toLowerCase()
    const rows = board.data ?? []
    return q === '' ? rows : rows.filter((r) => r.deliverable.title.toLowerCase().includes(q))
  }, [board.data, titleQuery])

  const grouped = new Map<string, BoardRow[]>()
  for (const row of visibleRows) {
    const list = grouped.get(row.deliverable.category) ?? []
    list.push(row)
    grouped.set(row.deliverable.category, list)
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption={`S2 · ${AREA_LABELS[area]} 보드`}
        title={`${AREA_LABELS[area]} 보드`}
        // 페이지 타이틀(h1) 자체의 접근성 이름에 "도움말"이 섞이지 않도록, InfoTip은
        // h1 안이 아니라 PageHeader의 action 슬롯(형제 엘리먼트)에 둔다.
        // BOARD_AREAS(design·ops)만 이 화면에 도달하므로 좁혀서 인덱싱한다(BOARD_HELP엔 common이 없다).
        action={<InfoTip text={BOARD_HELP[area as 'design' | 'ops']} />}
      />

      <ErrorAlert message={board.error} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-sub">
          상태
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeliverableStatus | '')}
            className="ui-input"
          >
            <option value="">전체</option>
            {(Object.keys(STATUS_LABELS) as DeliverableStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-sub">
          담당
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="ui-input"
          >
            <option value="">전체</option>
            {members.data?.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-sub">
          제목 검색
          <input
            type="search"
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            placeholder="제목으로 찾기"
            className="ui-input w-48"
          />
        </label>
      </div>

      <StatusLegend />

      {board.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
      {board.data && visibleRows.length === 0 && <EmptyState message="조건에 맞는 항목이 없습니다." />}

      <div className="space-y-6">
        {[...grouped.entries()].map(([category, rows]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-baseline gap-2 px-1">
              <span className="text-xs font-medium tracking-wide text-brown">{categoryGroupLabel(category)}</span>
              <span className="text-xs text-ink-cap">{rows.length}건</span>
            </div>
            <ul className="space-y-2">
              {rows.map(({ deliverable, latestVersionNo }) => (
                <BoardRowItem
                  key={deliverable.id}
                  deliverable={deliverable}
                  latestVersionNo={latestVersionNo}
                  assigneeName={memberName(deliverable.assignee_id)}
                  canWrite={!!canWrite}
                  onChanged={board.reload}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canWrite ? (
        <DeliverableAddForm
          area={area}
          projectId={projectId}
          isPm={!!isPm}
          onCreated={(created) => {
            board.reload()
            setJustCreatedCue(created.category === '큐시트' ? created : null)
          }}
        />
      ) : isClosed ? (
        <p className="text-sm text-ink-cap">종료된 행사입니다 — 열람만 가능합니다.</p>
      ) : currentUser.data ? (
        <p className="text-sm text-ink-cap">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
      ) : null}

      {/* P7 "카테고리가 빌더를 결정한다" 채택안 — 보드 화면 안 인라인 패널(기존 CuesheetEditor 재사용).
          생성 직후 바로 편집을 이어갈 수 있게 항목 추가 카드 바로 아래에 연다. */}
      {justCreatedCue && (
        <Card
          title={`큐시트 바로 편집 — ${justCreatedCue.title}`}
          action={
            <button type="button" onClick={() => setJustCreatedCue(null)} className="btn btn-ghost btn-sm">
              닫기
            </button>
          }
        >
          <CuesheetEditor deliverableId={justCreatedCue.id} canEdit={canEditCue} />
          <Link to={`/items/${justCreatedCue.id}`} className="mt-3 inline-block text-sm text-steel hover:underline">
            상세 화면으로 이동
          </Link>
        </Card>
      )}
    </section>
  )
}

/** 상태 뱃지 범례 — P8(3.15.1). 뱃지가 행마다 많이 뜨므로 항목별 InfoTip 대신
 * 필터 바로 아래 한 곳에 전 상태를 모아 title 속성으로 설명한다(과밀 금지). */
function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="상태 범례">
      <span className="t-caption">상태 범례</span>
      {(Object.keys(STATUS_LABELS) as DeliverableStatus[]).map((s) => (
        <span
          key={s}
          title={STATUS_HELP[s]}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[s]}`}
        >
          {STATUS_LABELS[s]}
        </span>
      ))}
    </div>
  )
}

function BoardRowItem({
  deliverable,
  latestVersionNo,
  assigneeName,
  canWrite,
  onChanged,
}: {
  deliverable: Deliverable
  latestVersionNo: number
  assigneeName: string
  canWrite: boolean
  onChanged: () => void
}) {
  const transition = useMutation(() => provider.transitionStatus(deliverable.id, 'internal_review'))

  const handleTransition = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const result = await transition.run()
    if (result) onChanged()
  }

  return (
    <li className="ui-card relative overflow-hidden">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STRIP_CLASSES[deliverable.status]}`} />
      <Link
        to={`/items/${deliverable.id}`}
        className="flex flex-wrap items-center gap-3 py-3 pr-4 pl-5 hover:opacity-70"
      >
        <StatusBadge status={deliverable.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{deliverable.title}</span>
        <span className="shrink-0 text-xs text-ink-sub">
          {latestVersionNo > 0 ? `v${latestVersionNo}` : '버전 없음'}
        </span>
        <span className="shrink-0 text-xs text-ink-sub">{assigneeName}</span>
        {deliverable.due_date ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-sub">
            {formatDate(deliverable.due_date)}
            <DdayBadge isoDate={deliverable.due_date} />
          </span>
        ) : (
          <span className="shrink-0 text-xs text-ink-cap">마감 미정</span>
        )}
        {canWrite && deliverable.status === 'draft' && (
          <button type="button" onClick={handleTransition} disabled={transition.pending} className="btn btn-ghost btn-sm shrink-0">
            내부검토 요청
          </button>
        )}
      </Link>
      {transition.error && (
        <div className="px-5 pb-3">
          <ErrorAlert message={transition.error} />
        </div>
      )}
    </li>
  )
}
