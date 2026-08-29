// v2.6 §24.5 — 시트 최초 연결 3단계 위저드 (시안 화면 2).
//   ① URL 붙여넣기(시트 확인 · 읽기 권한 안내 · 서비스 계정 복사)
//   ② 명단이 있는 탭 선택(행·열·헤더 미리보기, selectable=false는 사유와 함께 선택 불가)
//   ③ 컬럼 매핑(필수 name+email, 미리보기 값은 마스킹 표시, '무시' 선택지)
// `시트 → 앱 단방향` 고지는 3단계 내내 상단 고정한다. 스텝 레일은 S0 위저드의 StepIndicator 재사용.
// 시트에 쓰는 경로는 없다(§24.6) — 위저드가 부르는 것은 probe/preview/connect 3개뿐이다.
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { LevelBadge } from '../internal/StatusBadge'
import StepIndicator, { type WizardStep } from '../onboarding/StepIndicator'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import {
  SHEET_FIELD_LABELS,
  SHEET_MAPPED_FIELDS,
  SHEET_REQUIRED_FIELDS,
  type SheetMappedField,
} from '../../types/enums'
import type { SheetColumnPreview, SheetProbe, SheetTabInfo } from '../../types/views'
import { stamp } from './sheetFormat'

const provider = getDataProvider()

const STEPS: readonly WizardStep[] = [
  { id: 1, label: '시트 URL' },
  { id: 2, label: '시트 탭 선택' },
  { id: 3, label: '컬럼 매핑' },
]

const FIELD_OPTIONS: { value: SheetMappedField | 'ignore'; label: string }[] = [
  ...SHEET_MAPPED_FIELDS.map((f) => ({ value: f, label: `${SHEET_FIELD_LABELS[f]}(${f})` })),
  { value: 'ignore' as const, label: '무시' },
]

/** 단방향 고지 — 3단계 내내 상단 고정(§24.5) */
function OneWayNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-steel/20 bg-steel-tint px-3 py-2 text-xs leading-relaxed text-steel">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="mt-0.5 size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8h.01M11 12h1v5h1" />
      </svg>
      <p className="m-0">
        <strong className="font-semibold">시트 → 앱 단방향입니다. 시트가 정본입니다.</strong> 앱은 시트를 읽기만
        하며 어떤 경우에도 시트에 쓰지 않습니다. 명단 수정은 항상 시트에서 하고, 앱에서는 체크인·비고만
        기록합니다. 이 방향은 연결 후에도 바꿀 수 없습니다.
      </p>
    </div>
  )
}

