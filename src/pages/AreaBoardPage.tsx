import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import DdayBadge from '../components/internal/DdayBadge'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import InfoTip from '../components/internal/InfoTip'
import PageHeader from '../components/internal/PageHeader'
import StatusBadge from '../components/internal/StatusBadge'
import BoardFilterBar from '../components/board/BoardFilterBar'
import DeliverableAddForm from '../components/board/DeliverableAddForm'
import OpsDocCardGrid, { type OpsDocCardSummary } from '../components/board/OpsDocCardGrid'
import {
  CARD_PRESET_CATEGORY,
  OPS_DOC_CARD_ORDER,
  classifyOpsCard,
  type OpsDocCardKey,
} from '../components/board/opsDocCards'
import CuesheetEditor from '../components/cue/CuesheetEditor'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import GuideBuilder from '../components/guide/GuideBuilder'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import {
  AREA_LABELS,
  OPS_DOC_CARD_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  STATUS_STRIP_CLASSES,
  formatDate,
} from '../lib/labels'
import { categoryGroupLabel } from '../lib/boardPresets'
import { BOARD_HELP, OPS_BOARD_HEADER_HELP, STATUS_HELP } from '../lib/helpTexts'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'
import { isStructuredDocCategory, type DeliverableArea, type DeliverableStatus } from '../types/enums'
import NotFoundPage from './NotFoundPage'

const provider = getDataProvider()
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

interface BoardRow {
  deliverable: Deliverable
  latestVersionNo: number
  /**
   * 시나리오·운영가이드 항목의 빌더 행 수(scenario_blocks·guide_sections). 그 외 카테고리는 null
   * (해당 없음). 레거시 파일 문서 판정에만 쓴다 — 0이고 버전이 있으면 v2.5 이전 자유 카테고리
   * 문서로 간주해 빌더를 강제로 열지 않는다(브리프 "레거시 파일 문서 보호" 지시).
   */
  builderRowCount: number | null
}

