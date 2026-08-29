// 공용 행사개요 폼 — 행사 설정(S6) ①탭과 온보딩(S0) ①단계가 동일하게 사용한다(설계서 v1.5 §10).
// 저장은 updateProject 단일 호출로 개요 전 필드를 patch한다(pm 전용, §8 PATCH /projects/{id}).
// 필수 4(행사명·코드·시작일·장소) 중 시작일·장소만 클라이언트에서 막고, 행사명·코드가 비면
// updateProject를 그대로 호출해 서버 검증 메시지('행사명은 비울 수 없습니다.' 등)를 그대로 노출한다.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ErrorAlert from '../internal/ErrorAlert'
import { canUseQuotes } from '../quote/QuoteGate'
import { useAsync, useMutation } from '../../hooks/useAsync'
import {
  COMPANY_SIZE,
  INDUSTRY,
  JOB_FUNCTION,
  POSITION,
  WORK_REGION,
} from '../../modules/quote/data/leadTargeting'
import { getDataProvider } from '../../providers'
import type { OverviewItem, Project, Quote, Targeting, UUID } from '../../types/entities'
import { LevelBadge } from '../internal/StatusBadge'
import { EVENT_FORMAT_LABELS, type EventType } from '../../types/enums'
import type { ProjectPatch } from '../../types/views'

const provider = getDataProvider()

const SEATING_OPTIONS = ['극장식', '라운드', '교실식', '스탠딩', '혼합']

const EMPTY_TARGETING: Targeting = { company_size: [], title: [], industry: [], job: [], region: [] }

// v2.0 — 모객형 전용 그룹의 타겟팅 5축 (modules/quote/data/leadTargeting 상수 키)
const TARGETING_AXES: { key: keyof Targeting; label: string; options: string[] }[] = [
  { key: 'company_size', label: '기업 규모', options: COMPANY_SIZE },
  { key: 'title', label: '직급', options: POSITION },
  { key: 'industry', label: '산업/업종', options: INDUSTRY },
  { key: 'job', label: '직무', options: JOB_FUNCTION },
  { key: 'region', label: '근무 지역', options: WORK_REGION },
]

interface FormValues {
  name: string
  code: string
  eventType: EventType
  eventDate: string
  eventEndDate: string
  startTime: string
  endTime: string
  venue: string
  expectedHeadcount: string
  seating: string
  theme: string
  organizer: string
  mcName: string
  targetAudience: string
  items: OverviewItem[]
  // v2.0 모객형 전용 (일반형이면 숨김·데이터 보존)
  guaranteePax: string
  kpiShowRate: string
  targeting: Targeting
}

function valuesFrom(project: Project): FormValues {
  return {
    name: project.name,
    code: project.code,
    eventType: project.event_type,
    eventDate: project.event_date ?? '',
    eventEndDate: project.event_end_date ?? '',
    startTime: project.start_time ?? '',
    endTime: project.end_time ?? '',
    venue: project.venue ?? '',
    expectedHeadcount: project.expected_headcount != null ? String(project.expected_headcount) : '',
    seating: project.seating ?? '',
    theme: project.theme ?? '',
    organizer: project.organizer ?? '',
    mcName: project.mc_name ?? '',
    targetAudience: project.target_audience ?? '',
    items: project.overview_items ?? [],
    guaranteePax: project.guarantee_pax != null ? String(project.guarantee_pax) : '',
    kpiShowRate: project.kpi_show_rate != null ? String(project.kpi_show_rate) : '',
    targeting: project.targeting ? structuredClone(project.targeting) : structuredClone(EMPTY_TARGETING),
  }
}

interface ProjectOverviewFormProps {
  projectId: UUID
  /** 저장 성공 시 호출 — 설정: 요약 갱신 / S0: 다음 단계 진행 */
  onSaved?: () => void
  /** 기본 '저장' — S0에서는 '다음' 등으로 대체 */
  submitLabel?: string
  /** true면 입력 비활성 + 저장 버튼 숨김(비 pm 뷰어) */
  readOnly?: boolean
}

