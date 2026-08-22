import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEMO_TOKEN,
  EXPIRED_TOKEN,
  PROJECT_ID,
  REVOKED_TOKEN,
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

describe('상태 전이 — transitionStatus 단일 경유 (CLAUDE.md §6)', () => {
  it('draft → internal_review: 영역 담당 가능', async () => {
    p.switchUser('usr-design')
    const d = await p.transitionStatus('dlv-003', 'internal_review')
    expect(d.status).toBe('internal_review')
  })

  it('타 영역 담당의 전이는 403', async () => {
    p.switchUser('usr-ops') // ops가 design 항목을 전이 시도
    await expectError(() => p.transitionStatus('dlv-003', 'internal_review'), 403)
  })

  it('전이표 밖 전이는 409 (draft → final)', async () => {
    await expectError(() => p.transitionStatus('dlv-003', 'final'), 409)
  })

  it('status_patch 경로로 pending_approval 진입 불가 — 409', async () => {
    await expectError(() => p.transitionStatus('dlv-004', 'pending_approval'), 409)
  })

  it('PM 반려는 코멘트 필수 — 없으면 400, 있으면 internal 코멘트 기록', async () => {
    await expectError(() => p.transitionStatus('dlv-004', 'draft'), 400)
    const d = await p.transitionStatus('dlv-004', 'draft', { comment: '구성 다시 잡아주세요.' })
    expect(d.status).toBe('draft')
    const detail = await p.getDeliverable('dlv-004')
    const last = detail.comments[detail.comments.length - 1]
    expect(last.visibility).toBe('internal')
  })
})

describe('컨펌 발송 — requestApproval (§5 발송 조건)', () => {
  it('PM이 아니면 403', async () => {
    p.switchUser('usr-design')
    await expectError(() => p.requestApproval('dlv-004', { version_id: 'ver-004' }), 403)
  })

  it('미리보기 포맷이 아닌 버전은 400', async () => {
    // dlv-001을 internal_review로 되돌린 뒤 .ai 버전(ver-001)으로 발송 시도해야 하지만
    // 픽스처 dlv-001은 pending — dlv-004(internal_review)에 .ai 버전을 만들어 검증
    p.switchUser('usr-ops')
    const v = await p.uploadVersion('dlv-004', { file_name: '원본.ai' })
    p.switchUser('usr-pm')
    await expectError(() => p.requestApproval('dlv-004', { version_id: v.id }), 400)
  })

  it('internal_review의 미리보기 버전은 발송 성공 → pending_approval', async () => {
    const approval = await p.requestApproval('dlv-004', { version_id: 'ver-004' })
    expect(approval.decided_at).toBeNull()
    const d = await p.getDeliverable('dlv-004')
    expect(d.status).toBe('pending_approval')
  })

  it('requires_approval=false(공통 문서)는 발송 불가 — 409', async () => {
    await expectError(() => p.requestApproval('dlv-006', { version_id: 'ver-006' }), 409)
  })
})

describe('발주처 결정 — submitClientDecision (§5·§6)', () => {
  it('승인 → approved → (스냅숏) → final 자동 전이', async () => {
    await p.submitClientDecision(DEMO_TOKEN, { approval_id: 'apr-001', decision: 'approved' })
    const d = await p.getDeliverable('dlv-001')
    expect(d.status).toBe('final')
  })

  it('수정요청은 코멘트 필수(400), 성공 시 shared 코멘트 + changes_requested', async () => {
    await expectError(
      () => p.submitClientDecision(DEMO_TOKEN, { approval_id: 'apr-001', decision: 'changes_requested' }),
      400,
    )
    await p.submitClientDecision(DEMO_TOKEN, {
      approval_id: 'apr-001',
      decision: 'changes_requested',
      comment: '로고 크기를 키워주세요.',
    })
    const d = await p.getDeliverable('dlv-001')
    expect(d.status).toBe('changes_requested')
    const clientComment = d.comments.find((c) => c.body === '로고 크기를 키워주세요.')
    expect(clientComment?.visibility).toBe('shared')
    expect(clientComment?.author_token).toBe(DEMO_TOKEN)
  })

  it('이미 처리된 컨펌은 409', async () => {
    await expectError(
      () => p.submitClientDecision(DEMO_TOKEN, { approval_id: 'apr-002', decision: 'approved' }),
      409,
    )
  })
})

