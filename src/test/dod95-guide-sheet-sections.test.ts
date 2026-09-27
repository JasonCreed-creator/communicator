// DoD 95 (Phase 6.11 PR-A · 설계서 v2.21 §27.2) — 마스터 시트 대체: 운영가이드 섹션 3종(답사 체크리스트 · 설치 도면 · 참가자 안내).
// ① 순수 함수(정본 순서 15종 · 템플릿 · 발송일 오프셋 · 글 변환 · 비어 있음 · 뼈대 끼우기)
// ② provider(mock) — 15섹션 시드 · data 검사 · 운영계획서 조립(도면 = 항목 최신 버전 · 답사 = 확인 줄만 · 참가자 안내 = 원고 제외)
// ③ 16:9 장표 — 03 공간·설치(답사·도면) · 05 참가자(안내 일정) · 원고 0
// ④ 홈 '오늘 할 일' 출처 +1 — 발송일 오늘·지남, 발송 완료 제외, 내 차례 = pm·reg
// ⑤ Slack 리마인드 — messaging_due 문구(단계·시각·채널 · 운영 스레드 · 원고 0)
import { describe, expect, it } from 'vitest'
import { reminderUnits } from '../../api/_lib/notify/format'
import { buildTodayRows } from '../components/home/todayItems'
import { buildPlanDeck, type DeckSlide } from '../components/plan/deck/planDeck'
import { planFloorplanFigures, planMessagingLines, planSurveyFindings } from '../components/plan/planGuideExtras'
import { PROJECT_ID } from '../fixtures/sampleProject'
import {
  GUIDE_CANON_ORDER,
  buildFloorplanData,
  buildMessagingData,
  buildSurveyData,
  guideDataMarkdown,
  guideDataProblem,
  isDataGuideKind,
  isGuideSectionEmpty,
  mergeGuideSkeleton,
  messagingDueRows,
  missingGuideKinds,
  offsetIsoDate,
} from '../lib/guideStructured'
import { addDays, toIsoDate } from '../lib/wbs'
import { MockProvider } from '../providers/mock/MockProvider'
import type { GuideMessagingData, GuideMessagingRow, GuideSectionData, GuideSurveyData } from '../types/entities'
import type { GuideSectionKind } from '../types/enums'
import type { GuideSectionInput } from '../types/views'

const TODAY = new Date('2026-10-20T09:00:00')

const messagingRow = (patch: Partial<GuideMessagingRow>): GuideMessagingRow => ({
  stage: '최종 참가 안내',
  send_on: '2026-10-15',
  send_at: '10:00',
  channel: 'alimtalk',
  audience: '참가 확정자',
  subject: '참가 안내',
  body: '안녕하세요. 행사 안내드립니다.',
  status: 'ready',
  ...patch,
})

