/** @vitest-environment jsdom */
// DoD 34 (v2.4 §22·§10.1 화면 D) — 견적서 가져오기 위저드 흐름:
// 업로드 → 인식 결과 확인(애매 항목 수정) → 분배 → 목록의 '임포트' 배지.
// 업로드 입력은 가상 픽스처(테스트 실행 시점에 만드는 워크북)를 쓰고 실제 파서를 그대로 탄다(R-Q4).
// 라우터는 이 파일 안에서 최소 구성으로 만든다(공용 testUtils를 건드리지 않기 위해).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { ProjectProvider } from '../context/ProjectContext'
import {
  syntheticQuoteA,
  syntheticQuoteB,
  syntheticQuoteC,
} from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import QuoteImportWizardPage from '../pages/QuoteImportWizardPage'
import QuotesPage from '../pages/QuotesPage'
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
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/quotes/import" element={<QuoteImportWizardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

async function upload(buffer: ArrayBuffer, name: string) {
  const user = userEvent.setup()
  const input = (await screen.findByLabelText('견적서 파일')) as HTMLInputElement
  await user.upload(input, new File([buffer], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  await user.click(screen.getByRole('button', { name: '인식 시작' }))
  return user
}

beforeEach(() => {
  provider.setAppRole('sales')
})

afterEach(() => {
  cleanup()
})

describe('견적서 가져오기 위저드 — A형 전 흐름', () => {
  it('업로드 → 인식 결과 → 매핑 수정 → 확정 → 분배 → 목록 배지', async () => {
    const before = await provider.listQuotes()
    renderAt('/quotes/import')
    await screen.findByRole('heading', { name: '견적서 가져오기' })
    const user = await upload(await syntheticQuoteA(), '가상견적_A형.xlsx')

    // ② 인식 결과 — KPI 4
    await screen.findByText('인식된 행사 정보')
    expect(screen.getByText('8개')).toBeTruthy()
    expect(screen.getByText('21건')).toBeTruthy()
    expect(screen.getByText('전부 일치')).toBeTruthy()
    expect(screen.getByText('1건')).toBeTruthy() // 확인 필요
    expect(screen.getByText(/A형 · 가상견적_A형.xlsx/)).toBeTruthy()
    expect(screen.getByText('가상 커머스 서밋 2027')).toBeTruthy()

    // R-Q1 — 확정 전에는 quotes가 생기지 않는다
    expect((await provider.listQuotes()).length).toBe(before.length)

    // 애매 항목(저신뢰)만 '확인 필요'로 표시되고 드롭다운으로 고칠 수 있다
    const mappingTable = screen.getByRole('table')
    expect(within(mappingTable).getAllByText('확인 필요')).toHaveLength(1)
    const lowSelect = screen.getByLabelText('8. 행사 기록 · 홍보 버킷') as HTMLSelectElement
    expect(lowSelect.value).toBe('custom')
    await user.selectOptions(lowSelect, 's4')

    await user.click(screen.getByRole('button', { name: '이 매핑으로 확정' }))

    // ③ 분배 — 보드 시드까지 켜고 실행
    await screen.findByText('어디까지 반영할까요?')
    await user.click(screen.getByRole('checkbox', { name: /보드 항목 시드/ }))
    await user.click(screen.getByRole('button', { name: '분배 실행' }))

    await screen.findByText('가져오기 완료')
    const quotes = await provider.listQuotes()
    expect(quotes.length).toBe(before.length + 1)
    const imported = quotes.find((q) => q.source === 'imported')!
    expect(imported.title).toBe('가상 커머스 서밋 2027')
    // 사람이 고친 매핑이 버킷 합산에 반영된다 (6. 현장 인력 4,500,000 + 8. 행사 기록 5,000,000)
    expect(imported.breakdown.s4).toBe(9_500_000)
    expect(imported.breakdown.s1).toBe(19_000_000)
    expect(imported.project_id).not.toBeNull()

    const seeded = (await provider.listDeliverables(imported.project_id!)).filter((d) => d.category === '견적 임포트')
    expect(seeded.length).toBeGreaterThan(0)
    expect(JSON.stringify(seeded)).not.toContain('amount')

    // 목록의 '임포트' 배지
    cleanup()
    renderAt('/quotes')
    await screen.findByRole('heading', { name: '견적' })
    const badges = await screen.findAllByText('임포트')
    expect(badges.length).toBeGreaterThan(0)
  }, 20_000)
})

describe('인식 실패 필드·검산 경고 표시 (B형)', () => {
  it('빈 헤더 필드는 "인식 실패 — 확인 필요"로, 총액 미포함 경고는 확인할 점에 뜬다', async () => {
    renderAt('/quotes/import')
    await upload(await syntheticQuoteB(), '가상견적_B형.xlsx')

    await screen.findByText('인식된 행사 정보')
    // 고객명·일시 2필드가 비어 있다
    expect(screen.getAllByText('인식 실패 — 확인 필요')).toHaveLength(2)
    const notice = (await screen.findByText('확인할 점')).closest('section')!
    expect(within(notice).getByText(/'총액 미포함' 표기 항목 1건/)).toBeTruthy()
    // 검산은 전부 통과 — KPI는 '전부 일치'
    expect(screen.getByText('전부 일치')).toBeTruthy()
    // 5-1 소수 섹션이 매핑 표에 그대로 나온다
    expect(screen.getByLabelText('5-1. 선택 옵션 (총액 미포함) 버킷')).toBeTruthy()
  }, 20_000)
})

describe('정산 기준 분배 (C형) — 확정 동반', () => {
  it('"확정하고 기준으로 설정"을 켜면 견적이 확정되고 정산보드가 생긴다', async () => {
    renderAt('/quotes/import')
    const user = await upload(await syntheticQuoteC(), '가상견적_C형.xlsx')
    await screen.findByText('인식된 행사 정보')
    await user.click(screen.getByRole('button', { name: '이 매핑으로 확정' }))

    await screen.findByText('어디까지 반영할까요?')
    await user.click(screen.getByRole('checkbox', { name: /정산보드 기준 견적/ }))
    await user.click(screen.getByRole('button', { name: '분배 실행' }))

    const done = await screen.findByText('가져오기 완료')
    const card = done.closest('section')!
    expect(within(card).getByText(/정산 기준: 버킷 스냅숏 생성됨/)).toBeTruthy()

    await waitFor(async () => {
      const quotes = await provider.listQuotes()
      const c = quotes.find((q) => q.title === '가상 테크 서밋 2027')!
      expect(c.is_final).toBe(true)
      const board = await provider.getSettlementBoard(c.project_id!)
      expect(board).not.toBeNull()
    })
  }, 20_000)
})

describe('읽지 못하는 파일', () => {
  it('xlsx가 아니면 1단계에 머물며 오류를 알리고 아무것도 저장하지 않는다', async () => {
    const before = await provider.listQuotes()
    renderAt('/quotes/import')
    // accept 필터를 끄고 "잘못된 파일이 들어왔을 때"를 재현한다
    const user = userEvent.setup({ applyAccept: false })
    const input = (await screen.findByLabelText('견적서 파일')) as HTMLInputElement
    await user.upload(input, new File(['just,a,csv'], '견적.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: '인식 시작' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('읽지 못했습니다')
    expect(screen.getByLabelText('견적서 파일')).toBeTruthy() // 1단계 유지
    expect((await provider.listQuotes()).length).toBe(before.length)
  })
})

describe('접근 권한 (§10 · DoD 25 관례 재사용)', () => {
  it('staff는 위저드에서도 403 화면을 본다', async () => {
    provider.setAppRole('staff')
    renderAt('/quotes/import')
    await screen.findByText('403')
    await screen.findByText('견적 메뉴는 영업·관리자 권한이 필요합니다.')
    expect(screen.queryByLabelText('견적서 파일')).toBeNull()
  })
})
