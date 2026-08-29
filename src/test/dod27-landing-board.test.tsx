/** @vitest-environment jsdom */
// DoD-27 (v2.1 랜딩보드) — 섹션 CRUD·행사 데이터 autofill·GA 주입·리드 유입을 코드로 잠근다.
//
// 특히 두 가지가 이 기능의 계약이다:
//  ① autofill: 세션·개요가 바뀌면 랜딩도 같이 바뀐다(이중 입력 없음)
//  ② GA: 유효한 측정 ID일 때만 스크립트가 들어가고, 없으면 외부 요청이 0건이다
import { beforeEach, describe, expect, it } from 'vitest'
import { MockProvider } from '../providers/mock/MockProvider'
import { createFixtureState } from '../fixtures/sampleProject'
import { LANDING_ID_SAMPLE, buildLandingMetrics } from '../fixtures/landingFixtures'
import { PROJECT_ID } from '../fixtures/sampleProject'
import {
  LANDING_ID_REBUILD26,
  LANDING_ID_REBUILD27,
  PROJECT_ID_REBUILD26,
  PROJECT_ID_REBUILD27,
} from '../fixtures/rebuildFixtures'
import { autofillSection, autofillSections, heroMetaLine } from '../lib/landingAutofill'
import {
  analyticsSnippet,
  buildLandingHtml,
  escapeHtml,
  isValidGaId,
  isValidGtmId,
  landingFileName,
} from '../lib/landingExport'
import { defaultConsents, defaultFormFields, defaultSections } from '../lib/landingTemplate'
import type { LandingPage, ProgramSession, Project } from '../types/entities'

const idFor = (kind: string) => `t-${kind}`

function makePage(over: Partial<LandingPage> = {}): LandingPage {
  return {
    id: 'lnd-t',
    project_id: 'prj-t',
    title: '테스트 랜딩',
    slug: 'test-landing',
    status: 'draft',
    public_url: null,
    sticky_nav: true,
    cta_label: '신청하기',
    submit_target: 'registration',
    external_submit_url: null,
    analytics: { ga_measurement_id: null, gtm_container_id: null, conversion_event: 'generate_lead' },
    sections: defaultSections(idFor),
    form_fields: defaultFormFields(idFor),
    consents: defaultConsents(idFor),
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
    published_at: null,
    ...over,
  }
}

describe('DoD-27 (a) 섹션 템플릿', () => {
  it('기본 13섹션이 실측 랜딩 구성 순서로 시드된다', () => {
    const secs = defaultSections(idFor)
    expect(secs).toHaveLength(13)
    expect(secs.map((s) => s.type)).toEqual([
      'hero', 'lead', 'speakers', 'agenda', 'tickets', 'pitch', 'benefits',
      'zones', 'sponsors', 'venue', 'faq', 'form', 'footer',
    ])
    expect(secs.every((s) => s.visible)).toBe(true)
    expect(secs.map((s) => s.sort_order)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13])
  })

  it('폼·동의 기본값 — 필수 동의가 최소 1건 존재한다', () => {
    expect(defaultFormFields(idFor).map((f) => f.label)).toContain('회사 이메일')
    expect(defaultConsents(idFor).filter((c) => c.required)).toHaveLength(1)
  })

  it('섹션·항목 id가 결정론적이다 (같은 입력 → 같은 id)', () => {
    expect(defaultSections(idFor).map((s) => s.id)).toEqual(defaultSections(idFor).map((s) => s.id))
  })
})

