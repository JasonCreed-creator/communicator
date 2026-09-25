/** @vitest-environment jsdom */
// DoD 77 — 정산보드 재배치 (Phase 3.23 PR-7 · 디자인지시서 v1.4 §7-2.11 · 캔버스 '정산보드 — 금액 색은 의미대로').
// ① 머리: 제목 + '내부 전용' · 쉬는 상태의 채운 버튼 = 협력사 견적서 불러오기 하나 · 폼을 열면 물러난다 · pm 아니면 비활성 + 이유
// ② 알림: 확인 대기 견적서(건수·파일·확인할 것 → 확인하기가 그 견적서를 연다) · 견적 초과(버킷마다) · 검산 어긋남(있을 때만)
// ③ KPI: 화면 숫자로 계약액 − 실집행 = 최종 마진 · 검산 배지 · 구성 막대(음수 폭 0) · 참고 범위 안/밖(판정 아님)
// ④ 버킷 표: 7열 · 정렬 화살표 없음 · 펼침 단추(aria-expanded · 키보드) · 펼친 행 면
// ⑤ 발주 항목: 7칸 · 역할 도트 · 상태 배지 · ⋯ 메뉴(권한대로) · 메모(초과 사유) 저장 · 지우기 확인 · 글자 단추 '＋ 발주 항목 추가'
// ⑥ 불러온 견적서 이력: 없으면 칸도 없다
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettlementKpis from '../components/settlement/SettlementKpis'
import type { SettlementTotals } from '../lib/settlement'
import { syntheticVendorQuoteGifts } from '../modules/quote/import/__tests__/fixtures/syntheticVendorQuotes'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mockProvider().switchUser('usr-pm')
})

async function openBoard() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
  renderRoute('/settlement')
  return screen.findByTestId('settlement-kpis')
}

const filledButtons = () => [...document.querySelectorAll('main .btn-accent, main .btn-primary')].map((b) => b.textContent?.trim())

/** KPI 칸의 큰 숫자 → number */
function kpiNumber(label: string): number {
  const card = screen.getByText(label, { selector: 'span.t-caption' }).closest('.ui-card') as HTMLElement
  const big = card.querySelector('.text-2xl') as HTMLElement
  return Number((big.textContent ?? '').replace(/[^\d-]/g, ''))
}

