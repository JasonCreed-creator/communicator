// 견적 목록 — 디자인지시서 v1.4 §7-2.10(PR-6 · 캔버스 '견적 목록 — 동작은 고른 견적 옆으로').
// 좌: 행사별 버전 표(행사 연결 묶음 → 행사 없이 견적만) / 우 380: 고른 견적 요약 + 그 견적에 대한 동작.
//
//  · 머리 = '견적서 가져오기'(ghost) + '＋ 새 견적'(채운 버튼 1개) — 고른 견적에만 걸리는 동작
//    (Excel·구글 시트·새 버전으로 고치기)은 머리에서 요약 패널 아래로 옮겼다(무엇에 대한 동작인지 옆에서 읽힌다).
//  · 표 = 표 정본 6열 고정 폭(버전 76 · 인원 72 · 베뉴 · 모객 56 · 총액 156 · 상태 84), 최신 버전 위.
//    고른 행 = accent-tint 면 + 첫 칸 3px accent 줄. 확정본은 버전 옆 자물쇠(이모지 대신 선 아이콘).
//  · 요약 = 제목 · 구성 막대 · 8행 · 합계 3줄 · 이전 버전 대비(바뀐 것 — 사실만) · 동작.
// 금액은 이 화면(와 Excel·구글 시트)에만 — 접근 = admin·sales.
// ⚠ 엔진 상수·산식은 손대지 않는다 — 이 화면은 표시 계층만 바꾼다(DoD 21·22).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/internal/EmptyState'
import LoadFailedState from '../components/internal/LoadFailedState'
import PageHeader from '../components/internal/PageHeader'
import { LevelBadge } from '../components/internal/StatusBadge'
import TableSkeleton from '../components/internal/TableSkeleton'
import QuoteComposition from '../components/quote/QuoteComposition'
import QuoteGate from '../components/quote/QuoteGate'
import QuoteSheetResultCard from '../components/quote/QuoteSheetResultCard'
import QuoteVersionDelta, { previousVersion } from '../components/quote/QuoteVersionDelta'
import { ActionIcon, LockMark } from '../components/quote/quoteIcons'
import { fmtWon } from '../components/quote/quoteFormState'
import { QUOTE_STATUS_LEVEL } from '../components/quote/quoteStatus'
import QUOTE_STR, { type QuoteStrings } from '../components/quote/quoteStrings'
import { useQuoteSpreadsheet } from '../components/quote/useQuoteSpreadsheet'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { subjectParticle } from '../lib/labels'
import { venueDisplayName } from '../modules/quote/engine/quoteInput'
import type { QuoteSpreadsheetResult } from '../modules/quote/export/createQuoteSpreadsheet'
import { saveQuoteFile } from '../modules/quote/export/saveQuoteFile'
import { getDataProvider } from '../providers'
import type { Quote } from '../types/entities'

const provider = getDataProvider()

const byVersionDesc = (a: Quote, b: Quote) => b.version - a.version

function venueOf(q: Quote, t: QuoteStrings): string {
  return q.input.selected_venue ? venueDisplayName(q.input.selected_venue) : t.tbd
}

