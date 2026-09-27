/** @vitest-environment jsdom */
// DoD 92 (Phase 6.7 · 설계서 v2.18 §22.6) — 온보딩 견적서 첨부 → 견적 가져오기 다리(화면).
//   ① 위저드 ①: 첨부(drive)가 있으면 카드 + '이 파일로 읽기' — mock은 사실 안내(가져오기 0 · 1단계 유지)
//   ② 링크 첨부 = 내려받아 올리라는 안내 + '링크 열기' ③ 첨부 없음 = 카드 없음
//   ④ 실서버: '이 파일로 읽기' → 불러온 파일 이름 → '인식 시작' → 인식 결과(파서 그대로) · '다른 파일 고르기'로 되돌림
//   ⑤ 정산보드 빈 상태: 첨부가 있고 이 행사의 확정 견적이 없으면 '견적 가져오기로' 안내 → 누르면 위저드(카드 보임)
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_PARTNER } from '../fixtures/sampleProject'
import type { DriveClient } from '../lib/drive/driveClient'
import { setDriveGateway } from '../lib/drive/driveGateway'
import { syntheticQuoteA } from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import { QUOTE_IMPORT_ATTACHMENT_LINK_MESSAGE, QUOTE_IMPORT_ATTACHMENT_MOCK_MESSAGE } from '../pages/QuoteImportWizardPage'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'
import { renderRoute } from './testUtils'

const provider = getDataProvider() as MockProvider
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DRIVE_ATT = {
  kind: 'drive' as const,
  url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  file_name: '가상 견적서.xlsx',
  drive_file_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  source: 'upload' as const,
  added_at: '2026-09-27T00:00:00.000Z',
}
const LINK_ATT = {
  kind: 'link' as const,
  url: 'https://docs.google.com/spreadsheets/d/abc/edit',
  file_name: null,
  drive_file_id: null,
  source: 'link' as const,
  added_at: '2026-09-27T00:00:00.000Z',
}

/** 실서버 흉내 — 서버가 준 파일(가상 A형 워크북)을 File로 돌려주는 Drive 클라이언트 */
function serverGateway(calls: string[]) {
  const client = {
    async projectAttachmentFile(projectId: string) {
      calls.push(projectId)
      return { file: new File([await syntheticQuoteA()], DRIVE_ATT.file_name, { type: XLSX }), file_name: DRIVE_ATT.file_name, kind: 'drive' as const }
    },
  } as unknown as DriveClient
  setDriveGateway({ mode: 'server', client })
}

beforeEach(() => {
  provider.switchUser('usr-pm')
  provider.setAppRole('sales')
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
})

afterEach(async () => {
  cleanup()
  setDriveGateway(null)
  provider.switchUser('usr-pm')
  await provider.updateProject(PROJECT_ID, { quote_attachment: null })
  await provider.updateProject(PROJECT_ID_PARTNER, { quote_attachment: null })
})

