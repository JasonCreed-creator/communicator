// v2.4.1(3.15.1 폴리시 — 설계서 v2.5 승계) — provider 계층 검증.
// P2: Project.partner_guide_url·partner_contact_email 왕복 + PartnerPortalData 노출.
// P4: kind='host' 온보딩 완료 시 §15.3b R&R 4카드·§15.3c 컴플라이언스 3종(C-H1~C-H3) 시드,
//     대행형 회귀 없음 + expandHostWbs 백필(비어 있으면 시드·재호출 시 중복 0).
// P6-①: partner_submit WBS 인스턴스의 target = 파트너명, 재전개 후에도 유지 + 기존 보존 규칙 회귀 없음.
import { beforeEach, describe, expect, it } from 'vitest'
import { PARTNER_DEMO_TOKEN, PROJECT_ID_HOST } from '../../fixtures/hostFixtures'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { MockProvider } from './MockProvider'

let p: MockProvider

beforeEach(() => {
  p = new MockProvider() // 매 테스트 독립 픽스처
})

describe('P2 — partner_guide_url·partner_contact_email 왕복 (§21.1)', () => {
  it('대행형 프로젝트는 기본 null', async () => {
    const project = await p.getProject(PROJECT_ID)
    expect(project.partner_guide_url).toBeNull()
    expect(project.partner_contact_email).toBeNull()
  })

  it('updateProject로 저장하면 getProject로 그대로 조회된다', async () => {
    const updated = await p.updateProject(PROJECT_ID, {
      partner_guide_url: 'https://example.com/stc26-guide',
      partner_contact_email: 'partners-stc@example.com',
    })
    expect(updated.partner_guide_url).toBe('https://example.com/stc26-guide')
    expect(updated.partner_contact_email).toBe('partners-stc@example.com')

    const reloaded = await p.getProject(PROJECT_ID)
    expect(reloaded.partner_guide_url).toBe('https://example.com/stc26-guide')
    expect(reloaded.partner_contact_email).toBe('partners-stc@example.com')
  })

  it('null로 되돌릴 수 있다', async () => {
    await p.updateProject(PROJECT_ID, { partner_guide_url: 'https://x.example.com' })
    const cleared = await p.updateProject(PROJECT_ID, {
      partner_guide_url: null,
      partner_contact_email: null,
    })
    expect(cleared.partner_guide_url).toBeNull()
    expect(cleared.partner_contact_email).toBeNull()
  })
})