export default function ProjectOverviewForm({
  projectId,
  onSaved,
  submitLabel = '저장',
  readOnly = false,
}: ProjectOverviewFormProps) {
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const [values, setValues] = useState<FormValues | null>(null)
  const save = useMutation((patch: ProjectPatch) => provider.updateProject(projectId, patch))
  // v2.0 — 견적 연결 상태·액션(admin·sales)용
  const me = useAsync(() => provider.getCurrentUser(), [])
  const canQuotes = !!me.data && canUseQuotes(me.data)
  const linkedQuote = useAsync<Quote | null>(
    () => (project.data?.quote_id ? provider.getQuote(project.data.quote_id) : Promise.resolve(null)),
    [project.data?.quote_id],
  )

  // 최초 로드·행사 전환 시에만 폼 값을 프리필한다(재조회로 덮어써 편집 중인 입력을 잃지 않도록).
  useEffect(() => {
    if (project.data) setValues((prev) => prev ?? valuesFrom(project.data as Project))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.data])

  if (project.loading || !values) {
    return <p className="text-sm text-ink-cap">불러오는 중…</p>
  }
  if (project.error) {
    return <ErrorAlert message={project.error} />
  }

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) =>
    setValues((prev) => (prev ? { ...prev, [key]: v } : prev))

  // v2.0 §16 — 견적에서 생성된 행사의 S0 ① 프리필 표시: 주황 틴트(--accent-tint)·수정 가능.
  // 온보딩 완료 후에는 일반 표시로 돌아간다.
  const prefillFromQuote = !!project.data?.quote_id && !project.data?.onboarded_at
  const initial = project.data ? valuesFrom(project.data) : null
  const tintClass = (key: keyof FormValues): string => {
    if (!prefillFromQuote || !initial) return ''
    const v = initial[key]
    const filled = Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : false
    return filled ? ' bg-accent-tint' : ''
  }

  const toggleTargeting = (axis: keyof Targeting, option: string) =>
    setValues((prev) => {
      if (!prev) return prev
      const list = prev.targeting[axis]
      const nextList = list.includes(option) ? list.filter((v) => v !== option) : [...list, option]
      return { ...prev, targeting: { ...prev.targeting, [axis]: nextList } }
    })

  const updateItem = (idx: number, patch: Partial<OverviewItem>) => {
    setValues((prev) =>
      prev ? { ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : prev,
    )
  }
  const addItem = () =>
    setValues((prev) => (prev ? { ...prev, items: [...prev.items, { label: '', value: '' }] } : prev))
  const removeItem = (idx: number) =>
    setValues((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev))

  const handleReset = () => {
    if (project.data) setValues(valuesFrom(project.data))
    save.setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.eventDate || !values.venue.trim()) {
      save.setError('필수 항목(행사명·코드·시작일·장소)을 입력하세요.')
      return
    }
    const patch: ProjectPatch = {
      name: values.name.trim(),
      code: values.code.trim(),
      event_type: values.eventType,
      event_date: values.eventDate || null,
      event_end_date: values.eventEndDate || null,
      start_time: values.startTime || null,
      end_time: values.endTime || null,
      venue: values.venue.trim() || null,
      expected_headcount: values.expectedHeadcount === '' ? null : Number(values.expectedHeadcount),
      seating: values.seating || null,
      theme: values.theme.trim() || null,
      organizer: values.organizer.trim() || null,
      mc_name: values.mcName.trim() || null,
      target_audience: values.targetAudience.trim() || null,
      overview_items: values.items.filter((it) => it.label.trim() || it.value.trim()),
    }
    // v2.0 — 모객형 전용 그룹은 모객형일 때만 patch(일반형이면 필드 자체를 보내지 않아 데이터 보존)
    if (values.eventType === 'recruiting') {
      patch.guarantee_pax = values.guaranteePax === '' ? null : Number(values.guaranteePax)
      patch.kpi_show_rate = values.kpiShowRate === '' ? null : Number(values.kpiShowRate)
      const hasTargeting = Object.values(values.targeting).some((list) => list.length > 0)
      patch.targeting = hasTargeting ? values.targeting : null
    }
    const result = await save.run(patch)
    if (result) onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-sm">
      {prefillFromQuote && (
        <p
          data-testid="quote-prefill-banner"
          className="rounded-md border border-accent/30 bg-accent-tint px-3 py-2 text-xs text-accent-deep"
        >
          🔗 확정 견적에서 프리필된 값입니다(주황 표시) — 전부 수정할 수 있습니다. 행사 코드는 자동
          제안이니 확인해 주세요.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="ov-name" label="행사명" required span="sm:col-span-2">
          <input
            id="ov-name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('name')}`}
          />
        </Field>
        <Field id="ov-code" label="행사 코드" required>
          <input
            id="ov-code"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('code')}`}
          />
        </Field>
        <Field id="ov-event-type" label="행사 유형">
          <select
            id="ov-event-type"
            value={values.eventType}
            onChange={(e) => set('eventType', e.target.value as EventType)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          >
            <option value="general">일반형</option>
            <option value="recruiting">모객형</option>
          </select>
          <p className="mt-1 text-[11px] leading-snug text-ink-cap">
            행사 유형을 바꿔도 등록 데이터는 삭제되지 않습니다(표시 계층만 전환). WBS 재전개는 일정
            화면에서 실행하세요.
          </p>
        </Field>
        {/* v2.6 §25 — format은 읽기 표시. 전환은 WBS 재전개를 부르므로 S0 ③ 유형 카드가 확인을 받고 처리한다 */}
        <Field id="ov-format" label="행사 포맷">
          <p
            id="ov-format"
            data-testid="format-display"
            data-format={project.data?.format ?? 'conference'}
            className="ui-input flex items-center gap-2 bg-canvas"
          >
            {EVENT_FORMAT_LABELS[project.data?.format ?? 'conference']}
            {project.data?.psa_enabled && <LevelBadge level="progress" label="비즈매칭" />}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-cap">
            포맷 전환은 WBS 재전개를 동반하므로 온보딩 ③ 유형 화면에서 확인을 거쳐 바꿉니다.
          </p>
        </Field>

        <Field id="ov-start-date" label="시작일" required>
          <input
            id="ov-start-date"
            type="date"
            value={values.eventDate}
            onChange={(e) => set('eventDate', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('eventDate')}`}
          />
        </Field>
        <Field id="ov-end-date" label="종료일">
          <input
            id="ov-end-date"
            type="date"
            value={values.eventEndDate}
            onChange={(e) => set('eventEndDate', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('eventEndDate')}`}
          />
        </Field>
        <Field id="ov-start-time" label="시작 시간">
          <input
            id="ov-start-time"
            type="time"
            value={values.startTime}
            onChange={(e) => set('startTime', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('startTime')}`}
          />
        </Field>
        <Field id="ov-end-time" label="종료 시간">
          <input
            id="ov-end-time"
            type="time"
            value={values.endTime}
            onChange={(e) => set('endTime', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('endTime')}`}
          />
        </Field>

        <Field id="ov-venue" label="장소" required span="sm:col-span-2">
          <input
            id="ov-venue"
            value={values.venue}
            onChange={(e) => set('venue', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('venue')}`}
          />
        </Field>
        <Field id="ov-headcount" label="예상 인원">
          <input
            id="ov-headcount"
            type="number"
            min={0}
            value={values.expectedHeadcount}
            onChange={(e) => set('expectedHeadcount', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('expectedHeadcount')}`}
          />
        </Field>
        <Field id="ov-seating" label="좌석 형태">
          <select
            id="ov-seating"
            value={values.seating}
            onChange={(e) => set('seating', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          >
            <option value="">선택 안 함</option>
            {SEATING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>

        <Field id="ov-theme" label="주제(슬로건)" span="sm:col-span-2">
          <input
            id="ov-theme"
            value={values.theme}
            onChange={(e) => set('theme', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-organizer" label="주최·주관">
          <input
            id="ov-organizer"
            value={values.organizer}
            onChange={(e) => set('organizer', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('organizer')}`}
          />
        </Field>
        <Field id="ov-mc" label="사회자">
          <input
            id="ov-mc"
            value={values.mcName}
            onChange={(e) => set('mcName', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-audience" label="참가 대상" span="sm:col-span-2 lg:col-span-4">
          <input
            id="ov-audience"
            value={values.targetAudience}
            onChange={(e) => set('targetAudience', e.target.value)}
            disabled={readOnly}
            className={`ui-input disabled:opacity-60${tintClass('targetAudience')}`}
          />
        </Field>

        {/* v2.6 §25 — DMS 전용 그룹. 세션 정원·부스 수는 program_sessions·partners가 정본이라
            여기에 프로젝트 레벨 사본을 두지 않는다(정본 이원화 방지) */}
        {project.data?.format === 'dms' && (
          <div
            data-testid="dms-group"
            className="rounded-[10px] border border-steel/30 bg-canvas p-4 sm:col-span-2 lg:col-span-4"
          >
            <p className="t-card-title mb-3">DMS 전용</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="ov-audience-model" label="청중 모델">
                <p id="ov-audience-model" className="ui-input flex items-center bg-card">
                  {project.data.audience_model === 'invite' ? '초청제' : '공개 모집'}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-ink-cap">
                  초청제 승인 게이트는 아직 구현되지 않았습니다 — 등록은 현재 모객형 파이프라인으로
                  동작합니다(설계서 §25.6).
                </p>
              </Field>
              <div className="sm:col-span-2 lg:col-span-3 self-end text-[11px] leading-relaxed text-ink-cap">
                세션 정원은 프로그램표(세션별), 부스는 파트너 보드가 정본입니다.
              </div>
            </div>
          </div>
        )}

        {/* v2.0 — 모객형 전용 그룹: 보장 인원·쇼업 KPI·타겟팅 5축·연결 견적 (일반형이면 숨김·데이터 보존) */}
        {values.eventType === 'recruiting' && (
          <div
            data-testid="recruiting-group"
            className="rounded-[10px] border border-accent/30 bg-canvas p-4 sm:col-span-2 lg:col-span-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="t-card-title">모객형 전용</p>
              {project.data?.quote_id && linkedQuote.data ? (
                <Link
                  to="/quotes"
                  className="ml-auto rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold text-accent-deep hover:underline"
                >
                  🔗 견적 v{linkedQuote.data.version} 확정 기준 →
                </Link>
              ) : (
                canQuotes &&
                !readOnly && (
                  <span className="ml-auto">
                    <QuoteLinkAction projectId={projectId} onLinked={project.reload} />
                  </span>
                )
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="ov-guarantee" label="보장 인원(게런티)">
                <input
                  id="ov-guarantee"
                  type="number"
                  min={0}
                  value={values.guaranteePax}
                  onChange={(e) => set('guaranteePax', e.target.value)}
                  disabled={readOnly}
                  className={`ui-input disabled:opacity-60${tintClass('guaranteePax')}`}
                />
              </Field>
              <Field id="ov-kpi" label="쇼업 KPI (%)">
                <input
                  id="ov-kpi"
                  type="number"
                  min={0}
                  max={100}
                  value={values.kpiShowRate}
                  onChange={(e) => set('kpiShowRate', e.target.value)}
                  disabled={readOnly}
                  className={`ui-input disabled:opacity-60${tintClass('kpiShowRate')}`}
                />
              </Field>
            </div>
            <div className="mt-3 space-y-3">
              <p className="t-caption">타겟팅 5축</p>
              {TARGETING_AXES.map((axis) => (
                <div key={axis.key}>
                  <p className="mb-1 text-[11px] font-medium text-ink-cap">{axis.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {axis.options.map((option) => {
                      const active = values.targeting[axis.key].includes(option)
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={readOnly}
                          onClick={() => toggleTargeting(axis.key, option)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60 ${
                            active
                              ? 'border-accent bg-accent-tint font-semibold text-accent-deep'
                              : 'border-border bg-card text-ink-sub hover:bg-track'
                          }`}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
          <p className="t-caption">기타 개요 항목</p>
          {values.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                placeholder="라벨"
                value={item.label}
                onChange={(e) => updateItem(idx, { label: e.target.value })}
                disabled={readOnly}
                className="ui-input w-32 text-xs disabled:opacity-60"
              />
              <input
                placeholder="내용"
                value={item.value}
                onChange={(e) => updateItem(idx, { value: e.target.value })}
                disabled={readOnly}
                className="ui-input flex-1 text-xs disabled:opacity-60"
              />
              {!readOnly && (
                <button type="button" onClick={() => removeItem(idx)} className="shrink-0 text-xs text-negative">
                  삭제
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" onClick={addItem} className="self-start text-xs text-ink-sub underline">
              + 항목 추가
            </button>
          )}
        </div>
      </div>

      <ErrorAlert message={save.error} />

      {readOnly ? (
        <p className="text-xs text-ink-cap">이 화면은 읽기 전용입니다 — 수정은 PM만 할 수 있습니다.</p>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleReset} className="btn btn-ghost">
            변경 취소
          </button>
          <button type="submit" disabled={save.pending} className="btn btn-primary">
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  )
}

/** v2.0 — "견적 연결" 액션 (admin·sales): 확정·미연결 견적을 골라 현재 행사에 연결한다 */
function QuoteLinkAction({ projectId, onLinked }: { projectId: UUID; onLinked: () => void }) {
  const [open, setOpen] = useState(false)
  const candidates = useAsync<Quote[]>(
    () => (open ? provider.listQuotes().then((qs) => qs.filter((q) => q.is_final && !q.project_id)) : Promise.resolve([])),
    [open],
  )
  const [quoteId, setQuoteId] = useState('')
  const link = useMutation((id: string) => provider.updateProject(projectId, { quote_id: id }))

  const handleLink = async () => {
    if (!quoteId) return
    const result = await link.run(quoteId)
    if (result) {
      setOpen(false)
      onLinked()
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        견적 연결
      </button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select className="ui-input min-h-8 py-1 text-xs" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} aria-label="연결할 견적">
        <option value="">확정 견적 선택…</option>
        {(candidates.data ?? []).map((q) => (
          <option key={q.id} value={q.id}>
            {q.title} · v{q.version}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleLink()} disabled={!quoteId || link.pending}>
        연결
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        취소
      </button>
      <ErrorAlert message={link.error} />
    </span>
  )
}

function Field({
  id,
  label,
  required,
  span,
  children,
}: {
  id: string
  label: string
  required?: boolean
  span?: string
  children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1 t-caption ${span ?? ''}`}>
      <span className="flex items-baseline gap-0.5">
        <label htmlFor={id}>{label}</label>
        {required && (
          <span aria-hidden="true" className="text-accent-deep">
            *
          </span>
        )}
      </span>
      {children}
    </div>
  )
}
