// 견적서 가져오기 위저드 (v2.4 §10.1 화면 D · §22.4 분배) — S-2 내 버튼으로 진입, admin·sales 전용.
// ① 업로드 → ② 인식 결과 확인(확인 큐) → ③ 분배 선택 → 완료.
// R-Q1: quotes는 ②의 "확정"(confirmQuoteImport)을 거쳐야만 생긴다 — 이 화면에 다른 생성 경로는 없다.
// 금액은 내부 화면인 여기까지만 — 발주처·랜딩·운영계획서로 나가는 경로는 §22 R-Q3 가드가 막는다.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InfoTip from '../components/internal/InfoTip'
import PageHeader from '../components/internal/PageHeader'
import { LevelBadge } from '../components/internal/StatusBadge'
import QuoteGate from '../components/quote/QuoteGate'
import { fmtWon } from '../components/quote/quoteFormState'
import { useProject } from '../context/ProjectContext'
import { IMPORT_STEP_HELP } from '../lib/helpTexts'
import { QUOTE_IMPORT_BUCKETS, bucketLabel } from '../modules/quote/import/buckets'
import { getDataProvider } from '../providers'
import type { Quote, QuoteImport } from '../types/entities'
import type { SectionMapping } from '../modules/quote/import/types'
import type { QuoteImportDistributeResult } from '../types/views'

const provider = getDataProvider()

const STEPS = ['업로드', '인식 결과 확인', '분배 선택'] as const
const FORMAT_GUIDE = [
  { code: 'A형', desc: '단가·수량·일수 열이 있는 세부 산출내역서' },
  { code: 'B형', desc: 'ITEM·금액 단식 + 섹션별 total 행' },
  { code: 'C형', desc: 'UNIT PRICE·QTY·AMOUNT(·SELECT) 패키지 견적서' },
]

const HEADER_FIELDS: { key: 'event_name' | 'client' | 'date_range' | 'venue' | 'quoted_at' | 'manager'; label: string }[] = [
  { key: 'event_name', label: '행사명' },
  { key: 'client', label: '고객명' },
  { key: 'date_range', label: '일시' },
  { key: 'venue', label: '장소' },
  { key: 'quoted_at', label: '견적일' },
  { key: 'manager', label: '담당자' },
]

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
}