describe('수정요청 루프 — 새 버전 업로드 시 draft 자동 복귀 (§5·DoD-2)', () => {
  it('changes_requested에서 업로드하면 draft + version_no 증가', async () => {
    p.switchUser('usr-ops')
    const v = await p.uploadVersion('dlv-005', { file_name: '수정본.pdf', note: 'VIP 동선 반영' })
    expect(v.version_no).toBe(2)
    const d = await p.getDeliverable('dlv-005')
    expect(d.status).toBe('draft')
  })

  it('pending_approval 상태에서는 업로드 불가 — 409', async () => {
    p.switchUser('usr-design')
    await expectError(() => p.uploadVersion('dlv-001', { file_name: 'x.png' }), 409)
  })

  it('파일명은 규약대로 생성된다 (§7.2)', async () => {
    p.switchUser('usr-ops')
    const v = await p.uploadVersion('dlv-005', { file_name: '수정본.pdf' })
    expect(v.file_name).toMatch(/^\d{6}_STC26_시나리오_운영 시나리오_v2\.pdf$/)
  })
})

describe('코멘트 가시성 — internal은 발주처에 절대 미노출 (§6.2·DoD-3)', () => {
  it('내부 작성 기본값은 internal', async () => {
    const c = await p.addComment('dlv-001', { body: '내부 메모' })
    expect(c.visibility).toBe('internal')
  })

  it('발주처 큐의 코멘트는 shared뿐이다', async () => {
    const q = await p.getClientQueue(DEMO_TOKEN)
    const item = q.queue.find((i) => i.deliverable_id === 'dlv-001')
    expect(item).toBeDefined()
    expect(item!.shared_comments.length).toBeGreaterThan(0)
    for (const c of item!.shared_comments) expect(c.visibility).toBe('shared')
    // 픽스처의 internal 코멘트 본문이 발주처 응답 전체에 등장하지 않아야 한다
    expect(JSON.stringify(q)).not.toContain('[내부]')
  })
})

describe('토큰 수명 주기 (§6.3)', () => {
  it('회수된 토큰은 410', async () => {
    await expectError(() => p.getClientQueue(REVOKED_TOKEN), 410)
  })

  it('만료된 토큰은 410', async () => {
    await expectError(() => p.getClientStatus(EXPIRED_TOKEN), 410)
  })

  it('유효 토큰 접근 시 last_seen_at 갱신', async () => {
    await p.getClientQueue(DEMO_TOKEN)
    const tokens = await p.listClientTokens(PROJECT_ID)
    expect(tokens.find((t) => t.token === DEMO_TOKEN)?.last_seen_at).not.toBeNull()
  })

  it('발급 기본 만료 = 행사일+30일, 회수는 PM 전용', async () => {
    const t = await p.issueClientToken({ project_id: PROJECT_ID, contact_id: 'cct-001' })
    expect(t.expires_at).toBe('2026-11-21T00:00:00.000Z')
    p.switchUser('usr-design')
    await expectError(() => p.revokeClientToken(t.token), 403)
  })
})

describe('등록 모듈 (§11·DoD-4)', () => {
  it('CSV 임포트 — email 기준 upsert', async () => {
    p.switchUser('usr-reg')
    const result = await p.importRegistrationCsv(PROJECT_ID, 'rsvp', [
      { name: '홍초청', email: 'GUEST1@example.com', org: '가상전자(변경)' }, // 대소문자 무시 upsert
      { name: '새손님', email: 'new@example.com' },
      { name: '이름만' }, // email 없음 → insert
    ])
    expect(result).toEqual({ inserted: 2, updated: 1 })
    const rsvps = await p.listRsvpContacts(PROJECT_ID)
    expect(rsvps.find((r) => r.email === 'guest1@example.com')?.org).toBe('가상전자(변경)')
  })

  it('체크인 토글·통계', async () => {
    p.switchUser('usr-reg')
    await p.toggleCheckin('att-001')
    const stats = await p.getRegistrationStats(PROJECT_ID)
    expect(stats.rsvp_total).toBe(5)
    expect(stats.rsvp_sent).toBe(4) // none 제외
    expect(stats.response_rate).toBeCloseTo(3 / 4) // accepted 2 + declined 1
    expect(stats.checked_in).toBe(2)
    expect(stats.checkin_rate).toBeCloseTo(2 / 3)
  })

  it('RSVP → 참관객 전환, 중복 전환은 409', async () => {
    p.switchUser('usr-reg')
    const a = await p.convertRsvpToAttendee('rsv-005')
    expect(a.channel).toBe('rsvp')
    await expectError(() => p.convertRsvpToAttendee('rsv-005'), 409)
    await expectError(() => p.convertRsvpToAttendee('rsv-001'), 409) // 픽스처에서 이미 전환됨
  })

  it('design 역할은 등록 데이터 쓰기 불가 — 403 (§6.1)', async () => {
    p.switchUser('usr-design')
    await expectError(() => p.toggleCheckin('att-001'), 403)
  })
})

