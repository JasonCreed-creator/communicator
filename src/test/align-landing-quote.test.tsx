/** @vitest-environment jsdom */
// 시안 정렬(S-3 랜딩보드 · S-2 견적) — '랜딩보드 · 견적.dc.html' + 패턴 기준 시트 §03·§05·§07.
// 이번 정렬의 핵심 계약만 단언한다:
//  ① 두 화면의 자체 표 규격 → 표 정본(.ui-table + .ui-th) 통일, 정렬 화살표는 정렬 가능한 열에만
//  ② 상태 pill → 배지 정본(LevelBadge · rounded-full · 12/500) — 2px 라운드 pill 잔존 0건
//  ③ 랜딩 KPI에 보조 수치 1줄 + 미니바(열람률·전환율)
//  ④ 일자별 막대에 범례 + 4점 축 라벨 + 최고점 해설
//  ⑤ 견적 총액 열 = .ui-num(우측정렬 tabular)
//  ⑥ 견적 요약에 구성 스택 막대 — **accent 3단 + rest(중립)**, 4번째 그룹은 램프가 아니라 rest
//  ⑦ '이전 버전 대비' 블록 — 증감액·증감률 + 사유는 데이터에 없으므로 '미기재'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectProvider } from '../context/ProjectContext'
import LandingBoardPage from '../pages/LandingBoardPage'
import QuotesPage from '../pages/QuotesPage'
import { compositionGroups } from '../components/quote/QuoteComposition'
import { previousVersion } from '../components/quote/QuoteVersionDelta'
import { axisIndexes } from '../components/landing/LandingMetrics'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

const provider = getDataProvider() as MockProvider

function renderAt(path: string) {
  try {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
  } catch {
    // jsdom 외 환경 무시
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <ProjectProvider>
              <Outlet />
            </ProjectProvider>
          }
        >
          <Route path="/landing" element={<LandingBoardPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  provider.setAppRole('sales')
})

afterEach(cleanup)

describe('S-3 랜딩보드 — 표 정본 · 배지 정본', () => {
  it('① 목록이 표 정본(.ui-table + .ui-th)이고 정렬 화살표는 정렬 가능한 열에만 붙는다', async () => {
    const { container } = renderAt('/landing')
    await screen.findByText('발행됨')

    const table = container.querySelector('table.ui-table') as HTMLTableElement
    expect(table).toBeTruthy()
    // thead 셀은 전부 .ui-th(canvas 면 + 2px 룰) — 옛 bg-track thead 잔존 0건
    const ths = [...table.querySelectorAll('thead th')]
    expect(ths.length).toBe(4)
    expect(ths.every((th) => th.classList.contains('ui-th'))).toBe(true)
    expect(table.querySelector('thead tr')?.className ?? '').not.toContain('bg-track')

    // 정렬 화살표(버튼)는 랜딩·수정 두 열에만 — 상태·측정은 정렬 대상이 아니다(§05 조건 3)
    const sortButtons = [...table.querySelectorAll('thead button')]
    expect(sortButtons.map((b) => b.textContent?.replace(/[↕↓↑]/g, '').trim())).toEqual(['랜딩', '수정'])
  })

  it('② 상태가 배지 정본(rounded-full)으로 렌더된다 — 2px 라운드 pill 잔존 0건', async () => {
    const { container } = renderAt('/landing')
    const badge = await screen.findByText('발행됨')
    expect(badge.className).toContain('rounded-full')
    expect(badge.className).toContain('text-xs')
    // 옛 규격(rounded 2px + 11px bold)이 표에 남아 있지 않다
    const table = container.querySelector('table.ui-table') as HTMLTableElement
    expect(table.innerHTML).not.toContain('text-[11px] font-bold')
  })

  it('③ KPI에 보조 수치 1줄 + 미니바(열람률·전환율)가 붙는다', async () => {
    renderAt('/landing')
    await screen.findByText('유입 지표')

    expect((await screen.findByTestId('kpi-support-views')).textContent).toMatch(
      /최근 \d+일 · 일평균 [\d,]+/,
    )
    const starts = await screen.findByTestId('kpi-support-starts')
    expect(starts.textContent).toMatch(/^열람률 \d+\.\d%$/)
    const submits = await screen.findByTestId('kpi-support-submits')
    expect(submits.textContent).toMatch(/^폼 열람 대비 \d+\.\d% · 전체 \d+\.\d%$/)

    // 미니바 — 보조 수치 줄 위에 6px 트랙(ProgressBar)이 함께 있다
    for (const el of [starts, submits]) {
      const support = el.parentElement as HTMLElement
      expect(support.querySelector('.h-1\\.5')).toBeTruthy()
    }
  })

  it('④ 일자별 막대에 범례 · 4점 축 라벨 · 최고점 해설이 있다', async () => {
    renderAt('/landing')
    const legend = await screen.findByTestId('daily-legend')
    expect(within(legend).getByText('페이지뷰')).toBeTruthy()
    expect(within(legend).getByText('신청 완료')).toBeTruthy()

    const axis = await screen.findByTestId('daily-axis')
    // 픽스처 30일 → 등간격 4점(양 끝 2점만 있던 축을 대체)
    expect(axis.children).toHaveLength(4)
    expect(axis.children[0].textContent).toMatch(/^\d+월 \d+일$/)

    expect((await screen.findByTestId('daily-peak')).textContent).toMatch(
      /^최고점 \d+월 \d+일 · 뷰 [\d,]+ · 신청 [\d,]+$/,
    )
    // 축 계산은 행이 적어도 무너지지 않는다(중복 지점 접기)
    expect(axisIndexes(30)).toEqual([0, 10, 19, 29])
    expect(axisIndexes(2)).toEqual([0, 1])
  })
})

