// S-10 정산보드 (설계서 v2.2 §19 · §10) — Phase 3.14b·3.14c / 3.17b 시안 정렬
//
// **내부 전용 화면이다.** 발주처 토큰 경로(/c/*)·운영계획서·랜딩·알림 어디에도
// 이 화면의 숫자는 나가지 않는다(§4-24 R-S9).
//
// 화면이 답해야 하는 질문은 하나다: "지금까지 쓴 돈이 최초 계약 견적 대비 ±얼마인가."
// 그래서 상단은 마진(계약 − 리드젠 − 실집행)이고, 하단은 그 마진이 버킷별로 어디서
// 났는지·어디서 깨졌는지다.
//
// 3.17b(시안 '정산보드.dc.html') 정렬:
//   · KPI 4장에 **보조 수치 1줄**(구분선 위 — 패턴 §07 KPI 카드 규격)
//   · 마진율 밴드를 **막대 위 마커**로. 밴드 밖이어도 **경고하지 않고 위치만** 표시(§19.1 유지)
//   · 마진 구성 막대 + 검산을 **한 카드로 통합**(MarginSummaryCard), 초과 경보는 그 카드 하단 바
//   · 버킷 표는 표 정본(.ui-table) — 초과 행 배경 제거, 집행률 열에만 셀 내 막대, 고정 합계행
// **마진 식은 lib/settlement 정본 그대로다 — 표시만 바꾼다.**
import { useMemo, useState } from 'react'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import InfoTip from '../components/internal/InfoTip'
import PageHeader from '../components/internal/PageHeader'
import MarginSummaryCard from '../components/settlement/MarginSummaryCard'
import SettlementBucketTable from '../components/settlement/SettlementBucketTable'
import SettlementItems from '../components/settlement/SettlementItems'
import { canUseQuotes } from '../components/quote/QuoteGate'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { SETTLEMENT_KPI_HELP } from '../lib/helpTexts'
import { quoteBucketSpec } from '../lib/settlement'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { getDataProvider } from '../providers'
import type { SettlementItemInput } from '../providers/DataProvider'
import type { Quote } from '../types/entities'
import type { ReactNode } from 'react'

const provider = getDataProvider()

/** 실측 내부정산 밴드 — **참고선일 뿐 판정하지 않는다**(§19.1). 낮다고 경고를 띄우지 않는다 */
const MARGIN_BAND = { low: 0.275, high: 0.69 }

function krw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

function num(n: number): string {
  return n.toLocaleString('ko-KR')
}