describe('인박스 (§7.3)', () => {
  it('연결 시 파일명 rename 없이 새 버전 생성', async () => {
    p.switchUser('usr-design')
    const v = await p.linkInboxFile('inb-001', 'dlv-003')
    expect(v.file_name).toBe('리플렛 시안 수정본.pdf') // rename 기본 off
    const inbox = await p.listInbox(PROJECT_ID)
    expect(inbox.find((f) => f.id === 'inb-001')).toBeUndefined()
  })

  it('무시 처리 후 인박스에서 제외', async () => {
    await p.dismissInboxFile('inb-002')
    const inbox = await p.listInbox(PROJECT_ID)
    expect(inbox.find((f) => f.id === 'inb-002')).toBeUndefined()
  })
})

describe('대시보드 (S1·DoD-5)', () => {
  it('미결 컨펌·인박스 수·영역 진행률을 집계한다', async () => {
    const d = await p.getDashboard(PROJECT_ID)
    expect(d.pending_approvals.map((x) => x.approval.id)).toEqual(['apr-001'])
    expect(d.inbox_count).toBe(2)
    const design = d.area_progress.find((a) => a.area === 'design')
    expect(design).toEqual({ area: 'design', total: 4, done: 1 })
  })

  it('받은 지시(my_requested)는 담당자에게만 노출된다 (v1.2)', async () => {
    const pmView = await p.getDashboard(PROJECT_ID)
    expect(pmView.my_requested).toHaveLength(0)
    p.switchUser('usr-design')
    const designView = await p.getDashboard(PROJECT_ID)
    expect(designView.my_requested.map((d) => d.id)).toEqual(['dlv-007'])
  })
})

describe('v1.2 지시 파이프라인 — requested (§5·§8)', () => {
  it('brief·스펙 포함 생성은 pm 전용 status=requested, 담당자 필수', async () => {
    await expectError(
      () =>
        p.createDeliverable({
          project_id: PROJECT_ID,
          area: 'design',
          category: '리플렛',
          title: '행사 리플렛',
          brief: 'A4 3단 리플렛 시안 요청',
        }),
      400, // 담당자 미지정
    )
    const d = await p.createDeliverable({
      project_id: PROJECT_ID,
      area: 'design',
      category: '리플렛',
      title: '행사 리플렛',
      assignee_id: 'usr-design',
      brief: 'A4 3단 리플렛 시안 요청',
      spec_size: '210×297mm',
      spec_qty: 500,
      spec_location: '등록데스크 비치',
      spec_type: '합지',
    })
    expect(d.status).toBe('requested')
    expect(d.spec_qty).toBe(500)
  })

  it('pm이 아닌 지시 발행은 403', async () => {
    p.switchUser('usr-design')
    await expectError(
      () =>
        p.createDeliverable({
          project_id: PROJECT_ID,
          area: 'design',
          category: '포스터',
          title: '포스터',
          assignee_id: 'usr-design',
          brief: '셀프 지시 시도',
        }),
      403,
    )
  })

  it('brief 없는 셀프 생성은 기존대로 draft', async () => {
    p.switchUser('usr-design')
    const d = await p.createDeliverable({
      project_id: PROJECT_ID,
      area: 'design',
      category: '사이니지',
      title: '층별 사이니지',
    })
    expect(d.status).toBe('draft')
  })

  it('requested에서 첫 버전 업로드 시 draft 자동 전이 (assertTransition 경유)', async () => {
    p.switchUser('usr-design')
    const v = await p.uploadVersion('dlv-007', { file_name: '시안.png' })
    expect(v.version_no).toBe(1)
    const d = await p.getDeliverable('dlv-007')
    expect(d.status).toBe('draft')
  })

  it('requested 항목은 인박스 연결로도 draft 전이', async () => {
    p.switchUser('usr-design')
    const v = await p.linkInboxFile('inb-001', 'dlv-007')
    expect(v.file_name).toBe('리플렛 시안 수정본.pdf')
    const d = await p.getDeliverable('dlv-007')
    expect(d.status).toBe('draft')
  })

  it('requested의 status_patch 수동 전이는 409', async () => {
    await expectError(() => p.transitionStatus('dlv-007', 'draft'), 409)
  })
})