describe('DoD 92 ① 위저드 ① — 첨부 카드(mock)', () => {
  it('drive 첨부: 카드에 파일 이름·01_견적 + "이 파일로 읽기" → 데모는 사실 안내, 가져오기 0 · 1단계 유지', async () => {
    await provider.updateProject(PROJECT_ID, { quote_attachment: DRIVE_ATT })
    const before = (await provider.listQuotes()).length
    renderRoute('/quotes/import')
    const card = await screen.findByTestId('import-attachment-card')
    expect(card.textContent).toContain('온보딩에서 첨부한 견적서')
    expect(card.textContent).toContain('가상 견적서.xlsx')
    expect(card.textContent).toContain('01_견적')
    // 파일 칸은 '또는' — 첨부를 읽는 길이 먼저다
    expect(screen.getByText('또는 견적서 파일 올리기 (.xlsx · .pdf · 사진)')).toBeTruthy()
    expect((screen.getByRole('button', { name: '인식 시작' }) as HTMLButtonElement).disabled).toBe(true)

    await userEvent.click(within(card).getByRole('button', { name: '이 파일로 읽기' }))
    expect((await screen.findByRole('alert')).textContent).toBe(QUOTE_IMPORT_ATTACHMENT_MOCK_MESSAGE)
    expect(screen.getByLabelText('견적서 파일')).toBeTruthy() // 1단계 유지
    expect((screen.getByRole('button', { name: '인식 시작' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId('import-attachment-loaded')).toBeNull()
    expect((await provider.listQuotes()).length).toBe(before) // R-Q1 — 아무것도 만들지 않는다
  })

  it('② 링크 첨부: 내려받아 올리라는 안내 + "링크 열기"(새 탭) · 읽기 단추 없음', async () => {
    await provider.updateProject(PROJECT_ID, { quote_attachment: LINK_ATT })
    renderRoute('/quotes/import')
    const card = await screen.findByTestId('import-attachment-card')
    expect(card.textContent).toContain('구글 시트')
    expect(card.textContent).toContain(QUOTE_IMPORT_ATTACHMENT_LINK_MESSAGE)
    const open = within(card).getByRole('link', { name: '링크 열기' }) as HTMLAnchorElement
    expect(open.href).toBe(LINK_ATT.url)
    expect(open.target).toBe('_blank')
    expect(within(card).queryByRole('button', { name: '이 파일로 읽기' })).toBeNull()
  })

  it('③ 첨부가 없으면 카드가 없고 파일 칸 이름도 그대로', async () => {
    renderRoute('/quotes/import')
    await screen.findByLabelText('견적서 파일')
    expect(screen.queryByTestId('import-attachment-card')).toBeNull()
    expect(screen.getByText('견적서 파일 (.xlsx · .pdf · 사진)')).toBeTruthy()
  })
})

describe('DoD 92 ④ 실서버 — 첨부 파일로 인식', () => {
  it('"이 파일로 읽기" → 불러온 파일 이름 → "인식 시작" → 인식 결과(A형 · 같은 파서) · "다른 파일 고르기"는 되돌린다', async () => {
    await provider.updateProject(PROJECT_ID, { quote_attachment: DRIVE_ATT })
    const calls: string[] = []
    serverGateway(calls)
    renderRoute('/quotes/import')
    const card = await screen.findByTestId('import-attachment-card')
    await userEvent.click(within(card).getByRole('button', { name: '이 파일로 읽기' }))
    const loaded = await screen.findByTestId('import-attachment-loaded')
    expect(loaded.textContent).toContain('가상 견적서.xlsx')
    expect(calls).toEqual([PROJECT_ID])
    expect(screen.queryByRole('alert')).toBeNull()
    const start = screen.getByRole('button', { name: '인식 시작' }) as HTMLButtonElement
    expect(start.disabled).toBe(false)

    // 되돌리기 — 파일이 비고 단추가 돌아온다
    await userEvent.click(within(loaded).getByRole('button', { name: '다른 파일 고르기' }))
    expect(screen.queryByTestId('import-attachment-loaded')).toBeNull()
    expect((screen.getByRole('button', { name: '인식 시작' }) as HTMLButtonElement).disabled).toBe(true)

    // 다시 불러와 인식 — 파서가 그대로 돈다(가상 A형: 섹션 8 · 항목 21)
    await userEvent.click(within(card).getByRole('button', { name: '이 파일로 읽기' }))
    await screen.findByTestId('import-attachment-loaded')
    await userEvent.click(screen.getByRole('button', { name: '인식 시작' }))
    await screen.findByText('인식된 행사 정보')
    expect(screen.getByText('8개')).toBeTruthy()
    expect(screen.getByText('21건')).toBeTruthy()
    expect(screen.getByText(/A형 · 가상 견적서.xlsx/)).toBeTruthy()
  })

  it('서버가 파일을 못 주면(링크 첨부·사라진 파일) 사실 안내 + 1단계 유지', async () => {
    await provider.updateProject(PROJECT_ID, { quote_attachment: DRIVE_ATT })
    setDriveGateway({
      mode: 'server',
      client: { projectAttachmentFile: async () => ({ file: null, file_name: null, kind: null }) } as unknown as DriveClient,
    })
    renderRoute('/quotes/import')
    await userEvent.click(within(await screen.findByTestId('import-attachment-card')).getByRole('button', { name: '이 파일로 읽기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('첨부한 견적서 파일을 찾지 못했습니다')
    expect(screen.getByLabelText('견적서 파일')).toBeTruthy()
  })
})

describe('DoD 92 ⑤ 정산보드 빈 상태 → 견적 가져오기', () => {
  it('첨부가 있고 이 행사의 확정 견적이 없으면 안내 + "견적 가져오기로" → 위저드에 카드가 보인다 · 첨부 없으면 안내 없음', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_PARTNER)
    renderRoute('/settlement')
    await screen.findByLabelText('기준 견적')
    expect(screen.queryByTestId('settlement-attachment-note')).toBeNull()
    cleanup()

    await provider.updateProject(PROJECT_ID_PARTNER, { quote_attachment: DRIVE_ATT })
    renderRoute('/settlement')
    const note = await screen.findByTestId('settlement-attachment-note')
    expect(note.textContent).toContain('가상 견적서.xlsx')
    expect(note.textContent).toContain('행사 폴더에 있습니다')
    const link = within(note).getByRole('link', { name: '견적 가져오기로' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/quotes/import')
    await userEvent.click(link)
    await screen.findByRole('heading', { name: '견적서 가져오기' })
    await waitFor(() => expect(screen.getByTestId('import-attachment-card').textContent).toContain('가상 견적서.xlsx'))
  })

  it('이 행사에 확정 견적이 이미 있으면(샘플 행사) 안내를 띄우지 않는다 — 보드가 있으면 빈 상태 자체가 없다', async () => {
    await provider.updateProject(PROJECT_ID, { quote_attachment: DRIVE_ATT })
    renderRoute('/settlement')
    await screen.findByTestId('settlement-kpis')
    expect(screen.queryByTestId('settlement-attachment-note')).toBeNull()
  })
})
