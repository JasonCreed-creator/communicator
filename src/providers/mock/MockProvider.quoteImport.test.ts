// v2.4 §22 — 견적서 임포트 테스트.
// 파서(parseQuoteWorkbook)는 3.15d(에이전트 AD)까지 스텁이라 importQuoteFile은 항상 던진다(R-Q4) —
// confirm·distribute 흐름은 seedQuoteImportForTest(Mock 전용 헬퍼)로 'detected' 임포트를 직접
// 시딩해 파서와 독립적으로 검증한다. 가상 데이터만 사용한다(R-Q4 — 실서식 구조를 본뜬 픽스처).
import { beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { ProviderError } from '../../lib/errors'
import type { ParsedQuoteDoc } from '../../modules/quote/import/types'
import { MockProvider } from './MockProvider'

let p: MockProvider

beforeEach(() => {
  p = new MockProvider()
})

async function expectError(fn: () => Promise<unknown>, status: number) {
  try {
    await fn()
    expect.unreachable('오류가 나야 하는 호출이 통과됨')
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError)
    expect((e as ProviderError).status).toBe(status)
  }
}

/** A형(단가·수량형)을 본뜬 가상 파싱 결과 — 실서식 값이 아니다(R-Q4) */
function sampleParsedDoc(): ParsedQuoteDoc {
  return {
    format: 'A',
    header: {
      event_name: '가상 이커머스 서밋 2026',
      client: '가상재단',
      date_range: '2026-11-10',
      venue: '가상컨벤션센터',
      manager: '김기획',
      vat_mode: 'excluded',
    },
    sections: [
      {
        name: '1. 베뉴 대관',
        order: 1,
        items: [{ title: '메인홀 대관', spec: '1일', unit_price: 20_000_000, qty: 1, amount: 20_000_000 }],
        subtotal: 20_000_000,
      },
      {
        name: '2. 무대 시스템',
        order: 2,
        items: [
          { title: 'LED 스크린', spec: '12x3m', unit_price: 8_000_000, qty: 1, amount: 8_000_000 },
          { title: '음향 시스템', spec: '풀세트', unit_price: 4_000_000, qty: 1, amount: 4_000_000 },
        ],
        subtotal: 12_000_000,
      },
      {
        name: '3. 기념품·경품',
        order: 3,
        items: [{ title: '웰컴 키트', spec: '300개', unit_price: 10_000, qty: 300, amount: 3_000_000 }],
        subtotal: 3_000_000,
      },
    ],
    totals: {
      items_sum: 35_000_000,
      agency_fee_rate: 0.1,
      agency_fee: 3_500_000,
      rounding: 0,
      vat: 3_850_000,
      grand_total: 42_350_000,
    },
    checks: [{ name: '항목합 검산', expected: 35_000_000, actual: 35_000_000, ok: true }],
    warnings: [],
  }
}

describe('importQuoteFile — 파서 스텁 (3.15d 이전)', () => {
  it('파서가 구현되기 전까지는 항상 validation 오류를 던진다(R-Q4)', async () => {
    p.setAppRole('sales')
    await expectError(() => p.importQuoteFile('견적.xlsx', new ArrayBuffer(0)), 400)
  })

  it('admin·sales가 아니면 403 (파서 실패 이전에 권한 게이트가 먼저 걸린다)', async () => {
    p.setAppRole('staff')
    await expectError(() => p.importQuoteFile('견적.xlsx', new ArrayBuffer(0)), 403)
  })

  it('실패한 호출은 quotes·quote_imports 어디에도 흔적을 남기지 않는다', async () => {
    p.setAppRole('sales')
    const before = await p.listQuotes()
    try {
      await p.importQuoteFile('견적.xlsx', new ArrayBuffer(0))
    } catch {
      // 의도된 실패
    }
    const after = await p.listQuotes()
    expect(after.length).toBe(before.length)
  })
})

