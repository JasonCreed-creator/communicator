// DoD-30 (v2.2 §19.4·§19.7) — 정산 부가세 분리 + 정산 비노출.
//
// ① 부가세: `vat_included=true`로 받은 값은 round(v/1.1)로 저장되고 **받은 원본은 보존**된다.
// ② 비노출: 정산 키가 발주처 응답·운영계획서 조립 데이터·랜딩 내보내기 HTML·활동 로그에 없다.
//
// 런타임 키 검사에는 `margin`까지 넣지만, **소스 grep에는 넣지 않는다** — 랜딩 내보내기 HTML의
// 인라인 CSS에 `margin:` 선언이 정상적으로 들어 있어 식별자 검사와 구분되지 않기 때문이다.
// 소스 쪽은 식별자 모양이 분명한 키만 본다(dod23-non-exposure.test.tsx가 담당).
import { describe, expect, it } from 'vitest'
import { DEMO_TOKEN, PROJECT_ID } from '../fixtures/sampleProject'
import { buildLandingHtml } from '../lib/landingExport'
import { mockProvider } from './testUtils'

const SETTLEMENT_KEYS = new Set([
  'settlement',
  'settlement_boards',
  'settlement_buckets',
  'settlement_items',
  'ordered_amount',
  'actual_amount',
  'input_amount_raw',
  'markup',
  'markup_rate',
  'margin',
  'marginBase',
  'finalMargin',
  'marginRate',
])

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

function settlementKeysIn(value: unknown): string[] {
  const found = new Set<string>()
  collectKeys(value, found)
  return [...found].filter((k) => SETTLEMENT_KEYS.has(k))
}

describe('DoD-30 ① 부가세 분리 (§19.4)', () => {
  it('포함으로 받은 값은 별도로 저장되고 원본이 남는다', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(PROJECT_ID))!
    const s3 = view.buckets.find((b) => b.bucket.code === 's3')!

    const item = await provider.createSettlementItem(PROJECT_ID, s3.bucket.id, {
      title: '부가세 포함 입력 항목',
      actual_amount: 1_320_000,
      vat_included_input: true,
    })
    expect(item.actual_amount).toBe(1_200_000)
    expect(item.input_amount_raw).toBe(1_320_000)
    expect(item.vat_included_input).toBe(true)
  })

  it('별도로 받은 값은 그대로 저장되고 원본 필드는 비어 있다', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(PROJECT_ID))!
    const s3 = view.buckets.find((b) => b.bucket.code === 's3')!

    const item = await provider.createSettlementItem(PROJECT_ID, s3.bucket.id, {
      title: '부가세 별도 입력 항목',
      actual_amount: 1_200_000,
    })
    expect(item.actual_amount).toBe(1_200_000)
    expect(item.input_amount_raw).toBeNull()
  })

  it('수정으로 포함 입력을 받아도 같은 규칙으로 분리된다', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(PROJECT_ID))!
    const target = view.buckets.find((b) => b.bucket.code === 's1')!.items[0]

    const updated = await provider.updateSettlementItem(target.id, {
      actual_amount: 23_320_000,
      vat_included_input: true,
    })
    expect(updated.actual_amount).toBe(21_200_000)
    expect(updated.input_amount_raw).toBe(23_320_000)
  })

  it('부가세 분리 후 집계도 별도 기준으로 잡힌다', async () => {
    const provider = mockProvider()
    const before = (await provider.getSettlementBoard(PROJECT_ID))!
    const s3Before = before.buckets.find((b) => b.bucket.code === 's3')!

    await provider.createSettlementItem(PROJECT_ID, s3Before.bucket.id, {
      title: '집계 확인용',
      actual_amount: 1_100_000,
      vat_included_input: true,
    })
    const after = (await provider.getSettlementBoard(PROJECT_ID))!
    const s3After = after.buckets.find((b) => b.bucket.code === 's3')!
    // 1,100,000 / 1.1 = 1,000,000 — 포함가가 아니라 별도가가 더해진다
    expect(s3After.actual - s3Before.actual).toBe(1_000_000)
  })
})

describe('DoD-30 ② 정산 비노출 (§19.7 · R-S9)', () => {
  it('발주처 컨펌 큐에 정산 키가 없다', async () => {
    const provider = mockProvider()
    expect(settlementKeysIn(await provider.getClientQueue(DEMO_TOKEN))).toEqual([])
  })

  it('발주처 현황에 정산 키가 없다', async () => {
    const provider = mockProvider()
    expect(settlementKeysIn(await provider.getClientStatus(DEMO_TOKEN))).toEqual([])
  })

  it('운영계획서 조립 데이터에 정산 키가 없다 — 정산 보드가 있는 행사 기준', async () => {
    const provider = mockProvider()
    expect(await provider.getSettlementBoard(PROJECT_ID)).not.toBeNull()
    expect(settlementKeysIn(await provider.getPlan(PROJECT_ID))).toEqual([])
  })

  it('활동 로그에 정산 키가 없다 — 정산 이벤트를 실제로 발생시킨 뒤에도', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(PROJECT_ID))!
    const s1 = view.buckets.find((b) => b.bucket.code === 's1')!
    await provider.createSettlementItem(PROJECT_ID, s1.bucket.id, { title: '로그 검증용', actual_amount: 10_000 })

    const log = await provider.listActivity(PROJECT_ID, 100)
    expect(log.length).toBeGreaterThan(0)
    expect(settlementKeysIn(log)).toEqual([])
  })

  it('랜딩 내보내기 HTML에 정산 식별자가 없다', async () => {
    const provider = mockProvider()
    const pages = await provider.listLandingPages(PROJECT_ID)
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      const html = buildLandingHtml(page, page.sections)
      // CSS의 `margin:` 선언과 구분되도록 식별자 모양의 키만 본다
      expect(html, `${page.slug}에 정산 식별자 노출`).not.toMatch(
        /settlement|ordered_amount|actual_amount|markup|marginBase|finalMargin/,
      )
    }
  })
})