describe('DoD 95 ① 순수 함수 — 정본 순서 · 템플릿 · 발송일 · 글 변환', () => {
  it('정본 순서 15종 — 답사는 맨 앞(setup 앞) · 도면은 setup 뒤 · 참가자 안내는 registration 앞', () => {
    expect(GUIDE_CANON_ORDER).toHaveLength(15)
    const at = (k: GuideSectionKind) => GUIDE_CANON_ORDER.indexOf(k)
    expect(at('survey')).toBe(0)
    expect(at('setup')).toBe(1)
    expect(at('floorplan')).toBe(2)
    expect(at('messaging')).toBe(at('registration') - 1)
    for (const k of ['survey', 'floorplan', 'messaging'] as const) expect(isDataGuideKind(k)).toBe(true)
  })

  it('답사 템플릿 — 외부 6 · 내부 8 · 확인내용·담당자는 비움 · 답사일 없음 · 회사·베뉴 고유 문구 없음', () => {
    const d = buildSurveyData()
    expect(d.rows.filter((r) => r.scope === 'external')).toHaveLength(6)
    expect(d.rows.filter((r) => r.scope === 'internal')).toHaveLength(8)
    expect(d.rows.every((r) => r.finding === '' && r.owner === '' && r.item && r.check)).toBe(true)
    expect(d.visited_on).toBeNull()
    expect(buildFloorplanData()).toEqual({ type: 'floorplan', items: [] })
  })

  it('참가자 안내 템플릿 — 단계 6 · 발송일 = 행사일 D-7·D-1·D-day(앞 3단계는 null) · 원고는 비움 · 행사일 없으면 전부 null', () => {
    const d = buildMessagingData({ project: { kind: 'agency', event_date: '2026-10-22', start_time: null, end_time: null, venue: null, expected_headcount: null } })
    expect(d.rows).toHaveLength(6)
    expect(d.rows.map((r) => r.send_on)).toEqual([null, null, null, '2026-10-15', '2026-10-21', '2026-10-22'])
    expect(d.rows.every((r) => r.subject === '' && r.body === '' && r.status === 'draft' && r.channel === 'alimtalk')).toBe(true)
    const none = buildMessagingData({ project: { kind: 'agency', event_date: null, start_time: null, end_time: null, venue: null, expected_headcount: null } })
    expect(none.rows.every((r) => r.send_on === null)).toBe(true)
    // 날짜 오프셋은 월·연 경계를 넘는다 · 모양이 틀리면 null
    expect(offsetIsoDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(offsetIsoDate('2026-01-01', -7)).toBe('2025-12-25')
    expect(offsetIsoDate('2026-1-1', -1)).toBeNull()
  })

  it('오늘 챙길 참가자 안내 — 발송일이 오늘·지남이고 발송 완료가 아닌 줄만(발송일 없는 줄 제외)', () => {
    const data: GuideMessagingData = {
      type: 'messaging',
      rows: [
        messagingRow({ stage: '지남', send_on: '2026-10-15' }),
        messagingRow({ stage: '오늘', send_on: '2026-10-20' }),
        messagingRow({ stage: '내일', send_on: '2026-10-21' }),
        messagingRow({ stage: '보냄', send_on: '2026-10-15', status: 'sent' }),
        messagingRow({ stage: '날짜 없음', send_on: null }),
      ],
    }
    expect(messagingDueRows(data, '2026-10-20').map((x) => [x.index, x.row.stage])).toEqual([
      [0, '지남'],
      [1, '오늘'],
    ])
  })

  it('글 변환 — 답사는 외부/내부 소제목 + 확인·담당 · 도면은 연결 여부 · 참가자 안내는 채널·상태 라벨(표 문법 없음)', () => {
    const survey: GuideSurveyData = {
      ...buildSurveyData(),
      visited_on: '2026-09-30',
      rows: [
        { scope: 'external', item: '주차', detail: '', check: '대수', finding: '200대', owner: '운영' },
        { scope: 'internal', item: '무대', detail: '', check: '', finding: '', owner: '' },
      ],
      notes: ['하역장 오후만'],
    }
    const md = guideDataMarkdown(survey)
    expect(md).toContain('답사일 2026-09-30')
    expect(md).toContain('### 외부')
    expect(md).toContain('주차 — 체크 대수 · 확인 200대 · 담당 운영')
    expect(md).toContain('### 내부')
    expect(md).toContain('### 메모')
    expect(md).not.toContain('|')
    expect(guideDataMarkdown({ type: 'floorplan', items: [{ title: '무대 평면도', deliverable_id: 'dlv-001', note: 'v2' }] })).toContain(
      '무대 평면도 · 항목 연결 · v2',
    )
    const msg = guideDataMarkdown({ type: 'messaging', rows: [messagingRow({})] })
    expect(msg).toContain('최종 참가 안내 · 2026-10-15 10:00 · 알림톡 · 참가 확정자 · 제목 참가 안내 · 발송 준비됨')
    // 원고 본문은 요약 글에 싣지 않는다(운영계획서 ⑦·스냅숏이 이 글을 읽는다)
    expect(msg).not.toContain('안녕하세요')
  })

  it('비어 있음 · 저장 검사 — 도면 []는 비어 있음, 답사·안내는 줄 유무 · 3종은 data 없으면 422 문장', () => {
    expect(isGuideSectionEmpty({ kind: 'floorplan', content: '- x', data: { type: 'floorplan', items: [] } })).toBe(true)
    expect(isGuideSectionEmpty({ kind: 'survey', content: null, data: buildSurveyData() })).toBe(false)
    expect(isGuideSectionEmpty({ kind: 'messaging', content: null, data: { type: 'messaging', rows: [] } })).toBe(true)
    for (const k of ['survey', 'floorplan', 'messaging'] as const) {
      expect(guideDataProblem(k, null)).toMatch(/표 데이터가 필요/)
      expect(guideDataProblem(k, { type: 'vip', rows: [] } as GuideSectionData)).toMatch(/종류가 맞지 않/)
    }
    expect(guideDataProblem('messaging', { type: 'messaging', rows: [] })).toBeNull()
  })

  it('옛 12섹션 문서(v2.13)에는 3종만 빠져 있고 정본 자리에 끼워진다 — 기존 순서 불변', () => {
    const old12 = ['setup', 'staffing', 'radio', 'raci', 'dayplan', 'checklists', 'registration', 'vip', 'safety', 'zone', 'emergency', 'contacts'] as const
    const existing = old12.map((kind, i) => ({ kind, id: `old-${i}` }))
    const missing = missingGuideKinds(existing)
    expect(missing).toEqual(['survey', 'floorplan', 'messaging'])
    const merged = mergeGuideSkeleton(existing, missing.map((kind) => ({ kind, id: `new-${kind}` })))
    expect(merged.map((s) => s.kind)).toEqual([...GUIDE_CANON_ORDER])
    expect(merged.filter((s) => s.id.startsWith('old-')).map((s) => s.id)).toEqual(old12.map((_, i) => `old-${i}`))
  })
})

async function seededGuide(p: MockProvider) {
  const doc = await p.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title: '마스터 시트 가이드' })
  const sections = await p.seedGuideFromSources(doc.id)
  return { doc, sections }
}

