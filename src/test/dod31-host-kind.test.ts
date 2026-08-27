// DoD-31 (v2.4 §21) — 성격 축.
//
// ① kind='host' 전환 시 파트너 보드·/p 발급 UI 활성 + 발주처 발송 UI 숨김 — UI 왕복은
//    kind-axis.test.tsx(3.15b)가 화면으로 증명한다. 여기서는 데이터 계층의 무손실(R-H1)과
//    발송 경로 차단을 provider로 재확인한다.
// ② 주최형 데모 행사에서 HT 템플릿이 파트너 5 × partner_submit 인스턴스로 전개된다.
import { describe, expect, it } from 'vitest'
import { PARTNER_DEMO_TOKEN, PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { HOST_TEMPLATE } from '../fixtures/wbsTemplates'
import { mockProvider } from './testUtils'

const PARTNER_COUNT = 5

describe('DoD-31 ② HT 템플릿 전개 — partner_submit은 파트너별 인스턴스', () => {
  it('partner_submit 코드는 파트너 수만큼, host_notice·internal은 단일 인스턴스다', async () => {
    const provider = mockProvider()
    const tasks = await provider.listWbsTasks(PROJECT_ID_HOST)

    for (const tpl of HOST_TEMPLATE) {
      const instances = tasks.filter((t) => t.code === tpl.code)
      if (tpl.direction === 'partner_submit') {
        expect(instances, tpl.code).toHaveLength(PARTNER_COUNT)
        // 파트너별로 독립 인스턴스 — partner_id가 전부 다르고 비어 있지 않다
        const partnerIds = new Set(instances.map((t) => t.partner_id))
        expect(partnerIds.size).toBe(PARTNER_COUNT)
        expect([...partnerIds].every(Boolean)).toBe(true)
        // 마감 전개와 동시에 inbound 산출물이 연결된다(§5.1 '제출 요청됨' 자동 생성)
        expect(instances.every((t) => t.linked_deliverable_id !== null)).toBe(true)
      } else {
        expect(instances, tpl.code).toHaveLength(1)
        expect(instances[0].partner_id).toBeNull()
      }
    }
  })
})

describe('DoD-31 ① kind 전환 — 표시 계층만, 데이터 무손실 (R-H1)', () => {
  it('host→agency→host 왕복 후 파트너·등급·태스크·제출물·포털이 그대로다', async () => {
    const provider = mockProvider()
    const before = {
      partners: (await provider.listPartners(PROJECT_ID_HOST)).length,
      tiers: (await provider.listPartnerTiers(PROJECT_ID_HOST)).length,
      tasks: (await provider.listWbsTasks(PROJECT_ID_HOST)).length,
      items: (await provider.listDeliverables(PROJECT_ID_HOST)).length,
    }
    expect(before.partners).toBe(PARTNER_COUNT)
    expect(before.tiers).toBe(3)

    await provider.updateProject(PROJECT_ID_HOST, { kind: 'agency' })
    expect((await provider.getProject(PROJECT_ID_HOST)).kind).toBe('agency')
    // 대행형으로 내려도 어떤 행도 삭제되지 않는다
    expect((await provider.listPartners(PROJECT_ID_HOST)).length).toBe(before.partners)
    expect((await provider.listPartnerTiers(PROJECT_ID_HOST)).length).toBe(before.tiers)
    expect((await provider.listWbsTasks(PROJECT_ID_HOST)).length).toBe(before.tasks)
    expect((await provider.listDeliverables(PROJECT_ID_HOST)).length).toBe(before.items)

    await provider.updateProject(PROJECT_ID_HOST, { kind: 'host' })
    expect((await provider.getProject(PROJECT_ID_HOST)).kind).toBe('host')
    // 복귀 후 파트너 포털도 그대로 동작한다
    const portal = await provider.getPartnerPortal(PARTNER_DEMO_TOKEN)
    expect(portal.submission_items.length).toBeGreaterThan(0)
  })

  it('주최형에서 파트너 inbound 항목은 발주처 컨펌 발송 대상이 되지 않는다', async () => {
    // UI는 발송 버튼 자체를 숨긴다(kind-axis.test.tsx). 데이터 계층에서도 §5 전이표가 막는다 —
    // inbound 항목은 draft·internal_review를 쓰지 않으므로(§5.1) pending_approval 발송 전제인
    // internal_review 상태에 도달할 수 없고, requested 상태에서의 발송은 전이표 밖이라 409다.
    const provider = mockProvider()
    const items = await provider.listDeliverables(PROJECT_ID_HOST)
    const requestedInbound = items.find((d) => d.partner_id !== null && d.status === 'requested')!
    expect(requestedInbound).toBeTruthy()
    await expect(
      provider.requestApproval(requestedInbound.id, { version_id: 'ver-none' }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/conflict|not_found|validation/) })
  })
})
