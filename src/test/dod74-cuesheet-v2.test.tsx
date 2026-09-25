/** @vitest-environment jsdom */
// DoD 74 — 큐시트 재배치 (Phase 3.23 PR-4b · 디자인지시서 v1.4 §7-2.8 · 캔버스 큐시트).
// ① 순서 계산(끌어 옮기기·위/아래 공용) ② 다음 큐 번호 ③ 끌어 옮기기(jsdom DnD) — 큐 끌기에만 반응
// ④ 대본 칸 — 고른 큐 · 모아 보기 · 편집 ⑤ ⋯ 큐 지우기(확인) ⑥ 한 줄 발송 칸의 반려… ⑦ 운영 보드 인라인에도 같은 표
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { moveByOne, nextCueNo, reorderUpdates } from '../components/cue/cueOrder'
import { CUE_DRAG_TYPE } from '../components/cue/CueRow'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const list = (ids: string[]) => ids.map((id, i) => ({ id, sort_order: i + 1 }))

describe('DoD 74 ① 순서 계산', () => {
  it('앞/뒤로 옮기면 바뀌는 큐만 1부터 다시 매긴다', () => {
    const l = list(['a', 'b', 'c', 'd'])
    expect(reorderUpdates(l, 'a', 'c', 'after')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
      { id: 'a', sort_order: 3 },
    ])
    expect(reorderUpdates(l, 'd', 'a', 'before')).toEqual([
      { id: 'd', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'b', sort_order: 3 },
      { id: 'c', sort_order: 4 },
    ])
    // 제자리·자기 자신·없는 id는 아무것도 바꾸지 않는다
    expect(reorderUpdates(l, 'b', 'a', 'after')).toEqual([])
    expect(reorderUpdates(l, 'b', 'b', 'before')).toEqual([])
    expect(reorderUpdates(l, 'x', 'a', 'before')).toEqual([])
  })

  it('한 칸 위/아래 — 끝에서는 빈 배열', () => {
    const l = list(['a', 'b', 'c'])
    expect(moveByOne(l, 'b', -1)).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ])
    expect(moveByOne(l, 'b', 1)).toEqual([
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ])
    expect(moveByOne(l, 'a', -1)).toEqual([])
    expect(moveByOne(l, 'c', 1)).toEqual([])
  })
})

describe('DoD 74 ② 다음 큐 번호', () => {
  it('가장 큰 번호 + 1, 자릿수 유지 · 없거나 숫자가 아니면 행 수로', () => {
    expect(nextCueNo([{ cue_no: 'C01' }, { cue_no: 'C04' }, { cue_no: 'C02' }])).toBe('C05')
    expect(nextCueNo([{ cue_no: 'Q9' }])).toBe('Q10')
    expect(nextCueNo([{ cue_no: 'C099' }])).toBe('C100')
    expect(nextCueNo([])).toBe('C01')
    expect(nextCueNo([{ cue_no: '오프닝' }, { cue_no: null }])).toBe('C03')
  })
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

const cueOrder = () =>
  Array.from(document.querySelectorAll('[data-testid="cue-table"] tbody > tr[data-testid="cue-row"]')).map(
    (tr) => tr.querySelectorAll('td')[1]?.textContent ?? '',
  )
const rowOf = (cueNo: string) => screen.getByText(cueNo, { selector: 'td' }).closest('tr')!

describe('DoD 74 ③ 끌어 옮기기', () => {
  it('C01을 C03 위로 끌어 놓으면(아래 절반) C03 뒤로 간다 · 끄는 동안 놓을 자리 표시', async () => {
    mockProvider().switchUser('usr-ops')
    renderRoute('/items/dlv-004')
    await screen.findByText('C01', { selector: 'td' })
    expect(cueOrder()).toEqual(['C01', 'C02', 'C03', 'C04'])

    const dt = dataTransfer()
    fireEvent.dragStart(rowOf('C01'), { dataTransfer: dt })
    expect(dt.getData(CUE_DRAG_TYPE)).toBeTruthy()
    fireEvent.dragOver(rowOf('C03'), { dataTransfer: dt })
    expect(rowOf('C03').className).toMatch(/shadow-\[inset_0_-2px_0_var\(--accent\)\]/)
    fireEvent.drop(rowOf('C03'), { dataTransfer: dt })
    fireEvent.dragEnd(rowOf('C01'), { dataTransfer: dt })

    await waitFor(() => expect(cueOrder()).toEqual(['C02', 'C03', 'C01', 'C04']))
    const stored = (await mockProvider().listCues('dlv-004')).map((c) => c.cue_no)
    expect(stored).toEqual(['C02', 'C03', 'C01', 'C04'])
  })

  it('파일 같은 다른 끌기에는 반응하지 않는다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C01', { selector: 'td' })
    const before = cueOrder()
    const files = dataTransfer({ Files: '' })
    fireEvent.dragOver(rowOf('C03'), { dataTransfer: files })
    fireEvent.drop(rowOf('C03'), { dataTransfer: files })
    expect(rowOf('C03').className).not.toMatch(/inset_0_-2px/)
    expect(cueOrder()).toEqual(before)
  })
})

