// v2.5 §23 — 운영보드 재구성(시나리오·운영가이드) DataProvider v9 8메서드 테스트.
// 픽스처는 RE:BUILD 27(prj-rebuild27, rebuildFixtures.ts §23.4) — 시나리오 1건(3세션 그룹·
// 8블록)·운영가이드 1건(4섹션, zone 섹션 stale=true 데모). 기존 dlv-004(STC26 큐시트)·
// dlv-005(STC26, category='시나리오'이나 v2.5 이전부터 쓰인 레거시 자유 카테고리 — 빌더
// 데이터가 없어 여전히 일반 ops 항목으로 취급돼야 한다, DoD-1 회귀 방지)도 함께 검증한다.
import { beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_REBUILD27 } from '../../fixtures/sampleProject'
import { isStructuredDocCategory, STRUCTURED_DOC_CATEGORIES } from '../../types/enums'
import { ProviderError } from '../../lib/errors'
import { MockProvider } from './MockProvider'

const RB27 = PROJECT_ID_REBUILD27
const SCENARIO_ID = 'dlv-rb27-scenario-01'
const GUIDE_ID = 'dlv-rb27-guide-01'
const RB27_CUE_ID = 'dlv-rb27-cue-01'

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

describe('타입 — 정형 카테고리 판별 헬퍼', () => {
  it('STRUCTURED_DOC_CATEGORIES = 큐시트·시나리오·운영가이드 3종, isStructuredDocCategory가 그대로 판정', () => {
    expect(STRUCTURED_DOC_CATEGORIES).toEqual(['큐시트', '시나리오', '운영가이드'])
    expect(isStructuredDocCategory('큐시트')).toBe(true)
    expect(isStructuredDocCategory('시나리오')).toBe(true)
    expect(isStructuredDocCategory('운영가이드')).toBe(true)
    expect(isStructuredDocCategory('배너')).toBe(false)
  })
})

describe('픽스처 정합 — RE:BUILD 27 (§23.4)', () => {
  it('시나리오 3세션 그룹·블록 8행, video·transition 블록 포함', async () => {
    const blocks = await p.listScenarioBlocks(SCENARIO_ID)
    expect(blocks).toHaveLength(8)
    expect(blocks.map((b) => b.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const sessionIds = new Set(blocks.map((b) => b.session_id))
    expect(sessionIds.size).toBe(3)
    expect(blocks.some((b) => b.kind === 'video')).toBe(true)
    expect(blocks.some((b) => b.kind === 'transition')).toBe(true)
  })

  it('운영가이드 4섹션(zone·role·emergency·contacts), zone 섹션만 stale=true', async () => {
    const sections = await p.listGuideSections(GUIDE_ID)
    expect(sections).toHaveLength(4)
    expect(sections.map((s) => s.kind).sort()).toEqual(['contacts', 'emergency', 'role', 'zone'])
    const stale = sections.filter((s) => s.source_stale)
    expect(stale).toHaveLength(1)
    expect(stale[0].kind).toBe('zone')
    // R-O6 — 개인 연락처 문자열이 픽스처 자체에 없다(테스트가 필요 시 별도 주입)
    const contacts = sections.find((s) => s.kind === 'contacts')!
    expect(contacts.content ?? '').not.toMatch(/010-(?!0000-)\d/)
  })

  it('RB27에 큐시트가 1건뿐이다(2건 미만 — 브리프 지시대로 임의 추가하지 않음)', async () => {
    const items = (await p.listDeliverables(RB27)).filter((d) => d.category === '큐시트')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(RB27_CUE_ID)
  })
})

describe('v9 해피 패스 — 8메서드', () => {
  it('listScenarioBlocks·saveScenarioBlocks — 벌크 전체 교체(정렬 포함)', async () => {
    const before = await p.listScenarioBlocks(SCENARIO_ID)
    expect(before.length).toBeGreaterThan(0)
    const replaced = await p.saveScenarioBlocks(SCENARIO_ID, [
      { kind: 'mc', script: '새 오프닝', note: null },
      { kind: 'video', script: '새 영상 M-99', note: null },
    ])
    expect(replaced).toHaveLength(2)
    expect(replaced.map((b) => b.sort_order)).toEqual([1, 2])
    const after = await p.listScenarioBlocks(SCENARIO_ID)
    expect(after).toHaveLength(2)
    expect(after[0].script).toBe('새 오프닝')
  })

  it('seedScenarioFromProgram — 빈 문서에서 세션당 헤더+기본 블록 생성', async () => {
    const fresh = await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '테스트 시나리오',
    })
    const built = await p.seedScenarioFromProgram(fresh.id)
    const sessions = await p.listProgramSessions(RB27)
    expect(built).toHaveLength(sessions.length * 2)
    const sessionIds = new Set(built.map((b) => b.session_id))
    expect(sessionIds.size).toBe(sessions.length)
    expect(built.every((b) => b.kind === 'custom' || b.kind === 'mc')).toBe(true)
  })

  it('listGuideSections·saveGuideSections — 벌크 전체 교체, id 재사용 시 identity 유지', async () => {
    const before = await p.listGuideSections(GUIDE_ID)
    const zone = before.find((s) => s.kind === 'zone')!
    const saved = await p.saveGuideSections(
      GUIDE_ID,
      before.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.kind === 'zone' ? '반영된 내용' : s.content,
        source_ref: s.source_ref,
        source_stale: s.kind === 'zone' ? false : s.source_stale,
      })),
    )
    const savedZone = saved.find((s) => s.kind === 'zone')!
    expect(savedZone.id).toBe(zone.id) // id 재사용 — identity 유지
    expect(savedZone.content).toBe('반영된 내용')
    expect(savedZone.source_stale).toBe(false)
  })

  it('seedGuideFromSources — 빈 문서에서 4섹션 초기 로드(존별 운영·R&R 연동)', async () => {
    const fresh = await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '운영가이드',
      title: '테스트 운영가이드',
    })
    const built = await p.seedGuideFromSources(fresh.id)
    expect(built.map((s) => s.kind).sort()).toEqual(['contacts', 'emergency', 'role', 'zone'])
    const zone = built.find((s) => s.kind === 'zone')!
    expect(zone.source_ref).toBe('zone_items')
    expect(zone.source_stale).toBe(false)
    // 존별 운영 원본(존 구성 (가안))에서 실제로 조립됐다
    expect(zone.content).toContain('존 구성 (가안)')
    const role = built.find((s) => s.kind === 'role')!
    expect(role.source_ref).toBe('role_charters')
    expect((role.content ?? '').length).toBeGreaterThan(0)
  })
})