describe('P2 — getPartnerPortal의 guide_url·contact_email (§21.1)', () => {
  it('주최형 데모 픽스처(가상 서밋 2026)의 값이 포털에 그대로 노출된다', async () => {
    const portal = await p.getPartnerPortal(PARTNER_DEMO_TOKEN)
    expect(portal.guide_url).toBe('https://example.com/vst26-guide')
    expect(portal.contact_email).toBe('partners@example.com')
  })

  it('프로젝트에 값이 없으면 포털도 null', async () => {
    const project = await p.createProject({ name: '가이드 미입력 주최행사', event_date: '2026-12-01' })
    await p.updateProject(project.id, { kind: 'host' })
    const partner = await p.createPartner(project.id, { name: '가상테스트파트너' })
    const token = await p.issuePartnerToken(partner.id, {
      contact_name: '담당자',
      contact_email: 'contact@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    expect(portal.guide_url).toBeNull()
    expect(portal.contact_email).toBeNull()
  })
})

describe('P4 — host 온보딩 완료 시 R&R 4·컴플라이언스 3 시드 (§15.3b·§15.3c)', () => {
  it('신규 host 행사는 완료 시 주최형 R&R 4카드(pm·design·ops·reg)가 시드된다', async () => {
    const project = await p.createProject({ name: '신규 주최 행사', event_date: '2026-12-01' })
    await p.updateProject(project.id, { kind: 'host' })
    await p.completeOnboarding(project.id)

    const charters = await p.listRoleCharters(project.id)
    expect(charters).toHaveLength(4)
    expect(new Set(charters.map((c) => c.role))).toEqual(new Set(['pm', 'design', 'ops', 'reg']))
    expect(charters.find((c) => c.role === 'pm')?.title).toBe('파트너 총괄 PM')
  })

  it('신규 host 행사는 완료 시 컴플라이언스 카드 3종(C-H1~C-H3)이 시드된다', async () => {
    const project = await p.createProject({ name: '신규 주최 행사 2', event_date: '2026-12-01' })
    await p.updateProject(project.id, { kind: 'host' })
    await p.completeOnboarding(project.id)

    const cards = await p.listComplianceCards(project.id)
    expect(cards).toHaveLength(3)
    const titles = cards.map((c) => c.title)
    expect(titles.some((t) => t.includes('C-H1'))).toBe(true)
    expect(titles.some((t) => t.includes('C-H2'))).toBe(true)
    expect(titles.some((t) => t.includes('C-H3'))).toBe(true)
    // ComplianceKind는 internal|client 2종뿐 — 신규 kind를 만들지 않고 internal로 분류했다
    expect(cards.every((c) => c.kind === 'internal')).toBe(true)
  })

  it('대행형 온보딩은 기존 세트 그대로다(회귀) — 모객형 R&R 4·컴플라이언스 2종', async () => {
    const project = await p.createProject({ name: '신규 대행 행사', event_date: '2026-12-01' })
    await p.updateProject(project.id, { event_type: 'recruiting' }) // kind는 기본 'agency'
    await p.completeOnboarding(project.id)

    const charters = await p.listRoleCharters(project.id)
    expect(charters).toHaveLength(4)
    expect(charters.map((c) => c.title)).toEqual(
      expect.arrayContaining(['총괄 PM', '디자인 리드', '운영 리드', '등록·모객 리드']),
    )

    const cards = await p.listComplianceCards(project.id)
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.title)).toEqual(
      expect.arrayContaining(['내부 운영 규약 (역할별 책임)', '고객사 계약 규약']),
    )
  })

  it('기존 대행형 픽스처(샘플 테크 컨퍼런스)의 시드도 그대로다(회귀)', async () => {
    const charters = await p.listRoleCharters(PROJECT_ID)
    expect(charters).toHaveLength(4)
    const cards = await p.listComplianceCards(PROJECT_ID)
    expect(cards).toHaveLength(2)
  })

  it('주최형 데모 픽스처(가상 서밋 2026)는 R&R 4·컴플라이언스 3(C-H1~C-H3)이 이미 시드돼 있다', async () => {
    const charters = await p.listRoleCharters(PROJECT_ID_HOST)
    expect(charters).toHaveLength(4)
    expect(new Set(charters.map((c) => c.role))).toEqual(new Set(['pm', 'design', 'ops', 'reg']))

    const cards = await p.listComplianceCards(PROJECT_ID_HOST)
    expect(cards).toHaveLength(3)
    const titles = cards.map((c) => c.title)
    expect(titles.some((t) => t.includes('C-H1'))).toBe(true)
    expect(titles.some((t) => t.includes('C-H2'))).toBe(true)
    expect(titles.some((t) => t.includes('C-H3'))).toBe(true)
  })
})

describe('P4 — expandHostWbs 백필: 비어 있으면 시드, 재호출 시 중복 0', () => {
  it('R&R·컴플라이언스가 없는 host 행사에서 호출하면 시드되고, 이미 있는 값은 재호출해도 건드리지 않는다', async () => {
    const project = await p.createProject({ name: '백필 대상 행사', event_date: '2026-11-01' })
    await p.updateProject(project.id, { kind: 'host' })
    // completeOnboarding을 거치지 않은 상태 — 이 기능 이전에 온보딩된 host 행사를 흉내
    expect(await p.listRoleCharters(project.id)).toHaveLength(0)
    expect(await p.listComplianceCards(project.id)).toHaveLength(0)

    await p.expandHostWbs(project.id)
    const chartersAfterFirst = await p.listRoleCharters(project.id)
    const cardsAfterFirst = await p.listComplianceCards(project.id)
    expect(chartersAfterFirst).toHaveLength(4)
    expect(cardsAfterFirst).toHaveLength(3)

    // 카드 하나를 체크해 "이미 있으면 건드리지 않는다"를 값 보존으로 증명
    const card = cardsAfterFirst[0]
    const checkedItems = card.items.map((item, i) => (i === 0 ? { ...item, checked: true } : item))
    await p.updateComplianceCard(card.id, { items: checkedItems })

    await p.expandHostWbs(project.id) // 재호출 — 중복 생성 금지
    const chartersAfterSecond = await p.listRoleCharters(project.id)
    const cardsAfterSecond = await p.listComplianceCards(project.id)
    expect(chartersAfterSecond).toHaveLength(4) // 개수 불변(중복 0)
    expect(cardsAfterSecond).toHaveLength(3)
    const cardAfter = cardsAfterSecond.find((c) => c.id === card.id)!
    expect(cardAfter.items[0].checked).toBe(true) // 체크 상태가 살아있다 — 재시드로 덮이지 않았다
  })

  it('이미 시드된 주최형 데모 픽스처를 재전개해도 R&R·컴플라이언스 개수는 그대로다', async () => {
    const before = {
      charters: (await p.listRoleCharters(PROJECT_ID_HOST)).length,
      cards: (await p.listComplianceCards(PROJECT_ID_HOST)).length,
    }
    await p.expandHostWbs(PROJECT_ID_HOST)
    expect((await p.listRoleCharters(PROJECT_ID_HOST)).length).toBe(before.charters)
    expect((await p.listComplianceCards(PROJECT_ID_HOST)).length).toBe(before.cards)
  })
})

