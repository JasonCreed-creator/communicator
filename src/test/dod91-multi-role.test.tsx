/** @vitest-environment jsdom */
// DoD 91 — 담당자 중복 배정(Phase 6.6 · 설계서 v2.19 §4-2·§6.1). 한 사람이 한 행사에서 여러 역할 · 권한은 합집합.
//   ① lib/roles 순수 함수 ② mock: 같은 사람 다른 역할 OK · 같은 역할 409 · 역할 하나만 빼기 · 마지막 PM 역할 409 · roles 집합
//   ③ 권한 합집합(디자인+운영이면 두 영역 다) ④ 화면: 카드 잔류 + 칩 + 두 칸에 같은 사람 + 칸별 빼기
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { canWriteArea, hasRole, isPm, primaryRole, rolesOf, sortRoles } from '../lib/roles'
import { mockProvider, renderRoute } from './testUtils'

// mock 싱글턴은 파일 안에서 상태를 공유한다 — 각 테스트가 더한 역할을 되돌린다
const EXTRA: [string, 'pm' | 'design' | 'ops' | 'reg'][] = [
  ['usr-ops', 'reg'],
  ['usr-ops', 'design'],
  ['usr-pm', 'ops'],
  ['usr-design', 'ops'],
]
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  const p = mockProvider()
  p.switchUser('usr-pm')
  for (const [id, role] of EXTRA) await p.removeMember(PROJECT_ID, id, role).catch(() => undefined)
})

describe('DoD 91 ① lib/roles', () => {
  it('대표 역할 = pm > design > ops > reg · 정렬 · 합집합 판정', () => {
    expect(primaryRole(['reg', 'ops'])).toBe('ops')
    expect(primaryRole(['design', 'pm'])).toBe('pm')
    expect(primaryRole([])).toBeNull()
    expect(sortRoles(['reg', 'pm', 'ops'])).toEqual(['pm', 'ops', 'reg'])
    expect(rolesOf({ role: 'design' })).toEqual(['design']) // roles 없는 옛 값
    expect(rolesOf({ role: 'design', roles: ['design', 'ops'] })).toEqual(['design', 'ops'])
    expect(hasRole({ role: 'design', roles: ['design', 'ops'] }, 'ops')).toBe(true)
    expect(isPm({ role: 'design', roles: ['design', 'ops'] })).toBe(false)
    expect(canWriteArea(['design', 'ops'], 'ops')).toBe(true)
    expect(canWriteArea(['design'], 'ops')).toBe(false)
    expect(canWriteArea(['reg'], 'common')).toBe(false)
    expect(canWriteArea(['ops'], 'common')).toBe(false) // common은 pm 전용(mock·ctx 규칙)
    expect(canWriteArea(['pm'], 'common')).toBe(true)
  })
})

