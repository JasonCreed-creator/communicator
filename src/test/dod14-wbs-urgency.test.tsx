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
  it('S5 체크리스트에 지연·임박 행 하이라이트와 라벨이 렌더된다', async () => {
    renderRoute('/schedule')
    await screen.findByText('6.5')

    const delayedRow = screen.getByText('6.5').closest('tr')!
    expect(within(delayedRow).getByText('지연')).toBeTruthy()
    expect(delayedRow.className).toContain('bg-negative-tint')

    const imminentRow = screen.getByText('6.6').closest('tr')!
    expect(within(imminentRow).getByText('임박')).toBeTruthy()
    expect(imminentRow.className).toContain('bg-accent-tint')
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

  it('홈 대시보드에 지연/임박 집계 위젯이 카운트와 함께 렌더된다', async () => {
    renderRoute('/')

    const heading = await screen.findByRole('heading', { name: '지연/임박 태스크' })
    const widget = heading.closest('div')!.parentElement!
    expect(within(widget).getByText('지연 1건')).toBeTruthy()
    expect(within(widget).getByText('임박 1건')).toBeTruthy()
    expect(within(widget).getByText(/6\.5/)).toBeTruthy()
    expect(within(widget).getByText(/6\.6/)).toBeTruthy()
  })
})
