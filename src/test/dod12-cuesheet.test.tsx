/** @vitest-environment jsdom */
// DoD-12: 큐시트 정형 에디터 — 행 추가·편집·정렬이 S9 큐시트 섹션에 즉시 반영, 컨펌 발송 시
// 스냅숏 버전 자동 등록 (CLAUDE.md v1.4 §7 DoD-12, Phase 3.6c). 대상: dlv-004(개막식 큐시트,
// ops, internal_review, 큐 4행 cue-001~004). 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로
// 실행되며 같은 MockProvider 상태를 공유한다 (src/test/testUtils.tsx 참조).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

/** 큐시트 표의 큐 번호를 순서대로 — Phase 3.23 PR-4b부터 행마다 data-testid="cue-row"(편집 가능하면 첫 칸은 손잡이).
 *  Phase 3.24 PR-B부터 칸 순서 = 시각 · 큐 · 구분 … — 큐 번호는 데이터 칸의 두 번째 */
function cueNoOrder(scope: ParentNode = document): string[] {
  return Array.from(scope.querySelectorAll('[data-testid="cue-table"] tbody > tr[data-testid="cue-row"]')).map((tr) => {
    const cells = Array.from(tr.querySelectorAll('td'))
    const data = cells[0].getAttribute('aria-hidden') === 'true' ? cells.slice(1) : cells
    return data[1]?.textContent ?? ''
  })
}

const rowOf = (cueNo: string) => screen.getByText(cueNo, { selector: 'td' }).closest('tr')!

/** 행 끝 ⋯ 메뉴에서 고른다 */
async function pickFromMenu(cueNo: string, item: RegExp | string) {
  await userEvent.click(within(rowOf(cueNo)).getByRole('button', { name: `큐 메뉴 ${cueNo}` }))
  await userEvent.click(within(screen.getByRole('menu', { name: `큐 메뉴 ${cueNo}` })).getByRole('menuitem', { name: item }))
}

/** S9 큐시트 섹션(열 순서: 시각·큐·구분…)의 '큐' 열(2번째 셀) 값을 순서대로 읽는다 */
function planCueOrder(section: HTMLElement): string[] {
  return Array.from(section.querySelectorAll('table tbody > tr')).map(
    (tr) => tr.querySelectorAll('td')[1]?.textContent ?? '',
  )
}

