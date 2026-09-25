/** @vitest-environment jsdom */
// Phase 3.15.1 P3(감수 M3) — 홈(S1)의 주최형 대체 규칙.
// kind='host'면 발주처 컨펌 대신 '파트너 검토 대기'가 들어온다. 대행형 홈은 그대로(회귀).
// Phase 3.23 PR-2 — 홈이 '요약 5칸 + 오늘 할 일 한 목록'으로 바뀌면서 단언 대상이
// "큐 카드 헤더 + 건수 배지"에서 "요약 칸 + 목록 행"으로 바뀌었다(대체 규칙의 의미는 동일).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

const kinds = () => screen.getAllByTestId('today-row').map((r) => r.getAttribute('data-kind'))

describe('홈(S1) — 대행형은 그대로 (회귀)', () => {
  it('요약 칸이 "발주처 답 대기"이고, 컨펌대기 행·컨펌 독촉이 있으며 "파트너 검토 대기"는 어디에도 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    expect((await screen.findByTestId('home-tile-waiting')).textContent).toContain('발주처 답 대기')
    await waitFor(() => expect(kinds()).toContain('approval'))
    expect(screen.getByRole('button', { name: '컨펌 독촉' })).toBeTruthy()
    expect(screen.queryByText('파트너 검토 대기')).toBeNull()
  })
})

describe('홈(S1) — 주최형은 "파트너 검토 대기"로 대체 (감수 M3)', () => {
  it('요약 칸이 "파트너 검토 대기"(1)이고, 컨펌대기 행·컨펌 독촉이 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    // 행사 D-day는 페이지 헤더 우측 단일 pill에 있다
    expect((await screen.findByTestId('event-dday')).textContent).toMatch(/D-\d+|\d+일 지남|D-day|일정 미정/)
    const tile = await screen.findByTestId('home-tile-waiting')
    // 대시보드·파트너·제작물은 따로 도착한다 — 다 그려진 뒤의 값을 기다린다(경쟁 상태 방지)
    await waitFor(() => expect(tile.textContent).toContain('파트너 검토 대기'))
    // 픽스처(§21.3) — HT-1 검토중은 ptn-003(가상실버클라우드) 1건
    await waitFor(() => expect(within(tile).getByText('1')).toBeTruthy())
    await waitFor(() => expect(kinds()).toContain('partner'))
    expect(kinds()).not.toContain('approval')
    expect(screen.queryByRole('button', { name: '컨펌 독촉' })).toBeNull()
    // 칩 이름도 주최형 세트
    expect(screen.getByRole('button', { name: /^검토·정산/ })).toBeTruthy()
  })

  it('파트너 검토 행에 파트너명·항목명이 있고, 검토 열기 → 파트너 보드에서 해당 파트너가 자동 선택된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    let row: HTMLElement | undefined
    // 파트너 이름은 파트너 목록이 도착해야 채워진다 — 이름까지 들어온 행을 기다린다
    await waitFor(() => {
      row = screen
        .getAllByTestId('today-row')
        // 제출물 제목 끝에도 파트너 이름이 붙는다 — 행 전체 글자가 아니라 '제목 칸'이 이름으로 채워졌는지 본다
        .find((r) => r.getAttribute('data-kind') === 'partner' && within(r).queryByText('가상실버클라우드') !== null)
      expect(row).toBeTruthy()
    })
    expect(within(row!).getByText('가상실버클라우드')).toBeTruthy()
    expect(within(row!).getByText(/파트너 기본 자료 제출/)).toBeTruthy()
    expect(within(row!).getByText('검토 대기')).toBeTruthy()

    await userEvent.click(within(row!).getByRole('link', { name: '검토 열기' }))

    expect(await screen.findByRole('heading', { name: '파트너 보드' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: /파트너 상세 — 가상실버클라우드/ })).toBeTruthy()
  })
})
