// S-2 견적 목록 (§10) — 좌: 견적 버전 표(버전·인원·베뉴·모객·총액·상태) / 우: 선택 버전 요약.
// 상단: Excel 내려받기 · ＋ 새 버전 · ＋ 새 견적. 금액은 이 화면(와 Excel)에만 — 접근 = admin·sales.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/internal/EmptyState'
import PageHeader from '../components/internal/PageHeader'
import QuoteGate from '../components/quote/QuoteGate'
import { fmtWon } from '../components/quote/quoteFormState'
import QUOTE_STR from '../components/quote/quoteStrings'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { venueDisplayName } from '../modules/quote/engine/quoteInput'
import { saveQuoteFile } from '../modules/quote/export/saveQuoteFile'
import { getDataProvider } from '../providers'
import type { Quote } from '../types/entities'

const provider = getDataProvider()

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-track text-ink-sub',
  proposed: 'bg-steel-tint text-steel',
  accepted: 'bg-positive-tint text-positive',
  archived: 'bg-track text-ink-cap',
  superseded: 'bg-track text-ink-cap',
}

function QuotesBody() {
  const t = QUOTE_STR.ko
  const navigate = useNavigate()
  const { summaries, setProject } = useProject()
  const list = useAsync(() => provider.listQuotes(), [])
  const quotes = useMemo(() => list.data ?? [], [list.data])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

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

  const QuoteTable = ({ rows }: { rows: Quote[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="ui-th">{t.listColVersion}</th>
            <th className="ui-th">{t.listColHeadcount}</th>
            <th className="ui-th">{t.listColVenue}</th>
            <th className="ui-th">{t.listColLeads}</th>
            <th className="ui-th text-right">{t.listColTotal}</th>
            <th className="ui-th">{t.listColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const isSel = selected?.id === q.id
            return (
              <tr
                key={q.id}
                onClick={() => setSelectedId(q.id)}
                className={`cursor-pointer border-b border-border ${isSel ? 'bg-accent-tint' : 'hover:bg-track'}`}
              >
                <td className="px-3 py-2.5 font-semibold text-ink">
                  v{q.version}
                  {q.is_final && <span aria-hidden className="ml-1">🔒</span>}
                </td>
                <td className="px-3 py-2.5 text-ink">{q.input.headcount}명</td>
                <td className="max-w-44 truncate px-3 py-2.5 text-ink-sub" title={q.input.selected_venue ? venueDisplayName(q.input.selected_venue) : undefined}>
                  {q.input.selected_venue ? venueDisplayName(q.input.selected_venue) : t.tbd}
                </td>
                <td className="px-3 py-2.5 text-ink-sub">{q.input.include_leads ? t.listLeadsOn : t.listLeadsOff}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-ink">{fmtWon(q.total_amount, false)}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[q.status] ?? 'bg-track text-ink-sub'}`}>
                    {t.statusLabels[q.status] ?? q.status}
                  </span>
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
        <p className="text-sm text-ink-cap">불러오는 중…</p>
      ) : list.error ? (
        <p className="text-sm text-negative">{list.error}</p>
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
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[selected.status]}`}>
                    {selected.is_final ? '🔒 ' : ''}
                    {t.statusLabels[selected.status] ?? selected.status}
                  </span>
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
