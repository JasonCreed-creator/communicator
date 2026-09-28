/** @vitest-environment jsdom */
// DoD 98 (Phase 6.11 PR-G · 설계서 v2.21 §27.5) — 화면: S9 운영계획서 발행 줄 '마스터 시트 만들기'.
//   ① 단추는 발행 줄에(인쇄 제외 · 채운 버튼 아님) · 누르기 전 결과 0 · mock에서 누르면 사실 안내(만들지 않는다 · /api 요청 0)
//   ② 실서버 게이트웨이(가짜 클라이언트) = 누르면 '만드는 중…' → 결과 줄(파일 이름 · 새 탭 링크 · 링크 복사 · 탭 이름) · 클릭에만(자동 0)
//   ③ 서버 오류 = 조치 문구 그대로 한 줄(role=alert) · 결과 줄 0
//   ④ 채운 버튼은 여전히 '컨펌 발송' 하나 · 컨펌 발송·인쇄·16:9 장표 단추 그대로
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../lib/errors'
import type { MasterSheetClient } from '../lib/masterSheet/masterSheetClient'
import { MASTER_SHEET_MOCK_MESSAGE, setMasterSheetGateway } from '../lib/masterSheet/masterSheetGateway'
import type { MasterSheetResult } from '../lib/masterSheet/types'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  setMasterSheetGateway(null)
  mockProvider().switchUser('usr-pm')
  vi.restoreAllMocks()
})

function fakeClient(over: Partial<MasterSheetClient> = {}): MasterSheetClient {
  return {
    status: async () => ({ ready: true }),
    create: async () => ({ url: 'https://docs.google.com/spreadsheets/d/fake/edit', spreadsheet_id: 'fake', file_name: '가상_마스터시트_260928', tabs: ['개요'] }),
    ...over,
  }
}

async function openPlan() {
  renderRoute('/plan')
  await screen.findByRole('heading', { name: '운영계획서' })
  return screen.getByTestId('master-sheet-create') as HTMLButtonElement
}

describe('DoD 98 · ① 발행 줄 단추 · mock 사실 안내', () => {
  it('단추가 발행 줄에 있고(ghost · 인쇄 제외) 누르면 mock은 만들지 않고 사실 안내 · fetch 0', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const btn = await openPlan()
    expect(btn.textContent).toBe('마스터 시트 만들기')
    expect(btn.className).toContain('btn-ghost')
    expect(btn.className).toContain('print-hidden')
    expect(screen.queryByTestId('master-sheet-result')).toBeNull()
    expect(screen.queryByTestId('master-sheet-notice')).toBeNull()
    await userEvent.click(btn)
    expect((await screen.findByTestId('master-sheet-notice')).textContent).toBe(MASTER_SHEET_MOCK_MESSAGE)
    expect(screen.queryByTestId('master-sheet-result')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    // ④ 채운 버튼은 컨펌 발송 하나 그대로
    const gate = btn.closest('.ui-card')!
    const filled = within(gate as HTMLElement).getAllByRole('button').filter((b) => /btn-accent|btn-primary/.test(b.className))
    expect(filled.map((b) => b.textContent)).toEqual(['컨펌 발송'])
    expect(within(gate as HTMLElement).getByRole('button', { name: '인쇄 · PDF' })).toBeTruthy()
    expect(within(gate as HTMLElement).getByRole('link', { name: '16:9 장표' })).toBeTruthy()
  })
})

describe('DoD 98 · ② 실서버 — 만드는 중 → 결과 줄', () => {
  it('클릭에만 만든다 · 만드는 동안 단추 잠김 · 결과 = 파일 이름 · 새 탭 링크 · 링크 복사 · 탭 이름', async () => {
    let resolve!: (r: MasterSheetResult) => void
    const create = vi.fn(() => new Promise<MasterSheetResult>((r) => (resolve = r)))
    setMasterSheetGateway({ mode: 'server', client: fakeClient({ create }) })
    const btn = await openPlan()
    expect(create).not.toHaveBeenCalled()
    await userEvent.click(btn)
    expect(create).toHaveBeenCalledWith('prj-stc26')
    expect((screen.getByTestId('master-sheet-create') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('master-sheet-create').textContent).toBe('마스터 시트 만드는 중…')
    resolve({ url: 'https://docs.google.com/spreadsheets/d/abc123/edit', spreadsheet_id: 'abc123', file_name: '261020_가상고객_가상 컨퍼런스_마스터시트_260928', tabs: ['개요', 'WBS', 'R&R', '제작물', '운영', '등록', '견적·정산'] })
    const result = await screen.findByTestId('master-sheet-result')
    expect(result.textContent).toContain('마스터 시트가 만들어졌습니다')
    expect(result.textContent).toContain('261020_가상고객_가상 컨퍼런스_마스터시트_260928')
    expect(result.textContent).toContain('04_WBS·운영계획')
    expect(result.textContent).toContain('견적·정산')
    const open = within(result).getByRole('link', { name: '새 탭에서 열기 ↗' }) as HTMLAnchorElement
    expect(open.href).toBe('https://docs.google.com/spreadsheets/d/abc123/edit')
    expect(open.target).toBe('_blank')
    expect(open.rel).toContain('noopener')
    expect(within(result).getByRole('button', { name: '링크 복사' })).toBeTruthy()
    await waitFor(() => expect((screen.getByTestId('master-sheet-create') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByTestId('master-sheet-notice')).toBeNull()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('③ 서버 오류(조치 문구)는 그대로 한 줄 · 결과 줄 0 · 다시 누르면 재시도', async () => {
    const create = vi
      .fn<MasterSheetClient['create']>()
      .mockRejectedValueOnce(new ProviderError('validation', 'Google Sheets API가 이 구글 프로젝트에서 꺼져 있습니다 — 콘솔에서 켜세요: https://console.cloud.google.com/apis/library/sheets.googleapis.com'))
      .mockResolvedValueOnce({ url: 'https://docs.google.com/spreadsheets/d/ok/edit', spreadsheet_id: 'ok', file_name: '가상_마스터시트_260928', tabs: ['개요'] })
    setMasterSheetGateway({ mode: 'server', client: fakeClient({ create }) })
    const btn = await openPlan()
    await userEvent.click(btn)
    const alert = await screen.findByTestId('master-sheet-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('Google Sheets API가 이 구글 프로젝트에서 꺼져 있습니다')
    expect(screen.queryByTestId('master-sheet-result')).toBeNull()
    await userEvent.click(screen.getByTestId('master-sheet-create'))
    await screen.findByTestId('master-sheet-result')
    expect(screen.queryByTestId('master-sheet-error')).toBeNull()
    expect(create).toHaveBeenCalledTimes(2)
  })
})
