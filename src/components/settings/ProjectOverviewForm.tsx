// 공용 행사개요 폼 — 행사 설정 '개요' 탭과 온보딩 1단계가 같은 상태·검증·저장을 쓴다(설계서 v1.5 §10).
// 저장은 updateProject 단일 호출로 개요 전 필드를 patch한다(pm 전용, §8 PATCH /projects/{id}).
// 필수 4(행사명·코드·시작일·장소) 중 시작일·장소만 클라이언트에서 막고, 행사명·코드가 비면
// updateProject를 그대로 호출해 서버 검증 메시지('행사명은 비울 수 없습니다.' 등)를 그대로 노출한다.
// 앞의 둘은 필드 줄 오류, 뒤의 둘은 서버 응답이라 블록 경고 — §10-C의 두 갈래가 그대로 나뉜다.
//
// Phase 3.23 PR-8(디자인지시서 v1.4 §7-2.12 · 캔버스 '행사 설정 — 섹션과 고정 저장 바' · '온보딩 — 넓은 2열'):
//   · layout='settings' — 왼쪽 섹션 목록(기본 정보 · 일정·장소 · 내용 · 모객 설정 — 변경 수) + 섹션 카드 +
//     바꾼 칸 표시(accent 테두리 · '원래 …') + **고정 저장 바**('저장하지 않은 변경 n개 · 칸 이름' · 변경 취소 · 저장)
//   · layout='onboarding' — '무엇을' · '언제 · 어디서' 넓은 2열 + 선택 항목 접기(값이 있으면 펼친 채) + 다음 단계 줄
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { canUseQuotes } from '../quote/QuoteGate'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { EVENT_TYPE_LABELS, formatDateWeekday } from '../../lib/labels'
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
import { filledRequired } from './requiredFields'

const provider = getDataProvider()

const SEATING_OPTIONS = ['극장식', '라운드', '교실식', '스탠딩', '혼합']

const EMPTY_TARGETING: Targeting = { company_size: [], title: [], industry: [], job: [], region: [] }

