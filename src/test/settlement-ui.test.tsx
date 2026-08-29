/** @vitest-environment jsdom */
// S-10 화면 계약 (Phase 3.14b·3.14c) — 설계서 v2.2 §19·§10.
//
// 화면이 지켜야 하는 것:
//   · 원가 없는 버킷·마진 밖 버킷을 **숨기지 않고 회색 라벨로 남긴다**
//   · 견적 초과 버킷을 붉게 알리고, 홈(S1)에도 건수 카드를 띄운다
//   · 부가세 포함 토글이 "받은 금액 → 저장 금액"을 미리 보여준다
//   · 업로드는 게이트 뒤에 숨기지 않고 "Phase 4.7에서 열립니다"로 시점을 밝힌다
import { cleanup, screen, within } from '@testing-library/react'
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
    // 마진율 밴드는 참고선일 뿐 — 판정 문구를 쓰지 않는다
    expect(screen.getByText(/참고: 사내 실측 27.5~69.0%/)).toBeTruthy()
  })

  it('원가 없는 버킷과 마진 밖 버킷이 목록에 남고 라벨이 붙는다', async () => {
    renderRoute('/settlement')
    const s5 = await screen.findByTestId('bucket-row-s5')
    expect(within(s5).getByText('원가 없음')).toBeTruthy()

    const ld = screen.getByTestId('bucket-row-ld')
    expect(within(ld).getByText('리드젠(쇼업 보장)')).toBeTruthy()
    expect(within(ld).getByText('마진 계산 밖')).toBeTruthy()
  })

  it('견적 초과 버킷에 초과 표시가 붙고 검산 블록이 건수를 알린다', async () => {
    renderRoute('/settlement')
    const s2 = await screen.findByTestId('bucket-row-s2')
    expect(within(s2).getByText('견적 초과')).toBeTruthy()
    expect(screen.getByText(/견적 초과 버킷 \d+건/)).toBeTruthy()
    // 3.17b: 검산 결과는 카드 헤더 배지로 승격됐다(의미 동일 — 항등식이 성립함을 화면이 단언한다)
    expect(screen.getByText('항등식 성립')).toBeTruthy()
  })

  it('마진 구성 막대가 변동 + 고정 3분할로 그려진다', async () => {
    renderRoute('/settlement')
    expect(await screen.findByTestId('margin-seg-variable')).toBeTruthy()
    expect(screen.getByTestId('margin-seg-s5')).toBeTruthy()
    expect(screen.getByTestId('margin-seg-rc')).toBeTruthy()
  })

  it('업로드는 숨기지 않고 열리는 시점을 밝힌다', async () => {
    renderRoute('/settlement')
    const btn = await screen.findByRole('button', { name: /Phase 4.7에서 열립니다/ })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('버킷 행을 펼치면 발주 항목 표가 뜨고, 원가 없는 버킷에는 입력 안내가 뜬다', async () => {
    const user = userEvent.setup()
    renderRoute('/settlement')
    await user.click(await screen.findByTestId('bucket-row-s1'))
    expect(await screen.findByText('메인홀 대관료')).toBeTruthy()

    await user.click(screen.getByTestId('bucket-row-s5'))
    expect(await screen.findByText(/원가가 없는 버킷입니다/)).toBeTruthy()
  })

  it('부가세 포함 토글이 받은 금액 → 저장 금액을 미리 보여준다', async () => {
    const user = userEvent.setup()
    renderRoute('/settlement')
    await user.click(await screen.findByTestId('bucket-row-s1'))
    await user.click((await screen.findAllByRole('button', { name: '입력' }))[0])

    const actual = await screen.findByLabelText('실집행')
    await user.clear(actual)
    await user.type(actual, '1320000')
    await user.click(screen.getByLabelText('부가세 포함 금액으로 입력'))

    const preview = await screen.findByTestId('vat-preview')
    expect(preview.textContent).toContain('받은 금액 1,320,000(포함)')
    expect(preview.textContent).toContain('저장 1,200,000')
  })
})

describe('S1 홈 — 정산 초과 경보', () => {
  it('초과 버킷이 있으면 홈에 건수 카드가 뜬다', async () => {
    renderRoute('/')
    expect(await screen.findByText(/정산 · 견적 초과 버킷 \d+건/)).toBeTruthy()
  })
})
