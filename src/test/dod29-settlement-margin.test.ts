// DoD-29 (v2.2 §19.1) — 정산 마진.
//
// 증명해야 하는 것 네 가지:
//   ① 확정 견적을 불러오면 버킷 9종이 스냅숏된다 — recruit가 rc/ld로 분리된다
//   ② `마진 기준 계약액 − Σ실집행 = 최종 마진` 항등식이 성립한다
//   ③ has_cost=false 버킷에 발주·실비를 넣으면 422(validation)
//   ④ 리드젠은 마진 기준 계약액에서 빠지되 **화면 목록에는 남는다**
//
// 마진 식 자체의 실물 검산은 settlement-math.test.ts가 따로 잠근다.
import { describe, expect, it } from 'vitest'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { mockProvider } from './testUtils'

const SAMPLE = 'prj-stc26'
/** 세팅만 끝나고 정산 보드가 없는 행사(RE:BUILD 27) — "확정 견적에서 시작" 빈 상태 */
const NO_BOARD = 'prj-rebuild27'

describe('DoD-29 ① 버킷 스냅숏', () => {
  it('픽스처 보드에 견적 버킷 9종이 있고 rc·ld가 갈려 있다', async () => {
    const provider = mockProvider()
    const view = await provider.getSettlementBoard(SAMPLE)
    expect(view).not.toBeNull()
    expect(view!.buckets.map((b) => b.bucket.code)).toEqual([
      's1', 's2', 's3', 's4', 'ot', 'at', 's5', 'rc', 'ld',
    ])
  })

  it('rc·ld 금액이 견적 recruit를 재유도한 값이 아니라 엔진 산출값과 같다', async () => {
    const provider = mockProvider()
    const view = await provider.getSettlementBoard(SAMPLE)
    const quote = await provider.getQuote(view!.board.quote_id!)
    const engine = computeQuoteOutputs(quote.input).result

    const rc = view!.buckets.find((b) => b.bucket.code === 'rc')!.bucket
    const ld = view!.buckets.find((b) => b.bucket.code === 'ld')!.bucket
    expect(rc.quote_amount).toBe(engine.rsvpPkg)
    expect(ld.quote_amount).toBe(engine.showup)
    // 두 값의 합이 견적 breakdown의 recruit다 — 쪼갠 결과가 원본과 어긋나지 않는다
    expect(rc.quote_amount + ld.quote_amount).toBe(quote.breakdown.recruit)
  })

  it('보드가 없는 행사는 null을 돌려준다 — 화면은 빈 상태를 띄운다', async () => {
    const provider = mockProvider()
    expect(await provider.getSettlementBoard(NO_BOARD)).toBeNull()
  })

  it('확정되지 않은 견적으로는 보드를 만들 수 없다', async () => {
    const provider = mockProvider()
    const quotes = await provider.listQuotes()
    const draft = quotes.find((q) => !q.is_final)
    expect(draft).toBeDefined()
    await expect(provider.createSettlementBoard(NO_BOARD, draft!.id)).rejects.toThrow(/확정된 견적/)
  })
})

describe('DoD-29 ② 항등식', () => {
  it('마진 기준 계약액 − Σ실집행 = 최종 마진', async () => {
    const provider = mockProvider()
    const t = (await provider.getSettlementBoard(SAMPLE))!.totals
    expect(t.identityOk).toBe(true)
    expect(t.marginBase - t.totalActual).toBe(t.finalMargin)
  })

  it('실비를 새로 넣어도 항등식이 유지된다', async () => {
    const provider = mockProvider()
    const before = (await provider.getSettlementBoard(SAMPLE))!
    const s3 = before.buckets.find((b) => b.bucket.code === 's3')!
    await provider.createSettlementItem(SAMPLE, s3.bucket.id, {
      title: '추가 사이니지',
      actual_amount: 500_000,
    })
    const after = (await provider.getSettlementBoard(SAMPLE))!
    expect(after.totals.identityOk).toBe(true)
    expect(after.totals.totalActual).toBe(before.totals.totalActual + 500_000)
    expect(after.totals.finalMargin).toBe(before.totals.finalMargin - 500_000)
  })
})

describe('DoD-29 ③ 원가 없는 버킷은 금액을 받지 않는다', () => {
  it('has_cost=false 버킷에 발주·실비를 넣으면 422', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(SAMPLE))!
    for (const code of ['s5', 'rc', 'ld']) {
      const bucket = view.buckets.find((b) => b.bucket.code === code)!.bucket
      expect(bucket.has_cost).toBe(false)
      await expect(
        provider.createSettlementItem(SAMPLE, bucket.id, { title: '금지', actual_amount: 1 }),
      ).rejects.toMatchObject({ code: 'validation' })
      await expect(
        provider.createSettlementItem(SAMPLE, bucket.id, { title: '금지', ordered_amount: 1 }),
      ).rejects.toMatchObject({ code: 'validation' })
    }
  })

  it('금액 없는 항목은 원가 없는 버킷에도 넣을 수 있다 — 기록 자체는 막지 않는다', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(SAMPLE))!
    const s5 = view.buckets.find((b) => b.bucket.code === 's5')!.bucket
    const item = await provider.createSettlementItem(SAMPLE, s5.id, {
      title: '기획료 산정 메모',
    })
    expect(item.actual_amount).toBeNull()
    // 집계에는 여전히 들어가지 않는다
    const after = (await provider.getSettlementBoard(SAMPLE))!
    expect(after.buckets.find((b) => b.bucket.code === 's5')!.actual).toBe(0)
  })
})

describe('DoD-29 ④ 리드젠은 빠지되 남는다', () => {
  it('마진 기준 계약액에서 제외되고 excluded 목록에 남는다', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(SAMPLE))!
    const ld = view.buckets.find((b) => b.bucket.code === 'ld')!

    expect(ld.bucket.is_margin_base).toBe(false)
    // 화면 목록에는 그대로 있다 (숨기지 않는다)
    expect(view.buckets.some((b) => b.bucket.code === 'ld')).toBe(true)
    expect(view.totals.excluded.map((e) => e.code)).toEqual(['ld'])
    expect(view.totals.excluded[0].amount).toBe(ld.bucket.quote_amount)

    const inBase = view.buckets
      .filter((b) => b.bucket.is_margin_base)
      .reduce((s, b) => s + b.bucket.quote_amount, 0)
    expect(view.totals.marginBase).toBe(inBase)
  })
})

describe('DoD-29 ⑤ 견적 초과는 막지 않고 표시한다 (R-S8)', () => {
  it('실집행이 견적을 넘어도 저장되고 over_budget으로 잡힌다', async () => {
    const provider = mockProvider()
    const view = (await provider.getSettlementBoard(SAMPLE))!
    const s2 = view.buckets.find((b) => b.bucket.code === 's2')!
    expect(s2.over_budget).toBe(true)
    expect(s2.markup).toBeLessThan(0)
    expect(view.totals.overBudgetCount).toBeGreaterThan(0)
  })
})