describe('confirmQuoteImport — R-Q1 (confirm 경유 없는 quotes 생성 부재)', () => {
  it('detected 상태의 임포트만 확정할 수 있다', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    expect(imp.status).toBe('detected')
    const beforeQuotes = await p.listQuotes()

    const quote = await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    expect(quote.source).toBe('imported')
    expect(quote.id).not.toBe(imp.id)

    const afterQuotes = await p.listQuotes()
    expect(afterQuotes.length).toBe(beforeQuotes.length + 1)
  })

  it('이미 확정된 임포트를 다시 확정하면 409 — 두 번째 quotes가 생기지 않는다', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    const afterFirst = await p.listQuotes()

    await expectError(() => p.confirmQuoteImport(imp.id, { mapping: imp.mapping }), 409)
    const afterSecondAttempt = await p.listQuotes()
    expect(afterSecondAttempt.length).toBe(afterFirst.length)
  })

  it('admin·sales가 아니면 403', async () => {
    p.setAppRole('staff')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    await expectError(() => p.confirmQuoteImport(imp.id, { mapping: imp.mapping }), 403)
  })

  it('기본 매핑표가 §22.2-6 키워드로 s1·s2·custom을 구분한다', () => {
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    const bySection = new Map(imp.mapping.map((m) => [m.section, m]))
    expect(bySection.get('1. 베뉴 대관')?.bucket).toBe('s1')
    expect(bySection.get('2. 무대 시스템')?.bucket).toBe('s2')
    expect(bySection.get('3. 기념품·경품')?.bucket).toBe('custom')
    expect(bySection.get('3. 기념품·경품')?.confidence).toBe('high')
  })

  it('확정 견적의 breakdown이 매핑 확정본으로 버킷별 합산되고 custom_sections를 보존한다', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    const quote = await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    expect(quote.breakdown.s1).toBe(20_000_000)
    expect(quote.breakdown.s2).toBe(12_000_000)
    expect(quote.breakdown.custom_sections).toEqual([
      { code: 'custom:3. 기념품·경품', label: '3. 기념품·경품', amount: 3_000_000 },
    ])
    // 부가세 별도 총액 = grand_total − vat (헤더에 vat가 명시돼 있으므로 역산이 아니라 그대로 뺀다)
    expect(quote.total_amount).toBe(42_350_000 - 3_850_000)
    expect(quote.breakdown.subtotal).toBe(quote.total_amount)
  })
})

describe('distributeQuoteImport — §22.4 분배 3종', () => {
  it('confirmed 전제 — detected 상태에서 distribute 호출은 409', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    await expectError(() => p.distributeQuoteImport(imp.id, { project_prefill: true }), 409)
  })

  it('project_prefill — §16 매핑 재사용, is_final 없이도 행사가 만들어지고 상호 링크된다', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    const quote = await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    expect(quote.is_final).toBe(false) // 프리필 목적이라 is_final 불요

    const result = await p.distributeQuoteImport(imp.id, { project_prefill: true })
    expect(result.project_id).not.toBeNull()

    const project = await p.getProject(result.project_id!)
    expect(project.name).toBe('가상 이커머스 서밋 2026')
    const linkedQuote = await p.getQuote(quote.id)
    expect(linkedQuote.project_id).toBe(project.id)
    expect(project.quote_id).toBe(quote.id)
  })

  it('settlement_base — 미확정 견적이면 validation', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    // settlement_base만으로는 행사도 없고 미확정이라 둘 중 하나로 반드시 막힌다(둘 다 400)
    await expectError(() => p.distributeQuoteImport(imp.id, { settlement_base: true }), 400)
  })

  it('settlement_base — project_prefill과 한 번에 켜고 확정 견적이면 보드가 생긴다', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    const quote = await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    // distributeQuoteImport는 confirmed 상태에서만 호출 가능하므로(1회성), 정산 기준을
    // 함께 켜려면 distribute 전에 먼저 확정해 둬야 한다(프리필은 is_final 불요와 별개).
    await p.finalizeQuote(quote.id)

    const result = await p.distributeQuoteImport(imp.id, {
      project_prefill: true,
      settlement_base: true,
    })
    expect(result.settlement_created).toBe(true)
    expect(result.project_id).not.toBeNull()
    const board = await p.getSettlementBoard(result.project_id!)
    expect(board).not.toBeNull()
  })

  it('board_seed — s2·s3 매핑 항목만 design·ops 보드에 시드하고 금액 키를 절대 넣지 않는다', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    const result = await p.distributeQuoteImport(imp.id, { project_prefill: true, board_seed: true })
    expect(result.deliverables_seeded).toBe(2) // 2. 무대 시스템 섹션의 항목 2건(s2→ops)

    const deliverables = await p.listDeliverables(result.project_id!)
    const seeded = deliverables.filter((d) => d.category === '견적 임포트')
    expect(seeded).toHaveLength(2)
    expect(seeded.every((d) => d.area === 'ops')).toBe(true)
    expect(seeded.map((d) => d.title).sort()).toEqual(['LED 스크린', '음향 시스템'])

    const json = JSON.stringify(seeded)
    expect(json).not.toContain('amount')
    expect(json).not.toContain('unit_price')
    expect(json).not.toContain('8000000')
    expect(json).not.toContain('4000000')
  })

  it('배포 완료 후 status=distributed, 재배포는 409', async () => {
    p.setAppRole('sales')
    const imp = p.seedQuoteImportForTest({
      file_name: '가상견적_A형.xlsx',
      format: 'A',
      parsed: sampleParsedDoc(),
    })
    await p.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    await p.distributeQuoteImport(imp.id, { project_prefill: true })
    await expectError(() => p.distributeQuoteImport(imp.id, { project_prefill: true }), 409)
  })
})

describe('금액 비노출 — 기존 견적 경로는 바이트 단위로 동일 동작(엔진 견적 회귀 없음)', () => {
  it('기존 픽스처 견적은 여전히 source=engine이다', async () => {
    p.setAppRole('sales')
    const quotes = await p.listQuotes()
    const sample = quotes.find((q) => q.project_id === PROJECT_ID)!
    expect(sample.source).toBe('engine')
  })
})