describe('DoD-27 (b) 행사 데이터 autofill', () => {
  const project = {
    id: 'prj-t',
    name: '가상 테크 서밋',
    event_date: '2026-05-07',
    start_time: '10:00',
    end_time: '18:00',
    venue: '가상 컨벤션홀',
  } as unknown as Project

  const sessions: ProgramSession[] = [
    {
      id: 's1', project_id: 'prj-t', section: null, start_time: '10:30', end_time: '11:00',
      title: '오프닝 키노트', speaker_name: '홍길동', speaker_title: '대표', speaker_org: '가상컴퍼니',
      note: null, track: null, sort_order: 1,
    },
    {
      id: 's2', project_id: 'prj-t', section: null, start_time: '11:10', end_time: '11:40',
      title: '두 번째 세션', speaker_name: '홍길동', speaker_title: '대표', speaker_org: '가상컴퍼니',
      note: null, track: null, sort_order: 2,
    },
    {
      id: 's3', project_id: 'prj-t', section: null, start_time: '13:00', end_time: '13:40',
      title: '패널 토크', speaker_name: '김철수', speaker_title: 'CTO', speaker_org: '가상랩스',
      note: null, track: null, sort_order: 3,
    },
  ]
  const src = { project, sessions, zoneDeliverables: [] }

  it('히어로 보조 줄에 일시·시간·장소가 조립된다', () => {
    expect(heroMetaLine(project)).toBe('2026.05.07(목) | 10:00-18:00 | 가상 컨벤션홀')
  })

  it('타임테이블은 세션 전체를 정렬 순으로 싣는다', () => {
    const agenda = defaultSections(idFor).find((s) => s.type === 'agenda')!
    const filled = autofillSection(agenda, src)
    expect(filled.items).toHaveLength(3)
    expect(filled.items[0].label).toBe('오프닝 키노트')
    expect(filled.items[0].meta).toBe('10:30-11:00')
  })

  it('연사 카드는 중복 연사를 한 장으로 합친다', () => {
    const speakers = defaultSections(idFor).find((s) => s.type === 'speakers')!
    const filled = autofillSection(speakers, src)
    expect(filled.items.map((i) => i.label)).toEqual(['홍길동', '김철수'])
  })

  it('autofill을 끄면 저장된 items가 그대로 유지된다 (입력값 보존)', () => {
    const agenda = defaultSections(idFor).find((s) => s.type === 'agenda')!
    const manual = { ...agenda, autofill: false, items: [
      { id: 'x', label: '직접 입력 세션', detail: null, meta: '09:00', image_url: null, sort_order: 1 },
    ] }
    expect(autofillSection(manual, src).items[0].label).toBe('직접 입력 세션')
  })

  it('autofill을 지원하지 않는 섹션은 통과시켜도 불변', () => {
    const faq = defaultSections(idFor).find((s) => s.type === 'faq')!
    expect(autofillSections([faq], src)[0]).toEqual(faq)
  })
})

describe('DoD-27 (c) GA 주입 — 유효할 때만, 없으면 외부 요청 0건', () => {
  it('측정 ID가 없으면 스크립트가 비고 googletagmanager 호출이 없다', () => {
    const html = buildLandingHtml(makePage(), makePage().sections)
    expect(analyticsSnippet(makePage())).toBe('')
    expect(html).not.toContain('googletagmanager.com')
  })

  it('유효한 GA4 ID면 gtag 스니펫이 head에 들어간다', () => {
    const page = makePage({
      analytics: { ga_measurement_id: 'G-ABCD123456', gtm_container_id: null, conversion_event: 'generate_lead' },
    })
    const html = buildLandingHtml(page, page.sections)
    expect(html).toContain('https://www.googletagmanager.com/gtag/js?id=G-ABCD123456')
    expect(html).toContain("gtag('config','G-ABCD123456')")
  })

  it('형식이 틀린 ID는 주입하지 않는다 (임의 문자열이 script로 새지 않음)', () => {
    for (const bad of ['UA-123-1', 'G-', "G-x');alert(1);//", 'not-an-id']) {
      const page = makePage({
        analytics: { ga_measurement_id: bad, gtm_container_id: null, conversion_event: 'e' },
      })
      expect(analyticsSnippet(page)).toBe('')
      expect(isValidGaId(bad)).toBe(false)
    }
  })

  it('GTM ID도 형식 검증 후에만 주입된다', () => {
    expect(isValidGtmId('GTM-ABC1234')).toBe(true)
    expect(isValidGtmId('GTM-')).toBe(false)
    const page = makePage({
      analytics: { ga_measurement_id: null, gtm_container_id: 'GTM-ABC1234', conversion_event: 'e' },
    })
    expect(analyticsSnippet(page)).toContain('gtm.js?id=')
  })

  it('전환 이벤트 이름이 제출 핸들러에 반영된다', () => {
    const page = makePage({
      analytics: { ga_measurement_id: 'G-ABCD123456', gtm_container_id: null, conversion_event: 'signup_done' },
    })
    expect(buildLandingHtml(page, page.sections)).toContain("track('signup_done'")
  })
})

