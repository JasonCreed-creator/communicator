/** @vitest-environment jsdom */
// DoD 62 (Phase 5 · 설계서 v2.9 §7.2 · 사용자 지시 2026-09-24) — 업로드 3경로 화면 계약.
//   ① 끌어놓기·파일 선택·폴더 선택 → 목록(이름순) → 파일마다 버전 1개 ② Drive 링크로 등록(검증·중복 409)
//   ③ 링크 등록 버전은 발주처 지면에 Drive 주소로 나가지 않는다(§7.4 — mock은 자리표시)
//   ④ 행사 설정 ③ Drive 카드(실서버 모드 — 가짜 게이트웨이): 연결하기 · 행사 폴더 만들기 · 기존 폴더 지정 · OAuth 복귀 문구
//   ⑤ 홈 미등록 인박스 'Drive 지금 확인'
// 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 이어진다(testUtils 주석).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { DriveClient, DriveStatus } from '../lib/drive/driveClient'
import { setDriveGateway, setDriveNavigator } from '../lib/drive/driveGateway'
import { resetDriveStatusCache } from '../lib/drive/useDriveStatus'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)
afterAll(() => {
  setDriveGateway(null)
  setDriveNavigator(null)
})

const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'

describe('DoD 62 · ① 끌어놓기·파일 선택·폴더 선택 (dlv-003 무대 백월 배너, draft)', () => {
  it('끌어놓기 영역 · 파일 선택 · 폴더 선택(webkitdirectory) · 저장 위치 안내(mock)가 보인다', async () => {
    renderRoute('/items/dlv-003')
    const zone = await screen.findByTestId('upload-dropzone')
    expect(zone.textContent).toContain('파일이나 폴더를 여기로 끌어놓으세요')
    const folderInput = within(zone).getByLabelText('폴더 선택') as HTMLInputElement
    expect(folderInput.hasAttribute('webkitdirectory')).toBe(true)
    expect(folderInput.multiple).toBe(true)
    expect((screen.getByLabelText(/파일/) as HTMLInputElement).multiple).toBe(true)
    expect(zone.textContent).toContain('데모(mock) 모드')
  })

  it('여러 파일 → 이름순 목록 + 안내 → 업로드하면 파일마다 새 버전(이름순으로 올린다)', async () => {
    const spy = vi.spyOn(mockProvider(), 'uploadVersion')
    renderRoute('/items/dlv-003')
    await screen.findByTestId('upload-dropzone')
    await userEvent.upload(screen.getByLabelText(/파일/) as HTMLInputElement, [
      new File(['b'], '시안10.pdf', { type: 'application/pdf' }),
      new File(['a'], '시안2.pdf', { type: 'application/pdf' }),
    ])
    const queue = await screen.findByTestId('upload-queue')
    const rows = within(queue).getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(rows[0]).toContain('시안2.pdf')
    expect(rows[1]).toContain('시안10.pdf')
    expect(queue.textContent).toContain('2개를 이름순으로')

    await userEvent.click(screen.getByRole('button', { name: '업로드' }))
    expect(await screen.findByText('새 버전 2개를 올렸습니다.')).toBeTruthy()
    expect(spy.mock.calls.map(([, input]) => input.file_name)).toEqual(['시안2.pdf', '시안10.pdf'])
    expect(spy.mock.calls.every(([, input]) => typeof input.onProgress === 'function')).toBe(true)
    const d = await mockProvider().getDeliverable('dlv-003')
    expect(d.versions.map((v) => v.version_no).sort()).toEqual([1, 2])
    expect(screen.queryByTestId('upload-queue')).toBeNull()
    spy.mockRestore()
  })

  it('끌어놓은 파일이 목록에 담기고 "빼기"로 뺄 수 있다', async () => {
    renderRoute('/items/dlv-003')
    const zone = await screen.findByTestId('upload-dropzone')
    fireEvent.dragEnter(zone)
    expect(zone.textContent).toContain('여기에 놓으면 목록에 담깁니다')
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['z'], '최종본.png', { type: 'image/png' })], items: [] } })
    const queue = await screen.findByTestId('upload-queue')
    expect(queue.textContent).toContain('최종본.png')
    await userEvent.click(within(queue).getByRole('button', { name: '최종본.png 빼기' }))
    expect(screen.queryByTestId('upload-queue')).toBeNull()
  })

  it('파일 없이 업로드를 누르면 안내(무음 실패 금지)', async () => {
    renderRoute('/items/dlv-003')
    await screen.findByTestId('upload-dropzone')
    await userEvent.click(screen.getByRole('button', { name: '업로드' }))
    expect(await screen.findByText('파일을 선택하세요.')).toBeTruthy()
  })
})

