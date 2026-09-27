// DoD 96 (Phase 6.11 PR-C · 설계서 v2.21 §27.4) — 마스터 시트 대체: WBS 실무화(사람 배정 · Lv2 묶음 · 행사별 태스크 · R&R 사람).
// ① 순수 함수(lib/wbsCustom) — 코드 C-{n} · 단계 이름 · 오프셋 · Lv2 묶음
// ② provider(mock, DataProvider v17) — createWbsTask · deleteWbsTask · updateWbsTask(assignee·group·target) · 재전개 보존 ·
//    remove_member 배정 해제 · updateRoleCharter · getPlan.role_charters(연락처 0)
// ③ 16:9 장표 06 조직·인력 — R&R 표(사람 + 표시 역할)
// ④ 홈 '오늘 할 일' — 배정된 태스크는 배정으로 '내 차례'(역할 아님) · 담당 이름
import { describe, expect, it } from 'vitest'
import { buildTodayRows } from '../components/home/todayItems'
import { buildPlanDeck } from '../components/plan/deck/planDeck'
import { PROJECT_ID } from '../fixtures/sampleProject'
import {
  dateOffset,
  groupNamesOf,
  groupTasksByGroupName,
  isCustomCode,
  nextCustomCode,
  normalizeGroupName,
  phaseChoices,
  phaseNameFor,
} from '../lib/wbsCustom'
import { MockProvider } from '../providers/mock/MockProvider'
import type { Project, WbsTask } from '../types/entities'
import type { CreateWbsTaskInput } from '../types/views'

const AGENCY = { kind: 'agency', event_type: 'recruiting', format: 'conference' } as Pick<Project, 'kind' | 'event_type' | 'format'>

function fresh(): MockProvider {
  const p = new MockProvider()
  p.switchUser('usr-pm')
  return p
}

const NEW: CreateWbsTaskInput = {
  phase_no: 2,
  group_name: ' 제작 ',
  title: '현장 사인물 수량 확정',
  start_date: '2026-10-10',
  end_date: '2026-10-12',
  role: 'ops',
  target: '협력사',
}

let taskSeq = 0
function task(patch: Partial<WbsTask>): WbsTask {
  taskSeq += 1
  return {
    id: `t-${taskSeq}`,
    project_id: PROJECT_ID,
    phase_no: 1,
    phase_name: '사전착수',
    code: `1.${taskSeq}`,
    title: `태스크 ${taskSeq}`,
    offset_start: -10,
    offset_end: -8,
    start_date: '2026-10-12',
    end_date: '2026-10-14',
    role: 'ops',
    origin_role: null,
    status: 'todo',
    done_at: null,
    linked_deliverable_id: null,
    target: null,
    direction: 'internal',
    partner_id: null,
    note: null,
    sort_order: taskSeq,
    assignee_id: null,
    group_name: null,
    source: 'template',
    ...patch,
  }
}

