/** @vitest-environment jsdom */
// DoD 96 (Phase 6.11 PR-C · 설계서 v2.21 §27.4) — 화면: S5 담당자 칸(멤버 카드 피커) · Lv2 묶음 줄 · ＋ 태스크 추가(C-1 · 행사별 · 지우기) ·
// 템플릿 태스크는 지우기 없음 · 간트 담당자 이름 + 마일스톤 마커 · R&R 사람 칩 + pm 편집 · 읽기 전용(design) · 홈 '내 차례'(배정).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

// 샘플 행사 WBS는 event_date '2026-10-22' 고정 — dod13과 같은 이유로 시계를 픽스처 가정일에 고정한다(Date만 가짜)
const FIXTURE_TODAY = new Date('2026-08-27T09:00:00')
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXTURE_TODAY)
})
afterAll(() => {
  vi.useRealTimers()
})

// mock 싱글턴은 파일 안에서 상태를 공유한다 — 각 테스트가 남긴 배정·행사별 태스크·R&R 사람을 되돌린다
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  const p = mockProvider()
  p.switchUser('usr-pm')
  for (const t of await p.listWbsTasks(PROJECT_ID)) {
    if (t.source === 'custom') await p.deleteWbsTask(t.id)
    else if (t.assignee_id || t.group_name) await p.updateWbsTask(t.id, { assignee_id: null, group_name: null })
  }
  for (const c of await p.listRoleCharters(PROJECT_ID)) if (c.people) await p.updateRoleCharter(c.id, { people: null })
})

function wbsCard(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'WBS' })
  return heading.closest('div')!.parentElement as HTMLElement
}