describe('DoD 77 ① 머리', () => {
  it('제목 = 정산보드(배지는 제목 밖) · 쉬는 상태의 채운 버튼은 불러오기 하나 · 기준 견적 갱신을 열면 머리 버튼이 물러난다', async () => {
    await openBoard()
    expect(screen.getByRole('heading', { level: 1, name: '정산보드' })).toBeTruthy()
    expect(screen.getByText('내부 전용')).toBeTruthy()
    await waitFor(() => expect(filledButtons()).toEqual(['협력사 견적서 불러오기']))

    await userEvent.click(screen.getByRole('button', { name: '기준 견적 갱신' }))
    expect(screen.getByRole('region', { name: '기준 견적 갱신' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '협력사 견적서 불러오기' }).className).toContain('btn-ghost')
    expect(filledButtons()).toEqual(['이대로 갱신'])
  })

  it('pm이 아니면 기준 견적 갱신·버킷 추가가 없고 불러오기는 비활성 + 이유', async () => {
    mockProvider().switchUser('usr-design')
    await openBoard()
    const btn = screen.getByRole('button', { name: '협력사 견적서 불러오기' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(true))
    expect(btn.title).toContain('PM 전용')
    expect(screen.queryByRole('button', { name: '기준 견적 갱신' })).toBeNull()
    expect(screen.queryByRole('button', { name: '버킷 추가' })).toBeNull()
  })
})

describe('DoD 77 ② 알림', () => {
  it('견적 초과 버킷마다 알림 하나 · 검산이 맞으면 검산 알림 없음', async () => {
    await openBoard()
    const board = await mockProvider().getSettlementBoard(PROJECT_ID)
    const over = board!.buckets.filter((b) => b.over_budget)
    expect(over.length).toBeGreaterThan(0)
    for (const b of over) expect(screen.getByTestId(`alert-over-${b.bucket.code}`)).toBeTruthy()
    expect(document.querySelectorAll('[data-testid^="alert-over-"]')).toHaveLength(over.length)
    expect(screen.queryByTestId('alert-identity')).toBeNull()
  })

  it('확인 대기 협력사 견적서 → 알림(건수·파일·확인할 것) · 확인하기가 그 견적서의 확인 큐를 연다 · 이력 칸이 생긴다', async () => {
    await openBoard()
    expect(screen.queryByTestId('vendor-quote-import')).toBeNull()
    expect(screen.queryByTestId('alert-vendor-pending')).toBeNull()
    cleanup()

    await mockProvider().importVendorQuote(PROJECT_ID, { file_name: '가상선물_대기.xlsx', data: await syntheticVendorQuoteGifts() })
    await openBoard()
    const alert = await screen.findByTestId('alert-vendor-pending')
    expect(alert.textContent).toMatch(/협력사 견적서 1건 — 가상선물_대기\.xlsx/)
    expect(alert.textContent).toMatch(/\d+월 \d+일 불러옴 · \d+개 항목 · 확인할 것: 부가세 포함 여부 · 버킷/)
    await userEvent.click(within(alert).getByRole('button', { name: '확인하기' }))
    const dialog = await screen.findByTestId('vendor-quote-dialog')
    expect(within(dialog).getByRole('heading', { name: '확인하고 저장하기 — 가상선물_대기.xlsx' })).toBeTruthy()
    expect(screen.getByTestId('vendor-quote-import')).toBeTruthy()
  })
})

describe('DoD 77 ③ KPI', () => {
  it('화면 숫자로 계약액 − 실집행 = 최종 마진 · 검산 일치 · 참고 범위 안', async () => {
    await openBoard()
    expect(kpiNumber('마진 기준 계약액') - kpiNumber('실집행')).toBe(kpiNumber('최종 마진'))
    expect(within(screen.getByTestId('margin-identity')).getByText('검산 일치')).toBeTruthy()
    expect(screen.getByTestId('kpi-support-rate').textContent).toBe('참고 범위 27.5~69.0% 안 · 판정 아님')
  })

  const base: SettlementTotals = {
    marginBase: 100_000_000,
    totalActual: 95_000_000,
    totalOrdered: 90_000_000,
    finalMargin: 5_000_000,
    marginRate: 0.05,
    variableMarkup: -10_000_000,
    fixedByBucket: [
      { code: 's5', label: 'PCO 기획료', amount: 12_000_000 },
      { code: 'rc', label: 'RSVP 운영비', amount: 3_000_000 },
    ],
    excluded: [],
    overBudgetCount: 2,
    identityOk: false,
  }

  it('검산 어긋남 배지 · 음수 변동분은 막대 폭 0 + 캡션 음수 · 참고 범위 밖(판정 문구 없음) · 마진 밖이 없으면 "계약 전부"', () => {
    render(<SettlementKpis totals={base} />)
    expect(within(screen.getByTestId('margin-identity')).getByText('검산 어긋남')).toBeTruthy()
    expect(screen.getByTestId('margin-seg-variable').style.width).toBe('0%')
    expect(screen.getByTestId('kpi-support-margin').textContent).toBe('마크업 -10,000,000 · PCO 12,000,000 · RSVP 3,000,000')
    expect(screen.getByTestId('kpi-support-rate').textContent).toBe('참고 범위 27.5~69.0% 밖 · 판정 아님')
    expect(screen.getByTestId('kpi-support-contract').textContent).toBe('계약 100,000,000 전부')
    expect(document.body.textContent).not.toMatch(/경고|미달|주의/)
  })

  it('마진이 음수면 숫자만 negative · 마진율 없으면 — · 발주가 없으면 그 사실만', () => {
    render(
      <SettlementKpis
        totals={{ ...base, finalMargin: -3_000_000, marginRate: null, totalOrdered: 0, totalActual: 0, identityOk: true }}
      />,
    )
    const margin = screen.getByText('최종 마진', { selector: 'span.t-caption' }).closest('.ui-card') as HTMLElement
    expect((margin.querySelector('.text-2xl') as HTMLElement).className).toContain('text-negative')
    expect(screen.getByTestId('kpi-support-rate').textContent).toBe('참고 범위 27.5~69.0% · 판정 아님')
    expect(screen.getByTestId('kpi-support-spent').textContent).toBe('아직 발주가 없습니다')
  })
})

describe('DoD 77 ④ 버킷 표', () => {
  it('7열 · 정렬 화살표 없음 · 펼침 단추를 키보드로 열고 닫는다 · 펼친 행은 accent-tint 면', async () => {
    await openBoard()
    const table = screen.getByRole('region', { name: '버킷별 집행' }).querySelector('table.ui-table') as HTMLTableElement
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '버킷',
      '견적',
      '발주',
      '실집행',
      '집행률',
      '마크업',
      '마크업률',
    ])
    expect(table.querySelectorAll('thead button')).toHaveLength(0)

    const row = screen.getByTestId('bucket-row-s3')
    const toggle = within(row).getByRole('button', { name: '디자인·브랜딩' })
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('bucket-panel-s3')).toBeTruthy()
    expect((screen.getByTestId('bucket-row-s3') as HTMLElement).style.background).toBe('var(--accent-tint)')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByTestId('bucket-panel-s3')).toBeNull())
  })
})