/** 빌더 행 0 + 버전 1개 이상 = v2.5 이전부터 파일로 쌓아온 레거시 문서 — 빌더를 열지 않는다. */
function isLegacyFileDoc(row: BoardRow): boolean {
  return row.builderRowCount === 0 && row.latestVersionNo >= 1
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
  // v2.5 §10.2 — ops 보드 유형 우선 홈. 미선택(null)이면 전 유형 그룹을 나열한다
  // (design 보드는 이 상태를 아예 쓰지 않는다 — 카드 자체가 area==='ops'일 때만 렌더된다).
  const [selectedCard, setSelectedCard] = useState<OpsDocCardKey | null>(null)
  // P7(3.15.1)→3.16b 일반화 "카테고리가 빌더를 결정한다" — 정형 3종(큐시트·시나리오·운영가이드) 중
  // 하나가 인라인으로 펼쳐져 있으면 그 항목을 담는다(생성 직후 자동 오픈 · 행의 "빌더 열기" 수동 토글 공용).
  // P11: 펼침 위치는 페이지 하단 분리 패널이 아니라 **그 행 바로 아래**다(목업 화면 A).
  const [expandedDoc, setExpandedDoc] = useState<Deliverable | null>(null)

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
        let builderRowCount: number | null = null
        // 레거시 판정은 시나리오·운영가이드에만 적용한다(큐시트는 3.6c부터 이미 빌더 전용이라
        // 자유 카테고리 레거시 사례가 없다). 읽기 전용 호출만 한다(R-O1 — 쓰기 0건).
        if (deliverable.category === '시나리오') {
          builderRowCount = (await provider.listScenarioBlocks(deliverable.id)).length
        } else if (deliverable.category === '운영가이드') {
          builderRowCount = (await provider.listGuideSections(deliverable.id)).length
        }
        return { deliverable, latestVersionNo: detail.versions[0]?.version_no ?? 0, builderRowCount }
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
  // ItemDetailPage와 동일 기준(§6.1) — 정형 문서 편집은 pm·ops만
  const canEditCue = currentUser.data?.role === 'pm' || currentUser.data?.role === 'ops'

  const visibleRows = useMemo(() => {
    const q = titleQuery.trim().toLowerCase()
    const rows = board.data ?? []
    return q === '' ? rows : rows.filter((r) => r.deliverable.title.toLowerCase().includes(q))
  }, [board.data, titleQuery])

  // 유형 카드가 선택돼 있으면(ops만) 그 유형으로 좁힌다. 미선택이면 전부 보여준다
  // — 기존 테스트(카드 미도입 시절)가 카드 선택 없이 바로 항목을 찾는 경로를 그대로 지원해야 한다.
  const cardFilteredRows = useMemo(() => {
    if (area !== 'ops' || !selectedCard) return visibleRows
    return visibleRows.filter((r) => classifyOpsCard(r.deliverable.category) === selectedCard)
  }, [visibleRows, area, selectedCard])

  // v2.5 §10.2 — 카드 4종 건수·대표 상태. 상태·담당 필터는 반영하되(다른 카운트 표시와 일관),
  // 제목 검색은 반영하지 않는다(카드는 안정적인 상단 내비게이션 — 검색은 목록에만 영향).
  const opsCardSummaries = useMemo<OpsDocCardSummary[]>(() => {
    if (area !== 'ops') return []
    const rows = board.data ?? []
    return OPS_DOC_CARD_ORDER.map((key) => {
      const items = rows.filter((r) => classifyOpsCard(r.deliverable.category) === key)
      const latest = items.reduce<BoardRow | null>((acc, r) => {
        if (!acc) return r
        return r.deliverable.updated_at > acc.deliverable.updated_at ? r : acc
      }, null)
      return { key, count: items.length, latestStatus: latest?.deliverable.status ?? null }
    })
  }, [area, board.data])

  const toggleBuilder = (deliverable: Deliverable) => {
    setExpandedDoc((cur) => (cur?.id === deliverable.id ? null : deliverable))
  }

  // P10 — 카드 선택 시 아래 영역은 "그 유형의 목록 + 인라인 빌더만" 남는다:
  // 다른 유형의 빌더 패널이 열려 있었다면 닫아 표시 정합을 맞춘다(해제(null)면 그대로 둔다).
  const handleSelectCard = (key: OpsDocCardKey | null) => {
    setSelectedCard(key)
    if (key) {
      setExpandedDoc((cur) => (cur && classifyOpsCard(cur.category) !== key ? null : cur))
    }
  }

  const filterBar = (compact: boolean) => (
    <BoardFilterBar
      statusFilter={statusFilter}
      onStatusChange={setStatusFilter}
      assigneeFilter={assigneeFilter}
      onAssigneeChange={setAssigneeFilter}
      titleQuery={titleQuery}
      onTitleQueryChange={setTitleQuery}
      members={members.data ?? []}
      compact={compact}
    />
  )

  const renderRow = (row: BoardRow) => (
    <BoardRowItem
      key={row.deliverable.id}
      row={row}
      assigneeName={memberName(row.deliverable.assignee_id)}
      canWrite={!!canWrite}
      isExpanded={expandedDoc?.id === row.deliverable.id}
      canEditBuilder={canEditCue}
      onToggleBuilder={toggleBuilder}
      onCloseBuilder={() => setExpandedDoc(null)}
      onChanged={board.reload}
    />
  )

  const addForm = canWrite ? (
    <DeliverableAddForm
      area={area}
      projectId={projectId}
      isPm={!!isPm}
      presetCategory={area === 'ops' && selectedCard ? CARD_PRESET_CATEGORY[selectedCard] : undefined}
      onCreated={(created) => {
        board.reload()
        // v2.5 §10.2 — P7의 완성형: 큐시트뿐 아니라 정형 3종 전부에서 생성 직후 빌더가 열린다.
        setExpandedDoc(isStructuredDocCategory(created.category) ? created : null)
      }}
    />
  ) : isClosed ? (
    <p className="text-sm text-ink-cap">종료된 행사입니다 — 열람만 가능합니다.</p>
  ) : currentUser.data ? (
    <p className="text-sm text-ink-cap">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
  ) : null

  const emptyMessage = board.data && cardFilteredRows.length === 0 && (
    <EmptyState message="조건에 맞는 항목이 없습니다." />
  )
  const loadingMessage = board.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption={`S2 · ${AREA_LABELS[area]} 보드`}
        title={`${AREA_LABELS[area]} 보드`}
        // 페이지 타이틀(h1) 자체의 접근성 이름에 "도움말"이 섞이지 않도록, InfoTip은
        // h1 안이 아니라 PageHeader의 action 슬롯(형제 엘리먼트)에 둔다.
        // P11: 운영보드는 상태 범례 행을 없앤 대신 그 내용을 이 도움말에 합쳤다.
        action={<InfoTip text={area === 'ops' ? OPS_BOARD_HEADER_HELP : BOARD_HELP.design} />}
      />

      {/* P11 — 목업 화면 A의 헤더 설명줄. 상태 범례를 걷어낸 자리를 이 한 줄이 대신한다. */}
      {area === 'ops' && (
        <p className="-mt-3 text-sm text-ink-sub">문서 유형을 선택하면 해당 빌더가 바로 열립니다.</p>
      )}

      <ErrorAlert message={board.error} />

      {/* v2.5 §10.2 — 유형 우선 보드 홈. design 보드는 렌더 무변경(카드 자체가 없다). */}
      {area === 'ops' && (
        <OpsDocCardGrid summaries={opsCardSummaries} selected={selectedCard} onSelect={handleSelectCard} />
      )}

      {area === 'ops' && selectedCard ? (
        // P11 통합 카드 — 목업 화면 A: 카드 아래는 "[유형명] — 문서 목록" 한 장으로,
        // 필터는 그 헤더 우측에, 항목 추가는 목록 하단에, 빌더는 각 행 바로 아래에 들어간다.
        <Card title={`${OPS_DOC_CARD_LABELS[selectedCard]} — 문서 목록`} action={filterBar(true)}>
          <div className="space-y-4">
            {loadingMessage}
            {emptyMessage}
            {cardFilteredRows.length > 0 && (
              <ul className="space-y-2">{cardFilteredRows.map(renderRow)}</ul>
            )}
            {addForm}
          </div>
        </Card>
      ) : (
        <>
          {filterBar(false)}
          {/* design 보드는 상태 범례를 그대로 둔다(3.16 범위 = 운영보드) */}
          {area === 'design' && <StatusLegend />}
          {loadingMessage}
          {emptyMessage}
          <BoardGroupList
            area={area}
            rows={cardFilteredRows}
            renderRow={renderRow}
          />
          {addForm}
        </>
      )}
    </section>
  )
}