describe('DoD 74 ④ 대본 칸', () => {
  it('처음엔 첫 큐 · 모아 보기는 모든 큐 · 편집은 고른 큐의 편집 칸을 연다', async () => {
    renderRoute('/items/dlv-004')
    const panel = await screen.findByTestId('cue-script-panel')
    await within(panel).findByText(/— 표에서 고른 큐$/)
    expect(within(panel).getByText(/^C02 · /)).toBeTruthy() // ③에서 C02가 맨 위로 왔다

    await userEvent.click(screen.getByRole('button', { name: '대본 모아 보기' }))
    expect(within(panel).getByRole('heading', { name: '대본 전체' })).toBeTruthy()
    expect(panel.querySelectorAll('p.text-xs.font-semibold')).toHaveLength(4)
    await userEvent.click(screen.getByRole('button', { name: '고른 큐만 보기' }))

    await userEvent.click(within(rowOf('C04')).getByRole('button', { name: '대본' }))
    await userEvent.click(within(panel).getByRole('button', { name: '편집' }))
    const form = await screen.findByTestId('cue-edit-row')
    expect((within(form).getByLabelText('큐번호') as HTMLInputElement).value).toBe('C04')
  })
})

describe('DoD 74 ⑤ ⋯ 큐 지우기', () => {
  it('확인을 받으면 지우고, 취소하면 그대로다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C04', { selector: 'td' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)

    const pick = async () => {
      await userEvent.click(within(rowOf('C04')).getByRole('button', { name: '큐 메뉴 C04' }))
      await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '큐 지우기' }))
    }
    await pick()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(cueOrder()).toContain('C04')
    await pick()
    await waitFor(() => expect(cueOrder()).not.toContain('C04'))
    expect((await mockProvider().listCues('dlv-004')).map((c) => c.cue_no)).not.toContain('C04')
  })
})

describe('DoD 74 ⑥ 한 줄 발송 칸 — 반려…', () => {
  it('PM 내부검토: 반려…를 누르면 사유 칸이 열리고, 사유를 쓰고 반려하면 초안으로 돌아간다', async () => {
    mockProvider().switchUser('usr-pm')
    renderRoute('/items/dlv-004')
    const card = await screen.findByTestId('next-step-card')
    expect(within(card).queryByLabelText('반려 사유')).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: '반려…' }))
    await userEvent.type(within(card).getByLabelText('반려 사유'), '큐 시간을 다시 맞춰 주세요')
    await userEvent.click(within(card).getByRole('button', { name: '반려' }))
    await waitFor(async () => expect((await mockProvider().getDeliverable('dlv-004')).status).toBe('draft'))
  })
})

describe('DoD 74 ⑦ 운영 보드 인라인 편집', () => {
  it('보드에서 빌더를 열어도 같은 표(메뉴·큐 추가)와 대본 칸이 나온다', async () => {
    mockProvider().switchUser('usr-pm')
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/ops')
    const row = (await screen.findByText('개막식 큐시트')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: '빌더 열기' }))
    const panel = await within(row).findByTestId('builder-panel-cuesheet')
    const sheet = await within(panel).findByRole('region', { name: '큐시트' })
    await within(sheet).findAllByTestId('cue-row')
    expect(within(sheet).getByRole('button', { name: '큐 추가' })).toBeTruthy()
    expect(within(panel).getByTestId('cue-script-panel')).toBeTruthy()
  })
})
