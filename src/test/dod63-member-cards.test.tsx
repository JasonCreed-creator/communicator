/** @vitest-environment jsdom */
// DoD-63 (Phase 3.22, 사용자 지시 2026-09-24 "미리 배치하지 말고 인물카드를 만들어서 인물을 클릭하거나
// 드래그앤드랍으로 설정할 수 있도록"): 온보딩 ②·행사 설정 ② 담당자 = 역할 칸 4개 + 주소록 인물 카드.
//   ① 미리 배치하지 않는다 — 새 행사에는 만든 사람(PM)만 있고, 주소록은 카드로만 기다린다
//   ② 카드를 누르면 역할 버튼이 열리고, 고르면 그 역할 칸에 배정된다
//   ③ 카드를 역할 칸으로 끌어놓아도 배정된다 — 파일 같은 다른 끌기에는 반응하지 않는다
//   ④ 빼면 주소록 카드로 돌아간다(사람은 주소록에 남는다) · 마지막 PM은 여전히 409
//   ⑤ 읽기 전용(비 PM)에는 역할 칸만 — 빼기·카드·추가 폼이 없다
// 저장은 기존 addMember·removeMember 그대로다(DataProvider 125메서드 불변).
// 같은 파일의 테스트는 같은 MockProvider 상태를 공유한다(testUtils 주석) — 시나리오 순서대로 쓴다.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import MembersEditor, { PERSON_DRAG_TYPE } from '../components/settings/MembersEditor'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** jsdom에는 DataTransfer가 없다 — 끌기 시작(setData)과 놓기(getData)가 같은 상자를 보게 한다 */
function dataTransfer(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get types() {
      return [...store.keys()]
    },
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    dropEffect: 'none',
    effectAllowed: 'all',
  }
}

const lane = (label: 'PM' | '디자인' | '운영' | '등록') => screen.getByRole('region', { name: `${label} 담당` })
const pool = () => screen.getByRole('list', { name: '배정할 수 있는 담당자' })

let projectId = ''

beforeAll(async () => {
  // 새 행사 — 필수 4(행사명·코드·시작일·장소)를 채워 온보딩 ①을 '다음'으로 넘길 수 있게 한다
  const created = await mockProvider().createProject({
    name: '카드 배정 시험 행사',
    code: 'CARD-63',
    event_date: '2026-11-20',
    venue: '가상 컨벤션홀',
  })
  projectId = created.id
})

describe('DoD-63 ① 미리 배치하지 않는다', () => {
  it('새 행사 온보딩 ②: PM 칸에 만든 사람만 있고, 나머지 칸은 비어 있으며, 주소록은 카드로 기다린다', async () => {
    localStorage.setItem('communicator.currentProjectId', projectId)
    renderRoute('/onboarding')
    await userEvent.click(await screen.findByRole('button', { name: '다음: 담당자' }))
    expect(await screen.findByRole('heading', { name: '담당자 배정' })).toBeTruthy()

    expect(await within(lane('PM')).findByText('김기획')).toBeTruthy()
    for (const label of ['디자인', '운영', '등록'] as const) {
      expect(within(lane(label)).getByText('카드를 여기로 끌어놓기')).toBeTruthy()
      expect(within(lane(label)).queryAllByRole('listitem')).toHaveLength(0)
    }
    // 주소록 3명이 카드로 — 배정되지 않았다
    for (const name of ['이디자', '박운영', '최등록']) {
      expect(within(pool()).getByRole('button', { name: `${name} 역할 고르기` })).toBeTruthy()
    }
    // 옛 셀렉트 피커는 없다
    expect(screen.queryByRole('option', { name: '담당자 선택' })).toBeNull()

    // 저장소도 같다 — 만든 사람 1명(PM)뿐
    const members = await mockProvider().listMembers(projectId)
    expect(members.map((m) => [m.profile.name, m.role])).toEqual([['김기획', 'pm']])
  })
})

