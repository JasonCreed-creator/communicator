/** @vitest-environment jsdom */
// Phase 3.17 시안 정렬 — 홈 대시보드(S1) 핵심 계약.
// 시안: design_handoff_mice_communicator_ui/홈 대시보드.dc.html + 패턴 기준 시트 §03·§05·§07.
// (1) KPI 4타일 제거 (2) 행사 D-day = 헤더 우측 단일 dark pill (3) 3분할 액션 큐 + 히어로
// (4) accent CTA 화면당 1개 (5) 리마인드는 게이트 뒤에 숨기지 않고 안내로 처리
// (6) D-day 스트립 전체 폭 + overflow-x 유지 (7) 보조 3열은 큐 아래로.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const today = toIsoDate(new Date())

// 큐가 비면 히어로·CTA 계약을 볼 수 없다 — dod14와 같은 방식으로 지연 1건·임박 1건을 만든다.
beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  const tasks = await p.listWbsTasks(PROJECT_ID)
  const byCode = (code: string) => tasks.find((t) => t.code === code)!.id
  await p.updateWbsTask(byCode('6.5'), { end_date: addDays(today, -1) })
  await p.updateWbsTask(byCode('6.6'), { end_date: today })
})

function useSampleProject() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
}

describe('홈(S1) 정렬 — 숫자 나열 대신 3분할 액션 큐', () => {
  it('(1) KPI 4타일이 사라지고 (2) 행사 D-day는 헤더 우측 단일 dark pill이다', async () => {
    useSampleProject()
    const { container } = renderRoute('/home')
    await screen.findByTestId('event-dday')

    // KPI 타일 제거 — 숫자 31/650 타일(.kpi-num)이 한 개도 없다
    expect(container.querySelectorAll('.kpi-num').length).toBe(0)
    expect(screen.queryByText('지연 태스크')).toBeNull()
    expect(screen.queryByText('행사 D-day')).toBeNull()

    // D-day는 화면에 단 하나의 pill로만 존재한다(높이 44 · dark 면 · 20/600)
    const pills = screen.getAllByTestId('event-dday')
    expect(pills.length).toBe(1)
    expect(pills[0].className).toContain('h-11')
    expect(pills[0].className).toContain('bg-dark')
    expect(pills[0].className).toContain('text-[20px]')
    expect(pills[0].textContent).toMatch(/^(D-\d+|D\+\d+|D-day|일정 미정)$/)
  })

  it('(3) 지연·임박·미결 컨펌 큐가 건수 배지와 "가장 급한 1건" 히어로를 갖는다', async () => {
    useSampleProject()
    const { container } = renderRoute('/home')
    await screen.findByTestId('event-dday')

    const delayed = (screen.getByRole('heading', { name: '지연' })).closest(
      '.ui-card',
    ) as HTMLElement
    const imminent = (screen.getByRole('heading', { name: '임박' })).closest(
      '.ui-card',
    ) as HTMLElement
    const pending = (screen.getByRole('heading', { name: '미결 컨펌' })).closest(
      '.ui-card',
    ) as HTMLElement

    for (const queue of [delayed, imminent, pending]) {
      // 건수는 KPI가 아니라 각 큐 헤더의 배지가 말한다
      expect(within(queue).getByText(/^\d+건$/)).toBeTruthy()
      expect(within(queue).getByText('가장 급한 1건')).toBeTruthy()
    }
    // 히어로 면 — 지연은 negative, 임박은 accent, 미결은 canvas 인셋
    expect((within(delayed).getByTestId('queue-hero')).className).toContain('bg-negative-tint')
    expect((within(imminent).getByTestId('queue-hero')).className).toContain('bg-accent-tint')
    expect((within(pending).getByTestId('queue-hero')).className).toContain('bg-canvas')
    // 미결 컨펌 배지만 '내 행동을 기다림' 도트를 동반한다(패턴 §03)
    expect(container.querySelectorAll('[data-testid="queue-hero"]').length).toBe(3)
  })

  it('(4)(5) accent CTA는 화면 전체에 1개(가장 오래된 지연 건)이고, 리마인드는 숨기지 않고 안내한다', async () => {
    useSampleProject()
    const { container } = renderRoute('/home')
    await screen.findByTestId('event-dday')
    const delayed = (screen.getByRole('heading', { name: '지연' })).closest(
      '.ui-card',
    ) as HTMLElement

    const accents = container.querySelectorAll('.btn-accent')
    expect(accents.length).toBe(1)
    expect(accents[0].textContent).toBe('담당에게 리마인드')
    expect(delayed.contains(accents[0])).toBe(true)

    // 알림 연동 전이라도 버튼을 게이트 뒤에 숨기지 않는다 — 누르면 준비 중임을 알린다
    expect(screen.queryByRole('status')).toBeNull()
    await userEvent.click(accents[0] as HTMLElement)
    expect((await screen.findByRole('status')).textContent).toMatch(/알림 발송은 준비 중/)
  })

  it('(6)(7) D-day 스트립이 전체 폭 카드로 가로 스크롤을 유지하고, 보조 3열은 큐 아래에 온다', async () => {
    useSampleProject()
    const { container } = renderRoute('/home')
    await screen.findByTestId('event-dday')

    const strip = (screen.getByRole('heading', { name: '마감 타임라인' })).closest(
      '.ui-card',
    ) as HTMLElement
    // 클립 금지 — PartnerDeadlineTimeline 재사용(overflow-x:auto)
    expect(strip.querySelector('.overflow-x-auto')).not.toBeNull()

    const delayedHeading = screen.getByRole('heading', { name: '지연' })
    const areaHeading = screen.getByRole('heading', { name: '영역별 진행률' })
    expect(screen.getByRole('heading', { name: '최근 활동' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '미등록 인박스' })).toBeTruthy()
    // 보조 3열은 액션 큐보다 뒤(DOM 순서 = 시각 위계)
    expect(
      delayedHeading.compareDocumentPosition(areaHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container).toBeTruthy()
  })
})