describe('R-O3 — seed는 빈 문서에서만(재시드 409)', () => {
  it('시나리오: 이미 블록이 있으면 409', async () => {
    await expectError(() => p.seedScenarioFromProgram(SCENARIO_ID), 409)
  })

  it('운영가이드: 이미 섹션이 있으면 409', async () => {
    await expectError(() => p.seedGuideFromSources(GUIDE_ID), 409)
  })
})

describe('R-O5·§23.3 — exportScenarioToCues 변환 규칙', () => {
  it('기존 큐 보존 + 후미 삽입, 대본 미복사, 토큰→채널 배치(M→audio·C→light·V→screen)', async () => {
    const existing = await p.createCue(RB27_CUE_ID, {
      cue_no: 'C00',
      segment: '사전',
      body: '기존 큐(변형 금지)',
    })
    const before = await p.listCues(RB27_CUE_ID)
    expect(before).toHaveLength(1)

    const newCues = await p.exportScenarioToCues(SCENARIO_ID, RB27_CUE_ID)
    // 후보 = video·transition 블록 중 토큰이 있는 3개(scb-03·06·08)
    expect(newCues).toHaveLength(3)

    const after = await p.listCues(RB27_CUE_ID)
    expect(after).toHaveLength(4)
    // 기존 큐가 그대로 맨 앞에 보존된다(후미 삽입)
    expect(after[0].id).toBe(existing.id)
    expect(after[0].body).toBe('기존 큐(변형 금지)')
    expect(after.slice(1).every((c) => c.sort_order > before[0].sort_order)).toBe(true)

    const videoCue = after.find((c) => c.console_audio === 'M-02')!
    expect(videoCue.console_light).toBe('C-11')
    expect(videoCue.console_screen).toBeNull()
    expect(videoCue.segment).toBe('영상')
    // 대본 전문은 복사하지 않는다 — 참조 문구만
    expect(videoCue.body).not.toContain('영상 사운드 온')
    expect(videoCue.body).toContain('시나리오')

    const transitionCue = after.find((c) => c.segment === '전환')!
    expect(transitionCue.console_light).toBe('C-05')
    expect(transitionCue.console_audio).toBe('M-01')

    const screenCue = after.find((c) => c.console_screen === 'V-01')!
    expect(screenCue.console_audio).toBe('M-03')

    // cue_no는 기존과 충돌하지 않는 'S01'식 연번
    expect(after.slice(1).every((c) => /^S\d{2}$/.test(c.cue_no ?? ''))).toBe(true)
    const codes = after.slice(1).map((c) => c.cue_no)
    expect(new Set(codes).size).toBe(3) // 서로 다른 연번
  })

  it('블록이 없으면 빈 배열(변환 0건) — 대상 큐시트는 그대로', async () => {
    const fresh = await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '빈 시나리오',
    })
    const result = await p.exportScenarioToCues(fresh.id, RB27_CUE_ID)
    expect(result).toEqual([])
    expect(await p.listCues(RB27_CUE_ID)).toHaveLength(0)
  })

  it('대상이 큐시트가 아니면 409', async () => {
    await expectError(() => p.exportScenarioToCues(SCENARIO_ID, 'dlv-rb27-zone-01'), 409)
  })
})

