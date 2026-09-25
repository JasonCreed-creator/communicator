/** @vitest-environment jsdom */
// DoD 67 (Phase 4.5 · 2026-09-25 사용자 지시 "이미 등록한 항목을 수정/삭제하는 기능 — 지금은 항목추가로 쌓이기만 해"):
//   ① 고치기 = PM·해당 영역 담당, 보낸 키만 바뀐다(빈 칸 = 비우기). 담당·제작 가이드는 PM만. 상태는 이 경로로 바뀌지 않는다
//   ② 큐시트·시나리오·운영가이드는 종류를 바꿀 수 없다(양방향 409) · 빈 제목 422 · 멤버 아닌 담당 422 · 종료 행사 409
//   ③ 지우기 = PM만 · 모든 상태 · 항목 이름 입력 확인. 버전·컨펌·코멘트·큐가 함께 사라지고 WBS 연결은 풀리며
//      이 항목으로 등록된 인박스 파일은 닫힌다(다시 뜨지 않는다)
//   ④ 화면: 항목 관리 카드(권한 없는 역할에는 없음) · 편집 폼(담당·가이드는 PM만) · 지우기 확인 → 결과 → 보드로
//   ⑤ Drive 폴더 보관은 dod67-item-archive-drive.test.ts(node 환경 — 가짜 Drive 서버 계약)
// 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 이어진다(testUtils 주석).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { boardPathFor, buildPatch } from '../components/item/ItemManageCard'
import type { UpdateDeliverableInput } from '../types/views'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  mockProvider().switchUser('usr-pm')
})

type MockState = {
  unregistered_files: { id: string; linked_deliverable_id: string | null; dismissed: boolean }[]
  versions: { deliverable_id: string }[]
  approvals: { deliverable_id: string }[]
  comments: { deliverable_id: string }[]
  cues: { deliverable_id: string }[]
}
const state = () => (mockProvider() as unknown as { state: MockState }).state

async function reason(p: Promise<unknown>): Promise<{ code: string; message: string } | null> {
  return p.then(
    () => null,
    (e: { code: string; message: string }) => ({ code: e.code, message: e.message }),
  )
}

