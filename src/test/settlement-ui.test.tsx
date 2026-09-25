/** @vitest-environment jsdom */
// S-10 화면 계약 (Phase 3.14b·3.14c) — 설계서 v2.2 §19·§10.
//
// 화면이 지켜야 하는 것:
//   · 원가 없는 버킷·마진 밖 버킷을 **숨기지 않는다** — PR-7(§7-2.11)부터 그룹행 '원가 없는 항목' 아래
//   · 견적 초과 버킷을 머리 아래 알림 + 배지로 알리고, 홈(S1)에도 건수 칸을 띄운다
//   · 부가세 포함 토글이 "받은 금액 → 저장 금액"을 미리 보여준다
//   · 협력사 견적서 불러오기(Phase 4.7)는 게이트 뒤에 숨기지 않는다 — pm에게 열려 있다(상세 계약 = dod69-vendor-quote)
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('S-10 정산보드 화면', () => {
  it('KPI 4종과 기준 견적·내부 전용 표시가 뜬다', async () => {
    renderRoute('/settlement')
    expect(await screen.findByText('마진 기준 계약액')).toBeTruthy()
    expect(screen.getAllByText('실집행').length).toBeGreaterThan(0)
    expect(screen.getAllByText('최종 마진').length).toBeGreaterThan(0)
    expect(screen.getAllByText('마진율').length).toBeGreaterThan(0)
    expect(screen.getByText('내부 전용')).toBeTruthy()
    // 마진율 밴드는 참고선일 뿐 — 위치(안/밖)만 말하고 판정하지 않는다
    expect(screen.getByTestId('kpi-support-rate').textContent).toMatch(/^참고 범위 27\.5~69\.0% (안|밖) · 판정 아님$/)
  })

  it('원가 없는 버킷과 마진 밖 버킷이 목록에 남고(그룹행 아래) 라벨이 붙는다', async () => {
    renderRoute('/settlement')
    const s5 = await screen.findByTestId('bucket-row-s5')
    expect(screen.getByTestId('no-cost-group').textContent).toBe('원가 없는 항목 — 발주·실집행을 받지 않습니다')
    expect(within(s5).getByText('PCO 기획료')).toBeTruthy()

    const ld = screen.getByTestId('bucket-row-ld')
    expect(within(ld).getByText('리드젠(쇼업 보장)')).toBeTruthy()
    expect(within(ld).getByText('마진 계산 밖')).toBeTruthy()
  })

  it('견적 초과 버킷에 초과 표시가 붙고 머리 아래 알림이 그 버킷을 말한다 · 검산 배지', async () => {
    renderRoute('/settlement')
    const s2 = await screen.findByTestId('bucket-row-s2')
    expect(within(s2).getByText('견적 초과')).toBeTruthy()
    expect(screen.getByTestId('alert-over-s2').textContent).toMatch(/시스템 구축 — 실집행 [\d,]+원이 견적 [\d,]+원을 넘었습니다/)
    // PR-7: 검산 결과는 최종 마진 칸의 배지(의미 동일 — 항등식이 성립함을 화면이 단언한다)
    expect(within(screen.getByTestId('margin-identity')).getByText('검산 일치')).toBeTruthy()
  })

  it('마진 구성 막대가 변동 + 고정 3분할로 그려진다', async () => {
    renderRoute('/settlement')
    expect(await screen.findByTestId('margin-seg-variable')).toBeTruthy()
    expect(screen.getByTestId('margin-seg-s5')).toBeTruthy()
    expect(screen.getByTestId('margin-seg-rc')).toBeTruthy()
  })

  it('협력사 견적서 불러오기가 숨지 않고 pm에게 열려 있다(PR-7: 머리의 채운 버튼)', async () => {
    renderRoute('/settlement')
    await screen.findByTestId('settlement-kpis')
    const btn = screen.getByRole('button', { name: '협력사 견적서 불러오기' })
    expect(btn.className).toContain('btn-accent')
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/Phase 4.7에서 열립니다/)).toBeNull()
  })

  it('버킷 행을 펼치면 발주 항목 표가 뜨고, 원가 없는 버킷은 펼칠 것이 없다(펼침 단추 없음)', async () => {
    const user = userEvent.setup()
    renderRoute('/settlement')
    await user.click(await screen.findByTestId('bucket-row-s1'))
    expect(await screen.findByText('메인홀 대관료')).toBeTruthy()
    expect(within(screen.getByTestId('bucket-row-s1')).getByRole('button', { name: '베뉴 사용료' }).getAttribute('aria-expanded')).toBe('true')

    const s5 = screen.getByTestId('bucket-row-s5')
    expect(within(s5).queryByRole('button')).toBeNull()
    await user.click(s5)
    expect(screen.queryByTestId('bucket-panel-s5')).toBeNull()
  })

  it('부가세 포함 토글이 받은 금액 → 저장 금액을 미리 보여준다', async () => {
    const user = userEvent.setup()
    renderRoute('/settlement')
    await user.click(await screen.findByTestId('bucket-row-s1'))
    // PR-7: 칸마다 '입력' 버튼 대신 행 끝 ⋯ 메뉴
    await user.click((await screen.findAllByRole('button', { name: /^발주 항목 메뉴 / }))[0])
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '금액·상태 입력' }))

    const actual = await screen.findByLabelText('실집행')
    await user.clear(actual)
    await user.type(actual, '1320000')
    await user.click(screen.getByLabelText('부가세 포함 금액으로 입력'))

    const preview = await screen.findByTestId('vat-preview')
    expect(preview.textContent).toContain('받은 금액 1,320,000(포함)')
    expect(preview.textContent).toContain('저장 1,200,000')
  })
})

describe('S1 홈 — 정산 초과 (Phase 3.23 PR-2: 요약 칸 + 오늘 할 일 행)', () => {
  it('초과 버킷이 있으면 정산 확인 칸에 건수가, 목록에 버킷 이름 행이 뜬다 — 금액은 싣지 않는다', async () => {
    renderRoute('/home')
    const tile = await screen.findByTestId('home-tile-settlement')
    await waitFor(() => expect(Number(within(tile).getByText(/^\d+$/).textContent)).toBeGreaterThan(0))
    let row: HTMLElement | undefined
    await waitFor(() => {
      row = screen.getAllByTestId('today-row').find((r) => r.getAttribute('data-kind') === 'settlement')
      expect(row).toBeTruthy()
    })
    expect(row!.textContent).toMatch(/견적 초과/)
    expect(row!.textContent).not.toMatch(/\d{1,3}(,\d{3})+/)
    expect(within(row!).getByRole('link', { name: '정산보드에서 보기' }).getAttribute('href')).toBe('/settlement')
  })
})