const toInput = (s: { id: string; kind: GuideSectionKind; title: string; content: string | null; source_ref: 'zone_items' | 'role_charters' | null; source_stale: boolean; data?: GuideSectionData | null }): GuideSectionInput => ({
  id: s.id,
  kind: s.kind,
  title: s.title,
  content: s.content,
  source_ref: s.source_ref,
  source_stale: s.source_stale,
  data: s.data ?? null,
})

describe('DoD 95 ② provider — 15섹션 시드 · 저장 검사 · 운영계획서 조립', () => {
  it('새 문서 시드 = 15섹션(정본 순서) · 참가자 안내 발송일은 행사일(10/22)에서 · 도면은 비어 있음', async () => {
    const p = new MockProvider()
    const { sections } = await seededGuide(p)
    expect(sections.map((s) => s.kind)).toEqual([...GUIDE_CANON_ORDER])
    const messaging = sections.find((s) => s.kind === 'messaging')!.data
    expect(messaging?.type === 'messaging' && messaging.rows.map((r) => r.send_on)).toEqual([null, null, null, '2026-10-15', '2026-10-21', '2026-10-22'])
    expect(sections.find((s) => s.kind === 'floorplan')!.data).toEqual({ type: 'floorplan', items: [] })
    expect(sections.find((s) => s.kind === 'survey')!.content).toContain('### 외부')
  })

  it('저장 검사 — survey에 data가 없으면 422 · 종류가 다르면 422 · 맞으면 content가 data에서 다시 만들어진다', async () => {
    const p = new MockProvider()
    const { doc, sections } = await seededGuide(p)
    const inputs = sections.map(toInput)
    const survey = inputs.find((s) => s.kind === 'survey')!
    await expect(p.saveGuideSections(doc.id, inputs.map((s) => (s === survey ? { ...s, data: null } : s)))).rejects.toMatchObject({ code: 'validation' })
    await expect(
      p.saveGuideSections(doc.id, inputs.map((s) => (s === survey ? { ...s, data: { type: 'floorplan', items: [] } } : s))),
    ).rejects.toMatchObject({ code: 'validation' })
    const rows = (survey.data as GuideSurveyData).rows.map((r, i) => (i === 0 ? { ...r, finding: '지하 2층 200대', owner: '운영' } : r))
    const saved = await p.saveGuideSections(
      doc.id,
      inputs.map((s) => (s === survey ? { ...s, content: '사람이 적은 글', data: { ...(survey.data as GuideSurveyData), rows } } : s)),
    )
    const after = saved.find((s) => s.kind === 'survey')!
    expect(after.content).toContain('확인 지하 2층 200대')
    expect(after.content).not.toContain('사람이 적은 글')
  })

  it('운영계획서 조립 — guide에 3종 포함(연락망은 여전히 제외) · 도면 = 연결 항목의 최신 버전(이미지만 그림) · 답사 = 확인 줄만 · 안내 = 원고 제외', async () => {
    const p = new MockProvider()
    const { doc, sections } = await seededGuide(p)
    const inputs = sections.map(toInput)
    const next = inputs.map((s): GuideSectionInput => {
      if (s.kind === 'floorplan')
        return {
          ...s,
          data: {
            type: 'floorplan',
            items: [
              { title: '무대 평면도', deliverable_id: 'dlv-001', note: '최신 시안 기준' }, // 최신 v2 = png → 그림
              { title: '명찰 배치', deliverable_id: 'dlv-002', note: '' }, // 최신 = pdf → 파일 이름만
              { title: '', deliverable_id: null, note: '' },
            ],
          },
        }
      if (s.kind === 'survey') {
        const d = s.data as GuideSurveyData
        return { ...s, data: { ...d, visited_on: '2026-09-30', rows: d.rows.map((r, i) => (i === 1 ? { ...r, finding: '오후만 가능' } : r)) } }
      }
      if (s.kind === 'messaging') return { ...s, data: { type: 'messaging', rows: [messagingRow({ body: '비밀 원고 본문' })] } }
      return s
    })
    await p.saveGuideSections(doc.id, next)
    const plan = await p.getPlan(PROJECT_ID)
    expect(plan.guide?.deliverable_id).toBe(doc.id)
    for (const k of ['survey', 'floorplan', 'messaging']) expect(plan.guide?.sections.some((s) => s.kind === k)).toBe(true)
    expect(plan.guide?.sections.some((s) => s.kind === 'contacts')).toBe(false)

    const figures = planFloorplanFigures(plan)
    expect(figures).toHaveLength(3)
    expect(figures[0].image_url).toBeTruthy()
    expect(figures[0].version?.file_name).toMatch(/\.png$/)
    expect(figures[1].image_url).toBeNull()
    expect(figures[1].version?.file_name).toMatch(/\.pdf$/)
    expect(figures[2]).toMatchObject({ title: '도면 3', version: null, image_url: null, item_title: null })

    const survey = planSurveyFindings(plan)
    expect(survey.visited_on).toBe('2026-09-30')
    expect(survey.rows.map((r) => r.finding)).toEqual(['오후만 가능'])

    const lines = planMessagingLines(plan)
    expect(lines).toEqual([{ stage: '최종 참가 안내', when: '10월 15일 10:00', channel: '알림톡', audience: '참가 확정자', status: '발송 준비됨', sent: false }])
    expect(JSON.stringify(lines)).not.toContain('비밀 원고 본문')
  })
})

