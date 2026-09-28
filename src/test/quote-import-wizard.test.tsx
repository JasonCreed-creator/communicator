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
  syntheticBudgetP,
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

    // ③ 분배 — 기본 = 지금 보는 행사(prj-stc26)에 연결(v16 §16.4) · 보드 시드까지 켜고 실행
    await screen.findByText('어디까지 반영할까요?')
    expect((screen.getByRole('radio', { name: /기존 행사에 연결/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('연결할 행사') as HTMLSelectElement).value).toBe('prj-stc26')
    await user.click(screen.getByRole('checkbox', { name: /보드 항목 시드/ }))
    await user.click(screen.getByRole('button', { name: '분배 실행' }))

    const done = await screen.findByText('가져오기 완료')
    expect(within(done.closest('section')!).getByText(/기존 행사에 연결됨 — /)).toBeTruthy()
    const quotes = await provider.listQuotes()
    expect(quotes.length).toBe(before.length + 1)
    const imported = quotes.find((q) => q.source === 'imported')!
    expect(imported.title).toBe('가상 커머스 서밋 2027')
    // 사람이 고친 매핑이 버킷 합산에 반영된다 (6. 현장 인력 4,500,000 + 8. 행사 기록 5,000,000)
    expect(imported.breakdown.s4).toBe(9_500_000)
    expect(imported.breakdown.s1).toBe(19_000_000)
    expect(imported.project_id).toBe('prj-stc26') // 새 행사가 생기지 않았다

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
    // v16 — 기본은 '기존 행사에 연결'(샘플 행사에는 이미 정산보드가 있어 정산 기준을 켤 수 없다) → 옛 흐름대로 새 행사를 만들어 기준으로 삼는다.
    // Phase 6.12 — 새 행사·보드 없는 행사에서는 '정산보드 기준 견적'이 기본 켜짐(누르면 꺼진다)
    const settlementBox = screen.getByRole('checkbox', { name: /정산보드 기준 견적/ }) as HTMLInputElement
    expect(settlementBox.checked).toBe(false)
    expect(settlementBox.disabled).toBe(true)
    await user.click(screen.getByRole('radio', { name: /새 행사 만들기/ }))
    expect((screen.getByRole('checkbox', { name: /정산보드 기준 견적/ }) as HTMLInputElement).checked).toBe(true)
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

describe('PDF·사진 (v2.18 §22.5 — DoD 89 화면 계약)', () => {
  it('파일 칸이 .pdf·사진을 받고, 고르면 AI 안내 + 버튼 이름 "AI로 읽기" · mock은 사실 안내(저장 0)', async () => {
    const before = await provider.listQuotes()
    renderAt('/quotes/import')
    const user = userEvent.setup()
    const input = (await screen.findByLabelText('견적서 파일')) as HTMLInputElement
    expect(input.accept).toContain('.pdf')
    expect(input.accept).toContain('.xlsx')
    expect(input.accept).toContain('image/png')
    expect(screen.getAllByText(/PDF·사진/).length).toBeGreaterThan(0) // 지원 서식 안내
    expect(screen.queryByTestId('import-ai-notice')).toBeNull()
    await user.upload(input, new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], '견적서.pdf', { type: 'application/pdf' }))
    expect(screen.getByTestId('import-ai-notice').textContent).toContain('AI(Claude)')
    const btn = screen.getByRole('button', { name: 'AI로 읽기' })
    await user.click(btn)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('실서버(로그인) 모드에서 AI가 읽습니다')
    expect(screen.getByLabelText('견적서 파일')).toBeTruthy() // 1단계 유지
    expect((await provider.listQuotes()).length).toBe(before.length)
  })
})

describe('P형 예산 워크북 (v2.22.1 §22.1 — Phase 6.19)', () => {
  it("지출 시트를 섹션으로 읽고 배지 'P형(예산)' · 수입 표 3건은 별도 카드로 기록만(견적 총액은 지출 합 · 부가세 별도)", async () => {
    renderAt('/quotes/import')
    await upload(await syntheticBudgetP(), '가상_워킹버짓.xlsx')
    await screen.findByText(/P형\(예산\) · 가상_워킹버짓\.xlsx/, {}, { timeout: 15_000 })
    const revenue = screen.getByTestId('import-revenue')
    expect(within(revenue).getByText('가상파트너A · DIAMOND')).toBeTruthy()
    expect(within(revenue).getByText(/합계 152,000,000/)).toBeTruthy()
    // 총액 = 지출 합(VAT 별도) · 섹션 6 · 매핑 표에 구분 이름
    expect(screen.getByText(/43,905,400/)).toBeTruthy()
    expect(screen.getByText(/부가세 별도/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'A. 베뉴 버킷' })).toBeTruthy()
    expect(screen.getByText(/예산 워크북\(지출 표\)을 읽었습니다/)).toBeTruthy()
  }, 30_000)
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
