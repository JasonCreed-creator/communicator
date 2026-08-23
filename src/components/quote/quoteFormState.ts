// S-2 견적 에디터 폼 상태 — RememberQuoteConfigurator.tsx의 스텝 상태·결합 규칙(up/tog)을
// 분해 이식(§17.2). 엔진 산출은 QuoteInput → computeQuoteOutputs 단일 경로만 사용한다.
import type { Quote, QuoteAdjustment, QuoteInput, Targeting } from '../../types/entities'
import { calcVenueRental, TARGET_MIN } from '../../modules/quote/engine/calcEstimate'
import { clampVenueIndex } from '../../modules/quote/engine/venueOptions'
import type { QuoteStrings } from './quoteStrings'

// 모객(게런티) 하방 해제 — S-2는 1명부터 (KPI 게이지는 40명 이상 구간에서만 표시). RQC LEAD_MIN 승계
export const LEAD_MIN = 1

export interface EditorVenue {
  venue_id: string | null
  name: string
  hall: string
  date: string
  rental: number
}

export interface QuoteFormState {
  eventName: string
  eventDate: string
  eventEndDate: string
  startTime: string
  endTime: string
  /** 행사 성격 7종 (data/eventTypes 값) */
  eventNature: string
  includeLeads: boolean
  target: number
  guarantee: number
  genAttendees: number
  venues: EditorVenue[]
  venueSelected: number
  displayType: 'led' | 'projector'
  options: Record<string, boolean>
  boothCount: number
  boothPremiumCount: number
  boothUnitPrice: number | ''
  boothPremiumUnitPrice: number | ''
  souvenirPrice: number | ''
  souvenirQty: number | ''
  targeting: Targeting
  clientCompany: string
  contactName: string
  contactEmail: string
  manager: string
  notes: string
  adjust: Record<string, number>
}

export const EMPTY_TARGETING: Targeting = {
  company_size: [],
  title: [],
  industry: [],
  job: [],
  region: [],
}

export function newEditorVenue(rental = 0): EditorVenue {
  return { venue_id: null, name: '', hall: '', date: '', rental }
}

export function emptyForm(): QuoteFormState {
  return {
    eventName: '',
    eventDate: '',
    eventEndDate: '',
    startTime: '',
    endTime: '',
    eventNature: '컨퍼런스',
    includeLeads: true,
    target: 50,
    guarantee: 45,
    genAttendees: 0,
    venues: [newEditorVenue(calcVenueRental(50))],
    venueSelected: 0,
    displayType: 'projector',
    options: {},
    boothCount: 0,
    boothPremiumCount: 0,
    boothUnitPrice: '',
    boothPremiumUnitPrice: '',
    souvenirPrice: '',
    souvenirQty: '',
    targeting: structuredClone(EMPTY_TARGETING),
    clientCompany: '',
    contactName: '',
    contactEmail: '',
    manager: '',
    notes: '',
    adjust: {},
  }
}

