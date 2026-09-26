// DoD 80 (Phase 3.24 PR-A · 설계서 v2.13 §23.5) — 운영가이드 현장 운영 섹션: 순수 함수(템플릿·계산·글 변환·뼈대 끼워 넣기)와
// provider 계약(12섹션 시드 · data 저장 검사 · content는 data에서 · 운영계획서 ⑦이 새 비상 대응을 읽는다).
import { describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import {
  GUIDE_CANON_ORDER,
  buildRaciData,
  estimateRegistration,
  guideDataMarkdown,
  guideDateLabel,
  isGuideSectionEmpty,
  mergeGuideSkeleton,
  missingGuideKinds,
  staffingTotal,
  withDerivedContent,
} from '../lib/guideStructured'
import { MockProvider } from '../providers/mock/MockProvider'
import type { GuideRegistrationData, GuideSectionData, GuideStaffingData } from '../types/entities'
import type { GuideSectionKind } from '../types/enums'

const reg = (patch: Partial<GuideRegistrationData>): GuideRegistrationData => ({
  type: 'registration',
  lines: 5,
  seconds_per_person: 15,
  peak_minutes: 15,
  peak_arrivals: 400,
  notes: [],
  ...patch,
})

describe('DoD 80 ① 순수 함수 — 날짜 · 계산 · 글 변환', () => {
  it('날짜 표기: 행사일 기준 요일까지, 월 넘김, 날짜 없으면 상대 표기', () => {
    expect(guideDateLabel('2026-12-10', -1)).toBe('12/9 (수)')
    expect(guideDateLabel('2026-12-10', 0)).toBe('12/10 (목)')
    expect(guideDateLabel('2026-03-01', -1)).toBe('2/28 (토)')
    expect(guideDateLabel(null, -1)).toBe('D-1')
    expect(guideDateLabel(null, 0)).toBe('D-day')
  })

  it('등록 처리 용량: 라인 5 · 15초 · 15분 400명 → 분당 20명 · 줄 100명 · 최대 대기 약 5분', () => {
    expect(estimateRegistration(reg({}))).toEqual({ perMinute: 20, queue: 100, waitMinutes: 5 })
    // 처리량 안이면 줄 0 · 대기 0
    expect(estimateRegistration(reg({ peak_arrivals: 250 }))).toEqual({ perMinute: 20, queue: 0, waitMinutes: 0 })
    // 소수 처리 속도는 첫째 자리 · 대기는 올림
    expect(estimateRegistration(reg({ lines: 3, seconds_per_person: 18, peak_arrivals: 200 }))).toEqual({
      perMinute: 10,
      queue: 50,
      waitMinutes: 5,
    })
    // 라인·처리 시간이 없으면 계산하지 않는다(추측 금지)
    expect(estimateRegistration(reg({ lines: null }))).toEqual({ perMinute: null, queue: null, waitMinutes: null })
    // 도착 인원이 없으면 속도만
    expect(estimateRegistration(reg({ peak_arrivals: null }))).toEqual({ perMinute: 20, queue: null, waitMinutes: null })
  })

  it('인력 합계: 인원을 적은 줄만 더한다', () => {
    const d: GuideStaffingData = {
      type: 'staffing',
      rows: [
        { role: 'PM', count: 4, call_time: '', duty: '', channel: '' },
        { role: '요원', count: null, call_time: '', duty: '', channel: '' },
        { role: 'MC', count: 1, call_time: '', duty: '', channel: '' },
      ],
      extra: '',
    }
    expect(staffingTotal(d)).toBe(5)
    expect(guideDataMarkdown(d)).toContain('합계 5명')
  })

  it('글 변환은 초경량 마크다운(### · -)과 문단만 쓴다 — 표 문법(|) 없음, 모든 표 섹션', () => {
    const ctx = {
      project: { kind: 'agency' as const, event_date: '2026-12-10', start_time: '13:00', end_time: '18:00', venue: '가상홀', expected_headcount: 1000 },
      sessions: [],
      memberCount: 4,
    }
    for (const kind of GUIDE_CANON_ORDER) {
      if (kind === 'zone' || kind === 'contacts') continue
      const input = withDerivedContent({ kind, data: null as GuideSectionData | null, content: null as string | null })
      expect(input.content).toBeNull() // data 없으면 손대지 않는다
    }
    const samples: GuideSectionData[] = [
      buildRaciData(ctx),
      reg({ notes: ['등록 시 1인 1회'] }),
      { type: 'emergency', rows: [{ situation: '영상 장애', action: '백업 PC 전환', owner: '영상', channel: 'CH3' }] },
    ]
    for (const d of samples) {
      const md = guideDataMarkdown(d)
      expect(md).not.toContain('|')
      expect(md.trim().length).toBeGreaterThan(0)
    }
    expect(guideDataMarkdown(samples[1])).toContain('최대 대기 약 5분')
    expect(guideDataMarkdown(samples[2])).toBe('- 영상 장애: 백업 PC 전환 (영상 · CH3)')
  })

  it('비어 있음 판정: 표 섹션은 행으로, 마크다운 섹션은 본문으로', () => {
    expect(isGuideSectionEmpty({ kind: 'vip', content: '- (비어 있음)', data: { type: 'vip', rows: [] } })).toBe(true)
    expect(isGuideSectionEmpty({ kind: 'registration', content: '', data: reg({ lines: null, notes: [] }) })).toBe(true)
    expect(isGuideSectionEmpty({ kind: 'registration', content: '', data: reg({}) })).toBe(false)
    expect(isGuideSectionEmpty({ kind: 'zone', content: '  ', data: null })).toBe(true)
    expect(isGuideSectionEmpty({ kind: 'zone', content: '### 로비', data: null })).toBe(false)
  })

  it('역할 분담 템플릿: 대행형 = 주최사·우리·협력사, 주최형 = 파트너사(협조)로 바뀌고 고객 주관은 우리 주관', () => {
    const base = { event_date: null, start_time: null, end_time: null, venue: null, expected_headcount: null }
    const agency = buildRaciData({ project: { kind: 'agency', ...base }, sessions: [], memberCount: 0 })
    const host = buildRaciData({ project: { kind: 'host', ...base }, sessions: [], memberCount: 0 })
    expect(agency.parties).toEqual(['주최사', '우리', '협력사 · 베뉴'])
    expect(host.parties[0]).toBe('파트너사')
    const aRow = agency.rows.find((r) => r.area === '모객 · 초청 발송')!
    const hRow = host.rows.find((r) => r.area === '모객 · 초청 발송')!
    expect(aRow.marks).toEqual(['main', 'help', 'none'])
    expect(hRow.marks).toEqual(['help', 'main', 'none'])
  })
})

describe('DoD 80 ② 옛 문서에 뼈대 끼워 넣기 — 기존 섹션 순서·내용 불변', () => {
  const legacy = (kinds: GuideSectionKind[]) => kinds.map((kind, i) => ({ kind, id: `old-${i}` }))

  it('옛 4섹션(zone·role·emergency·contacts)에는 9종이 빠져 있고, 정본 자리(존별 운영 앞)에 들어간다', () => {
    const old = legacy(['zone', 'role', 'emergency', 'contacts'])
    const missing = missingGuideKinds(old)
    expect(missing).toEqual(['setup', 'staffing', 'radio', 'raci', 'dayplan', 'checklists', 'registration', 'vip', 'safety'])
    const merged = mergeGuideSkeleton(old, missing.map((kind) => ({ kind, id: `new-${kind}` })))
    expect(merged.map((s) => s.kind)).toEqual([
      'setup',
      'staffing',
      'radio',
      'raci',
      'dayplan',
      'checklists',
      'registration',
      'vip',
      'safety',
      'zone',
      'role',
      'emergency',
      'contacts',
    ])
    // 기존 섹션끼리의 순서는 그대로
    expect(merged.filter((s) => s.id.startsWith('old-')).map((s) => s.id)).toEqual(['old-0', 'old-1', 'old-2', 'old-3'])
  })

  it('맨 앞의 진행 원칙(custom)은 맨 앞에 남고, 정본 뒤쪽 종류만 있으면 새 섹션은 끝에 붙는다', () => {
    const merged = mergeGuideSkeleton(legacy(['custom', 'zone']), [{ kind: 'setup', id: 'n1' }, { kind: 'emergency', id: 'n2' }])
    expect(merged.map((s) => s.kind)).toEqual(['custom', 'setup', 'zone', 'emergency'])
  })
})

describe('DoD 80 ③ provider — 12섹션 시드 · 저장 검사 · content는 data에서', () => {
  it('새 문서 시드: 정본 12섹션 · D-1 날짜 · 프로그램표 세션이 본행사 줄(session_id) · 인력 첫 줄 = 담당자 수', async () => {
    const p = new MockProvider()
    const fresh = await p.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title: '현장 가이드' })
    const sections = await p.seedGuideFromSources(fresh.id)
    expect(sections.map((s) => s.kind)).toEqual([...GUIDE_CANON_ORDER])

    const setup = sections.find((s) => s.kind === 'setup')!.data
    expect(setup?.type === 'setup' && setup.rows[0].date).toBe('10/21 (수)')
    expect(setup?.type === 'setup' && setup.rows[2].time).toBe('09:30–17:00')

    const dayplan = sections.find((s) => s.kind === 'dayplan')!.data
    const sessions = await p.listProgramSessions(PROJECT_ID)
    expect(dayplan?.type).toBe('dayplan')
    if (dayplan?.type === 'dayplan') {
      const main = dayplan.rows.filter((r) => r.group === 'main')
      expect(main).toHaveLength(sessions.length)
      expect(main.every((r) => r.session_id !== null)).toBe(true)
      expect(main[0].time).toBe('09:30')
      // 내용 = 연사 → 없으면 비고 · 묶음 기호(section)는 넣지 않는다
      for (const r of main) {
        const src = sessions.find((x) => x.id === r.session_id)!
        const who = [src.speaker_org, src.speaker_title, src.speaker_name].filter((x) => x && x.trim()).join(' ')
        expect(r.content).toBe(who || (src.note ?? '').trim())
      }
      expect(dayplan.rows.filter((r) => r.group === 'pre').length).toBeGreaterThan(0)
    }

    const staffing = sections.find((s) => s.kind === 'staffing')!.data
    const members = await p.listMembers(PROJECT_ID)
    expect(staffing?.type === 'staffing' && staffing.rows[0].count).toBe(members.length)
  })

  it('저장: 표 섹션에 data가 없거나 종류가 다르거나 마크다운 섹션에 data면 거부(validation), content는 data에서 다시 만든다', async () => {
    const p = new MockProvider()
    const fresh = await p.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title: '검사' })
    await expect(p.saveGuideSections(fresh.id, [{ kind: 'staffing', title: 'x', content: '- a' }])).rejects.toMatchObject({ code: 'validation' })
    await expect(
      p.saveGuideSections(fresh.id, [{ kind: 'setup', title: 'x', data: { type: 'vip', rows: [] } }]),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      p.saveGuideSections(fresh.id, [{ kind: 'zone', title: 'x', content: '- a', data: { type: 'vip', rows: [] } }]),
    ).rejects.toMatchObject({ code: 'validation' })

    const saved = await p.saveGuideSections(fresh.id, [
      {
        kind: 'staffing',
        title: '현장 인력·콜타임',
        content: '사람이 적은 글은 무시된다',
        data: { type: 'staffing', rows: [{ role: '현장 운영 요원', count: 12, call_time: '12:00', duty: '대기열', channel: 'CH2' }], extra: '' },
      },
      { kind: 'emergency', title: '비상 대응', content: '- 옛 글 그대로' },
    ])
    expect(saved[0].content).toContain('현장 운영 요원 12명')
    expect(saved[0].content).toContain('합계 12명')
    expect(saved[0].content).not.toContain('사람이 적은 글')
    expect(saved[0].data?.type).toBe('staffing')
    // 옛 비상 대응(마크다운)은 data 없이 그대로 저장된다
    expect(saved[1].data ?? null).toBeNull()
    expect(saved[1].content).toBe('- 옛 글 그대로')
  })

  it('운영계획서 ⑦ 비상 대응이 새 문서의 표 비상 대응을 글로 읽는다 · 연락망은 여전히 없다(R-O6)', async () => {
    const p = new MockProvider()
    const fresh = await p.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title: '계획서 연결' })
    await p.seedGuideFromSources(fresh.id)
    const plan = await p.getPlan(PROJECT_ID)
    expect(plan.emergency?.content ?? '').toContain('영상 장애: 백업 PC 전환')
    expect(JSON.stringify(plan)).not.toContain('개인 휴대폰은 이 문서에 적지 않습니다')
  })

  it('주최형 행사 시드는 역할 분담 첫 열이 파트너사, 지휘 흐름 첫 단계가 파트너·연사 요청', async () => {
    const p = new MockProvider()
    const fresh = await p.createDeliverable({ project_id: PROJECT_ID_HOST, area: 'ops', category: '운영가이드', title: '주최형 가이드' })
    const sections = await p.seedGuideFromSources(fresh.id)
    const raci = sections.find((s) => s.kind === 'raci')!.data
    const radio = sections.find((s) => s.kind === 'radio')!.data
    expect(raci?.type === 'raci' && raci.parties[0]).toBe('파트너사')
    expect(radio?.type === 'radio' && radio.chain[0]).toBe('파트너·연사 요청')
  })

  it('옛 픽스처 문서(RE:BUILD 27)는 그대로 열린다 — data 없는 4섹션, 저장해도 data가 생기지 않는다', async () => {
    const p = new MockProvider()
    const before = await p.listGuideSections('dlv-rb27-guide-01')
    expect(before.map((s) => s.kind)).toEqual(['zone', 'role', 'emergency', 'contacts'])
    expect(before.every((s) => (s.data ?? null) === null)).toBe(true)
    const again = await p.saveGuideSections(
      'dlv-rb27-guide-01',
      before.map((s) => ({ id: s.id, kind: s.kind, title: s.title, content: s.content, source_ref: s.source_ref, source_stale: s.source_stale })),
    )
    expect(again.map((s) => s.content)).toEqual(before.map((s) => s.content))
    expect(again.every((s) => (s.data ?? null) === null)).toBe(true)
  })
})
