/** @vitest-environment jsdom */
// DoD-13: S5 WBS UI — 37건 표시(모객형)·단계 필터·체크리스트/간트 토글·origin_role 태그·
// 전개된 날짜 표기·pm 전용 템플릿 재전개 버튼 (CLAUDE.md v1.4 §4 3.7c).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

// SchedulePage에는 마일스톤 영역 필터도 '전체' 라벨을 쓰므로, WBS 카드로 스코프를 좁혀야 모호성이 없다.
function wbsCard(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'WBS' })
  return heading.closest('div')!.parentElement as HTMLElement
}

describe('DoD-13 S5 WBS 뷰', () => {
  it('체크리스트 뷰에 37개 태스크(코드) 전부 렌더된다 (모객형)', async () => {
    renderRoute('/schedule')

    // 전개 완료 대기 — 알려진 코드 하나가 뜨면 로딩 종료로 간주
    await screen.findByText('1.1')

    const codes = await mockProvider().listWbsTasks('prj-stc26')
    expect(codes).toHaveLength(37)
    for (const t of codes) {
      expect(screen.getAllByText(t.code).length).toBeGreaterThan(0)
    }
  })

  it('전개된 날짜 표기 — 1.1 = 9월 10일~9월 12일(D-42~D-40)', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')

    const row = screen.getByText('1.1').closest('tr')!
    expect(within(row).getByText(/9월 10일~9월 12일/)).toBeTruthy()
    expect(within(row).getByText(/D-42~D-40/)).toBeTruthy()
  })

  it('origin_role 태그가 표시된다 (예: 1.1 = RS, 1.2 = 공동)', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')

    const row11 = screen.getByText('1.1').closest('tr')!
    expect(within(row11).getByText('RS')).toBeTruthy()
    const row12 = screen.getByText('1.2').closest('tr')!
    expect(within(row12).getByText('공동')).toBeTruthy()
  })

  it('단계 필터 칩이 동작한다 — 1 사전착수 선택 시 해당 단계 태스크만 남는다', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')

    // 필터 전: 6단계(사후관리) 태스크도 보인다
    expect(screen.getByText('6.1')).toBeTruthy()

    await userEvent.click(within(wbsCard()).getByRole('button', { name: /^1\. 사전착수$/ }))

    expect(screen.getByText('1.1')).toBeTruthy()
    expect(screen.queryByText('6.1')).toBeNull()
    expect(screen.queryByText('2.5')).toBeNull()

    // 전체로 복귀하면 다시 보인다
    await userEvent.click(within(wbsCard()).getByRole('button', { name: '전체' }))
    expect(screen.getByText('6.1')).toBeTruthy()
  })

  it('간트 토글 시 바가 렌더된다 — 필터된 태스크 수만큼, 바 색은 역할 컬러·완료는 40% 투명', async () => {
    const { container } = renderRoute('/schedule')
    await screen.findByText('1.1')

    await userEvent.click(screen.getByRole('button', { name: '간트' }))

    const bars = container.querySelectorAll('[data-testid="wbs-gantt-bar"]')
    expect(bars.length).toBe(37)

    const bar11 = Array.from(bars).find((b) => (b.getAttribute('title') ?? '').startsWith('1.1 '))!
    expect(bar11.className).toContain('bg-brown') // 1.1은 done 픽스처 (pm 역할 컬러 §3)
    expect(bar11.className).toContain('opacity-40') // 완료 바는 40% 투명 (§6 S5)
    const bar13 = Array.from(bars).find((b) => (b.getAttribute('title') ?? '').startsWith('1.3 '))!
    expect(bar13.className).toContain('bg-brown') // 1.3은 doing(지연·임박 아님) → 역할 컬러 그대로
    expect(bar13.className).not.toContain('opacity-40')

    // 단계 필터와 결합해도 바 개수가 줄어든다
    await userEvent.click(within(wbsCard()).getByRole('button', { name: /^1\. 사전착수$/ }))
    const filteredBars = container.querySelectorAll('[data-testid="wbs-gantt-bar"]')
    expect(filteredBars.length).toBe(4) // 1.1~1.4
  })

  it('R&R 카드 4장이 역할 라벨과 함께 렌더된다', async () => {
    renderRoute('/schedule')
    await screen.findByText('총괄 PM')

    expect(screen.getByText('디자인 리드')).toBeTruthy()
    expect(screen.getByText('운영 리드')).toBeTruthy()
    expect(screen.getByText('등록·모객 리드')).toBeTruthy()
    expect(screen.getAllByText('PM').length).toBeGreaterThan(0)
  })

  it('pm에게는 템플릿 재전개 버튼이 보이고, 비pm에게는 보이지 않는다', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')
    expect(screen.getByRole('button', { name: '템플릿 재전개' })).toBeTruthy()
    cleanup()

    mockProvider().switchUser('usr-design')
    renderRoute('/schedule')
    await screen.findByText('1.1')
    expect(screen.queryByRole('button', { name: '템플릿 재전개' })).toBeNull()
    mockProvider().switchUser('usr-pm')
  })
})