describe('S-2 견적 — 표 정본 · 구성 막대 · 이전 버전 대비', () => {
  it('⑤ 버전 표가 표 정본이고 총액 열이 .ui-num(우측정렬 tabular)이다', async () => {
    const { container } = renderAt('/quotes')
    await screen.findAllByText(/행사 연결 · /)

    const table = container.querySelector('table.ui-table') as HTMLTableElement
    expect(table).toBeTruthy()
    // 총액 헤더·본문 셀 모두 .ui-num
    const totalTh = [...table.querySelectorAll('thead th')].find((th) =>
      th.textContent?.includes('총액'),
    ) as HTMLElement
    expect(totalTh.className).toContain('text-right')
    const firstRow = table.querySelector('tbody tr') as HTMLElement
    const totalTd = firstRow.children[4] as HTMLElement
    expect(totalTd.classList.contains('ui-num')).toBe(true)
    expect(totalTd.textContent).toMatch(/^[\d,]+원$/)

    // 상태는 배지 정본
    const statusTd = firstRow.children[5] as HTMLElement
    expect((statusTd.firstElementChild as HTMLElement).className).toContain('rounded-full')
  })

  it('⑥ 구성 스택 막대 — accent 3단 + 4번째 그룹은 rest(중립 track)', async () => {
    renderAt('/quotes')
    const comp = await screen.findByTestId('quote-composition')

    const bar = comp.querySelector('.rounded-full') as HTMLElement
    const segs = [...bar.children] as HTMLElement[]
    expect(segs).toHaveLength(4)
    // accent 램프는 정확히 3단 — 4단으로 늘리지 않는다(§07)
    expect(segs.slice(0, 3).map((s) => s.className)).toEqual([
      'bg-accent-deep',
      'bg-accent',
      'bg-role-reg',
    ])
    expect(segs[3].className).toBe('bg-track')

    // 범례는 4번째(rest)의 이름을 반드시 밝힌다
    for (const name of ['공간·시공', '제작·운영', '기획료', '모객·참관객']) {
      expect(within(comp).getByText(name, { exact: false })).toBeTruthy()
    }
  })

  it('⑥-b 구성 그룹 합계는 엔진 breakdown의 소계와 일치한다 (금액 재계산 없음)', async () => {
    const quotes = await provider.listQuotes()
    for (const q of quotes) {
      const g = compositionGroups(q.breakdown)
      expect(g.space + g.production + g.planning + g.recruiting).toBe(q.breakdown.subtotal)
    }
  })

  it('⑦ 이전 버전 대비 — 증감액·증감률이 뜨고 사유는 지어내지 않고 미기재다', async () => {
    renderAt('/quotes')
    const block = await screen.findByTestId('quote-version-delta')

    // 픽스처 기본 선택 = 확정(v3) → 직전은 v2
    expect(within(block).getByText('v2 → v3')).toBeTruthy()
    expect(within(block).getByTestId('quote-delta-amount').textContent).toMatch(
      /^[+−±][\d,]+원 \([+−±]\d+\.\d%\)$/,
    )
    // 사유 필드는 스키마에 없다 — '미기재'
    expect(within(block).getByTestId('quote-delta-reason').textContent).toBe('미기재')
    // 변경점은 입력 스냅숏의 사실 차이만(게런티·추가옵션 — 추정 아님)
    expect(within(block).getByTestId('quote-delta-changes').textContent).toMatch(
      /게런티 \d+ → \d+명 · 추가옵션 \d+ → \d+종/,
    )
  })

  it('⑦-b previousVersion은 같은 계열(같은 행사 연결) 안에서만 직전 버전을 찾는다', async () => {
    const quotes = await provider.listQuotes()
    const v3 = quotes.find((q) => q.version === 3)!
    expect(previousVersion(quotes, v3)?.version).toBe(2)

    const v1 = quotes.find((q) => q.project_id === v3.project_id && q.version === 1)!
    expect(previousVersion(quotes, v1)).toBeNull()

    // 미연결 견적(v1)은 연결 견적을 이전 버전으로 삼지 않는다
    const unlinked = quotes.find((q) => q.project_id === null)!
    expect(previousVersion(quotes, unlinked)).toBeNull()
  })
})
