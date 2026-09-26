import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import Card from '../components/internal/Card'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import FilterEmptyState, { type AppliedFilter } from '../components/internal/FilterEmptyState'
import InfoTip from '../components/internal/InfoTip'
import PageHeader from '../components/internal/PageHeader'
import BoardFilterBar from '../components/board/BoardFilterBar'
import BoardGroupHeading from '../components/board/BoardGroupHeading'
import DeliverableAddForm from '../components/board/DeliverableAddForm'
import DesignBoard from '../components/board/DesignBoard'
import OpsDocCardGrid, { type OpsDocCardSummary } from '../components/board/OpsDocCardGrid'
import OpsDocTable, { type OpsBoardRow } from '../components/board/OpsDocTable'
import {
  CARD_PRESET_CATEGORY,
  OPS_DOC_CARD_ORDER,
  classifyOpsCard,
  type OpsDocCardKey,
} from '../components/board/opsDocCards'
import { cardSummary, cueMetrics, guideMetrics, scenarioMetrics, type OpsDocMetrics } from '../components/board/opsDocMetrics'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { AREA_LABELS, OPS_DOC_CARD_LABELS, STATUS_LABELS } from '../lib/labels'
import { BOARD_HELP, OPS_BOARD_HEADER_HELP } from '../lib/helpTexts'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'
import { isStructuredDocCategory, type DeliverableArea, type DeliverableStatus, type MemberRole } from '../types/enums'
import NotFoundPage from './NotFoundPage'

const provider = getDataProvider()
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

/** 확정(final) 건수 — 그룹 헤딩·유형 카드의 진행 막대 분자 */
function doneCountOf(rows: { deliverable: Deliverable }[]): number {
  return rows.filter((r) => r.deliverable.status === 'final').length
}

