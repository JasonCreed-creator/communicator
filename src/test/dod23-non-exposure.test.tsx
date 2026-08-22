/** @vitest-environment jsdom */
// DoD-23 (v2.0) — 금액 비노출: quotes·breakdown·total_amount 키가 발주처 경로(/c/*)·운영계획서
// 조립 데이터·활동 로그의 런타임 객체 어디에도 없다 + 발주처·plan 컴포넌트 소스 grep 가드.
// 정본 = 설계서 §12(4중 차단)·§17.3-3.
import { describe, expect, it } from 'vitest'
import { DEMO_TOKEN } from '../fixtures/sampleProject'
import { mockProvider } from './testUtils'

const provider = mockProvider()

const BANNED_KEYS = new Set(['quotes', 'breakdown', 'total_amount'])

/** 런타임 객체 트리의 모든 key를 수집 (배열·중첩 포함) */
function collectKeys(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      found.add(key)
      collectKeys(inner, found)
    }
  }
}

function bannedKeysIn(value: unknown): string[] {
  const found = new Set<string>()
  collectKeys(value, found)
  return [...found].filter((k) => BANNED_KEYS.has(k))
}

describe('DoD-23 금액 비노출 (런타임 객체)', () => {
  it('발주처 컨펌 큐(/c/{token}/queue) 응답에 금액 키가 없다', async () => {
    const queue = await provider.getClientQueue(DEMO_TOKEN)
    expect(bannedKeysIn(queue)).toEqual([])
  })

  it('발주처 현황(/c/{token}/status) 응답에 금액 키가 없다', async () => {
    const status = await provider.getClientStatus(DEMO_TOKEN)
    expect(bannedKeysIn(status)).toEqual([])
  })

  it('운영계획서 조립 데이터(getPlan)에 금액 키가 없다 — 견적 연결 행사(①) 기준', async () => {
    const plan = await provider.getPlan('prj-stc26')
    // ①은 quote_id로 확정 견적과 연결되어 있지만, 조립 데이터에는 금액 키가 흐르지 않는다
    expect(plan.project.quote_id).not.toBeNull()
    expect(bannedKeysIn(plan)).toEqual([])
  })

  it('견적 확정·핸드오프 이후에도 활동 로그에 금액 키가 없다', async () => {
    // 견적 이벤트를 실제로 발생시킨 뒤 로그를 검사한다 (sales 권한 픽스처 기본)
    const draft = await provider.createQuote({
      event_name: '비노출 검증 행사',
      event_date: '2026-12-01',
      event_end_date: null,
      start_time: null,
      end_time: null,
      event_type: '세미나',
      include_leads: true,
      headcount: 100,
      guarantee: 50,
      venues: [{ venue_id: null, name: '가상홀', hall: null, date: null, rental: 18_000_000 }],
      selected_venue: { venue_id: null, name: '가상홀', hall: null, date: null, rental: 18_000_000, index: 0 },
      options: {},
      display_type: 'projector',
      targeting: null,
      client_company: '가상고객',
      contact: null,
      manager: '김기획',
      notes: null,
      adjustments: [],
    })
    const finalized = await provider.finalizeQuote(draft.id)
    const project = await provider.createProjectFromQuote(finalized.id)
    const log = await provider.listActivity(project.id, 50)
    expect(log.length).toBeGreaterThan(0)
    expect(bannedKeysIn(log)).toEqual([])
    // 프로젝트 객체 자체에도 금액 키는 없다 (quote_id 식별자만 — §16)
    expect(bannedKeysIn(project)).toEqual([])
  })
})

describe('DoD-23 금액 비노출 (소스 grep 가드)', () => {
  it('발주처 페이지·plan/client 컴포넌트 소스에 total_amount·breakdown이 없다', () => {
    const sources = {
      ...import.meta.glob('../pages/Client*.tsx', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../components/plan/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../components/client/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
    } as Record<string, string>
    const files = Object.keys(sources)
    expect(files.length).toBeGreaterThan(0)
    for (const [file, src] of Object.entries(sources)) {
      expect(src, `${file}에 금액 키 노출`).not.toMatch(/total_amount|breakdown/)
    }
  })
})
