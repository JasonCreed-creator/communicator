/** @vitest-environment jsdom */
// DoD-26 (Phase 3.12): 데모 픽스처 리빌드화 — 실제 운영 행사 2건(RE:BUILD 26·27) 추가.
//   (a) ⑤ RE:BUILD 26은 종료 그룹에 접혀 있고, 쓰기 시도는 409로 거부된다
//   (b) ⑥ RE:BUILD 27은 진행 중 첫 카드이자 데모 기본 선택 — 홈 지연 집계 ≥1 · WBS 37건 전개
//   (c) 실적 데이터(프로그램·존운영·제작물·큐시트·등록 통계)가 S9에 그대로 조립된다
//   (d) 픽스처 전역 금지 문자열 0건 (개인 연락처·내부 링크·결제 링크)
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureState } from '../fixtures/sampleProject'
import { isDelayed, isImminent, toIsoDate } from '../lib/wbs'
import { TARGET_MAX } from '../modules/quote/engine/calcEstimate'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { mockProvider, renderRoute } from './testUtils'

const RB26 = 'prj-rebuild26'
const RB27 = 'prj-rebuild27'
const RB27_EVENT_DATE = '2026-09-10'
/** WBS 시드가 코드로 고정돼 있으므로 판정 기준일을 박아 결정적으로 검증한다 */
const REFERENCE_TODAY = '2026-08-22'

afterEach(cleanup)