describe('R-O4 — 연동 섹션 stale 표시(자동 덮어쓰기 없음)', () => {
  it('존별 운영 원본 추가 시 zone 섹션이 stale로 표시되고, 저장하면 해제된다', async () => {
    // 픽스처가 이미 R-O4 데모로 stale=true 상태
    const before = await p.listGuideSections(GUIDE_ID)
    expect(before.find((s) => s.kind === 'zone')!.source_stale).toBe(true)

    // 사람이 차이를 확인하고 저장 → 해제
    const saved = await p.saveGuideSections(
      GUIDE_ID,
      before.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.content,
        source_ref: s.source_ref,
        source_stale: false,
      })),
    )
    expect(saved.find((s) => s.kind === 'zone')!.source_stale).toBe(false)

    // 존별 운영 원본이 다시 바뀌면(비정형 ops 항목 추가) 다시 stale
    await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '존운영',
      title: '신규 존(테스트)',
    })
    const after = await p.listGuideSections(GUIDE_ID)
    expect(after.find((s) => s.kind === 'zone')!.source_stale).toBe(true)
  })

  it('비정형 ops 항목이 아닌 정형 문서 추가는 stale을 건드리지 않는다', async () => {
    await p.saveGuideSections(
      GUIDE_ID,
      (await p.listGuideSections(GUIDE_ID)).map((s) => ({ ...s, source_stale: false })),
    )
    await p.createDeliverable({ project_id: RB27, area: 'ops', category: '큐시트', title: '큐시트2' })
    const sections = await p.listGuideSections(GUIDE_ID)
    expect(sections.find((s) => s.kind === 'zone')!.source_stale).toBe(false)
  })
})

describe('doc-snapshot 3종 + createCueSnapshot 위임 동작 보존', () => {
  it('큐시트(dlv-004, 기존 STC26) — 기존 동작·activity log 의미 보존', async () => {
    const version = await p.createCueSnapshot('dlv-004')
    expect(version.note).toContain('큐시트 스냅숏')
    expect(version.file_name).toMatch(/\.pdf$/)
  })

  it('시나리오·운영가이드 — createDocSnapshot으로 인쇄 스냅숏 버전 등록', async () => {
    const scenarioVersion = await p.createDocSnapshot(SCENARIO_ID)
    expect(scenarioVersion.note).toContain('시나리오 스냅숏')
    expect(scenarioVersion.file_name).toMatch(/\.pdf$/)

    const guideVersion = await p.createDocSnapshot(GUIDE_ID)
    expect(guideVersion.note).toContain('운영가이드 스냅숏')
    expect(guideVersion.file_name).toMatch(/\.pdf$/)
  })

  it('pm 전용 — ops는 403', async () => {
    p.switchUser('usr-ops')
    await expectError(() => p.createDocSnapshot(SCENARIO_ID), 403)
  })

  it('정형 3종이 아닌 항목은 409', async () => {
    const design = (await p.listDeliverables(PROJECT_ID)).find((d) => d.area === 'design')!
    await expectError(() => p.createDocSnapshot(design.id), 409)
  })
})