describe('DoD 67 · ④ 화면 — 항목 관리 카드', () => {
  it('PM: 일반 항목 메타 열 맨 아래에 고치기·지우기 → 제목·마감을 고치면 헤더에 바로 반영', async () => {
    renderRoute('/items/dlv-003')
    const card = await screen.findByRole('heading', { name: '항목 관리' })
    const box = card.closest('.ui-card') as HTMLElement
    expect((within(box).getByRole('button', { name: '고치기' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(box).getByRole('button', { name: '지우기' }) as HTMLButtonElement).disabled).toBe(false)
    expect(card.closest('aside')).not.toBeNull()

    await userEvent.click(within(box).getByRole('button', { name: '고치기' }))
    const form = await screen.findByTestId('item-edit-form')
    const title = within(form).getByLabelText('제목')
    await userEvent.clear(title)
    await userEvent.type(title, '무대 백월 배너 (최종 규격)')
    // jsdom의 date 입력은 타이핑을 받지 않는다 — 값 변경 이벤트로 넣는다
    fireEvent.change(within(form).getByLabelText('마감'), { target: { value: '2026-10-05' } })
    // PM에게는 담당·가이드 칸이 있다(가이드가 없던 항목은 '제작 가이드 추가'로 연다)
    expect(within(form).getByLabelText('담당')).toBeTruthy()
    expect(within(form).getByLabelText('제작 가이드 추가')).toBeTruthy()
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('heading', { level: 1, name: '무대 백월 배너 (최종 규격)' })).toBeTruthy()
    expect(screen.queryByTestId('item-edit-form')).toBeNull()
    const d = await mockProvider().getDeliverable('dlv-003')
    expect(d.due_date).toBe('2026-10-05')
    expect(d.status).toBe('draft')
  })

  it('정형 문서(큐시트): 카드는 본문 맨 아래 · 카테고리는 잠금 문구(선택기 없음)', async () => {
    renderRoute('/items/dlv-004')
    const card = await screen.findByRole('heading', { name: '항목 관리' })
    expect(card.closest('aside')).toBeNull()
    await userEvent.click(within(card.closest('.ui-card') as HTMLElement).getByRole('button', { name: '고치기' }))
    const form = await screen.findByTestId('item-edit-form')
    expect(within(form).getByText(/종류를 바꿀 수 없습니다/)).toBeTruthy()
    expect(form.querySelector('#item-edit-category')).toBeNull()
  })

  it('영역 담당(design): 자기 영역은 고치기만 — 담당·가이드 칸 없음 · 남의 영역(운영)과 reg에는 카드 자체가 없다', async () => {
    mockProvider().switchUser('usr-design')
    renderRoute('/items/dlv-003')
    const card = await screen.findByRole('heading', { name: '항목 관리' })
    const box = card.closest('.ui-card') as HTMLElement
    expect(within(box).queryByRole('button', { name: '지우기' })).toBeNull()
    await userEvent.click(within(box).getByRole('button', { name: '고치기' }))
    const form = await screen.findByTestId('item-edit-form')
    expect(within(form).queryByLabelText('담당')).toBeNull()
    expect(within(form).queryByLabelText('제작 가이드 추가')).toBeNull()
    expect(within(form).queryByLabelText('가이드 내용')).toBeNull()
    cleanup()

    renderRoute('/items/dlv-004')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: '항목 관리' })).toBeNull()
    cleanup()

    mockProvider().switchUser('usr-reg')
    renderRoute('/items/dlv-003')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: '항목 관리' })).toBeNull()
  })

  it('종료 행사: 버튼은 비활성 + 이유(재개 후 가능)', async () => {
    await mockProvider().closeProject('prj-stc26', true)
    try {
      renderRoute('/items/dlv-003')
      const card = await screen.findByRole('heading', { name: '항목 관리' })
      const box = card.closest('.ui-card') as HTMLElement
      await waitFor(() => expect((within(box).getByRole('button', { name: '고치기' }) as HTMLButtonElement).disabled).toBe(true))
      expect((within(box).getByRole('button', { name: '지우기' }) as HTMLButtonElement).disabled).toBe(true)
      expect(within(box).getByTestId('item-manage-closed').textContent).toContain('재개(pm) 후')
    } finally {
      await mockProvider().closeProject('prj-stc26', false)
    }
  })

  it('지우기: 이름을 정확히 쳐야 열림 · Esc는 취소 · 지우면 결과 → 보드로(목록에서 사라짐) · mock에는 Drive 문구 없음', async () => {
    renderRoute('/items/dlv-007')
    const card = await screen.findByRole('heading', { name: '항목 관리' })
    const box = card.closest('.ui-card') as HTMLElement
    await userEvent.click(within(box).getByRole('button', { name: '지우기' }))
    let dialog = await screen.findByTestId('delete-item-dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('delete-item-dialog')).toBeNull()

    await userEvent.click(within(box).getByRole('button', { name: '지우기' }))
    dialog = await screen.findByTestId('delete-item-dialog')
    expect(dialog.textContent).toContain('되돌릴 수 없습니다')
    expect(dialog.textContent).not.toContain('Drive')
    const input = within(dialog).getByLabelText(/항목 이름/)
    const go = within(dialog).getByRole('button', { name: '영구 삭제' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    await userEvent.type(input, '메인 게이트')
    expect(go.disabled).toBe(true)
    await userEvent.type(input, ' 현수막')
    expect(go.disabled).toBe(false)
    await userEvent.click(go)

    expect(await within(dialog).findByRole('heading', { name: '지웠습니다' })).toBeTruthy()
    expect(screen.queryByTestId('delete-item-drive')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: '디자인 보드로' }))
    await screen.findByRole('heading', { level: 1, name: /디자인/ })
    expect(screen.queryByText('메인 게이트 현수막')).toBeNull()
    expect(await reason(mockProvider().getDeliverable('dlv-007'))).toMatchObject({ code: 'not_found' })
  })

  it('지운 뒤 돌아갈 자리: 디자인·운영은 그 보드, 공통은 홈', () => {
    expect(boardPathFor('design')).toEqual({ path: '/board/design', label: '디자인 보드로' })
    expect(boardPathFor('ops').path).toBe('/board/ops')
    expect(boardPathFor('common')).toEqual({ path: '/home', label: '홈으로' })
  })
})