describe('DoD 77 ⑤ 발주 항목', () => {
  async function openS2() {
    await openBoard()
    await userEvent.click(within(screen.getByTestId('bucket-row-s2')).getByRole('button', { name: '시스템 구축' }))
    return screen.findByTestId('bucket-panel-s2')
  }

  it('7칸 · 담당은 역할 도트 · 정산 완료 = 정상 배지 · pm 메뉴 = 금액·상태 입력 + 항목 지우기 · 추가는 글자 단추', async () => {
    const panel = await openS2()
    const items = within(panel).getByTestId('settlement-items')
    expect([...items.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '발주 항목',
      '협력사',
      '담당',
      '발주액',
      '실집행',
      '상태',
      '',
    ])
    const first = within(items).getAllByTestId('settlement-item-row')[0]
    expect(first.querySelector('.size-2.rounded-full.bg-steel')).toBeTruthy()
    const badge = within(first).getByText('정산 완료')
    expect(badge.getAttribute('data-level')).toBe('positive')
    await userEvent.click(within(first).getByRole('button', { name: /^발주 항목 메뉴 / }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['금액·상태 입력', '항목 지우기'])
    await userEvent.keyboard('{Escape}')
    const add = within(items).getByRole('button', { name: '＋ 발주 항목 추가' })
    expect(add.className).not.toMatch(/\bbtn\b/)
  })

  it('메모(초과 사유)를 저장하면 항목 아래에 보이고 저장소에 남는다', async () => {
    const panel = await openS2()
    const row = within(panel).getAllByTestId('settlement-item-row')[1]
    await userEvent.click(within(row).getByRole('button', { name: /^발주 항목 메뉴 / }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '금액·상태 입력' }))
    await userEvent.type(screen.getByLabelText('메모 · 견적을 넘었다면 이유'), '발주처 요청으로 현장 음향 1식 추가')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    const note = await within(screen.getByTestId('bucket-panel-s2')).findByTestId('settlement-item-note')
    expect(note.textContent).toBe('메모 · 발주처 요청으로 현장 음향 1식 추가')
    const board = await mockProvider().getSettlementBoard(PROJECT_ID)
    const s2 = board!.buckets.find((b) => b.bucket.code === 's2')!
    expect(s2.items.some((i) => i.note === '발주처 요청으로 현장 음향 1식 추가')).toBe(true)
  })

  it('항목 지우기는 확인을 받고, 취소하면 그대로다', async () => {
    const panel = await openS2()
    const before = within(panel).getAllByTestId('settlement-item-row').length
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const pick = async () => {
      const rows = within(screen.getByTestId('bucket-panel-s2')).getAllByTestId('settlement-item-row')
      const last = rows[rows.length - 1]
      await userEvent.click(within(last).getByRole('button', { name: /^발주 항목 메뉴 / }))
      await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '항목 지우기' }))
    }
    await pick()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(within(screen.getByTestId('bucket-panel-s2')).getAllByTestId('settlement-item-row')).toHaveLength(before)
    await pick()
    await waitFor(() =>
      expect(within(screen.getByTestId('bucket-panel-s2')).getAllByTestId('settlement-item-row')).toHaveLength(before - 1),
    )
  })

  it('담당자(ops)는 자기 항목에 금액·상태 입력만, 담당이 아닌 design은 메뉴가 없다', async () => {
    mockProvider().switchUser('usr-ops')
    let panel = await openS2()
    const row = within(panel).getAllByTestId('settlement-item-row')[0]
    await userEvent.click(within(row).getByRole('button', { name: /^발주 항목 메뉴 / }))
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['금액·상태 입력'])
    await userEvent.keyboard('{Escape}')
    expect(within(panel).queryByRole('button', { name: '＋ 발주 항목 추가' })).toBeNull()
    cleanup()

    mockProvider().switchUser('usr-design')
    panel = await openS2()
    expect(within(panel).queryAllByRole('button', { name: /^발주 항목 메뉴 / })).toHaveLength(0)
  })
})