/** 행사 하나(또는 '행사 없이 견적만')의 버전 표 카드 */
function QuoteGroupCard({
  title,
  caption,
  rows,
  selectedId,
  onSelect,
  onGoProject,
  t,
}: {
  title: string
  caption: string
  rows: Quote[]
  selectedId: string | null
  onSelect: (id: string) => void
  onGoProject?: () => void
  t: QuoteStrings
}) {
  return (
    <section className="ui-card overflow-hidden" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="t-card-title">{title}</h2>
          <span className="t-caption">{caption}</span>
        </div>
        {onGoProject && (
          <button type="button" onClick={onGoProject} className="text-[13px] font-medium text-accent-deep hover:underline">
            {t.listGoProject}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="ui-table min-w-[600px] table-fixed text-sm">
          <colgroup>
            <col className="w-[76px]" />
            <col className="w-[72px]" />
            <col />
            <col className="w-[56px]" />
            <col className="w-[156px]" />
            <col className="w-[84px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="ui-th">{t.listColVersion}</th>
              <th className="ui-th">{t.listColHeadcount}</th>
              <th className="ui-th">{t.listColVenue}</th>
              <th className="ui-th">{t.listColLeads}</th>
              {/* 금액 열 — 우측정렬 tabular(.ui-num) */}
              <th className="ui-th ui-num text-right">{t.listColTotal}</th>
              <th className="ui-th">{t.listColStatus}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const isSel = q.id === selectedId
              const venue = venueOf(q, t)
              return (
                <tr
                  key={q.id}
                  data-testid={`quote-row-${q.id}`}
                  data-selected={isSel || undefined}
                  onClick={() => onSelect(q.id)}
                  className="cursor-pointer"
                  // 고른 행 = accent-tint 면 — 스티키 첫 열이 background:inherit라 tr에 인라인으로 건다
                  style={isSel ? { background: 'var(--accent-tint)' } : undefined}
                >
                  <td
                    className="font-semibold text-ink"
                    style={{ boxShadow: `inset 3px 0 0 ${isSel ? 'var(--accent)' : 'transparent'}` }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {/* 키보드로 고르는 자리 — 행 누르기와 같은 동작 */}
                      <button
                        type="button"
                        aria-pressed={isSel}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(q.id)
                        }}
                        className="font-semibold text-ink hover:underline"
                      >
                        v{q.version}
                      </button>
                      {q.is_final && <LockMark />}
                    </span>
                  </td>
                  <td className="text-ink">
                    {q.input.headcount}
                    {t.pax}
                  </td>
                  {/* …처리 — 잘린 값은 title로 전체 확인(§05 조건 2) */}
                  <td className="text-ink-sub" title={venue}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      {/* v2.4 §22.4 — 가져온 견적은 목록에서 바로 구분된다(DoD 34). 버전 칸이 좁아 베뉴 앞에 둔다 */}
                      {q.source === 'imported' && <LevelBadge level="progress" label="임포트" className="shrink-0" />}
                      <span className="truncate">{venue}</span>
                    </span>
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
    </section>
  )
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
  const gsheet = useQuoteSpreadsheet()

  const selected: Quote | null = useMemo(() => {
    if (quotes.length === 0) return null
    return quotes.find((q) => q.id === selectedId) ?? quotes.find((q) => q.is_final) ?? quotes[quotes.length - 1]
  }, [quotes, selectedId])

  // 묶음: 행사 연결(행사별) → 행사 없이 견적만. 묶음 안은 최신 버전이 위
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
    return {
      linked: [...linked.entries()].map(([projectId, rows]) => [projectId, [...rows].sort(byVersionDesc)] as const),
      unlinked: [...unlinked].sort(byVersionDesc),
    }
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

  const handleCreateSheet = async () => {
    if (!selected) return
    setActionError(null)
    try {
      await gsheet.create(selected.id, 'ko', t.gsheetMockNotice)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '구글 스프레드시트 생성에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        caption={t.listCaption}
        title={t.listTitle}
        action={
          <>
            {/* v2.4 §10.1 화면 D — 견적서 가져오기 위저드 진입점(§10 진입점 원칙: 버튼으로 도달) */}
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/quotes/import')}>
              <ActionIcon name="upload" />
              {t.listImport}
            </button>
            <button type="button" className="btn btn-accent" onClick={() => navigate('/quotes/new')}>
              {t.listNewQuote}
            </button>
          </>
        }
      />

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
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* 좌: 행사별 버전 표 */}
          <div className="min-w-0 space-y-4">
            {groups.linked.map(([projectId, rows]) => (
              <QuoteGroupCard
                key={projectId}
                title={projectName(projectId)}
                caption={t.listLinkedCaption(rows.length)}
                rows={rows}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onGoProject={() => {
                  setProject(projectId)
                  navigate('/home')
                }}
                t={t}
              />
            ))}
            {groups.unlinked.length > 0 && (
              <QuoteGroupCard
                title={t.listUnlinkedGroup}
                caption={t.listUnlinkedCaption}
                rows={groups.unlinked}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                t={t}
              />
            )}
          </div>

          {/* 우: 고른 견적 요약 + 그 견적에 대한 동작 */}
          {selected && (
            <QuoteSummaryPanel
              quote={selected}
              quotes={quotes}
              t={t}
              downloading={downloading}
              sheetPending={gsheet.pending}
              sheetResult={gsheet.resultFor(selected.id)}
              error={actionError}
              onDownload={() => void handleDownload()}
              onCreateSheet={() => void handleCreateSheet()}
              onEdit={() => navigate(`/quotes/${selected.id}/edit`)}
              onCreateProject={() => navigate(`/quotes/${selected.id}/edit?step=5`)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function QuoteSummaryPanel({
  quote,
  quotes,
  t,
  downloading,
  sheetPending,
  sheetResult,
  error,
  onDownload,
  onCreateSheet,
  onEdit,
  onCreateProject,
}: {
  quote: Quote
  quotes: Quote[]
  t: QuoteStrings
  downloading: boolean
  sheetPending: boolean
  sheetResult: QuoteSpreadsheetResult | null
  error: string | null
  onDownload: () => void
  onCreateSheet: () => void
  onEdit: () => void
  onCreateProject: () => void
}) {
  const b = quote.breakdown
  const rows: [string, number][] = [
    ['베뉴 사용료', b.s1],
    ['시스템 구축', b.s2],
    ['디자인·브랜딩', b.s3],
    ['운영·등록·보험', b.s4],
    ['PCO 기획료', b.s5],
    ['추가옵션', b.options],
    ['모객 솔루션', b.recruit],
    ['일반 참관객 관리', b.attendee],
  ]
  // 고치기는 늘 새 버전을 만든다(§4-18 스냅숏). 이미 뒤 버전이 있으면 저장이 409라 막고 이유를 적는다
  const newer = quote.superseded_by ? quotes.find((q) => q.id === quote.superseded_by) ?? null : null
  const verWithSubject = (n: number) => `v${n}${subjectParticle(n)}`
  const note = newer
    ? t.summarySupersededNote(verWithSubject(newer.version))
    : quote.is_final
      ? t.summaryFinalNote(verWithSubject(quote.version + 1))
      : t.summaryDraftNote(verWithSubject(quote.version + 1))

  return (
    <aside className="ui-card flex flex-col gap-4 p-5 xl:sticky xl:top-6" aria-label={t.summaryTitle} data-testid="quote-summary">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="t-caption">{t.summaryTitle}</span>
          <LevelBadge level={QUOTE_STATUS_LEVEL[quote.status] ?? 'neutral'} label={t.statusLabels[quote.status] ?? quote.status} />
        </div>
        <h2 className="t-section-title text-lg">
          {quote.title} · v{quote.version}
        </h2>
        <p className="t-caption text-ink-sub">
          {quote.input.headcount}
          {t.pax} · {venueOf(quote, t)} · {quote.input.include_leads ? t.summaryLeadsOn : t.summaryLeadsOff}
        </p>
      </div>

      {/* 구성 막대 — 8행 금액 나열보다 먼저 '어디서 비용이 났는가' */}
      <QuoteComposition breakdown={b} />

      <dl className="flex flex-col text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 py-1">
            <dt className="text-brown">{label}</dt>
            <dd className={`ui-num ${value === 0 ? 'text-ink-cap' : 'text-ink'}`}>{fmtWon(value, false)}</dd>
          </div>
        ))}
      </dl>

      <dl className="flex flex-col gap-1 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-semibold text-ink">합계 (VAT 별도)</dt>
          <dd className="ui-num text-lg font-bold text-ink">{fmtWon(b.subtotal, false)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-[13px] text-ink-sub">
          <dt>부가세 10%</dt>
          <dd className="ui-num">{fmtWon(b.vat, false)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-[13px] text-ink-sub">
          <dt>합계 (VAT 포함)</dt>
          <dd className="ui-num">{fmtWon(b.total, false)}</dd>
        </div>
      </dl>

      {/* 이전 버전 대비 — 증감과 입력 스냅숏에서 확인되는 사실(바뀐 것)만 */}
      <QuoteVersionDelta current={quote} previous={previousVersion(quotes, quote)} />

      <div className="flex flex-col gap-2">
        {/* 좁은 폰에서는 두 버튼 글자가 반 칸에 안 들어가 한 줄씩 쌓는다 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-ghost px-2" onClick={onDownload} disabled={downloading}>
            <ActionIcon name="download" />
            {t.listDownload}
          </button>
          <button type="button" className="btn btn-ghost px-2" onClick={onCreateSheet} disabled={sheetPending}>
            <ActionIcon name="sheet" />
            {sheetPending ? t.gsheetPending : t.listGsheet}
          </button>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onEdit} disabled={!!newer}>
          {t.summaryEditNew}
        </button>
        {/* 확정됐지만 행사가 없는 견적 — 이 자리에서 행사 만들기로(§16). 머리의 '새 견적'이 채운 버튼이라 ghost */}
        {quote.is_final && !quote.project_id && (
          <button type="button" className="btn btn-ghost" onClick={onCreateProject}>
            {t.s5CreateBtn} →
          </button>
        )}
        <p className="t-caption text-center" data-testid="quote-edit-note">
          {note}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}
      {sheetResult && <QuoteSheetResultCard result={sheetResult} t={t} />}
    </aside>
  )
}

export default function QuotesPage() {
  return <QuoteGate>{() => <QuotesBody />}</QuoteGate>
}
