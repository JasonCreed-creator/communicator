/** @vitest-environment jsdom */
// 견적서 내보내기 2종(2026-09-10): Excel 내려받기 + 구글 스프레드시트 생성.
//  (a) 에디터 ④·목록에 두 버튼이 함께 있고, mock 공급자(로그인 없음)에서 시트 버튼은 안내 문구를 띄운다(무음 실패 금지)
//  (b) 실서버 모드에서는 provider가 만든 xlsx가 그대로 서버 함수로 가고, 결과 카드에 링크가 뜬다(훅 계약)
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthProvider } from '../context/AuthContext'
import type { AuthAdapter } from '../providers/auth'
import { useQuoteSpreadsheet } from '../components/quote/useQuoteSpreadsheet'
import { mockProvider, renderRoute } from './testUtils'

vi.mock('../modules/quote/export/createQuoteSpreadsheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/quote/export/createQuoteSpreadsheet')>()
  return {
    ...actual,
    createQuoteSpreadsheet: vi.fn(async (blob: Blob, fileName: string, token: string | null) => {
      if (!token) throw new actual.QuoteSpreadsheetError('forbidden', actual.GSHEET_NEEDS_SERVER_MSG)
      return { url: 'https://docs.google.com/spreadsheets/d/fake/edit', spreadsheet_id: 'fake', file_name: fileName.replace(/\.xlsx$/, ''), shared_with: 'sales@example.com', _size: blob.size }
    }),
  }
})

const provider = mockProvider()

afterEach(() => {
  cleanup()
  provider.setAppRole('sales')
})

describe('(a) 내보내기 버튼 2종 + mock 안내', () => {
  it('목록(S-2): Excel 내려받기·구글 시트로 만들기가 나란히 있고, mock에서 시트 버튼은 안내 문구를 띄운다', async () => {
    renderRoute('/quotes')
    await screen.findByRole('heading', { name: '견적' })
    const excel = await screen.findByRole('button', { name: 'Excel 내려받기' })
    const sheet = await screen.findByRole('button', { name: '구글 시트로 만들기' })
    expect(excel).toBeTruthy()
    await userEvent.click(sheet)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('실서버(로그인) 모드에서만')
    expect(alert.textContent).toContain('Excel로 내려받으세요')
    expect(screen.queryByTestId('gsheet-result')).toBeNull()
  })

  it('에디터 ④: 두 버튼이 있고 저장 전에는 둘 다 비활성, mock에서 시트 버튼은 안내 문구', async () => {
    const quotes = await provider.listQuotes()
    const q = quotes.find((x) => x.is_final) ?? quotes[0]
    renderRoute(`/quotes/${q.id}/edit?step=4`)
    const excel = await screen.findByRole('button', { name: /Excel 내려받기/ })
    const sheet = await screen.findByRole('button', { name: /구글 스프레드시트로 만들기/ })
    // 저장된 견적을 열었으므로 활성
    await waitFor(() => expect((excel as HTMLButtonElement).disabled).toBe(false))
    expect((sheet as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(sheet)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('실서버(로그인) 모드에서만')
  })
})

describe('(b) 실서버 모드 훅 계약', () => {
  const supabaseLike: AuthAdapter = {
    mode: 'supabase',
    allowedDomains: [],
    getUser: async () => ({ id: 'u1', email: 'sales@example.com' }),
    onChange: () => () => undefined,
    signInWithEmail: async () => null,
    signOut: async () => undefined,
    getAccessToken: async () => 'tok-123',
  }
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider adapter={supabaseLike}>{children}</AuthProvider>

  it('exportQuoteXlsx의 xlsx가 토큰과 함께 넘어가고 결과가 견적 id별로 보관된다', async () => {
    const { createQuoteSpreadsheet } = await import('../modules/quote/export/createQuoteSpreadsheet')
    const quotes = await provider.listQuotes()
    const q = quotes[0]
    const { result } = renderHook(() => useQuoteSpreadsheet(), { wrapper })
    expect(result.current.resultFor(q.id)).toBeNull()
    let out: Awaited<ReturnType<typeof result.current.create>> | null = null
    await act(async () => {
      out = await result.current.create(q.id, 'ko', '안내')
    })
    expect(out).toMatchObject({ url: 'https://docs.google.com/spreadsheets/d/fake/edit', shared_with: 'sales@example.com' })
    expect(result.current.resultFor(q.id)?.spreadsheet_id).toBe('fake')
    expect(result.current.resultFor('other')).toBeNull()
    const mocked = vi.mocked(createQuoteSpreadsheet)
    expect(mocked).toHaveBeenCalledTimes(1)
    const [blob, fileName, token] = mocked.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000) // 실제 ExcelJS 산출물
    expect(fileName.endsWith('.xlsx')).toBe(true)
    expect(token).toBe('tok-123')
  })

  it('mock 모드(AuthProvider 밖)에서는 서버를 부르지 않고 안내 문구로 거부한다', async () => {
    const { createQuoteSpreadsheet } = await import('../modules/quote/export/createQuoteSpreadsheet')
    const mocked = vi.mocked(createQuoteSpreadsheet)
    mocked.mockClear()
    const quotes = await provider.listQuotes()
    const { result } = renderHook(() => useQuoteSpreadsheet())
    await expect(result.current.create(quotes[0].id, 'ko', '안내 문구')).rejects.toMatchObject({ message: '안내 문구' })
    expect(mocked).not.toHaveBeenCalled()
  })
})
