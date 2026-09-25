// S-2 견적 에디터 — 5스텝(①규모·유형 ②베뉴 ③옵션 ④확인·확정 ⑤행사 만들기).
// RQC의 스텝 상태·계산 호출을 components/quote/*로 분해 이식(§17.2) — 스타일은 tokens.css,
// 한/영 토글 유지·다크 토글 제거. 저장은 항상 스냅샷(새 견적/새 버전) — §8 /quotes 계약.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import SegmentedToggle from '../components/internal/SegmentedToggle'
import QuoteGate from '../components/quote/QuoteGate'
import StepHandoff from '../components/quote/StepHandoff'
import StepOptions from '../components/quote/StepOptions'
import StepReview from '../components/quote/StepReview'
import StepScale from '../components/quote/StepScale'
import StepVenue from '../components/quote/StepVenue'
import { optionAmounts } from '../components/quote/optionAmounts'
import {
  applyFieldRules,
  applyIncludeLeads,
  emptyForm,
  fmtMoney,
  formFromQuote,
  formToInput,
  OPT_CATALOG,
  type QuoteFormState,
} from '../components/quote/quoteFormState'
import QUOTE_STR, { type QuoteLang } from '../components/quote/quoteStrings'
import { useQuoteSpreadsheet } from '../components/quote/useQuoteSpreadsheet'
import { useProject } from '../context/ProjectContext'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { saveQuoteFile } from '../modules/quote/export/saveQuoteFile'
import { getDataProvider } from '../providers'
import type { Quote, Targeting } from '../types/entities'

const provider = getDataProvider()
const LANG_KEY = 'communicator.quoteLang'

function readLang(): QuoteLang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko'
  } catch {
    return 'ko'
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
}

