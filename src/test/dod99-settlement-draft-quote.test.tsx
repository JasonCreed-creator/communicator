/** @vitest-environment jsdom */
// DoD 99 (Phase 6.12 · 실사용 2026-09-28 "견적을 올렸는데 정산보드에 반영 안 되는 이슈") — 원인 = 가져온 견적이 행사에 연결만 되고
// 확정되지 않아(위저드 ③ '정산보드 기준 견적' 기본 꺼짐) 정산보드 빈 상태의 '확정 견적 선택'에 아무것도 없었다.
//   ① 정산보드 빈 상태: 이 행사에 연결된 초안 견적 → 안내 + 'v1 확정하고 정산 시작'(확정 → 보드) · 고를 확정 견적이 없으면 셀렉트 대신 이 상자가 채운 버튼
//   ② 위저드 ③: 보드 있는 행사(prj-stc26) = 꺼짐 + 비활성 + 안내 · 보드 없는 행사 = 기본 켜짐 · 새 행사 = 켜짐 · 행사 없음 = 꺼짐 + 비활성
//      → 보드 없는 행사에 기본값 그대로 분배 = 견적 확정 + 보드 생성
//   ③ 위저드 완료(정산 기준 끔): '정산보드에서 확정하고 시작' → 정산보드 빈 상태의 초안 상자
//   ④ design(비 pm)에게는 상자 0 · 종료 행사 0
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { ProjectProvider } from '../context/ProjectContext'
import { FINAL_QUOTE_ID } from '../fixtures/quoteFixtures'
import { PROJECT_ID, PROJECT_ID_PARTNER } from '../fixtures/sampleProject'
import { syntheticQuoteC } from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import QuoteImportWizardPage from '../pages/QuoteImportWizardPage'
import SettlementPage from '../pages/SettlementPage'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'
import type { Quote, QuoteInput } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

const provider = getDataProvider() as MockProvider
const NO_BOARD_A = 'prj-rebuild27'
const NO_BOARD_B = 'prj-virtual-expo'

/** 행사 없는 새 견적(초안) — 픽스처 확정본의 입력을 그대로 복사한다(엔진 무접촉) */
async function newDraft(title: string): Promise<Quote> {
  const base = await provider.getQuote(FINAL_QUOTE_ID)
  const input: QuoteInput = { ...structuredClone(base.input), event_name: title }
  return provider.createQuote(input)
}

