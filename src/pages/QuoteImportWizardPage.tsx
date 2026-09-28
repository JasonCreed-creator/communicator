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
import { useAsync } from '../hooks/useAsync'
import { getDriveGateway } from '../lib/drive/driveGateway'
import { IMPORT_STEP_HELP } from '../lib/helpTexts'
import { quoteAttachmentLabel } from '../lib/quoteAttachment'
import { QUOTE_IMPORT_BUCKETS, bucketLabel } from '../modules/quote/import/buckets'
import { quoteImportFormatLabel } from '../modules/quote/import/types'
import { aiMediaTypeFor } from '../lib/vendorQuoteAi'
import { getDataProvider } from '../providers'
import type { Quote, QuoteImport } from '../types/entities'
import type { SectionMapping } from '../modules/quote/import/types'
import type { QuoteImportDistributeResult } from '../types/views'

const provider = getDataProvider()

const STEPS = ['업로드', '인식 결과 확인', '분배 선택'] as const
const FORMAT_GUIDE = [
  { code: '리멤버 견적서', desc: '이 시스템(견적 컨피규레이터)이 내보낸 견적서 — 섹션·총액·모객(RSVP/쇼업)까지 그대로 읽힘' },
  { code: 'A형', desc: '단가·수량·일수 열이 있는 세부 산출내역서' },
  { code: 'B형', desc: 'ITEM·금액 단식 + 섹션별 total 행' },
  { code: 'C형', desc: 'UNIT PRICE·QTY·AMOUNT(·SELECT) 패키지 견적서 — 국문 선택(O/X) 열 포함' },
  { code: 'P형(예산)', desc: '주최형 워킹버짓 — 지출 표(구분 A~J · 기준안 열)를 섹션으로 읽고, 수입 표(파트너 계약 매출)는 참고로 기록' },
  { code: 'PDF·사진', desc: 'AI(Claude)가 옮겨 적음 — 국문·영문 · 실서버에서만 · 한 사람 하루 횟수 제한' },
]

/** Phase 6.7 — 온보딩 견적서 첨부를 여기서 바로 읽는 다리(설계서 §22.6). 데모(mock)는 Drive가 없어 파일을 가져오지 못한다 — 사실만 알린다 */
export const QUOTE_IMPORT_ATTACHMENT_MOCK_MESSAGE =
  '데모에서는 첨부 견적서를 저장한 곳(Drive)이 없어 읽어 올 수 없습니다 — 실서버에서는 행사 폴더 01_견적의 파일이 그대로 들어옵니다.'
export const QUOTE_IMPORT_ATTACHMENT_LINK_MESSAGE =
  '링크로 붙인 견적서는 여기서 바로 읽을 수 없습니다 — 링크를 열어 파일(.xlsx·.pdf·사진)로 내려받은 뒤 올려 주세요.'
const QUOTE_IMPORT_ATTACHMENT_GONE_MESSAGE = '첨부한 견적서 파일을 찾지 못했습니다 — 행사 설정 ①에서 다시 붙이거나 파일을 직접 올려 주세요.'

/** 위저드 ①이 받는 파일 — 엑셀(파서) + PDF·사진(AI, v2.18 §22.5) */
const ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

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
                ? 'bg-accent-deep text-white'
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

/** ③ 행사 선택 — v16 §16.4: 기존 행사에 연결(기본 = 지금 보는 행사) · 새 행사 만들기(프리필) · 행사 없이 견적만 */
type ProjectMode = 'existing' | 'new' | 'none'

