/** @vitest-environment jsdom */
// Phase 3.15.1 P3(감수 M3) — 홈(S1)의 주최형 전용 위젯.
// kind='host'면 '미결 컨펌' 위젯·타일이 '파트너 검토 대기' 목록·타일로 대체된다(항상 4타일).
// 대행형 홈은 무변경(회귀).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('홈(S1) — 대행형은 무변경 (회귀)', () => {
  it('4타일 중 첫 타일이 여전히 "미결 컨펌"이고, "파트너 검토 대기"는 어디에도 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    expect(await screen.findByText('미결 컨펌')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '미결 컨펌 (기한순)' })).toBeTruthy()
    expect(screen.queryByText('파트너 검토 대기')).toBeNull()
  })
})

describe('홈(S1) — 주최형은 "파트너 검토 대기"로 대체 (감수 M3)', () => {
  it('KPI가 4타일이고 "미결 컨펌"이 없다 — 지연 태스크·임박·D-day·파트너 검토 대기', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    expect(screen.queryByText('미결 컨펌')).toBeNull()
    expect(await screen.findByText('지연 태스크')).toBeTruthy()
    expect(screen.getByText('임박')).toBeTruthy()
    expect(screen.getByText('행사 D-day')).toBeTruthy()

    // "파트너 검토 대기" 문구는 KPI 타일 라벨(div)과 아래 목록 위젯 카드 제목(h2) 두 곳에 나온다 —
    // 태그로 구분한다.
    const reviewLabels = await screen.findAllByText('파트너 검토 대기')
    expect(reviewLabels.length).toBe(2)
    const kpiLabel = reviewLabels.find((el) => el.tagName !== 'H2')!
    const reviewTile = kpiLabel.closest('.ui-card') as HTMLElement
    // 픽스처(§21.3) — HT-1 검토중은 ptn-003(가상실버클라우드) 1건. 파트너 목록은 대시보드와
    // 별도의 비동기 호출이라(kind 판정 후 착수) 최초 렌더 순간엔 0으로 보일 수 있다 — waitFor로
    // 안정된 값을 기다린다(경쟁 상태 방지).
    await waitFor(() => expect(within(reviewTile).getByText('1')).toBeTruthy())
    expect(reviewLabels.some((el) => el.tagName === 'H2')).toBe(true)

    // "미결 컨펌 (기한순)" 카드 자체가 없다 — 목록 위젯으로 완전히 대체됐다는 증거
    expect(screen.queryByRole('heading', { name: '미결 컨펌 (기한순)' })).toBeNull()
  })

  it('"파트너 검토 대기" 목록에 파트너명·항목명·마감이 렌더되고, 클릭하면 파트너 보드에서 해당 파트너가 자동 선택된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    const widget = (await screen.findByRole('heading', { name: '파트너 검토 대기' })).closest(
      '.ui-card',
    ) as HTMLElement
    // 목록 내용은 별도 비동기 호출(파트너·제작물)이 끝나야 채워진다 — findBy로 기다린다.
    expect(await within(widget).findByText('가상실버클라우드')).toBeTruthy()
    expect(
      within(widget).getByText(/파트너 기본 자료 제출/),
    ).toBeTruthy()

    await userEvent.click(within(widget).getByText('가상실버클라우드'))

    expect(await screen.findByRole('heading', { name: '파트너 보드' })).toBeTruthy()
    expect(
      await screen.findByRole('heading', { name: /파트너 상세 — 가상실버클라우드/ }),
    ).toBeTruthy()
  })
})