function StepTabs({ step }: { step: number }) {
  return (
    <ol className="mt-4 flex flex-wrap gap-2" aria-label="진행 단계">
      {STEPS.map((label, i) => {
        const n = i + 1
        const state = step === n ? 'current' : step > n ? 'done' : 'todo'
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              state === 'current'
                ? 'bg-accent text-white'
                : state === 'done'
                  ? 'bg-positive-tint text-positive'
                  : 'bg-track text-ink-cap'
            }`}
          >
            {n}. {label}
          </li>
        )
      })}
    </ol>
  )
}

function Kpi({ caption, value, tone }: { caption: string; value: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="ui-card p-4">
      <p className="t-caption">{caption}</p>
      <p className={`kpi-num mt-1 ${tone === 'warn' ? 'text-accent-deep' : tone === 'ok' ? 'text-positive' : ''}`}>{value}</p>
    </div>
  )
}

function WizardBody() {
  const navigate = useNavigate()
  const { reloadSummaries, setProject } = useProject()

  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [imp, setImp] = useState<QuoteImport | null>(null)
  const [mapping, setMapping] = useState<SectionMapping[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [targets, setTargets] = useState({ project_prefill: true, settlement_base: false, board_seed: false })
  const [result, setResult] = useState<QuoteImportDistributeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = imp?.parsed ?? null
  const sectionAmount = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of parsed?.sections ?? []) {
      map.set(s.name, s.subtotal ?? s.items.reduce((sum, item) => sum + item.amount, 0))
    }
    return map
  }, [parsed])
  const failedChecks = useMemo(() => (parsed?.checks ?? []).filter((c) => !c.ok), [parsed])
  const lowCount = useMemo(() => mapping.filter((m) => m.confidence === 'low').length, [mapping])
  const itemCount = useMemo(
    () => (parsed?.sections ?? []).reduce((sum, s) => sum + s.items.length, 0),
    [parsed],
  )

  const handleUpload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const next = await provider.importQuoteFile(file.name, buffer)
      setImp(next)
      setMapping(next.mapping)
      setStep(2)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    if (!imp) return
    setBusy(true)
    setError(null)
    try {
      const created = await provider.confirmQuoteImport(imp.id, { mapping })
      setQuote(created)
      setStep(3)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDistribute = async () => {
    if (!imp || !quote) return
    setBusy(true)
    setError(null)
    try {
      // 정산 기준은 확정 견적만 가능(§19.2) — 사용자가 켰으면 여기서 먼저 확정한다
      if (targets.settlement_base && !quote.is_final) {
        setQuote(await provider.finalizeQuote(quote.id))
      }
      const distributed = await provider.distributeQuoteImport(imp.id, {
        project_prefill: targets.project_prefill || targets.settlement_base || targets.board_seed,
        settlement_base: targets.settlement_base,
        board_seed: targets.board_seed,
      })
      setResult(distributed)
      reloadSummaries()
      setStep(4)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        caption="준비 · 견적"
        title="견적서 가져오기"
        action={
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/quotes')}>
            견적 목록
          </button>
        }
      />
      {step <= 3 && <StepTabs step={step} />}

      {error && (
        <p role="alert" className="rounded-md bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {/* ── ① 업로드 ── */}
      {step === 1 && (
        <section className="ui-card max-w-2xl p-5">
          <p className="t-card-title inline-flex items-center gap-1.5">
            엑셀 견적서 올리기
            <InfoTip text={IMPORT_STEP_HELP.upload} />
          </p>
          <p className="mt-1 text-sm text-ink-sub">
            파일을 읽어 서식·섹션·항목·검산 결과만 보여 줍니다. 이 단계에서는 아무것도 저장되지 않습니다.
          </p>
          <label className="mt-4 block">
            <span className="t-caption">견적서 파일 (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="견적서 파일"
              className="ui-input mt-1 block w-full"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <dl className="mt-4 space-y-1 rounded-md bg-track px-3 py-2 text-sm">
            <dt className="t-caption">지원 서식</dt>
            {FORMAT_GUIDE.map((f) => (
              <dd key={f.code} className="text-ink-sub">
                <span className="font-semibold text-ink">{f.code}</span> — {f.desc}
              </dd>
            ))}
          </dl>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-accent" disabled={!file || busy} onClick={() => void handleUpload()}>
              {busy ? '인식 중…' : '인식 시작'}
            </button>
          </div>
        </section>
      )}

      {/* ── ② 인식 결과 확인 ── */}
      {step === 2 && parsed && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi caption="섹션" value={`${parsed.sections.length}개`} />
            <Kpi caption="항목" value={`${itemCount}건`} />
            <Kpi
              caption="검산"
              value={failedChecks.length === 0 ? '전부 일치' : `불일치 ${failedChecks.length}건`}
              tone={failedChecks.length === 0 ? 'ok' : 'warn'}
            />
            <Kpi caption="확인 필요 (매핑)" value={`${lowCount}건`} tone={lowCount > 0 ? 'warn' : 'ok'} />
          </div>

          <section className="ui-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-card-title inline-flex items-center gap-1.5">
                인식된 행사 정보
                <InfoTip text={IMPORT_STEP_HELP.confirm} />
              </p>
              <span className="rounded-full bg-steel-tint px-2.5 py-0.5 text-xs font-medium text-steel">
                {parsed.format}형 · {imp?.file_name}
              </span>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {HEADER_FIELDS.map((f) => {
                const value = parsed.header[f.key]
                return (
                  <div key={f.key} className="flex gap-2 border-b border-border py-1.5">
                    <dt className="w-20 shrink-0 text-ink-cap">{f.label}</dt>
                    <dd className={value ? 'text-ink' : 'font-medium text-accent-deep'}>
                      {value || '인식 실패 — 확인 필요'}
                    </dd>
                  </div>
                )
              })}
              <div className="flex gap-2 border-b border-border py-1.5">
                <dt className="w-20 shrink-0 text-ink-cap">총액</dt>
                <dd className="font-semibold text-ink">
                  {parsed.header.total_amount !== undefined
                    ? `${fmtWon(parsed.header.total_amount, false)} (${
                        parsed.header.vat_mode === 'included'
                          ? '부가세 포함'
                          : parsed.header.vat_mode === 'excluded'
                            ? '부가세 별도'
                            : '부가세 표기 미확인'
                      })`
                    : '인식 실패 — 확인 필요'}
                </dd>
              </div>
            </dl>
          </section>

          {(failedChecks.length > 0 || parsed.warnings.length > 0) && (
            <section className="ui-card p-5">
              <p className="t-card-title">확인할 점</p>
              <p className="mt-1 text-sm text-ink-sub">불일치가 있어도 진행할 수 있습니다 — 등록 후 견적 화면에서 조정하세요.</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {failedChecks.map((c) => (
                  <li key={c.name} className="rounded-md bg-accent-tint px-3 py-2 text-accent-deep">
                    <span className="font-semibold">{c.name}</span> — 문서 {fmtWon(c.expected, false)} / 계산{' '}
                    {fmtWon(c.actual, false)}
                  </li>
                ))}
                {parsed.warnings.map((w) => (
                  <li key={w} className="px-3 py-1 text-ink-sub">
                    · {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="ui-card p-5">
            <p className="t-card-title">섹션 → 버킷 매핑</p>
            <p className="mt-1 text-sm text-ink-sub">
              애매한 섹션만 표시했습니다. 나머지는 그대로 두면 됩니다.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="ui-th">섹션</th>
                    <th className="ui-th text-right">금액</th>
                    <th className="ui-th">버킷</th>
                    <th className="ui-th">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((row, i) => {
                    const low = row.confidence === 'low'
                    return (
                      <tr key={row.section} className={`border-b border-border ${low ? 'bg-accent-tint' : ''}`}>
                        <td className="px-3 py-2.5 text-ink">{row.section}</td>
                        <td className="px-3 py-2.5 text-right text-ink-sub">
                          {fmtWon(sectionAmount.get(row.section) ?? 0, false)}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            className="ui-input ui-select"
                            aria-label={`${row.section} 버킷`}
                            value={row.bucket}
                            onChange={(e) =>
                              setMapping((prev) =>
                                prev.map((m, j) => (j === i ? { ...m, bucket: e.target.value } : m)),
                              )
                            }
                          >
                            {QUOTE_IMPORT_BUCKETS.map((b) => (
                              <option key={b.code} value={b.code}>
                                {b.label}
                              </option>
                            ))}
                            {QUOTE_IMPORT_BUCKETS.every((b) => b.code !== row.bucket) && (
                              <option value={row.bucket}>{bucketLabel(row.bucket)}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          {low ? (
                            <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-accent-deep">
                              확인 필요
                            </span>
                          ) : (
                            <span className="text-xs text-ink-cap">자동 인식</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} disabled={busy}>
                이전
              </button>
              <button type="button" className="btn btn-accent" onClick={() => void handleConfirm()} disabled={busy}>
                {busy ? '확정 중…' : '이 매핑으로 확정'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── ③ 분배 선택 ── */}
      {step === 3 && quote && (
        <section className="ui-card max-w-2xl p-5">
          <p className="t-card-title inline-flex items-center gap-1.5">
            어디까지 반영할까요?
            <InfoTip text={IMPORT_STEP_HELP.distribute} />
          </p>
          <p className="mt-1 text-sm text-ink-sub">
            견적은 이미 등록되었습니다 — 나머지는 선택입니다.
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3 rounded-md bg-track px-3 py-2.5">
              <LevelBadge level="positive" label="완료" className="mt-0.5" />
              <span>
                <span className="font-semibold text-ink">견적 등록 (필수)</span>
                <span className="block text-sm text-ink-sub">
                  {quote.title} · v{quote.version} — 목록에 '임포트' 배지로 표시됩니다.
                </span>
              </span>
            </div>
            <label className="ui-check-row px-3">
              <input
                type="checkbox"
                className="ui-check"
                checked={targets.project_prefill || targets.settlement_base || targets.board_seed}
                disabled={targets.settlement_base || targets.board_seed}
                onChange={(e) => setTargets((t) => ({ ...t, project_prefill: e.target.checked }))}
              />
              <span>
                <span className="font-semibold text-ink">행사 만들기 프리필</span>
                <span className="block text-sm text-ink-sub">
                  인식된 행사명·일시·장소로 새 행사를 만들고 견적과 상호 링크합니다(§16 매핑).
                </span>
              </span>
            </label>
            <label className="ui-check-row px-3">
              <input
                type="checkbox"
                className="ui-check"
                checked={targets.settlement_base}
                onChange={(e) => setTargets((t) => ({ ...t, settlement_base: e.target.checked }))}
              />
              <span>
                <span className="font-semibold text-ink">정산보드 기준 견적 — 확정하고 기준으로 설정</span>
                <span className="block text-sm text-ink-sub">
                  견적이 확정(잠금)되고 버킷 스냅숏이 정산보드에 만들어집니다. 행사 프리필이 함께 켜집니다.
                </span>
              </span>
            </label>
            <label className="ui-check-row px-3">
              <input
                type="checkbox"
                className="ui-check"
                checked={targets.board_seed}
                onChange={(e) => setTargets((t) => ({ ...t, board_seed: e.target.checked }))}
              />
              <span>
                <span className="font-semibold text-ink">보드 항목 시드</span>
                <span className="block text-sm text-ink-sub">금액 제외 — 품목·규격·수량만 디자인·운영 보드에 만듭니다.</span>
              </span>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/quotes')} disabled={busy}>
              나중에 하기
            </button>
            <button type="button" className="btn btn-accent" onClick={() => void handleDistribute()} disabled={busy}>
              {busy ? '반영 중…' : '분배 실행'}
            </button>
          </div>
        </section>
      )}

      {/* ── 완료 ── */}
      {step === 4 && quote && result && (
        <section className="ui-card max-w-2xl p-6">
          <p className="t-card-title">가져오기 완료</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink">
            <li>· 견적 등록: {quote.title} · v{quote.version} {quote.is_final ? '(확정)' : '(작성 중)'}</li>
            <li>· 행사 만들기: {result.project_id ? '새 행사 생성 · 견적과 링크됨' : '하지 않음'}</li>
            <li>· 정산 기준: {result.settlement_created ? '버킷 스냅숏 생성됨' : '하지 않음'}</li>
            <li>· 보드 시드: {result.deliverables_seeded > 0 ? `${result.deliverables_seeded}건` : '하지 않음'}</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-accent" onClick={() => navigate('/quotes')}>
              견적 목록으로
            </button>
            {result.project_id && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setProject(result.project_id!)
                  navigate('/settings')
                }}
              >
                행사 설정으로 이동
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default function QuoteImportWizardPage() {
  return <QuoteGate>{() => <WizardBody />}</QuoteGate>
}