describe('DoD-63 ②·③ 카드를 누르거나 끌어놓아 배정한다', () => {
  it('누르기: 카드 → 역할 버튼 → 운영 칸에 배정, 주소록 카드에서는 사라진다', async () => {
    localStorage.setItem('communicator.currentProjectId', projectId)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))

    const card = await within(pool()).findByRole('button', { name: '박운영 역할 고르기' })
    expect(card.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(card)
    expect(card.getAttribute('aria-expanded')).toBe('true')
    const roles = screen.getByRole('group', { name: '박운영 역할' })
    expect(within(roles).getAllByRole('button').map((b) => b.textContent)).toEqual(['PM', '디자인', '운영', '등록'])

    await userEvent.click(within(roles).getByRole('button', { name: '박운영 운영으로 배정' }))
    const opsCard = (await within(lane('운영')).findByText('박운영')).closest('[data-member-card]') as HTMLElement
    // 주소록의 직함·전화가 그대로 따라온다(재입력 없음)
    expect(within(opsCard).getByText('운영팀 과장')).toBeTruthy()
    expect(within(opsCard).getByText('010-0000-1003')).toBeTruthy()
    await waitFor(() => expect(within(pool()).queryByText('박운영')).toBeNull())

    const saved = await mockProvider().listMembers(projectId)
    expect(saved.find((m) => m.profile.name === '박운영')?.role).toBe('ops')
  })

  it('키보드: 카드에서 Enter로 역할 버튼을 연다(끌기를 못 쓰는 환경의 같은 경로)', async () => {
    localStorage.setItem('communicator.currentProjectId', projectId)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))

    const card = await within(pool()).findByRole('button', { name: '최등록 역할 고르기' })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(card.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: '최등록 역할' })).toBeTruthy()
    // 다시 Enter면 닫힌다 — 배정하지 않고 되돌릴 수 있다
    await userEvent.keyboard('{Enter}')
    expect(card.getAttribute('aria-expanded')).toBe('false')
    expect(await mockProvider().listMembers(projectId)).toHaveLength(2) // 김기획·박운영 — 늘지 않았다
  })

  it('끌어놓기: 카드를 디자인 칸에 놓으면 배정된다 — 끄는 동안 칸이 받을 자리를 보여 준다', async () => {
    localStorage.setItem('communicator.currentProjectId', projectId)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))

    const cardItem = (await within(pool()).findByText('이디자')).closest('[data-person-card]') as HTMLElement
    expect(cardItem.getAttribute('draggable')).toBe('true')
    const dt = dataTransfer()
    fireEvent.dragStart(cardItem, { dataTransfer: dt })
    expect(dt.getData(PERSON_DRAG_TYPE)).toBeTruthy() // 카드가 사람 id를 싣는다

    const target = lane('디자인')
    fireEvent.dragEnter(target, { dataTransfer: dt })
    fireEvent.dragOver(target, { dataTransfer: dt })
    expect(within(target).getByText('여기에 놓으면 배정됩니다')).toBeTruthy()
    expect(target.className).toContain('border-accent')

    fireEvent.drop(target, { dataTransfer: dt })
    fireEvent.dragEnd(cardItem, { dataTransfer: dt })
    expect(await within(lane('디자인')).findByText('이디자')).toBeTruthy()
    await waitFor(() => expect(within(pool()).queryByText('이디자')).toBeNull())
    const saved = await mockProvider().listMembers(projectId)
    expect(saved.find((m) => m.profile.name === '이디자')?.role).toBe('design')
  })

  it('파일처럼 사람 카드가 아닌 끌기에는 반응하지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', projectId)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))
    await within(pool()).findByText('최등록')

    const files = dataTransfer({ Files: '' })
    const target = lane('등록')
    fireEvent.dragEnter(target, { dataTransfer: files })
    fireEvent.dragOver(target, { dataTransfer: files })
    expect(within(target).queryByText('여기에 놓으면 배정됩니다')).toBeNull()
    fireEvent.drop(target, { dataTransfer: files })

    expect(within(lane('등록')).getByText('카드를 여기로 끌어놓기')).toBeTruthy()
    expect(within(pool()).getByText('최등록')).toBeTruthy()
    expect(await mockProvider().listMembers(projectId)).toHaveLength(3)
  })
})

describe('DoD-63 ④ 빼기', () => {
  it('빼면 역할 칸에서 사라지고 주소록 카드로 돌아간다 · 마지막 PM은 409로 남는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    localStorage.setItem('communicator.currentProjectId', projectId)
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: '담당자' }))

    const opsCard = (await within(lane('운영')).findByText('박운영')).closest('[data-member-card]') as HTMLElement
    await userEvent.click(within(opsCard).getByRole('button', { name: '박운영 빼기' }))
    await waitFor(() => expect(within(lane('운영')).queryByText('박운영')).toBeNull())
    expect(await within(pool()).findByRole('button', { name: '박운영 역할 고르기' })).toBeTruthy()
    // 확인 문구가 '주소록에는 남는다'를 말한다 — 사람을 지우는 동작이 아니다
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toMatch(/주소록\)에는 그대로 남습니다/)

    const pmCard = within(lane('PM')).getByText('김기획').closest('[data-member-card]') as HTMLElement
    await userEvent.click(within(pmCard).getByRole('button', { name: '김기획 빼기' }))
    expect(await screen.findByText(/마지막 PM은 삭제할 수 없습니다/)).toBeTruthy()
    expect(within(lane('PM')).getByText('김기획')).toBeTruthy()
  })
})

describe('DoD-63 ⑤ 읽기 전용', () => {
  it('비 PM 화면: 역할 칸의 배정 현황만 — 빼기·주소록 카드·추가 폼이 없다', async () => {
    render(
      <MemoryRouter>
        <MembersEditor projectId={projectId} readOnly />
      </MemoryRouter>,
    )
    // 역할 칸은 배정 목록을 읽은 뒤에 그려진다
    const pmLane = await screen.findByRole('region', { name: 'PM 담당' })
    expect(within(pmLane).getByText('김기획')).toBeTruthy()
    expect(within(lane('디자인')).getByText('이디자')).toBeTruthy()
    expect(within(lane('운영')).getByText('배정 없음')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /빼기$/ })).toBeNull()
    expect(screen.queryByRole('list', { name: '배정할 수 있는 담당자' })).toBeNull()
    expect(screen.queryByRole('button', { name: '추가' })).toBeNull()
    // 읽기 전용 칸은 끌어놓기를 받지 않는다
    const dt = dataTransfer({ [PERSON_DRAG_TYPE]: 'usr-ops' })
    fireEvent.dragOver(lane('운영'), { dataTransfer: dt })
    fireEvent.drop(lane('운영'), { dataTransfer: dt })
    expect(within(lane('운영')).getByText('배정 없음')).toBeTruthy()
  })
})