describe('DoD-26 (a) RE:BUILD 26 — 종료 행사', () => {
  it('S-1 목록에서 기본은 접혀 있고, 펼치면 종료 그룹에 나타난다', async () => {
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '내 행사' })

    // 접힘 상태 — 종료 카드 이름이 렌더되지 않는다
    expect(screen.queryByText('리멤버 RE:BUILD 26')).toBeNull()
    const toggle = screen.getByRole('button', { name: /^종료 \d+$/ })
    await userEvent.click(toggle)
    expect(await screen.findByText('리멤버 RE:BUILD 26')).toBeTruthy()
    // 기존 종료 행사(④)도 함께 유지된다 — 기존 픽스처 비파괴
    expect(screen.getByText('AI 서밋 2026')).toBeTruthy()
  })

  it('종료 행사에 대한 쓰기 API는 409로 거부된다 (읽기는 정상)', async () => {
    const p = mockProvider()
    const project = await p.getProject(RB26)
    expect(project.status).toBe('closed')
    expect(project.closed_at).not.toBeNull()

    await expect(
      p.createDeliverable({ project_id: RB26, area: 'design', category: '배너', title: '추가 배너' }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const [firstZone] = (await p.listDeliverables(RB26)).filter((d) => d.category === '존운영')
    await expect(p.addComment(firstZone.id, { body: '변경 시도' })).rejects.toMatchObject({
      code: 'conflict',
    })
    await expect(p.createMilestone(RB26, { title: '추가 마일스톤', due_date: '2026-06-01' })).rejects.toMatchObject({
      code: 'conflict',
    })
    // 읽기는 막지 않는다 — 지난 행사를 참고 자료로 열람하는 것이 데모의 목적
    expect((await p.listWbsTasks(RB26)).length).toBe(37)
  })

  it('종료 행사의 S2 보드에는 생성·가이드 발행 폼이 뜨지 않고 열람 안내만 뜬다', async () => {
    localStorage.setItem('communicator.currentProjectId', RB26)
    renderRoute('/board/design')
    // 실적 제작물은 그대로 읽힌다
    expect(await screen.findByText('외관 대형 현수막')).toBeTruthy()
    expect(screen.getByText('종료된 행사입니다 — 열람만 가능합니다.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '새 항목 생성' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '가이드 발행' })).toBeNull()
    cleanup()

    // 대조군: 진행 중 행사(RE:BUILD 27)에서는 두 폼이 정상 노출된다 (현재 사용자 = PM)
    localStorage.setItem('communicator.currentProjectId', RB27)
    renderRoute('/board/design')
    expect(await screen.findByRole('heading', { name: '새 항목 생성' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '가이드 발행' })).toBeTruthy()
    expect(screen.queryByText('종료된 행사입니다 — 열람만 가능합니다.')).toBeNull()
  })
})

describe('DoD-26 (b) RE:BUILD 27 — 진행 중·데모 기본', () => {
  it('진행 중 그룹의 첫 행사이고 WBS 37건이 event_date 기준으로 전개된다', async () => {
    const p = mockProvider()
    const summaries = await p.listProjects()
    const firstActive = summaries.find((s) => s.status === 'active')!
    expect(firstActive.id).toBe(RB27)

    expect((await p.getProject(RB27)).event_date).toBe(RB27_EVENT_DATE)
    const tasks = await p.listWbsTasks(RB27)
    expect(tasks).toHaveLength(37)
    // 전개 기준일 = 2026-09-10. 1.1(D-42~D-40)의 실제 날짜가 오프셋과 일치해야 한다
    const first = tasks.find((t) => t.code === '1.1')!
    expect(first.start_date).toBe('2026-07-30')
    expect(first.end_date).toBe('2026-08-01')
    // 모객형 전용 코드가 살아 있다(일반형 파생본이 아니다)
    expect(tasks.some((t) => t.code === '3.1')).toBe(true)
    expect(tasks.every((t) => t.origin_role !== undefined)).toBe(true)
    // R&R·컴플라이언스도 함께 시드된다
    expect((await p.listRoleCharters(RB27)).length).toBeGreaterThan(0)
    expect((await p.listComplianceCards(RB27)).length).toBeGreaterThan(0)
  })

  it('지연 태스크가 2.2·2.3 두 건이고 홈 대시보드에 집계된다', async () => {
    const p = mockProvider()
    const tasks = await p.listWbsTasks(RB27)

    // 시드는 코드로 고정돼 있으므로 기준일을 박아 결정적으로 검증한다(테스트가 실행 날짜에 흔들리지 않게).
    const seeded = tasks.filter((t) => isDelayed(t, REFERENCE_TODAY))
    expect(seeded.map((t) => t.code)).toEqual(['2.2', '2.3'])
    expect(seeded.map((t) => t.title)).toEqual(['기초 자료 수령 리마인더', '기초 자료 수령'])
    // 2.2·2.3은 마감이 2026-08-15·08-18이라 그 이후 어느 시점에 봐도 계속 지연으로 남는다
    for (const t of seeded) {
      expect(t.status).not.toBe('done')
      expect(t.end_date! < REFERENCE_TODAY).toBe(true)
    }
    // 임박(마감 2일 내 미완료)도 최소 1건 — 2.5 랜딩페이지 1차가 'doing'으로 시드돼 있다
    expect(tasks.find((t) => t.code === '2.5')!.status).toBe('doing')
    expect(tasks.filter((t) => isImminent(t, REFERENCE_TODAY)).length).toBeGreaterThanOrEqual(1)

    // 실제 조회 시점(오늘) 기준으로도 홈 집계가 provider 계산과 일치한다
    const today = toIsoDate(new Date())
    const delayed = tasks.filter((t) => isDelayed(t, today))
    const dashboard = await p.getDashboard(RB27)
    expect(dashboard.wbs_delayed.length).toBeGreaterThanOrEqual(1)
    expect(dashboard.wbs_delayed.length).toBe(delayed.length)

    localStorage.setItem('communicator.currentProjectId', RB27)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })
    const delayTile = (await screen.findByText('지연 태스크')).closest('div')!.parentElement!
    expect(within(delayTile).getByText(String(delayed.length))).toBeTruthy()
    expect(await screen.findByText('기초 자료 수령 리마인더')).toBeTruthy()
    // 미결 컨펌(제작물 2건)이 RE:BUILD 27 것으로 렌더된다
    expect(await screen.findByText('외관 대형 현수막')).toBeTruthy()
  })
})

