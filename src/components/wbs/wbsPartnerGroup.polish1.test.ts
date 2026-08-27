// P5-② 순수 로직 단위 테스트 — buildChecklistRows·isPartnerSubmitted.
// 합성 데이터만 사용(픽스처 미변경 원칙). 실제 픽스처(HT-1 = 3/5)는
// src/test/wbs-partner-group.polish1.test.tsx가 화면 통합으로 재확인한다.
import { describe, expect, it } from 'vitest'
import { buildChecklistRows, isPartnerSubmitted } from './wbsPartnerGroup'
import type { Deliverable, WbsTask } from '../../types/entities'

let taskSeq = 1
function makeTask(overrides: Partial<WbsTask>): WbsTask {
  taskSeq += 1
  return {
    id: `t-${taskSeq}`,
    project_id: 'prj-x',
    phase_no: 1,
    phase_name: '사전착수',
    code: 'HT-1',
    title: '샘플 태스크',
    offset_start: -10,
    offset_end: -10,
    start_date: '2026-10-05',
    end_date: '2026-10-05',
    role: 'pm',
    origin_role: null,
    status: 'todo',
    done_at: null,
    linked_deliverable_id: null,
    target: null,
    direction: 'internal',
    partner_id: null,
    note: null,
    sort_order: taskSeq,
    ...overrides,
  }
}

let dlvSeq = 1
function makeDeliverable(overrides: Partial<Deliverable>): Deliverable {
  dlvSeq += 1
  return {
    id: `d-${dlvSeq}`,
    project_id: 'prj-x',
    area: 'ops',
    category: '파트너 제출',
    title: '샘플 산출물',
    status: 'requested',
    assignee_id: null,
    due_date: null,
    drive_folder_id: null,
    requires_approval: true,
    brief: null,
    brief_refs: null,
    spec_size: null,
    spec_qty: null,
    spec_location: null,
    spec_type: null,
    content: null,
    partner_id: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('isPartnerSubmitted', () => {
  it('연결 산출물이 pending_approval·approved·final이면 제출로 판정한다', () => {
    const d = makeDeliverable({ id: 'd-pa', status: 'pending_approval' })
    const t = makeTask({ linked_deliverable_id: d.id })
    expect(isPartnerSubmitted(t, new Map([[d.id, d]]))).toBe(true)
  })

  it('requested·changes_requested는 제출로 판정하지 않는다', () => {
    for (const status of ['requested', 'changes_requested'] as const) {
      const d = makeDeliverable({ id: `d-${status}`, status })
      const t = makeTask({ linked_deliverable_id: d.id })
      expect(isPartnerSubmitted(t, new Map([[d.id, d]]))).toBe(false)
    }
  })

  it('연결 산출물이 없으면 task.status==="done" 여부로 판정한다', () => {
    expect(isPartnerSubmitted(makeTask({ status: 'done' }), new Map())).toBe(true)
    expect(isPartnerSubmitted(makeTask({ status: 'todo' }), new Map())).toBe(false)
  })
})

describe('buildChecklistRows', () => {
  it('같은 code의 partner_submit(+partner_id) 인스턴스가 2건 이상이면 그룹 행 1개로 묶는다', () => {
    const d1 = makeDeliverable({ id: 'd1', status: 'pending_approval' })
    const d2 = makeDeliverable({ id: 'd2', status: 'requested' })
    const t1 = makeTask({
      code: 'HT-1',
      title: '자료 제출 — 접미 설명 — 파트너A',
      direction: 'partner_submit',
      partner_id: 'ptn-1',
      linked_deliverable_id: 'd1',
    })
    const t2 = makeTask({
      code: 'HT-1',
      title: '자료 제출 — 접미 설명 — 파트너B',
      direction: 'partner_submit',
      partner_id: 'ptn-2',
      linked_deliverable_id: 'd2',
    })
    const rows = buildChecklistRows([t1, t2], [d1, d2])
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('group')
    if (rows[0].type === 'group') {
      // 마지막 ' — '만 파트너명 접미로 잘라낸다 — 원제목 안의 ' — '는 보존
      expect(rows[0].group.title).toBe('자료 제출 — 접미 설명')
      expect(rows[0].group.submitted).toBe(1)
      expect(rows[0].group.total).toBe(2)
      expect(rows[0].group.instances).toEqual([t1, t2])
    }
  })

  it('같은 code라도 인스턴스가 1건뿐이면 그룹화하지 않는다', () => {
    const t = makeTask({ code: 'HT-9', direction: 'partner_submit', partner_id: 'ptn-1' })
    const rows = buildChecklistRows([t], [])
    expect(rows).toEqual([{ type: 'task', task: t }])
  })

  it('host_notice·internal(partner_id 없음)은 같은 code가 여럿이어도 그룹화하지 않는다', () => {
    const t1 = makeTask({ code: 'HT-2', direction: 'host_notice', partner_id: null })
    const t2 = makeTask({ code: 'HT-2', direction: 'host_notice', partner_id: null })
    const rows = buildChecklistRows([t1, t2], [])
    expect(rows).toEqual([
      { type: 'task', task: t1 },
      { type: 'task', task: t2 },
    ])
  })

  it('대행형(direction 전부 internal, partner_id 없음)은 원래 태스크 순서 그대로 통과한다', () => {
    const t1 = makeTask({ code: 'A-1' })
    const t2 = makeTask({ code: 'A-2' })
    const rows = buildChecklistRows([t1, t2], [])
    expect(rows).toEqual([
      { type: 'task', task: t1 },
      { type: 'task', task: t2 },
    ])
  })

  it('행 순서를 보존한다 — 그룹은 code의 첫 등장 위치에 놓인다', () => {
    const single = makeTask({ code: 'HT-2', direction: 'host_notice' })
    const g1 = makeTask({ code: 'HT-1', direction: 'partner_submit', partner_id: 'ptn-1' })
    const g2 = makeTask({ code: 'HT-1', direction: 'partner_submit', partner_id: 'ptn-2' })
    const rows = buildChecklistRows([single, g1, g2], [])
    expect(rows.map((r) => (r.type === 'group' ? `grp:${r.group.code}` : `task:${r.task.code}`))).toEqual([
      'task:HT-2',
      'grp:HT-1',
    ])
  })
})
