/** @vitest-environment jsdom */
// 시안 정렬(S-10 정산보드) — '정산보드.dc.html' + 패턴 기준 시트 §05·§07.
// 이번 정렬의 핵심 계약만 단언한다:
//  ① KPI 4장에 보조 수치 1줄(계약액=산식 / 실집행=발주 대비 / 마진=변동·고정 / 마진율=참고 밴드)
//  ② 마진율 밴드 = 막대 위 마커. 밴드 밖이어도 **경고하지 않고 위치만** 표시(§19.1 유지)
//  ③ 마진 구성 막대 + 검산이 **한 카드**, 초과 경보는 그 카드 하단 negative-tint 바
//  ④ 버킷 표 = 표 정본 — 초과 행의 전체 배경 제거(배지 + 수치 색으로만) · 금액 .ui-num ·
//     셀 내 막대는 집행률 열에만 · 고정 합계행(.ui-table-total)
//  ⑤ 원가 없음·마진 밖 버킷은 숨기지 않고 canvas 면으로 가라앉는다
//  ⑥ 밀집 모드 토글(내부 화면이므로 허용)이 표 행 높이 규격을 바꾼다
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(cleanup)

function table(container: HTMLElement): HTMLTableElement {
  return container.querySelectorAll('table.ui-table')[
    container.querySelectorAll('table.ui-table').length - 1
  ] as HTMLTableElement
}

describe('S-10 KPI · 마진율 밴드', () => {
  it('① KPI 4장에 보조 수치 1줄이 붙는다', async () => {
    renderRoute('/settlement')
    await screen.findByText('마진 기준 계약액')

    expect(screen.getByTestId('kpi-support-contract').textContent).toMatch(/^계약 [\d,]+ − 마진 밖 [\d,]+$/)
    expect(screen.getByTestId('kpi-support-spent').textContent).toMatch(/^발주 [\d,]+ 대비 [\d.]+%$/)
    expect(screen.getByTestId('kpi-support-margin').textContent).toMatch(/^변동 [\d,-]+ \+ 고정 [\d,]+$/)
    expect(screen.getByText(/참고: 사내 실측 27\.5~69\.0%/)).toBeTruthy()
  })

  it('② 마진율은 막대 위 마커로 위치만 표시하고 밴드 밖이라 경고하지 않는다', async () => {
    const { container } = renderRoute('/settlement')
    await screen.findByText('마진 기준 계약액')

    const marker = screen.getByTestId('margin-rate-marker')
    const left = Number.parseFloat(marker.style.left)
    expect(Number.isFinite(left)).toBe(true)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThanOrEqual(100)

    // 판정하지 않는다 — 밴드 미달/초과를 알리는 경고 문구가 화면에 없다
    expect(container.textContent).not.toMatch(/밴드 (미달|이탈|초과)|마진율 (경고|주의)/)
  })
})

describe('S-10 마진 구성 · 검산 통합 카드', () => {
  it('③ 구성 막대와 검산이 한 카드에 있고 초과 경보가 카드 하단 바로 붙는다', async () => {
    renderRoute('/settlement')
    const card = await screen.findByTestId('margin-summary-card')

    // 구성 막대(변동 + 고정)와 검산 표가 같은 카드 안
    expect(within(card).getByTestId('margin-seg-variable')).toBeTruthy()
    expect(within(card).getByText('검산')).toBeTruthy()
    expect(within(card).getByText('− 실집행')).toBeTruthy()
    expect(within(card).getByText('항등식 성립')).toBeTruthy()

    // 초과 경보 = 같은 카드 하단의 negative-tint 바
    const alert = within(card).getByText(/견적 초과 버킷 \d+건/)
    const bar = alert.parentElement as HTMLElement
    expect(bar.className).toContain('bg-negative-tint')
    expect(within(bar).getByRole('button', { name: '초과 버킷만 보기' })).toBeTruthy()
  })

  it('③ 초과 버킷만 보기가 버킷 표를 필터링하고 초기화로 되돌아온다', async () => {
    const user = userEvent.setup()
    const { container } = renderRoute('/settlement')
    await screen.findByTestId('bucket-row-s2')
    const allRows = table(container).querySelectorAll('tbody tr[data-testid^="bucket-row-"]').length

    await user.click(screen.getByRole('button', { name: '초과 버킷만 보기' }))
    const filtered = table(container).querySelectorAll('tbody tr[data-testid^="bucket-row-"]').length
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(allRows)
    expect(screen.getByTestId('bucket-row-s2')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '필터 초기화' }))
    expect(table(container).querySelectorAll('tbody tr[data-testid^="bucket-row-"]').length).toBe(allRows)
  })
})

describe('S-10 버킷 표 — 표 정본', () => {
  it('④ 초과 행에 행 배경이 없고, 배지 + 집행률·마크업 수치 색으로만 알린다', async () => {
    renderRoute('/settlement')
    const row = await screen.findByTestId('bucket-row-s2')

    // 행 전체 배경(negative-tint)을 걷어냈다 — 클래스에도 인라인 스타일에도 없다
    expect(row.className).not.toContain('bg-negative')
    expect((row as HTMLTableRowElement).style.background).not.toContain('negative')

    expect(within(row).getByText('견적 초과')).toBeTruthy()
    // 수치 색 — 집행률·마크업 셀이 negative
    const negCells = row.querySelectorAll('[class*="text-negative"]')
    expect(negCells.length).toBeGreaterThan(0)
  })

  it('④ 금액은 .ui-num, 셀 내 막대는 집행률 열에만, 합계는 고정 하단행', async () => {
    const { container } = renderRoute('/settlement')
    const row = await screen.findByTestId('bucket-row-s1')
    const cells = row.querySelectorAll('td')

    // 견적·발주·실집행·마크업·마크업률 = .ui-num (버킷 이름·집행률 열은 제외)
    for (const i of [1, 2, 3, 5, 6]) expect(cells[i].className).toContain('ui-num')
    // 조건 4 — 셀 내 막대는 집행률 열(index 4)에만
    expect(within(cells[4] as HTMLElement).getByTestId('spend-bar')).toBeTruthy()
    for (const i of [1, 2, 3, 5, 6]) {
      expect(cells[i].querySelector('[data-testid="spend-bar"]')).toBeNull()
    }

    const total = table(container).querySelector('tr.ui-table-total') as HTMLElement
    expect(total).toBeTruthy()
    expect(within(total).getByText('합계')).toBeTruthy()
  })

  it('⑤ 원가 없음·마진 밖 버킷은 숨지 않고 canvas 면으로 가라앉는다', async () => {
    renderRoute('/settlement')
    const s5 = await screen.findByTestId('bucket-row-s5')
    const ld = screen.getByTestId('bucket-row-ld')

    for (const row of [s5, ld]) {
      expect(row.getAttribute('data-muted')).toBe('true')
      expect((row as HTMLTableRowElement).style.background).toBe('var(--canvas)')
    }
    // has_cost=false 버킷은 발주·실비 칸 자체가 없다(422 + UI 부재 유지)
    expect(within(s5).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('⑥ 밀집 모드 토글이 표 행 높이 규격을 바꾼다', async () => {
    const user = userEvent.setup()
    const { container } = renderRoute('/settlement')
    await screen.findByTestId('bucket-row-s1')

    expect(container.querySelector('table.ui-table-dense')).toBeNull()
    await user.click(screen.getByRole('button', { name: '밀집 모드' }))
    expect(container.querySelector('table.ui-table-dense')).toBeTruthy()
  })
})
