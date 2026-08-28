// S-2 견적 목록 (§10) — 좌: 견적 버전 표(버전·인원·베뉴·모객·총액·상태) / 우: 선택 버전 요약.
// 상단: Excel 내려받기 · ＋ 새 버전 · ＋ 새 견적. 금액은 이 화면(와 Excel)에만 — 접근 = admin·sales.
//
// 3.17b 시안 정렬('랜딩보드 · 견적.dc.html'):
//  · 버전 표를 **표 정본**(.ui-table + .ui-th)으로 — 44 고정·zebra·스티키 첫 열,
//    총액 열은 .ui-num(우측정렬 tabular)로 세워 버전 간 금액 비교가 세로로 되게 한다.
//  · 상태 pill을 **배지 정본**(LevelBadge · rounded-full · 12/500)으로 통일.
//  · 요약 8행 **위에 구성 스택 막대**, 아래에 **'이전 버전 대비'** 블록.
// ⚠ 엔진 상수·산식은 손대지 않는다 — 이 화면은 표시 계층만 바꾼다(DoD 21·22).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/internal/EmptyState'
import LoadFailedState from '../components/internal/LoadFailedState'
import PageHeader from '../components/internal/PageHeader'
import SortableTh, { type SortDirection } from '../components/internal/SortableTh'
import { LevelBadge } from '../components/internal/StatusBadge'
import TableSkeleton from '../components/internal/TableSkeleton'
import QuoteComposition from '../components/quote/QuoteComposition'
import QuoteGate from '../components/quote/QuoteGate'
import QuoteVersionDelta, { previousVersion } from '../components/quote/QuoteVersionDelta'
import { fmtWon } from '../components/quote/quoteFormState'
import { QUOTE_STATUS_LEVEL } from '../components/quote/quoteStatus'
import QUOTE_STR from '../components/quote/quoteStrings'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { venueDisplayName } from '../modules/quote/engine/quoteInput'
import { saveQuoteFile } from '../modules/quote/export/saveQuoteFile'
import { getDataProvider } from '../providers'
import type { Quote } from '../types/entities'

const provider = getDataProvider()

type SortKey = 'version' | 'total'