export default function SheetConnectWizard({
  projectId,
  onConnected,
  onCancel,
}: {
  projectId: string
  onConnected: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [probe, setProbe] = useState<SheetProbe | null>(null)
  const [tabName, setTabName] = useState<string | null>(null)
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true)
  const [previews, setPreviews] = useState<SheetColumnPreview[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, SheetMappedField | 'ignore'>>({})
  const [copied, setCopied] = useState(false)

  const probeM = useMutation((v: string) => provider.probeSheet(projectId, v))
  const previewM = useMutation((tab: string) => provider.previewSheetColumns(projectId, url, tab))
  const connectM = useMutation(() =>
    provider.connectSheet(projectId, {
      url,
      tab_name: tabName as string,
      mapping: (previews ?? []).map((p) => ({
        column: p.column,
        field: mapping[p.column] === 'ignore' || mapping[p.column] === undefined ? null : (mapping[p.column] as SheetMappedField),
      })),
      first_row_is_header: firstRowIsHeader,
    }),
  )

  const handleProbe = async () => {
    const result = await probeM.run(url)
    if (!result) return
    setProbe(result)
    const firstSelectable = result.tabs.find((t) => t.selectable)
    setTabName(firstSelectable?.name ?? null)
  }

  const handleGoMapping = async () => {
    if (!tabName) return
    const result = await previewM.run(tabName)
    if (!result) return
    setPreviews(result)
    const seed: Record<string, SheetMappedField | 'ignore'> = {}
    result.forEach((p) => {
      seed[p.column] = p.suggested ?? 'ignore'
    })
    setMapping(seed)
    setStep(3)
  }

  const mappedFields = Object.values(mapping).filter((f): f is SheetMappedField => f !== 'ignore')
  const missingRequired = SHEET_REQUIRED_FIELDS.filter((f) => !mappedFields.includes(f))
  const canFinish = missingRequired.length === 0

  const handleConnect = async () => {
    const result = await connectM.run()
    if (result) onConnected()
  }

  const handleCopy = () => {
    if (!probe) return
    void navigator.clipboard?.writeText(probe.service_account).catch(() => undefined)
    setCopied(true)
  }

  return (
    <div className="space-y-5" data-testid="sheet-connect-wizard">
      <OneWayNotice />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="shrink-0 pt-1">
          <StepIndicator steps={STEPS} current={step} />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <p className="t-caption">단계 {step} / 3</p>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="sheet-url" className="t-caption mb-1.5 block">
                  구글 시트 URL
                </label>
                <input
                  id="sheet-url"
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setProbe(null)
                  }}
                  placeholder="https://…/spreadsheets/d/…/edit"
                  className="ui-input w-full"
                />
                {probe && (
                  <p className="mt-2 text-sm text-positive">
                    {probe.title} · 탭 {probe.tabs.length}개 · 마지막 수정 {stamp(probe.source_modified_at)}
                  </p>
                )}
              </div>
              <ErrorAlert message={probeM.error} />

              <div className="rounded-lg border border-border bg-canvas p-4">
                <p className="text-sm font-semibold text-ink">읽기 권한 부여</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-sub">
                  아래 계정을 뷰어로 초대하세요. 편집 권한은 필요하지 않습니다.
                </p>
                {/* 인증은 서비스 계정 단일 경로다(3.17.1 T2). 공개 링크 공유를 권하면 참가자 실명·연락처가
                    링크를 가진 누구에게나 열린다 — 화면이 그 방법을 안내해서는 안 된다. */}
                <p className="mt-1.5 text-sm leading-relaxed text-negative">
                  참가자 명단 시트는 ‘링크가 있는 모든 사용자’로 공유하지 마세요.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-ink">
                    {probe?.service_account ?? '시트를 확인하면 초대할 계정이 표시됩니다'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!probe}
                    className="btn btn-ghost btn-sm"
                  >
                    {copied ? '복사됨' : '복사'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="btn btn-ghost">
                  취소
                </button>
                {probe ? (
                  <button type="button" onClick={() => setStep(2)} className="btn btn-accent">
                    다음 — 탭 선택
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleProbe}
                    disabled={probeM.pending || url.trim().length === 0}
                    className="btn btn-accent"
                  >
                    시트 확인
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 2 && probe && (
            <div className="space-y-3">
              <p className="t-caption">탭 {probe.tabs.length}개 감지 · 1개만 선택</p>
              <ul className="space-y-2.5">
                {probe.tabs.map((t) => (
                  <TabOption
                    key={t.name}
                    tab={t}
                    selected={tabName === t.name}
                    onSelect={() => setTabName(t.name)}
                  />
                ))}
              </ul>
              <label className="ui-check-row text-sm text-ink">
                <input
                  type="checkbox"
                  checked={firstRowIsHeader}
                  onChange={(e) => setFirstRowIsHeader(e.target.checked)}
                  className="ui-check"
                />
                첫 행을 헤더로 사용
              </label>
              <ErrorAlert message={previewM.error} />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setStep(1)} className="btn btn-ghost">
                  이전
                </button>
                <button
                  type="button"
                  onClick={handleGoMapping}
                  disabled={!tabName || previewM.pending}
                  className="btn btn-accent"
                >
                  다음 — 컬럼 매핑
                </button>
              </div>
            </div>
          )}

          {step === 3 && previews && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="t-caption grow">컬럼 매핑 — {tabName}</p>
                {canFinish ? (
                  <LevelBadge level="positive" label="필수 2개 모두 매핑됨" />
                ) : (
                  <LevelBadge
                    level="attention"
                    label={`필수 미지정 — ${missingRequired.map((f) => SHEET_FIELD_LABELS[f]).join('·')}`}
                  />
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="ui-table text-left text-sm">
                  <thead>
                    <tr>
                      <th className="ui-th w-44">시트 컬럼</th>
                      <th className="ui-th">첫 행 미리보기</th>
                      <th className="ui-th w-60">등록 필드</th>
                      <th className="ui-th w-24">필수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map((p) => {
                      const value = mapping[p.column] ?? 'ignore'
                      const required =
                        value !== 'ignore' && SHEET_REQUIRED_FIELDS.includes(value as SheetMappedField)
                      return (
                        <tr key={p.column}>
                          <td className="text-ink">{p.column}</td>
                          <td className="text-ink-sub">
                            {p.sample}
                            {p.masked && <span className="ml-1 text-xs text-ink-cap">· 마스킹 표시</span>}
                          </td>
                          <td>
                            <select
                              aria-label={`${p.column} 매핑`}
                              value={value}
                              onChange={(e) =>
                                setMapping((m) => ({
                                  ...m,
                                  [p.column]: e.target.value as SheetMappedField | 'ignore',
                                }))
                              }
                              className="ui-input ui-select w-full text-xs"
                            >
                              {FIELD_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="text-ink-cap">
                            {required ? <LevelBadge level="attention" label="필수" /> : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-canvas p-4 text-sm leading-relaxed text-ink-sub">
                <p className="font-semibold text-ink">연결 후 규칙</p>
                <p>· 매핑된 명단 필드는 시트 소유입니다. 앱에서는 수정할 수 없고 시트를 고치면 다음 동기화에서 따라옵니다.</p>
                <p>· 체크인·비고는 앱 소유 필드입니다. 시트를 덮어쓰지 않습니다.</p>
                <p>· 시트에서 행이 사라지면 삭제하지 않고 ‘시트에서 제거됨’ 상태로 이력을 남깁니다.</p>
                <p>· 연락처는 기본 마스킹으로 표시되며, 내보내기 시에만 원문 포함을 선택할 수 있습니다.</p>
              </div>

              <ErrorAlert message={connectM.error} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setStep(2)} className="btn btn-ghost">
                  이전
                </button>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!canFinish || connectM.pending}
                  className="btn btn-accent"
                >
                  연결 완료
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabOption({
  tab,
  selected,
  onSelect,
}: {
  tab: SheetTabInfo
  selected: boolean
  onSelect: () => void
}) {
  const headers = tab.headers.length > 0 ? ` · 헤더 — ${tab.headers.join(' · ')}` : ''
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!tab.selectable}
        aria-pressed={selected}
        className={`flex w-full items-center justify-between gap-4 rounded-lg border px-3.5 py-3 text-left ${
          !tab.selectable
            ? 'cursor-not-allowed border-border bg-canvas opacity-70'
            : selected
              ? 'border-accent bg-accent-tint'
              : 'border-border bg-card hover:bg-track'
        }`}
      >
        <span className="min-w-0">
          <span className={`block text-sm font-semibold ${tab.selectable ? 'text-ink' : 'text-ink-cap'}`}>
            {tab.name}
          </span>
          <span className={`mt-1 block text-xs ${tab.selectable ? 'text-ink-sub' : 'text-ink-cap'}`}>
            {tab.rows.toLocaleString()}행 · {tab.columns}열{tab.note ? ` · ${tab.note}` : headers}
          </span>
        </span>
        {/* §10-B — 선택은 보더·틴트(＋aria-pressed)로 끝낸다. 우측은 '선택 불가'처럼
            누를 수 없는 이유를 말하는 정보 배지 자리다. */}
        {!tab.selectable && <LevelBadge level="neutral" label="선택 불가" />}
      </button>
    </li>
  )
}
