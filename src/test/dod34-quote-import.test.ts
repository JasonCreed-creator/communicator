// DoD-34 (v2.4 §22) — 견적서 임포트.
//
// ① 가상 픽스처 3종(A·B·C형)이 섹션·항목·헤더·검산 일치로 파싱된다 — 수치 단위의 정밀 검증은
//    modules/quote/import/__tests__/parser.test.ts(3.15d)가 담당하고, 여기서는 DoD 문장 단위로
//    재확인한다.
// ② confirm 없이 quotes가 생성되는 경로가 없다(R-Q1).
// ③ 분배 4종이 각각 동작하고, 보드 시드는 금액 키를 포함하지 않는다.
// ④ 임포트 견적은 '임포트' 배지 근거인 source='imported'를 갖는다(배지 렌더는
//    quote-import-wizard.test.tsx가 담당).
import { describe, expect, it } from 'vitest'
import {
  A_EXPECTED,
  B_EXPECTED,
  C_EXPECTED,
  syntheticQuoteA,
  syntheticQuoteB,
  syntheticQuoteC,
} from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import { parseQuoteWorkbook } from '../modules/quote/import/parser'
import { mockProvider } from './testUtils'

/** 응답 객체 트리의 모든 key 수집 (dod30 관례) */
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

describe('DoD-34 ① 가상 픽스처 3종 파싱 — 서식·섹션·항목·검산', () => {
  it('A형: 단가×수량×일수 검산과 총액 체인이 맞는다', async () => {
    const doc = parseQuoteWorkbook(await syntheticQuoteA(), 'synthetic-a.xlsx')
    expect(doc.format).toBe('A')
    expect(doc.sections).toHaveLength(A_EXPECTED.sections)
    expect(doc.checks.length).toBeGreaterThan(0)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
  })

  it('B형: 5-1 섹션·총액 미포함 옵션 행 구조가 맞는다', async () => {
    const doc = parseQuoteWorkbook(await syntheticQuoteB(), 'synthetic-b.xlsx')
    expect(doc.format).toBe('B')
    expect(doc.sections).toHaveLength(B_EXPECTED.sections)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
  })

  it('C형: 패키지형 열 구조가 맞는다', async () => {
    const doc = parseQuoteWorkbook(await syntheticQuoteC(), 'synthetic-c.xlsx')
    expect(doc.format).toBe('C')
    expect(doc.sections).toHaveLength(C_EXPECTED.sections)
    expect(doc.checks.every((c) => c.ok)).toBe(true)
  })
})

describe('DoD-34 ②~④ 확인 큐·분배·배지 근거', () => {
  it('R-Q1: importQuoteFile은 견적을 만들지 않는다 — confirm만 만든다', async () => {
    const provider = mockProvider()
    const before = (await provider.listQuotes()).length

    const imported = await provider.importQuoteFile('synthetic-a.xlsx', await syntheticQuoteA())
    expect(imported.status).toBe('detected')
    expect(imported.quote_id).toBeNull()
    expect((await provider.listQuotes()).length).toBe(before)

    const quote = await provider.confirmQuoteImport(imported.id, { mapping: imported.mapping })
    expect((await provider.listQuotes()).length).toBe(before + 1)
    expect(quote.source).toBe('imported') // ④ '임포트' 배지의 근거 필드
  })

  it('분배 4종 — 견적 등록·행사 프리필·정산 기준·보드 시드(금액 키 미포함)', async () => {
    const provider = mockProvider()
    const imported = await provider.importQuoteFile('synthetic-c.xlsx', await syntheticQuoteC())
    const quote = await provider.confirmQuoteImport(imported.id, { mapping: imported.mapping })
    // 정산 기준은 확정 견적만(§22.4) — 위저드와 같은 순서로 확정 후 분배
    await provider.finalizeQuote(quote.id)
    const result = await provider.distributeQuoteImport(imported.id, {
      project_prefill: true,
      settlement_base: true,
      board_seed: true,
    })

    // ① 견적 등록 — confirm 시점에 이미 됐다(위 테스트). ② 행사 프리필
    expect(result.project_id).not.toBeNull()
    const project = await provider.getProject(result.project_id!)
    expect(project.quote_id).toBe(quote.id) // §16 상호 링크
    expect(project.onboarded_at).toBeNull() // 프리필 — S0은 사람이 완료한다

    // ③ 정산 기준 — 버킷 스냅숏이 생겼다
    expect(result.settlement_created).toBe(true)
    const board = await provider.getSettlementBoard(result.project_id!)
    expect(board).not.toBeNull()
    expect(board!.buckets.length).toBeGreaterThan(0)

    // ④ 보드 시드 — 항목이 생기되 금액 키는 어떤 형태로도 담기지 않는다
    expect(result.deliverables_seeded).toBeGreaterThan(0)
    const seeded = (await provider.listDeliverables(result.project_id!)).filter(
      (d) => d.status === 'requested' || d.status === 'draft',
    )
    expect(seeded.length).toBeGreaterThan(0)
    const found = new Set<string>()
    collectKeys(seeded, found)
    for (const banned of ['amount', 'unit_price', 'total_amount', 'quote_amount', 'breakdown']) {
      expect([...found], banned).not.toContain(banned)
    }
    // 시드 항목 텍스트(brief·spec)에도 원 단위 금액 문자열이 실리지 않는다
    const serialized = JSON.stringify(seeded)
    expect(serialized).not.toMatch(/₩|원\s*\d|\d{1,3}(,\d{3}){2,}/)
  })

  it('임포트 재분배는 1회 한정 — distributed 이후 재실행은 409', async () => {
    const provider = mockProvider()
    const imported = await provider.importQuoteFile('synthetic-b.xlsx', await syntheticQuoteB())
    const quote = await provider.confirmQuoteImport(imported.id, { mapping: imported.mapping })
    expect(quote.source).toBe('imported')
    await provider.distributeQuoteImport(imported.id, {})
    await expect(provider.distributeQuoteImport(imported.id, {})).rejects.toMatchObject({
      code: 'conflict',
    })
  })
})