describe('requestApproval 자동 스냅숏 — 정형 3종으로 확장', () => {
  it('시나리오 항목 컨펌 발송 시 doc-snapshot이 자동 등록된다', async () => {
    await p.transitionStatus(SCENARIO_ID, 'internal_review')
    const approval = await p.requestApproval(SCENARIO_ID, { version_id: 'auto' })
    const detail = await p.getDeliverable(SCENARIO_ID)
    expect(detail.versions[0].note).toContain('시나리오 스냅숏')
    expect(detail.status).toBe('pending_approval')
    expect(approval.version_id).toBe(detail.versions[0].id)
  })

  it('레거시 자유 카테고리(dlv-005, DoD-1) — 빌더 데이터가 없어 자동 스냅숏을 타지 않는다', async () => {
    // DoD-1이 기대하는 수동 버전 지정 흐름이 그대로 유지돼야 한다(회귀 방지)
    const upload = await p.uploadVersion('dlv-005', { file_name: '수정본.pdf' })
    await p.transitionStatus('dlv-005', 'internal_review')
    const approval = await p.requestApproval('dlv-005', { version_id: upload.id })
    expect(approval.version_id).toBe(upload.id)
  })
})

describe('R-O6 — 개인 연락처 비노출', () => {
  it('PlanData 조립 데이터에 연락망 섹션 제목·내용이 없다', async () => {
    const plan = await p.getPlan(RB27)
    expect(plan.emergency).not.toBeNull()
    expect(plan.guide_zone).not.toBeNull()
    const json = JSON.stringify(plan)
    expect(json).not.toContain('연락망/비품')
    expect(json).not.toContain('무전 채널')
  })

  it('테스트 마커 주입 — 개인 연락처가 PlanData·기본 스냅숏에 0건, include_contacts 옵션일 때만 반영', async () => {
    const MARKER = '010-1234-5678(개인 마커)'
    const sections = await p.listGuideSections(GUIDE_ID)
    await p.saveGuideSections(
      GUIDE_ID,
      sections.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.kind === 'contacts' ? MARKER : s.content,
        source_ref: s.source_ref,
        source_stale: s.source_stale,
      })),
    )
    const plan = await p.getPlan(RB27)
    expect(JSON.stringify(plan)).not.toContain(MARKER)

    // 기본 스냅숏 — activity log에 include_contacts:false로 기록된다
    await p.createDocSnapshot(GUIDE_ID)
    const logDefault = (await p.listActivity(RB27, 50)).find(
      (a) => a.action === 'doc.snapshot' && (a.meta as { category?: string })?.category === '운영가이드',
    )!
    expect((logDefault.meta as { include_contacts?: boolean }).include_contacts).toBe(false)

    // 옵션 포함 — 명시했을 때만 true로 기록된다
    await p.createDocSnapshot(GUIDE_ID, { include_contacts: true })
    const logs = (await p.listActivity(RB27, 50)).filter(
      (a) => a.action === 'doc.snapshot' && (a.meta as { category?: string })?.category === '운영가이드',
    )
    expect(logs.some((l) => (l.meta as { include_contacts?: boolean }).include_contacts === true)).toBe(true)
  })
})

describe('category 불일치 — 비정형(또는 다른 정형) 항목에 시나리오·가이드 메서드 409', () => {
  it('시나리오 메서드를 큐시트 항목(dlv-004)에 호출하면 409', async () => {
    await expectError(() => p.listScenarioBlocks('dlv-004'), 409)
    await expectError(() => p.saveScenarioBlocks('dlv-004', []), 409)
    await expectError(() => p.seedScenarioFromProgram('dlv-004'), 409)
  })

  it('시나리오 메서드를 레거시 자유 카테고리 항목(dlv-005, category=시나리오이나 빌더 데이터 없음)에도 정상 호출은 가능하다', async () => {
    // category 문자열은 일치하므로 listScenarioBlocks 자체는 409가 아니다(빈 배열) —
    // 정형 취급 여부(hasScenarioBuilderData)는 getPlan·requestApproval에서만 판정한다
    const blocks = await p.listScenarioBlocks('dlv-005')
    expect(blocks).toEqual([])
  })

  it('가이드 메서드를 비-운영가이드 항목(존운영)에 호출하면 409', async () => {
    const zone = (await p.listDeliverables(RB27)).find((d) => d.category === '존운영')!
    await expectError(() => p.listGuideSections(zone.id), 409)
    await expectError(() => p.saveGuideSections(zone.id, []), 409)
    await expectError(() => p.seedGuideFromSources(zone.id), 409)
  })
})
