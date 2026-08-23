// S-10 정산보드 (설계서 v2.2 §19 · §10) — Phase 3.14b·3.14c
//
// **내부 전용 화면이다.** 발주처 토큰 경로(/c/*)·운영계획서·랜딩·알림 어디에도
// 이 화면의 숫자는 나가지 않는다(§4-24 R-S9).
//
// 화면이 답해야 하는 질문은 하나다: "지금까지 쓴 돈이 최초 계약 견적 대비 ±얼마인가."
// 그래서 상단은 마진(계약 − 리드젠 − 실집행)이고, 하단은 그 마진이 버킷별로 어디서
// 났는지·어디서 깨졌는지다.
import { useMemo, useState } from 'react'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import MarginBar from '../components/settlement/MarginBar'
import SettlementItems from '../components/settlement/SettlementItems'
import { canUseQuotes } from '../components/quote/QuoteGate'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { quoteBucketSpec } from '../lib/settlement'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { getDataProvider } from '../providers'
import type { SettlementItemInput } from '../providers/DataProvider'
import type { Quote } from '../types/entities'

const provider = getDataProvider()

/** 실측 내부정산 밴드 — **참고선일 뿐 판정하지 않는다**(§19.1). 낮다고 경고를 띄우지 않는다 */
const MARGIN_BAND = { low: 0.275, high: 0.69 }

function krw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
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
 * StatTile과 같은 구조를 쓰되 숫자만 한 단계 줄이고 단위를 접미로 뺀다(§5 카드 규격 유지).
 */
