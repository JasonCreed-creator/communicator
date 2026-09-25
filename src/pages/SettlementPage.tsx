// 정산보드 (설계서 v2.2 §19 · §10) — Phase 3.14b·3.14c / 3.17b / **Phase 3.23 PR-7**(디자인지시서 v1.4 §7-2.11 ·
// 캔버스 '정산보드 — 금액 색은 의미대로').
//
// **내부 전용 화면이다.** 발주처 토큰 경로(/c/*)·운영계획서·랜딩·알림 어디에도
// 이 화면의 숫자는 나가지 않는다(§4-24 R-S9).
//
// 화면이 답해야 하는 질문은 하나다: "지금까지 쓴 돈이 최초 계약 견적 대비 ±얼마인가."
// PR-7 배치:
//   · 머리 = 제목 + '내부 전용' 배지 · [기준 견적 갱신](ghost) [협력사 견적서 불러오기](채운 — Phase 4.7의 아래 카드에서 올렸다)
//   · 머리 아래 알림 = 확인 대기 협력사 견적서 · 견적 초과 버킷(버킷마다) · 검산 어긋남 — 할 일이 먼저 읽힌다
//   · KPI 4장(검산 배지·마진 구성 막대를 셋째 칸에 합쳤다 — 옛 '마진 구성 · 검산' 카드 퇴역)
//   · 버킷 표(원가 없는 버킷은 그룹행 아래) · 불러온 견적서 이력(있을 때만)
// **마진 식은 lib/settlement 정본 그대로다 — 표시만 바꾼다.**
import { useMemo, useState } from 'react'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import { LevelBadge } from '../components/internal/StatusBadge'
import { canUseQuotes } from '../components/quote/QuoteGate'
import { ActionIcon } from '../components/quote/quoteIcons'
import SettlementBucketTable from '../components/settlement/SettlementBucketTable'
import SettlementItems from '../components/settlement/SettlementItems'
import SettlementKpis from '../components/settlement/SettlementKpis'
import VendorQuoteHistory, { VendorQuoteDialog } from '../components/settlement/VendorQuoteImport'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { quoteBucketSpec } from '../lib/settlement'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { getDataProvider } from '../providers'
import type { SettlementItemInput } from '../providers/DataProvider'
import type { Quote } from '../types/entities'
import type { VendorQuoteImportView } from '../types/views'
import type { ReactNode } from 'react'

const provider = getDataProvider()

function krw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