describe('DoD 96 ① 순수 함수 — 코드 · 단계 이름 · 오프셋 · 묶음', () => {
  it('다음 코드 = 가장 큰 C-n + 1 (없으면 C-1 · 템플릿 코드는 세지 않는다 · 빠진 번호를 되쓰지 않는다)', () => {
    expect(nextCustomCode([])).toBe('C-1')
    expect(nextCustomCode([task({ code: '2.5' }), task({ code: 'HT-3' })])).toBe('C-1')
    expect(nextCustomCode([task({ code: 'C-1' }), task({ code: 'C-3' })])).toBe('C-4')
    expect(isCustomCode('C-12')).toBe(true)
    expect(isCustomCode('2.5')).toBe(false)
  })

  it('단계 이름 — 전개된 태스크 우선 → 유형별 템플릿 → 없으면 null · 선택지는 합집합(번호 순)', () => {
    const expanded = [task({ phase_no: 2, phase_name: '기획(사람이 고친 이름)', sort_order: 5 })]
    expect(phaseNameFor(AGENCY, expanded, 2)).toBe('기획(사람이 고친 이름)')
    expect(phaseNameFor(AGENCY, [], 1)).toBe('사전착수')
    expect(phaseNameFor(AGENCY, [], 99)).toBeNull()
    const choices = phaseChoices(AGENCY, expanded)
    expect(choices.map((c) => c.phase_no)).toEqual([1, 2, 3, 4, 5, 6])
    expect(choices.find((c) => c.phase_no === 2)?.phase_name).toBe('기획(사람이 고친 이름)')
    // 주최형은 HT 템플릿의 단계
    expect(phaseNameFor({ kind: 'host', event_type: 'general', format: 'conference' }, [], 1)).toBeTruthy()
  })

  it('오프셋 = 실날짜 − 행사일 (UTC 자정 · 월 경계 · D+n)', () => {
    expect(dateOffset('2026-10-10', '2026-10-22')).toBe(-12)
    expect(dateOffset('2026-10-22', '2026-10-22')).toBe(0)
    expect(dateOffset('2026-11-02', '2026-10-22')).toBe(11)
    expect(dateOffset('2026-09-30', '2026-10-01')).toBe(-1)
  })

  it('Lv2 묶음 — 이름별(첫 등장 순) 뒤에 묶음 없는 행 · 공백만인 이름은 묶음 없음 · 이름 목록', () => {
    const rows = [
      task({ group_name: null }),
      task({ group_name: '제작' }),
      task({ group_name: '  ' }),
      task({ group_name: '모객' }),
      task({ group_name: '제작' }),
    ]
    const buckets = groupTasksByGroupName(rows)
    expect(buckets.map((b) => b.group_name)).toEqual(['제작', '모객', null])
    expect(buckets[0].tasks).toHaveLength(2)
    expect(buckets[2].tasks).toHaveLength(2)
    expect(groupTasksByGroupName([task({}), task({})]).map((b) => b.group_name)).toEqual([null])
    expect(groupNamesOf(rows)).toEqual(['제작', '모객'])
    expect(normalizeGroupName('  ')).toBeNull()
    expect(normalizeGroupName(' 제작 ')).toBe('제작')
  })
})