describe('DoD-26 (c) 실적 데이터가 S9 운영계획서로 조립된다', () => {
  it('RE:BUILD 26 — 프로그램 20세션·존 운영·제작물 42건·큐시트·등록 통계 703명', async () => {
    const p = mockProvider()
    const plan = await p.getPlan(RB26)

    // ① 행사개요
    expect(plan.project.theme).toBe('AI 시대, 새롭게 세우는 B2B 성장 공식')
    expect(plan.project.mc_name).toBe('김경미 아나운서')
    expect(plan.project.venue).toContain('파이팩토리')

    // ② 프로그램 — 결과보고서 p3 최종 실적표
    expect(plan.program_sessions).toHaveLength(20)
    const opening = plan.program_sessions[0]
    expect(opening.start_time).toBe('10:30')
    expect(opening.speaker_name).toBe('송기홍')
    expect(opening.speaker_org).toBe('리멤버')
    expect(plan.program_sessions.some((s) => s.section === 'AFTER PARTY')).toBe(true)

    // ③ 큐시트 — 개막 세션(콘솔 3채널 포함)
    expect(plan.cuesheet?.title).toBe('개막 세션 큐시트')
    expect(plan.cuesheet?.cues).toHaveLength(8)
    expect(plan.cuesheet?.cues.every((c) => c.console_audio && c.console_light)).toBe(true)
    // 애프터파티 진행표는 별도 항목으로 함께 존재한다
    const cueItems = (await p.listDeliverables(RB26)).filter((d) => d.category === '큐시트')
    expect(cueItems.map((d) => d.title)).toContain('애프터파티 진행표')

    // ④ 존별 운영 — 존 9 + 큐시트 2 (ops 영역 전체)
    expect(plan.zones.length).toBeGreaterThanOrEqual(9)
    expect(plan.zones.every((z) => (z.content ?? '').trim().length > 0)).toBe(true)
    const insight = plan.zones.find((z) => z.title.startsWith('인사이트존'))!
    expect(insight.content).toContain('LED 12×3m')

    // ⑤ 제작물 리스트 — 가이드 스펙에서 자동 생성
    expect(plan.production_items).toHaveLength(42)
    const banner = plan.production_items.find((d) => d.title === '외관 대형 현수막')!
    expect(banner.spec_size).toBe('23,000×5,000mm')
    expect(banner.spec_qty).toBe(1)
    expect(banner.spec_location).toBe('파이팩토리 외부')
    expect(banner.status).toBe('final')

    // ⑥ 등록 통계 — 현장 참석 703명 (사전출력 134 + 사전등록 551 + 현장등록 18)
    expect(plan.registration_stats.attendee_total).toBe(703)
    expect(plan.registration_stats.checked_in).toBe(703)
    const attendees = await p.listAttendees(RB26)
    const byChannel = (c: string) => attendees.filter((a) => a.channel === c).length
    expect(byChannel('import')).toBe(134)
    expect(byChannel('rsvp')).toBe(551)
    expect(byChannel('onsite')).toBe(18)
    // RSVP 컨택 — 참석 예정 277 · 참석 불가 40 + 결제 취소 32 · 부재 63
    const rsvps = await p.listRsvpContacts(RB26)
    const byTag = (tag: string) => rsvps.filter((r) => r.group_tag === tag).length
    expect(byTag('참석 예정')).toBe(277)
    expect(byTag('참석 불가')).toBe(40)
    expect(byTag('결제 취소')).toBe(32)
    expect(byTag('부재')).toBe(63)
    expect(plan.registration_stats.rsvp_accepted).toBe(277)
    expect(plan.registration_stats.rsvp_declined).toBe(72)

    // ⑦ 일정
    expect(plan.milestones.length).toBeGreaterThan(0)
    expect(plan.milestones.every((m) => m.done)).toBe(true)
  })

  it('RE:BUILD 27 — 견적 2버전이 엔진 산출값으로 저장되고 확정 전이다', async () => {
    const p = mockProvider()
    const quotes = (await p.listQuotes()).filter((q) => q.project_id === RB27)
    expect(quotes).toHaveLength(2)
    expect(quotes.map((q) => q.status).sort()).toEqual(['draft', 'proposed'])
    expect(quotes.map((q) => q.input.headcount).sort((a, b) => a - b)).toEqual([400, 480])
    // 파이팩토리는 venuedb 실존 항목 — 후보로 선택되어 있어야 한다
    for (const q of quotes) {
      expect(q.input.selected_venue?.venue_id).toBe('pie_factory')
      // 엔진 자동 견적 상한(500명) 안이라 실제 금액이 산출돼야 한다
      expect(q.input.headcount).toBeLessThanOrEqual(TARGET_MAX)
      expect(q.total_amount).toBeGreaterThan(0)
      // breakdown은 엔진 재계산과 일치해야 한다 (§4-18)
      const recomputed = computeQuoteOutputs(q.input)
      expect(q.breakdown).toEqual(recomputed.breakdown)
      expect(q.total_amount).toBe(recomputed.total_amount)
      expect(q.total_amount).toBe(q.breakdown.subtotal)
      expect(q.breakdown.total).toBe(q.breakdown.subtotal + q.breakdown.vat)
      expect(q.is_final).toBe(false)
    }
    // 확정 견적이 없으므로 행사에는 아직 연결되지 않는다
    expect((await p.getProject(RB27)).quote_id).toBeNull()
  })
})