/** 가져온 날 — 로컬 날짜 'M월 D일' */
function importedOn(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 기준 갱신 미리보기 — 새 견적 스냅숏과 현재 버킷의 차이. 확인 전에 보여준다 */
function rebaseDiff(
  quote: Quote,
  current: { code: string; label: string; quote_amount: number }[],
): { code: string; label: string; before: number; after: number }[] {
  const engine = computeQuoteOutputs(quote.input).result
  return quoteBucketSpec(quote.breakdown, engine)
    .map((row) => {
      const cur = current.find((b) => b.code === row.code)
      return {
        code: row.code,
        label: row.label,
        before: cur?.quote_amount ?? 0,
        after: row.quote_amount,
      }
    })
    .filter((d) => d.before !== d.after)
}

/** 머리 아래 알림 한 줄 — 배지 · 한 문장 · 캡션 · 동작 1개(캔버스 ui-alert) */
function BoardAlert({
  level,
  badge,
  dot,
  title,
  caption,
  action,
  testId,
  role,
}: {
  level: 'attention' | 'blocked'
  badge: string
  dot?: boolean
  title: string
  caption?: string
  action?: ReactNode
  testId: string
  role?: 'alert'
}) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[10px] px-4 py-3 ${
        level === 'blocked' ? 'bg-negative-tint' : 'bg-accent-tint'
      }`}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* 알림 면과 배지 면이 같은 틴트라 흰 받침 위에 올린다(PR-3 갤러리와 같은 방식) */}
        <span className="inline-flex shrink-0 rounded-full bg-card p-[2px]">
          <LevelBadge level={level} label={badge} dot={dot} />
        </span>
        <span className="text-sm font-semibold text-ink">{title}</span>
        {caption && <span className={`t-caption ${level === 'blocked' ? 'text-negative' : 'text-accent-deep'}`}>{caption}</span>}
      </span>
      {action}
    </div>
  )
}

export default function SettlementPage() {
  const { projectId, summaries } = useProject()
  const summary = summaries.find((s) => s.id === projectId) ?? null
  const readOnly = summary?.status === 'closed'

  const me = useAsync(() => provider.getCurrentUser(), [])
  const board = useAsync(() => provider.getSettlementBoard(projectId), [projectId])
  const vendors = useAsync(() => provider.listVendors(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const hasBoard = !!board.data
  // 협력사 견적서는 정산보드에 붙는다 — 보드가 생기면 다시 읽는다
  const vqImports = useAsync(() => provider.listVendorQuoteImports(projectId), [projectId, hasBoard])
  // 견적 목록은 app_role 게이트 대상이라(§6.1) 권한 있는 사용자에게만 부른다.
  const canQuotes = !!me.data && canUseQuotes(me.data)
  const quotes = useAsync(
    () => (canQuotes ? provider.listQuotes() : Promise.resolve([] as Quote[])),
    [canQuotes],
  )

  const isPm = me.data?.role === 'pm'
  const canEdit = isPm && !readOnly
  const finalQuotes = useMemo(
    () => (quotes.data ?? []).filter((q) => q.is_final && (q.project_id === projectId || q.project_id === null)),
    [quotes.data, projectId],
  )

  const [pickedQuote, setPickedQuote] = useState('')
  const [rebasing, setRebasing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addingBucket, setAddingBucket] = useState(false)
  const [bucketDraft, setBucketDraft] = useState({ code: '', label: '' })
  const [vqOpen, setVqOpen] = useState<VendorQuoteImportView | 'new' | null>(null)

  const createBoard = useMutation((quoteId: string) => provider.createSettlementBoard(projectId, quoteId))
  const rebase = useMutation((quoteId: string) => provider.rebaseSettlementBoard(projectId, quoteId))
  const addBucket = useMutation((code: string, label: string) =>
    provider.createSettlementBucket(projectId, { code, label }),
  )
  const createItem = useMutation((bucketId: string, input: SettlementItemInput) =>
    provider.createSettlementItem(projectId, bucketId, input),
  )
  const updateItem = useMutation((itemId: string, patch: Partial<SettlementItemInput>) =>
    provider.updateSettlementItem(itemId, patch),
  )
  // deleteSettlementItem은 void라 run()이 성공·실패 모두 undefined다 — 성공을 true로 돌려 받아야 보드를 다시 읽는다
  // (PR-7에서 잡은 기존 결함: 지운 항목이 새로고침 전까지 표에 남아 있었다)
  const deleteItem = useMutation(async (itemId: string) => {
    await provider.deleteSettlementItem(itemId)
    return true as const
  })
  const promoteVendor = useMutation((name: string) => provider.upsertVendor({ name }))

  const view = board.data
  const totals = view?.totals

  const mutationError =
    createBoard.error ?? rebase.error ?? addBucket.error ?? createItem.error ?? updateItem.error ?? deleteItem.error

  const header = (actions?: ReactNode) => (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="t-caption">운영</p>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="t-page-title">정산보드</h1>
          <LevelBadge level="neutral" label="내부 전용" />
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )

  // ── 빈 상태 — 확정 견적을 불러오는 것이 시작점이다(R-S2) ─────────────
  if (!board.loading && !view) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        {header()}
        <div className="ui-card p-6">
          <EmptyState
            message="확정 견적을 불러와 정산을 시작합니다."
            action={
              canEdit ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <select
                    aria-label="기준 견적"
                    className="ui-input ui-select"
                    value={pickedQuote}
                    onChange={(e) => setPickedQuote(e.target.value)}
                  >
                    <option value="">확정 견적 선택</option>
                    {finalQuotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title} v{q.version}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!pickedQuote || createBoard.pending}
                    onClick={async () => {
                      const ok = await createBoard.run(pickedQuote)
                      if (ok) board.reload()
                    }}
                  >
                    정산 시작
                  </button>
                </div>
              ) : (
                <p className="text-sm text-ink-sub">
                  {readOnly ? '종료된 행사입니다.' : 'PM이 기준 견적을 불러오면 시작됩니다.'}
                </p>
              )
            }
          />
          {isPm && canQuotes && finalQuotes.length === 0 && (
            <p className="mt-2 text-center text-sm text-ink-sub">
              아직 확정된 견적이 없습니다 — 견적 화면에서 확정한 뒤 다시 시도하세요.
            </p>
          )}
          <ErrorAlert message={createBoard.error} />
        </div>
      </div>
    )
  }

  if (board.loading || !view || !totals) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        {header()}
        <p className="text-sm text-ink-sub">{board.error ?? '불러오는 중…'}</p>
      </div>
    )
  }

  const excludedTotal = totals.excluded.reduce((s, e) => s + e.amount, 0)
  const contractTotal = totals.marginBase + excludedTotal
  const diff = rebasing && pickedQuote ? rebaseDiff(finalQuotes.find((q) => q.id === pickedQuote)!, view.buckets.map((b) => b.bucket)) : []
  const overBuckets = view.buckets.filter((b) => b.over_budget)
  const pendingImports = (vqImports.data ?? []).filter((x) => x.status === 'parsed')
  const firstPending = pendingImports[0] ?? null
  // 머리의 채운 버튼은 쉬는 상태에서 하나 — 기준 갱신·버킷 추가 폼을 열면 그 폼의 확정이 넘겨받고 머리 버튼은 물러난다
  const formOpen = rebasing || addingBucket

  const openBucket = (bucketId: string) => {
    setExpanded(bucketId)
    // 펼친 뒤 그 버킷의 항목 표로 스크롤한다(알림의 '항목 보기')
    requestAnimationFrame(() => document.getElementById(`bucket-panel-${bucketId}`)?.scrollIntoView?.({ block: 'nearest' }))
  }

  const pendingQuestions = (x: VendorQuoteImportView): string => {
    const parts: string[] = []
    if (!x.parsed.vat.certain || x.parsed.vat.suggested === null) parts.push('부가세 포함 여부')
    if (x.questions.includes('bucket')) parts.push('버킷')
    return parts.length > 0 ? `확인할 것: ${parts.join(' · ')}` : '확인하고 확정하면 발주 항목이 됩니다'
  }

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        {header(
          <>
            {canEdit && (
              <button type="button" className="btn btn-ghost" aria-pressed={rebasing} onClick={() => setRebasing((v) => !v)}>
                기준 견적 갱신
              </button>
            )}
            <button
              type="button"
              className={`btn ${formOpen ? 'btn-ghost' : 'btn-accent'}`}
              disabled={!canEdit}
              title={canEdit ? undefined : 'PM 전용 — 종료된 행사는 재개 후'}
              onClick={() => setVqOpen('new')}
            >
              <ActionIcon name="upload" />
              협력사 견적서 불러오기
            </button>
          </>,
        )}
        <p className="text-sm text-ink-sub">
          기준 견적 <span className="font-semibold text-ink">{view.quote_label ?? '—'}</span> · 금액은 모두 부가세 별도 · 이 화면의
          숫자는 발주처에 보이지 않습니다.
        </p>
      </div>

      {/* 할 일 알림 — 검산 어긋남 · 확인 대기 견적서 · 견적 초과 버킷 */}
      {(!totals.identityOk || firstPending || overBuckets.length > 0) && (
        <div className="flex flex-col gap-2">
          {!totals.identityOk && (
            <BoardAlert
              level="blocked"
              badge="검산 어긋남"
              title="마진 기준 계약액 − 실집행이 최종 마진과 맞지 않습니다"
              caption="버킷의 원가·마진 기준 설정을 확인하세요"
              testId="alert-identity"
              role="alert"
            />
          )}
          {firstPending && (
            <BoardAlert
              level="attention"
              badge="확인 대기"
              dot
              title={`협력사 견적서 ${pendingImports.length}건 — ${firstPending.file_name}${pendingImports.length > 1 ? ` 외 ${pendingImports.length - 1}건` : ''}`}
              caption={`${importedOn(firstPending.created_at)} 불러옴 · ${firstPending.parsed.rows.length}개 항목 · ${pendingQuestions(firstPending)}`}
              testId="alert-vendor-pending"
              action={
                canEdit ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVqOpen(firstPending)}>
                    확인하기
                  </button>
                ) : undefined
              }
            />
          )}
          {overBuckets.map((b) => (
            <BoardAlert
              key={b.bucket.id}
              level="attention"
              badge="견적 초과"
              title={`${b.bucket.label} — 실집행 ${krw(b.actual)}이 견적 ${krw(b.bucket.quote_amount)}을 넘었습니다`}
              caption="초과는 막지 않아요 · 항목 메모에 이유를 남겨 두세요"
              testId={`alert-over-${b.bucket.code}`}
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openBucket(b.bucket.id)}>
                  항목 보기
                </button>
              }
            />
          ))}
        </div>
      )}

      {/* 기준 견적 갱신 — 차이를 먼저 보여주고 확인받는다(R-S2) */}
      {rebasing && canEdit && (
        <section className="ui-card p-5" aria-label="기준 견적 갱신">
          <h2 className="t-card-title">기준 견적 갱신</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="갱신할 견적"
              className="ui-input ui-select"
              value={pickedQuote}
              onChange={(e) => setPickedQuote(e.target.value)}
            >
              <option value="">확정 견적 선택</option>
              {finalQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} v{q.version}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!pickedQuote || rebase.pending}
              onClick={async () => {
                const ok = await rebase.run(pickedQuote)
                if (ok) {
                  board.reload()
                  setRebasing(false)
                  setPickedQuote('')
                }
              }}
            >
              이대로 갱신
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRebasing(false)}>
              닫기
            </button>
          </div>
          {pickedQuote && (
            <div className="mt-3">
              {diff.length === 0 ? (
                <p className="text-sm text-ink-sub">기준 금액에 바뀌는 버킷이 없습니다.</p>
              ) : (
                <>
                  <p className="text-sm text-ink-sub">
                    아래 {diff.length}개 버킷의 기준 금액이 바뀝니다. 입력된 발주 항목은 그대로 유지됩니다.
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="ui-table min-w-[560px] text-sm">
                      <thead>
                        <tr>
                          <th className="ui-th">버킷</th>
                          <th className="ui-th ui-num">현재</th>
                          <th className="ui-th ui-num">변경</th>
                          <th className="ui-th ui-num">차이</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map((d) => (
                          <tr key={d.code}>
                            <td>{d.label}</td>
                            <td className="ui-num text-ink-sub">{krw(d.before)}</td>
                            <td className="ui-num">{krw(d.after)}</td>
                            <td className="ui-num font-medium text-ink">
                              {d.after - d.before > 0 ? '+' : ''}
                              {krw(d.after - d.before)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          <ErrorAlert message={rebase.error} />
        </section>
      )}

      {/* KPI 4 (§19.1) — 검산 배지·마진 구성 막대는 최종 마진 칸 */}
      <SettlementKpis totals={totals} />

      <ErrorAlert message={mutationError} />

      {/* 버킷 표 — 원가 없는 버킷은 그룹행 아래(숨기지 않는다) */}
      <SettlementBucketTable
        buckets={view.buckets}
        totals={totals}
        contractTotal={contractTotal}
        expandedId={expanded}
        onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
        action={
          canEdit ? (
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={addingBucket} onClick={() => setAddingBucket((v) => !v)}>
              {addingBucket ? '닫기' : '버킷 추가'}
            </button>
          ) : undefined
        }
        renderExpanded={(b) => (
          <SettlementItems
            view={b}
            vendors={vendors.data ?? []}
            members={members.data ?? []}
            isPm={isPm}
            currentUserId={me.data?.id ?? ''}
            readOnly={!!readOnly}
            onCreate={async (input) => {
              const ok = await createItem.run(b.bucket.id, input)
              if (ok) board.reload()
              return ok
            }}
            onUpdate={async (itemId, patch) => {
              const ok = await updateItem.run(itemId, patch)
              if (ok) board.reload()
              return ok
            }}
            onDelete={async (itemId) => {
              const ok = await deleteItem.run(itemId)
              if (ok) board.reload()
              return ok
            }}
            onPromoteVendor={async (name) => {
              const created = await promoteVendor.run(name)
              if (created) vendors.reload()
              return created?.id ?? null
            }}
          />
        )}
      />

      {/* 행사별 추가 버킷 (pm) — 견적에 없던 비용은 0원에서 시작한다(§19.2). 입력 중일 때만 그린다(빈 줄 방지) */}
      {canEdit && addingBucket && (
        <section className="ui-card flex flex-wrap items-center gap-2 p-4" aria-label="버킷 추가">
          <input
            aria-label="버킷 코드"
            className="ui-input w-32"
            placeholder="코드"
            value={bucketDraft.code}
            onChange={(e) => setBucketDraft({ ...bucketDraft, code: e.target.value })}
          />
          <input
            aria-label="버킷 이름"
            className="ui-input"
            placeholder="버킷 이름"
            value={bucketDraft.label}
            onChange={(e) => setBucketDraft({ ...bucketDraft, label: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={addBucket.pending}
            onClick={async () => {
              const ok = await addBucket.run(bucketDraft.code, bucketDraft.label)
              if (ok) {
                board.reload()
                setAddingBucket(false)
                setBucketDraft({ code: '', label: '' })
              }
            }}
          >
            추가
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAddingBucket(false)}>
            취소
          </button>
        </section>
      )}

      {/* v2.11 §19.5(Phase 4.7) 불러온 협력사 견적서 이력 — 있을 때만. 확인 전에는 정산에 들어가지 않는다 */}
      <VendorQuoteHistory imports={vqImports.data ?? []} canEdit={canEdit} onOpen={setVqOpen} />

      {vqOpen && (
        <VendorQuoteDialog
          projectId={projectId}
          initial={vqOpen === 'new' ? null : vqOpen}
          buckets={view.buckets.map((b) => b.bucket)}
          vendors={vendors.data ?? []}
          onClose={() => {
            setVqOpen(null)
            vqImports.reload()
          }}
          onConfirmed={() => {
            vqImports.reload()
            board.reload()
          }}
        />
      )}
    </div>
  )
}