describe('DoD-27 (d) HTML 내보내기', () => {
  it('자가완결 문서 — doctype·인라인 CSS·외부 스타일/스크립트 없음', () => {
    const page = makePage()
    const html = buildLandingHtml(page, page.sections)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<style>')
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toMatch(/<script[^>]+src="(?!https:\/\/www\.googletagmanager)/)
  })

  it('사용자 입력이 이스케이프된다 (마크업 주입 차단)', () => {
    const page = makePage({ title: '<img src=x onerror=alert(1)>' })
    const html = buildLandingHtml(page, page.sections)
    expect(html).not.toContain('<img src=x onerror')
    expect(html).toContain(escapeHtml('<img src=x onerror=alert(1)>'))
  })

  it('숨긴 섹션은 출력되지 않는다', () => {
    const page = makePage()
    const secs = page.sections.map((s) => (s.type === 'faq' ? { ...s, visible: false } : s))
    expect(buildLandingHtml(page, secs)).not.toContain('id="sec-faq"')
  })

  it('마감(closed) 상태면 CTA가 잠기고 제출 버튼이 비활성', () => {
    const page = makePage({ status: 'closed' })
    const html = buildLandingHtml(page, page.sections)
    expect(html).toContain('신청 마감')
    expect(html).toContain('<button type="submit" disabled>')
  })

  it('파일명은 slug 기반이며 안전 문자만 남는다', () => {
    expect(landingFileName(makePage({ slug: 'a/b c' }))).toBe('a-b-c.html')
  })
})

describe('DoD-27 (e) MockProvider — CRUD·발행·리드 유입', () => {
  let provider: MockProvider

  beforeEach(() => {
    provider = new MockProvider(createFixtureState())
  })

  it('픽스처 랜딩 1건과 30일 지표가 시드된다', async () => {
    const pages = await provider.listLandingPages(PROJECT_ID)
    expect(pages).toHaveLength(1)
    expect(pages[0].id).toBe(LANDING_ID_SAMPLE)
    expect(await provider.listLandingMetrics(LANDING_ID_SAMPLE)).toHaveLength(30)
  })

  it('생성 시 slug 형식·중복을 막는다', async () => {
    await expect(
      provider.createLandingPage(PROJECT_ID, { title: 'x', slug: '한글' }),
    ).rejects.toThrow(/slug/)
    await expect(
      provider.createLandingPage(PROJECT_ID, { title: 'x', slug: 'sample-tech-2026' }),
    ).rejects.toThrow(/사용 중/)
  })

  it('섹션 순서를 바꿔 저장하면 sort_order가 재부여된다', async () => {
    const page = await provider.getLandingPage(LANDING_ID_SAMPLE)
    const reordered = [page.sections[1], page.sections[0], ...page.sections.slice(2)]
    const saved = await provider.updateLandingPage(page.id, { sections: reordered })
    expect(saved.sections[0].type).toBe('lead')
    expect(saved.sections.map((s) => s.sort_order)).toEqual(
      saved.sections.map((_, i) => i + 1),
    )
  })

  it('발행 표시는 http(s) URL만 받고, null이면 초안으로 되돌린다', async () => {
    await expect(provider.publishLandingPage(LANDING_ID_SAMPLE, 'ftp://x')).rejects.toThrow(/URL/)
    const published = await provider.publishLandingPage(LANDING_ID_SAMPLE, 'https://example.com/a/')
    expect(published.status).toBe('published')
    expect(published.published_at).not.toBeNull()
    const reverted = await provider.publishLandingPage(LANDING_ID_SAMPLE, null)
    expect(reverted.status).toBe('draft')
    expect(reverted.public_url).toBeNull()
  })

  it('폼 제출이 등록(S4) Attendee로 유입된다', async () => {
    const page = await provider.getLandingPage(LANDING_ID_SAMPLE)
    const f = (needle: string) => page.form_fields.find((x) => x.label.includes(needle))!.id
    const before = (await provider.listAttendees(page.project_id)).length
    const attendee = await provider.submitLandingLead(page.id, {
      [`f_${f('성함')}`]: '박영희',
      [`f_${f('회사')}`]: '가상컴퍼니',
      [`f_${f('이메일')}`]: 'a@example.com',
      [`f_${f('휴대전화')}`]: '010-0000-0001',
      [`c_${page.consents.find((c) => c.required)!.id}`]: 'on',
    })
    expect(attendee.name).toBe('박영희')
    expect(attendee.channel).toBe('rsvp')
    expect((await provider.listAttendees(page.project_id)).length).toBe(before + 1)
  })

  it('필수 동의 없이 제출하면 거부된다', async () => {
    const page = await provider.getLandingPage(LANDING_ID_SAMPLE)
    const nameId = page.form_fields.find((x) => x.label.includes('성함'))!.id
    await expect(
      provider.submitLandingLead(page.id, { [`f_${nameId}`]: '박영희' }),
    ).rejects.toThrow(/동의/)
  })

  it('제출이 당일 지표(신청 완료)에 반영된다', async () => {
    const page = await provider.getLandingPage(LANDING_ID_SAMPLE)
    const f = (needle: string) => page.form_fields.find((x) => x.label.includes(needle))!.id
    const today = new Date().toISOString().slice(0, 10)
    const before = (await provider.listLandingMetrics(page.id)).find((m) => m.date === today)
    await provider.submitLandingLead(page.id, {
      [`f_${f('성함')}`]: '김민수',
      [`c_${page.consents.find((c) => c.required)!.id}`]: 'on',
    })
    const after = (await provider.listLandingMetrics(page.id)).find((m) => m.date === today)!
    expect(after.submits).toBe((before?.submits ?? 0) + 1)
  })
})

describe('DoD-27 (f) 지표 픽스처', () => {
  it('깔때기가 뷰 ≥ 폼 열람 ≥ 신청 완료 순으로 성립한다', () => {
    for (const row of buildLandingMetrics('2026-08-22')) {
      expect(row.views).toBeGreaterThanOrEqual(row.form_starts)
      expect(row.form_starts).toBeGreaterThanOrEqual(row.submits)
      expect(row.unique_visitors).toBeLessThanOrEqual(row.views)
    }
  })

  it('결정론적이다 — 같은 기준일이면 같은 수치', () => {
    expect(buildLandingMetrics('2026-08-22')).toEqual(buildLandingMetrics('2026-08-22'))
  })
})

// ── H1 (v2.1 §4-21) 랜딩 스코프 계약 ───────────────────────────────
// 랜딩은 행사에 종속된다. 스코프는 인자로 받은 projectId가 정하며,
// 사용자의 멤버십 첫 행(currentUser().project_id)에서 유도하지 않는다.
describe('DoD-27 (g) 랜딩 스코프 계약 (§4-21)', () => {
  let provider: MockProvider

  beforeEach(() => {
    provider = new MockProvider(createFixtureState())
  })

  it('행사 A→B 전환 시 랜딩 목록이 바뀐다 (R-L1)', async () => {
    const a = await provider.listLandingPages(PROJECT_ID)
    const b = await provider.listLandingPages(PROJECT_ID_REBUILD27)
    expect(a.map((l) => l.id)).toEqual([LANDING_ID_SAMPLE])
    expect(b.map((l) => l.id)).toEqual([LANDING_ID_REBUILD27])
    // 각 목록은 자기 행사 것만 담는다 — 교차 노출 0건
    expect(a.every((l) => l.project_id === PROJECT_ID)).toBe(true)
    expect(b.every((l) => l.project_id === PROJECT_ID_REBUILD27)).toBe(true)

    const closed = await provider.listLandingPages(PROJECT_ID_REBUILD26)
    expect(closed.map((l) => l.id)).toEqual([LANDING_ID_REBUILD26])
    expect(closed[0].status).toBe('published')
  })

  it('종료 행사에서 랜딩 생성은 409다 (R-L3)', async () => {
    // 결함 재현 방지: 사용자의 첫 멤버십이 진행 중 행사여도 종료 행사 쓰기는 막혀야 한다
    await expect(
      provider.createLandingPage(PROJECT_ID_REBUILD26, { title: '재오픈', slug: 'reopen' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(await provider.listLandingPages(PROJECT_ID_REBUILD26)).toHaveLength(1)
  })

  it('같은 slug를 서로 다른 행사에 만들 수 있다 (R-L4)', async () => {
    // 픽스처가 이미 ⑤·⑥ 두 행사에 slug 'rebuild'를 갖고 있다
    const created = await provider.createLandingPage(PROJECT_ID, {
      title: '샘플 행사 2차 랜딩',
      slug: 'rebuild',
    })
    expect(created.slug).toBe('rebuild')
    expect(created.project_id).toBe(PROJECT_ID)
    // 같은 행사 안에서의 중복만 막는다
    await expect(
      provider.createLandingPage(PROJECT_ID, { title: '또', slug: 'rebuild' }),
    ).rejects.toThrow(/사용 중/)
  })

  it('생성된 랜딩은 인자로 받은 행사에 붙는다 — 멤버십 첫 행이 아니다 (R-L1)', async () => {
    const created = await provider.createLandingPage(PROJECT_ID_REBUILD27, {
      title: '차기 행사 랜딩',
      slug: 'next-round',
    })
    expect(created.project_id).toBe(PROJECT_ID_REBUILD27)
    const user = await provider.getCurrentUser()
    expect(created.project_id).not.toBe(user.project_id)
    expect((await provider.listLandingPages(PROJECT_ID_REBUILD27)).map((l) => l.id)).toContain(
      created.id,
    )
    expect((await provider.listLandingPages(user.project_id)).map((l) => l.id)).not.toContain(
      created.id,
    )
  })
})

// ── 행사별 랜딩 차별화 (§4-21) ─────────────────────────────────────
// 랜딩은 행사에 종속된 산출물이므로 목록만 갈라지면 안 되고 **내용도 달라야** 한다.
// autofill 섹션(hero·speakers·agenda·zones·venue)은 각 행사의 세션·존·개요에서 조립되고,
// 나머지 카피는 픽스처가 행사 단계에 맞게 채운다(종료 행사=확정본 / 준비 중=작성 중).
describe('DoD-27 (h) 행사별 랜딩 내용', () => {
  let provider: MockProvider

  beforeEach(() => {
    provider = new MockProvider(createFixtureState())
  })

  it('행사마다 랜딩 카피가 다르다 — 같은 기본 템플릿이 아니다', async () => {
    const rb26 = await provider.getLandingPage(LANDING_ID_REBUILD26)
    const rb27 = await provider.getLandingPage(LANDING_ID_REBUILD27)
    const sample = await provider.getLandingPage(LANDING_ID_SAMPLE)

    const lead = (p: typeof rb26) => p.sections.find((s) => s.type === 'lead')!.headline
    expect(new Set([lead(rb26), lead(rb27), lead(sample)]).size).toBe(3)

    // 종료 행사는 확정 문구, 준비 중 행사는 작성 중 문구
    expect(lead(rb27)).toContain('가안')
    expect(lead(rb26)).not.toContain('가안')
  })

  it('행사 단계가 섹션 내용에 드러난다', async () => {
    const rb26 = await provider.getLandingPage(LANDING_ID_REBUILD26)
    const rb27 = await provider.getLandingPage(LANDING_ID_REBUILD27)
    const tickets = (p: typeof rb26) => p.sections.find((s) => s.type === 'tickets')!

    // 진행된 행사는 티켓 구성이 잡혀 있고, 준비 중 행사는 미정이다
    expect(tickets(rb26).items.length).toBeGreaterThan(tickets(rb27).items.length)
    expect(tickets(rb27).items[0].meta).toBe('미정')
    expect(tickets(rb26).items.some((i) => i.label.includes('애프터파티'))).toBe(true)

    // FAQ도 행사마다 다르다
    const faq = (p: typeof rb26) => p.sections.find((s) => s.type === 'faq')!.items.length
    expect(faq(rb26)).toBeGreaterThan(faq(rb27))
  })

  it('autofill 섹션은 각 행사의 세션·존에서 조립된다', async () => {
    for (const [landingId, projectId] of [
      [LANDING_ID_REBUILD26, PROJECT_ID_REBUILD26],
      [LANDING_ID_REBUILD27, PROJECT_ID_REBUILD27],
    ] as const) {
      const page = await provider.getLandingPage(landingId)
      const filled = autofillSections(page.sections, {
        project: await provider.getProject(projectId),
        sessions: await provider.listProgramSessions(projectId),
        // 편집기와 같은 필터 — 존 운영 항목만 autofill 소스로 쓴다
        zoneDeliverables: (await provider.listDeliverables(projectId, { area: 'ops' })).filter(
          (d) => d.category?.includes('존'),
        ),
      })
      const agenda = filled.find((s) => s.type === 'agenda')!
      const sessions = await provider.listProgramSessions(projectId)
      expect(agenda.items).toHaveLength(sessions.length)
    }

    // 두 행사의 타임테이블 길이가 실제로 다르다 (20세션 vs 가안 4세션)
    const n = async (pid: string) => (await provider.listProgramSessions(pid)).length
    expect(await n(PROJECT_ID_REBUILD26)).not.toBe(await n(PROJECT_ID_REBUILD27))
  })
})
