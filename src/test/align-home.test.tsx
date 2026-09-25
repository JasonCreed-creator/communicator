/** @vitest-environment jsdom */
// 홈(S1) 정렬 계약 — Phase 3.23 PR-2 (디자인지시서 v1.4 §7-2.5 · 캔버스 "커뮤니케이터 UX 개편" 홈).
// 3.17의 "3분할 액션 큐 + D-day 스트립"을 "요약 5칸 + '오늘 할 일' 한 목록 + 다가오는 2주"로 바꿨다.
// (1) 행사 D-day = 헤더 우측 단일 dark pill, 행사명·요일 날짜·확정 수 (2) 요약 5칸 — 빨강은 지연에만
// (3) '오늘 할 일' — 급한 순, 행마다 상태·할 일·담당·마감·바로 하기 1개 (4) 채운 버튼 0개(훑는 화면),
// 리마인드는 숨기지 않고 안내 (5) 아래 줄 = 다가오는 2주(넓게) · 영역별 확정 · 최근 활동
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const today = toIsoDate(new Date())

// 지연 1건·임박 1건을 결정적으로 만든다(dod14와 같은 방식)
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

describe('홈(S1) 정렬 — 요약 5칸 + 오늘 할 일 한 목록', () => {
  it('(1) 행사 D-day는 헤더 우측 단일 dark pill이고, 옆에 행사명·요일 날짜·확정 수가 있다', async () => {
    useSampleProject()
    renderRoute('/home')
    const pill = await screen.findByTestId('event-dday')
    expect(screen.getAllByTestId('event-dday').length).toBe(1)
    expect(pill.className).toContain('h-11')
    expect(pill.className).toContain('bg-dark')
    expect(pill.className).toContain('text-[20px]')
    expect(pill.textContent).toMatch(/^(D-\d+|\d+일 지남|D-day|일정 미정)$/)
    const meta = pill.previousElementSibling as HTMLElement
    expect(meta.textContent).toMatch(/\d+월 \d+일 \([일월화수목금토]\)/)
    expect(meta.textContent).toMatch(/확정 \d+\/\d+/)
  })

  it('(2) 요약 5칸 — 지연·마감 임박·발주처 답 대기·정산 확인·미등록 파일, 빨강은 지연(>0)에만', async () => {
    useSampleProject()
    const { container } = renderRoute('/home')
    await screen.findByTestId('event-dday')
    const labels = ['지연', '마감 임박', '발주처 답 대기', '정산 확인', '미등록 파일']
    const keys = ['delayed', 'imminent', 'waiting', 'settlement', 'inbox']
    keys.forEach((k, i) => {
      const tile = screen.getByTestId(`home-tile-${k}`)
      expect(tile.textContent).toContain(labels[i])
    })
    const delayedValue = within(screen.getByTestId('home-tile-delayed')).getByText(/^\d+$/)
    expect(Number(delayedValue.textContent)).toBeGreaterThan(0)
    expect(delayedValue.className).toContain('text-negative')
    // 나머지 칸의 숫자는 잉크(빨강·주황으로 칠하지 않는다)
    for (const k of keys.slice(1)) {
      expect(within(screen.getByTestId(`home-tile-${k}`)).getByText(/^\d+$/).className).not.toMatch(/text-(negative|accent)/)
    }
    // 옛 KPI 31px 타일·3분할 큐 히어로는 없다
    expect(container.querySelectorAll('.kpi-num').length).toBe(0)
    expect(container.querySelectorAll('[data-testid="queue-hero"]').length).toBe(0)
  })

  it('(3) 오늘 할 일 — 급한 순(지연이 맨 위), 행마다 상태 배지·담당·마감·바로 하기 1개', async () => {
    useSampleProject()
    renderRoute('/home')
    const list = await screen.findByTestId('today-list')
    expect(within(list).getByRole('heading', { name: '오늘 할 일' })).toBeTruthy()
    const rows = await within(list).findAllByTestId('today-row')
    expect(rows.length).toBeGreaterThan(3)
    // 지연 행이 컨펌대기·미등록 파일·임박보다 앞선다
    const kinds = rows.map((r) => r.getAttribute('data-kind'))
    const firstNonLate = kinds.findIndex((k) => k !== 'delayed' && k !== 'milestone')
    expect(kinds.slice(0, firstNonLate).length).toBeGreaterThan(0)
    expect(kinds.slice(firstNonLate).some((k) => k === 'delayed' || k === 'milestone')).toBe(false)
    expect(kinds.indexOf('imminent')).toBeGreaterThan(kinds.indexOf('approval'))
    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      expect(cells.length).toBe(5)
      expect(cells[0].querySelector('.ui-badge')).not.toBeNull()
      // 바로 하기는 정확히 1개(링크 또는 버튼)
      expect(cells[4].querySelectorAll('a, button').length).toBe(1)
    }
    // 컨펌대기 배지만 '내 행동을 기다림' 도트를 단다
    const approval = rows.find((r) => r.getAttribute('data-kind') === 'approval')!
    expect(within(approval).getByText('컨펌대기').querySelector('span[aria-hidden]')).not.toBeNull()
    const delayed = rows.find((r) => r.getAttribute('data-kind') === 'delayed')!
    expect(within(delayed).getByText('지연').querySelector('span[aria-hidden]')).toBeNull()
    // 지난 기한은 'n일 지남'(빨강), D+n 표기 없음
    expect(within(delayed).getByText(/^\d+일 지남$/).className).toContain('text-negative')
    expect(within(list).queryByText(/^D\+\d+$/)).toBeNull()
  })

  it('(4) 채운 버튼 0개 — 리마인드·독촉은 ghost이고 숨기지 않으며, mock은 보내는 흉내 없이 사실을 알린다', async () => {
    useSampleProject()
    const { container } = renderRoute('/home')
    // 목록이 다 그려진 뒤(로딩 스켈레톤의 status 영역이 사라진 뒤)에 본다
    await screen.findAllByTestId('today-row')
    expect(container.querySelectorAll('.btn-accent, .btn-primary').length).toBe(0)
    const remind = screen.getByRole('button', { name: '담당에게 리마인드' })
    expect(remind.className).toContain('btn-ghost')
    expect(screen.getByRole('button', { name: '컨펌 독촉' }).className).toContain('btn-ghost')
    expect(screen.queryByRole('status')).toBeNull()
    await userEvent.click(remind)
    expect((await screen.findByRole('status')).textContent).toMatch(/데모\(mock\)에서는 알림을 보내지 않습니다/)
  })

  it('(5) 아래 줄 — 다가오는 2주(넓게)·영역별 확정·최근 활동이 목록 뒤에 온다', async () => {
    useSampleProject()
    renderRoute('/home')
    const list = await screen.findByTestId('today-list')
    const upcoming = screen.getByRole('heading', { name: '다가오는 2주' })
    const area = screen.getByRole('heading', { name: '영역별 확정' })
    expect(screen.getByRole('heading', { name: '최근 활동' })).toBeTruthy()
    expect(list.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(upcoming.closest('.lg\\:col-span-2')).not.toBeNull()
    // 2주 창 — 행마다 요일 날짜와 D-n
    for (const row of await screen.findAllByTestId('upcoming-row')) {
      expect(row.textContent).toMatch(/\d+월 \d+일 \([일월화수목금토]\)/)
      expect(row.textContent).toMatch(/D-\d+|오늘/)
    }
  })
})