describe('v1.2 프로그램표·행사개요 (pm·ops 전용 — §6.1)', () => {
  it('프로그램 CRUD — reg 역할은 403', async () => {
    const created = await p.createProgramSession(PROJECT_ID, {
      section: '오후',
      start_time: '16:10',
      title: '폐회사',
    })
    expect(created.sort_order).toBe(6)
    const updated = await p.updateProgramSession(created.id, { end_time: '16:30' })
    expect(updated.end_time).toBe('16:30')
    p.switchUser('usr-reg')
    await expectError(() => p.deleteProgramSession(created.id), 403)
    p.switchUser('usr-ops')
    await p.deleteProgramSession(created.id)
    const sessions = await p.listProgramSessions(PROJECT_ID)
    expect(sessions.find((s) => s.id === created.id)).toBeUndefined()
  })

  it('행사개요 편집은 pm·ops만, design은 403', async () => {
    p.switchUser('usr-ops')
    const project = await p.updateProjectOverview(PROJECT_ID, { venue: '가상컨벤션센터 5F 오디토리움' })
    expect(project.venue).toBe('가상컨벤션센터 5F 오디토리움')
    p.switchUser('usr-design')
    await expectError(() => p.updateProjectOverview(PROJECT_ID, { theme: 'x' }), 403)
  })
})

describe('v1.2 S9 운영계획서 조립 — getPlan (§8·DoD-8)', () => {
  it('6개 섹션 데이터와 섹션별 진행률을 조립한다', async () => {
    const plan = await p.getPlan(PROJECT_ID)
    expect(plan.program_sessions.map((s) => s.id)).toEqual([
      'pgs-001', 'pgs-002', 'pgs-003', 'pgs-004', 'pgs-005',
    ])
    // 제작물 리스트는 design 항목 지시 스펙에서 자동 생성
    const banner = plan.production_items.find((i) => i.deliverable_id === 'dlv-007')
    expect(banner?.spec_size).toBe('23000×5000mm')
    // 존운영은 ops 항목 content 기반
    expect(plan.zones.find((z) => z.deliverable_id === 'dlv-008')?.content).toContain('등록존')
    const progress = Object.fromEntries(plan.section_progress.map((s) => [s.key, s]))
    expect(progress.overview).toMatchObject({ done: 5, total: 5 })
    expect(progress.program).toMatchObject({ done: 5, total: 5 })
    expect(progress.zones).toMatchObject({ done: 2, total: 3 })
    expect(progress.production).toMatchObject({ done: 2, total: 4 })
    expect(progress.registration).toMatchObject({ done: 1, total: 1 })
    expect(progress.schedule).toMatchObject({ done: 1, total: 5 })
  })

  it('미리보기 포맷이 아닌 최신 버전은 preview_url이 null', async () => {
    const plan = await p.getPlan(PROJECT_ID)
    const keyVisual = plan.production_items.find((i) => i.deliverable_id === 'dlv-001')
    expect(keyVisual?.latest_version?.preview_url).not.toBeNull() // v2 .png
    p.switchUser('usr-design')
    await p.uploadVersion('dlv-003', { file_name: '원본.ai' })
    const plan2 = await p.getPlan(PROJECT_ID)
    const backwall = plan2.production_items.find((i) => i.deliverable_id === 'dlv-003')
    expect(backwall?.latest_version?.preview_url).toBeNull()
  })
})