describe('DoD-26 (d) 금지 문자열 가드', () => {
  // 세션 브리프 §4 — 원본 문서에 있으나 픽스처로 옮기면 안 되는 것들.
  const FORBIDDEN: [RegExp, string][] = [
    [/@remember\.co\.kr/i, '운영사무국 실제 이메일'],
    [/docs\.google\.com/i, '참가자 명단 구글 시트 URL'],
    [/tosspayments/i, '결제(토스페이먼츠) 링크'],
    [/market\.remember\.co\.kr/i, '참가 신청 페이지 실주소'],
    [/mnccom\.com/i, '내부 큐시트 시스템 링크'],
  ]
  // 휴대폰: 픽스처에 허용되는 형태는 예약 더미(010-0000-XXXX)뿐이다.
  const PHONE = /010-(?!0000-)\d/

  const FIXTURE_DIR = join(process.cwd(), 'src/fixtures')
  const fixtureFiles = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.ts'))

  it('픽스처 소스 전체에 금지 문자열이 없다', () => {
    expect(fixtureFiles.length).toBeGreaterThan(0)
    for (const file of fixtureFiles) {
      const source = readFileSync(join(FIXTURE_DIR, file), 'utf8')
      for (const [pattern, why] of FORBIDDEN) {
        expect(pattern.test(source), `${file}: ${why}`).toBe(false)
      }
      expect(PHONE.test(source), `${file}: 예약 더미(010-0000-) 외 휴대폰 번호`).toBe(false)
    }
  })

  it('조립된 mock 상태 전체(신규 행사 포함)에도 금지 문자열이 없다', () => {
    const serialized = JSON.stringify(createFixtureState())
    for (const [pattern, why] of FORBIDDEN) {
      expect(pattern.test(serialized), why).toBe(false)
    }
    expect(PHONE.test(serialized), '예약 더미 외 휴대폰 번호').toBe(false)
  })

  it('신규 행사 데이터에는 휴대폰·개인 이메일이 아예 없다', () => {
    const state = createFixtureState()
    const rebuildRows = JSON.stringify({
      projects: state.projects.filter((p) => p.id === RB26 || p.id === RB27),
      deliverables: state.deliverables.filter((d) => d.project_id === RB26 || d.project_id === RB27),
      rsvp: state.rsvp_contacts.filter((r) => r.project_id === RB26 || r.project_id === RB27),
      attendees: state.attendees.filter((a) => a.project_id === RB26 || a.project_id === RB27),
      contacts: state.client_contacts.filter((c) => c.project_id === RB27),
      cues: state.cues,
      program: state.program_sessions.filter((s) => s.project_id === RB26 || s.project_id === RB27),
    })
    expect(/010-/.test(rebuildRows)).toBe(false)
    // 참관객·리드 이메일은 전부 합성 도메인(example.com)이다
    const emails = [...rebuildRows.matchAll(/[\w.+-]+@[\w.-]+/g)].map((m) => m[0])
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.every((e) => e.endsWith('@example.com'))).toBe(true)
  })
})

describe('DoD-26 (e) 기존 픽스처 비파괴', () => {
  it('기존 행사 4건과 그 하위 데이터가 그대로 남아 있다', async () => {
    const p = mockProvider()
    const ids = (await p.listProjects()).map((s) => s.id)
    for (const id of ['prj-stc26', 'prj-partner-day', 'prj-forum-h2', 'prj-ai-summit']) {
      expect(ids).toContain(id)
    }
    // ① 샘플 테크의 기준 데이터가 불변
    expect((await p.listDeliverables('prj-stc26'))).toHaveLength(8)
    expect((await p.listWbsTasks('prj-stc26'))).toHaveLength(37)
    expect((await p.listWbsTasks('prj-partner-day'))).toHaveLength(28)
    const demo = await p.getClientQueue('demo')
    expect(demo.project_name).toBe('샘플 테크 컨퍼런스 2026')
  })
})
