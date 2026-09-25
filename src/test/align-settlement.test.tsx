/** @vitest-environment jsdom */
// 시안 정렬(S-10 정산보드) — 3.17b '정산보드.dc.html' → **Phase 3.23 PR-7 캔버스 '정산보드 — 금액 색은 의미대로'**
// (디자인지시서 v1.4 §7-2.11) + 패턴 기준 시트 §05·§07. 핵심 계약만 단언한다:
//  ① KPI 4장 = 캡션 · 숫자 · 보조 한 줄(계약 − 마진 밖(리드젠) / 발주 중 n% 집행 / 마크업·PCO·RSVP / 참고 범위 안·밖)
//  ② 마진율 밴드 = 막대 위 마커. 밴드 밖이어도 **경고하지 않고 위치만** 표시(§19.1 유지)
//  ③ 옛 '마진 구성 · 검산' 카드 퇴역 — 검산 = 최종 마진 칸 배지, 구성 = 그 칸의 막대(주황 없음) ·
//     초과 경보 = 머리 아래 알림(버킷마다) → '항목 보기'가 그 버킷을 편다
//  ④ 버킷 표 = 표 정본 — 초과 행의 전체 배경 제거(배지 + 수치 색으로만) · 금액 .ui-num ·
//     셀 내 막대는 집행률 열에만 · 고정 합계행(.ui-table-total)
//  ⑤ 원가 없음·마진 밖 버킷은 숨기지 않고 그룹행 '원가 없는 항목' 아래 — 펼침 단추 없음 · 발주·실집행 '—'
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

    expect(screen.getByTestId('kpi-support-contract').textContent).toMatch(/^계약 [\d,]+ − 마진 밖\(리드젠\) [\d,]+$/)
    expect(screen.getByTestId('kpi-support-spent').textContent).toMatch(/^발주 [\d,]+원 중 [\d.]+% 집행$/)
    expect(screen.getByTestId('kpi-support-margin').textContent).toMatch(/^마크업 -?[\d,]+ · PCO [\d,]+ · RSVP [\d,]+$/)
    expect(screen.getByTestId('kpi-support-rate').textContent).toMatch(/^참고 범위 27\.5~69\.0% (안|밖) · 판정 아님$/)
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

describe('S-10 검산 · 구성 — 최종 마진 칸 / 초과 경보 — 머리 아래 알림', () => {
  it('③ 옛 통합 카드는 없고, 최종 마진 칸에 검산 배지와 구성 막대(주황 없음 · 변동 + 고정)가 있다', async () => {
    renderRoute('/settlement')
    await screen.findByTestId('settlement-kpis')
    expect(screen.queryByTestId('margin-summary-card')).toBeNull()

    expect(within(screen.getByTestId('margin-identity')).getByText('검산 일치')).toBeTruthy()
    const segs = ['variable', 's5', 'rc'].map((k) => screen.getByTestId(`margin-seg-${k}`))
    expect(segs.map((el) => el.className)).toEqual(['bg-brown', 'bg-steel', 'bg-border-strong'])
    // 금액 구성은 강조가 아니다 — 막대에 주황 계열 0
    expect(segs.some((el) => /accent|role-reg/.test(el.className))).toBe(false)
  })

  it('③ 초과 경보는 버킷마다 머리 아래 알림 — 항목 보기가 그 버킷을 펴고 메모 안내를 보인다', async () => {
    const user = userEvent.setup()
    renderRoute('/settlement')
    const alert = await screen.findByTestId('alert-over-s2')
    expect(alert.className).toContain('bg-accent-tint')
    expect(within(alert).getByText('견적 초과')).toBeTruthy()
    expect(alert.textContent).toContain('초과는 막지 않아요')

    await user.click(within(alert).getByRole('button', { name: '항목 보기' }))
    const panel = await screen.findByTestId('bucket-panel-s2')
    expect(within(panel).getByTestId('over-reason-hint').textContent).toContain('메모로 이유를 남겨 두세요')
    expect(within(screen.getByTestId('bucket-row-s2')).getByRole('button', { name: '시스템 구축' }).getAttribute('aria-expanded')).toBe('true')
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

  it('⑤ 원가 없음·마진 밖 버킷은 숨지 않고 그룹행 아래에 — 펼침 단추 없음 · 발주·실집행 칸은 —', async () => {
    const { container } = renderRoute('/settlement')
    const s5 = await screen.findByTestId('bucket-row-s5')
    const ld = screen.getByTestId('bucket-row-ld')
    const group = screen.getByTestId('no-cost-group')

    // 표 순서: 원가 있는 버킷 → 그룹행 → 원가 없는 버킷
    const rows = [...table(container).querySelectorAll('tbody > tr')]
    expect(rows.indexOf(group)).toBeGreaterThan(rows.indexOf(screen.getByTestId('bucket-row-s1')))
    for (const row of [s5, ld]) {
      expect(rows.indexOf(row)).toBeGreaterThan(rows.indexOf(group))
      expect(row.getAttribute('data-muted')).toBe('true')
      expect(within(row).queryByRole('button')).toBeNull()
    }
    // has_cost=false 버킷은 발주·실비 칸 자체가 없다(422 + UI 부재 유지)
    expect(within(s5).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(ld).getByText('마진 계산 밖')).toBeTruthy()
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