describe('DoD 96 ② provider(mock · v17) — 행사별 태스크', () => {
  it('pm이 추가 → C-1 · custom · 오프셋 = 날짜 − 행사일(10/22) · 단계 이름 = 전개된 2단계 · 묶음 공백 정리 · 마지막 정렬 · 로그(code·title만)', async () => {
    const p = fresh()
    const before = await p.listWbsTasks(PROJECT_ID)
    const created = await p.createWbsTask(PROJECT_ID, NEW)
    expect(created.code).toBe('C-1')
    expect(created.source).toBe('custom')
    expect(created.offset_start).toBe(-12)
    expect(created.offset_end).toBe(-10)
    expect(created.phase_name).toBe(before.find((t) => t.phase_no === 2)!.phase_name)
    expect(created.group_name).toBe('제작')
    expect(created.target).toBe('협력사')
    expect(created.assignee_id).toBeNull()
    expect(created.direction).toBe('internal')
    expect(created.sort_order).toBe(Math.max(...before.map((t) => t.sort_order)) + 1)
    const second = await p.createWbsTask(PROJECT_ID, { ...NEW, group_name: null })
    expect(second.code).toBe('C-2')
    expect(second.group_name).toBeNull()
    const after = await p.listWbsTasks(PROJECT_ID)
    expect(after).toHaveLength(before.length + 2)
    const logs = (await p.listActivity(PROJECT_ID)).filter((e) => e.action === 'wbs.task_created')
    expect(logs).toHaveLength(2)
    expect(Object.keys(logs[0].meta ?? {}).sort()).toEqual(['code', 'title'])
  })

  it('담당자 = 그 행사 멤버만 — 멤버 OK · 주소록에만 있는 사람 422 · 빈 제목·종료일<시작일·없는 단계 422 · design 403 · 종료 행사 409', async () => {
    const p = fresh()
    const ok = await p.createWbsTask(PROJECT_ID, { ...NEW, assignee_id: 'usr-design' })
    expect(ok.assignee_id).toBe('usr-design')
    const outsider = await p.createPerson({ name: '외부 사람', email: 'outsider@example.com' })
    await expect(p.createWbsTask(PROJECT_ID, { ...NEW, assignee_id: outsider.id })).rejects.toMatchObject({
      code: 'validation',
      message: '담당자는 이 행사 멤버여야 합니다.',
    })
    await expect(p.createWbsTask(PROJECT_ID, { ...NEW, title: '  ' })).rejects.toMatchObject({ code: 'validation' })
    await expect(p.createWbsTask(PROJECT_ID, { ...NEW, end_date: '2026-10-09' })).rejects.toMatchObject({
      code: 'validation',
      message: '종료일은 시작일보다 앞설 수 없습니다.',
    })
    await expect(p.createWbsTask(PROJECT_ID, { ...NEW, phase_no: 99 })).rejects.toMatchObject({ code: 'validation' })
    p.switchUser('usr-design')
    await expect(p.createWbsTask(PROJECT_ID, NEW)).rejects.toMatchObject({ code: 'forbidden' })
    p.switchUser('usr-pm')
    await expect(p.createWbsTask('prj-ai-summit', NEW)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('지우기 — 템플릿 태스크 409(완료 처리로) · custom은 목록에서 사라지고 로그 · design 403 · 없는 id 404', async () => {
    const p = fresh()
    const tpl = (await p.listWbsTasks(PROJECT_ID))[0]
    await expect(p.deleteWbsTask(tpl.id)).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('완료 처리로') })
    const created = await p.createWbsTask(PROJECT_ID, NEW)
    p.switchUser('usr-design')
    await expect(p.deleteWbsTask(created.id)).rejects.toMatchObject({ code: 'forbidden' })
    p.switchUser('usr-pm')
    await p.deleteWbsTask(created.id)
    expect((await p.listWbsTasks(PROJECT_ID)).some((t) => t.id === created.id)).toBe(false)
    expect((await p.listActivity(PROJECT_ID)).some((e) => e.action === 'wbs.task_deleted')).toBe(true)
    await expect(p.deleteWbsTask('wbs-nope')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('updateWbsTask — 배정(멤버 OK · 비멤버 422 · null 해제) · 묶음 공백 → null · 소통 대상 · 배정 편집은 pm만', async () => {
    const p = fresh()
    const t = (await p.listWbsTasks(PROJECT_ID))[0]
    const a = await p.updateWbsTask(t.id, { assignee_id: 'usr-ops', group_name: ' 키비주얼 ', target: ' 고객사 ' })
    expect(a.assignee_id).toBe('usr-ops')
    expect(a.group_name).toBe('키비주얼')
    expect(a.target).toBe('고객사')
    const outsider = await p.createPerson({ name: '외부 사람', email: 'outsider2@example.com' })
    await expect(p.updateWbsTask(t.id, { assignee_id: outsider.id })).rejects.toMatchObject({ code: 'validation' })
    const b = await p.updateWbsTask(t.id, { assignee_id: null, group_name: '   ' })
    expect(b.assignee_id).toBeNull()
    expect(b.group_name).toBeNull()
    p.switchUser('usr-ops')
    await expect(p.updateWbsTask(t.id, { assignee_id: 'usr-ops' })).rejects.toMatchObject({ code: 'forbidden' })
    // 배정 ≠ 권한(R-M6): 배정된 사람이어도 상태 체크는 역할 규칙 그대로 — 운영 담당은 자기 역할 태스크만
    p.switchUser('usr-pm')
    const designTask = (await p.listWbsTasks(PROJECT_ID)).find((x) => x.role === 'design')!
    await p.updateWbsTask(designTask.id, { assignee_id: 'usr-ops' })
    p.switchUser('usr-ops')
    await expect(p.updateWbsTask(designTask.id, { status: 'doing' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('재전개(expandWbs) — template 행은 code 매칭으로 배정·묶음을 잇고 custom 행은 날짜·상태 그대로 남는다', async () => {
    const p = fresh()
    const first = (await p.listWbsTasks(PROJECT_ID))[0]
    await p.updateWbsTask(first.id, { assignee_id: 'usr-design', group_name: '키비주얼' })
    const custom = await p.createWbsTask(PROJECT_ID, { ...NEW, assignee_id: 'usr-ops' })
    await p.updateWbsTask(custom.id, { status: 'doing' })
    const expanded = await p.expandWbs(PROJECT_ID)
    expect(expanded).toHaveLength(38)
    const again = await p.listWbsTasks(PROJECT_ID)
    const kept = again.find((t) => t.code === first.code)!
    expect(kept.id).toBe(first.id)
    expect(kept.assignee_id).toBe('usr-design')
    expect(kept.group_name).toBe('키비주얼')
    expect(kept.source).toBe('template')
    const keptCustom = again.find((t) => t.id === custom.id)!
    expect(keptCustom).toMatchObject({
      code: 'C-1',
      source: 'custom',
      status: 'doing',
      start_date: '2026-10-10',
      end_date: '2026-10-12',
      assignee_id: 'usr-ops',
      group_name: '제작',
    })
  })

  it('removeMember — 이 행사에서 역할이 하나도 남지 않으면 배정을 푼다 · 다른 역할이 남으면 배정 유지', async () => {
    const p = fresh()
    const [t1, t2] = await p.listWbsTasks(PROJECT_ID)
    await p.updateWbsTask(t1.id, { assignee_id: 'usr-design' })
    await p.updateWbsTask(t2.id, { assignee_id: 'usr-design' })
    await p.addMember(PROJECT_ID, { display_name: '이디자', email: 'design@example.com', role: 'ops' })
    await p.removeMember(PROJECT_ID, 'usr-design', 'design')
    expect((await p.listWbsTasks(PROJECT_ID)).filter((t) => t.assignee_id === 'usr-design')).toHaveLength(2)
    await p.removeMember(PROJECT_ID, 'usr-design', 'ops')
    expect((await p.listWbsTasks(PROJECT_ID)).filter((t) => t.assignee_id === 'usr-design')).toHaveLength(0)
  })
})

describe('DoD 96 ② provider(mock · v17) — R&R 사람', () => {
  it('updateRoleCharter — 제목·책임(빈 줄 제거)·사람(표시 역할 공백 정리 · 멤버 아닌 주소록 사람도) 저장 + 로그 · null로 비움', async () => {
    const p = fresh()
    const outsider = await p.createPerson({ name: '박영업', email: 'sales@example.com', title: '영업팀' })
    const pmCard = (await p.listRoleCharters(PROJECT_ID)).find((c) => c.role === 'pm')!
    const saved = await p.updateRoleCharter(pmCard.id, {
      title: ' 총괄 ',
      items: ['a', ' ', 'b '],
      people: [
        { person_id: 'usr-design', display_role: ' Sub PM ' },
        { person_id: outsider.id, display_role: '영업' },
      ],
    })
    expect(saved.title).toBe('총괄')
    expect(saved.items).toEqual(['a', 'b'])
    expect(saved.people).toEqual([
      { person_id: 'usr-design', display_role: 'Sub PM' },
      { person_id: outsider.id, display_role: '영업' },
    ])
    expect(saved.role).toBe('pm') // 권한 역할 불변
    expect((await p.listActivity(PROJECT_ID)).some((e) => e.action === 'rr.updated')).toBe(true)
    const cleared = await p.updateRoleCharter(pmCard.id, { people: null })
    expect(cleared.people).toBeNull()
    expect(cleared.title).toBe('총괄')
  })

  it('updateRoleCharter — 주소록 밖 사람 422 · 같은 사람 두 번 422 · 빈 제목 422 · design 403 · 없는 카드 404', async () => {
    const p = fresh()
    const pmCard = (await p.listRoleCharters(PROJECT_ID)).find((c) => c.role === 'pm')!
    await expect(p.updateRoleCharter(pmCard.id, { people: [{ person_id: 'usr-nope', display_role: 'x' }] })).rejects.toMatchObject({
      code: 'validation',
      message: '주소록에 없는 사람입니다.',
    })
    await expect(
      p.updateRoleCharter(pmCard.id, {
        people: [
          { person_id: 'usr-design', display_role: 'a' },
          { person_id: 'usr-design', display_role: 'b' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(p.updateRoleCharter(pmCard.id, { title: ' ' })).rejects.toMatchObject({ code: 'validation' })
    await expect(p.updateRoleCharter('rrc-nope', { title: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    p.switchUser('usr-design')
    await expect(p.updateRoleCharter(pmCard.id, { title: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('getPlan.role_charters — 카드마다 사람 이름·표시 역할만(이메일·전화 0) · 주소록에서 사라진 사람은 빠진다', async () => {
    const p = fresh()
    const pmCard = (await p.listRoleCharters(PROJECT_ID)).find((c) => c.role === 'pm')!
    await p.updateRoleCharter(pmCard.id, { people: [{ person_id: 'usr-design', display_role: 'Sub PM' }] })
    const plan = await p.getPlan(PROJECT_ID)
    expect(plan.role_charters.length).toBeGreaterThanOrEqual(4)
    const pmRow = plan.role_charters.find((c) => c.role === 'pm')!
    expect(pmRow.people).toEqual([{ name: '이디자', display_role: 'Sub PM' }])
    const json = JSON.stringify(plan.role_charters)
    expect(json).not.toMatch(/email|phone|person_id/)
  })
})

describe('DoD 96 ③ 16:9 장표 06 조직·인력 — R&R 표', () => {
  it('R&R 카드가 있으면 표 장표(역할 · 담당(사람 + 표시 역할) · 책임) · 사람 없는 카드는 — · 카드 없으면 싣지 못한 표', async () => {
    const p = fresh()
    const pmCard = (await p.listRoleCharters(PROJECT_ID)).find((c) => c.role === 'pm')!
    await p.updateRoleCharter(pmCard.id, { people: [{ person_id: 'usr-design', display_role: 'Sub PM' }] })
    const deck = buildPlanDeck(await p.getPlan(PROJECT_ID))
    const rr = deck.slides.find((s) => s.kind === 'table' && s.chapter === 'org' && s.title === '역할과 책임(R&R)')
    expect(rr && rr.kind === 'table').toBe(true)
    if (!rr || rr.kind !== 'table') throw new Error('unreachable')
    expect(rr.columns.map((c) => c.label)).toEqual(['역할', '담당', '책임'])
    const cellRows = rr.rows.flatMap((r) => ('cells' in r ? [r.cells] : []))
    const pmRow = cellRows.find((c) => c[0].startsWith('PM'))!
    expect(pmRow[1]).toBe('이디자 (Sub PM)')
    expect(cellRows.some((c) => c[1] === '—')).toBe(true)
    expect(deck.gaps.some((g) => g.label === '역할과 책임(R&R)')).toBe(false)
    // 카드가 없는 행사(세팅 미완료) = 싣지 못한 표
    const plan = await p.getPlan(PROJECT_ID)
    const noCharters = buildPlanDeck({ ...plan, role_charters: [] })
    expect(noCharters.slides.some((s) => s.title === '역할과 책임(R&R)')).toBe(false)
    expect(noCharters.gaps.some((g) => g.label === '역할과 책임(R&R)' && g.chapter === 'org')).toBe(true)
  })
})

describe('DoD 96 ④ 홈 오늘 할 일 — 배정 우선 내 차례', () => {
  const base = {
    lateMilestones: [],
    approvals: [],
    partnerPending: [],
    overBudget: [],
    inbox: [],
    guides: [],
    roleOf: () => null,
    nameOf: (id: string | null) => (id === 'usr-pm' ? '김기획' : null),
  }
  it('배정된 태스크 = 그 사람의 차례(역할이 달라도) · 배정된 다른 사람 = 내 차례 아님(내 역할이어도) · 미배정 = 역할 판정 · 담당 이름', () => {
    const assignedToMe = task({ role: 'design', assignee_id: 'usr-pm', end_date: '2026-10-01' })
    const assignedToOther = task({ role: 'design', assignee_id: 'usr-design', end_date: '2026-10-01' })
    const unassigned = task({ role: 'design', assignee_id: null, end_date: '2026-10-01' })
    const rows = buildTodayRows({ ...base, delayed: [assignedToMe, assignedToOther, unassigned], imminent: [], myRoles: ['design'], myId: 'usr-pm' })
    const byId = (id: string) => rows.find((r) => r.key === `delayed:${id}`)!
    expect(byId(assignedToMe.id).mine).toBe(true)
    expect(byId(assignedToMe.id).owner).toBe('김기획')
    expect(byId(assignedToOther.id).mine).toBe(false)
    expect(byId(unassigned.id).mine).toBe(true)
    expect(byId(unassigned.id).owner).toBeNull()
    // myId 없이(옛 호출) = 역할 판정 그대로
    const legacy = buildTodayRows({ ...base, delayed: [assignedToMe], imminent: [], myRoles: ['pm'] })
    expect(legacy[0].mine).toBe(false)
  })
})