// v2.0 — 모객형 전용 그룹의 타겟팅 5축 (modules/quote/data/leadTargeting 상수 키)
const TARGETING_AXES: { key: keyof Targeting; label: string; short: string; options: string[] }[] = [
  { key: 'company_size', label: '기업 규모', short: '규모', options: COMPANY_SIZE },
  { key: 'title', label: '직급', short: '직급', options: POSITION },
  { key: 'industry', label: '산업/업종', short: '업종', options: INDUSTRY },
  { key: 'job', label: '직무', short: '직무', options: JOB_FUNCTION },
  { key: 'region', label: '근무 지역', short: '지역', options: WORK_REGION },
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

type FieldKey = keyof FormValues
type SectionId = 'basic' | 'schedule' | 'content' | 'recruiting'

/** 칸 이름(저장 바의 '바뀐 칸' 목록)과 소속 섹션 */
const FIELD_META: Record<FieldKey, { label: string; section: SectionId }> = {
  name: { label: '행사명', section: 'basic' },
  code: { label: '행사 코드', section: 'basic' },
  eventType: { label: '행사 유형', section: 'basic' },
  eventDate: { label: '시작일', section: 'schedule' },
  eventEndDate: { label: '종료일', section: 'schedule' },
  startTime: { label: '시작 시간', section: 'schedule' },
  endTime: { label: '종료 시간', section: 'schedule' },
  venue: { label: '장소', section: 'schedule' },
  expectedHeadcount: { label: '예상 인원', section: 'schedule' },
  seating: { label: '좌석 형태', section: 'schedule' },
  theme: { label: '주제(슬로건)', section: 'content' },
  organizer: { label: '주최·주관', section: 'content' },
  mcName: { label: '사회자', section: 'content' },
  targetAudience: { label: '참가 대상', section: 'content' },
  items: { label: '기타 항목', section: 'content' },
  guaranteePax: { label: '보장 인원', section: 'recruiting' },
  kpiShowRate: { label: '쇼업 KPI', section: 'recruiting' },
  targeting: { label: '타겟팅', section: 'recruiting' },
}

const FIELD_ORDER = Object.keys(FIELD_META) as FieldKey[]

/** 온보딩에서 접어 두는 선택 항목 — 필수 4 · 유형 · 예상 인원 · 시간은 2열에 늘 보인다 */
const OPTIONAL_KEYS: FieldKey[] = ['seating', 'theme', 'organizer', 'mcName', 'targetAudience', 'items']

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

/** 저장 확인 캡션의 시각 — 판매 플래너 등급 카드와 같은 HH:mm */
function savedStamp(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** 바꾼 칸의 '원래 …' 표기 — 사람이 읽는 값으로 */
function originalText(key: FieldKey, v: FormValues): string | null {
  const raw = v[key]
  if (key === 'items' || key === 'targeting') return null
  if (key === 'eventType') return EVENT_TYPE_LABELS[raw as EventType]
  if (typeof raw !== 'string' || raw.trim() === '') return '비어 있음'
  if (key === 'eventDate' || key === 'eventEndDate') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatDateWeekday(raw) : raw
  if (key === 'expectedHeadcount' || key === 'guaranteePax') return `${raw}명`
  if (key === 'kpiShowRate') return `${raw}%`
  return raw
}

/** 클라이언트에서 막는 필수 항목 — 행사명·코드는 서버 메시지를 그대로 쓴다(파일 머리 주석) */
type RequiredKey = 'eventDate' | 'venue'

const REQUIRED_MESSAGES: Record<RequiredKey, string> = {
  eventDate: '시작일을 입력하세요.',
  venue: '장소를 입력하세요.',
}

interface ProjectOverviewFormProps {
  projectId: UUID
  /** 저장 성공 시 호출 — 설정: 요약 갱신 / S0: 다음 단계 진행 */
  onSaved?: () => void
  /** 기본 '저장' — S0에서는 '다음: 담당자' */
  submitLabel?: string
  /** true면 입력 비활성 + 저장 버튼 숨김(비 pm 뷰어) */
  readOnly?: boolean
  /** 'settings' = 섹션 카드 + 섹션 목록 + 고정 저장 바 / 'onboarding' = 넓은 2열 + 선택 항목 접기 + 다음 단계 줄 */
  layout?: 'settings' | 'onboarding'
  /** 저장하지 않은 입력이 생기고 사라질 때 — 온보딩 '나중에 하기'가 확인을 받는다 */
  onDirtyChange?: (dirty: boolean) => void
  /** 온보딩 아래 줄의 다음 단계 안내 */
  nextHint?: string
  /** 필수 4개 중 입력된 수 — 온보딩 진행 줄이 저장 전 입력을 따라간다 */
  onRequiredFilledChange?: (filled: number) => void
}

export default function ProjectOverviewForm({
  projectId,
  onSaved,
  submitLabel = '저장',
  readOnly = false,
  layout = 'settings',
  onDirtyChange,
  nextHint,
  onRequiredFilledChange,
}: ProjectOverviewFormProps) {
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const [values, setValues] = useState<FormValues | null>(null)
  // 저장된 기준 — 바뀐 칸 판정·변경 취소·'원래 …' 표기가 이 값을 본다. 저장에 성공하면 그 값이 새 기준
  const [baseline, setBaseline] = useState<FormValues | null>(null)
  // §10-C — 필수 미입력은 그 줄에서 말한다. 블록 경고(ErrorAlert)는 저장 실패(서버·권한) 몫으로 비워 둔다.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredKey, string>>>({})
  const [optionalOpen, setOptionalOpen] = useState<boolean | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('basic')
  // 저장 바가 사라진 뒤에도 저장됐다는 사실이 남도록 — §10 '저장됨 HH:mm' 캡션(설정 배치)
  const [savedAt, setSavedAt] = useState<string | null>(null)
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
    if (!project.data) return
    const loaded = valuesFrom(project.data as Project)
    setValues((prev) => prev ?? loaded)
    setBaseline((prev) => prev ?? loaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.data])

  const changed = useMemo<FieldKey[]>(() => {
    if (!values || !baseline) return []
    return FIELD_ORDER.filter((k) => {
      // 일반형이면 모객 칸은 저장되지 않는다(데이터 보존) — 바뀐 칸으로 세지 않는다
      if (FIELD_META[k].section === 'recruiting' && values.eventType !== 'recruiting') return false
      return !sameValue(values[k], baseline[k])
    })
  }, [values, baseline])
  const dirty = changed.length > 0

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const requiredFilled = values
    ? filledRequired({ name: values.name, code: values.code, event_date: values.eventDate, venue: values.venue }).size
    : null
  useEffect(() => {
    if (requiredFilled !== null) onRequiredFilledChange?.(requiredFilled)
  }, [requiredFilled, onRequiredFilledChange])

  if (project.loading || !values || !baseline) {
    return <p className="text-sm text-ink-cap">불러오는 중…</p>
  }
  if (project.error) {
    return <ErrorAlert message={project.error} />
  }

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => {
    setValues((prev) => (prev ? { ...prev, [key]: v } : prev))
    // 입력을 고치는 순간 그 줄의 오류는 낡는다 — 저장까지 붉게 남겨 두지 않는다
    const touched: RequiredKey | null =
      key === 'eventDate' ? 'eventDate' : key === 'venue' ? 'venue' : null
    if (!touched) return
    setFieldErrors((prev) => {
      if (!prev[touched]) return prev
      const next = { ...prev }
      delete next[touched]
      return next
    })
  }

  const errorClass = (key: RequiredKey) => (fieldErrors[key] ? ' ui-input-error' : '')
  const isSettings = layout === 'settings'
  const isChanged = (key: FieldKey) => isSettings && changed.includes(key)
  /** 바꾼 칸 = accent 테두리(설정 화면만 — 온보딩은 처음 채우는 중이라 표시하지 않는다) */
  const changedClass = (key: FieldKey) => (isChanged(key) ? ' border-accent' : '')
  /** 바꾼 칸의 힌트 줄 — '원래 …'(오류가 있으면 Field가 오류로 대체). 칸에 원래 안내가 있으면 이어 붙인다 —
   *  유형을 바꾸는 순간 '데이터는 지워지지 않는다·WBS는 일정 화면에서'가 사라지면 가장 필요한 때 안내를 잃는다 */
  const changedHint = (key: FieldKey, fallback?: string) => {
    if (!isChanged(key)) return fallback
    const text = originalText(key, baseline)
    if (!text) return fallback
    return fallback ? `원래 ${text} · ${fallback}` : `원래 ${text}`
  }

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
    setValues(baseline)
    setFieldErrors({})
    save.setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const missing: Partial<Record<RequiredKey, string>> = {}
    if (!values.eventDate) missing.eventDate = REQUIRED_MESSAGES.eventDate
    if (!values.venue.trim()) missing.venue = REQUIRED_MESSAGES.venue
    setFieldErrors(missing)
    if (Object.keys(missing).length > 0) return
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
    if (result) {
      setBaseline(values)
      setSavedAt(savedStamp(new Date()))
      onSaved?.()
    }
  }

  // ── 칸 조각 — 두 배치가 같은 입력을 다른 자리에 놓는다 ─────────────────────
  const inputBase = 'ui-input disabled:opacity-60'

  const nameField = (span = 'sm:col-span-2') => (
    <Field id="ov-name" label="행사명" required span={span} hint={changedHint('name')}>
      <input
        id="ov-name"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        disabled={readOnly}
        className={`${inputBase}${tintClass('name')}${changedClass('name')}`}
      />
    </Field>
  )
  // 파일 이름 규약 = 올린 날 YYMMDD_코드_…(lib/statusMachine.buildVersionFileName) — 예시는 오늘 날짜로
  const today = new Date()
  const yymmdd = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const codeHint = `파일 이름 앞에 붙습니다 — 예: ${yymmdd}_${values.code.trim() || 'CODE'}_…`
  const codeField = () => (
    <Field id="ov-code" label="행사 코드" required hint={changedHint('code', codeHint)}>
      <input
        id="ov-code"
        value={values.code}
        onChange={(e) => set('code', e.target.value)}
        disabled={readOnly}
        className={`${inputBase}${tintClass('code')}${changedClass('code')}`}
      />
    </Field>
  )
  const eventTypeField = (hint: string) => (
    <Field id="ov-event-type" label="행사 유형" hint={changedHint('eventType', hint)}>
      <select
        id="ov-event-type"
        value={values.eventType}
        onChange={(e) => set('eventType', e.target.value as EventType)}
        disabled={readOnly}
        className={`ui-input ui-select disabled:opacity-60${changedClass('eventType')}`}
      >
        <option value="general">일반형 — 참가 신청 관리 없이 운영만</option>
        <option value="recruiting">모객형 — 참가 신청·모객 관리 포함</option>
      </select>
    </Field>
  )
  const startDateField = () => (
    <Field id="ov-start-date" label="시작일" required error={fieldErrors.eventDate} hint={changedHint('eventDate')}>
      {/* type="date"는 네이티브 피커·YYYY-MM-DD 표기를 그대로 쓴다(§10-A) — ui-input-num 미적용 */}
      <input
        id="ov-start-date"
        type="date"
        value={values.eventDate}
        onChange={(e) => set('eventDate', e.target.value)}
        disabled={readOnly}
        aria-invalid={fieldErrors.eventDate ? true : undefined}
        className={`${inputBase}${tintClass('eventDate')}${errorClass('eventDate')}${changedClass('eventDate')}`}
      />
    </Field>
  )
  const endDateField = (hint?: string) => (
    <Field id="ov-end-date" label="종료일" hint={changedHint('eventEndDate', hint)}>
      <input
        id="ov-end-date"
        type="date"
        value={values.eventEndDate}
        onChange={(e) => set('eventEndDate', e.target.value)}
        disabled={readOnly}
        className={`${inputBase}${tintClass('eventEndDate')}${changedClass('eventEndDate')}`}
      />
    </Field>
  )
  const startTimeField = () => (
    <Field id="ov-start-time" label="시작 시간" hint={changedHint('startTime')}>
      <input
        id="ov-start-time"
        type="time"
        value={values.startTime}
        onChange={(e) => set('startTime', e.target.value)}
        disabled={readOnly}
        className={`${inputBase}${tintClass('startTime')}${changedClass('startTime')}`}
      />
    </Field>
  )
  const endTimeField = () => (
    <Field id="ov-end-time" label="종료 시간" hint={changedHint('endTime')}>
      <input
        id="ov-end-time"
        type="time"
        value={values.endTime}
        onChange={(e) => set('endTime', e.target.value)}
        disabled={readOnly}
        className={`${inputBase}${tintClass('endTime')}${changedClass('endTime')}`}
      />
    </Field>
  )
  const venueField = (span = 'sm:col-span-2', hint?: string) => (
    <Field id="ov-venue" label="장소" required span={span} error={fieldErrors.venue} hint={changedHint('venue', hint)}>
      <input
        id="ov-venue"
        value={values.venue}
        onChange={(e) => set('venue', e.target.value)}
        disabled={readOnly}
        aria-invalid={fieldErrors.venue ? true : undefined}
        className={`${inputBase}${tintClass('venue')}${errorClass('venue')}${changedClass('venue')}`}
      />
    </Field>
  )
  const headcountField = () => (
    <Field id="ov-headcount" label="예상 인원" align="right" hint={changedHint('expectedHeadcount')}>
      <input
        id="ov-headcount"
        type="number"
        min={0}
        value={values.expectedHeadcount}
        placeholder="예: 150"
        onChange={(e) => set('expectedHeadcount', e.target.value)}
        disabled={readOnly}
        className={`ui-input ui-input-num disabled:opacity-60${tintClass('expectedHeadcount')}${changedClass('expectedHeadcount')}`}
      />
    </Field>
  )
  const seatingField = () => (
    <Field id="ov-seating" label="좌석 형태" hint={changedHint('seating')}>
      <select
        id="ov-seating"
        value={values.seating}
        onChange={(e) => set('seating', e.target.value)}
        disabled={readOnly}
        className={`ui-input ui-select disabled:opacity-60${changedClass('seating')}`}
      >
        <option value="">선택 안 함</option>
        {SEATING_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Field>
  )
  const textField = (key: 'theme' | 'organizer' | 'mcName' | 'targetAudience', id: string, label: string, span?: string) => (
    <Field id={id} label={label} span={span} hint={changedHint(key)}>
      <input
        id={id}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={readOnly}
        className={`${inputBase}${tintClass(key)}${changedClass(key)}`}
      />
    </Field>
  )
  const itemsField = (span: string) => (
    <div className={`flex flex-col gap-2 ${span}`} data-testid="overview-items">
      <p className="t-caption">기타 항목</p>
      {values.items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-2">
          <input
            placeholder="항목 이름"
            aria-label={`기타 항목 ${idx + 1} 이름`}
            value={item.label}
            onChange={(e) => updateItem(idx, { label: e.target.value })}
            disabled={readOnly}
            className={inputBase}
          />
          <input
            placeholder="내용"
            aria-label={`기타 항목 ${idx + 1} 내용`}
            value={item.value}
            onChange={(e) => updateItem(idx, { value: e.target.value })}
            disabled={readOnly}
            className={inputBase}
          />
          {!readOnly && (
            <button type="button" onClick={() => removeItem(idx)} className="btn btn-ghost btn-sm" aria-label={`기타 항목 ${idx + 1} 지우기`}>
              지우기
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center self-start py-1 text-sm font-semibold text-accent-deep hover:underline"
        >
          ＋ 항목 추가
        </button>
      )}
    </div>
  )

  const formatRow = () => (
    // v2.6 §25 — format은 읽기 표시. 온보딩 3단계에서 정하고, 행사 중간 전환은 여기서 하지 않는다 —
    // 포맷 카드는 행사 성격·모객 유형까지 다시 시드해서 진행 중인 행사를 크게 바꾼다(캔버스의 '유형·연동 탭에서 바꾸기'는 결정 대기)
    <div className="flex flex-col gap-1 t-caption sm:col-span-2">
      <span>행사 포맷</span>
      <span className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
        <span
          id="ov-format"
          data-testid="format-display"
          data-format={project.data?.format ?? 'conference'}
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink"
        >
          {EVENT_FORMAT_LABELS[project.data?.format ?? 'conference']}
          {project.data?.psa_enabled && <LevelBadge level="progress" label="비즈매칭" />}
        </span>
        <span className="t-caption">온보딩 3단계에서 정했습니다 — 바꾸면 일정(WBS)을 다시 펼쳐야 해서 여기서는 바꾸지 않습니다</span>
      </span>
    </div>
  )

  const dmsGroup = () =>
    // v2.6 §25 — DMS 전용 그룹. 세션 정원·부스 수는 program_sessions·partners가 정본이라
    // 여기에 프로젝트 레벨 사본을 두지 않는다(정본 이원화 방지)
    project.data?.format === 'dms' ? (
      <div data-testid="dms-group" className="rounded-[10px] border border-steel/30 bg-canvas p-4 sm:col-span-2">
        <p className="t-card-title mb-3">DMS 전용</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="ov-audience-model"
            label="청중 모델"
            hint="초청제 승인 게이트는 아직 구현되지 않았습니다 — 등록은 현재 모객형 파이프라인으로 동작합니다(설계서 §25.6)."
          >
            <p id="ov-audience-model" className="ui-input flex items-center bg-card">
              {project.data.audience_model === 'invite' ? '초청제' : '공개 모집'}
            </p>
          </Field>
          <div className="self-end text-[11px] leading-relaxed text-ink-cap">
            세션 정원은 프로그램표(세션별), 부스는 파트너 보드가 정본입니다.
          </div>
        </div>
      </div>
    ) : null

  const quoteLink = () =>
    project.data?.quote_id && linkedQuote.data ? (
      <Link to="/quotes" className="text-[13px] font-medium text-accent-deep hover:underline">
        견적 v{linkedQuote.data.version} 확정 기준 →
      </Link>
    ) : canQuotes && !readOnly ? (
      <QuoteLinkAction projectId={projectId} onLinked={project.reload} />
    ) : null

  const pickedTargeting = TARGETING_AXES.flatMap((axis) => values.targeting[axis.key].map((v) => ({ axis, v })))

  // v2.0 — 모객형 전용: 보장 인원·쇼업 KPI·타겟팅 5축·연결 견적 (일반형이면 숨김·데이터 보존)
  const recruitingBody = () => (
    <div data-testid="recruiting-group" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field id="ov-guarantee" label="보장 인원(게런티)" align="right" hint={changedHint('guaranteePax')}>
          <input
            id="ov-guarantee"
            type="number"
            min={0}
            value={values.guaranteePax}
            onChange={(e) => set('guaranteePax', e.target.value)}
            disabled={readOnly}
            className={`ui-input ui-input-num disabled:opacity-60${tintClass('guaranteePax')}${changedClass('guaranteePax')}`}
          />
        </Field>
        <Field id="ov-kpi" label="쇼업 KPI (%)" align="right" hint={changedHint('kpiShowRate')}>
          <input
            id="ov-kpi"
            type="number"
            min={0}
            max={100}
            value={values.kpiShowRate}
            onChange={(e) => set('kpiShowRate', e.target.value)}
            disabled={readOnly}
            className={`ui-input ui-input-num disabled:opacity-60${tintClass('kpiShowRate')}${changedClass('kpiShowRate')}`}
          />
        </Field>
      </div>
      <TargetingPicker
        picked={pickedTargeting}
        values={values.targeting}
        readOnly={readOnly}
        onToggle={toggleTargeting}
      />
    </div>
  )

  const errorAndReadOnly = (
    <>
      <ErrorAlert message={save.error} />
      {readOnly && <p className="text-xs text-ink-cap">이 화면은 읽기 전용입니다 — 수정은 PM만 할 수 있습니다.</p>}
    </>
  )

  const prefillBanner = prefillFromQuote ? (
    <p
      data-testid="quote-prefill-banner"
      className="rounded-md border border-accent/30 bg-accent-tint px-3 py-2 text-xs text-accent-deep"
    >
      확정 견적에서 채워 둔 값입니다(주황 표시) — 전부 고칠 수 있습니다. 행사 코드는 자동 제안이니 확인해 주세요.
    </p>
  ) : null

  // ── 온보딩 배치 — 넓은 2열 + 선택 항목 접기 ─────────────────────────────
  if (!isSettings) {
    const optionalFilled = OPTIONAL_KEYS.filter((k) => {
      const v = values[k]
      return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''
    }).length
    // 값이 들어 있는 선택 항목(견적 프리필 등)은 접어서 가리지 않는다
    const open = optionalOpen ?? optionalFilled > 0
    return (
      <form onSubmit={handleSubmit} className="space-y-6 text-sm">
        {prefillBanner}
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-[0.02em] text-ink-sub">무엇을</p>
            {nameField('')}
            {codeField()}
            {eventTypeField('포맷(컨퍼런스·전시 등)은 3단계에서 고릅니다')}
            {headcountField()}
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-[0.02em] text-ink-sub">언제 · 어디서</p>
            {startDateField()}
            {endDateField('하루 행사면 비워 두세요')}
            <div className="grid grid-cols-2 gap-3">
              {startTimeField()}
              {endTimeField()}
            </div>
            {venueField('', "미정이면 '(가안)'을 붙여 두세요")}
          </div>
        </div>

        {values.eventType === 'recruiting' && (
          <section aria-label="모객 설정" className="space-y-3 rounded-[10px] border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-card-title">모객 설정</p>
              {quoteLink()}
            </div>
            {recruitingBody()}
          </section>
        )}

        <div className="rounded-[10px] bg-canvas px-4 py-3" data-testid="optional-fields">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">선택 항목 {OPTIONAL_KEYS.length}개</span>
              <span className="t-caption">
                {OPTIONAL_KEYS.map((k) => FIELD_META[k].label).join(' · ')} — 지금 비워 둬도 됩니다
              </span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOptionalOpen(!open)}>
              {open ? '접기' : '펼치기'}
            </button>
          </div>
          {open && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {seatingField()}
              {textField('theme', 'ov-theme', '주제(슬로건)')}
              {textField('organizer', 'ov-organizer', '주최·주관')}
              {textField('mcName', 'ov-mc', '사회자')}
              {textField('targetAudience', 'ov-audience', '참가 대상', 'sm:col-span-2')}
              {itemsField('sm:col-span-2')}
            </div>
          )}
        </div>

        {errorAndReadOnly}

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="t-caption">{nextHint}</span>
            <button type="submit" disabled={save.pending} className="btn btn-primary">
              {submitLabel}
            </button>
          </div>
        )}
      </form>
    )
  }

  // ── 설정 배치 — 섹션 목록 + 섹션 카드 + 고정 저장 바 ─────────────────────
  const sections: { id: SectionId; label: string; caption: string; body: ReactNode; action?: ReactNode }[] = [
    {
      id: 'basic',
      label: '기본 정보',
      caption: '필수 2',
      body: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {nameField()}
          {codeField()}
          {eventTypeField('바꿔도 등록 데이터는 지워지지 않고 화면에서만 숨겨집니다. 일정(WBS) 다시 펼치기는 일정 화면에서 합니다.')}
          {formatRow()}
          {dmsGroup()}
        </div>
      ),
    },
    {
      id: 'schedule',
      label: '일정·장소',
      caption: '필수 2',
      body: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {startDateField()}
          {endDateField()}
          {startTimeField()}
          {endTimeField()}
          {venueField('sm:col-span-2')}
          {headcountField()}
          {seatingField()}
        </div>
      ),
    },
    {
      id: 'content',
      label: '내용',
      caption: '선택 · 운영계획서 개요에 들어갑니다',
      body: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {textField('theme', 'ov-theme', '주제(슬로건)')}
          {textField('organizer', 'ov-organizer', '주최·주관')}
          {textField('mcName', 'ov-mc', '사회자')}
          {textField('targetAudience', 'ov-audience', '참가 대상')}
          {itemsField('sm:col-span-2')}
        </div>
      ),
    },
    ...(values.eventType === 'recruiting'
      ? [
          {
            id: 'recruiting' as const,
            label: '모객 설정',
            caption: '모객형 행사에만 보입니다',
            action: quoteLink(),
            body: recruitingBody(),
          },
        ]
      : []),
  ]

  const changedIn = (id: SectionId) => changed.filter((k) => FIELD_META[k].section === id).length

  const jumpTo = (id: SectionId) => {
    setActiveSection(id)
    document.getElementById(`ov-sec-${id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  return (
    <form onSubmit={handleSubmit} className="text-sm">
      <div className="grid items-start gap-6 lg:grid-cols-[176px_minmax(0,1fr)]">
        <nav aria-label="개요 섹션" className="sticky top-6 hidden flex-col gap-0.5 pt-1 lg:flex">
          {sections.map((s) => {
            const n = changedIn(s.id)
            const active = activeSection === s.id
            return (
              <button
                key={s.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => jumpTo(s.id)}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  active ? 'bg-track font-semibold text-ink' : 'font-medium text-brown hover:bg-track'
                }`}
              >
                {s.label}
                {n > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent-tint px-1.5 text-[11px] font-semibold text-accent-deep" title={`바뀐 칸 ${n}개`}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {prefillBanner}
          {sections.map((s) => {
            const n = changedIn(s.id)
            return (
              <section key={s.id} id={`ov-sec-${s.id}`} aria-labelledby={`ov-sec-${s.id}-title`} className="ui-card scroll-mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h2 id={`ov-sec-${s.id}-title`} className="t-card-title">
                      {s.label}
                    </h2>
                    <span className="t-caption">
                      {s.caption}
                      {n > 0 ? ` · 변경 ${n}` : ''}
                    </span>
                  </div>
                  {s.action}
                </div>
                <div className="p-5">{s.body}</div>
              </section>
            )
          })}
          {errorAndReadOnly}
        </div>
      </div>

      {/* 고정 저장 바 — 바꾼 칸이 있을 때만. 화면 아래에 붙어 있다가 폼 끝에서 제자리에 선다 */}
      {!readOnly && dirty && (
        <div
          role="region"
          aria-label="저장하지 않은 변경"
          data-testid="save-bar"
          className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-strong bg-card py-3 pl-5 pr-4 shadow-lg"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
            <b className="font-semibold text-ink">저장하지 않은 변경 {changed.length}개</b>
            <span className="t-caption text-ink-sub">{changed.map((k) => FIELD_META[k].label).join(' · ')}</span>
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={handleReset} className="btn btn-ghost">
              변경 취소
            </button>
            <button type="submit" disabled={save.pending} className="btn btn-primary">
              {submitLabel}
            </button>
          </span>
        </div>
      )}
      {!readOnly && !dirty && savedAt && (
        <p role="status" data-testid="saved-note" className="t-caption mt-4 text-right">
          저장됨 {savedAt}
        </p>
      )}
    </form>
  )
}