/** 저장된 QuoteInput → 에디터 폼 (새 버전 편집 진입) */
export function formFromInput(input: QuoteInput): QuoteFormState {
  const venues: EditorVenue[] = (input.venues ?? []).map((v) => ({
    venue_id: v.venue_id ?? null,
    name: v.name ?? '',
    hall: v.hall ?? '',
    date: v.date ?? '',
    rental: Number(v.rental) || 0,
  }))
  const adjust: Record<string, number> = {}
  for (const a of input.adjustments ?? []) {
    if (a.delta) adjust[a.key] = (adjust[a.key] ?? 0) + a.delta
  }
  return {
    eventName: input.event_name ?? '',
    eventDate: input.event_date ?? '',
    eventEndDate: input.event_end_date ?? '',
    startTime: input.start_time ?? '',
    endTime: input.end_time ?? '',
    eventNature: input.event_type ?? '기타',
    includeLeads: !!input.include_leads,
    target: input.headcount || TARGET_MIN,
    guarantee: input.guarantee || LEAD_MIN,
    genAttendees: input.gen_attendees ?? 0,
    venues: venues.length > 0 ? venues : [newEditorVenue(calcVenueRental(input.headcount || 50))],
    venueSelected: clampVenueIndex(
      venues.map((v) => ({ name: v.name, date: v.date, rental: v.rental })),
      input.selected_venue?.index ?? 0,
    ),
    displayType: input.display_type === 'led' ? 'led' : 'projector',
    options: { ...(input.options ?? {}) },
    boothCount: input.booth_count ?? 0,
    boothPremiumCount: input.booth_premium_count ?? 0,
    boothUnitPrice: input.booth_unit_price ?? '',
    boothPremiumUnitPrice: input.booth_premium_unit_price ?? '',
    souvenirPrice: input.souvenir_price ?? '',
    souvenirQty: input.souvenir_qty ?? '',
    targeting: input.targeting ? structuredClone(input.targeting) : structuredClone(EMPTY_TARGETING),
    clientCompany: input.client_company ?? '',
    contactName: input.contact?.name ?? '',
    contactEmail: input.contact?.email ?? '',
    manager: input.manager ?? '',
    notes: input.notes ?? '',
    adjust,
  }
}

export function formFromQuote(quote: Quote): QuoteFormState {
  return formFromInput(quote.input)
}

/** 에디터 폼 → 저장용 QuoteInput 스냅샷 (§4-18) — provider가 엔진으로 재계산해 저장 */
export function formToInput(form: QuoteFormState): QuoteInput {
  const idx = clampVenueIndex(
    form.venues.map((v) => ({ name: v.name, date: v.date, rental: v.rental })),
    form.venueSelected,
  )
  const venues = form.venues.map((v) => ({
    venue_id: v.venue_id,
    name: v.name,
    hall: v.hall || null,
    date: v.date || null,
    rental: Number(v.rental) || 0,
  }))
  const selected = venues[idx] ? { ...venues[idx], index: idx } : null
  const adjustments: QuoteAdjustment[] = (['s1', 's2', 's3', 's4', 'ot', 'leadPkg'] as const)
    .filter((k) => Math.round(Number(form.adjust[k]) || 0) !== 0)
    .map((k) => ({ key: k, delta: Math.round(Number(form.adjust[k]) || 0) }))
  const hasTargeting = Object.values(form.targeting).some((v) => v.length > 0)
  return {
    event_name: form.eventName.trim(),
    event_date: form.eventDate || null,
    event_end_date: form.eventEndDate || null,
    start_time: form.startTime || null,
    end_time: form.endTime || null,
    event_type: form.eventNature || null,
    include_leads: form.includeLeads,
    headcount: form.target,
    guarantee: form.includeLeads ? form.guarantee : 0,
    venues,
    selected_venue: selected,
    options: { ...form.options },
    display_type: form.displayType,
    targeting: hasTargeting ? structuredClone(form.targeting) : null,
    client_company: form.clientCompany.trim() || null,
    contact:
      form.contactName.trim() || form.contactEmail.trim()
        ? { name: form.contactName.trim() || null, email: form.contactEmail.trim() || null }
        : null,
    manager: form.manager.trim() || null,
    notes: form.notes.trim() || null,
    adjustments,
    booth_count: form.boothCount,
    booth_premium_count: form.boothPremiumCount,
    booth_unit_price: form.boothUnitPrice === '' ? null : form.boothUnitPrice,
    booth_premium_unit_price: form.boothPremiumUnitPrice === '' ? null : form.boothPremiumUnitPrice,
    souvenir_price: form.souvenirPrice === '' ? null : form.souvenirPrice,
    souvenir_qty: form.souvenirQty === '' ? null : form.souvenirQty,
    gen_attendees: form.genAttendees,
  }
}