describe('DoD 95 ③ 16:9 장표 — 03 공간·설치(답사·도면) · 05 참가자(안내 일정)', () => {
  it('확인한 답사 줄 → 표 · 도면 → figures 장(2개씩) · 참가자 안내 → 표(원고 0) · 비면 싣지 못한 표', async () => {
    const p = new MockProvider()
    const { doc, sections } = await seededGuide(p)
    const before = buildPlanDeck(await p.getPlan(PROJECT_ID), TODAY)
    expect(before.gaps.map((g) => g.label)).toEqual(expect.arrayContaining(['답사 체크리스트', '설치 도면']))
    expect(before.slides.some((s) => s.title === '참가자 안내')).toBe(true) // 뼈대 6단계는 일정으로 실린다

    await p.saveGuideSections(
      doc.id,
      sections.map(toInput).map((s): GuideSectionInput => {
        if (s.kind === 'floorplan')
          return {
            ...s,
            data: { type: 'floorplan', items: [1, 2, 3].map((n) => ({ title: `도면 ${n}`, deliverable_id: 'dlv-001', note: '' })) },
          }
        if (s.kind === 'survey') {
          const d = s.data as GuideSurveyData
          return { ...s, data: { ...d, rows: d.rows.map((r, i) => (i < 2 ? { ...r, finding: `확인 ${i}` } : r)) } }
        }
        if (s.kind === 'messaging') return { ...s, data: { type: 'messaging', rows: [messagingRow({ body: '비밀 원고 본문', status: 'sent' })] } }
        return s
      }),
    )
    const deck = buildPlanDeck(await p.getPlan(PROJECT_ID), TODAY)
    const survey = deck.slides.find((s) => s.title === '답사 체크리스트') as Extract<DeckSlide, { kind: 'table' }>
    expect(survey.kind).toBe('table')
    expect(survey.chapter).toBe('space')
    expect(survey.rows.filter((r) => 'cells' in r)).toHaveLength(2)
    const figures = deck.slides.filter((s) => s.kind === 'figures') as Extract<DeckSlide, { kind: 'figures' }>[]
    expect(figures.map((s) => s.figures.length)).toEqual([2, 1])
    expect(figures[0].part).toEqual({ index: 1, total: 2 })
    expect(figures[0].figures[0].image_url).toBeTruthy()
    const messaging = deck.slides.find((s) => s.title === '참가자 안내') as Extract<DeckSlide, { kind: 'table' }>
    expect(messaging.chapter).toBe('people')
    expect(messaging.subtitle).toBe('발송 완료 1 / 1')
    expect(JSON.stringify(deck)).not.toContain('비밀 원고 본문')
    expect(deck.gaps.map((g) => g.label)).not.toContain('설치 도면')
    // 장 순서: 답사 → 설치·철거 → 도면 → 존별 운영
    const space = deck.slides.filter((s) => s.chapter === 'space').map((s) => s.title)
    expect(space.indexOf('답사 체크리스트')).toBeLessThan(space.indexOf('설치·철거 일정'))
    expect(space.indexOf('설치·철거 일정')).toBeLessThan(space.indexOf('설치 도면'))
  })
})

