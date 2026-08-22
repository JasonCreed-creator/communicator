// v2.0 견적 픽스처 — 샘플 행사 연결 3버전(v3 확정·v2 제안·v1 보관) + 행사 미연결 초안 1건.
// #RULE-NO-COMPANY: 전부 가상 명칭. 금액은 하드코딩하지 않고 엔진(computeQuoteOutputs)으로 산출 —
// "breakdown은 엔진 재계산과 일치해야 함"(§4-18)이 픽스처에서도 성립하도록.
import type { Quote, QuoteInput } from '../types/entities'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'

/** 행사 미연결 견적("견적만 있음 · 행사 미생성" 셀렉터 그룹 검증용).
 *  주의: mock nextId('quo')가 quo-101부터 발급하므로 픽스처 ID는 100 미만 대역을 쓴다. */
export const UNLINKED_QUOTE_ID = 'quo-010'
/** 샘플 행사의 확정 견적 (projects.quote_id와 상호 링크) */
export const FINAL_QUOTE_ID = 'quo-003'

const BASE_INPUT: Omit<QuoteInput, 'headcount' | 'guarantee' | 'venues' | 'selected_venue' | 'options'> = {
  event_name: '샘플 테크 컨퍼런스 2026',
  event_date: '2026-10-22',
  event_end_date: '2026-10-22',
  start_time: '09:30',
  end_time: '17:00',
  event_type: '컨퍼런스',
  include_leads: true,
  display_type: 'led',
  targeting: {
    company_size: ['대기업', '중견기업'],
    title: ['임원', '부장'],
    industry: ['IT/통신'],
    job: ['경영/전략/기획'],
    region: ['서울특별시'],
  },
  client_company: '가상재단',
  contact: { name: '한담당', email: 'client@example.com' },
  manager: '김기획',
  notes: '파트너사·미디어·일반 참관객',
  adjustments: [],
}

const VENUE = { venue_id: null, name: '가상컨벤션센터', hall: '3F 그랜드볼룸', date: '2026-10-22', rental: 36_000_000 }

const INPUT_V1: QuoteInput = {
  ...BASE_INPUT,
  headcount: 250,
  guarantee: 80,
  venues: [{ ...VENUE, hall: null, rental: 45_000_000 }],
  selected_venue: { ...VENUE, hall: null, rental: 45_000_000, index: 0 },
  options: {},
  display_type: 'projector',
}

const INPUT_V2: QuoteInput = {
  ...BASE_INPUT,
  headcount: 300,
  guarantee: 100,
  venues: [VENUE],
  selected_venue: { ...VENUE, index: 0 },
  options: { souvenir: true, emcee: true },
}

const INPUT_V3: QuoteInput = {
  ...BASE_INPUT,
  headcount: 300,
  guarantee: 80,
  venues: [VENUE],
  selected_venue: { ...VENUE, index: 0 },
  options: { souvenir: true, emcee: true, video: true },
  booth_count: 3,
}

const UNLINKED_INPUT: QuoteInput = {
  event_name: '파트너 서밋 2026',
  event_date: '2026-12-10',
  event_end_date: null,
  start_time: '14:00',
  end_time: '18:00',
  event_type: '세미나',
  include_leads: true,
  headcount: 150,
  guarantee: 60,
  venues: [{ venue_id: null, name: '가상호텔 서울', hall: '볼룸 A', date: '2026-12-10', rental: 27_000_000 }],
  selected_venue: { venue_id: null, name: '가상호텔 서울', hall: '볼룸 A', date: '2026-12-10', rental: 27_000_000, index: 0 },
  options: { emcee: true },
  display_type: 'projector',
  targeting: { company_size: ['중소기업', '스타트업'], title: ['대표', '임원'], industry: [], job: [], region: ['서울특별시'] },
  client_company: '가상파트너스',
  contact: { name: '문리더', email: 'partner-lead@example.com' },
  manager: '김기획',
  notes: '파트너사 대표·임원 초청',
  adjustments: [],
}

function buildQuote(
  id: string,
  projectId: string | null,
  version: number,
  input: QuoteInput,
  over: Partial<Quote>,
): Quote {
  const { breakdown, total_amount } = computeQuoteOutputs(input)
  return {
    id,
    project_id: projectId,
    title: input.event_name,
    version,
    status: 'draft',
    is_final: false,
    locked_at: null,
    superseded_by: null,
    input,
    breakdown,
    total_amount,
    created_by: 'usr-pm',
    created_at: '2026-08-05T09:00:00.000Z',
    updated_at: '2026-08-05T09:00:00.000Z',
    ...over,
  }
}

/** 픽스처 견적 4건 — 호출 시점에 엔진으로 금액 산출 (독립 사본) */
export function createFixtureQuotes(sampleProjectId: string): Quote[] {
  return [
    buildQuote('quo-001', sampleProjectId, 1, INPUT_V1, {
      status: 'archived',
      superseded_by: 'quo-002',
      created_at: '2026-08-05T09:00:00.000Z',
      updated_at: '2026-08-10T09:00:00.000Z',
    }),
    buildQuote('quo-002', sampleProjectId, 2, INPUT_V2, {
      status: 'proposed',
      superseded_by: FINAL_QUOTE_ID,
      created_at: '2026-08-10T09:00:00.000Z',
      updated_at: '2026-08-12T09:00:00.000Z',
    }),
    buildQuote(FINAL_QUOTE_ID, sampleProjectId, 3, INPUT_V3, {
      status: 'accepted',
      is_final: true,
      locked_at: '2026-08-12T10:00:00.000Z',
      created_at: '2026-08-12T09:00:00.000Z',
      updated_at: '2026-08-12T10:00:00.000Z',
    }),
    buildQuote(UNLINKED_QUOTE_ID, null, 1, UNLINKED_INPUT, {
      status: 'draft',
      created_at: '2026-08-20T09:00:00.000Z',
      updated_at: '2026-08-20T09:00:00.000Z',
    }),
  ]
}