// ── RQC up() 결합 규칙 이식 — target/guarantee/displayType 변경 시 부수 규칙 ──
export function applyFieldRules(prev: QuoteFormState, key: string, value: unknown): QuoteFormState {
  const next: QuoteFormState = { ...prev, [key]: value } as QuoteFormState
  if (key === 'target') {
    const tv = Number(value)
    // 선택된 베뉴의 대관료만 인원 기준 자동 재산정 (다른 후보는 수동 입력 유지)
    const selIdx = clampVenueIndex(
      prev.venues.map((v) => ({ name: v.name, date: v.date, rental: v.rental })),
      prev.venueSelected,
    )
    next.venues = prev.venues.map((ve, i) => (i === selIdx ? { ...ve, rental: calcVenueRental(tv) } : ve))
    if (next.guarantee > tv) next.guarantee = tv
    if (next.guarantee < LEAD_MIN) next.guarantee = LEAD_MIN
    // 100명 이상 + LED면 LED 오퍼레이팅이 시스템에 자동 포함 — 옵션 중복 청구 방지.
    if (tv >= 100 && next.displayType === 'led') {
      const { ledOperating: _omit, ...rest } = next.options || {}
      next.options = rest
    }
  }
  if (key === 'guarantee') {
    next.guarantee = Math.max(LEAD_MIN, Math.min(Number(value), next.target))
  }
  if (key === 'displayType' && value === 'led') {
    // LED 오퍼레이팅만 자동 선택된다. 중계는 절대 자동 선택하지 않는다 —
    // LED를 쓰면서 중계 없이 진행하는 것이 정상 시나리오이기 때문.
    if (prev.target < 100) next.options = { ...next.options, ledOperating: true }
    else {
      const { ledOperating: _omit, ...rest } = next.options || {}
      next.options = rest
    }
  }
  if (key === 'displayType' && value === 'projector') {
    // 중계 2종은 LED 전용 — 프로젝터 전환 시 해제 (엔진도 미과금 이중 방어).
    // 전체 녹화·편집은 중계 종속이므로 함께 해제한다.
    const { screenRelay: _s, onlineRelay: _o, fullRecording: _r, ...rest } = next.options || {}
    next.options = rest
  }
  return next
}

/** 모객 포함 전환 시 순수 응대 대행 옵션(rsvpHandling)은 개념 중복이라 해제한다 (RQC 승계) */
export function applyIncludeLeads(prev: QuoteFormState, on: boolean): QuoteFormState {
  const next = { ...prev, includeLeads: on }
  if (on && prev.options?.rsvpHandling) {
    const { rsvpHandling: _omit, ...rest } = prev.options
    next.options = rest
  }
  return next
}

/** 옵션 카탈로그 (RQC OPTS 이식 — 단가는 엔진 단일 출처, 여기엔 표시용만) */
export interface OptCatalogItem {
  id: string
  icon: string
  group: 'media' | 'photowall' | null
  dyn?: 'souvenir' | 'rsvp'
  pureOnly: boolean
  ledOnly?: boolean
  /** 중계 옵션(화면중계·온라인중계) 선행 필수 */
  relayOnly?: boolean
  ko: { label: string; price: string; detail: string }
  en: { label: string; price: string; detail: string }
}