describe('DoD 96 — S5 담당자 칸 · 묶음 · 행사별 태스크', () => {
  it('(a) pm — 담당 칸은 미배정이면 역할, 누르면 멤버 카드가 열리고 고르면 이름으로 바뀐다(provider 저장)', async () => {
    mockProvider().switchUser('usr-pm')
    renderRoute('/schedule')
    await screen.findByText('1.1')
    const row = screen.getByText('1.1').closest('tr')!
    const cell = within(row).getByRole('button', { name: '1.1 담당자 고르기' })
    expect(cell.textContent).toContain('PM')
    await userEvent.click(cell)
    const picker = await screen.findByRole('group', { name: '1.1 담당자' })
    expect(within(picker).getAllByRole('button', { name: /^(김기획|이디자|박운영|최등록)/ })).toHaveLength(4)
    await userEvent.click(within(picker).getByRole('button', { name: '이디자' }))
    await waitFor(async () => {
      const t = (await mockProvider().listWbsTasks(PROJECT_ID)).find((x) => x.code === '1.1')!
      expect(t.assignee_id).toBe('usr-design')
    })
    await waitFor(() => {
      const again = screen.getByText('1.1').closest('tr')!
      expect(within(again).getByRole('button', { name: '1.1 담당자 고르기' }).textContent).toContain('이디자')
    })
    expect(screen.queryByRole('group', { name: '1.1 담당자' })).toBeNull()
  })

  it('(b) pm — ＋ 태스크 추가 → 단계·묶음·제목·기간·역할·담당자·소통 대상 → C-1 행(행사별 태그 · 묶음 줄 · 담당 이름) → 편집에서 지우기', async () => {
    mockProvider().switchUser('usr-pm')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderRoute('/schedule')
    await screen.findByText('1.1')
    const add = within(wbsCard()).getByRole('button', { name: '＋ 태스크 추가' })
    expect(add.className).toContain('btn-primary')
    await userEvent.click(add)
    const form = await screen.findByTestId('wbs-create-form')
    expect(add.className).toContain('btn-ghost') // 폼을 열면 채운 버튼이 물러난다
    await userEvent.selectOptions(within(form).getByLabelText('단계'), '2')
    await userEvent.type(within(form).getByLabelText('묶음'), '제작')
    await userEvent.type(within(form).getByLabelText('태스크명'), '현장 사인물 수량 확정')
    await userEvent.type(within(form).getByLabelText('시작일'), '2026-10-10')
    await userEvent.type(within(form).getByLabelText('종료일'), '2026-10-12')
    await userEvent.selectOptions(within(form).getByLabelText('담당 역할'), 'ops')
    await userEvent.click(within(form).getByRole('button', { name: '박운영' }))
    await userEvent.type(within(form).getByLabelText('소통 대상'), '협력사')
    await userEvent.click(within(form).getByRole('button', { name: '추가' }))
    const code = await screen.findByText('C-1')
    const row = code.closest('tr')!
    expect(within(row).getByText('행사별')).toBeTruthy()
    expect(within(row).getByText('현장 사인물 수량 확정')).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'C-1 담당자 고르기' }).textContent).toContain('박운영')
    expect(within(row).getByText('협력사')).toBeTruthy()
    const groupRow = screen.getByTestId('wbs-group-row')
    expect(groupRow.textContent).toContain('제작')
    expect(groupRow.textContent).toContain('1건')
    expect(screen.queryByTestId('wbs-create-form')).toBeNull()
    const created = (await mockProvider().listWbsTasks(PROJECT_ID)).find((t) => t.code === 'C-1')!
    expect(created).toMatchObject({ source: 'custom', phase_no: 2, group_name: '제작', assignee_id: 'usr-ops', target: '협력사' })

    // 편집 → 행사별 태스크는 '이 태스크 지우기'
    await userEvent.click(within(row).getByRole('button', { name: '편집' }))
    await userEvent.click(await screen.findByTestId(`wbs-delete-${created.id}`))
    await waitFor(() => expect(screen.queryByText('C-1')).toBeNull())
    expect((await mockProvider().listWbsTasks(PROJECT_ID)).some((t) => t.id === created.id)).toBe(false)
  })

  it('(c) pm — 템플릿 태스크 편집 폼에는 지우기 단추가 없고 완료 처리 안내만 · 묶음을 적으면 묶음 줄이 생긴다', async () => {
    mockProvider().switchUser('usr-pm')
    renderRoute('/schedule')
    await screen.findByText('1.2')
    const row = screen.getByText('1.2').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '편집' }))
    expect(screen.queryByRole('button', { name: '이 태스크 지우기' })).toBeNull()
    expect(screen.getByText(/템플릿 태스크는 지우지 않아요/)).toBeTruthy()
    await userEvent.type(screen.getByPlaceholderText('Lv2 — 비우면 없음'), '킥오프')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.getByTestId('wbs-group-row').textContent).toContain('킥오프'))
    expect((await mockProvider().listWbsTasks(PROJECT_ID)).find((t) => t.code === '1.2')!.group_name).toBe('킥오프')
  })

  it('(d) 간트 — 라벨 칸에 담당자 이름 · 축 범위(D-42~D+30) 안 마일스톤 2개가 마커로', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    const t = (await p.listWbsTasks(PROJECT_ID)).find((x) => x.code === '1.3')!
    await p.updateWbsTask(t.id, { assignee_id: 'usr-ops' })
    renderRoute('/schedule')
    await screen.findByText('1.1')
    await userEvent.click(within(wbsCard()).getByRole('button', { name: '간트' }))
    await waitFor(() => expect(screen.getAllByTestId('wbs-gantt-bar').length).toBeGreaterThan(0))
    const names = screen.getAllByTestId('wbs-gantt-assignee')
    expect(names).toHaveLength(1)
    expect(names[0].textContent).toContain('박운영')
    const markers = screen.getAllByTestId('wbs-gantt-milestone')
    expect(markers).toHaveLength(2) // 9/30 인쇄물 일괄 발주(D-22) · 9/11 운영 시나리오 확정(D-41) — 9/4·9/8·8/4는 축 밖
    expect(markers.map((m) => m.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining([expect.stringContaining('인쇄물 일괄 발주'), expect.stringContaining('운영 시나리오 확정')]),
    )
  })

  it('(e) R&R — pm 편집: ＋ 사람 추가 → 주소록 카드 → 표시 역할 → 저장 → 칩(이름 · 표시 역할)', async () => {
    mockProvider().switchUser('usr-pm')
    renderRoute('/schedule')
    await screen.findByText('1.1')
    const card = screen.getByTestId('rr-card-pm')
    expect(within(card).queryByTestId('rr-people-pm')).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: /편집$/ }))
    await userEvent.click(within(card).getByRole('button', { name: '＋ 사람 추가' }))
    await userEvent.click(within(card).getByRole('button', { name: '이디자' }))
    await userEvent.type(within(card).getByRole('textbox', { name: '이디자 표시 역할' }), 'Sub PM')
    await userEvent.click(within(card).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(within(screen.getByTestId('rr-card-pm')).getByTestId('rr-people-pm').textContent).toContain('이디자'))
    expect(within(screen.getByTestId('rr-card-pm')).getByTestId('rr-people-pm').textContent).toContain('Sub PM')
    const saved = (await mockProvider().listRoleCharters(PROJECT_ID)).find((c) => c.role === 'pm')!
    expect(saved.people).toEqual([{ person_id: 'usr-design', display_role: 'Sub PM' }])
  })

  it('(f) 읽기 전용(design) — 담당 칸은 글자만 · 태스크 추가 없음 · R&R 편집 없음 · 배정된 이름은 보인다', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    const t = (await p.listWbsTasks(PROJECT_ID)).find((x) => x.code === '1.1')!
    await p.updateWbsTask(t.id, { assignee_id: 'usr-design' })
    p.switchUser('usr-design')
    renderRoute('/schedule')
    await screen.findByText('1.1')
    expect(screen.queryByRole('button', { name: /담당자 고르기$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '＋ 태스크 추가' })).toBeNull()
    expect(within(screen.getByText('1.1').closest('tr')!).getByText('이디자')).toBeTruthy()
    expect(within(screen.getByTestId('rr-card-pm')).queryByRole('button', { name: /편집$/ })).toBeNull()
  })

  it('(g) 홈 오늘 할 일 — 나에게 배정된 지연 태스크는 역할이 달라도 내 차례 · 담당 이름이 줄에', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    const created = await p.createWbsTask(PROJECT_ID, {
      phase_no: 1,
      title: '배정 확인용 지연 태스크',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      role: 'reg',
      assignee_id: 'usr-design',
    })
    p.switchUser('usr-design')
    renderRoute('/home')
    await screen.findByText('홈 대시보드')
    const row = (await screen.findByText(created.title)).closest('tr')!
    expect(row.textContent).toContain('이디자')
    await userEvent.click(screen.getByRole('button', { name: /^내 차례/ }))
    expect(screen.getByText(created.title)).toBeTruthy()
  })
})
