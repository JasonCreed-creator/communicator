// v2.5 §10.2·§23 시나리오 빌더 — 3.16.4에서 목업 v2.5 화면 B를 시각 정본으로 재구성:
// 헤더 "시나리오 — {문서명}"+상태 배지+우측 액션(큐시트로 내보내기·인쇄·컨펌 발송, 목업 배치),
// 세션 = 개별 카드(시각 세션명 [프로그램표 연동] — 메타), 대본 인라인 노출(장문만 풀 멘트 펼침),
// 하단 역할 분리 각주 카드. 데이터 경로는 3.16c 그대로 — v9 계약이 개별 CRUD가 아니라 **벌크
// 전체 교체**(saveScenarioBlocks)라 모든 변경은 "로컬 배열 재조립 → 벌크 저장 → reload" 한
// 경로로 모인다. 컨펌 발송 동작은 기존 상태 머신 준수(StructuredDocHeader — 불가 상태는
// disabled+사유 InfoTip), S3의 상태 액션 카드에서는 발송 폼을 정리(중복 노출 제거).
import { useMemo, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import ErrorAlert from '../internal/ErrorAlert'
import InfoTip from '../internal/InfoTip'
import StructuredDocHeader from '../internal/StructuredDocHeader'
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

/** 세션 카드 헤더 메타(목업 "— MC 김OO · 무대" 자리) — 프로그램표 보유 필드로 조립 */
function sessionMeta(s: ProgramSession): string {
  const parts: string[] = []
  if (s.speaker_name) parts.push(`${s.speaker_name}${s.speaker_org ? ` (${s.speaker_org})` : ''}`)
  if (s.note) parts.push(s.note)
  return parts.join(' · ')
}

export default function ScenarioBuilder({
  deliverableId,
  canEdit,
  onStatusChanged,
}: {
  deliverableId: string
  /** pm·ops만 true — §8.2 scenario-blocks 쓰기 권한 */
  canEdit: boolean
  /** 헤더 컨펌 발송 성공 시 상위 화면(상세·보드)이 상태 표시를 재조회하게 하는 훅(선택) */
  onStatusChanged?: () => void
}) {
  const deliverable = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const blocksAsync = useAsync(() => provider.listScenarioBlocks(deliverableId), [deliverableId])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const projectId = deliverable.data?.project_id ?? null
  const project = useAsync(
    () => (projectId ? provider.getProject(projectId) : Promise.resolve(null)),
    [projectId],
  )
  // projectId 확정 전에는 pending을 유지한다 — []로 먼저 해소되면 "공통 그룹으로 렌더 →
  // '불러오는 중' → 세션 그룹 재렌더"로 본문이 깜빡인다(3.16c부터 있던 창 — 3.16.4에서 제거).
  const sessionsAsync = useAsync<ProgramSession[]>(
    () => (projectId ? provider.listProgramSessions(projectId) : new Promise(() => {})),
    [projectId],
  )

  const blocks = blocksAsync.data ?? []
  const sessions = sessionsAsync.data ?? []
  const groups = useMemo(() => groupScenarioBlocks(blocks, sessions), [blocks, sessions])

  // 세션 접기/펼치기(§10.2) — 순수 표시 상태, 저장하지 않는다
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // 풀 멘트 패널 펼침 — 행이 아니라 여기서 관리한다: 인쇄(§10.2 "전 블록 대본 전문 포함") 시
  // 접힌 행도 강제로 펼쳐야 하기 때문(handlePrint 참조)
  const [openScripts, setOpenScripts] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)
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
   * 접힌 세션·닫힌 풀 멘트 패널을 전부 펼친 뒤 인쇄한다. flushSync로 DOM 반영을 동기화해
   * window.print()가 펼쳐진 상태를 그대로 캡처하게 한다.
   */
  const handlePrint = () => {
    flushSync(() => {
      setCollapsedGroups(new Set())
      setOpenScripts(new Set(blocks.map((b) => b.id)))
    })
    window.print()
  }

  const handleSent = () => {
    deliverable.reload()
    onStatusChanged?.()
  }

  // sessions는 deliverable(→projectId)이 있어야만 실제 조회가 시작된다 — deliverable이
  // 에러로 끝난 경우까지 세션 pending에 갇히지 않도록 데이터가 있을 때만 로딩으로 친다
  const loading =
    deliverable.loading || blocksAsync.loading || (deliverable.data != null && sessionsAsync.loading)
  const d = deliverable.data

  return (
    <div className="ui-card">
      {d && (
        <StructuredDocHeader
          docTypeLabel="시나리오"
          title={d.title}
          status={d.status}
          desc={
            sessions.length > 0
              ? `프로그램표 ${sessions.length}세션 연동 · 세션마다 진행 블록을 추가해 대본을 작성합니다`
              : '세션마다 진행 블록을 추가해 진행 대본을 작성합니다'
          }
          deliverableId={deliverableId}
          isHost={project.data?.kind === 'host'}
          isPm={currentUser.data?.role === 'pm'}
          requiresApproval={d.requires_approval}
          onSent={handleSent}
          actions={
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  aria-expanded={exportOpen}
                  className="btn btn-ghost btn-sm"
                >
                  큐시트로 내보내기
                </button>
              )}
              <button type="button" onClick={handlePrint} className="btn btn-ghost btn-sm">
                인쇄
              </button>
            </>
          }
        />
      )}

      <div className="space-y-4 p-5">
        {canEdit && exportOpen && (
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

        {!loading &&
          groups.map((g) => (
            <SessionCard
              key={g.key}
              group={g}
              sessions={sessions}
              canEdit={canEdit}
              collapsed={collapsedGroups.has(g.key)}
              onToggle={() => toggleGroup(g.key)}
              openScripts={openScripts}
              onToggleScript={toggleScript}
              onMove={handleMove}
              onSave={handleSaveEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
              onChanged={blocksAsync.reload}
            />
          ))}

        {canEdit && !loading && (
          <ScenarioAddForm sessions={sessions} onAdd={handleAdd} onAdded={blocksAsync.reload} />
        )}

        {/* 목업 화면 B 하단 역할 분리 각주 카드 */}
        <div className="plan-print-hidden rounded-lg border border-dashed border-border-strong bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-sub">
          <span className="font-semibold text-ink">역할 분리</span>{' '}
          <InfoTip text={SCENARIO_VS_CUESHEET_HELP} className="align-middle" /> — <b>시나리오</b>는
          MC·진행팀이 읽는 대본이고, <b>큐시트</b>는 콘솔(음향·조명·영상) 오퍼레이터용 큐 목록입니다.
          &quot;큐시트로 내보내기&quot;는 영상·전환 블록의 큐 표기를 큐 뼈대로 변환해 큐시트 빌더에
          채웁니다(이후 독립 편집). 컨펌 발송 시 스냅숏 버전 등록은 큐시트 규약(doc-snapshot)을
          재사용합니다.
        </div>
      </div>
    </div>
  )
}

// ── 세션 카드 (목업 화면 B: 세션 = 개별 카드 + 시각/구분/대본·액션/비고 표) ──────────
function SessionCard({
  group,
  sessions,
  canEdit,
  collapsed,
  onToggle,
  openScripts,
  onToggleScript,
  onMove,
  onSave,
  onDelete,
  onAdd,
  onChanged,
}: {
  group: ScenarioGroup
  sessions: ProgramSession[]
  canEdit: boolean
  collapsed: boolean
  onToggle: () => void
  openScripts: Set<string>
  onToggleScript: (blockId: string) => void
  onMove: (group: ScenarioGroup, index: number, dir: -1 | 1) => void
  onSave: (blockId: string, values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onDelete: (blockId: string) => Promise<ScenarioBlock[]>
  onAdd: (values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onChanged: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [values, setValues] = useState<ScenarioBlockFormValues>(() => ({
    ...toFormValues(null),
    session_id: group.session?.id ?? '',
  }))
  const create = useMutation((v: ScenarioBlockFormValues) => onAdd(v))

  const handleOpenAdd = () => {
    setValues({ ...toFormValues(null), session_id: group.session?.id ?? '' })
    setAddOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await create.run(values)
    if (result) {
      setAddOpen(false)
      onChanged()
    }
  }

  const meta = group.session ? sessionMeta(group.session) : ''

  return (
    <section className="rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink"
        >
          <span aria-hidden className="plan-print-hidden text-ink-cap">
            {collapsed ? '▸' : '▾'}
          </span>
          {group.session ? (
            <>
              {group.session.start_time && <span>{group.session.start_time}</span>}
              <span className="min-w-0 truncate">{group.session.title}</span>
            </>
          ) : (
            '공통/수동 블록'
          )}
          <span className="t-caption font-normal text-ink-cap">({group.items.length})</span>
        </button>
        {group.session && (
          <span className="inline-flex items-center rounded-md bg-steel-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-steel">
            프로그램표 연동
          </span>
        )}
        {meta && <span className="min-w-0 truncate text-xs text-ink-sub">— {meta}</span>}
      </header>

      {!collapsed && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="ui-th w-[64px] whitespace-nowrap">시각</th>
                  <th className="ui-th w-[84px] whitespace-nowrap">구분</th>
                  <th className="ui-th min-w-[220px]">대본·액션</th>
                  <th className="ui-th min-w-[130px]">비고</th>
                  <th className="ui-th w-[160px] plan-print-hidden whitespace-nowrap">편집</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {group.items.map((block, i) => (
                  <ScenarioBlockRow
                    key={block.id}
                    block={block}
                    sessions={sessions}
                    canEdit={canEdit}
                    isFirst={i === 0}
                    isLast={i === group.items.length - 1}
                    onMoveUp={() => onMove(group, i, -1)}
                    onMoveDown={() => onMove(group, i, 1)}
                    onSave={onSave}
                    onDelete={onDelete}
                    onChanged={onChanged}
                    scriptOpen={openScripts.has(block.id)}
                    onToggleScript={() => onToggleScript(block.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && !addOpen && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="plan-print-hidden mt-2 btn btn-ghost btn-sm"
            >
              + 진행 블록
            </button>
          )}
          {canEdit && addOpen && (
            <div className="plan-print-hidden mt-3 rounded-lg bg-canvas p-3">
              <p className="mb-2 t-caption font-semibold">진행 블록 추가</p>
              <ScenarioBlockForm
                values={values}
                onChange={(p) => setValues((v) => ({ ...v, ...p }))}
                onSubmit={handleSubmit}
                onCancel={() => setAddOpen(false)}
                submitLabel="추가"
                pending={create.pending}
                error={create.error}
                sessions={sessions}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── 하단 공통 추가 폼 — 세션 카드가 없는 세션·공통 블록용 (세션은 폼에서 선택) ──────
function ScenarioAddForm({
  sessions,
  onAdd,
  onAdded,
}: {
  sessions: ProgramSession[]
  onAdd: (values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<ScenarioBlockFormValues>(() => toFormValues(null))
  const create = useMutation((v: ScenarioBlockFormValues) => onAdd(v))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await create.run(values)
    if (result) {
      // 연속 입력을 위해 폼은 열어 두고 값만 초기화한다(3.16c 원 동작 유지)
      setValues(toFormValues(null))
      onAdded()
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="plan-print-hidden btn btn-ghost btn-sm"
      >
        + 진행 블록 (공통·다른 세션)
      </button>
    )
  }

  return (
    <div className="plan-print-hidden rounded-lg bg-canvas p-3">
      <p className="mb-2 t-caption font-semibold">진행 블록 추가</p>
      <ScenarioBlockForm
        values={values}
        onChange={(p) => setValues((v) => ({ ...v, ...p }))}
        onSubmit={handleSubmit}
        onCancel={() => setOpen(false)}
        submitLabel="추가"
        pending={create.pending}
        error={create.error}
        sessions={sessions}
      />
    </div>
  )
}