describe('DoD 62 · ② Drive 링크로 등록', () => {
  it('링크 아님·폴더 링크는 입력 자리에서 바로 안내하고 버튼을 잠근다', async () => {
    renderRoute('/items/dlv-003')
    await screen.findByTestId('upload-dropzone')
    await userEvent.click(screen.getByRole('button', { name: 'Drive 링크로 등록' }))
    const input = screen.getByLabelText('Drive 링크')
    await userEvent.type(input, 'hello')
    expect(screen.getByText(/구글 드라이브 파일 링크가 아닙니다/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '링크 등록' })).toHaveProperty('disabled', true)
    await userEvent.clear(input)
    await userEvent.type(input, `https://drive.google.com/drive/folders/${DRIVE_ID}`)
    expect(screen.getByText(/폴더 링크입니다/)).toBeTruthy()
  })

  it('파일 링크 + 표시 이름 → 새 버전(이름 = 표시 이름) · 보기 링크는 Drive 새 탭 · 같은 파일 재등록은 409 문구', async () => {
    renderRoute('/items/dlv-003')
    await screen.findByTestId('upload-dropzone')
    await userEvent.click(screen.getByRole('button', { name: 'Drive 링크로 등록' }))
    await userEvent.type(screen.getByLabelText('Drive 링크'), `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`)
    await userEvent.type(screen.getByLabelText('표시 이름(선택)'), '백월_최종.pdf')
    await userEvent.click(screen.getByRole('button', { name: '링크 등록' }))
    expect(await screen.findByText('Drive 파일을 새 버전으로 등록했습니다.')).toBeTruthy()

    const d = await mockProvider().getDeliverable('dlv-003')
    const linked = d.versions.find((v) => v.drive_file_id === DRIVE_ID)!
    expect(linked).toMatchObject({ version_no: 3, file_name: '백월_최종.pdf', note: 'Drive 링크로 등록' })
    expect(await mockProvider().getFileUrl(linked.id)).toBe(`https://drive.google.com/file/d/${DRIVE_ID}/view`)

    await userEvent.type(screen.getByLabelText('Drive 링크'), `https://drive.google.com/open?id=${DRIVE_ID}`)
    await userEvent.click(screen.getByRole('button', { name: '링크 등록' }))
    expect(await screen.findByText('이미 이 항목에 등록된 파일입니다.')).toBeTruthy()
  })
})

describe('DoD 62 · ③ 발주처 지면에는 Drive 주소를 싣지 않는다 (§7.4)', () => {
  it('링크 등록 버전을 컨펌 발송해도 /c 미리보기는 자리표시(data:)이고 drive.google.com이 아니다', async () => {
    const p = mockProvider()
    const d = await p.getDeliverable('dlv-003')
    const linked = d.versions.find((v) => v.drive_file_id === DRIVE_ID)!
    await p.transitionStatus('dlv-003', 'internal_review')
    await p.requestApproval('dlv-003', { version_id: linked.id })
    renderRoute('/c/demo')
    const card = (await screen.findByText('무대 백월 배너')).closest('article')!
    const html = card.innerHTML
    expect(html).not.toContain('drive.google.com')
    const img = card.querySelector('img')
    if (img) expect(img.getAttribute('src')?.startsWith('data:')).toBe(true)
  })
})