describe('DoD-12 큐시트 정형 에디터', () => {
  it('(a) ops로 /items/dlv-004 진입 시 정형 표가 렌더되고(파일 업로드 폼 없음) 큐 4행이 보인다', async () => {
    mockProvider().switchUser('usr-ops')
    renderRoute('/items/dlv-004')

    const sheet = await screen.findByRole('region', { name: '큐시트' })
    // 큐 목록은 비동기 조회(useAsync) — 첫 큐가 뜰 때까지 기다린 뒤 표를 검사한다
    await within(sheet).findByText('C01')
    expect(within(sheet).getByRole('heading', { name: '큐 4개' })).toBeTruthy()

    // 파일 업로드 폼 대신 정형 표 — 버전 업로드 UI가 전혀 없다
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.queryByRole('button', { name: '업로드' })).toBeNull()

    // 표 머리 — 손잡이·메뉴 칸은 이름 없이 비어 있다(§7-2.8)
    const headerRow = within(sheet).getByTestId('cue-table').querySelector('thead tr')!
    expect(headerRow.textContent).toBe('시각큐구분MC·진행조명영상음향')

    // 큐 4행 (cue-001~004)
    expect(cueNoOrder()).toEqual(['C01', 'C02', 'C03', 'C04'])
    expect(screen.getByText('09:20')).toBeTruthy()
    expect(within(sheet).getByText('사전')).toBeTruthy()

    // ops는 편집 UI 사용 가능 — 표 맨 아래 '큐 추가' 한 줄 + 행마다 ⋯ 메뉴 + 끌어 옮기기
    expect(within(sheet).getByRole('button', { name: '큐 추가' })).toBeTruthy()
    expect(within(sheet).getByText(/C05 줄이 바로 생기고/)).toBeTruthy()
    expect(within(rowOf('C01')).getByRole('button', { name: '큐 메뉴 C01' })).toBeTruthy()
    expect(rowOf('C01').getAttribute('draggable')).toBe('true')

    // 대본 칸 — 처음엔 첫 큐, '대본'을 누르면 그 큐의 전문이 표 아래 칸에 뜬다
    const panel = screen.getByTestId('cue-script-panel')
    await userEvent.click(within(rowOf('C03')).getByRole('button', { name: '대본' }))
    expect(await within(panel).findByText(/오늘 이 자리를 찾아주신 여러분을 진심으로 환영합니다/)).toBeTruthy()
    expect(rowOf('C03').getAttribute('aria-selected')).toBe('true')
  })

  it('(b) 큐 추가 — 다음 번호(C05) 줄이 바로 생기고 편집 칸이 열린다 → 채워 저장하면 표에 반영된다', async () => {
    renderRoute('/items/dlv-004')
    const sheet = await screen.findByRole('region', { name: '큐시트' })
    await within(sheet).findByText('C01')

    await userEvent.click(within(sheet).getByRole('button', { name: '큐 추가' }))
    const form = await screen.findByTestId('cue-edit-row')
    expect((within(form).getByLabelText('큐번호') as HTMLInputElement).value).toBe('C05')
    await userEvent.type(within(form).getByLabelText('시각'), '10:05')
    await userEvent.type(within(form).getByLabelText('구분'), 'VIP 소개')
    await userEvent.type(within(form).getByLabelText('MC·진행(대본)'), 'VIP 등장 안내 멘트')
    await userEvent.type(within(form).getByLabelText('음향'), 'SFX')
    await userEvent.type(within(form).getByLabelText('조명'), '스팟')
    await userEvent.type(within(form).getByLabelText('영상'), 'VIP 프로필')
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(cueNoOrder()).toEqual(['C01', 'C02', 'C03', 'C04', 'C05']))
    const c05Row = rowOf('C05')
    expect(within(c05Row).getByText('10:05')).toBeTruthy()
    expect(within(c05Row).getByText('VIP 소개')).toBeTruthy()

    const cues = await mockProvider().listCues('dlv-004')
    expect(cues).toHaveLength(5)
  })

  it('(c) ⋯ → 이 큐 고치기 — 시간 변경이 반영된다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C01', { selector: 'td' })

    await pickFromMenu('C01', '이 큐 고치기')
    const form = await screen.findByTestId('cue-edit-row')
    const timeInput = within(form).getByLabelText('시각') as HTMLInputElement
    expect(timeInput.value).toBe('09:20')
    await userEvent.clear(timeInput)
    await userEvent.type(timeInput, '09:15')
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(within(rowOf('C01')).getByText('09:15')).toBeTruthy())
    expect(within(rowOf('C01')).queryByText('09:20')).toBeNull()

    const cue = (await mockProvider().listCues('dlv-004')).find((c) => c.cue_no === 'C01')
    expect(cue?.time_at).toBe('09:15')
  })

  it('(d) 순서 — ⋯ 아래로 옮기기, 맨 위는 위로 옮기기가 막히고 이유가 붙는다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C01', { selector: 'td' })
    expect(cueNoOrder()).toEqual(['C01', 'C02', 'C03', 'C04', 'C05'])

    await userEvent.click(within(rowOf('C01')).getByRole('button', { name: '큐 메뉴 C01' }))
    const up = within(screen.getByRole('menu', { name: '큐 메뉴 C01' })).getByRole('menuitem', { name: /위로 옮기기/ })
    expect((up as HTMLButtonElement).disabled).toBe(true)
    expect(up.textContent).toBe('위로 옮기기 — 맨 위라 안 됨')
    await userEvent.keyboard('{Escape}')

    await pickFromMenu('C02', '아래로 옮기기')
    await waitFor(() => {
      expect(cueNoOrder()).toEqual(['C01', 'C03', 'C02', 'C04', 'C05'])
    })
  })

  it('(e) /plan 렌더 시 ③큐시트 섹션에 변경사항(편집·추가·정렬)이 즉시 반영된다', async () => {
    renderRoute('/plan')

    const cuesheetSection = (await screen.findByRole('heading', { name: '03 큐시트' })).closest('section')!
    expect(within(cuesheetSection).getByText('09:15')).toBeTruthy() // (c) 편집 반영
    expect(within(cuesheetSection).getByText('C05')).toBeTruthy() // (b) 추가 반영
    expect(within(cuesheetSection).getByText('VIP 소개')).toBeTruthy()
    expect(planCueOrder(cuesheetSection)).toEqual(['C01', 'C03', 'C02', 'C04', 'C05']) // (d) 정렬 반영
  })

  it('(f) pm으로 컨펌 발송 시 큐시트 스냅숏 버전(.pdf)이 자동 등록되고 컨펌대기로 전이된다', async () => {
    mockProvider().switchUser('usr-pm')
    renderRoute('/items/dlv-004')
    const card = await screen.findByTestId('next-step-card')

    // 다음 단계 한 줄 — 버전 선택 없이 표 스냅숏이 새 버전이 된다는 안내 + 답 기한 · 반려… · 컨펌 발송
    expect(within(card).getByText(/보내면 지금 표가 PDF로 저장돼 v\d+[이가] 됩니다/)).toBeTruthy()
    expect(within(card).getByLabelText('답 기한')).toBeTruthy()
    expect(within(card).getByRole('button', { name: '반려…' })).toBeTruthy()
    expect(screen.queryByText('버전 선택…')).toBeNull()

    const beforeVersionCount = (await mockProvider().getDeliverable('dlv-004')).versions.length

    await userEvent.click(within(card).getByRole('button', { name: '컨펌 발송' }))

    await waitFor(async () => expect((await mockProvider().getDeliverable('dlv-004')).status).toBe('pending_approval'))
    expect((await screen.findAllByText('컨펌대기')).some((el) => el.classList.contains('ui-badge'))).toBe(true)

    const detail = await mockProvider().getDeliverable('dlv-004')
    expect(detail.versions).toHaveLength(beforeVersionCount + 1)
    const latest = detail.versions[0]
    expect(latest.file_name.endsWith('.pdf')).toBe(true)
    expect(latest.note).toContain('큐시트 스냅숏')
  })

  it('(g) design 역할에는 큐시트 편집 UI가 노출되지 않는다(읽기 전용 표)', async () => {
    mockProvider().switchUser('usr-design')
    renderRoute('/items/dlv-004')

    const sheet = await screen.findByRole('region', { name: '큐시트' })
    // 표 자체(큐 내용)는 그대로 보인다
    expect(await within(sheet).findByText('C01')).toBeTruthy()
    // 편집 관련 동작은 전부 미노출 — 메뉴·큐 추가·끌어 옮기기
    expect(within(sheet).queryAllByRole('button', { name: /^큐 메뉴/ })).toHaveLength(0)
    expect(within(sheet).queryByRole('button', { name: '큐 추가' })).toBeNull()
    expect(rowOf('C01').getAttribute('draggable')).toBe('false')
    expect(screen.getByTestId('cue-script-panel').querySelector('button')).toBeNull()
    // 대본 열람은 읽기 전용 사용자에게도 허용된다
    expect(within(sheet).getAllByRole('button', { name: '대본' }).length).toBeGreaterThan(0)
  })
})
