// 시나리오 빌더 — v2.13 §23.6 멘트 원고형(Phase 3.24 PR-B · 디자인지시서 §7-2.14 · 캔버스 "운영 문서 3종 실무화" ②).
// MC가 그대로 읽는 원고: 세션 제목(시각 크게) → 블록마다 시각·구분 → 괄호 지시문 → 멘트(크게, 문단).
// 위 = 원고 요약(멘트 n/m 작성 · 연사 확인 대기 · 큐시트로 보내기 · 인쇄) / 왼쪽 = 세션 목록 /
// 끝 = 비상 예비 멘트(세션 밖). 문서 제목·상태·컨펌 발송은 항목 상세 머리와 '다음 단계' 카드가 맡는다
// (큐시트 PR-4b와 같은 모양 — 빌더 안에 두 번째 머리를 두지 않는다).
// 데이터 경로는 3.16c 그대로 — v9 계약이 개별 CRUD가 아니라 **벌크 전체 교체**(saveScenarioBlocks)라
// 모든 변경은 "로컬 배열 재조립 → 벌크 저장 → reload" 한 경로로 모인다.
import { useMemo, useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import InfoTip from '../internal/InfoTip'
import ProgressBar from '../internal/ProgressBar'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import { SCENARIO_VS_CUESHEET_HELP } from '../../lib/helpTexts'
import { scenarioProgress } from '../../lib/scenarioScript'
import type { ProgramSession, ScenarioBlock } from '../../types/entities'
import ScenarioBlockForm from './ScenarioBlockForm'
import ScenarioExportPanel from './ScenarioExportPanel'
import ScenarioScriptBlock from './ScenarioScriptBlock'
import {
  EMERGENCY_GROUP_KEY,
  arrangeScenarioBlocks,
  groupScenarioBlocks,
  sessionCaption,
  type ScenarioGroup,
} from './scenarioGroups'
import { toFormValues, toInput, toPatch, type ScenarioBlockFormValues } from './scenarioFormValues'

const provider = getDataProvider()

const sectionId = (key: string) => `scn-sec-${key}`

/** 레일 링크 — 주소(해시)는 바꾸지 않고 그 묶음으로만 스크롤(데모 아티팩트는 해시 라우팅) */
function scrollToSection(key: string) {
  document.getElementById(sectionId(key))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

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
  // projectId 확정 전에는 pending을 유지한다 — []로 먼저 해소되면 "세션 밖 묶음으로 렌더 →
  // 세션 묶음 재렌더"로 본문이 깜빡인다(3.16.4에서 없앤 창).
  const sessionsAsync = useAsync<ProgramSession[]>(
    () => (projectId ? provider.listProgramSessions(projectId) : new Promise(() => {})),
    [projectId],
  )

  const blocks = useMemo(() => blocksAsync.data ?? [], [blocksAsync.data])
  const sessions = useMemo(() => sessionsAsync.data ?? [], [sessionsAsync.data])
  const groups = useMemo(() => groupScenarioBlocks(blocks, sessions), [blocks, sessions])
  const progress = useMemo(() => scenarioProgress(blocks, sessions), [blocks, sessions])

  const [exportOpen, setExportOpen] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  /** 로컬 배열(bag) → 묶음 순서로 정규화 → 벌크 저장(saveScenarioBlocks). 모든 변경 경로의 공통 종점. */
  const persist = (bag: ScenarioBlock[]): Promise<ScenarioBlock[]> => {
    const arranged = arrangeScenarioBlocks(bag, sessions)
    return provider.saveScenarioBlocks(deliverableId, arranged.map(toInput))
  }

  const handleSaveEdit = (blockId: string, values: ScenarioBlockFormValues) => {
    const patch = toPatch(values)
    return persist(blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)))
  }

  const handleAdd = (values: ScenarioBlockFormValues) => {
    const draft: ScenarioBlock = {
      id: `scb-draft-${Date.now()}`,
      deliverable_id: deliverableId,
      sort_order: 0,
      ...toPatch(values),
    }
    return persist([...blocks, draft])
  }

  const handleDelete = (blockId: string) => persist(blocks.filter((b) => b.id !== blockId))

  const handleMove = async (group: ScenarioGroup, index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= group.items.length) return
    setMoveError(null)
    // 묶음 안 인접 교환 — arrangeScenarioBlocks가 늘 묶음 순서로 정규화하므로 전체 배열(bag)에서 두 블록 자리만 바꾼다
    const bag = blocks.slice()
    const ia = bag.findIndex((x) => x.id === group.items[index].id)
    const ib = bag.findIndex((x) => x.id === group.items[j].id)
    if (ia === -1 || ib === -1) return
    ;[bag[ia], bag[ib]] = [bag[ib], bag[ia]]
    try {
      await persist(bag)
      blocksAsync.reload()
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : '순서를 바꾸지 못했습니다.')
    }
  }

  const seed = useMutation(() => provider.seedScenarioFromProgram(deliverableId))
  const handleSeed = async () => {
    const result = await seed.run()
    if (result) blocksAsync.reload()
  }

  // 세션 묶음은 deliverable(→projectId)이 있어야 조회가 시작된다 — deliverable이 에러로 끝난 경우까지
  // 세션 pending에 갇히지 않도록 데이터가 있을 때만 로딩으로 친다
  const loading =
    deliverable.loading || blocksAsync.loading || (deliverable.data != null && sessionsAsync.loading)
  const status = deliverable.data?.status
  const writing = status === 'draft' || status === 'requested' || status === 'changes_requested'
  const hasEmergencyGroup = groups.some((g) => g.kind === 'emergency')

  return (
    <div className="@container space-y-4">
      <section
        aria-label="원고 요약"
        className="ui-card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold text-ink" data-testid="scenario-progress">
            멘트 {progress.spokenFilled} / {progress.spokenTotal} 작성
          </span>
          <span className="w-40">
            <ProgressBar done={progress.spokenFilled} total={progress.spokenTotal} hideValue />
          </span>
          {progress.speakerPending > 0 && (
            <span className="inline-flex whitespace-nowrap rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-deep">
              연사 확인 대기 {progress.speakerPending}
            </span>
          )}
          {canEdit && writing && progress.spokenFilled < progress.spokenTotal && (
            <span className="t-caption">다 채우면 PM 검토로 넘기세요</span>
          )}
        </div>
        <div className="plan-print-hidden flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              className="btn btn-ghost btn-sm"
            >
              큐시트로 보내기
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="btn btn-ghost btn-sm">
            인쇄 · MC 배포용
          </button>
        </div>
      </section>

      {canEdit && exportOpen && (
        <div className="plan-print-hidden flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3">
          <span className="t-caption font-semibold text-ink">큐시트로 보내기</span>
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
        <div className="ui-card space-y-2 px-5 py-5">
          <p className="text-sm text-ink-cap">아직 원고가 없습니다.</p>
          {canEdit && (
            <>
              <p className="t-caption">
                프로그램표 세션마다 소개 멘트 자리가 생기고(연사를 모르면 [연사 이름]으로 비워 둡니다), 비상 예비 멘트 3종이
                함께 들어갑니다.
              </p>
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
        <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[220px_minmax(0,1fr)]">
          <ScenarioRail groups={groups} canEdit={canEdit} />
          <article aria-label="원고" className="ui-card space-y-8 px-5 py-6 @2xl:px-8">
            {groups.map((g) => (
              <GroupSection
                key={g.key}
                group={g}
                sessions={sessions}
                canEdit={canEdit}
                onMove={handleMove}
                onSave={handleSaveEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
                onChanged={blocksAsync.reload}
              />
            ))}
            {!hasEmergencyGroup && canEdit && (
              <GroupSection
                group={{ key: EMERGENCY_GROUP_KEY, kind: 'emergency', session: null, items: [] }}
                sessions={sessions}
                canEdit={canEdit}
                onMove={handleMove}
                onSave={handleSaveEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
                onChanged={blocksAsync.reload}
              />
            )}
          </article>
        </div>
      )}

      {canEdit && !loading && <ScenarioAddForm sessions={sessions} onAdd={handleAdd} onAdded={blocksAsync.reload} />}

      <div className="plan-print-hidden rounded-lg border border-dashed border-border-strong bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-sub">
        <span className="font-semibold text-ink">역할 분리</span>{' '}
        <InfoTip text={SCENARIO_VS_CUESHEET_HELP} className="align-middle" /> — <b>시나리오</b>는 MC·진행팀이 읽는
        원고이고, <b>큐시트</b>는 콘솔(음향·조명·영상) 오퍼레이터용 큐 목록입니다. &quot;큐시트로 보내기&quot;는 영상·전환
        블록의 큐 표기를 큐 뼈대로 변환해 큐시트 빌더에 채웁니다(이후 독립 편집). 컨펌 발송 시 스냅숏 버전 등록은 큐시트
        규약(doc-snapshot)을 재사용합니다.
      </div>
    </div>
  )
}

// ── 세션 목록 (왼쪽) — 세션마다 멘트 채움 n/m, 끝에 세션 밖 진행·비상 예비 멘트 ─────────────
function ScenarioRail({ groups, canEdit }: { groups: ScenarioGroup[]; canEdit: boolean }) {
  const sessionGroups = groups.filter((g) => g.kind === 'session')
  const tail = groups.filter((g) => g.kind !== 'session')
  const showEmergencyStub = canEdit && !groups.some((g) => g.kind === 'emergency')

  const link = (key: string, label: string, right: string, done: boolean) => (
    <li key={key}>
      <a
        href={`#${sectionId(key)}`}
        onClick={(e) => {
          e.preventDefault()
          scrollToSection(key)
        }}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-track"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={`whitespace-nowrap text-xs ${done ? 'text-positive' : 'text-ink-cap'}`}>{right}</span>
      </a>
    </li>
  )

  return (
    <nav
      aria-label="세션 목록"
      className="ui-card plan-print-hidden hidden p-2 @4xl:sticky @4xl:top-4 @4xl:block"
    >
      <p className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-1">
        <span className="text-xs font-semibold text-ink">세션</span>
        <span className="t-caption">프로그램표 연동 {sessionGroups.length}</span>
      </p>
      <ul>
        {sessionGroups.map((g) => {
          const p = scenarioProgress(g.items)
          const done = p.spokenTotal > 0 && p.spokenFilled === p.spokenTotal && p.speakerPending === 0
          const label = `${g.session?.start_time ? `${g.session.start_time} ` : ''}${g.session?.title ?? ''}`
          const right = p.spokenTotal > 0 ? `${p.spokenFilled}/${p.spokenTotal}${done ? ' ✓' : ''}` : '지시만'
          return link(g.key, label, right, done)
        })}
      </ul>
      {(tail.length > 0 || showEmergencyStub) && <span aria-hidden className="mx-2 my-1.5 block h-px bg-border" />}
      <ul>
        {tail.map((g) =>
          g.kind === 'emergency'
            ? link(g.key, '비상 예비 멘트', `${g.items.length}종`, false)
            : link(g.key, '세션 밖 진행', `${g.items.length}`, false),
        )}
        {showEmergencyStub && link(EMERGENCY_GROUP_KEY, '비상 예비 멘트', '없음', false)}
      </ul>
    </nav>
  )
}

// ── 묶음 한 개 — 세션(시각 크게 + 제목 + 프로그램표 연동) · 세션 밖 진행 · 비상 예비 멘트 ─────────
function GroupSection({
  group,
  sessions,
  canEdit,
  onMove,
  onSave,
  onDelete,
  onAdd,
  onChanged,
}: {
  group: ScenarioGroup
  sessions: ProgramSession[]
  canEdit: boolean
  onMove: (group: ScenarioGroup, index: number, dir: -1 | 1) => void
  onSave: (blockId: string, values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onDelete: (blockId: string) => Promise<ScenarioBlock[]>
  onAdd: (values: ScenarioBlockFormValues) => Promise<ScenarioBlock[]>
  onChanged: () => void
}) {
  const [adding, setAdding] = useState<ScenarioBlockFormValues | null>(null)
  const create = useMutation((v: ScenarioBlockFormValues) => onAdd(v))
  const emergency = group.kind === 'emergency'
  const s = group.session
  const lastTime = [...group.items].reverse().find((b) => b.time)?.time ?? s?.start_time ?? ''

  const openAdd = (kind: 'mc' | 'custom' | 'emergency') =>
    setAdding(toFormValues(null, { kind, session_id: s?.id ?? '', time: kind === 'emergency' ? '' : lastTime }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!adding) return
    const result = await create.run(adding)
    if (result) {
      setAdding(null)
      onChanged()
    }
  }

  const titleId = `${sectionId(group.key)}-title`
  return (
    <section
      id={sectionId(group.key)}
      aria-labelledby={titleId}
      className={`scroll-mt-4 ${emergency ? 'rounded-[10px] border border-border bg-canvas px-5 py-4' : ''}`}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2">
        {group.kind === 'session' && s ? (
          <>
            {s.start_time && (
              <span className="text-[22px] font-bold tabular-nums text-ink-sub">{s.start_time}</span>
            )}
            <h3 id={titleId} className="text-xl font-bold text-ink">
              {s.title}
            </h3>
            <span className="inline-flex items-center whitespace-nowrap rounded-md bg-steel-tint px-1.5 py-0.5 text-[11px] font-semibold text-steel">
              프로그램표 연동
            </span>
            {sessionCaption(s) && <span className="text-[13px] text-ink-cap">{sessionCaption(s)}</span>}
          </>
        ) : emergency ? (
          <>
            <h3 id={titleId} className="text-[17px] font-bold text-ink">
              비상 예비 멘트
            </h3>
            <span className="text-[13px] text-ink-cap">현장에서 무대감독 콜이 오면 바로 읽는 멘트</span>
          </>
        ) : (
          <>
            <h3 id={titleId} className="text-xl font-bold text-ink">
              세션 밖 진행
            </h3>
            <span className="text-[13px] text-ink-cap">프로그램표 세션에 걸리지 않은 블록</span>
          </>
        )}
      </header>

      {group.items.length === 0 && (
        <p className="py-2 text-sm text-ink-cap">아직 없습니다 — 영상 장애·발표자 지연처럼 자주 생기는 상황을 적어 두세요.</p>
      )}

      <div>
        {group.items.map((block, i) => (
          <ScenarioScriptBlock
            key={block.id}
            block={block}
            session={s}
            sessions={sessions}
            canEdit={canEdit}
            isFirst={i === 0}
            isLast={i === group.items.length - 1}
            onMove={(dir) => onMove(group, i, dir)}
            onSave={onSave}
            onDelete={onDelete}
            onChanged={onChanged}
          />
        ))}
      </div>

      {canEdit && !adding && (
        <div className="plan-print-hidden flex flex-wrap gap-3 pt-2">
          {emergency ? (
            <button type="button" onClick={() => openAdd('emergency')} className="text-sm font-semibold text-accent-deep hover:underline">
              ＋ 비상 멘트
            </button>
          ) : (
            <>
              <button type="button" onClick={() => openAdd('mc')} className="text-sm font-semibold text-accent-deep hover:underline">
                ＋ 멘트
              </button>
              <button type="button" onClick={() => openAdd('custom')} className="text-sm font-semibold text-accent-deep hover:underline">
                ＋ 지시
              </button>
            </>
          )}
        </div>
      )}
      {canEdit && adding && (
        <div className="plan-print-hidden mt-2 rounded-lg bg-canvas p-3">
          <p className="mb-2 t-caption font-semibold">{emergency ? '비상 멘트 추가' : '블록 추가'}</p>
          <ScenarioBlockForm
            values={adding}
            onChange={(p) => setAdding((v) => (v ? { ...v, ...p } : v))}
            onSubmit={handleSubmit}
            onCancel={() => setAdding(null)}
            submitLabel="추가"
            pending={create.pending}
            error={create.error}
            sessions={sessions}
            focusScript
          />
        </div>
      )}
    </section>
  )
}

// ── 아래 공통 추가 폼 — 원고에 아직 없는 세션·세션 밖 블록용(세션은 폼에서 고른다) ──────────
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
      <button type="button" onClick={() => setOpen(true)} className="plan-print-hidden btn btn-ghost btn-sm">
        ＋ 블록 추가 (세션 고르기)
      </button>
    )
  }

  return (
    <div className="plan-print-hidden ui-card p-4">
      <p className="mb-2 t-caption font-semibold">블록 추가 — 원고에 아직 없는 세션이나 세션 밖 진행</p>
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