function QuotesBody() {
  const t = QUOTE_STR.ko
  const navigate = useNavigate()
  const { summaries, setProject } = useProject()
  const list = useAsync(() => provider.listQuotes(), [])
  const quotes = useMemo(() => list.data ?? [], [list.data])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // 기본 정렬 = 최신 버전 위로(시안의 활성 화살표 ↓)
  const [sortKey, setSortKey] = useState<SortKey>('version')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const selected: Quote | null = useMemo(() => {
    if (quotes.length === 0) return null
    return quotes.find((q) => q.id === selectedId) ?? quotes.find((q) => q.is_final) ?? quotes[quotes.length - 1]
  }, [quotes, selectedId])

  // 그룹: 행사 연결(프로젝트별) → 견적만 있음
  const groups = useMemo(() => {
    const linked = new Map<string, Quote[]>()
    const unlinked: Quote[] = []
    for (const q of quotes) {
      if (q.project_id) {
        const arr = linked.get(q.project_id) ?? []
        arr.push(q)
        linked.set(q.project_id, arr)
      } else {
        unlinked.push(q)
      }
    }
    return { linked, unlinked }
  }, [quotes])

  const projectName = (id: string) => summaries.find((s) => s.id === id)?.name ?? id

  const handleDownload = async () => {
    if (!selected) return
    setDownloading(true)
    setActionError(null)
    try {
      const { file_name, blob } = await provider.exportQuoteXlsx(selected.id, 'ko')
      await saveQuoteFile(blob, file_name)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '엑셀 생성에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  const sortRows = (rows: Quote[]): Quote[] => {
    const sign = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) =>
      sortKey === 'version'
        ? (a.version - b.version) * sign
        : (a.total_amount - b.total_amount) * sign || (a.version - b.version) * sign,
    )
  }

  const QuoteTable = ({ rows }: { rows: Quote[] }) => (
    <div className="overflow-x-auto">
      <table className="ui-table min-w-[640px] text-sm">
        <thead>
          <tr>
            <SortableTh
              active={sortKey === 'version'}
              direction={sortDir}
              onSort={() => toggleSort('version')}
              className="w-[132px]"
            >
              {t.listColVersion}
            </SortableTh>
            <th className="ui-th w-[84px]">{t.listColHeadcount}</th>
            <th className="ui-th">{t.listColVenue}</th>
            <th className="ui-th w-[76px]">{t.listColLeads}</th>
            {/* 03 금액 열 — 우측정렬 tabular(.ui-num) */}
            <SortableTh
              numeric
              active={sortKey === 'total'}
              direction={sortDir}
              onSort={() => toggleSort('total')}
              className="w-[168px]"
            >
              {t.listColTotal}
            </SortableTh>
            <th className="ui-th w-[92px]">{t.listColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {sortRows(rows).map((q) => {
            const isSel = selected?.id === q.id
            const venue = q.input.selected_venue ? venueDisplayName(q.input.selected_venue) : t.tbd
            return (
              <tr
                key={q.id}
                data-testid={`quote-row-${q.id}`}
                onClick={() => setSelectedId(q.id)}
                className="cursor-pointer"
                // 선택 행은 accent-tint 면 — 스티키 첫 열이 background:inherit라 tr에 인라인으로 건다
                style={isSel ? { background: 'var(--accent-tint)' } : undefined}
              >
                <td className="text-ink">
                  v{q.version}
                  {q.is_final && <span aria-hidden className="ml-1">🔒</span>}
                  {/* v2.4 §22.4 — 임포트로 등록된 견적은 목록에서 바로 구분된다(DoD 34) */}
                  {q.source === 'imported' && (
                    <LevelBadge level="progress" label="임포트" className="ml-1.5 font-medium" />
                  )}
                </td>
                <td className="text-ink">{q.input.headcount}명</td>
                {/* 07 …처리 — 잘린 값은 title 툴팁으로 전체 확인 가능(§05 조건 2) */}
                <td className="max-w-44 text-ink-sub" title={venue}>
                  {venue}
                </td>
                <td className="text-ink-sub">{q.input.include_leads ? t.listLeadsOn : t.listLeadsOff}</td>
                <td className="ui-num font-semibold text-ink">{fmtWon(q.total_amount, false)}</td>
                <td>
                  <LevelBadge
                    level={QUOTE_STATUS_LEVEL[q.status] ?? 'neutral'}
                    label={t.statusLabels[q.status] ?? q.status}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        caption={t.listCaption}
        title={t.listTitle}
        action={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => void handleDownload()} disabled={!selected || downloading}>
              {t.listDownload}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => selected && navigate(`/quotes/${selected.id}/edit`)}
              disabled={!selected}
            >
              {t.listNewVersion}
            </button>
            {/* v2.4 §10.1 화면 D — 견적서 가져오기 위저드 진입점(§10 진입점 원칙: 버튼으로 도달) */}
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/quotes/import')}>
              견적서 가져오기
            </button>
            <button type="button" className="btn btn-accent" onClick={() => navigate('/quotes/new')}>
              {t.listNewQuote}
            </button>
          </>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-md bg-negative-tint px-3 py-2 text-sm text-negative">
          {actionError}
        </p>
      )}

      {list.loading ? (
        // ① 로딩 — 실제 행 구조와 같은 스켈레톤(스피너 금지)
        <TableSkeleton rows={4} columns={6} />
      ) : list.error ? (
        // ⑤ 로드 실패 — 원문 그대로 + 재시도
        <LoadFailedState message={list.error} onRetry={list.reload} />
      ) : quotes.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            message={t.listEmpty}
            action={
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/quotes/new')}>
                {t.listNewQuote}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* 좌: 버전 표 (행사별 그룹) */}
          <div className="min-w-0 space-y-5">
            {[...groups.linked.entries()].map(([projectId, rows]) => (
              <section key={projectId} className="ui-card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="t-card-title">{t.listLinkedGroup(projectName(projectId))}</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setProject(projectId)
                      navigate('/')
                    }}
                  >
                    행사로 이동 →
                  </button>
                </div>
                <QuoteTable rows={rows} />
              </section>
            ))}
            {groups.unlinked.length > 0 && (
              <section className="ui-card p-4">
                <p className="t-card-title mb-2">{t.listUnlinkedGroup}</p>
                <QuoteTable rows={groups.unlinked} />
              </section>
            )}
          </div>

          {/* 우: 선택 버전 요약 */}
          {selected && (
            <aside>
              <div className="ui-card sticky top-6 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="t-caption">{t.summaryTitle}</p>
                    <p className="t-card-title mt-1">
                      {selected.title} · v{selected.version}
                    </p>
                  </div>
                  <LevelBadge
                    level={QUOTE_STATUS_LEVEL[selected.status] ?? 'neutral'}
                    label={`${selected.is_final ? '🔒 ' : ''}${t.statusLabels[selected.status] ?? selected.status}`}
                  />
                </div>
                {/* 구성 스택 막대 — 8행 금액 나열보다 먼저 '어디서 비용이 났는가'를 보여준다 */}
                <div className="mt-4">
                  <QuoteComposition breakdown={selected.breakdown} />
                </div>
                <dl className="mt-4 space-y-1.5 text-sm">
                  {[
                    [t.adjS1, selected.breakdown.s1],
                    [t.adjS2, selected.breakdown.s2],
                    [t.adjS3, selected.breakdown.s3],
                    [t.adjS4, selected.breakdown.s4],
                    ['5. PCO 기획료', selected.breakdown.s5],
                    ['추가옵션', selected.breakdown.options],
                    ['모객 솔루션', selected.breakdown.recruit],
                    ['일반 참관객 관리', selected.breakdown.attendee],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between">
                      <dt className="text-ink-sub">{label}</dt>
                      <dd className={`font-semibold ${(value as number) === 0 ? 'text-ink-cap' : 'text-ink'}`}>
                        {fmtWon(value as number, false)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="font-bold text-ink">합계 (VAT 별도)</dt>
                    <dd className="font-bold text-accent-deep">{fmtWon(selected.breakdown.subtotal, false)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-sub">VAT (10%)</dt>
                    <dd className="font-semibold text-ink">{fmtWon(selected.breakdown.vat, false)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-sub">합계 (VAT 포함)</dt>
                    <dd className="font-semibold text-ink">{fmtWon(selected.breakdown.total, false)}</dd>
                  </div>
                </dl>
                {/* 이전 버전 대비 — 증감액·증감률·사유(사유는 스키마에 없어 '미기재') */}
                <div className="mt-4">
                  <QuoteVersionDelta current={selected} previous={previousVersion(quotes, selected)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/quotes/${selected.id}/edit`)}>
                    {selected.is_final ? t.summaryEdit : t.summaryEditDraft}
                  </button>
                  {selected.is_final && !selected.project_id && (
                    <button type="button" className="btn btn-accent btn-sm" onClick={() => navigate(`/quotes/${selected.id}/edit?step=5`)}>
                      {t.s5CreateBtn}
                    </button>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

export default function QuotesPage() {
  return <QuoteGate>{() => <QuotesBody />}</QuoteGate>
}
