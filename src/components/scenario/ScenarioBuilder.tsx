// v2.5 §10.2·§23 시나리오 빌더 — 설계서 §10.2 "시나리오 빌더" 절 그대로:
// 세션 그룹(프로그램표 연동) → 진행 블록 행(시각·구분 칩·대본 펼침·비고) + 상단 액션
// (큐시트로 내보내기·인쇄·컨펌 발송 안내). CuesheetEditor(§8.6c 정본)의 행 편집·↑/↓ 정렬·
// 읽기 전용 분기 관례를 그대로 따르되, v9 계약이 개별 CRUD가 아니라 **벌크 전체 교체**
// (saveScenarioBlocks)라 모든 변경은 "로컬 배열 재조립 → 벌크 저장 → reload" 한 경로로 모인다.
import { useMemo, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import InfoTip from '../internal/InfoTip'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import { SCENARIO_VS_CUESHEET_HELP } from '../../lib/helpTexts'
import type { ProgramSession, ScenarioBlock } from '../../types/entities'
import ScenarioBlockForm from './ScenarioBlockForm'
import ScenarioBlockRow from './ScenarioBlockRow'
import ScenarioExportPanel from './ScenarioExportPanel'
import { arrangeScenarioBlocks, groupScenarioBlocks, type ScenarioGroup } from './scenarioGroups'
import { toFormValues, toInput, toPatch, type ScenarioBlockFormValues } from './scenarioFormValues'

const provider = getDataProvider()

export default function ScenarioBuilder({
  deliverableId,
  canEdit,
}: {
  deliverableId: string
  /** pm·ops만 true — §8.2 scenario-blocks 쓰기 권한 */
  canEdit: boolean
}) {
  const deliverable = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const blocksAsync = useAsync(() => provider.listScenarioBlocks(deliverableId), [deliverableId])
  const projectId = deliverable.data?.project_id ?? null
  const sessionsAsync = useAsync(
    () => (projectId ? provider.listProgramSessions(projectId) : Promise.resolve([])),
    [projectId],
  )

  const blocks = blocksAsync.data ?? []
  const sessions = sessionsAsync.data ?? []
  const groups = useMemo(() => groupScenarioBlocks(blocks, sessions), [blocks, sessions])

  // 세션 접기/펼치기(§10.2) — 순수 표시 상태, 저장하지 않는다
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // 대본 전문 패널 펼침 — 행이 아니라 여기서 관리한다: 인쇄(§10.2 "전 블록 대본 전문 포함") 시
  // 접힌 행도 강제로 펼쳐야 하기 때문(handlePrint 참조)
  const [openScripts, setOpenScripts] = useState<Set<string>>(new Set())
  const [moveError, setMoveError] = useState<string | null>(null)

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleScript = (blockId: string) =>
    setOpenScripts((prev) => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })

  /** 로컬 배열(bag) → 그룹 순서로 정규화 → 벌크 저장(saveScenarioBlocks). 모든 변경 경로의 공통 종점. */
  const persist = (bag: ScenarioBlock[]): Promise<ScenarioBlock[]> => {
    const arranged = arrangeScenarioBlocks(bag, sessions)
    return provider.saveScenarioBlocks(deliverableId, arranged.map(toInput))
  }

  const handleSaveEdit = (blockId: string, values: ScenarioBlockFormValues) => {
    const patch = toPatch(values)
    return persist(blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)))
  }

  const handleAdd = (values: ScenarioBlockFormValues) => {
    const patch = toPatch(values)
    const draft: ScenarioBlock = {
      id: `scb-draft-${Date.now()}`,
      deliverable_id: deliverableId,
      sort_order: 0,
      ...patch,
    }
    return persist([...blocks, draft])
  }

  const handleDelete = (blockId: string) => persist(blocks.filter((b) => b.id !== blockId))

  const handleMove = async (group: ScenarioGroup, index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= group.items.length) return
    setMoveError(null)
    const a = group.items[index]
    const b = group.items[j]
    // 그룹 내부 인접 교환 — arrangeScenarioBlocks가 항상 그룹 순서로 정규화하므로
    // 전체 배열(bag)에서 두 블록의 위치만 맞바꾸면 된다.
    const bag = blocks.slice()
    const ia = bag.findIndex((x) => x.id === a.id)
    const ib = bag.findIndex((x) => x.id === b.id)
    if (ia === -1 || ib === -1) return
    ;[bag[ia], bag[ib]] = [bag[ib], bag[ia]]
    try {
      await persist(bag)
      blocksAsync.reload()
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : '순서 변경에 실패했습니다.')
    }
  }

  const seed = useMutation(() => provider.seedScenarioFromProgram(deliverableId))
  const handleSeed = async () => {
    const result = await seed.run()
    if (result) blocksAsync.reload()
  }

  /**
   * 인쇄(§10.2) — "세션 헤더·전 블록(대본 전문 포함)이 인쇄에 나오도록"이 요구사항이라,
   * 접힌 세션·닫힌 대본 패널을 전부 펼친 뒤 인쇄한다. flushSync로 DOM 반영을 동기화해
   * window.print()가 펼쳐진 상태를 그대로 캡처하게 한다.
   */
  const handlePrint = () => {
    flushSync(() => {
      setCollapsedGroups(new Set())
      setOpenScripts(new Set(blocks.map((b) => b.id)))
    })
    window.print()
  }

  const loading = deliverable.loading || blocksAsync.loading || sessionsAsync.loading

  return (
    <Card
      title="시나리오"
      action={
        <button type="button" onClick={handlePrint} className="btn btn-sm btn-ghost plan-print-hidden">
          인쇄
        </button>
      }
    >
      <div className="space-y-4">
        <p className="plan-print-hidden t-caption text-ink-cap">
          컨펌 발송은{' '}
          <Link to={`/items/${deliverableId}`} className="text-steel underline underline-offset-2">
            상세 화면
          </Link>
          에서 진행합니다 — 발송 시 인쇄 스냅숏(.pdf)이 자동 버전으로 등록됩니다.
        </p>

        {canEdit && (
          <div className="plan-print-hidden flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3">
            <span className="t-caption font-semibold text-ink">큐시트로 내보내기</span>
            <InfoTip text={SCENARIO_VS_CUESHEET_HELP} />
            <ScenarioExportPanel deliverableId={deliverableId} projectId={projectId} />
          </div>
        )}

        <ErrorAlert message={deliverable.error} />
        <ErrorAlert message={sessionsAsync.error} />
        <ErrorAlert message={blocksAsync.error} />
        <ErrorAlert message={moveError} />
        {loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

        {!loading && blocks.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-cap">작성된 진행 블록이 없습니다.</p>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={handleSeed}
                  disabled={seed.pending}
                  className="btn btn-sm btn-primary plan-print-hidden"
                >
                  프로그램표에서 뼈대 만들기
                </button>
                <ErrorAlert message={seed.error} />
              </>
            )}
          </div>
        )}

        {!loading && blocks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="ui-th w-[64px] whitespace-nowrap">시각</th>
                  <th className="ui-th w-[84px] whitespace-nowrap">구분</th>
                  <th className="ui-th min-w-[80px]">대본</th>
                  <th className="ui-th min-w-[160px]">비고</th>
                  <th className="ui-th w-[160px] plan-print-hidden whitespace-nowrap">액션</th>
                </tr>
              </thead>
              {groups.map((g) => {
                const collapsed = collapsedGroups.has(g.key)
                return (
                  <tbody key={g.key} className="divide-y divide-border">
                    <tr className="bg-canvas">
                      <td colSpan={5} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.key)}
                          aria-expanded={!collapsed}
                          className="flex items-center gap-2 text-sm font-semibold text-ink"
                        >
                          <span aria-hidden className="plan-print-hidden text-ink-cap">
                            {collapsed ? '▸' : '▾'}
                          </span>
                          {g.session
                            ? `${g.session.title}${g.session.start_time ? ` · ${g.session.start_time}` : ''}`
                            : '공통/수동 블록'}
                          <span className="t-caption font-normal text-ink-cap">({g.items.length})</span>
                        </button>
                      </td>
                    </tr>
                    {!collapsed &&
                      g.items.map((block, i) => (
                        <ScenarioBlockRow
                          key={block.id}
                          block={block}
                          sessions={sessions}
                          canEdit={canEdit}
                          isFirst={i === 0}
                          isLast={i === g.items.length - 1}
                          onMoveUp={() => handleMove(g, i, -1)}
                          onMoveDown={() => handleMove(g, i, 1)}
                          onSave={handleSaveEdit}
                          onDelete={handleDelete}
                          onChanged={blocksAsync.reload}
                          scriptOpen={openScripts.has(block.id)}
                          onToggleScript={() => toggleScript(block.id)}
                        />
                      ))}
                  </tbody>
                )
              })}
            </table>
          </div>
        )}

        {canEdit && !loading && (
          <ScenarioAddForm sessions={sessions} onAdd={handleAdd} onAdded={blocksAsync.reload} />
        )}
      </div>
    </Card>
  )
}

function ScenarioAddForm({
  sessions,
  onAdd,
  onAdded,
}: {
  sessions: ProgramSession[]
  onAdd: (values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onAdded: () => void
}) {
  const [values, setValues] = useState<ScenarioBlockFormValues>(() => toFormValues(null))
  const create = useMutation((v: ScenarioBlockFormValues) => onAdd(v))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await create.run(values)
    if (result) {
      setValues(toFormValues(null))
      onAdded()
    }
  }

  return (
    <div className="plan-print-hidden mt-4 border-t border-border pt-4">
      <p className="mb-2 t-caption font-semibold">진행 블록 추가</p>
      <ScenarioBlockForm
        values={values}
        onChange={(p) => setValues((v) => ({ ...v, ...p }))}
        onSubmit={handleSubmit}
        submitLabel="추가"
        pending={create.pending}
        error={create.error}
        sessions={sessions}
      />
    </div>
  )
}