function MoneyTile({
  label,
  amount,
  tone = 'default',
}: {
  label: string
  amount: number
  tone?: 'default' | 'accent' | 'negative'
}) {
  const color = tone === 'negative' ? 'text-negative' : tone === 'accent' ? 'text-accent-deep' : 'text-ink'
  return (
    <div className="ui-card p-5">
      <div className={`kpi-num whitespace-nowrap text-[24px] tabular-nums ${color}`}>
        {amount.toLocaleString('ko-KR')}
        <span className="ml-1 text-sm font-medium text-ink-sub">원</span>
      </div>
      <div className="t-caption mt-1.5">{label}</div>
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
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr>
                        <th className="ui-th">버킷</th>
                        <th className="ui-th text-right">현재</th>
                        <th className="ui-th text-right">변경</th>
                        <th className="ui-th text-right">차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.map((d) => (
                        <tr key={d.code} className="border-t border-border">
                          <td className="px-3 py-2">{d.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-sub">{krw(d.before)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{krw(d.after)}</td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-medium ${
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
                </>
              )}
            </div>
          )}
          <ErrorAlert message={rebase.error} />
        </section>
      )}

      {/* KPI 4 (§19.1) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile label="마진 기준 계약액" amount={totals.marginBase} />
        <MoneyTile label="실집행" amount={totals.totalActual} />
        <MoneyTile
          label="최종 마진"
          amount={totals.finalMargin}
          tone={totals.finalMargin < 0 ? 'negative' : 'accent'}
        />
        <div className="ui-card p-5">
          <div className="kpi-num text-[24px] tabular-nums">{pct(totals.marginRate)}</div>
          <div className="t-caption mt-1.5">마진율</div>
          {/* 실측 밴드는 참고선이다 — 밴드 밖이라고 판정·경고하지 않는다(§19.1) */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-track">
            <div
              className="h-full rounded-full bg-accent-tint"
              style={{
                marginLeft: `${MARGIN_BAND.low * 100}%`,
                width: `${(MARGIN_BAND.high - MARGIN_BAND.low) * 100}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-cap">참고: 사내 실측 27.5~69.0%</p>
        </div>
      </div>

      <MarginBar totals={totals} />

      {/* 검산 — 항등식이 깨지면 버킷 플래그가 잘못된 것이다(§19.1) */}
      <section className={`ui-card p-5 ${totals.identityOk ? '' : 'border-negative'}`}>
        <h2 className="t-section-title">검산</h2>
        <p className="mt-2 text-sm tabular-nums text-ink-sub">
          계약 {krw(contractTotal)} − 리드젠 {krw(excludedTotal)} − 실집행 {krw(totals.totalActual)} ={' '}
          <span className="font-semibold text-ink">{krw(totals.finalMargin)}</span>
        </p>
        {totals.identityOk ? (
          <p className="mt-1 text-xs text-positive">항등식이 성립합니다.</p>
        ) : (
          <p className="mt-1 text-sm font-medium text-negative" role="alert">
            항등식이 어긋납니다 — 버킷의 원가·마진 기준 설정을 확인하세요.
          </p>
        )}
        {totals.overBudgetCount > 0 && (
          <p className="mt-2 text-sm font-medium text-negative" role="alert">
            견적 초과 버킷 {totals.overBudgetCount}건 — 초과는 막지 않으니 사유를 남겨 주세요.
          </p>
        )}
      </section>

      <ErrorAlert message={mutationError} />

      {/* 버킷 표 — 원가 없음·마진 밖 버킷도 회색으로 남긴다(숨기지 않는다) */}
      <section className="ui-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="ui-th">버킷</th>
              <th className="ui-th text-right">견적</th>
              <th className="ui-th text-right">발주</th>
              <th className="ui-th text-right">실집행</th>
              <th className="ui-th text-right">마크업</th>
              <th className="ui-th text-right">마크업률</th>
            </tr>
          </thead>
          <tbody>
            {view.buckets.map((b) => {
              const muted = !b.bucket.has_cost
              const open = expanded === b.bucket.id
              return [
                <tr
                  key={b.bucket.id}
                  data-testid={`bucket-row-${b.bucket.code}`}
                  onClick={() => setExpanded(open ? null : b.bucket.id)}
                  className={`cursor-pointer border-t border-border ${
                    b.over_budget ? 'bg-negative-tint' : open ? 'bg-track' : 'hover:bg-track'
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <span className={`font-medium ${muted ? 'text-ink-sub' : 'text-ink'}`}>
                      {b.bucket.label}
                    </span>
                    {b.over_budget && (
                      <span className="ml-2 rounded-full bg-negative px-2 py-0.5 text-xs text-white">
                        견적 초과
                      </span>
                    )}
                    {!b.bucket.has_cost && (
                      <span className="ml-2 rounded-full bg-track px-2 py-0.5 text-xs text-ink-cap">
                        원가 없음
                      </span>
                    )}
                    {!b.bucket.is_margin_base && (
                      <span className="ml-2 rounded-full bg-track px-2 py-0.5 text-xs text-ink-cap">
                        마진 계산 밖
                      </span>
                    )}
                    {b.bucket.source === 'custom' && (
                      <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-xs text-accent-deep">
                        추가 버킷
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${muted ? 'text-ink-cap' : 'text-ink-sub'}`}>
                    {krw(b.bucket.quote_amount)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${muted ? 'text-ink-cap' : 'text-ink-sub'}`}>
                    {b.bucket.has_cost ? krw(b.ordered) : '—'}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${muted ? 'text-ink-cap' : 'font-medium text-ink'}`}>
                    {b.bucket.has_cost ? krw(b.actual) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                      b.markup < 0 ? 'text-negative' : muted ? 'text-ink-cap' : 'text-ink'
                    }`}
                  >
                    {krw(b.markup)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${muted ? 'text-ink-cap' : 'text-ink-sub'}`}>
                    {pct(b.markup_rate)}
                  </td>
                </tr>,
                open ? (
                  <tr key={`${b.bucket.id}-items`}>
                    <td colSpan={6} className="p-0">
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
                    </td>
                  </tr>
                ) : null,
              ]
            })}
          </tbody>
        </table>
      </section>

      {/* 행사별 추가 버킷 (pm) — 견적에 없던 비용은 0원에서 시작한다(§19.2) */}
      {isPm && !readOnly && (
        <section className="flex flex-wrap items-center gap-2">
          {addingBucket ? (
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
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setAddingBucket(true)}>
              ＋ 버킷 추가
            </button>
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