function WizardBody() {
  const navigate = useNavigate()
  const { projectId, summaries, reloadSummaries, setProject } = useProject()

  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  // Phase 6.7 — 온보딩 견적서 첨부(projects.quote_attachment)를 ①에서 바로 읽는다 · 'attachment' = 첨부에서 불러온 파일
  const [fileSource, setFileSource] = useState<'picked' | 'attachment' | null>(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)
  const project = useAsync(() => (projectId ? provider.getProject(projectId) : Promise.resolve(null)), [projectId])
  const attachment = project.data?.quote_attachment ?? null
  const [imp, setImp] = useState<QuoteImport | null>(null)
  const [mapping, setMapping] = useState<SectionMapping[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [projectMode, setProjectMode] = useState<ProjectMode | null>(null)
  const [linkProjectId, setLinkProjectId] = useState<string>('')
  // Phase 6.12(2026-09-28 실사용 "견적을 올렸는데 정산보드에 반영 안 됨") — 정산 기준은 행사가 있고 그 행사에 아직 정산보드가 없으면
  // **기본 켜짐**(사람이 끌 수 있다). 보드가 있는 행사에는 켤 수 없다 — 기준을 바꾸는 길은 정산보드의 '기준 견적 갱신'이고, 여기서 켜면
  // 확정만 된 채 보드 생성이 409로 끊겼다.
  const [settlementChoice, setSettlementChoice] = useState<boolean | null>(null)
  const [boardSeed, setBoardSeed] = useState(false)
  const [result, setResult] = useState<QuoteImportDistributeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 운영 실측(2026-09-27): 프리필이 강제로 켜져 이미 만든 행사 옆에 행사가 하나 더 생겼다 — 기본은 '지금 보는 행사에 연결'
  const activeProjects = useMemo(() => summaries.filter((s) => s.status === 'active'), [summaries])
  const mode: ProjectMode = projectMode ?? (activeProjects.length > 0 ? 'existing' : 'new')
  const linkTarget = activeProjects.some((p) => p.id === linkProjectId)
    ? linkProjectId
    : activeProjects.some((p) => p.id === projectId)
      ? projectId
      : (activeProjects[0]?.id ?? '')
  const linkedName = (id: string | null) => (id ? summaries.find((s) => s.id === id)?.name ?? '연결됨' : '')
  // 고른 행사에 정산보드가 이미 있는가(없으면 정산 기준 기본 켜짐 · 있으면 켤 수 없음)
  const targetBoard = useAsync(
    async () => (mode === 'existing' && linkTarget ? !!(await provider.getSettlementBoard(linkTarget).catch(() => null)) : false),
    [mode, linkTarget],
  )
  const targetHasBoard = targetBoard.data === true
  const settlementLocked = mode === 'none' || targetHasBoard || (mode === 'existing' && targetBoard.loading)
  const settlementBase = settlementLocked ? false : (settlementChoice ?? true)

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

  const loadAttachment = async () => {
    if (!attachment || !projectId) return
    const drive = getDriveGateway()
    if (drive.mode !== 'server') {
      setError(QUOTE_IMPORT_ATTACHMENT_MOCK_MESSAGE)
      return
    }
    setLoadingAttachment(true)
    setError(null)
    try {
      const r = await drive.client.projectAttachmentFile(projectId)
      if (!r.file) {
        setError(r.kind === 'link' ? QUOTE_IMPORT_ATTACHMENT_LINK_MESSAGE : QUOTE_IMPORT_ATTACHMENT_GONE_MESSAGE)
        return
      }
      setFile(r.file)
      setFileSource('attachment')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoadingAttachment(false)
    }
  }

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
    if ((settlementBase || boardSeed) && mode === 'none') {
      setError('정산 기준·보드 시드는 행사가 있어야 합니다 — 기존 행사를 고르거나 새 행사를 만드세요.')
      return
    }
    if (mode === 'existing' && !linkTarget) {
      setError('연결할 진행 중 행사가 없습니다 — 새 행사 만들기를 고르세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // 정산 기준은 확정 견적만 가능(§19.2) — 사용자가 켰으면 여기서 먼저 확정한다
      if (settlementBase && !quote.is_final) {
        setQuote(await provider.finalizeQuote(quote.id))
      }
      const distributed = await provider.distributeQuoteImport(imp.id, {
        project_prefill: mode === 'new',
        link_project_id: mode === 'existing' ? linkTarget : undefined,
        settlement_base: settlementBase,
        board_seed: boardSeed,
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
            견적서 올리기
            <InfoTip text={IMPORT_STEP_HELP.upload} />
          </p>
          <p className="mt-1 text-sm text-ink-sub">
            엑셀은 파서가, PDF·사진은 AI가 읽어 서식·섹션·항목·검산 결과만 보여 줍니다. 이 단계에서는 아무것도 저장되지 않습니다.
          </p>
          {attachment && (
            <div className="mt-4 rounded-md border border-border bg-canvas px-3 py-3" data-testid="import-attachment-card">
              <p className="text-sm font-semibold text-ink">온보딩에서 첨부한 견적서</p>
              <p className="mt-0.5 text-sm text-ink-sub">
                {quoteAttachmentLabel(attachment)}
                {attachment.kind === 'drive' ? ' · 행사 폴더 01_견적' : ' · 링크'}
              </p>
              {attachment.kind === 'drive' ? (
                file && fileSource === 'attachment' ? (
                  <p className="mt-2 text-sm text-positive" data-testid="import-attachment-loaded">
                    불러온 파일: <span className="font-semibold">{file.name}</span> — 아래 버튼으로 읽기를 시작하세요.{' '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setFile(null)
                        setFileSource(null)
                      }}
                    >
                      다른 파일 고르기
                    </button>
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm mt-2"
                    disabled={loadingAttachment || busy}
                    onClick={() => void loadAttachment()}
                  >
                    {loadingAttachment ? '불러오는 중…' : '이 파일로 읽기'}
                  </button>
                )
              ) : (
                <p className="mt-2 text-sm text-ink-sub">
                  {QUOTE_IMPORT_ATTACHMENT_LINK_MESSAGE}{' '}
                  <a href={attachment.url} target="_blank" rel="noreferrer" className="underline">
                    링크 열기
                  </a>
                </p>
              )}
            </div>
          )}
          <label className="mt-4 block">
            <span className="t-caption">{attachment ? '또는 견적서 파일 올리기 (.xlsx · .pdf · 사진)' : '견적서 파일 (.xlsx · .pdf · 사진)'}</span>
            <input
              type="file"
              accept={ACCEPT}
              aria-label="견적서 파일"
              className="ui-input mt-1 block w-full"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setFileSource(e.target.files?.[0] ? 'picked' : null)
              }}
            />
          </label>
          {file && aiMediaTypeFor(file.name) && (
            <p className="mt-2 rounded-md bg-accent-tint px-3 py-2 text-sm text-accent-deep" data-testid="import-ai-notice">
              PDF·사진은 AI(Claude)가 표를 옮겨 적습니다 — 국문·영문 모두 · 한 사람이 하루에 쓸 수 있는 횟수가 정해져 있고, 읽은 결과는 확인 화면에서
              원본과 대조한 뒤 확정합니다. 사람 이름은 읽지 않습니다.
            </p>
          )}
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
              {busy ? (file && aiMediaTypeFor(file.name) ? 'AI가 읽는 중…' : '인식 중…') : file && aiMediaTypeFor(file.name) ? 'AI로 읽기' : '인식 시작'}
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
                {quoteImportFormatLabel(parsed.format)} · {imp?.file_name}
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

          {/* v2.22.1 P형 — 예산 워크북의 수입 표. 견적 금액에는 넣지 않는다(주최형 정산 참고) */}
          {parsed.kind === 'budget' && parsed.revenue && parsed.revenue.length > 0 && (
            <section className="ui-card p-5" data-testid="import-revenue">
              <p className="t-card-title">수입 표 (파트너 계약 매출)</p>
              <p className="mt-1 text-sm text-ink-sub">
                예산 워크북의 수입 표입니다 — 견적 금액에는 넣지 않고 기록만 합니다(주최형 정산에서 수입 − 지출을 볼 때 참고).
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {parsed.revenue.map((r, i) => (
                  <li key={`${r.title}-${i}`} className="flex justify-between gap-3 border-b border-border py-1">
                    <span className="text-ink">{r.title}</span>
                    <span className="tabular-nums text-ink-sub">{fmtWon(r.amount, false)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right text-sm font-semibold text-ink">
                합계 {fmtWon(parsed.revenue.reduce((s, r) => s + r.amount, 0), false)}
              </p>
            </section>
          )}

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
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-sub">
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
                            <span className="whitespace-nowrap rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-accent-deep">
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
            {/* v16 §16.4 — 행사 선택은 라디오 한 묶음: 기존 행사(기본) · 새 행사 · 없음. 옛 '프리필 강제'는 퇴역 */}
            <fieldset className="rounded-md border border-border px-3 py-2.5" data-testid="import-project-mode">
              <legend className="t-caption px-1">행사</legend>
              <label className="ui-check-row">
                <input
                  type="radio"
                  name="import-project-mode"
                  className="ui-check"
                  checked={mode === 'existing'}
                  disabled={activeProjects.length === 0}
                  onChange={() => setProjectMode('existing')}
                />
                <span>
                  <span className="font-semibold text-ink">기존 행사에 연결</span>
                  <span className="block text-sm text-ink-sub">
                    {activeProjects.length > 0
                      ? '이미 만든 행사에 이 견적을 붙입니다 — 지금 보는 행사가 기본입니다.'
                      : '연결할 진행 중 행사가 없습니다.'}
                  </span>
                </span>
              </label>
              {mode === 'existing' && activeProjects.length > 0 && (
                <select
                  aria-label="연결할 행사"
                  className="ui-input ui-select mt-1.5 ml-7 w-auto max-w-full"
                  value={linkTarget}
                  onChange={(e) => setLinkProjectId(e.target.value)}
                >
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.onboarded ? '' : ' · 세팅 미완료'}
                    </option>
                  ))}
                </select>
              )}
              <label className="ui-check-row mt-2">
                <input
                  type="radio"
                  name="import-project-mode"
                  className="ui-check"
                  checked={mode === 'new'}
                  onChange={() => setProjectMode('new')}
                />
                <span>
                  <span className="font-semibold text-ink">새 행사 만들기 (프리필)</span>
                  <span className="block text-sm text-ink-sub">
                    인식된 행사명·일시·장소로 새 행사를 만들고 견적과 상호 링크합니다(§16 매핑).
                  </span>
                </span>
              </label>
              <label className="ui-check-row mt-2">
                <input
                  type="radio"
                  name="import-project-mode"
                  className="ui-check"
                  checked={mode === 'none'}
                  onChange={() => {
                    setProjectMode('none')
                    setSettlementChoice(null)
                    setBoardSeed(false)
                  }}
                />
                <span>
                  <span className="font-semibold text-ink">행사 없이 견적만</span>
                  <span className="block text-sm text-ink-sub">나중에 견적 목록에서 연결할 수 있습니다. 정산 기준·보드 시드는 쓸 수 없습니다.</span>
                </span>
              </label>
            </fieldset>
            <label className="ui-check-row px-3">
              <input
                type="checkbox"
                className="ui-check"
                checked={settlementBase}
                disabled={settlementLocked}
                onChange={(e) => setSettlementChoice(e.target.checked)}
              />
              <span>
                <span className="font-semibold text-ink">정산보드 기준 견적 — 확정하고 기준으로 설정</span>
                <span className="block text-sm text-ink-sub" data-testid="import-settlement-hint">
                  {mode === 'none'
                    ? '행사를 고르면 쓸 수 있습니다.'
                    : targetHasBoard
                      ? '이 행사에는 이미 정산보드가 있습니다 — 기준을 바꾸려면 정산보드의 ‘기준 견적 갱신’을 쓰세요.'
                      : '견적이 확정(잠금)되고 버킷 스냅숏이 고른 행사의 정산보드에 만들어집니다. 끄면 견적은 작성 중으로 남고, 정산보드에서 ‘확정하고 정산 시작’으로 이을 수 있어요.'}
                </span>
              </span>
            </label>
            <label className="ui-check-row px-3">
              <input
                type="checkbox"
                className="ui-check"
                checked={boardSeed}
                disabled={mode === 'none'}
                onChange={(e) => setBoardSeed(e.target.checked)}
              />
              <span>
                <span className="font-semibold text-ink">보드 항목 시드</span>
                <span className="block text-sm text-ink-sub">
                  {mode === 'none' ? '행사를 고르면 쓸 수 있습니다.' : '금액 제외 — 품목·규격·수량만 디자인·운영 보드에 만듭니다.'}
                </span>
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
            <li>
              · 행사:{' '}
              {result.project_created
                ? '새 행사 생성 · 견적과 링크됨'
                : result.project_id
                  ? `기존 행사에 연결됨 — ${linkedName(result.project_id)}`
                  : '하지 않음'}
            </li>
            <li>
              · 정산 기준: {result.settlement_created ? '버킷 스냅숏 생성됨' : '하지 않음'}
              {!result.settlement_created && result.project_id && (
                <span className="text-ink-sub"> — 견적은 작성 중으로 남았습니다. 정산보드에서 ‘확정하고 정산 시작’으로 이을 수 있어요.</span>
              )}
            </li>
            <li>· 보드 시드: {result.deliverables_seeded > 0 ? `${result.deliverables_seeded}건` : '하지 않음'}</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-accent" onClick={() => navigate('/quotes')}>
              견적 목록으로
            </button>
            {result.project_id && result.project_created && (
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
            {result.project_id && !result.project_created && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setProject(result.project_id!)
                  navigate(result.settlement_created ? '/settlement' : '/home')
                }}
              >
                {result.settlement_created ? '정산보드 열기' : '행사로 이동'}
              </button>
            )}
            {result.project_id && !result.settlement_created && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setProject(result.project_id!)
                  navigate('/settlement')
                }}
              >
                정산보드에서 확정하고 시작
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