// ── 실서버 모드 화면(가짜 게이트웨이 — provider는 mock 그대로) ─────────────────────
function fakeClient(status: Partial<DriveStatus>) {
  const base: DriveStatus = {
    configured: true,
    connected: false,
    mode: 'oauth',
    token_source: null,
    account_email: null,
    connected_at: null,
    last_error: null,
    last_error_at: null,
    root_folder_id: DRIVE_ID,
    root_url: `https://drive.google.com/drive/folders/${DRIVE_ID}`,
    can_connect: true,
    redirect_uri: 'https://app.example.com/api/drive',
    max_upload_mb: 2048,
    chunk_bytes: 4 * 1024 * 1024,
  }
  const calls: string[] = []
  const client = {
    status: vi.fn(async () => ({ ...base, ...status })),
    oauthStart: vi.fn(async () => {
      calls.push('oauthStart')
      return { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', redirect_uri: base.redirect_uri! }
    }),
    ensureTree: vi.fn(async () => ({ folder_id: 'EVENT_FOLDER_ID_0000000000000001', folder_url: 'u', created: true })),
    adoptFolder: vi.fn(async () => ({ folder_id: DRIVE_ID, folder_url: 'u', created: false })),
    disconnect: vi.fn(async () => ({ disconnected: true as const })),
    scan: vi.fn(async () => ({ added: 2, removed: 1, finalized: 0, failed: 0, scanned: 5 })),
  }
  return { client: client as unknown as DriveClient, raw: client, calls }
}

describe('DoD 62 · ④ 행사 설정 ③ Drive 카드 (실서버 모드)', () => {
  it('미연결 → "Drive 연결하기"가 동의 화면으로 보낸다(서버가 admin 여부를 정한다)', async () => {
    const fake = fakeClient({ connected: false, can_connect: true })
    setDriveGateway({ mode: 'server', client: fake.client })
    resetDriveStatusCache()
    const went: string[] = []
    setDriveNavigator((url) => went.push(url))
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(screen.getByRole('button', { name: '③ 유형·연동' }))
    const card = await screen.findByTestId('drive-card')
    await within(card).findByRole('button', { name: 'Drive 연결하기' })
    // 상태 칩은 카드 헤더(action 슬롯)에 있다
    expect(card.closest('.ui-card')!.textContent).toContain('미연결')
    await userEvent.click(within(card).getByRole('button', { name: 'Drive 연결하기' }))
    await waitFor(() => expect(went).toEqual(['https://accounts.google.com/o/oauth2/v2/auth?x=1']))
  })

  it('연결됨 + 행사 폴더 없음 → pm이 "행사 폴더 만들기" · 기존 폴더 지정은 폴더 링크만', async () => {
    const fake = fakeClient({ connected: true, token_source: 'vault', account_email: 'owner@company.example' })
    setDriveGateway({ mode: 'server', client: fake.client })
    resetDriveStatusCache()
    // 픽스처 행사의 폴더 id는 자리표시('drv-root-…')라 실제 폴더로 치지 않는다 → "만들기"가 보여야 한다
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(screen.getByRole('button', { name: '③ 유형·연동' }))
    const card = await screen.findByTestId('drive-card')
    await within(card).findByText('owner@company.example')
    await userEvent.click(within(card).getByRole('button', { name: '행사 폴더 만들기' }))
    await waitFor(() => expect(fake.raw.ensureTree).toHaveBeenCalledWith('prj-stc26'))
    expect(await within(card).findByText('행사 폴더를 만들었습니다.')).toBeTruthy()

    const adoptInput = within(card).getByPlaceholderText('https://drive.google.com/drive/folders/…')
    await userEvent.type(adoptInput, `https://drive.google.com/file/d/${DRIVE_ID}/view`)
    expect(within(card).getByText(/폴더 링크를 붙여 주세요/)).toBeTruthy()
    expect(within(card).getByRole('button', { name: '지정' })).toHaveProperty('disabled', true)
    await userEvent.clear(adoptInput)
    await userEvent.type(adoptInput, `https://drive.google.com/drive/folders/${DRIVE_ID}`)
    await userEvent.click(within(card).getByRole('button', { name: '지정' }))
    await waitFor(() => expect(fake.raw.adoptFolder).toHaveBeenCalledWith('prj-stc26', `https://drive.google.com/drive/folders/${DRIVE_ID}`))
  })

  it('OAuth 복귀(/settings?drive=connected) → ③ 탭이 열리고 결과 문구 · 주소창에서 걷어 냄', async () => {
    const fake = fakeClient({ connected: true, token_source: 'vault' })
    setDriveGateway({ mode: 'server', client: fake.client })
    resetDriveStatusCache()
    window.history.pushState({}, '', '/settings?drive=connected')
    renderRoute('/settings')
    expect(await screen.findByText(/Drive가 연결됐습니다/)).toBeTruthy()
    expect(window.location.search).toBe('')
  })
})

describe('DoD 62 · ⑤ 홈 미등록 인박스 — Drive 지금 확인', () => {
  it('실서버 + 연결됨이면 버튼이 있고, 누르면 스캔 결과를 적는다', async () => {
    const fake = fakeClient({ connected: true, token_source: 'vault' })
    setDriveGateway({ mode: 'server', client: fake.client })
    resetDriveStatusCache()
    renderRoute('/home')
    const button = await screen.findByRole('button', { name: 'Drive 지금 확인' })
    await userEvent.click(button)
    expect(await screen.findByText('Drive 확인 — 새 파일 2건 · 사라진 파일 1건 정리')).toBeTruthy()
    expect(fake.raw.scan).toHaveBeenCalledWith('prj-stc26')
  })

  it('mock 모드에는 버튼이 없다(픽스처 인박스)', async () => {
    setDriveGateway({ mode: 'mock' })
    resetDriveStatusCache()
    renderRoute('/home')
    await screen.findByText('미등록 인박스')
    expect(screen.queryByRole('button', { name: 'Drive 지금 확인' })).toBeNull()
  })
})