function pct(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
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

/**
 * 금액 KPI 타일 — 억 단위 숫자가 kpi-num(31px)에서는 두 줄로 깨져 읽히지 않는다.
 * StatTile과 같은 구조(캡션 + 구분선 위 보조 수치 1줄)를 쓰되 숫자만 한 단계 줄이고
 * 단위를 접미로 뺀다(패턴 §07 KPI 카드 규격 · 시안도 24px).
 */
function MoneyTile({
  label,
  amount,
  tone = 'default',
  help,
  support,
}: {
  label: string
  amount: number
  tone?: 'default' | 'accent' | 'negative'
  help?: string
  /** 보조 수치 1줄 — 산식·대비율·분해값. StatTile.support와 같은 규격 */
  support?: ReactNode
}) {
  const color = tone === 'negative' ? 'text-negative' : tone === 'accent' ? 'text-accent-deep' : 'text-ink'
  return (
    <div className="ui-card p-5">
      <div className={`kpi-num whitespace-nowrap text-[24px] tabular-nums ${color}`}>
        {amount.toLocaleString('ko-KR')}
        <span className="ml-1 text-sm font-medium text-ink-sub">원</span>
      </div>
      <div className="t-caption mt-1.5 inline-flex items-center gap-1">
        {label}
        {help && <InfoTip text={help} />}
      </div>
      {support != null && (
        <div className="mt-3 border-t border-border pt-2.5 text-xs text-ink-sub">{support}</div>
      )}
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
  // 견적 목록은 app_role 게이트 대상이라(§6.1) 권한 있는 사용자에게만 부른다.
  const canQuotes = !!me.data && canUseQuotes(me.data)
  const quotes = useAsync(
    () => (canQuotes ? provider.listQuotes() : Promise.resolve([] as Quote[])),
    [canQuotes],
  )

  const isPm = me.data?.role === 'pm'
  const finalQuotes = useMemo(
    () => (quotes.data ?? []).filter((q) => q.is_final && (q.project_id === projectId || q.project_id === null)),
    [quotes.data, projectId],
  )

  const [pickedQuote, setPickedQuote] = useState('')
  const [rebasing, setRebasing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addingBucket, setAddingBucket] = useState(false)
  const [bucketDraft, setBucketDraft] = useState({ code: '', label: '' })
  const [overOnly, setOverOnly] = useState(false)

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
  const deleteItem = useMutation((itemId: string) => provider.deleteSettlementItem(itemId))
  const promoteVendor = useMutation((name: string) => provider.upsertVendor({ name }))

  const view = board.data
  const totals = view?.totals

  const mutationError =
    createBoard.error ?? rebase.error ?? addBucket.error ?? createItem.error ?? updateItem.error ?? deleteItem.error

  // ── 빈 상태 — 확정 견적을 불러오는 것이 시작점이다(R-S2) ─────────────
  if (!board.loading && !view) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader caption="운영 · S-10" title="정산보드" />
        <div className="ui-card p-6">
          <EmptyState
            message="확정 견적을 불러와 정산을 시작합니다."
            action={
              isPm && !readOnly ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <select
                    aria-label="기준 견적"
                    className="ui-input"
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
                    className="btn btn-accent"
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
      <div className="p-6">
        <PageHeader caption="운영 · S-10" title="정산보드" />
        <p className="mt-6 text-sm text-ink-sub">{board.error ?? '불러오는 중…'}</p>
      </div>
    )
  }

  const excludedTotal = totals.excluded.reduce((s, e) => s + e.amount, 0)
  const contractTotal = totals.marginBase + excludedTotal
  const fixedTotal = totals.fixedByBucket.reduce((s, f) => s + f.amount, 0)
  const spendVsOrdered = totals.totalOrdered === 0 ? null : totals.totalActual / totals.totalOrdered
  // 마커 위치 — 밴드 밖이어도 경고하지 않고 위치만 찍는다(§19.1). 0~100%로만 클램프한다
  const markerLeft = Math.min(100, Math.max(0, (totals.marginRate ?? 0) * 100))
  const diff = rebasing && pickedQuote ? rebaseDiff(finalQuotes.find((q) => q.id === pickedQuote)!, view.buckets.map((b) => b.bucket)) : []

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        caption="운영 · S-10"
        title="정산보드"
        action={
          <>
            <span className="rounded-full bg-track px-3 py-1 text-xs text-ink-sub">내부 전용</span>
            {isPm && !readOnly && (
              <button type="button" className="btn btn-ghost" onClick={() => setRebasing((v) => !v)}>
                기준 견적 갱신
              </button>
            )}
          </>
        }
      />

      <p className="text-sm text-ink-sub">
        기준 견적 <span className="font-medium text-ink">{view.quote_label ?? '—'}</span> · 모든 금액은 부가세
        별도입니다. 이 화면의 숫자는 발주처에 공개되지 않습니다.
      </p>

      {/* 기준 견적 갱신 — 차이를 먼저 보여주고 확인받는다(R-S2) */}
      {rebasing && isPm && (
        <section className="ui-card p-5">
          <h2 className="t-section-title">기준 견적 갱신</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="갱신할 견적"
              className="ui-input"
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
                            <td
                              className={`ui-num font-medium ${
                                d.after - d.before < 0 ? 'text-negative' : 'text-positive'
                              }`}
                            >
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

      {/* KPI 4 (§19.1) — 각 장에 보조 수치 1줄(패턴 §07) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile
          label="마진 기준 계약액"
          amount={totals.marginBase}
          help={SETTLEMENT_KPI_HELP.contract}
          support={
            <span data-testid="kpi-support-contract">
              계약 {num(contractTotal)} − 마진 밖 {num(excludedTotal)}
            </span>
          }
        />
        <MoneyTile
          label="실집행"
          amount={totals.totalActual}
          help={SETTLEMENT_KPI_HELP.spent}
          support={
            <span data-testid="kpi-support-spent">
              발주 {num(totals.totalOrdered)} 대비 {pct(spendVsOrdered)}
            </span>
          }
        />
        <MoneyTile
          label="최종 마진"
          amount={totals.finalMargin}
          tone={totals.finalMargin < 0 ? 'negative' : 'accent'}
          help={SETTLEMENT_KPI_HELP.margin}
          support={
            <span data-testid="kpi-support-margin">
              변동 {num(totals.variableMarkup)} + 고정 {num(fixedTotal)}
            </span>
          }
        />
        <div className="ui-card p-5">
          <div className="kpi-num text-[24px] tabular-nums">{pct(totals.marginRate)}</div>
          <div className="t-caption mt-1.5 inline-flex items-center gap-1">
            마진율
            <InfoTip text={SETTLEMENT_KPI_HELP.marginRate} />
          </div>
          {/* 실측 밴드는 참고선이다 — 밴드 밖이라고 판정·경고하지 않는다(§19.1).
              현재 마진율은 막대 위 마커로 위치만 찍는다. */}
          <div className="relative mt-2.5 h-1.5 w-full rounded-[3px] bg-track">
            <div
              className="absolute inset-y-0 rounded-[3px] bg-accent-tint"
              style={{
                left: `${MARGIN_BAND.low * 100}%`,
                width: `${(MARGIN_BAND.high - MARGIN_BAND.low) * 100}%`,
              }}
            />
            <span
              data-testid="margin-rate-marker"
              aria-hidden
              className="absolute -top-[3px] h-3 w-0.5 rounded-[1px] bg-ink"
              style={{ left: `${markerLeft}%` }}
            />
          </div>
          <div className="mt-3 border-t border-border pt-2.5 text-xs text-ink-sub">
            참고: 사내 실측 27.5~69.0% · 판정 아님
          </div>
        </div>
      </div>

      {/* 마진 구성 + 검산 한 카드 — 초과 경보는 그 카드 하단 바(시안) */}
      <MarginSummaryCard
        totals={totals}
        contractTotal={contractTotal}
        excludedTotal={excludedTotal}
        overOnly={overOnly}
        onToggleOverOnly={() => setOverOnly((v) => !v)}
      />

      <ErrorAlert message={mutationError} />

      {/* 버킷 표 — 원가 없음·마진 밖 버킷도 canvas 면으로 남긴다(숨기지 않는다) */}
      <SettlementBucketTable
        buckets={view.buckets}
        totals={totals}
        contractTotal={contractTotal}
        expandedId={expanded}
        onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
        overOnly={overOnly}
        onClearOverOnly={() => setOverOnly(false)}
        action={
          isPm && !readOnly ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingBucket((v) => !v)}>
              {addingBucket ? '닫기' : '＋ 버킷 추가'}
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
              if (ok !== undefined) board.reload()
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

      {/* 행사별 추가 버킷 (pm) — 견적에 없던 비용은 0원에서 시작한다(§19.2) */}
      {isPm && !readOnly && (
        <section className="flex flex-wrap items-center gap-2">
          {addingBucket && (
            <>
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
            </>
          )}

          {/* 업로드 파싱은 서버 의존이라 v8 예약이다(§19.5) — 자리만 두고 시점을 밝힌다 */}
          <button type="button" className="btn btn-ghost ml-auto" disabled title="Phase 4.7에서 열립니다">
            협력사 견적서 불러오기 · Phase 4.7에서 열립니다
          </button>
        </section>
      )}
    </div>
  )
}