function EditorBody({ quoteId, initialStep }: { quoteId: string | null; initialStep: number }) {
  const navigate = useNavigate()
  const { setProject, reloadSummaries, summaries } = useProject()
  const [lang, setLang] = useState<QuoteLang>(() => readLang())
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // 저장 불가 환경 무시
    }
  }, [lang])
  const t = QUOTE_STR[lang]
  const en = lang === 'en'

  const [step, setStep] = useState(() => Math.min(5, Math.max(1, initialStep || 1)))
  const [form, setForm] = useState<QuoteFormState>(() => emptyForm())
  const [savedQuote, setSavedQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState<boolean>(!!quoteId)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [downloadPending, setDownloadPending] = useState(false)
  const gsheet = useQuoteSpreadsheet()
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!quoteId) {
      // /quotes/new 로 전환 — 새 견적 초기화
      setSavedQuote((prev) => {
        if (prev) setForm(emptyForm())
        return null
      })
      return
    }
    // 저장 직후 자체 navigate(URL 동기화)로 quoteId가 바뀐 경우 — 이미 최신 상태라 재로드하지 않는다
    if (savedQuote?.id === quoteId) return
    setLoading(true)
    provider
      .getQuote(quoteId)
      .then((quote) => {
        if (cancelled) return
        setSavedQuote(quote)
        setForm(formFromQuote(quote))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(messageOf(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // savedQuote는 내부 저장 동기화 가드 용도 — deps에 넣으면 저장 때마다 재조회가 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  const input = useMemo(() => formToInput(form), [form])
  const outputs = useMemo(() => computeQuoteOutputs(input), [input])
  const baseOutputs = useMemo(() => computeQuoteOutputs({ ...input, adjustments: [] }), [input])
  // 옵션별 금액 · 옵션 없는 합계 — 엔진을 옵션 집합만 바꿔 돌려 읽는다(단가 중복 정의 없음)
  const amounts = useMemo(() => optionAmounts(input, outputs), [input, outputs])
  const dirty = useMemo(
    () => !savedQuote || JSON.stringify(input) !== JSON.stringify(savedQuote.input),
    [input, savedQuote],
  )

  const onField = useCallback((key: string, value: unknown) => {
    setForm((prev) => applyFieldRules(prev, key, value))
  }, [])
  const onForm = useCallback((updater: (prev: QuoteFormState) => QuoteFormState) => {
    setForm(updater)
  }, [])
  const onIncludeLeads = useCallback((on: boolean) => {
    setForm((prev) => applyIncludeLeads(prev, on))
  }, [])
  const onTargeting = useCallback((axis: keyof Targeting, value: string) => {
    setForm((prev) => {
      const list = prev.targeting[axis]
      const nextList = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      return { ...prev, targeting: { ...prev.targeting, [axis]: nextList } }
    })
  }, [])
  const onAdjust = useCallback((key: string, value: string | number) => {
    setForm((prev) => {
      const nextAdj = { ...prev.adjust }
      const n = Math.round(Number(value) || 0)
      if (n === 0) delete nextAdj[key]
      else nextAdj[key] = n
      return { ...prev, adjust: nextAdj }
    })
  }, [])
  const onResetAdjust = useCallback(() => setForm((prev) => ({ ...prev, adjust: {} })), [])

  /** 저장 — 새 견적(create) 또는 새 버전(saveQuoteVersion). 변경 없으면 현재 저장본 반환 */
  const persist = useCallback(async (): Promise<Quote | null> => {
    if (savedQuote && !dirty) return savedQuote
    setSaving(true)
    setActionError(null)
    try {
      const saved = savedQuote
        ? await provider.saveQuoteVersion(savedQuote.id, input)
        : await provider.createQuote(input)
      setSavedQuote(saved)
      navigate(`/quotes/${saved.id}/edit`, { replace: true })
      return saved
    } catch (err) {
      setActionError(messageOf(err))
      return null
    } finally {
      setSaving(false)
    }
  }, [savedQuote, dirty, input, navigate])

  const handleFinalize = useCallback(async () => {
    setFinalizing(true)
    setActionError(null)
    try {
      const saved = await persist()
      if (!saved) return
      const finalized = await provider.finalizeQuote(saved.id)
      setSavedQuote(finalized)
      setStep(5)
    } catch (err) {
      setActionError(messageOf(err))
    } finally {
      setFinalizing(false)
    }
  }, [persist])

  const handleDownload = useCallback(async () => {
    if (!savedQuote) return
    setDownloadPending(true)
    setActionError(null)
    try {
      const { file_name, blob } = await provider.exportQuoteXlsx(savedQuote.id, lang)
      await saveQuoteFile(blob, file_name)
    } catch (err) {
      setActionError(messageOf(err))
    } finally {
      setDownloadPending(false)
    }
  }, [savedQuote, lang])

  // 구글 스프레드시트 생성 — Excel과 같은 xlsx를 서버가 Drive에 시트로 변환. mock 모드는 안내 문구(오류 슬롯)
  const handleCreateSheet = useCallback(async () => {
    if (!savedQuote) return
    setActionError(null)
    try {
      await gsheet.create(savedQuote.id, lang, t.gsheetMockNotice)
    } catch (err) {
      setActionError(messageOf(err))
    }
  }, [savedQuote, lang, gsheet, t])

  const handleCreateProject = useCallback(async () => {
    if (!savedQuote) return
    setCreating(true)
    setActionError(null)
    try {
      const project = await provider.createProjectFromQuote(savedQuote.id)
      setSavedQuote({ ...savedQuote, project_id: project.id })
      reloadSummaries()
      setProject(project.id)
      navigate('/onboarding')
    } catch (err) {
      setActionError(messageOf(err))
    } finally {
      setCreating(false)
    }
  }, [savedQuote, reloadSummaries, setProject, navigate])

  const linkedProjectName = useMemo(() => {
    if (!savedQuote?.project_id) return null
    return summaries.find((s) => s.id === savedQuote.project_id)?.name ?? null
  }, [savedQuote, summaries])

  if (loading) return <p className="p-6 text-sm text-ink-cap">불러오는 중…</p>
  if (loadError) return <p className="p-6 text-sm text-negative">{loadError}</p>

  const p = outputs.result
  const catalogLabel = (id: string) =>
    id === '_other' ? t.asideOtherOption : (OPT_CATALOG.find((o) => o.id === id)?.[lang].label ?? id)
  const pickedLines: [string, string, number][] = [
    ...amounts.picked.map((o) => [o.id, catalogLabel(o.id), o.amount] as [string, string, number]),
    ...(form.boothCount > 0 ? [['boothStd', `${t.boothStdTitle} × ${form.boothCount}`, amounts.boothStd] as [string, string, number]] : []),
    ...(form.boothPremiumCount > 0
      ? [['boothPremium', `${t.boothPremTitle} × ${form.boothPremiumCount}`, amounts.boothPremium] as [string, string, number]]
      : []),
  ]
  const summaryRows: [string, string, number][] = [
    ['s1', t.adjS1.replace(/^1\. /, ''), p.s1],
    ['s2', t.adjS2.replace(/^2\. /, ''), p.s2],
    ['s3', t.adjS3.replace(/^3\. /, ''), p.s3],
    ['s4', t.adjS4.replace(/^4\. /, ''), p.s4],
    ['s5', t.asidePco, p.s5],
    ['ot', t.adjOt, p.ot],
    ...(form.includeLeads ? [['lead', t.adjLead, p.leadPkg] as [string, string, number]] : []),
    ...(p.genManage > 0 ? [['gen', t.genTitle, p.genManage] as [string, string, number]] : []),
  ]

  return (
    <div className="p-4 md:p-6">
      {/* 머리 — 캡션 · 제목(확정이면 자물쇠 배지) · 견적서 언어 토글. 합계는 옆 요약이 맡고 좁은 화면에서만 머리에 둔다 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-caption">{t.editorCaption}</p>
          <h1 className="t-page-title mt-1">
            {savedQuote ? `${savedQuote.title} · v${savedQuote.version}` : t.editorNewTitle}
            {savedQuote?.is_final && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-positive-tint px-2.5 py-1 align-middle text-xs font-semibold text-positive">
                <svg aria-hidden viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" />
                </svg>
                {t.finalizedBadge}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <SegmentedToggle
            label={t.langGroup}
            value={lang}
            options={[
              { value: 'ko', label: '한국어' },
              { value: 'en', label: 'English' },
            ]}
            onChange={setLang}
          />
          <div className="text-right lg:hidden">
            <p className="t-caption">{t.asideTotal}</p>
            <p className="text-xl font-bold text-ink">{fmtMoney(p.pk, en)}</p>
          </div>
        </div>
      </div>

      {savedQuote?.superseded_by && (
        <p className="mt-3 rounded-md bg-accent-tint px-3 py-2 text-sm font-medium text-accent-deep">{t.supersededBanner}</p>
      )}

      {/* 단계 — 번호 원(지난 단계 = positive 틴트 · 지금 = ink · 다음 = track) + 지금 단계 accent 밑줄 */}
      <nav aria-label={t.stepsNav} className="mt-5 flex overflow-x-auto border-b border-border">
        {t.steps.map((label, i) => {
          const n = i + 1
          const current = step === n
          const before = n < step
          return (
            <button
              key={n}
              type="button"
              aria-current={current ? 'step' : undefined}
              onClick={() => setStep(n)}
              className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 pb-3 pt-2.5 text-sm ${
                current
                  ? 'border-accent font-semibold text-ink'
                  : before
                    ? 'border-transparent font-medium text-brown hover:text-ink'
                    : 'border-transparent font-medium text-ink-cap hover:text-ink'
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  current ? 'bg-ink text-white' : before ? 'bg-positive-tint text-positive' : 'bg-track text-ink-cap'
                }`}
              >
                {n}
              </span>
              {label}
            </button>
          )
        })}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {step === 1 && (
            <StepScale
              form={form}
              outputs={outputs}
              t={t}
              en={en}
              onField={onField}
              onIncludeLeads={onIncludeLeads}
              onTargeting={onTargeting}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepVenue form={form} t={t} en={en} onForm={onForm} onField={onField} onPrev={() => setStep(1)} onNext={() => setStep(3)} />
          )}
          {step === 3 && (
            <StepOptions
              form={form}
              amounts={amounts}
              t={t}
              en={en}
              lang={lang}
              onForm={onForm}
              onField={onField}
              onPrev={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <StepReview
              form={form}
              outputs={outputs}
              baseOutputs={baseOutputs}
              savedQuote={savedQuote}
              saving={saving}
              finalizing={finalizing}
              downloadPending={downloadPending}
              sheetPending={gsheet.pending}
              sheetResult={gsheet.resultFor(savedQuote?.id)}
              error={actionError}
              t={t}
              en={en}
              onField={onField}
              onAdjust={onAdjust}
              onResetAdjust={onResetAdjust}
              onPrev={() => setStep(3)}
              onSave={() => void persist()}
              onFinalize={() => void handleFinalize()}
              onDownload={() => void handleDownload()}
              onCreateSheet={() => void handleCreateSheet()}
            />
          )}
          {step === 5 && (
            <StepHandoff
              savedQuote={savedQuote}
              linkedProjectName={linkedProjectName}
              creating={creating}
              error={actionError}
              t={t}
              onPrev={() => setStep(4)}
              onCreateProject={() => void handleCreateProject()}
              onGoProject={() => {
                if (savedQuote?.project_id) {
                  setProject(savedQuote.project_id)
                  navigate('/home')
                }
              }}
            />
          )}
        </div>

        {/* 옆 요약 — 합계(30) · 인원 · 옵션으로 +n · 8행 · 고른 옵션 · PCO 안내. 단계와 무관하게 같은 자리 */}
        <aside className="hidden lg:block" aria-label={t.asideTotal}>
          <div className="ui-card sticky top-6 flex flex-col gap-3.5 p-5" data-testid="quote-editor-summary">
            <div className="flex flex-col gap-0.5">
              <span className="t-caption">{t.asideTotal}</span>
              <span className="text-[30px] font-bold leading-9 text-ink" data-testid="editor-total">
                {fmtMoney(p.pk, en)}
              </span>
              <span className="t-caption text-ink-sub">
                {t.asideHeadcount(form.target, form.includeLeads ? form.guarantee : null)}
                {p.ot > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold text-ink" data-testid="editor-options-delta">
                      {t.asideOptionsDelta(fmtMoney(p.pk - amounts.pkWithoutOptions, en))}
                    </span>
                  </>
                )}
              </span>
            </div>
            <dl className="flex flex-col border-t border-border pt-2.5 text-sm">
              {summaryRows.map(([key, label, value]) => (
                <div key={key} className="flex justify-between gap-3 py-1">
                  <dt className="text-brown">{label}</dt>
                  <dd
                    className={`ui-num ${value === 0 ? 'text-ink-cap' : 'text-ink'} ${
                      key === 'ot' && step === 3 ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {fmtMoney(value, en)}
                  </dd>
                </div>
              ))}
            </dl>
            {pickedLines.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-[10px] bg-canvas px-3.5 py-3" data-testid="editor-picked-options">
                <span className="t-caption font-semibold text-brown">{t.asidePicked}</span>
                {pickedLines.map(([key, label, amount]) => (
                  <div key={key} className="flex justify-between gap-3 text-[13px]">
                    <span className="min-w-0 text-ink">{label}</span>
                    <span className="ui-num shrink-0 text-ink">{fmtMoney(amount, en)}</span>
                  </div>
                ))}
              </div>
            )}
            {p.ot > 0 && (
              <p className="t-caption leading-[17px]" data-testid="editor-pco-note">
                {t.asidePcoNote(fmtMoney(amounts.pcoWithoutOptions, en), fmtMoney(p.s5, en))}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function QuoteEditorPage() {
  const { quoteId } = useParams<{ quoteId: string }>()
  const location = useLocation()
  const initialStep = Number(new URLSearchParams(location.search).get('step')) || 1
  // key 없음 — 저장 시 자체 navigate(/quotes/{id}/edit)로 quoteId가 바뀌어도 리마운트하지 않는다
  // (스텝·저장 상태 유지). 다른 견적으로의 전환은 위 useEffect가 quoteId 기준으로 재로드한다.
  return <QuoteGate>{() => <EditorBody quoteId={quoteId ?? null} initialStep={initialStep} />}</QuoteGate>
}
