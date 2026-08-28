/** @vitest-environment jsdom */
// Phase 3.15.1 P3(감수 M3) — 홈(S1)의 주최형 전용 위젯.
// kind='host'면 '미결 컨펌' 큐가 '파트너 검토 대기' 큐로 대체된다. 대행형 홈은 무변경(회귀).
// Phase 3.17(시안 정렬) — 홈이 KPI 4타일에서 3분할 액션 큐로 재편되면서 단언 대상이
// "타일 라벨"에서 "큐 카드 헤더 + 건수 배지"로 바뀌었다(대체 규칙의 의미는 동일).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('홈(S1) — 대행형은 무변경 (회귀)', () => {
  it('세 번째 큐가 여전히 "미결 컨펌"이고, "파트너 검토 대기"는 어디에도 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    expect(await screen.findByRole('heading', { name: '미결 컨펌' })).toBeTruthy()
    expect(screen.queryByText('파트너 검토 대기')).toBeNull()
  })
})

describe('홈(S1) — 주최형은 "파트너 검토 대기"로 대체 (감수 M3)', () => {
  it('큐 3종이 지연·임박·파트너 검토 대기이고 "미결 컨펌"이 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    expect(screen.queryByRole('heading', { name: '미결 컨펌' })).toBeNull()
    expect(await screen.findByRole('heading', { name: '지연' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '임박' })).toBeTruthy()
    // 행사 D-day는 KPI 타일이 아니라 페이지 헤더 우측 단일 pill에 있다
    expect(screen.getByTestId('event-dday').textContent).toMatch(/D[-+]|D-day|일정 미정/)

    const reviewQueue = (
      await screen.findByRole('heading', { name: '파트너 검토 대기' })
    ).closest('.ui-card') as HTMLElement
    // 픽스처(§21.3) — HT-1 검토중은 ptn-003(가상실버클라우드) 1건. 파트너·제작물 목록은
    // 대시보드와 별도의 비동기 호출이라 최초 렌더 순간엔 0으로 보일 수 있다(경쟁 상태 방지).
    await waitFor(() => expect(within(reviewQueue).getByText('1건')).toBeTruthy())
  })

  it('"파트너 검토 대기" 큐에 파트너명·항목명·마감이 렌더되고, 열면 파트너 보드에서 해당 파트너가 자동 선택된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    const widget = (await screen.findByRole('heading', { name: '파트너 검토 대기' })).closest(
      '.ui-card',
    ) as HTMLElement
    expect(await within(widget).findByText('가상실버클라우드')).toBeTruthy()
    expect(within(widget).getByText(/파트너 기본 자료 제출/)).toBeTruthy()

    await userEvent.click(await within(widget).findByRole('link', { name: '검토 열기' }))

    expect(await screen.findByRole('heading', { name: '파트너 보드' })).toBeTruthy()
    expect(
      await screen.findByRole('heading', { name: /파트너 상세 — 가상실버클라우드/ }),
    ).toBeTruthy()
  })
})
