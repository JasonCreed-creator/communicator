// S9-D 16:9 장표형 운영계획서 — 설계서 v2.13.2 §23.7 · 디자인지시서 §7-2.15 (Phase 3.24 PR-C).
// 운영계획서(S9)와 같은 조립 데이터(getPlan)를 16:9 장표로 싣는다. 사이드바 없는 전체 화면(인쇄 = 장표만).
// 인쇄: 장표 한 장 = 한 쪽(@page deck 338.67mm×190.5mm — src/index.css). 화면: 폭에 맞춰 zoom으로 줄인다.
// 도구 줄(인쇄 제외) = 운영계획서로 · 장 수 · 싣지 못한 표(어디서 채우는지) · 인쇄 · PDF.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorAlert from '../components/internal/ErrorAlert'
import DeckSlideView, { type DeckMeta } from '../components/plan/deck/DeckSlideView'
import { buildPlanDeck, DECK_CHAPTERS, DECK_SIZE } from '../components/plan/deck/planDeck'
import { formatPrintedAt, planVersionLabel } from '../components/plan/planDocMeta'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { ROLE_LABELS } from '../lib/labels'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

/** 화면 폭에 맞춘 장표 배율 — 1 이하. ResizeObserver가 없는 환경(jsdom)에서는 1 */
function useDeckScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setScale(Math.min(1, w / DECK_SIZE.width))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, scale }
}

export default function PlanDeckPage() {
  const { projectId } = useProject()
  const plan = useAsync(() => provider.getPlan(projectId), [projectId])
  const user = useAsync(() => provider.getCurrentUser(), [])
  // 출력일시·D-day 기준은 이 화면을 연 시각으로 고정(리렌더마다 흔들리면 표지·꼬리 줄 값이 어긋난다)
  const openedAt = useMemo(() => new Date(), [])
  const printedAt = useMemo(() => formatPrintedAt(openedAt), [openedAt])
  const { ref, scale } = useDeckScale()
  const [gapsOpen, setGapsOpen] = useState(false)

  const deck = useMemo(() => (plan.data ? buildPlanDeck(plan.data, openedAt) : null), [plan.data, openedAt])

  // 브라우저 탭 제목 = PDF 저장 기본 파일 이름
  useEffect(() => {
    if (!plan.data) return
    const prev = document.title
    document.title = `${plan.data.project.name} 운영계획서 (16:9)`
    return () => {
      document.title = prev
    }
  }, [plan.data])

  const meta: DeckMeta | null =
    plan.data && deck
      ? {
          project: plan.data.project,
          // S9와 같은 규칙 — 운영계획서는 아직 스냅숏 대상이 아니라 '초안'
          versionLabel: planVersionLabel(null),
          printedAt,
          authorLabel: user.data ? `${user.data.name} · ${ROLE_LABELS[user.data.role]}` : '—',
          total: deck.slides.length,
          today: openedAt,
        }
      : null

  return (
    <div className="deck-page min-h-screen bg-canvas">
      <header className="print-hidden sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/plan" className="shrink-0 text-[13px] text-steel underline">
              ← 운영계획서
            </Link>
            <div className="min-w-0">
              <h1 className="m-0 truncate text-[17px] font-semibold text-ink">16:9 장표</h1>
              <p className="m-0 truncate text-[12px] text-ink-cap">
                {deck ? `전 ${deck.slides.length}장 · 표지 · 목차 · 운영 요약 · 01~07장` : '불러오는 중…'}
                {' · '}크롬·엣지에서 인쇄하면 용지가 16:9로 잡힙니다
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {deck && deck.gaps.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={gapsOpen}
                aria-controls="deck-gaps"
                onClick={() => setGapsOpen((v) => !v)}
              >
                싣지 못한 표 {deck.gaps.length}개
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!deck}>
              인쇄 · PDF
            </button>
          </div>
        </div>
        {deck && gapsOpen && (
          <div id="deck-gaps" className="border-t border-border bg-canvas">
            <ul className="mx-auto m-0 grid max-w-[1360px] list-none grid-cols-1 gap-x-8 gap-y-1 px-5 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
              {deck.gaps.map((g) => (
                <li key={`${g.chapter}-${g.label}`} className="flex gap-2">
                  <span className="shrink-0 text-ink-cap">{DECK_CHAPTERS[g.chapter].number}</span>
                  <span className="text-ink">{g.label}</span>
                  <span className="text-ink-cap">— {g.where}에서 채우면 들어갑니다</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-[1360px] px-5 py-6 print:p-0">
        <ErrorAlert message={plan.error} />
        <ErrorAlert message={user.error} />
        {plan.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
        <div ref={ref} className="deck-stage flex flex-col items-center gap-6 print:gap-0">
          {deck &&
            meta &&
            deck.slides.map((slide, i) => (
              <div key={slide.id} className="deck-zoom" style={{ zoom: scale }}>
                <DeckSlideView slide={slide} no={i + 1} meta={meta} />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
