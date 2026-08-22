import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEMO_TOKEN,
  EXPIRED_TOKEN,
  PROJECT_ID,
  REVOKED_TOKEN,
} from '../../fixtures/sampleProject'
import { ProviderError } from '../../lib/errors'
import { addDays, toIsoDate } from '../../lib/wbs'
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
    // v1.3부터 큐시트(dlv-004)는 스냅숏 자동 등록으로 항상 조건 충족 — 비큐시트 항목으로 검증
    p.switchUser('usr-design')
    await p.transitionStatus('dlv-003', 'internal_review')
    const v = await p.uploadVersion('dlv-003', { file_name: '원본.ai' })
    p.switchUser('usr-pm')
    await expectError(() => p.requestApproval('dlv-003', { version_id: v.id }), 400)
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

  it('받은 가이드(my_requested)는 담당자에게만 노출된다 (v1.2)', async () => {
    const pmView = await p.getDashboard(PROJECT_ID)
    expect(pmView.my_requested).toHaveLength(0)
    p.switchUser('usr-design')
    const designView = await p.getDashboard(PROJECT_ID)
    expect(designView.my_requested.map((d) => d.id)).toEqual(['dlv-007'])
  })
})

describe('v1.2 가이드 파이프라인 — requested (§5·§8)', () => {
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

  it('pm이 아닌 가이드 발행은 403', async () => {
    p.switchUser('usr-design')
    await expectError(
      () =>
        p.createDeliverable({
          project_id: PROJECT_ID,
          area: 'design',
          category: '포스터',
          title: '포스터',
          assignee_id: 'usr-design',
          brief: '셀프 가이드 시도',
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

describe('v1.3 온보딩·유형·큐시트', () => {
  it('온보딩 완료 시 유형별 WBS 자동 전개 + R&R 시드 (모객형 37건)', async () => {
    p.resetOnboarding()
    expect((await p.getOnboardingStatus(PROJECT_ID)).completed).toBe(false)
    await p.completeOnboarding(PROJECT_ID)
    expect((await p.getOnboardingStatus(PROJECT_ID)).completed).toBe(true)
    expect(await p.listWbsTasks(PROJECT_ID)).toHaveLength(37)
    expect(await p.listRoleCharters(PROJECT_ID)).toHaveLength(4)
  })

  it('updateProject는 pm 전용, 일반형 재전개는 28건 + origin_role 보존 (DoD-13)', async () => {
    p.switchUser('usr-design')
    await expectError(() => p.updateProject(PROJECT_ID, { event_type: 'general' }), 403)
    p.switchUser('usr-pm')
    await p.updateProject(PROJECT_ID, { event_type: 'general' })
    const tasks = await p.expandWbs(PROJECT_ID)
    expect(tasks).toHaveLength(28)
    expect(tasks.find((t) => t.code === '3.1')).toBeUndefined() // 리드젠 제외
    expect(tasks.find((t) => t.code === '4.6')?.origin_role).toBe('MC-AT') // 존치 + 원본 태그 보존
    expect(tasks.find((t) => t.code === '3G.1')?.role).toBe('reg') // 일반형 대체 태스크
  })

  it('큐 CRUD는 pm·ops 전용, sort_order 순 조회', async () => {
    p.switchUser('usr-ops')
    const cue = await p.createCue('dlv-004', {
      cue_no: 'C05',
      time_at: '10:05',
      segment: '세션',
      body: '기조연설 시작',
    })
    expect(cue.sort_order).toBe(5)
    await p.updateCue(cue.id, { time_at: '10:06' })
    p.switchUser('usr-design')
    await expectError(() => p.deleteCue(cue.id), 403)
    p.switchUser('usr-ops')
    await p.deleteCue(cue.id)
    expect((await p.listCues('dlv-004')).map((c) => c.cue_no)).toEqual(['C01', 'C02', 'C03', 'C04'])
  })

  it('큐시트 컨펌 발송 시 .pdf 스냅숏 버전 자동 등록 (DoD-12)', async () => {
    const approval = await p.requestApproval('dlv-004', { version_id: 'ver-004' })
    const detail = await p.getDeliverable('dlv-004')
    expect(detail.versions[0].note).toContain('큐시트 스냅숏')
    expect(detail.versions[0].file_name).toMatch(/\.pdf$/)
    expect(approval.version_id).toBe(detail.versions[0].id)
    expect(detail.status).toBe('pending_approval')
  })
})

describe('v1.4 WBS — 전개·권한·지연/임박·자동 완료', () => {
  it('event_date 기준 날짜 전개 + 오프셋 원본 보존 (DoD-13)', async () => {
    const tasks = await p.listWbsTasks(PROJECT_ID)
    const contract = tasks.find((t) => t.code === '1.1')!
    expect(contract.offset_start).toBe(-42)
    expect(contract.start_date).toBe('2026-09-10') // 2026-10-22의 D-42
    expect(contract.end_date).toBe('2026-09-12')
    expect(contract.origin_role).toBe('RS')
    expect(tasks.find((t) => t.code === '5.4')!.start_date).toBe('2026-10-22') // D-Day
  })

  it('재전개는 code 매칭으로 상태·연결 보존', async () => {
    const target = (await p.listWbsTasks(PROJECT_ID)).find((t) => t.code === '2.1')!
    await p.updateWbsTask(target.id, { status: 'done' })
    const tasks = await p.expandWbs(PROJECT_ID)
    expect(tasks.find((t) => t.code === '2.1')?.status).toBe('done')
    expect(tasks.find((t) => t.code === '2.8')?.linked_deliverable_id).toBe('dlv-007')
  })

  it('status 체크는 담당 역할+pm, 그 외 편집은 pm 전용', async () => {
    const siteVisit = (await p.listWbsTasks(PROJECT_ID)).find((t) => t.code === '1.4')! // ops 담당
    p.switchUser('usr-design')
    await expectError(() => p.updateWbsTask(siteVisit.id, { status: 'doing' }), 403)
    p.switchUser('usr-ops')
    await expectError(() => p.updateWbsTask(siteVisit.id, { note: '메모' }), 403)
    const updated = await p.updateWbsTask(siteVisit.id, { status: 'done' })
    expect(updated.done_at).not.toBeNull()
  })

  it('지연/임박이 대시보드에 집계된다 — 경계값 (DoD-14)', async () => {
    const today = toIsoDate(new Date())
    const tasks = await p.listWbsTasks(PROJECT_ID)
    const byCode = (code: string) => tasks.find((t) => t.code === code)!.id
    await p.updateWbsTask(byCode('6.5'), { end_date: addDays(today, -1) }) // 어제 마감 → 지연
    await p.updateWbsTask(byCode('6.6'), { end_date: today }) // 오늘 마감 → 임박
    await p.updateWbsTask(byCode('6.7'), { end_date: addDays(today, 2) }) // +2 → 임박
    await p.updateWbsTask(byCode('6.8'), { end_date: addDays(today, 3) }) // +3 → 해당 없음
    await p.updateWbsTask(byCode('6.1'), { end_date: addDays(today, -1) })
    await p.updateWbsTask(byCode('6.1'), { status: 'done' }) // 완료면 지연 아님
    const dash = await p.getDashboard(PROJECT_ID)
    const delayed = dash.wbs_delayed.map((t) => t.code)
    const imminent = dash.wbs_imminent.map((t) => t.code)
    expect(delayed).toContain('6.5')
    expect(delayed).not.toContain('6.6')
    expect(delayed).not.toContain('6.1')
    expect(imminent).toEqual(expect.arrayContaining(['6.6', '6.7']))
    expect(imminent).not.toContain('6.5') // 지연과 배타
    expect(imminent).not.toContain('6.8')
  })

  it('연결 산출물 final 전환 시 태스크 자동 done (DoD-15)', async () => {
    p.switchUser('usr-design')
    await p.uploadVersion('dlv-007', { file_name: '시안.png' }) // requested → draft
    await p.transitionStatus('dlv-007', 'internal_review')
    p.switchUser('usr-pm')
    const latest = (await p.getDeliverable('dlv-007')).versions[0]
    const approval = await p.requestApproval('dlv-007', { version_id: latest.id })
    await p.submitClientDecision(DEMO_TOKEN, { approval_id: approval.id, decision: 'approved' })
    const production = (await p.listWbsTasks(PROJECT_ID)).find((t) => t.code === '2.8')!
    expect(production.status).toBe('done')
    expect(production.done_at).not.toBeNull()
  })
})

describe('v1.2 S9 운영계획서 조립 — getPlan (§8·DoD-8)', () => {
  it('6개 섹션 데이터와 섹션별 진행률을 조립한다', async () => {
    const plan = await p.getPlan(PROJECT_ID)
    expect(plan.program_sessions.map((s) => s.id)).toEqual([
      'pgs-001', 'pgs-002', 'pgs-003', 'pgs-004', 'pgs-005',
    ])
    // 제작물 리스트는 design 항목 가이드 스펙에서 자동 생성
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
