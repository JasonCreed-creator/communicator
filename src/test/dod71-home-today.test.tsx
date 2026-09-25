/** @vitest-environment jsdom */
// DoD 71 (Phase 3.23 PR-2 · 디자인지시서 v1.4 §7-2.5) — 홈 '오늘 할 일'.
//
// 배경: UX 진단 1 "다음 할 일이 흩어져 있다" — 홈에 지연·임박·미결 컨펌 큐 3개 + 정산 경보 띠 + 미등록 인박스 +
// 받은 가이드 + 마일스톤 카드가 따로 있었다. 사용자 결정 "'오늘 할 일' 목록 하나로 통합".
//
// 이 테스트가 지키는 계약:
//   ① 행 출처 8종(지연 태스크·지난 마일스톤·컨펌대기·파트너 검토·정산 초과·미등록 파일·받은 가이드·임박)이 급한 순 한 목록
//   ② '내 차례' — 역할로 판정(WBS = 태스크 역할, 컨펌·파트너·정산·파일 = pm, 가이드 = 늘 내 것)
//   ③ 정산 행은 버킷 이름만 — 금액 0건(홈은 훑는 화면, 금액은 정산보드에서)
//   ④ 칩 필터 — '지연'은 기한 지난 모든 행, 0건이면 데이터 없음과 구분되는 필터 빈 상태 + 초기화
//   ⑤ 미등록 파일은 행 아래에서 바로 연결·무시(선택 없이 연결 → 안내), 처리하면 행과 요약 칸이 줄어든다
//      (무시 후 목록이 새로 고쳐지지 않던 옛 인박스 카드 결함 — void 반환을 실패로 읽음 — 수정)
//   ④' 일정 행은 8행까지 · '일정 행 n건 더 보기' — 넘겨받은 일(컨펌·검토·정산·파일·가이드)은 늘 보인다
//   ⑥ 다가오는 2주 — 오늘~14일 안의 미완료 일정·마일스톤만
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import TodayListCard from '../components/home/TodayListCard'
import { buildTodayRows, matchesTodayFilter, type TodayRow } from '../components/home/todayItems'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { addDays, toIsoDate } from '../lib/wbs'
import type { Deliverable, Milestone, UnregisteredFile, WbsTask } from '../types/entities'
import type { PendingApprovalItem } from '../types/views'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const today = toIsoDate(new Date())
const task = (code: string, role: WbsTask['role'], end: string): WbsTask =>
  ({ id: `t-${code}`, code, title: `태스크 ${code}`, role, end_date: end, phase_name: '준비', linked_deliverable_id: null }) as unknown as WbsTask

function sampleInput(myRole: 'pm' | 'design' | 'ops' | 'reg') {
  return {
    delayed: [task('1.3', 'pm', addDays(today, -6)), task('1.4', 'ops', addDays(today, -1))],
    lateMilestones: [{ id: 'ms-1', title: '키비주얼 확정', area: 'design', due_date: addDays(today, -3), done: false } as Milestone],
    imminent: [task('2.2', 'design', addDays(today, 1))],
    approvals: [
      {
        approval: { id: 'apr-1', requested_at: `${addDays(today, -10)}T02:00:00.000Z`, due_at: `${addDays(today, -2)}T09:00:00.000Z` },
        deliverable: { id: 'dlv-1', title: '메인 키비주얼', category: '키비주얼', assignee_id: 'u-d' },
      } as unknown as PendingApprovalItem,
    ],
    partnerPending: [],
    overBudget: [{ id: 'b-1', label: '시스템 구축' }],
    inbox: [{ id: 'f-1', file_name: '리플렛.pdf', detected_folder: '05_산출물/디자인', detected_at: `${today}T01:00:00.000Z` } as UnregisteredFile],
    guides: [{ id: 'dlv-9', title: '입구 사이니지', category: '사이니지', assignee_id: 'u-d', due_date: addDays(today, 5) } as unknown as Deliverable],
    myRole,
    roleOf: (id: string | null) => (id === 'u-d' ? ('design' as const) : null),
    nameOf: (id: string | null) => (id === 'u-d' ? '디자이너' : null),
  }
}

