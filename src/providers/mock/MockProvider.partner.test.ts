// v2.4 §21 — 주최형(파트너) 확장 테스트. 픽스처는 hostFixtures.ts(가상 서밋 2026, prj-virtual-summit).
import { beforeEach, describe, expect, it } from 'vitest'
import {
  PARTNER_DEMO_TOKEN,
  PARTNER_EXPIRED_TOKEN,
  PARTNER_REVOKED_TOKEN,
  PROJECT_ID_HOST,
} from '../../fixtures/sampleProject'
import { ProviderError } from '../../lib/errors'
import { MockProvider } from './MockProvider'

let p: MockProvider

beforeEach(() => {
  p = new MockProvider() // 매 테스트 독립 픽스처
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

describe('pm 게이트 — 등급·파트너·토큰 CRUD (§8.1)', () => {
  it('등급 등록은 pm만 — design은 403', async () => {
    p.switchUser('usr-design')
    await expectError(() => p.upsertPartnerTier(PROJECT_ID_HOST, { code: 'x', name: 'X' }), 403)
  })

  it('파트너 등록은 pm만 — ops는 403', async () => {
    p.switchUser('usr-ops')
    await expectError(() => p.createPartner(PROJECT_ID_HOST, { name: '새 파트너' }), 403)
  })

  it('토큰 발급·회수는 pm만', async () => {
    p.switchUser('usr-design')
    await expectError(
      () => p.issuePartnerToken('ptn-001', { contact_name: 'x', contact_email: 'x@example.com' }),
      403,
    )
    await expectError(() => p.revokePartnerToken(PARTNER_DEMO_TOKEN), 403)
  })

  it('pm은 등급·파트너를 등록할 수 있다', async () => {
    const tier = await p.upsertPartnerTier(PROJECT_ID_HOST, { code: 'platinum', name: 'PLATINUM' })
    expect(tier.code).toBe('platinum')
    const partner = await p.createPartner(PROJECT_ID_HOST, { name: '가상플래티넘', tier_id: tier.id })
    expect(partner.tier_id).toBe(tier.id)
  })
})

describe('파트너 토큰 — 발급·회수·만료 (§6.2 R-H2 승계)', () => {
  it('회수된 토큰은 410', async () => {
    await expectError(() => p.getPartnerPortal(PARTNER_REVOKED_TOKEN), 410)
  })

  it('만료된 토큰은 410', async () => {
    await expectError(() => p.getPartnerPortal(PARTNER_EXPIRED_TOKEN), 410)
  })

  it('존재하지 않는 토큰은 404', async () => {
    await expectError(() => p.getPartnerPortal('tok-nope'), 404)
  })

  it('발급 시 기본 만료 = 행사일+30일, 회수 시 revoked_at 기록', async () => {
    const token = await p.issuePartnerToken('ptn-005', {
      contact_name: '새담당',
      contact_email: 'new@example.com',
    })
    expect(token.expires_at).toBe('2026-11-14T00:00:00.000Z')
    const revoked = await p.revokePartnerToken(token.token)
    expect(revoked.revoked_at).not.toBeNull()
    await expectError(() => p.getPartnerPortal(token.token), 410)
  })
})

describe('파트너 포털 격리 — 쿼리 자체에서 타 파트너 행 제외 (R-H2·R-H3)', () => {
  it('자기 항목만 보이고 타 파트너명·contract_amount 키가 0건', async () => {
    const portal = await p.getPartnerPortal(PARTNER_DEMO_TOKEN)
    expect(portal.partner_name).toBe('가상다이아텍')
    expect(portal.submission_items.length).toBeGreaterThan(0)

    const json = JSON.stringify(portal)
    // 대조군 — 타 파트너 4곳의 명칭이 응답 트리 어디에도 없어야 한다
    for (const otherName of ['가상골드플랫폼', '가상실버클라우드', '가상실버네트웍스', '가상실버랩스']) {
      expect(json).not.toContain(otherName)
    }
    // §21.2 R-H3 — 금액 키는 구조적으로 없다(타입에도, 직렬화 결과에도)
    expect(json).not.toContain('contract_amount')
    expect(json).not.toContain('total_amount')
    expect(json).not.toContain('breakdown')
  })

  it('내부 코멘트는 파트너 포털에 노출되지 않는다(R-H6)', async () => {
    // ptn-004(수정요청)의 HT-1 항목에 내부 전용 코멘트를 하나 추가한 뒤에도 안 보여야 한다
    const token = await p.issuePartnerToken('ptn-004', {
      contact_name: '내부확인용',
      contact_email: 'check@example.com',
    })
    const before = await p.getPartnerPortal(token.token)
    const ht1 = before.submission_items.find((i) => i.task_code === 'HT-1')!
    p.switchUser('usr-pm')
    await p.addComment(ht1.deliverable_id, { body: '[내부 전용] 협의 중', visibility: 'internal' })
    const after = await p.getPartnerPortal(token.token)
    const json = JSON.stringify(after)
    expect(json).not.toContain('협의 중')
  })

  it('host_notice 안내는 전 파트너에 동일하게 보인다(파트너 소유가 아니므로 격리 대상이 아니다)', async () => {
    const portal = await p.getPartnerPortal(PARTNER_DEMO_TOKEN)
    expect(portal.notices.some((n) => n.task_code === 'HT-2')).toBe(true)
  })
})

describe('제출·재제출·검토 전이 (§5.1, R-H4)', () => {
  it('첫 제출: requested → pending_approval (via partner_submit)', async () => {
    const token = await p.issuePartnerToken('ptn-005', {
      contact_name: '실버랩스담당',
      contact_email: 'silver-labs@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    const item = portal.submission_items.find((i) => i.task_code === 'HT-1')!
    expect(item.status).toBe('requested')

    const updated = await p.submitPartnerItem(token.token, item.deliverable_id, {
      file_name: '로고_소개.pdf',
    })
    expect(updated.status).toBe('pending_approval')
  })

  it('텍스트 제출도 versions 이력으로 남는다', async () => {
    const token = await p.issuePartnerToken('ptn-005', {
      contact_name: '실버랩스담당2',
      contact_email: 'silver-labs-2@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    const item = portal.submission_items.find((i) => i.task_code === 'HT-3')!
    await p.submitPartnerItem(token.token, item.deliverable_id, { text: '이용권 100매·경품 텀블러' })
    p.switchUser('usr-pm')
    const detail = await p.getDeliverable(item.deliverable_id)
    expect(detail.status).toBe('pending_approval')
    expect(detail.content).toBe('이용권 100매·경품 텀블러')
    expect(detail.versions.length).toBeGreaterThan(0)
  })

  it('재제출: changes_requested → pending_approval (via version_upload, host_inbound)', async () => {
    const token = await p.issuePartnerToken('ptn-004', {
      contact_name: '네트웍스담당',
      contact_email: 'networks@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    const item = portal.submission_items.find((i) => i.task_code === 'HT-1')!
    expect(item.status).toBe('changes_requested')

    const updated = await p.submitPartnerItem(token.token, item.deliverable_id, {
      file_name: '로고_재제출.pdf',
    })
    expect(updated.status).toBe('pending_approval')
  })

  it('타 파트너 항목 제출 시도는 403', async () => {
    const tokenA = await p.issuePartnerToken('ptn-005', {
      contact_name: 'A',
      contact_email: 'a@example.com',
    })
    const portalB = await p.getPartnerPortal(PARTNER_DEMO_TOKEN) // ptn-001 소유 항목
    const otherItem = portalB.submission_items.find((i) => i.task_code === 'HT-1')!
    await expectError(
      () => p.submitPartnerItem(tokenA.token, otherItem.deliverable_id, { text: 'x' }),
      403,
    )
  })

  it('검토 승인 → final, 연결 WBS 태스크 자동 done', async () => {
    const token = await p.issuePartnerToken('ptn-005', {
      contact_name: '실버랩스담당3',
      contact_email: 'silver-labs-3@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    const item = portal.submission_items.find((i) => i.task_code === 'HT-1')!
    await p.submitPartnerItem(token.token, item.deliverable_id, { file_name: '제출.pdf' })

    p.switchUser('usr-pm')
    const reviewed = await p.reviewPartnerSubmission(item.deliverable_id, { decision: 'approved' })
    expect(reviewed.status).toBe('final')

    const tasks = await p.listWbsTasks(PROJECT_ID_HOST)
    const linked = tasks.find((t) => t.linked_deliverable_id === item.deliverable_id)!
    expect(linked.status).toBe('done')
  })

  it('수정요청은 코멘트 필수(validation — 이 레포의 오류 코드 체계에선 400) — 있으면 shared로 기록', async () => {
    const token = await p.issuePartnerToken('ptn-005', {
      contact_name: '실버랩스담당4',
      contact_email: 'silver-labs-4@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    const item = portal.submission_items.find((i) => i.task_code === 'HT-1')!
    await p.submitPartnerItem(token.token, item.deliverable_id, { file_name: '제출.pdf' })

    p.switchUser('usr-pm')
    await expectError(
      () => p.reviewPartnerSubmission(item.deliverable_id, { decision: 'changes_requested' }),
      400,
    )
    const reviewed = await p.reviewPartnerSubmission(item.deliverable_id, {
      decision: 'changes_requested',
      comment: '로고 파일 해상도를 높여주세요.',
    })
    expect(reviewed.status).toBe('changes_requested')
    const detail = await p.getDeliverable(item.deliverable_id)
    const comment = detail.comments.find((c) => c.body === '로고 파일 해상도를 높여주세요.')
    expect(comment?.visibility).toBe('shared')
  })

  it('reg는 검토할 수 없다(§6.1 역할-영역 일치 승계)', async () => {
    const token = await p.issuePartnerToken('ptn-005', {
      contact_name: '실버랩스담당5',
      contact_email: 'silver-labs-5@example.com',
    })
    const portal = await p.getPartnerPortal(token.token)
    const item = portal.submission_items.find((i) => i.task_code === 'HT-1')!
    await p.submitPartnerItem(token.token, item.deliverable_id, { file_name: '제출.pdf' })
    p.switchUser('usr-reg')
    await expectError(() => p.reviewPartnerSubmission(item.deliverable_id, { decision: 'approved' }), 403)
  })
})

describe('expandHostWbs — 파트너별 인스턴스 + 재전개 보존 (R-H5)', () => {
  it('HT-1은 partner_submit 5인분 인스턴스로 전개된다', async () => {
    const tasks = await p.listWbsTasks(PROJECT_ID_HOST)
    const ht1 = tasks.filter((t) => t.code === 'HT-1')
    expect(ht1).toHaveLength(5)
    expect(new Set(ht1.map((t) => t.partner_id)).size).toBe(5)
    expect(ht1.every((t) => t.direction === 'partner_submit')).toBe(true)
  })

  it('host_notice·internal은 단일 인스턴스', async () => {
    const tasks = await p.listWbsTasks(PROJECT_ID_HOST)
    expect(tasks.filter((t) => t.code === 'HT-2')).toHaveLength(1)
    expect(tasks.filter((t) => t.code === 'HT-10')).toHaveLength(1)
  })

  it('재전개해도 상태·연결·항목 수가 보존된다', async () => {
    const beforeTasks = await p.listWbsTasks(PROJECT_ID_HOST)
    const beforeDeliverables = await p.listDeliverables(PROJECT_ID_HOST)
    const ht1Before = beforeTasks.filter((t) => t.code === 'HT-1')
    const diamondBefore = ht1Before.find((t) => t.partner_id === 'ptn-001')!
    expect(diamondBefore.status).toBe('done') // 픽스처: final 상태 파트너

    const reexpanded = await p.expandHostWbs(PROJECT_ID_HOST)
    const afterDeliverables = await p.listDeliverables(PROJECT_ID_HOST)
    expect(afterDeliverables.length).toBe(beforeDeliverables.length) // 중복 생성 없음

    const diamondAfter = reexpanded.find((t) => t.code === 'HT-1' && t.partner_id === 'ptn-001')!
    expect(diamondAfter.id).toBe(diamondBefore.id)
    expect(diamondAfter.status).toBe('done')
    expect(diamondAfter.linked_deliverable_id).toBe(diamondBefore.linked_deliverable_id)
  })

  it('다른 행사(대행형)의 WBS는 건드리지 않는다', async () => {
    const before = await p.listWbsTasks('prj-stc26')
    await p.expandHostWbs(PROJECT_ID_HOST)
    const after = await p.listWbsTasks('prj-stc26')
    expect(after.length).toBe(before.length)
  })
})

describe('kind 전환 — 표시 계층만 바뀐다, 무손실 (R-H1)', () => {
  it('agency로 전환해도 파트너·WBS가 그대로고, host로 복원하면 동일하다', async () => {
    const partnersBefore = await p.listPartners(PROJECT_ID_HOST)
    const tasksBefore = await p.listWbsTasks(PROJECT_ID_HOST)

    await p.updateProject(PROJECT_ID_HOST, { kind: 'agency' })
    const projectMid = await p.getProject(PROJECT_ID_HOST)
    expect(projectMid.kind).toBe('agency')
    expect((await p.listPartners(PROJECT_ID_HOST)).length).toBe(partnersBefore.length)
    expect((await p.listWbsTasks(PROJECT_ID_HOST)).length).toBe(tasksBefore.length)

    await p.updateProject(PROJECT_ID_HOST, { kind: 'host' })
    const projectRestored = await p.getProject(PROJECT_ID_HOST)
    expect(projectRestored.kind).toBe('host')
    expect((await p.listPartners(PROJECT_ID_HOST)).length).toBe(partnersBefore.length)
    expect((await p.listWbsTasks(PROJECT_ID_HOST)).length).toBe(tasksBefore.length)
  })
})

describe('완료 온보딩 분기 — kind별 전개 (3.15a)', () => {
  it('kind=host인 새 행사는 완료 시 expandHostWbs 경로를 탄다', async () => {
    const project = await p.createProject({ name: '새 주최 행사', event_date: '2026-12-01' })
    p.switchUser('usr-pm')
    await p.updateProject(project.id, { kind: 'host' })
    // 파트너가 0명이어도 HT 템플릿은 host_notice·internal 단일 인스턴스만큼은 전개된다
    await p.completeOnboarding(project.id)
    const tasks = await p.listWbsTasks(project.id)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((t) => t.code === 'HT-2')).toBe(true) // host_notice — 파트너 무관 단일 인스턴스
    expect(tasks.filter((t) => t.code === 'HT-1')).toHaveLength(0) // partner_submit — 파트너 0명이면 인스턴스도 0
  })
})
