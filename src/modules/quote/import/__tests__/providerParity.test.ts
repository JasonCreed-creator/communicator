/** @vitest-environment jsdom */
// 파서 ↔ provider 정합. 규칙표가 두 곳(여기 buckets.ts, MockProvider의 private 복사본)에 있는 동안
// 결과가 갈라지지 않게 상시 대조한다 — 갈라지면 확인 큐가 보여주는 매핑과 저장되는 매핑이 달라진다.
import { describe, expect, it } from 'vitest'
import { MockProvider } from '../../../../providers/mock/MockProvider'
import { mapSectionsToBuckets } from '../buckets'
import { parseQuoteWorkbook } from '../parser'
import { syntheticQuoteA, syntheticQuoteB, syntheticQuoteC } from './fixtures/syntheticQuotes'

describe('importQuoteFile — 실제 파서 경유', () => {
  it('세 서식 모두 provider의 기본 매핑이 파서 모듈의 매핑과 일치한다', async () => {
    const p = new MockProvider()
    p.setAppRole('sales')
    for (const [name, make] of [
      ['가상견적_A형.xlsx', syntheticQuoteA],
      ['가상견적_B형.xlsx', syntheticQuoteB],
      ['가상견적_C형.xlsx', syntheticQuoteC],
    ] as const) {
      const buffer = await make()
      const imp = await p.importQuoteFile(name, buffer)
      expect(imp.status).toBe('detected')
      expect(imp.quote_id).toBeNull()
      expect(imp.format).toBe(imp.parsed.format)
      expect(imp.mapping).toEqual(mapSectionsToBuckets(parseQuoteWorkbook(buffer, name)))
    }
  }, 20_000)

  it('임포트만으로는 quotes가 생기지 않는다(R-Q1)', async () => {
    const p = new MockProvider()
    p.setAppRole('sales')
    const before = await p.listQuotes()
    await p.importQuoteFile('가상견적_A형.xlsx', await syntheticQuoteA())
    expect((await p.listQuotes()).length).toBe(before.length)
  }, 20_000)

  it('확정하면 파싱 총액(공급가 기준)이 견적 total_amount로 들어간다', async () => {
    const p = new MockProvider()
    p.setAppRole('sales')
    const imp = await p.importQuoteFile('가상견적_A형.xlsx', await syntheticQuoteA())
    const quote = await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    expect(quote.source).toBe('imported')
    // A형 가상 픽스처: VAT 포함 123,000,000 − VAT 11,181,818 = 111,818,182
    expect(quote.total_amount).toBe(111_818_182)
    expect(quote.breakdown.subtotal).toBe(111_818_182)
  }, 20_000)
})