describe('DoD 95 ④ 홈 오늘 할 일 — 참가자 안내 발송일', () => {
  const today = toIsoDate(new Date())
  const input = (roles: Array<'pm' | 'design' | 'ops' | 'reg'>) => ({
    delayed: [],
    lateMilestones: [],
    imminent: [],
    approvals: [],
    partnerPending: [],
    overBudget: [],
    inbox: [],
    guides: [],
    messaging: [
      { deliverableId: 'dlv-g', sectionId: 'gs-1', index: 3, row: messagingRow({ stage: '최종 참가 안내', send_on: addDays(today, -2) }) },
      { deliverableId: 'dlv-g', sectionId: 'gs-1', index: 4, row: messagingRow({ stage: 'D-1 리마인드', send_on: today, send_at: null, channel: 'email' }) },
    ],
    myRoles: roles,
    roleOf: () => null,
    nameOf: () => null,
  })

  it('지난 발송일 = 발송 지남(blocked) · 오늘 = 오늘 발송(attention) · 원고 열기 → 운영가이드 항목 · 원고 본문 0', () => {
    const rows = buildTodayRows(input(['pm']))
    expect(rows.map((r) => [r.kind, r.status, r.level])).toEqual([
      ['messaging', '발송 지남', 'blocked'],
      ['messaging', '오늘 발송', 'attention'],
    ])
    expect(rows[0].title).toBe('참가자 안내 · 최종 참가 안내')
    expect(rows[0].sub).toContain('알림톡 · 참가 확정자 · 10:00')
    expect(rows[1].sub).toContain('이메일')
    expect(rows.every((r) => r.to === '/items/dlv-g' && r.action === '원고 열기' && r.role === 'reg')).toBe(true)
    expect(JSON.stringify(rows)).not.toContain('안녕하세요')
  })

  it("'내 차례' = pm·reg(등록 담당) · design·ops는 아니다", () => {
    expect(buildTodayRows(input(['pm'])).every((r) => r.mine)).toBe(true)
    expect(buildTodayRows(input(['reg'])).every((r) => r.mine)).toBe(true)
    expect(buildTodayRows(input(['design'])).every((r) => !r.mine)).toBe(true)
    expect(buildTodayRows(input(['ops'])).every((r) => !r.mine)).toBe(true)
  })
})

describe('DoD 95 ⑤ Slack 리마인드 — 참가자 안내 발송일 D-1', () => {
  const base = 'https://app.example.com/'
  const P1 = '11111111-1111-4111-8111-111111111111'
  const D1 = '33333333-3333-4333-8333-333333333333'

  it('문구 = [행사명] [WBS] 참가자 안내 단계 — 발송일 D-1 · 시각 · 채널 + 원고 열기 링크 · 단계 없으면 줄 없음 · 원고 0', () => {
    const [u, none] = reminderUnits(
      [
        {
          key: 'rem:messaging:s:3:2026-10-15',
          kind: 'messaging_due',
          project_id: P1,
          project_code: 'X',
          project_name: '가상 컨퍼런스',
          webhook: null,
          thread: 'https://ws.slack.com/archives/C0TEST01/p1727251234567890',
          design_thread: 'https://ws.slack.com/archives/C0DESIGN1/p1727260000123456',
          area: 'design',
          deliverable_id: D1,
          stage: '최종 <참가> 안내',
          send_on: '2026-10-15',
          send_at: '10:00',
          channel: 'alimtalk',
          recipients: [{ id: 'p1', name: '등록 담당', email: null, slack_user_id: 'U1' }],
        },
        { key: 'rem:messaging:s:4:2026-10-15', kind: 'messaging_due', project_id: P1, project_code: 'X', project_name: '가상 컨퍼런스', webhook: null, stage: null },
      ],
      base,
    )
    expect(u.line).toBe(
      `[가상 컨퍼런스] [WBS] 참가자 안내 '최종 &lt;참가&gt; 안내' — 발송일 D-1 10:00 · 알림톡 (<${base}items/${D1}?project=${P1}|원고 열기>)`,
    )
    // 늘 운영 스레드(디자인 스레드가 있어도) · 받는 사람 멘션
    expect(u.thread).toBe('https://ws.slack.com/archives/C0TEST01/p1727251234567890')
    expect(u.mentions?.map((m) => m.slack_user_id)).toEqual(['U1'])
    expect(none.line).toBeNull()
    expect(none.mentions).toEqual([])
  })
})
