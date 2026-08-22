// S-2 견적 에디터 — 5스텝(①규모·유형 ②베뉴 ③옵션 ④확인·확정 ⑤행사 만들기).
// RQC의 스텝 상태·계산 호출을 components/quote/*로 분해 이식(§17.2) — 스타일은 tokens.css,
// 한/영 토글 유지·다크 토글 제거. 저장은 항상 스냅샷(새 견적/새 버전) — §8 /quotes 계약.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import QuoteGate from '../components/quote/QuoteGate'
import StepHandoff from '../components/quote/StepHandoff'
import StepOptions from '../components/quote/StepOptions'
import StepReview from '../components/quote/StepReview'
import StepScale from '../components/quote/StepScale'
import StepVenue from '../components/quote/StepVenue'
import {
  applyFieldRules,
  applyIncludeLeads,
  emptyForm,
  fmtMoney,
  formFromQuote,
  formToInput,
  type QuoteFormState,
} from '../components/quote/quoteFormState'
import QUOTE_STR, { type QuoteLang } from '../components/quote/quoteStrings'
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
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!quoteId) return
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
  }, [quoteId])

  const input = useMemo(() => formToInput(form), [form])
  const outputs = useMemo(() => computeQuoteOutputs(input), [input])
  const baseOutputs = useMemo(() => computeQuoteOutputs({ ...input, adjustments: [] }), [input])
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

  return (
    <div className="p-4 md:p-6">
      {/* 헤더 — 브랜드 태그 · 한/영 토글 · 러닝 총액 */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="t-caption">{t.listCaption}</p>
          <h1 className="t-page-title mt-1">
            {savedQuote ? `${savedQuote.title} · v${savedQuote.version}` : t.listTitle}
            {savedQuote?.is_final && (
              <span className="ml-2 align-middle rounded-full bg-positive-tint px-2.5 py-1 text-xs font-semibold text-positive">
                🔒 {t.finalizedBadge}
              </span>
            )}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex overflow-hidden rounded-full border border-border" role="group" aria-label="언어">
            {(['ko', 'en'] as QuoteLang[]).map((lc) => (
              <button
                key={lc}
                type="button"
                onClick={() => setLang(lc)}
                className={`px-3 py-1.5 text-xs font-bold ${lang === lc ? 'bg-accent text-white' : 'bg-card text-ink-sub'}`}
              >
                {lc.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="text-right">
            <p className="t-caption text-accent-deep">{t.estTotal}</p>
            <p className="text-xl font-bold text-ink">{fmtMoney(p.pk, en)}</p>
          </div>
        </div>
      </div>

      {savedQuote?.superseded_by && (
        <p className="mt-3 rounded-md bg-accent-tint px-3 py-2 text-sm font-medium text-accent-deep">{t.supersededBanner}</p>
      )}

      {/* 스텝 탭 */}
      <div className="mt-4 flex gap-0 overflow-x-auto border-b border-border" role="tablist">
        {t.steps.map((label, i) => {
          const n = i + 1
          const active = step === n
          return (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStep(n)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${
                active ? 'border-accent font-semibold text-accent-deep' : 'border-transparent text-ink-sub hover:text-ink'
              }`}
            >
              {n}. {label}
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
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
              outputs={outputs}
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
                  navigate('/')
                }
              }}
            />
          )}
        </div>

        {/* 사이드 요약 (RQC 우측 사이드바 이식 — 카드형) */}
        <aside className="hidden lg:block">
          <div className="ui-card sticky top-6 p-4">
            <p className="t-caption">ESTIMATE</p>
            <p className="t-caption mt-3 text-accent-deep">{t.estTotal}</p>
            <p className="kpi-num">{fmtMoney(p.pk, en)}</p>
            <p className="t-caption">{t.vatExcl}</p>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              {[
                ['s1', t.adjS1.replace(/^1\. /, ''), p.s1],
                ['s2', t.adjS2.replace(/^2\. /, ''), p.s2],
                ['s3', t.adjS3.replace(/^3\. /, ''), p.s3],
                ['s4', t.adjS4.replace(/^4\. /, ''), p.s4],
                ['s5', 'PCO (25%)', p.s5],
                ['ot', t.adjOt, p.ot],
              ].map(([key, label, value]) => (
                <div key={key as string} className="flex justify-between">
                  <dt className="text-ink-sub">{label}</dt>
                  <dd className={`font-semibold ${value === 0 ? 'text-ink-cap' : 'text-ink'}`}>{fmtMoney(value as number, en)}</dd>
                </div>
              ))}
              {form.includeLeads && (
                <div className="flex justify-between">
                  <dt className="text-ink-sub">{t.adjLead}</dt>
                  <dd className="font-semibold text-positive">{fmtMoney(p.leadPkg, en)}</dd>
                </div>
              )}
              {p.genManage > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-sub">{t.genTitle}</dt>
                  <dd className="font-semibold text-accent-deep">{fmtMoney(p.genManage, en)}</dd>
                </div>
              )}
            </dl>
            <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-sub">{form.includeLeads ? '참석 / 모객' : '참석'}</dt>
                <dd className="font-semibold text-ink">
                  {form.target}
                  {form.includeLeads ? ` / ${form.guarantee}` : ''}
                  {t.pax}
                </dd>
              </div>
            </dl>
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
  return (
    <QuoteGate>
      {() => <EditorBody key={quoteId ?? 'new'} quoteId={quoteId ?? null} initialStep={initialStep} />}
    </QuoteGate>
  )
}
