/** @vitest-environment jsdom */
// DoD-14: 지연/임박 UI 반영 — 경계값 산식 자체는 lib/wbs.test.ts·provider 테스트가 이미 증명.
// 여기는 pm이 end_date를 조작한 뒤 S5 하이라이트/라벨과 홈 집계 위젯이 실제로 반영되는지만 본다
// (CLAUDE.md v1.4 §4 3.7c DoD-14).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const today = toIsoDate(new Date())

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  const tasks = await p.listWbsTasks('prj-stc26')
  const byCode = (code: string) => tasks.find((t) => t.code === code)!.id
  // 6.5 → 어제 마감(지연), 6.6 → 오늘 마감(임박)
  await p.updateWbsTask(byCode('6.5'), { end_date: addDays(today, -1) })
  await p.updateWbsTask(byCode('6.6'), { end_date: today })
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

  // 홈은 3분할 액션 큐로 재편됐다(시안: 홈 대시보드) — 집계는 합산 위젯이 아니라 각 큐 헤더의
  // 건수 배지가 말하고, 해당 태스크는 큐 안(히어로·기한순 행)에 코드와 함께 남는다. 의미는 동일.
  it('홈 대시보드의 지연·임박 큐에 건수 배지와 해당 태스크가 렌더된다', async () => {
    renderRoute('/')

    const delayed = (await screen.findByRole('heading', { name: '지연' })).closest(
      '.ui-card',
    ) as HTMLElement
    expect(within(delayed).getByText('1건')).toBeTruthy()
    expect(within(delayed).getByText(/6\.5/)).toBeTruthy()

    const imminent = (await screen.findByRole('heading', { name: '임박' })).closest(
      '.ui-card',
    ) as HTMLElement
    expect(within(imminent).getByText('1건')).toBeTruthy()
    expect(within(imminent).getByText(/6\.6/)).toBeTruthy()
  })
})