function renderWizard(path: string) {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
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
          <Route path="/quotes/import" element={<QuoteImportWizardPage />} />
          <Route path="/settlement" element={<SettlementPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

async function uploadC() {
  const user = userEvent.setup()
  const input = (await screen.findByLabelText('견적서 파일')) as HTMLInputElement
  await user.upload(input, new File([await syntheticQuoteC()], '가상견적_C형.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  await user.click(screen.getByRole('button', { name: '인식 시작' }))
  await screen.findByText('인식된 행사 정보')
  await user.click(screen.getByRole('button', { name: '이 매핑으로 확정' }))
  await screen.findByText('어디까지 반영할까요?')
  return user
}

beforeEach(() => {
  provider.switchUser('usr-pm')
  provider.setAppRole('sales')
})
afterEach(() => cleanup())

describe('DoD 99 ① 정산보드 빈 상태 — 연결된 초안 견적을 확정하고 정산 시작', () => {
  it('초안이 연결된 행사: 셀렉트 대신 안내 상자(채운 버튼 1) → 누르면 견적 확정 + 보드 생성 → 보드가 그려진다', async () => {
    const q = await newDraft('초안 정산 시험 A')
    await provider.linkQuoteToProject(q.id, PROJECT_ID_PARTNER)
    expect((await provider.getQuote(q.id)).is_final).toBe(false)
    expect(await provider.getSettlementBoard(PROJECT_ID_PARTNER)).toBeNull()

    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_PARTNER)
    renderRoute('/settlement')
    const box = await screen.findByTestId('settlement-draft-quote')
    expect(box.textContent).toContain('초안 정산 시험 A v1')
    expect(box.textContent).toContain('아직 확정되지 않았습니다')
    // 고를 확정 견적이 없으니 빈 셀렉트는 그리지 않고, 채운 버튼은 이 상자의 것 하나
    expect(screen.queryByLabelText('기준 견적')).toBeNull()
    const primaries = screen.getAllByRole('button').filter((b) => /\bbtn-(primary|accent)\b/.test(b.className))
    expect(primaries.map((b) => b.textContent)).toEqual(['v1 확정하고 정산 시작'])

    await userEvent.click(within(box).getByRole('button', { name: /확정하고 정산 시작/ }))
    await screen.findByTestId('settlement-kpis')
    await waitFor(async () => {
      expect((await provider.getQuote(q.id)).is_final).toBe(true)
      const board = await provider.getSettlementBoard(PROJECT_ID_PARTNER)
      expect(board?.board.quote_id).toBe(q.id)
    })
    expect(screen.queryByTestId('settlement-draft-quote')).toBeNull()
  })

  it('비 pm(design)에게는 상자가 없고 "PM이 기준 견적을 불러오면 시작됩니다" 그대로', async () => {
    const q = await newDraft('초안 정산 시험 D')
    await provider.linkQuoteToProject(q.id, NO_BOARD_B)
    provider.switchUser('usr-design')
    localStorage.setItem('communicator.currentProjectId', NO_BOARD_B)
    renderRoute('/settlement')
    await screen.findByText('PM이 기준 견적을 불러오면 시작됩니다.')
    expect(screen.queryByTestId('settlement-draft-quote')).toBeNull()
  })
})

describe('DoD 99 ② 위저드 ③ — 정산 기준 기본값', () => {
  it('보드 있는 행사 = 꺼짐·비활성·안내 / 보드 없는 행사 = 기본 켜짐 / 새 행사 = 켜짐 / 행사 없음 = 꺼짐 → 기본값 그대로 분배하면 확정 + 보드', async () => {
    renderWizard('/quotes/import')
    const user = await uploadC()
    const checkbox = () => screen.getByRole('checkbox', { name: /정산보드 기준 견적/ }) as HTMLInputElement

    // 기본 = 지금 보는 행사(prj-stc26 — 이미 정산보드가 있다)
    expect((screen.getByLabelText('연결할 행사') as HTMLSelectElement).value).toBe(PROJECT_ID)
    await waitFor(() => expect(checkbox().disabled).toBe(true))
    expect(checkbox().checked).toBe(false)
    expect(screen.getByTestId('import-settlement-hint').textContent).toContain('이미 정산보드가 있습니다')

    // 보드 없는 행사를 고르면 기본 켜짐
    await user.selectOptions(screen.getByLabelText('연결할 행사'), NO_BOARD_A)
    await waitFor(() => expect(checkbox().disabled).toBe(false))
    expect(checkbox().checked).toBe(true)
    expect(screen.getByTestId('import-settlement-hint').textContent).toContain('확정하고 정산 시작')

    // 새 행사 = 켜짐 · 행사 없음 = 꺼짐 + 비활성
    await user.click(screen.getByRole('radio', { name: /새 행사 만들기/ }))
    expect(checkbox().checked).toBe(true)
    expect(checkbox().disabled).toBe(false)
    await user.click(screen.getByRole('radio', { name: /행사 없이 견적만/ }))
    expect(checkbox().checked).toBe(false)
    expect(checkbox().disabled).toBe(true)

    // 보드 없는 행사에 기본값 그대로 분배 → 확정 + 보드
    await user.click(screen.getByRole('radio', { name: /기존 행사에 연결/ }))
    await user.selectOptions(screen.getByLabelText('연결할 행사'), NO_BOARD_A)
    await waitFor(() => expect(checkbox().checked).toBe(true))
    await user.click(screen.getByRole('button', { name: '분배 실행' }))
    const done = await screen.findByText('가져오기 완료')
    const card = done.closest('section')!
    expect(within(card).getByText(/정산 기준: 버킷 스냅숏 생성됨/)).toBeTruthy()
    expect(within(card).queryByRole('button', { name: '정산보드에서 확정하고 시작' })).toBeNull()
    await waitFor(async () => {
      const board = await provider.getSettlementBoard(NO_BOARD_A)
      expect(board).not.toBeNull()
      expect((await provider.getQuote(board!.board.quote_id!)).is_final).toBe(true)
    })
  }, 20_000)

  it('정산 기준을 끄고 분배하면 완료 화면이 이유와 함께 "정산보드에서 확정하고 시작"을 주고, 누르면 그 행사 정산보드의 초안 상자로 간다', async () => {
    renderWizard('/quotes/import')
    const user = await uploadC()
    await user.selectOptions(screen.getByLabelText('연결할 행사'), NO_BOARD_B)
    const checkbox = screen.getByRole('checkbox', { name: /정산보드 기준 견적/ }) as HTMLInputElement
    await waitFor(() => expect(checkbox.checked).toBe(true))
    await user.click(checkbox)
    expect(checkbox.checked).toBe(false)
    await user.click(screen.getByRole('button', { name: '분배 실행' }))
    const done = await screen.findByText('가져오기 완료')
    const card = done.closest('section')!
    expect(within(card).getByText(/정산 기준: 하지 않음/).textContent).toContain('확정하고 정산 시작')
    await user.click(within(card).getByRole('button', { name: '정산보드에서 확정하고 시작' }))
    const box = await screen.findByTestId('settlement-draft-quote')
    expect(box.textContent).toContain('가상 테크 서밋 2027 v1')
    expect(within(box).getByRole('button', { name: /확정하고 정산 시작/ })).toBeTruthy()
    expect(await mockProvider().getSettlementBoard(NO_BOARD_B)).toBeNull()
  }, 20_000)
})