describe('P6-① — partner_submit WBS 인스턴스의 target = 파트너명', () => {
  it('픽스처: HT-1 각 인스턴스의 target이 해당 파트너명과 일치한다', async () => {
    const tasks = await p.listWbsTasks(PROJECT_ID_HOST)
    const partners = await p.listPartners(PROJECT_ID_HOST)
    const byId = new Map(partners.map((partner) => [partner.id, partner.name]))
    const ht1 = tasks.filter((t) => t.code === 'HT-1')
    expect(ht1.length).toBeGreaterThan(0)
    for (const task of ht1) {
      expect(task.partner_id).not.toBeNull()
      expect(task.target).toBe(byId.get(task.partner_id!))
    }
  })

  it('host_notice·internal 인스턴스는 target이 null로 유지된다', async () => {
    const tasks = await p.listWbsTasks(PROJECT_ID_HOST)
    const ht2 = tasks.find((t) => t.code === 'HT-2')! // host_notice
    const ht6 = tasks.find((t) => t.code === 'HT-6')! // internal
    expect(ht2.target).toBeNull()
    expect(ht6.target).toBeNull()
  })

  it('재전개 후에도 target이 파트너명으로 유지되고, 기존 보존 규칙(상태·연결·메모)은 회귀하지 않는다', async () => {
    const before = await p.listWbsTasks(PROJECT_ID_HOST)
    const diamondBefore = before.find((t) => t.code === 'HT-1' && t.partner_id === 'ptn-001')!
    expect(diamondBefore.status).toBe('done') // 픽스처: final 상태 파트너

    const reexpanded = await p.expandHostWbs(PROJECT_ID_HOST)
    const diamondAfter = reexpanded.find((t) => t.code === 'HT-1' && t.partner_id === 'ptn-001')!
    expect(diamondAfter.target).toBe('가상다이아텍')
    // §4-15/R-H5 보존 규칙 회귀 없음 — id·상태·연결이 그대로
    expect(diamondAfter.id).toBe(diamondBefore.id)
    expect(diamondAfter.status).toBe('done')
    expect(diamondAfter.linked_deliverable_id).toBe(diamondBefore.linked_deliverable_id)

    const ht2After = reexpanded.find((t) => t.code === 'HT-2')!
    expect(ht2After.target).toBeNull()
  })

  it('새로 전개하는 host 행사에서도 partner_submit target이 파트너명으로 시드된다(픽스처 외 경로)', async () => {
    const project = await p.createProject({ name: '타겟 시드 검증 행사', event_date: '2026-12-15' })
    await p.updateProject(project.id, { kind: 'host' })
    const partner = await p.createPartner(project.id, { name: '가상타겟검증파트너' })
    const tasks = await p.expandHostWbs(project.id)
    const ht1 = tasks.filter((t) => t.code === 'HT-1')
    expect(ht1).toHaveLength(1)
    expect(ht1[0].partner_id).toBe(partner.id)
    expect(ht1[0].target).toBe('가상타겟검증파트너')
  })
})