describe('DoD 67 · ① 편집 폼 — 바뀐 키만 보낸다', () => {
  const base = {
    id: 'x', title: '배너', category: '배너', due_date: '2026-10-01', assignee_id: 'usr-design',
    brief: '가이드', brief_refs: ['https://a.example'], spec_size: '3x2m', spec_qty: 2, spec_location: null, spec_type: null,
  } as unknown as Parameters<typeof buildPatch>[0]
  const draft = {
    title: '배너', category: '배너', due_date: '2026-10-01', assignee_id: 'usr-design', brief: '가이드',
    brief_refs: 'https://a.example', spec_size: '3x2m', spec_qty: '2', spec_location: '', spec_type: '',
  }

  it('그대로면 빈 patch · 빈 칸은 null(비우기) · 공백 정리', () => {
    expect(buildPatch(base, draft, true)).toEqual({})
    expect(
      buildPatch(base, { ...draft, title: '  배너 v2 ', due_date: '', assignee_id: '', brief_refs: '', spec_qty: '' }, true),
    ).toEqual({ title: '배너 v2', due_date: null, assignee_id: null, brief_refs: null, spec_qty: null } satisfies UpdateDeliverableInput)
  })

  it('담당(design 등)이 저장하면 담당·가이드 키는 아예 보내지 않는다', () => {
    expect(buildPatch(base, { ...draft, title: 'x', assignee_id: '', brief: '' }, false)).toEqual({ title: 'x' })
  })

  it('검증: 빈 제목·빈 카테고리·음수/소수 수량', () => {
    expect(() => buildPatch(base, { ...draft, title: '  ' }, true)).toThrow('제목은 비울 수 없습니다.')
    expect(() => buildPatch(base, { ...draft, category: '' }, true)).toThrow('카테고리는 비울 수 없습니다.')
    expect(() => buildPatch(base, { ...draft, spec_qty: '-1' }, true)).toThrow('0 이상의 정수')
    expect(() => buildPatch(base, { ...draft, spec_qty: '1.5' }, true)).toThrow('0 이상의 정수')
  })
})

describe('DoD 67 · ①② provider — updateDeliverable', () => {
  it('PM: 보낸 키만 바뀌고 로그(fields) · 변화 없는 patch는 로그도 없다 · 상태 키는 무시', async () => {
    const p = mockProvider()
    const before = await p.getDeliverable('dlv-005')
    const updated = await p.updateDeliverable('dlv-005', { title: '운영 시나리오 v2', assignee_id: 'usr-pm', spec_qty: 3 })
    expect(updated).toMatchObject({ title: '운영 시나리오 v2', assignee_id: 'usr-pm', spec_qty: 3, category: before.category, status: before.status })
    const log = (await p.listActivity('prj-stc26', 1))[0]
    expect(log).toMatchObject({ action: 'deliverable.updated', target_id: 'dlv-005' })
    expect(log.meta).toEqual({ fields: ['title', 'assignee_id', 'spec_qty'] })

    await p.updateDeliverable('dlv-005', { title: '운영 시나리오 v2' })
    expect((await p.listActivity('prj-stc26', 1))[0].id).toBe(log.id)

    await p.updateDeliverable('dlv-005', { status: 'final' } as unknown as UpdateDeliverableInput)
    expect((await p.getDeliverable('dlv-005')).status).toBe(before.status)
  })

  it('design: 자기 영역 제목은 되고, 운영 항목·담당·가이드는 403', async () => {
    const p = mockProvider()
    p.switchUser('usr-design')
    await expect(p.updateDeliverable('dlv-003', { title: '백월 배너' })).resolves.toMatchObject({ title: '백월 배너' })
    expect(await reason(p.updateDeliverable('dlv-004', { title: 'x' }))).toEqual({
      code: 'forbidden',
      message: '이 항목을 고칠 권한이 없습니다(PM 또는 해당 영역 담당).',
    })
    expect(await reason(p.updateDeliverable('dlv-003', { brief: 'x' }))).toEqual({
      code: 'forbidden',
      message: '담당자·가이드는 PM만 고칠 수 있습니다.',
    })
    expect(await reason(p.updateDeliverable('dlv-003', { assignee_id: null }))).toMatchObject({ code: 'forbidden' })
  })

  it('검증: 빈 제목 422 · 정형 문서 종류 전환 409(양방향) · 멤버 아닌 담당 422 · 없는 항목 404', async () => {
    const p = mockProvider()
    expect(await reason(p.updateDeliverable('dlv-003', { title: '  ' }))).toEqual({ code: 'validation', message: '제목은 비울 수 없습니다.' })
    const structured = '큐시트·시나리오·운영가이드 항목은 종류를 바꿀 수 없습니다 — 새 항목으로 만드세요.'
    expect(await reason(p.updateDeliverable('dlv-004', { category: '운영안' }))).toEqual({ code: 'conflict', message: structured })
    expect(await reason(p.updateDeliverable('dlv-003', { category: '운영가이드' }))).toEqual({ code: 'conflict', message: structured })
    // 같은 카테고리를 다시 보내는 건 전환이 아니다
    await expect(p.updateDeliverable('dlv-004', { category: '큐시트', title: '개막식 큐시트' })).resolves.toMatchObject({ category: '큐시트' })
    expect(await reason(p.updateDeliverable('dlv-003', { assignee_id: 'usr-nobody' }))).toEqual({
      code: 'validation',
      message: '담당자는 이 행사 멤버여야 합니다.',
    })
    expect(await reason(p.updateDeliverable('dlv-003', { spec_qty: -1 }))).toEqual({ code: 'validation', message: '수량은 0 이상의 정수여야 합니다.' })
    expect(await reason(p.updateDeliverable('dlv-003', { spec_qty: 1.5 }))).toMatchObject({ code: 'validation' })
    expect(await reason(p.updateDeliverable('dlv-없음', { title: 'x' }))).toMatchObject({ code: 'not_found' })
  })

  it('종료 행사: 고치기·지우기 모두 409', async () => {
    const p = mockProvider()
    await p.closeProject('prj-stc26', true)
    try {
      expect(await reason(p.updateDeliverable('dlv-003', { title: 'x' }))).toMatchObject({ code: 'conflict', message: expect.stringContaining('종료된 행사') })
      expect(await reason(p.deleteDeliverable('dlv-003'))).toMatchObject({ code: 'conflict', message: expect.stringContaining('종료된 행사') })
    } finally {
      await p.closeProject('prj-stc26', false)
    }
  })
})