/** 타겟팅 5축 — 고른 조건은 칩으로 요약하고, '조건 편집'을 누르면 전체 목록이 열린다(캔버스 모객 설정) */
function TargetingPicker({
  picked,
  values,
  readOnly,
  onToggle,
}: {
  picked: { axis: (typeof TARGETING_AXES)[number]; v: string }[]
  values: Targeting
  readOnly: boolean
  onToggle: (axis: keyof Targeting, option: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="space-y-2" data-testid="targeting">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-caption">타겟팅 · 고른 조건 {picked.length}개</p>
        {!readOnly && (
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? '편집 닫기' : '조건 편집'}
          </button>
        )}
      </div>
      {picked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {picked.map(({ axis, v }) => (
            <span
              key={`${axis.key}-${v}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-canvas px-2.5 text-[13px] text-ink"
            >
              <span className="t-caption">{axis.short}</span>
              {v}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-cap">아직 고른 조건이 없습니다.</p>
      )}
      <p className="text-[11px] text-ink-cap">기업 규모·직급·업종·직무·근무 지역 5축 — 조건 편집을 누르면 전체 목록이 열립니다</p>
      {editing && (
        <div className="space-y-3 rounded-[10px] border border-border p-3">
          {TARGETING_AXES.map((axis) => (
            <div key={axis.key}>
              <p className="mb-1 text-[11px] font-medium text-ink-cap">{axis.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {axis.options.map((option) => {
                  const active = values[axis.key].includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onToggle(axis.key, option)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
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
      )}
    </div>
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
      {/* 액션 줄 인라인 셀렉트 — Field로 감싸지 않되 컨트롤 재질(셰브론)은 정본을 따른다(§2) */}
      <select
        className="ui-input ui-select min-h-8 py-1 text-xs"
        value={quoteId}
        onChange={(e) => setQuoteId(e.target.value)}
        aria-label="연결할 견적"
      >
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