describe('DoD 71 ① 한 목록 · 급한 순', () => {
  it('출처 8종이 한 목록에 급한 순(지연·지난 마일스톤 → 컨펌 → 정산 → 파일 → 가이드 → 임박)으로 선다', () => {
    const rows = buildTodayRows(sampleInput('pm'))
    expect(rows.map((r) => r.kind)).toEqual([
      'delayed', 'milestone', 'delayed', 'approval', 'settlement', 'inbox', 'guide', 'imminent',
    ])
    // 같은 급 안에서는 기한이 이른 순 — 6일 지난 1.3이 1일 지난 1.4보다 앞
    expect(rows[0].code).toBe('1.3')
    expect(rows[1].title).toBe('키비주얼 확정')
    expect(rows[1].status).toBe('지연')
    // 배지 단계 — 지연은 막힘, 나머지는 주의. 도트는 발주처 답을 기다리는 컨펌에만
    expect(rows.filter((r) => r.level === 'blocked').map((r) => r.kind)).toEqual(['delayed', 'milestone', 'delayed'])
    expect(rows.filter((r) => r.dot).map((r) => r.kind)).toEqual(['approval'])
    // 행마다 바로 하기 1개 — 미등록 파일만 행 안에서 처리(링크 없음)
    expect(rows.find((r) => r.kind === 'inbox')!.to).toBeNull()
    expect(rows.filter((r) => r.kind !== 'inbox').every((r) => r.to !== null)).toBe(true)
    expect(rows.find((r) => r.kind === 'guide')!.action).toBe('첫 시안 올리기')
  })
})

describe('DoD 71 ② 내 차례', () => {
  it('pm — 자기 역할 태스크 + 컨펌·정산·파일 + 가이드', () => {
    const mine = buildTodayRows(sampleInput('pm')).filter((r) => matchesTodayFilter(r, 'mine')).map((r) => r.key)
    expect(mine).toEqual(['delayed:t-1.3', 'approval:apr-1', 'settlement:b-1', 'inbox:f-1', 'guide:dlv-9'])
  })

  it('design — 디자인 마일스톤·디자인 태스크·가이드만(컨펌 독촉·정산·파일은 pm 몫)', () => {
    const mine = buildTodayRows(sampleInput('design')).filter((r) => matchesTodayFilter(r, 'mine')).map((r) => r.key)
    expect(mine).toEqual(['milestone:ms-1', 'guide:dlv-9', 'imminent:t-2.2'])
  })
})

describe('DoD 71 ③ 정산 행 — 이름만', () => {
  it('정산 초과 행에 금액·금액 키 0건', () => {
    const row = buildTodayRows(sampleInput('pm')).find((r) => r.kind === 'settlement')!
    expect(row.title).toBe('시스템 구축 — 견적 초과')
    const json = JSON.stringify(row)
    expect(json).not.toMatch(/\d{1,3}(,\d{3})+|amount|ordered|actual|markup|margin/)
    expect(row.to).toBe('/settlement')
  })
})

function renderCard(rows: TodayRow[]) {
  return render(
    <MemoryRouter>
      <TodayListCard
        projectId="p"
        rows={rows}
        loading={false}
        isHost={false}
        deliverables={[]}
        onInboxChanged={() => {}}
        onRemind={() => {}}
        remindBusy={false}
        remindNotice={null}
      />
    </MemoryRouter>,
  )
}