/**
 * 전체 보기(유형 미선택) 목록. P11 — 운영보드의 그룹 헤더는 **카드 명칭과 일치**시키고
 * (큐시트·시나리오·운영가이드·기타 제작물), 원시 카테고리(존운영 등)는 '기타 제작물' 그룹
 * 안의 소제목으로 내린다. 디자인 보드는 종전대로 카테고리 단위 그룹을 그대로 쓴다.
 */
function BoardGroupList({
  area,
  rows,
  renderRow,
}: {
  area: DeliverableArea
  rows: BoardRow[]
  renderRow: (row: BoardRow) => ReactNode
}) {
  if (area !== 'ops') {
    const grouped = new Map<string, BoardRow[]>()
    for (const row of rows) {
      const list = grouped.get(row.deliverable.category) ?? []
      list.push(row)
      grouped.set(row.deliverable.category, list)
    }
    return (
      <div className="space-y-6">
        {[...grouped.entries()].map(([category, groupRows]) => (
          <div key={category} className="space-y-3">
            <GroupHeading label={categoryGroupLabel(category)} count={groupRows.length} />
            <ul className="space-y-2">{groupRows.map(renderRow)}</ul>
          </div>
        ))}
      </div>
    )
  }

  const byCard = new Map<OpsDocCardKey, BoardRow[]>()
  for (const row of rows) {
    const key = classifyOpsCard(row.deliverable.category)
    const list = byCard.get(key) ?? []
    list.push(row)
    byCard.set(key, list)
  }

  return (
    <div className="space-y-6">
      {OPS_DOC_CARD_ORDER.filter((key) => (byCard.get(key)?.length ?? 0) > 0).map((key) => {
        const groupRows = byCard.get(key) ?? []
        if (key !== 'other') {
          return (
            <div key={key} className="space-y-3">
              <GroupHeading label={OPS_DOC_CARD_LABELS[key]} count={groupRows.length} />
              <ul className="space-y-2">{groupRows.map(renderRow)}</ul>
            </div>
          )
        }
        // 기타 제작물 — 원시 카테고리는 그룹 안 소제목으로 유지한다(어떤 항목인지 잃지 않게)
        const byCategory = new Map<string, BoardRow[]>()
        for (const row of groupRows) {
          const list = byCategory.get(row.deliverable.category) ?? []
          list.push(row)
          byCategory.set(row.deliverable.category, list)
        }
        return (
          <div key={key} className="space-y-3">
            <GroupHeading label={OPS_DOC_CARD_LABELS.other} count={groupRows.length} />
            <div className="space-y-4">
              {[...byCategory.entries()].map(([category, categoryRows]) => (
                <div key={category} className="space-y-2">
                  <span className="block px-1 text-xs text-ink-cap">
                    {categoryGroupLabel(category)}
                  </span>
                  <ul className="space-y-2">{categoryRows.map(renderRow)}</ul>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <span className="text-xs font-medium tracking-wide text-brown">{label}</span>
      <span className="text-xs text-ink-cap">{count}건</span>
    </div>
  )
}

/** 상태 뱃지 범례 — P8(3.15.1). 디자인 보드 전용(운영보드는 P11에서 헤더 도움말로 합침). */
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
  row,
  assigneeName,
  canWrite,
  isExpanded,
  canEditBuilder,
  onToggleBuilder,
  onCloseBuilder,
  onChanged,
}: {
  row: BoardRow
  assigneeName: string
  canWrite: boolean
  /** 이 항목의 인라인 빌더가 지금 펼쳐져 있는지(부모의 expandedDoc과 id 비교) */
  isExpanded: boolean
  /** pm·ops만 true — 빌더 편집 권한(§6.1) */
  canEditBuilder: boolean
  /** "빌더 열기/닫기" 클릭 — 부모가 expandedDoc을 토글한다(정형 3종·비레거시 항목에만 노출) */
  onToggleBuilder: (deliverable: Deliverable) => void
  onCloseBuilder: () => void
  onChanged: () => void
}) {
  const { deliverable, latestVersionNo } = row
  const transition = useMutation(() => provider.transitionStatus(deliverable.id, 'internal_review'))
  const structured = isStructuredDocCategory(deliverable.category)
  // 레거시 판정은 시나리오·운영가이드만 대상(builderRowCount가 null이 아닌 경우) — 큐시트는 해당 없음
  const legacy = structured && isLegacyFileDoc(row)

  const handleTransition = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const result = await transition.run()
    if (result) onChanged()
  }

  const handleToggleBuilder = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleBuilder(deliverable)
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
        {/* v2.5 §10.2 인라인 빌더 — 레거시 파일 문서는 빌더를 강제로 열지 않고 안내만 노출한다 */}
        {structured && legacy && (
          <span className="shrink-0 text-xs text-ink-cap">파일 문서 — 상세에서 열람</span>
        )}
        {structured && !legacy && (
          <button type="button" onClick={handleToggleBuilder} className="btn btn-ghost btn-sm shrink-0">
            {isExpanded ? '빌더 닫기' : '빌더 열기'}
          </button>
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

      {/* P11 — 빌더는 이 행 바로 아래(같은 카드 안)에서 펼쳐진다. 별도 화면 이동도,
          페이지 하단 분리 패널도 없다(목업 화면 A "빌더 열기 시 이 자리에서 인라인"). */}
      {isExpanded && (
        <div className="border-t border-border bg-canvas px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="t-card-title">
              {deliverable.category} 바로 편집 — {deliverable.title}
            </h3>
            <span className="flex items-center gap-3">
              <Link to={`/items/${deliverable.id}`} className="text-sm text-steel hover:underline">
                상세 화면으로 이동
              </Link>
              <button type="button" onClick={onCloseBuilder} className="btn btn-ghost btn-sm">
                닫기
              </button>
            </span>
          </div>
          <div data-testid={`builder-panel-${classifyOpsCard(deliverable.category)}`}>
            {deliverable.category === '큐시트' && (
              <CuesheetEditor deliverableId={deliverable.id} canEdit={canEditBuilder} />
            )}
            {deliverable.category === '시나리오' && (
              <ScenarioBuilder deliverableId={deliverable.id} canEdit={canEditBuilder} onStatusChanged={onChanged} />
            )}
            {deliverable.category === '운영가이드' && (
              <GuideBuilder deliverableId={deliverable.id} canEdit={canEditBuilder} onStatusChanged={onChanged} />
            )}
          </div>
        </div>
      )}
    </li>
  )
}
