/** @vitest-environment jsdom */
// 시안 정렬(S5 일정 · WBS 보드) — '일정 · WBS 보드.dc.html' + 패턴 기준 시트 §05·§07.
// 이번 정렬의 핵심 계약만 단언한다:
//  ① 간트 단계 그룹 헤더 = 진행 막대(72px) + '완료 n/m' + 지연·임박 배지
//  ② 간트 바 기간 표기(M/D~M/D) + 지연·임박 바는 D-day 동반
//  ③ 체크리스트 = 표 정본(.ui-table · 단계 그룹 헤더행 · 정렬 화살표는 정렬 가능 열에만) + 밀집 모드
//  ④ WBS 상태 배지 = 5계열 매핑(미착수=중립 / 진행=진행 / 마감 임박=주의 / 완료=정상 / 지연=차단)
//  ⑤ 마일스톤 목록 = 같은 표 정본(월 그룹 헤더행 · D-day 열 · 구분 배지)
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const today = toIsoDate(new Date())
const PROJECT = 'prj-stc26'

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  const tasks = await p.listWbsTasks(PROJECT)
  const byCode = (code: string) => tasks.find((t) => t.code === code)!.id
  // 1단계에 지연 1건(어제 마감) · 임박 1건(오늘 마감)을 만들어 단계 헤더 집계를 검증 가능하게 한다
  await p.updateWbsTask(byCode('1.3'), { end_date: addDays(today, -1) })
  await p.updateWbsTask(byCode('1.4'), { end_date: today })
})

async function openGantt() {
  await userEvent.click(screen.getByRole('button', { name: '간트' }))
}

describe('S5 간트 — 단계 헤더와 바 라벨', () => {
  it('① 단계 그룹 헤더에 진행 막대·완료 n/m·지연/임박 배지가 붙는다', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')
    await openGantt()

    const header = screen.getByRole('heading', { name: '1. 사전착수' }).parentElement as HTMLElement
    // 진행 막대(트랙) — 패턴 §07 진행률 바
    expect(header.querySelector('.bg-track')).toBeTruthy()
    expect(within(header).getByText(/^완료 \d+\/4$/)).toBeTruthy()
    expect(within(header).getByText('지연 1')).toBeTruthy()
    expect(within(header).getByText('임박 1')).toBeTruthy()
  })

  it('② 바 라벨에 기간(M/D~M/D)이 표기되고, 지연 바는 D-day를 함께 단다', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')
    await openGantt()

    // 기간 표기가 바 라벨로 실제 렌더된다
    expect(screen.getAllByText(/^\d{1,2}\/\d{1,2}~\d{1,2}\/\d{1,2}$/).length).toBeGreaterThan(0)
    // 지연(1.3 = 어제 마감) 바는 '기간 · D+1'
    expect(screen.getByText(/^\d{1,2}\/\d{1,2}~\d{1,2}\/\d{1,2} · D\+1$/)).toBeTruthy()
    // 임박(1.4 = 오늘 마감) 바는 '기간 · D-day'
    expect(screen.getByText(/· D-day$/)).toBeTruthy()
  })
})

describe('S5 체크리스트 — 표 정본', () => {
  it('③ .ui-table + 단계 그룹 헤더행 + 정렬 화살표는 정렬 가능 열(태스크·기간)에만', async () => {
    const { container } = renderRoute('/schedule')
    await screen.findByText('1.1')

    const table = container.querySelector('table.ui-table') as HTMLTableElement
    expect(table).toBeTruthy()

    // 그룹 헤더행 — 단계 수만큼, 건수와 완료 집계를 동반한다(§05 규칙 08)
    const groupRows = table.querySelectorAll('tr.ui-table-group')
    expect(groupRows.length).toBeGreaterThan(0)
    expect(within(groupRows[0] as HTMLElement).getByText(/^4건 · 완료 \d+\/4$/)).toBeTruthy()

    // 정렬 화살표(버튼)는 정렬 가능한 두 열에만 (§05 조건 3)
    const sortButtons = table.querySelectorAll('thead th button')
    expect(sortButtons.length).toBe(2)
    expect(Array.from(sortButtons).map((b) => b.textContent?.replace(/[↕↑↓]/g, '').trim())).toEqual([
      '태스크',
      '기간',
    ])
  })

  it('③ 밀집 모드 토글이 표 행 높이 규격(.ui-table-dense)을 바꾼다', async () => {
    const { container } = renderRoute('/schedule')
    await screen.findByText('1.1')

    expect(container.querySelector('table.ui-table-dense')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '밀집 모드' }))
    expect(container.querySelector('table.ui-table-dense')).toBeTruthy()
  })

  it('④ 상태 배지가 WBS 5계열로 매핑된다(완료=정상 · 미착수=중립 · 지연=차단 · 마감 임박=주의)', async () => {
    renderRoute('/schedule')
    await screen.findByText('1.1')

    const tasks = await mockProvider().listWbsTasks(PROJECT)
    const doneCode = tasks.find((t) => t.status === 'done')!.code
    const todoCode = tasks.find((t) => t.status === 'todo' && !['1.3', '1.4'].includes(t.code))!.code

    const doneBadge = within(screen.getByText(doneCode).closest('tr')!).getByText('완료')
    expect(doneBadge.getAttribute('data-level')).toBe('positive')

    const todoBadge = within(screen.getByText(todoCode).closest('tr')!).getByText('미착수')
    expect(todoBadge.getAttribute('data-level')).toBe('neutral')

    // 마감 파생 단계가 저장 상태보다 앞선다
    const delayed = within(screen.getByText('1.3').closest('tr')!).getByText('지연')
    expect(delayed.getAttribute('data-level')).toBe('blocked')
    const imminent = within(screen.getByText('1.4').closest('tr')!).getByText('마감 임박')
    expect(imminent.getAttribute('data-level')).toBe('attention')
  })
})

describe('S5 마일스톤 목록 — 같은 표 정본', () => {
  it('⑤ 월 그룹 헤더행 · 구분 배지 · D-day 열이 같은 규격으로 렌더된다', async () => {
    renderRoute('/schedule')
    const timeline = (await screen.findByRole('heading', { name: '타임라인' })).closest('.ui-card') as HTMLElement

    const table = timeline.querySelector('table.ui-table') as HTMLTableElement
    expect(table).toBeTruthy()
    // 열 헤더를 역할로 집는다 — 마일스톤 due_date가 오늘이면 D-day 배지가 같은 문자열로 한 번 더 그려져
    // getByText('D-day')가 중복 매치로 깨진다(2026-09-04 실측: mls-001 due 2026-09-04)
    expect(within(table).getByRole('columnheader', { name: 'D-day' })).toBeTruthy()

    // 월 그룹 헤더행 — 'YYYY년 M월' + 건수
    const groupRows = table.querySelectorAll('tr.ui-table-group')
    expect(groupRows.length).toBeGreaterThan(0)
    expect(within(groupRows[0] as HTMLElement).getByText(/^\d{4}년 \d{1,2}월$/)).toBeTruthy()

    // 구분 배지 — 마일스톤은 중립, 컨펌 기한은 주의(내 행동을 기다림)
    const milestoneBadge = within(table).getAllByText('마일스톤')[0]
    expect(milestoneBadge.getAttribute('data-level')).toBe('neutral')
    const approvalBadge = within(table).getAllByText('컨펌 기한')[0]
    expect(approvalBadge.getAttribute('data-level')).toBe('attention')
  })
})
