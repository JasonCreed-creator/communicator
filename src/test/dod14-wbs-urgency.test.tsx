/** @vitest-environment jsdom */
// DoD-14: 지연/임박 UI 반영 — 경계값 산식 자체는 lib/wbs.test.ts·provider 테스트가 이미 증명.
// 여기는 pm이 end_date를 조작한 뒤 S5 하이라이트/라벨과 홈 집계 위젯이 실제로 반영되는지만 본다
// (CLAUDE.md v1.4 §4 3.7c DoD-14).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

// 샘플 행사 WBS는 event_date '2026-10-22' 고정으로 전개된다 — 실제 날짜가 앞쪽 태스크 마감을 넘기면 조작하지 않은 태스크도
// '지연'이 되어 홈 지연·임박 큐 건수(1건)가 어긋난다(2026-09-24 실측 — origin/main에서도 같은 실패). partner-board.test와 같은 방식으로
// 시계를 픽스처 가정일에 고정한다. Date만 가짜로 — 타이머는 실제여야 findBy·userEvent 대기가 산다.
const FIXTURE_TODAY = new Date('2026-08-27T09:00:00')
const today = toIsoDate(FIXTURE_TODAY)

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXTURE_TODAY)
  const p = mockProvider()
  p.switchUser('usr-pm')
  const tasks = await p.listWbsTasks('prj-stc26')
  const byCode = (code: string) => tasks.find((t) => t.code === code)!.id
  // 6.5 → 어제 마감(지연), 6.6 → 오늘 마감(임박)
  await p.updateWbsTask(byCode('6.5'), { end_date: addDays(today, -1) })
  await p.updateWbsTask(byCode('6.6'), { end_date: today })
})
afterAll(() => {
  vi.useRealTimers()
})

describe('DoD-14 WBS 지연/임박 UI 반영', () => {
  // 체크리스트가 표 정본(.ui-table — zebra·hover 면)으로 바뀌면서, 지연·임박은 행 배경이 아니라
  // 상태 배지(WBS 계열 5단계: 지연=차단 / 마감 임박=주의)와 D-day 배지로 읽힌다(시안: 일정 · WBS 보드).
  // 판정 자체는 그대로이므로 행에 data-urgency로 남겨 단언한다 — 의미는 동일.
  it('S5 체크리스트에 지연·임박 상태 배지와 행 표식이 렌더된다', async () => {
    renderRoute('/schedule')
    await screen.findByText('6.5')

    const delayedRow = screen.getByText('6.5').closest('tr')!
    expect(delayedRow.dataset.urgency).toBe('delayed')
    const delayedBadge = within(delayedRow).getByText('지연')
    expect(delayedBadge.getAttribute('data-level')).toBe('blocked')

    const imminentRow = screen.getByText('6.6').closest('tr')!
    expect(imminentRow.dataset.urgency).toBe('imminent')
    const imminentBadge = within(imminentRow).getByText('마감 임박')
    expect(imminentBadge.getAttribute('data-level')).toBe('attention')
  })

  it('간트 뷰에서 지연 바는 negative, 임박 바는 accent로 렌더된다 (§3)', async () => {
    const { container } = renderRoute('/schedule')
    await screen.findByText('6.5')

    await userEvent.click(screen.getByRole('button', { name: '간트' }))

    const bars = Array.from(container.querySelectorAll('[data-testid="wbs-gantt-bar"]'))
    const bar65 = bars.find((b) => (b.getAttribute('title') ?? '').startsWith('6.5 '))!
    expect(bar65.className).toContain('bg-negative')
    const bar66 = bars.find((b) => (b.getAttribute('title') ?? '').startsWith('6.6 '))!
    expect(bar66.className).toContain('bg-accent')
  })

  // 홈은 '오늘 할 일' 한 목록(Phase 3.23 PR-2) — 건수는 요약 칸이 말하고, 해당 태스크는 목록 행에 코드와 함께 남는다.
  it('홈 대시보드의 요약 칸이 지연·임박 건수를 말하고, 오늘 할 일 목록에 해당 태스크가 코드와 함께 렌더된다', async () => {
    renderRoute('/home')

    const list = await screen.findByTestId('today-list')
    const rows = await within(list).findAllByTestId('today-row')
    const delayed = rows.filter((r) => r.getAttribute('data-kind') === 'delayed')
    expect(delayed.length).toBe(1)
    expect(within(delayed[0]).getByText(/6\.5/)).toBeTruthy()
    const imminent = rows.filter((r) => r.getAttribute('data-kind') === 'imminent')
    expect(imminent.length).toBe(1)
    expect(within(imminent[0]).getByText(/6\.6/)).toBeTruthy()

    expect(within(screen.getByTestId('home-tile-delayed')).getByText('1')).toBeTruthy()
    expect(within(screen.getByTestId('home-tile-imminent')).getByText('1')).toBeTruthy()
  })
})