describe('DoD 71 ④ 칩 필터', () => {
  it("'지연' = 기한 지난 모든 행(지연 태스크·지난 마일스톤·기한 넘긴 컨펌)", async () => {
    renderCard(buildTodayRows(sampleInput('pm')))
    await userEvent.click(screen.getByRole('button', { name: /^지연/ }))
    const rows = screen.getAllByTestId('today-row')
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['delayed', 'milestone', 'delayed', 'approval'])
    for (const r of rows) expect(within(r).getByText(/^\d+일 지남$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^지연/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('걸러서 0건이면 필터 빈 상태(전체 건수·적용 필터·초기화) — 데이터 없음 문구와 다르다', async () => {
    const notMine = buildTodayRows({ ...sampleInput('reg'), guides: [] })
    renderCard(notMine)
    await userEvent.click(screen.getByRole('button', { name: /^내 차례/ }))
    expect(screen.queryAllByTestId('today-row').length).toBe(0)
    expect(screen.getByText(new RegExp(`전체 ${notMine.length}건 중 0건`))).toBeTruthy()
    expect(screen.queryByText(/지금 처리할 일이 없습니다/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /초기화/ }))
    expect(screen.getAllByTestId('today-row').length).toBe(notMine.length)
  })

  it('일정 행(지연·지난 마일스톤·임박)은 8행까지, 넘겨받은 일(컨펌·정산·파일·가이드)은 항상 보인다', async () => {
    const base = buildTodayRows(sampleInput('pm'))
    const delayed = Array.from({ length: 15 }, (_, i) => ({ ...base[0], key: `delayed:t-${i}`, title: `태스크 ${i}` }))
    const handoff = base.filter((r) => ['approval', 'settlement', 'inbox', 'guide'].includes(r.kind))
    renderCard([...delayed, ...handoff])
    const kinds = () => screen.getAllByTestId('today-row').map((r) => r.getAttribute('data-kind'))
    expect(kinds().filter((k) => k === 'delayed').length).toBe(8)
    // 지연이 아무리 많아도 컨펌대기·정산·파일·가이드는 가려지지 않는다
    expect(kinds()).toEqual(expect.arrayContaining(['approval', 'settlement', 'inbox', 'guide']))
    const more = screen.getByRole('button', { name: '일정 행 7건 더 보기' })
    await userEvent.click(more)
    expect(kinds().filter((k) => k === 'delayed').length).toBe(15)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: '일정 행 접기' }))
    expect(kinds().filter((k) => k === 'delayed').length).toBe(8)
  })

  it('행이 아예 없으면 데이터 없음 빈 상태', () => {
    renderCard([])
    expect(screen.getByText(/지금 처리할 일이 없습니다/)).toBeTruthy()
  })
})

describe('DoD 71 ⑤ 미등록 파일 — 행 아래에서 연결·무시', () => {
  it('연결: 선택 없이 누르면 안내 → 항목을 고르고 연결하면 행이 사라지고 요약 칸이 준다 → 무시도 같다', async () => {
    mockProvider().switchUser('usr-pm')
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/home')
    const list = await screen.findByTestId('today-list')
    const tile = screen.getByTestId('home-tile-inbox')
    await waitFor(() => expect(within(tile).getByText('2')).toBeTruthy())

    const rowOf = (name: RegExp) =>
      within(list).getAllByTestId('today-row').find((r) => name.test(r.textContent ?? ''))!
    await waitFor(() => expect(rowOf(/리플렛 시안 수정본\.pdf/)).toBeTruthy())
    const toggle = within(rowOf(/리플렛 시안 수정본\.pdf/)).getByRole('button', { name: '항목에 연결' })
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const panel = screen.getByTestId('today-inbox-panel')
    await userEvent.click(within(panel).getByRole('button', { name: '연결' }))
    expect(await screen.findByText('연결할 항목을 선택하세요.')).toBeTruthy()

    const select = within(panel).getByRole('combobox')
    // 새 버전을 받을 수 있는 항목(초안)으로 — 컨펌대기·확정 항목은 업로드 잠금이라 연결도 막힌다
    await userEvent.selectOptions(select, within(select).getByRole('option', { name: /무대 백월 배너/ }))
    await userEvent.click(within(panel).getByRole('button', { name: '연결' }))
    await waitFor(() => expect(within(list).queryByText('리플렛 시안 수정본.pdf')).toBeNull())
    await waitFor(() => expect(within(tile).getByText('1')).toBeTruthy())
    expect(screen.queryByTestId('today-inbox-panel')).toBeNull()

    await userEvent.click(within(rowOf(/조명 견적 메모\.xlsx/)).getByRole('button', { name: '항목에 연결' }))
    await userEvent.click(within(screen.getByTestId('today-inbox-panel')).getByRole('button', { name: '무시' }))
    await waitFor(() => expect(within(list).queryByText('조명 견적 메모.xlsx')).toBeNull())
    await waitFor(() => expect(within(tile).getByText('0')).toBeTruthy())
  })
})

describe('DoD 71 ⑥ 다가오는 2주', () => {
  it('오늘~14일 안의 미완료 일정·마일스톤만, 날짜순', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/home')
    const rows = await screen.findAllByTestId('upcoming-row')
    expect(rows.length).toBeGreaterThan(0)
    const days = rows.map((r) => {
      const m = (r.textContent ?? '').match(/D-(\d+)|오늘/)!
      return m[0] === '오늘' ? 0 : Number(m[1])
    })
    for (const d of days) expect(d).toBeLessThanOrEqual(14)
    expect([...days].sort((a, b) => a - b)).toEqual(days)
  })
})