export const OPT_CATALOG: OptCatalogItem[] = [
  { id: 'souvenir', icon: '🎁', group: null, dyn: 'souvenir', pureOnly: false,
    ko: { label: '기념품', price: '인당 5만원', detail: '참가자 기념품 1인 50,000원 + 쇼핑백 · 수량은 목표 인원 자동 연동' },
    en: { label: 'Souvenir', price: 'KRW 50,000/pax', detail: 'Attendee gift + bag · quantity auto-linked to headcount' } },
  { id: 'rsvpHandling', icon: '📇', group: null, dyn: 'rsvp', pureOnly: true,
    ko: { label: 'RSVP 응대 대행', price: '인당 2만원(평균)', detail: '전체 참석 직접 응대(초청·확정·문의) — 게런티 보장 아님' },
    en: { label: 'RSVP Handling', price: 'KRW 20,000/pax (avg.)', detail: 'Direct handling of all attendees — not a guarantee' } },
  { id: 'emcee', icon: '🎤', group: null, pureOnly: false,
    ko: { label: '사회자', price: '150만원', detail: '기업회의(국제회의)급 전문 사회자' },
    en: { label: 'MC / Host', price: 'KRW 1,500,000', detail: 'Corporate-grade professional host' } },
  { id: 'photo', icon: '📷', group: 'media', pureOnly: false,
    ko: { label: '사진촬영', price: '80만원', detail: '단체사진 보정 + 세션별 스틸컷 · 1일 기준' },
    en: { label: 'Photography', price: 'KRW 800,000', detail: 'Group + per-session stills · per day' } },
  { id: 'video', icon: '🎬', group: 'media', pureOnly: false,
    ko: { label: '동영상 촬영', price: '200만원', detail: '현장 스케치영상 촬영+편집 · 3~5분' },
    en: { label: 'Videography', price: 'KRW 2,000,000', detail: 'On-site sketch video + editing · 3–5 min' } },
  { id: 'aving', icon: '📸', group: 'media', pureOnly: false,
    ko: { label: 'AVING 미디어 패키지', price: '250만원', detail: '사진+스케치영상(1일 상주) + 국문·영문 보도 각 1회' },
    en: { label: 'AVING Media Package', price: 'KRW 2,500,000', detail: 'Photo + video (1-day) + KR/EN press releases' } },
  { id: 'ledOperating', icon: '🖥️', group: null, pureOnly: false,
    ko: { label: 'LED 오퍼레이팅', price: '250만원', detail: 'LED 운용 자체 비용 — V-mix 스위칭 + 전담 엔지니어 (1일)\n※ 중계 비용은 포함되어 있지 않습니다. LED만 쓰고 중계 없이 진행할 수 있습니다.' },
    en: { label: 'LED Operating', price: 'KRW 2,500,000', detail: 'Cost of running the LED itself — V-mix switching + dedicated engineer (1 day)\n※ Relay cost is NOT included. You can run LED with no relay at all.' } },
  { id: 'screenRelay', icon: '📡', group: null, pureOnly: false, ledOnly: true,
    ko: { label: '화면중계', price: '200만원', detail: '카메라 최소 2대 + 영상 스위칭 + 중계 오퍼레이터 (1일)\n※ LED 오퍼레이팅과 별개 비용 — LED 전용' },
    en: { label: 'Live Screen Relay', price: 'KRW 2,000,000', detail: 'Min. 2 cameras + video switching + relay operator (1 day)\n※ Separate from LED Operating — LED only' } },
  { id: 'onlineRelay', icon: '🌐', group: null, pureOnly: false, ledOnly: true,
    ko: { label: '온라인중계', price: '+150만원', detail: '외부 온라인 송출 + 중계녹화 — 카메라 최소 3대 + 인코딩·송출 시스템\n※ 화면중계와 내용이 다른 별개 항목. 화면중계 위에 얹히는 구성이라 함께 적용 — 합계 350만원 · LED 전용' },
    en: { label: 'Online Relay', price: '+KRW 1,500,000', detail: 'External online streaming + relay recording — min. 3 cameras + encoding/streaming\n※ A different deliverable from Live Screen Relay. Builds on it, so it is applied together — KRW 3,500,000 total · LED only' } },
  { id: 'fullRecording', icon: '🎥', group: null, pureOnly: false, relayOnly: true,
    ko: { label: '전체 녹화·편집', price: '100만원', detail: '전 세션 풀 녹화 + 세션별 편집본 (스케치 영상과 별개)\n※ 중계 시스템 선행 필수 — 화면중계 또는 온라인중계' },
    en: { label: 'Full Recording & Edit', price: 'KRW 1,000,000', detail: 'All sessions recorded + edited per session (separate from the sketch video)\n※ Requires a relay system first — Live Screen Relay or Online Relay' } },
  { id: 'survey', icon: '📊', group: null, pureOnly: false,
    ko: { label: '사후설문조사', price: '100만원', detail: '설문 설계 + 통계분석 보고서 제출' },
    en: { label: 'Post-event Survey', price: 'KRW 1,000,000', detail: 'Survey design + analysis report' } },
  { id: 'photowall_basic', icon: '📸', group: 'photowall', pureOnly: false,
    ko: { label: '포토월 (일반형)', price: '50만원', detail: 'I배너 형태 · 키비주얼 적용 · 설치·철거 포함' },
    en: { label: 'Photo Wall (Basic)', price: 'KRW 500,000', detail: 'I-banner style · install/removal incl.' } },
  { id: 'photowall_premium', icon: '🖼️', group: 'photowall', pureOnly: false,
    ko: { label: '포토월 (고급형)', price: '200만원', detail: '목공월 · 고급 마감 + 키비주얼 · 설치·철거 포함' },
    en: { label: 'Photo Wall (Premium)', price: 'KRW 2,000,000', detail: 'Carpentry-built · premium finish' } },
]

