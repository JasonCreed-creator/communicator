// 견적 → 행사 핸드오프 매핑 — 설계서 부록 §16의 정본 구현.
// POST /quotes/{id}/create-project 가 수행하는 projects ← quotes.input 매핑.
// **금액·섹션 산출(breakdown·total_amount)은 어떤 키로도 넘기지 않는다** (#RULE-NO-PRICE-TO-CLIENT).
import type { OverviewItem, Quote, Targeting } from '../../types/entities'
import type { EventType } from '../../types/enums'
import { venueDisplayName } from './engine/quoteInput'

/** §16 매핑 결과 — projects 필드의 프리필 초안 (S0 ①에서 확인·수정 가능) */
export interface QuoteProjectDraft {
  name: string
  /** 행사명 이니셜+연도 2자리 자동 제안 — S0 ①에서 확인(필수) */
  code_suggestion: string
  event_date: string | null
  event_end_date: string | null
  start_time: string | null
  end_time: string | null
  venue: string | null
  expected_headcount: number | null
  guarantee_pax: number | null
  seating: string | null
  event_type: EventType
  organizer: string | null
  target_audience: string | null
  targeting: Targeting | null
  kpi_show_rate: number | null
  overview_items: OverviewItem[] | null
}

/** 행사 코드 자동 제안: 행사명 단어 이니셜(영문·숫자만)+연도 2자리. 비ASCII뿐이면 'EVT' 폴백 */
export function suggestProjectCode(name: string, eventDate: string | null): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .filter((ch) => /[A-Za-z]/.test(ch))
    .join('')
    .toUpperCase()
  const year = eventDate ? eventDate.slice(2, 4) : ''
  return `${initials || 'EVT'}${year}`
}

/** targeting 5축 → 요약 문장 (§16 target_audience 소스) */
export function targetingSummary(targeting: Targeting | null | undefined): string {
  if (!targeting) return ''
  const axes = [
    targeting.company_size,
    targeting.title,
    targeting.industry,
    targeting.job,
    targeting.region,
  ]
  return axes
    .filter((values) => values && values.length > 0)
    .map((values) => values.join('·'))
    .join(' / ')
}

/** §16 표 그대로의 매핑 — 좌측 projects ← 우측 quotes.input */
export function quoteToProjectDraft(quote: Quote): QuoteProjectDraft {
  const input = quote.input
  const name = input.event_name?.trim() || quote.title
  const selected = input.selected_venue
  const recruiting = !!input.include_leads

  // target_audience = targeting 요약 문장 + notes의 대상 문구
  const summary = targetingSummary(input.targeting)
  const targetAudience =
    [summary, input.notes?.trim()].filter(Boolean).join(' — ') || null

  // overview_items = 행사 성격·담당 매니저·고객 연락처 — 금액 키 없음 (§16)
  const overview: OverviewItem[] = []
  if (input.event_type) overview.push({ label: '행사 성격', value: input.event_type })
  if (input.manager?.trim()) overview.push({ label: '담당 매니저', value: input.manager.trim() })
  const contactBits = [input.contact?.name, input.contact?.email].filter(
    (v): v is string => !!v && v.trim() !== '',
  )
  if (contactBits.length > 0) overview.push({ label: '고객 연락처', value: contactBits.join(' · ') })

  return {
    name,
    code_suggestion: suggestProjectCode(name, input.event_date),
    event_date: input.event_date ?? null,
    event_end_date: input.event_end_date ?? null,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    venue: selected ? venueDisplayName(selected) : null,
    expected_headcount: input.headcount || null,
    guarantee_pax: recruiting ? input.guarantee || null : null,
    // §16: 홀 capacity 좌석 라벨은 선택값이 있을 때만 — S-2 입력은 좌석 형태를 받지 않으므로 null
    seating: null,
    event_type: recruiting ? 'recruiting' : 'general',
    organizer: input.client_company?.trim() || null,
    target_audience: targetAudience,
    targeting: recruiting ? input.targeting ?? null : null,
    kpi_show_rate: recruiting ? 90 : null, // §16 기본 90
    overview_items: overview.length > 0 ? overview : null,
  }
}
