// DoD-32 (v2.4 §21) — 파트너 격리.
//
// /p/{token} 응답에는 자기 파트너의 행만 있고(R-H2 — 쿼리 자체에서 제외), contract_amount와
// 견적·정산 금액 키는 응답 어디에도 없다(R-H3). **대조군 방식**: 같은 데이터가 내부 경로
// (listPartners)에는 실제로 존재함을 먼저 보여, "원래 없어서 안 보이는 것"이 아님을 증명한다.
// 화면 렌더 쪽 격리는 partner-portal.test.tsx(3.15c)가 담당한다.
import { describe, expect, it } from 'vitest'
import {
  PARTNER_CHANGES_TOKEN,
  PARTNER_DEMO_TOKEN,
  PROJECT_ID_HOST,
} from '../fixtures/hostFixtures'
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

const BANNED_KEYS = new Set([
  'contract_amount',
  'total_amount',
  'breakdown',
  'quote_amount',
  'ordered_amount',
  'actual_amount',
  'markup',
  'margin',
  'settlement',
])

function bannedKeysIn(value: unknown): string[] {
  const found = new Set<string>()
  collectKeys(value, found)
  return [...found].filter((k) => BANNED_KEYS.has(k))
}

describe('DoD-32 파트너 격리 (R-H2·R-H3, 대조군 방식)', () => {
  it('대조군: 내부 경로에는 5개 파트너와 계약액이 실제로 존재한다', async () => {
    const provider = mockProvider()
    const partners = await provider.listPartners(PROJECT_ID_HOST)
    expect(partners).toHaveLength(5)
    // 내부 데이터에는 계약액이 있다 — 포털에 없다면 그것은 격리의 결과다
    expect(partners.some((p) => p.contract_amount !== null)).toBe(true)
  })

  it('/p 응답에 타 파트너의 어떤 행도 없다 — 이름 문자열 기준 0건', async () => {
    const provider = mockProvider()
    const partners = await provider.listPartners(PROJECT_ID_HOST)
    const portal = await provider.getPartnerPortal(PARTNER_DEMO_TOKEN)
    const serialized = JSON.stringify(portal)

    const others = partners.filter((p) => p.name !== portal.partner_name)
    expect(others).toHaveLength(4)
    for (const other of others) {
      expect(serialized, `타 파트너 노출: ${other.name}`).not.toContain(other.name)
    }
    // 자기 항목만 — 전부 자기 소유 산출물이다
    const all = await provider.listDeliverables(PROJECT_ID_HOST)
    const mine = new Set(
      all.filter((d) => d.partner_id !== null).map((d) => d.id),
    )
    expect(portal.submission_items.every((i) => mine.has(i.deliverable_id))).toBe(true)
  })

  it('/p 응답 객체 트리에 contract_amount·견적·정산 금액 키가 0건이다', async () => {
    const provider = mockProvider()
    for (const token of [PARTNER_DEMO_TOKEN, PARTNER_CHANGES_TOKEN]) {
      const portal = await provider.getPartnerPortal(token)
      expect(bannedKeysIn(portal), token).toEqual([])
      expect(JSON.stringify(portal)).not.toMatch(/contract_amount/)
    }
  })

  it('수정요청 파트너의 포털에는 자기 검토 코멘트가 보이고, 타 파트너는 없다', async () => {
    const provider = mockProvider()
    const portal = await provider.getPartnerPortal(PARTNER_CHANGES_TOKEN)
    const cr = portal.submission_items.find((i) => i.status === 'changes_requested')!
    expect(cr).toBeTruthy()
    expect(cr.comments.length).toBeGreaterThan(0)
    expect(cr.comments.every((c) => c.visibility === 'shared')).toBe(true)
    expect(JSON.stringify(portal)).not.toContain('가상다이아텍')
  })

  it('타 파트너 항목으로의 제출 시도는 거부된다 — 교차 제출 차단', async () => {
    const provider = mockProvider()
    const crPortal = await provider.getPartnerPortal(PARTNER_CHANGES_TOKEN)
    const foreign = crPortal.submission_items[0]
    await expect(
      provider.submitPartnerItem(PARTNER_DEMO_TOKEN, foreign.deliverable_id, {
        text: '교차 제출 시도',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })
})
