/** @vitest-environment jsdom */
// DoD 48 (v2.6 §25 / Phase 3.18b) — 판매 플래너 · 판매 상품 · tier.price 비노출.
//
// 등급 단가(tier.price)는 contract_amount와 같은 등급의 내부 금액이다(§25.8). 파트너 포털은
// **자기 등급의 단가조차** 볼 이유가 없다 — 계약서가 그 역할을 한다. dod32와 같은 대조군
// 방식으로, 내부 경로에는 값이 실재함을 먼저 보인 뒤 포털·발주처 응답에서 0건임을 증명한다.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PARTNER_DEMO_TOKEN, PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { mockProvider, renderRoute } from './testUtils'

/** 응답 객체 트리의 모든 key 수집 (dod30·dod32 관례) */
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

const BANNED_KEYS = new Set(['price', 'contract_amount', 'total_amount', 'breakdown', 'margin'])

afterEach(cleanup)

describe('DoD 48 판매 플래너 (v2.6 §25)', () => {
  it('대조군: 내부 경로의 등급에는 판매 단가·세션 슬롯·부스 포함이 실재한다', async () => {
    const tiers = await mockProvider().listPartnerTiers(PROJECT_ID_HOST)
    expect(tiers).toHaveLength(3)
    expect(tiers.every((t) => t.price !== null && t.price > 0)).toBe(true)
    expect(tiers.some((t) => t.session_slots > 0)).toBe(true)
    expect(tiers.every((t) => t.booth_included)).toBe(true)
  })

  it('/p 응답 트리에 price·contract_amount 등 금액 키가 0건이다 (§25.8)', async () => {
    const portal = await mockProvider().getPartnerPortal(PARTNER_DEMO_TOKEN)
    const found = new Set<string>()
    collectKeys(portal, found)
    expect([...found].filter((k) => BANNED_KEYS.has(k))).toEqual([])

    // 값 기준 이중 확인 — 키 이름을 바꿔 실어도 걸린다
    const tiers = await mockProvider().listPartnerTiers(PROJECT_ID_HOST)
    const serialized = JSON.stringify(portal)
    for (const t of tiers) {
      expect(serialized, `단가 노출: ${t.code}`).not.toContain(String(t.price))
    }
  })

  it('판매 플래너 탭은 복합 게이트다 — 주최형 + 판매형 포맷일 때만 뜬다(§25.1 권한 ③)', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    expect(await screen.findByRole('button', { name: '판매 플래너' })).toBeTruthy()
    cleanup()

    // format은 dms인 채로 kind만 대행형으로 내리면 탭이 사라진다 — format 단독 게이트가 아니다
    await mockProvider().updateProject(PROJECT_ID_HOST, { kind: 'agency' })
    renderRoute('/partners')
    await screen.findByText('파트너 보드')
    expect(screen.queryByRole('button', { name: '판매 플래너' })).toBeNull()
    await mockProvider().updateProject(PROJECT_ID_HOST, { kind: 'host' })
  })

  it('② 시뮬레이션이 만석 기준·확정 매출과 제외 사유를 함께 보여준다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    fireEvent.click(await screen.findByRole('button', { name: '판매 플래너' }))
    fireEvent.click(await screen.findByRole('button', { name: '다음' }))

    const table = await screen.findByRole('table', { name: '등급별 판매 계획' })
    // 픽스처: DIAMOND 1×8,000만 + GOLD 3×4,000만 = 2억 (SILVER는 정원 무제한이라 제외)
    expect(within(table).getAllByText('200,000,000원').length).toBeGreaterThan(0)
    // 제외된 등급을 숨기지 않고 이유를 적는다
    expect(screen.getByTestId('planner-excluded-note').textContent).toContain('silver')
  })

  it('③ 프리셋 확인이 DMS 운영 프리셋 5줄을 보여주고 트랙을 저장한다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    fireEvent.click(await screen.findByRole('button', { name: '판매 플래너' }))
    fireEvent.click(await screen.findByRole('button', { name: '다음' }))
    fireEvent.click(await screen.findByRole('button', { name: '다음' }))

    const notes = await screen.findByTestId('planner-ops-notes')
    expect(within(notes).getAllByRole('listitem')).toHaveLength(5)
    expect(notes.textContent).toContain('Q&A는 운영하지 않습니다.')

    const sessions = await mockProvider().listProgramSessions(PROJECT_ID_HOST)
    if (sessions.length > 0) {
      const first = sessions[0]
      const input = await screen.findByLabelText(`${first.title} 트랙`)
      fireEvent.blur(input, { target: { value: 'Back-office' } })
      await waitFor(async () => {
        const after = await mockProvider().listProgramSessions(PROJECT_ID_HOST)
        expect(after.find((s) => s.id === first.id)?.track).toBe('Back-office')
      })
    }
  })

  it('운영 프리셋이 있는 포맷은 운영가이드에 "진행 원칙" 섹션이 함께 시드된다 (§25.4)', async () => {
    const provider = mockProvider()
    const guide = await provider.createDeliverable({
      project_id: PROJECT_ID_HOST,
      area: 'ops',
      category: '운영가이드',
      title: '운영가이드(시드 검증)',
    })
    const seeded = await provider.seedGuideFromSources(guide.id)
    expect(seeded[0].title).toBe('진행 원칙')
    expect(seeded[0].content).toContain('발표 시간은 세션당 40분입니다.')
    expect(seeded[0].source_ref).toBeNull() // 연동 출처가 아니라 프리셋 시드다 — stale 판정 대상이 아니다
    expect(seeded.map((s) => s.kind)).toEqual(['custom', 'zone', 'role', 'emergency', 'contacts'])
  })

  it('HT-3(참관객 이용권·경품)만 별도 카테고리로 전개된다 (§25.5 benefit)', async () => {
    const items = await mockProvider().listDeliverables(PROJECT_ID_HOST)
    const partnerItems = items.filter((d) => d.partner_id !== null)
    const benefit = partnerItems.filter((d) => d.category === '경품·이용권')
    expect(benefit.length).toBeGreaterThan(0)
    expect(benefit.every((d) => d.title.startsWith('참관객 이용권·경품 제안 제출'))).toBe(true)
    // 나머지 파트너 제출물은 기존 카테고리 그대로 — 이관이 아니라 추가다
    expect(partnerItems.some((d) => d.category === '파트너 제출')).toBe(true)
  })
})