describe('DoD 91 ② mock — 같은 사람을 여러 역할에', () => {
  it('다른 역할로 또 배정할 수 있고, 같은 역할은 409다', async () => {
    const p = mockProvider()
    const before = (await p.listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-ops').map((m) => m.role)
    expect(before).toEqual(['ops'])
    await p.addMember(PROJECT_ID, { display_name: '박운영', email: 'ops@example.com', role: 'reg' })
    const after = (await p.listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-ops').map((m) => m.role)
    expect(after.sort()).toEqual(['ops', 'reg'])
    await expect(p.addMember(PROJECT_ID, { display_name: '박운영', email: 'ops@example.com', role: 'reg' })).rejects.toMatchObject({
      code: 'conflict',
      message: '이미 이 행사의 등록 담당자입니다.',
    })
    // 주소록 배정 현황에도 두 줄
    const person = (await p.listPeople()).find((x) => x.id === 'usr-ops')!
    expect(person.assignments.filter((a) => a.project_id === PROJECT_ID).map((a) => a.role).sort()).toEqual(['ops', 'reg'])
  })

  it('removeMember에 역할을 주면 그 역할만 빠지고, 주지 않으면 전부 빠진다', async () => {
    const p = mockProvider()
    await p.addMember(PROJECT_ID, { display_name: '박운영', email: 'ops@example.com', role: 'reg' })
    await p.removeMember(PROJECT_ID, 'usr-ops', 'reg')
    expect((await p.listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-ops').map((m) => m.role)).toEqual(['ops'])
    await expect(p.removeMember(PROJECT_ID, 'usr-ops', 'reg')).rejects.toMatchObject({ code: 'not_found' })
    await p.addMember(PROJECT_ID, { display_name: '박운영', email: 'ops@example.com', role: 'design' })
    await p.removeMember(PROJECT_ID, 'usr-ops')
    expect((await p.listMembers(PROJECT_ID)).some((m) => m.user_id === 'usr-ops')).toBe(false)
    // 픽스처 상태 복원(운영) — 뒤 테스트가 같은 싱글턴을 쓴다
    await p.addMember(PROJECT_ID, { display_name: '박운영', email: 'ops@example.com', role: 'ops' })
  })

  it('PM이 다른 역할도 가졌을 때: pm 역할 빼기는 마지막 PM 409, 다른 역할 빼기는 된다', async () => {
    const p = mockProvider()
    await p.addMember(PROJECT_ID, { display_name: '김기획', email: 'pm@example.com', role: 'ops' })
    await expect(p.removeMember(PROJECT_ID, 'usr-pm', 'pm')).rejects.toMatchObject({ code: 'conflict' })
    await expect(p.removeMember(PROJECT_ID, 'usr-pm')).rejects.toMatchObject({ code: 'conflict' }) // 전부 빼기도 pm을 포함하므로 409
    await p.removeMember(PROJECT_ID, 'usr-pm', 'ops')
    expect((await p.listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-pm').map((m) => m.role)).toEqual(['pm'])
  })

  it('getCurrentUser().roles = 지금 보는 행사의 역할 전부 · role = 대표 역할', async () => {
    const p = mockProvider()
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID) // supabase ctx와 같이 '지금 보는 행사' 기준
    await p.addMember(PROJECT_ID, { display_name: '박운영', email: 'ops@example.com', role: 'reg' })
    p.switchUser('usr-ops')
    const me = await p.getCurrentUser()
    expect(me.roles).toEqual(['ops', 'reg'])
    expect(me.role).toBe('ops')
    p.switchUser('usr-pm')
    expect((await p.getCurrentUser()).roles).toEqual(['pm'])
  })
})

describe('DoD 91 ③ 권한 합집합', () => {
  it('디자인 담당이 운영 역할도 받으면 운영 영역 항목을 만들 수 있고, 디자인만이면 403 그대로', async () => {
    const p = mockProvider()
    p.switchUser('usr-design')
    await expect(
      p.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '큐', title: '운영 항목', requires_approval: true }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    p.switchUser('usr-pm')
    await p.addMember(PROJECT_ID, { display_name: '이디자', email: 'design@example.com', role: 'ops' })
    p.switchUser('usr-design')
    const created = await p.createDeliverable({
      project_id: PROJECT_ID,
      area: 'ops',
      category: '큐',
      title: '운영 항목',
      requires_approval: true,
    })
    expect(created.area).toBe('ops')
    // 디자인 영역도 그대로 된다 — 합집합
    const d2 = await p.createDeliverable({
      project_id: PROJECT_ID,
      area: 'design',
      category: '배너',
      title: '디자인 항목',
      requires_approval: true,
    })
    expect(d2.area).toBe('design')
    // pm 전용은 여전히 403
    await expect(p.updateProject(PROJECT_ID, { venue: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('DoD 91 ④ 담당자 편집기', () => {
  const lane = (label: string) => screen.getByRole('region', { name: `${label} 담당` })
  const pool = () => screen.getByRole('list', { name: '배정할 수 있는 담당자' })

  it('배정된 사람도 카드로 남고, 다른 역할 칸에도 배정되며, 칸의 빼기는 그 역할만 뺀다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))

    // 박운영은 이미 운영 — 카드가 남아 있고 칩이 '운영'
    const card = await within(pool()).findByRole('button', { name: '박운영 역할 고르기' })
    expect(within(pool()).getByTestId('person-held-usr-ops').textContent).toContain('운영')
    await userEvent.click(card)
    const group = screen.getByRole('group', { name: '박운영 역할' })
    expect((within(group).getByRole('button', { name: '박운영 운영으로 배정' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(within(group).getByRole('button', { name: '박운영 등록으로 배정' }))

    // 두 칸에 같은 사람
    expect(await within(lane('등록')).findByText('박운영')).toBeTruthy()
    expect(within(lane('운영')).getByText('박운영')).toBeTruthy()
    await waitFor(() => expect(within(pool()).getByTestId('person-held-usr-ops').textContent).toContain('등록'))
    expect((await mockProvider().listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-ops').map((m) => m.role).sort()).toEqual(['ops', 'reg'])

    // 등록 칸의 빼기 = 등록만
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const regCard = within(lane('등록')).getByText('박운영').closest('[data-member-card]') as HTMLElement
    await userEvent.click(within(regCard).getByRole('button', { name: '박운영 등록에서 빼기' }))
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toMatch(/등록 담당에서 뺄까요\? 다른 역할과 담당자 목록\(주소록\)에는 그대로 남습니다/)
    await waitFor(() => expect(within(lane('등록')).queryByText('박운영')).toBeNull())
    expect(within(lane('운영')).getByText('박운영')).toBeTruthy()
    expect((await mockProvider().listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-ops').map((m) => m.role)).toEqual(['ops'])
  })

  it('끌어놓기: 이미 가진 역할 칸에 놓으면 사실을 알리고 배정하지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))
    await within(pool()).findByRole('button', { name: '박운영 역할 고르기' })
    const { fireEvent } = await import('@testing-library/react')
    const { PERSON_DRAG_TYPE } = await import('../components/settings/MembersEditor')
    const store: Record<string, string> = { [PERSON_DRAG_TYPE]: 'usr-ops' }
    const dt = { types: Object.keys(store), getData: (t: string) => store[t] ?? '', setData: () => undefined, dropEffect: 'copy', effectAllowed: 'copy' }
    fireEvent.dragOver(lane('운영'), { dataTransfer: dt })
    fireEvent.drop(lane('운영'), { dataTransfer: dt })
    expect(await screen.findByText('박운영 님은 이미 이 행사의 운영 담당입니다.')).toBeTruthy()
    expect((await mockProvider().listMembers(PROJECT_ID)).filter((m) => m.user_id === 'usr-ops')).toHaveLength(1)
  })
})
