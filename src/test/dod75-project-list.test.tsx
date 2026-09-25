/** @vitest-environment jsdom */
// DoD 75 — 행사 목록 세 묶음 (Phase 3.23 PR-5 · 디자인지시서 v1.4 §7-2.9 · 캔버스 행사 목록).
// ① 먼저 확인할 행사 = 세팅 미완료 줄 + 행사일 지난 진행 중 줄(종료하기) ② 진행 중 = 행사일 가까운 순 카드
// ③ 카드 ⋯ 메뉴(행사 설정 열기 · 종료하기) — 메뉴를 눌러도 카드로 들어가지 않는다 ④ 종료된 행사 접힘 + 재개하기
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const today = toIsoDate(new Date())
let pastId = ''

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  // 샘플 행사는 27일 뒤(진행 중), 진행 중 행사 하나는 5일 전(행사일 지남)으로 옮겨 결정적으로 만든다
  await p.updateProject(PROJECT_ID, { event_date: addDays(today, 27) })
  const other = (await p.listProjects()).find((s) => s.status === 'active' && s.onboarded && s.id !== PROJECT_ID)!
  pastId = other.id
  await p.updateProject(pastId, { event_date: addDays(today, -5) })
})

async function openList() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
  renderRoute('/projects')
  await screen.findByRole('heading', { name: '행사 목록' })
  await screen.findAllByTestId('project-card')
}

describe('DoD 75 ① 먼저 확인할 행사', () => {
  it('행사일이 지난 진행 중 행사는 카드가 아니라 줄 — 행사일 지남 · n일 지남(빨강) · 종료하기', async () => {
    await openList()
    const group = screen.getByRole('region', { name: '먼저 확인할 행사' })
    const row = within(group).getAllByTestId('past-row').find((r) => r.dataset.projectId === pastId)!
    expect(within(row).getByText('행사일 지남')).toBeTruthy()
    const pill = within(row).getByText('5일 지남')
    expect(pill.className).toContain('text-negative')
    expect(row.textContent).toContain('종료해도 자료는 그대로 남습니다')
    expect(screen.queryAllByTestId('project-card').some((c) => c.dataset.projectId === pastId)).toBe(false)
  })

  it('종료하기 → 줄이 사라지고 종료된 행사로 간다(자료는 그대로)', async () => {
    await openList()
    const row = screen.getAllByTestId('past-row').find((r) => r.dataset.projectId === pastId)!
    await userEvent.click(within(row).getByRole('button', { name: '종료하기' }))
    await waitFor(() => expect(screen.queryAllByTestId('past-row').some((r) => r.dataset.projectId === pastId)).toBe(false))
    expect((await mockProvider().getProject(pastId)).status).toBe('closed')
    // 종료된 행사를 펼치면 거기에 있다 → 메뉴의 재개하기로 되돌린다
    await userEvent.click(screen.getByRole('button', { name: /^종료된 행사 \d+$/ }))
    const closedCard = (await screen.findAllByTestId('project-card')).find((c) => c.dataset.projectId === pastId)!
    expect(within(closedCard).getByTestId('card-dday').textContent).toBe('종료')
    await userEvent.click(within(closedCard).getByRole('button', { name: /^행사 메뉴 / }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '재개하기' }))
    await waitFor(async () => expect((await mockProvider().getProject(pastId)).status).toBe('active'))
  })
})

describe('DoD 75 ② 진행 중 — 행사일 가까운 순', () => {
  it('카드 순서 = 행사일 오름차순(날짜 없는 행사는 뒤)', async () => {
    await openList()
    const summaries = await mockProvider().listProjects()
    const order = screen.getAllByTestId('project-card').map((c) => summaries.find((s) => s.id === c.dataset.projectId)!)
    const dates = order.map((s) => s.event_date ?? '9999-12-31')
    expect([...dates].sort()).toEqual(dates)
    expect(order.every((s) => s.status === 'active' && s.onboarded)).toBe(true)
  })
})

describe('DoD 75 ③ 카드 ⋯ 메뉴', () => {
  it('메뉴를 열고 닫아도 카드로 들어가지 않고, 행사 설정 열기는 그 행사의 설정으로 간다', async () => {
    await openList()
    const target = screen.getAllByTestId('project-card').find((c) => c.dataset.projectId !== PROJECT_ID)!
    const menuButton = within(target).getByRole('button', { name: /^행사 메뉴 / })
    await userEvent.click(menuButton)
    expect(screen.getByRole('heading', { name: '행사 목록' })).toBeTruthy()
    // 메뉴 버튼에서 Enter를 눌러도 카드 진입으로 번지지 않는다
    await userEvent.keyboard('{Escape}')
    menuButton.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '행사 목록' })).toBeTruthy()
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '행사 설정 열기' }))
    expect(await screen.findByRole('heading', { name: '행사 설정' })).toBeTruthy()
    expect(localStorage.getItem('communicator.currentProjectId')).toBe(target.dataset.projectId)
  })

  it('카드를 누르면 그 행사의 홈으로', async () => {
    await openList()
    const target = screen.getAllByTestId('project-card').find((c) => c.dataset.projectId === PROJECT_ID)!
    await userEvent.click(within(target).getByRole('heading'))
    expect(await screen.findByRole('heading', { name: '홈 대시보드' })).toBeTruthy()
  })
})

describe('DoD 75 ④ 머리 — 채운 버튼 1개', () => {
  it('새 행사 만들기(accent) 하나 + "가까운 날짜 순" 캡션, 점선 새 행사 타일은 없다', async () => {
    await openList()
    const filled = [...document.querySelectorAll('main .btn-accent, main .btn-primary')]
    expect(filled.map((b) => b.textContent)).toEqual(['＋ 새 행사 만들기'])
    expect(screen.getByText('가까운 날짜 순')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /새 행사 만들기/ })).toHaveLength(1)
  })
})