describe('DoD 67 · ③ provider — deleteDeliverable', () => {
  it('design은 자기 영역이어도 403(PM 전용)', async () => {
    const p = mockProvider()
    p.switchUser('usr-design')
    expect(await reason(p.deleteDeliverable('dlv-003'))).toEqual({ code: 'forbidden', message: 'PM 전용 기능입니다.' })
  })

  it('PM: 인박스로 등록한 파일·WBS 연결이 있는 항목 → 항목·버전 사라짐 · WBS 연결 해제 · 인박스 파일은 닫혀 다시 뜨지 않음 · 로그', async () => {
    const p = mockProvider()
    await p.linkInboxFile('inb-001', 'dlv-003')
    const task = (await p.listWbsTasks('prj-stc26'))[0]
    await p.updateWbsTask(task.id, { linked_deliverable_id: 'dlv-003' })

    const res = await p.deleteDeliverable('dlv-003')
    expect(res).toEqual({ id: 'dlv-003', project_id: 'prj-stc26', area: 'design', drive_archived: false })
    expect(await reason(p.getDeliverable('dlv-003'))).toMatchObject({ code: 'not_found' })
    expect(state().versions.filter((v) => v.deliverable_id === 'dlv-003')).toHaveLength(0)
    expect((await p.listWbsTasks('prj-stc26')).find((t) => t.id === task.id)?.linked_deliverable_id).toBeNull()
    expect(state().unregistered_files.find((f) => f.id === 'inb-001')).toMatchObject({ linked_deliverable_id: null, dismissed: true })
    expect((await p.listInbox('prj-stc26')).map((f) => f.id)).not.toContain('inb-001')
    const log = (await p.listActivity('prj-stc26', 5)).find((a) => a.action === 'deliverable.deleted' && a.target_id === 'dlv-003')
    expect(log?.meta).toMatchObject({ area: 'design', status: 'draft' })
  })

  it('모든 상태: 컨펌대기 항목(버전·컨펌·코멘트)도 지워지고 미결 컨펌 목록에서 빠진다 · 큐시트는 큐도 함께', async () => {
    const p = mockProvider()
    expect((await p.getDashboard('prj-stc26')).pending_approvals.map((x) => x.deliverable.id)).toContain('dlv-001')
    await p.deleteDeliverable('dlv-001')
    for (const k of ['versions', 'approvals', 'comments'] as const) {
      expect(state()[k].filter((r) => r.deliverable_id === 'dlv-001')).toHaveLength(0)
    }
    expect((await p.getDashboard('prj-stc26')).pending_approvals.map((x) => x.deliverable.id)).not.toContain('dlv-001')

    expect(state().cues.some((c) => c.deliverable_id === 'dlv-004')).toBe(true)
    await p.deleteDeliverable('dlv-004')
    expect(state().cues.some((c) => c.deliverable_id === 'dlv-004')).toBe(false)
    expect(await reason(p.deleteDeliverable('dlv-004'))).toMatchObject({ code: 'not_found' })
  })
})
