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

// v2.2 DoD-30 — grep 범위를 랜딩(pages/Landing*·lib/landing*)까지 넓히고, 금지 키에 정산
// 식별자를 더한다. `margin`은 **일부러 빼 둔다** — 랜딩 내보내기 HTML의 인라인 CSS에
// `margin:` 선언이 정상적으로 들어 있어 식별자와 구분되지 않기 때문이다. 정산 값이 실제로
// 랜딩 산출물에 실리는지는 dod30 테스트가 만들어진 HTML 문자열로 따로 본다.
// v2.4 DoD-32 — grep 범위를 파트너 경로(pages/Partner*·components/partner·components/partner-portal)
// 까지 넓히고, 금지 키에 `contract_amount`(파트너 확정 계약액 — §21.2 R-H3)를 더한다.
const BANNED_SOURCE_RE =
  /total_amount|quote_amount|breakdown|settlement|ordered_amount|actual_amount|markup|marginBase|finalMargin|contract_amount/

describe('DoD-23·30·32 금액·정산 비노출 (소스 grep 가드)', () => {
  it('발주처·plan·랜딩·파트너 소스에 금액·정산 식별자가 없다', () => {
    const sources = {
      ...import.meta.glob('../pages/Client*.tsx', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../components/plan/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../components/client/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
      // v2.2 — 랜딩은 공개 산출물이라 발주처 경로와 같은 등급으로 본다(§19.7)
      ...import.meta.glob('../pages/Landing*.tsx', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../lib/landing*.ts', { query: '?raw', import: 'default', eager: true }),
      // v2.4 — 파트너 화면(내부 S-11 포함)과 포털은 계약액·정산·견적 금액을 다루지 않는다(R-H3)
      ...import.meta.glob('../pages/Partner*.tsx', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../components/partner/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../components/partner-portal/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
    } as Record<string, string>
    const files = Object.keys(sources)
    expect(files.length).toBeGreaterThan(0)
    // 범위가 실제로 넓어졌는지 — 글롭이 조용히 0건이 되면 가드가 무력해진다
    expect(files.filter((f) => /Landing|landing/.test(f)).length).toBeGreaterThan(0)
    expect(files.filter((f) => /Partner|partner/.test(f)).length).toBeGreaterThan(5)
    for (const [file, src] of Object.entries(sources)) {
      expect(src, `${file}에 금액·정산 식별자 노출`).not.toMatch(BANNED_SOURCE_RE)
    }
  })
})
