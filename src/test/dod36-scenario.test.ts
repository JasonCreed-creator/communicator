// DoD 36 (v2.5 §23.3) — 시나리오: 프로그램표에서 뼈대 생성(빈 문서만 — 재시드 409),
// 블록 CRUD·정렬, 큐시트로 내보내기가 기존 큐 보존+후미 삽입(R-O5)·변환 규칙 준수,
// 컨펌 발송 시 doc-snapshot 버전 등록.
// 세부 변환 규칙 매트릭스는 MockProvider.opsDocs.test.ts(3.16a)가, 빌더 UI는
// scenario-builder.test.tsx(3.16c)가 정본 — 이 파일은 DoD 문장을 provider 계약으로 증명한다.
import { beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { ProviderError } from '../lib/errors'
import { MockProvider } from '../providers/mock/MockProvider'

const RB27 = PROJECT_ID_REBUILD27
const SCENARIO_ID = 'dlv-rb27-scenario-01'
const RB27_CUE_ID = 'dlv-rb27-cue-01'

let p: MockProvider
beforeEach(() => {
  p = new MockProvider()
})

async function expectStatus(fn: () => Promise<unknown>, status: number) {
  try {
    await fn()
    expect.unreachable('오류가 나야 하는 호출이 통과됨')
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError)
    expect((e as ProviderError).status).toBe(status)
  }
}

describe('DoD 36 — 시나리오 (RE:BUILD 27)', () => {
  it('(a) 빈 문서에서만 프로그램표 뼈대 생성 — 새 문서는 시드되고, 데이터 있는 문서 재시드는 409', async () => {
    const fresh = await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '리허설 시나리오',
    })
    const seeded = await p.seedScenarioFromProgram(fresh.id)
    expect(seeded.length).toBeGreaterThan(0)
    // 프로그램표 연동 — 세션에 연결된 블록이 실제로 존재한다
    expect(seeded.some((b) => b.session_id !== null)).toBe(true)

    // 재시드 409 (R-O3): 방금 시드된 문서, 그리고 픽스처 시나리오(8블록) 둘 다
    await expectStatus(() => p.seedScenarioFromProgram(fresh.id), 409)
    await expectStatus(() => p.seedScenarioFromProgram(SCENARIO_ID), 409)
  })

  it('(b) 블록 CRUD·정렬 — 벌크 교체(saveScenarioBlocks)로 추가·수정·순서가 반영된다', async () => {
    const before = await p.listScenarioBlocks(SCENARIO_ID)
    expect(before.length).toBe(8)

    // 추가 + 첫 두 블록 순서 교체 + 첫 블록 수정
    const inputs = before.map((b) => ({
      session_id: b.session_id,
      time: b.time,
      kind: b.kind,
      script: b.script,
      note: b.note,
    }))
    ;[inputs[0], inputs[1]] = [inputs[1], inputs[0]]
    inputs[0] = { ...inputs[0], note: '순서 교체 후 첫 블록' }
    inputs.push({ session_id: null, time: null, kind: 'custom', script: '추가 블록', note: null })

    const saved = await p.saveScenarioBlocks(SCENARIO_ID, inputs)
    expect(saved.length).toBe(9)
    expect(saved[0].note).toBe('순서 교체 후 첫 블록')
    for (let i = 1; i < saved.length; i++) {
      expect(saved[i].sort_order).toBeGreaterThan(saved[i - 1].sort_order)
    }
    expect(saved[8].script).toBe('추가 블록')

    // 삭제 — 마지막 블록 제외 후 재저장
    const trimmed = await p.saveScenarioBlocks(
      SCENARIO_ID,
      saved.slice(0, 8).map((b) => ({
        session_id: b.session_id,
        time: b.time,
        kind: b.kind,
        script: b.script,
        note: b.note,
      })),
    )
    expect(trimmed.length).toBe(8)
  })

  it('(c) 큐시트로 내보내기 — 기존 큐 보존+후미 삽입(R-O5), 대본 전문 미복사(§23.3)', async () => {
    // RB27 큐시트 픽스처는 지시(requested) 상태라 큐가 비어 있다 — 기존 큐 보존을 증명하려면
    // 먼저 수동 큐 1건을 만들어 둔다(3.16a provider 테스트와 동일 전제)
    await p.createCue(RB27_CUE_ID, { cue_no: 'C01', segment: '사전', body: '기존 수동 큐' })
    const cuesBefore = await p.listCues(RB27_CUE_ID)
    expect(cuesBefore.length).toBeGreaterThan(0)

    const added = await p.exportScenarioToCues(SCENARIO_ID, RB27_CUE_ID)
    expect(added.length).toBeGreaterThan(0)

    const cuesAfter = await p.listCues(RB27_CUE_ID)
    // 기존 큐가 같은 자리·같은 내용으로 보존되고, 추가분은 전부 후미
    expect(cuesAfter.length).toBe(cuesBefore.length + added.length)
    cuesBefore.forEach((c, i) => expect(cuesAfter[i].id).toBe(c.id))
    added.forEach((c, i) => expect(cuesAfter[cuesBefore.length + i].id).toBe(c.id))

    // 변환 규칙 — 대본 전문은 복사되지 않고 참조 문구만 남는다
    const blocks = await p.listScenarioBlocks(SCENARIO_ID)
    const scripts = blocks.map((b) => b.script).filter((s): s is string => !!s && s.length > 20)
    for (const cue of added) {
      for (const script of scripts) {
        expect(cue.body ?? '').not.toContain(script)
      }
      expect(cue.body ?? '').toContain('시나리오')
    }
  })

  it('(d) 컨펌 발송 시 doc-snapshot(.pdf) 버전이 자동 등록되고 컨펌대기로 전이된다', async () => {
    await p.transitionStatus(SCENARIO_ID, 'internal_review')
    const approval = await p.requestApproval(SCENARIO_ID, { version_id: 'auto' })

    const detail = await p.getDeliverable(SCENARIO_ID)
    expect(detail.status).toBe('pending_approval')
    expect(detail.versions[0].file_name.endsWith('.pdf')).toBe(true)
    expect(approval.version_id).toBe(detail.versions[0].id)
  })
})