export default function AreaBoardPage() {
  const { area } = useParams<{ area: string }>()
  if (!area || !BOARD_AREAS.includes(area as DeliverableArea)) return <NotFoundPage />
  // Phase 3.23 PR-3(§7-2.6) — 디자인 보드는 '다음 행동' 표·갤러리로 따로 그린다. 아래 AreaBoard는 운영 보드(유형 우선 v2.5)다.
  if (area === 'design') return <DesignBoard />
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

  const board = useAsync<OpsBoardRow[]>(async () => {
    const items = await provider.listDeliverables(projectId, {
      area,
      status: statusFilter || undefined,
      assignee_id: assigneeFilter || undefined,
    })
    // v2.13 §23.6 — 유형마다 그 문서가 담은 숫자(큐·멘트·섹션). 읽기 전용 호출만 한다(R-O1 — 쓰기 0건)
    const sessions = items.some((d) => d.category === '시나리오') ? await provider.listProgramSessions(projectId) : []
    return Promise.all(
      items.map(async (deliverable) => {
        const detail = await provider.getDeliverable(deliverable.id)
        let builderRowCount: number | null = null
        let metrics: OpsDocMetrics
        // 레거시 판정은 시나리오·운영가이드에만 적용한다(큐시트는 3.6c부터 이미 빌더 전용이라
        // 자유 카테고리 레거시 사례가 없다).
        if (deliverable.category === '큐시트') {
          metrics = cueMetrics(await provider.listCues(deliverable.id))
        } else if (deliverable.category === '시나리오') {
          const blocks = await provider.listScenarioBlocks(deliverable.id)
          builderRowCount = blocks.length
          metrics = scenarioMetrics(blocks, sessions)
        } else if (deliverable.category === '운영가이드') {
          const sections = await provider.listGuideSections(deliverable.id)
          builderRowCount = sections.length
          metrics = guideMetrics(sections)
        } else {
          metrics = { type: 'other', latest: detail.versions[0] ?? null }
        }
        return { deliverable, latest: detail.versions[0] ?? null, builderRowCount, metrics }
      }),
    )
  }, [projectId, area, statusFilter, assigneeFilter])

  // 3.17b — 빈 상태 ③(필터 결과 없음)이 보여줄 "전체 건수". 상태·담당 필터는 provider가
  // 적용하므로 걸러지지 않은 목록을 따로 한 번 읽는다(읽기 전용 · 데이터 무변경).
  const allItems = useAsync(() => provider.listDeliverables(projectId, { area }), [projectId, area])

  const memberOf = (userId: string | null) => members.data?.find((m) => m.user_id === userId)
  const memberName = (userId: string | null) => memberOf(userId)?.profile.name ?? '미배정'
  const memberRole = (userId: string | null): MemberRole | null => memberOf(userId)?.role ?? null

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

  // v2.5 §10.2 — 카드 4종 건수·대표 상태·확정 건수. 상태·담당 필터는 반영하되(다른 카운트 표시와
  // 일관), 제목 검색은 반영하지 않는다(카드는 안정적인 상단 내비게이션 — 검색은 목록에만 영향).
  const opsCardSummaries = useMemo<OpsDocCardSummary[]>(() => {
    if (area !== 'ops') return []
    const rows = board.data ?? []
    return OPS_DOC_CARD_ORDER.map((key) => {
      const items = rows.filter((r) => classifyOpsCard(r.deliverable.category) === key)
      const latest = items.reduce<OpsBoardRow | null>((acc, r) => {
        if (!acc) return r
        return r.deliverable.updated_at > acc.deliverable.updated_at ? r : acc
      }, null)
      return {
        key,
        count: items.length,
        latestStatus: latest?.deliverable.status ?? null,
        doneCount: doneCountOf(items),
        ...cardSummary(
          key,
          items.map((r) => ({ status: r.deliverable.status, metrics: r.metrics })),
        ),
      }
    })
  }, [area, board.data])

  const toggleBuilder = (deliverable: Deliverable) => {
    // 닫을 때 표의 요약 숫자(큐·멘트·섹션)를 다시 읽는다 — 빌더에서 고친 것이 줄에 바로 보이게
    if (expandedDoc?.id === deliverable.id) board.reload()
    setExpandedDoc((cur) => (cur?.id === deliverable.id ? null : deliverable))
  }

  const closeBuilder = () => {
    board.reload()
    setExpandedDoc(null)
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

  const renderTable = (key: OpsDocCardKey, rows: OpsBoardRow[]) => (
    <OpsDocTable
      cardKey={key}
      rows={rows}
      memberName={memberName}
      memberRole={memberRole}
      canWrite={!!canWrite}
      canEditBuilder={canEditCue}
      expandedId={expandedDoc?.id ?? null}
      onToggleBuilder={toggleBuilder}
      onCloseBuilder={closeBuilder}
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
        allItems.reload()
        // v2.5 §10.2 — P7의 완성형: 큐시트뿐 아니라 정형 3종 전부에서 생성 직후 빌더가 열린다.
        setExpandedDoc(isStructuredDocCategory(created.category) ? created : null)
      }}
    />
  ) : isClosed ? (
    <p className="text-sm text-ink-cap">종료된 행사입니다 — 열람만 가능합니다.</p>
  ) : currentUser.data ? (
    <p className="text-sm text-ink-cap">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
  ) : null

  // 3.17b 빈 상태 정본(§06) — ② '문서 없음'과 ③ '필터 결과 없음'을 반드시 가른다.
  const appliedFilters: AppliedFilter[] = []
  if (statusFilter) appliedFilters.push({ label: '상태', value: STATUS_LABELS[statusFilter] })
  if (assigneeFilter) appliedFilters.push({ label: '담당', value: memberName(assigneeFilter) })
  if (titleQuery.trim()) appliedFilters.push({ label: '제목 검색', value: titleQuery.trim() })

  const resetFilters = () => {
    setStatusFilter('')
    setAssigneeFilter('')
    setTitleQuery('')
  }

  // ③이 보여줄 전체 건수 — 유형 카드가 선택돼 있으면 그 유형 범위의 전체 건수다.
  const scopedTotal = useMemo(() => {
    const items = allItems.data ?? []
    if (area !== 'ops' || !selectedCard) return items.length
    return items.filter((d) => classifyOpsCard(d.category) === selectedCard).length
  }, [allItems.data, area, selectedCard])

  const emptyLabel =
    area === 'ops' && selectedCard
      ? `아직 ${OPS_DOC_CARD_LABELS[selectedCard]} 문서가 없습니다.`
      : '아직 등록된 항목이 없습니다.'

  const emptyMessage =
    board.data && cardFilteredRows.length === 0 ? (
      appliedFilters.length > 0 ? (
        <FilterEmptyState
          totalCount={scopedTotal}
          filters={appliedFilters}
          onReset={resetFilters}
        />
      ) : (
        <EmptyState message={emptyLabel} />
      )
    ) : null
  const loadingMessage = board.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="운영"
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
        <Card
          title={`${OPS_DOC_CARD_LABELS[selectedCard]} — 문서 목록`}
          action={<span className="print-hidden">{filterBar(true)}</span>}
        >
          <div className="space-y-4">
            {loadingMessage}
            {emptyMessage}
            {cardFilteredRows.length > 0 && renderTable(selectedCard, cardFilteredRows)}
            {addForm}
          </div>
        </Card>
      ) : (
        <>
          <div className="print-hidden">{filterBar(false)}</div>
          {loadingMessage}
          {emptyMessage}
          <BoardGroupList rows={cardFilteredRows} renderTable={renderTable} />
          {addForm}
        </>
      )}
    </section>
  )
}

/**
 * 전체 보기(유형 미선택) 목록 — 유형마다 그룹 헤더(카드 명칭과 같다) + 그 유형의 표(v2.13 §23.6).
 * 기타 제작물의 원시 카테고리(존운영 등)는 표의 문서 칸 아래 줄로 남긴다(어떤 항목인지 잃지 않게).
 */
function BoardGroupList({
  rows,
  renderTable,
}: {
  rows: OpsBoardRow[]
  renderTable: (key: OpsDocCardKey, rows: OpsBoardRow[]) => ReactNode
}) {
  const byCard = new Map<OpsDocCardKey, OpsBoardRow[]>()
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
        return (
          <div key={key} className="space-y-3" data-testid={`ops-doc-group-${key}`}>
            <BoardGroupHeading
              label={OPS_DOC_CARD_LABELS[key]}
              count={groupRows.length}
              doneCount={doneCountOf(groupRows)}
            />
            <div className="ui-card">{renderTable(key, groupRows)}</div>
          </div>
        )
      })}
    </div>
  )
}
