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
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import GuideBuilder from '../components/guide/GuideBuilder'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { AREA_LABELS, OPS_DOC_CARD_LABELS, STATUS_BADGE_CLASSES, STATUS_LABELS, STATUS_STRIP_CLASSES, formatDate } from '../lib/labels'
import { categoryGroupLabel } from '../lib/boardPresets'
import { BOARD_HELP, OPS_DOC_CARD_HELP, STATUS_HELP } from '../lib/helpTexts'
import { getDataProvider } from '../providers'
import type { Deliverable } from '../types/entities'
import { isStructuredDocCategory, type DeliverableArea, type DeliverableStatus } from '../types/enums'
import NotFoundPage from './NotFoundPage'

const provider = getDataProvider()
const BOARD_AREAS: DeliverableArea[] = ['design', 'ops']

/** v2.5 §10.2 — 운영보드 홈 유형 카드 4종 키. OPS_DOC_CARD_LABELS(lib/labels.ts)와 1:1. */
type OpsDocCardKey = keyof typeof OPS_DOC_CARD_LABELS

/** 표시 레벨 분류만 한다(R-O1) — 데이터(Deliverable.category)는 절대 바꾸지 않는다. */
function classifyOpsCard(category: string): OpsDocCardKey {
  if (category === '큐시트') return 'cuesheet'
  if (category === '시나리오') return 'scenario'
  if (category === '운영가이드') return 'guide'
  return 'other'
}

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
  // v2.5 §10.2 — ops 보드 유형 우선 홈. 미선택(null)이면 기존과 동일하게 전 카테고리를 보여준다
  // (design 보드는 이 상태를 아예 쓰지 않는다 — 카드 자체가 area==='ops'일 때만 렌더된다).
  const [selectedCard, setSelectedCard] = useState<OpsDocCardKey | null>(null)
  // P7(3.15.1)→3.16b 일반화 "카테고리가 빌더를 결정한다" — 정형 3종(큐시트·시나리오·운영가이드) 중
  // 하나가 인라인으로 펼쳐져 있으면 그 항목을 담는다(생성 직후 자동 오픈 · 행의 "빌더 열기" 수동 토글 공용).
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
        // 레거시 판정은 시나리오·운영가이드에만 적용한다(브리프 지시 — 큐시트는 3.6c부터 이미
        // 빌더 전용이라 자유 카테고리 레거시 사례가 없다). 읽기 전용 호출만 한다(R-O1 — 쓰기 0건).
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
  // ItemDetailPage와 동일 기준(§6.1) — 큐시트 편집은 pm·ops만
  const canEditCue = currentUser.data?.role === 'pm' || currentUser.data?.role === 'ops'

  const visibleRows = useMemo(() => {
    const q = titleQuery.trim().toLowerCase()
    const rows = board.data ?? []
    return q === '' ? rows : rows.filter((r) => r.deliverable.title.toLowerCase().includes(q))
  }, [board.data, titleQuery])

  // 유형 카드가 선택돼 있으면(ops만) 그 유형으로 좁힌다. 미선택이면 기존과 동일하게 전부 보여준다
  // — 기존 테스트(카드 미도입 시절)가 카드 선택 없이 바로 항목을 찾는 경로를 그대로 지원해야 한다.
  const cardFilteredRows = useMemo(() => {
    if (area !== 'ops' || !selectedCard) return visibleRows
    return visibleRows.filter((r) => classifyOpsCard(r.deliverable.category) === selectedCard)
  }, [visibleRows, area, selectedCard])

  const grouped = new Map<string, BoardRow[]>()
  for (const row of cardFilteredRows) {
    const list = grouped.get(row.deliverable.category) ?? []
    list.push(row)
    grouped.set(row.deliverable.category, list)
  }

  // v2.5 §10.2 — 카드 4종 건수·최신 상태 요약. 상태·담당 필터는 반영하되(다른 카운트 표시와 일관),
  // 제목 검색은 반영하지 않는다(카드는 안정적인 상단 내비게이션 — 검색은 목록에만 영향).
  const opsCardSummaries = useMemo(() => {
    if (area !== 'ops') return []
    const rows = board.data ?? []
    return (Object.keys(OPS_DOC_CARD_LABELS) as OpsDocCardKey[]).map((key) => {
      const items = rows.filter((r) => classifyOpsCard(r.deliverable.category) === key)
      const latest = items.reduce<BoardRow | null>((acc, r) => {
        if (!acc) return r
        return r.deliverable.updated_at > acc.deliverable.updated_at ? r : acc
      }, null)
      return { key, count: items.length, latest }
    })
  }, [area, board.data])

  const toggleBuilder = (deliverable: Deliverable) => {
    setExpandedDoc((cur) => (cur?.id === deliverable.id ? null : deliverable))
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

      {/* v2.5 §10.2 — 유형 우선 보드 홈. design 보드는 렌더 무변경(카드 자체가 없다). */}
      {area === 'ops' && (
        <OpsDocCardGrid summaries={opsCardSummaries} selected={selectedCard} onSelect={setSelectedCard} />
      )}

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
      {board.data && cardFilteredRows.length === 0 && <EmptyState message="조건에 맞는 항목이 없습니다." />}

      <div className="space-y-6">
        {[...grouped.entries()].map(([category, rows]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-baseline gap-2 px-1">
              <span className="text-xs font-medium tracking-wide text-brown">{categoryGroupLabel(category)}</span>
              <span className="text-xs text-ink-cap">{rows.length}건</span>
            </div>
            <ul className="space-y-2">
              {rows.map((row) => (
                <BoardRowItem
                  key={row.deliverable.id}
                  row={row}
                  assigneeName={memberName(row.deliverable.assignee_id)}
                  canWrite={!!canWrite}
                  isExpanded={expandedDoc?.id === row.deliverable.id}
                  onToggleBuilder={toggleBuilder}
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
            // v2.5 §10.2 — P7의 완성형: 큐시트뿐 아니라 정형 3종 전부에서 생성 직후 빌더가 열린다.
            setExpandedDoc(isStructuredDocCategory(created.category) ? created : null)
          }}
        />
      ) : isClosed ? (
        <p className="text-sm text-ink-cap">종료된 행사입니다 — 열람만 가능합니다.</p>
      ) : currentUser.data ? (
        <p className="text-sm text-ink-cap">이 영역에는 쓰기 권한이 없습니다(열람만 가능).</p>
      ) : null}

      {/* P7 "카테고리가 빌더를 결정한다" → 3.16b 보드 레벨 확장 — 인라인 패널(별도 화면 이동 없음).
          생성 직후 자동으로, 또는 행의 "빌더 열기"로 수동으로 연다. 정형 카테고리 문자열이 그대로
          한국어 라벨이라 헤딩 문구("큐시트 바로 편집 — …")가 기존 계약과 그대로 일치한다. */}
      {expandedDoc && (
        <Card
          title={`${expandedDoc.category} 바로 편집 — ${expandedDoc.title}`}
          action={
            <button type="button" onClick={() => setExpandedDoc(null)} className="btn btn-ghost btn-sm">
              닫기
            </button>
          }
        >
          <div data-testid={`builder-panel-${classifyOpsCard(expandedDoc.category)}`}>
            {expandedDoc.category === '큐시트' && (
              <CuesheetEditor deliverableId={expandedDoc.id} canEdit={canEditCue} />
            )}
            {expandedDoc.category === '시나리오' && (
              <ScenarioBuilder deliverableId={expandedDoc.id} canEdit={canEditCue} />
            )}
            {expandedDoc.category === '운영가이드' && (
              <GuideBuilder deliverableId={expandedDoc.id} canEdit={canEditCue} />
            )}
          </div>
          <Link to={`/items/${expandedDoc.id}`} className="mt-3 inline-block text-sm text-steel hover:underline">
            상세 화면으로 이동
          </Link>
        </Card>
      )}
    </section>
  )
}

/** v2.5 §10.2 — 운영보드 홈 상단 유형 카드 4종. 클릭 = 그 유형으로 목록 필터(다시 클릭하면 해제). */
function OpsDocCardGrid({
  summaries,
  selected,
  onSelect,
}: {
  summaries: { key: OpsDocCardKey; count: number; latest: BoardRow | null }[]
  selected: OpsDocCardKey | null
  onSelect: (key: OpsDocCardKey | null) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {summaries.map(({ key, count, latest }) => {
        const active = selected === key
        return (
          // InfoTip은 자체 <button>이라 카드 전체를 <button>으로 감싸면 버튼 중첩(무효 HTML)이
          // 된다 — 바깥은 위치 기준 <div>, 선택 동작은 그 안의 별도 <button>, InfoTip은 형제로 둔다.
          <div
            key={key}
            data-testid={`ops-doc-card-${key}`}
            className={`relative rounded-[10px] border p-4 transition-colors ${
              active ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:bg-track'
            }`}
          >
            <button
              type="button"
              aria-pressed={active}
              // 버튼 안 상태 뱃지 텍스트까지 접근성 이름에 섞이지 않도록 라벨을 명시한다
              // (시각 텍스트는 아래 t-card-title 그대로 — 스크린리더·테스트만 이 이름을 쓴다).
              aria-label={OPS_DOC_CARD_LABELS[key]}
              onClick={() => onSelect(active ? null : key)}
              className="block w-full text-left"
            >
              <span className="t-card-title block pr-5">{OPS_DOC_CARD_LABELS[key]}</span>
              <span className="mt-1.5 block text-2xl font-semibold text-ink">{count}건</span>
              <span className="mt-1.5 block">
                {latest ? <StatusBadge status={latest.deliverable.status} /> : (
                  <span className="t-caption">항목 없음</span>
                )}
              </span>
            </button>
            <span className="absolute right-3 top-3">
              <InfoTip text={OPS_DOC_CARD_HELP[key]} />
            </span>
          </div>
        )
      })}
    </div>
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
  row,
  assigneeName,
  canWrite,
  isExpanded,
  onToggleBuilder,
  onChanged,
}: {
  row: BoardRow
  assigneeName: string
  canWrite: boolean
  /** 이 항목의 인라인 빌더 패널이 지금 펼쳐져 있는지(부모의 expandedDoc과 id 비교) */
  isExpanded: boolean
  /** "빌더 열기/닫기" 클릭 — 부모가 expandedDoc을 토글한다(정형 3종·비레거시 항목에만 노출) */
  onToggleBuilder: (deliverable: Deliverable) => void
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
    </li>
  )
}