/** RQC tog() 이식 — 라디오 그룹·LED 게이트·스케일러 자동 포함 규칙. notice = 인라인 안내 문구 */
export function toggleOption(
  prev: QuoteFormState,
  id: string,
  t: QuoteStrings,
): { state: QuoteFormState; notice: string | null } {
  const opt = OPT_CATALOG.find((o) => o.id === id)
  const turningOn = !prev.options[id]
  // 중계 2종은 LED 디스플레이 필수 (LED가 중계를 강제하지는 않는 단방향 종속)
  if (opt?.ledOnly && prev.displayType !== 'led' && turningOn) {
    return { state: prev, notice: t.relayLockToast }
  }
  // 전체 녹화·편집은 중계 시스템 선행 필수
  const relayOn = !!prev.options.screenRelay || !!prev.options.onlineRelay
  if (opt?.relayOnly && !relayOn && turningOn) {
    return { state: prev, notice: t.recordingGateToast }
  }
  if (id === 'ledOperating' && prev.displayType === 'led' && prev.options.ledOperating) {
    return { state: prev, notice: t.ledLockToast }
  }
  if (id === 'ledOperating' && prev.target >= 100) {
    return { state: prev, notice: t.scalerAutoToast }
  }
  // 온라인중계가 켜져 있는 동안 화면중계는 해제 불가 (기반 시스템)
  if (id === 'screenRelay' && !turningOn && prev.options.onlineRelay) {
    return { state: prev, notice: t.screenRelayOffToast }
  }
  const next = { ...prev.options }
  let notice: string | null = null
  // 온라인중계 ON → 기반이 되는 화면중계도 함께 적용 (합계 350만원)
  if (id === 'onlineRelay' && turningOn && !next.screenRelay) {
    next.screenRelay = true
    notice = t.onlineRelayOnToast
  }
  if (opt && opt.group === 'media') {
    OPT_CATALOG.filter((o) => o.group === 'media' && o.id !== id).forEach((o) => {
      next[o.id] = false
    })
  }
  if (opt && opt.group === 'photowall') {
    OPT_CATALOG.filter((o) => o.group === 'photowall' && o.id !== id).forEach((o) => {
      next[o.id] = false
    })
  }
  next[id] = !next[id]
  // 중계가 전부 꺼지면 중계 종속 옵션(전체 녹화·편집)도 함께 해제 — 엔진 미과금과 UI 표시 일치
  if (!(next.screenRelay || next.onlineRelay) && next.fullRecording) {
    next.fullRecording = false
    notice = t.recordingAutoOffToast
  }
  return { state: { ...prev, options: next }, notice }
}

// ── 표시 헬퍼 ──
export function fmtWon(n: number, en: boolean): string {
  return en ? `KRW ${(n ?? 0).toLocaleString('en-US')}` : `${(n ?? 0).toLocaleString('ko-KR')}원`
}

export function fmtMoney(n: number, en: boolean): string {
  return en ? `KRW ${(n ?? 0).toLocaleString('en-US')}` : `${Math.round((n ?? 0) / 1e4).toLocaleString()}만원`
}
