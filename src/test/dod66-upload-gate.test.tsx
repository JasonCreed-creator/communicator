/** @vitest-environment jsdom */
// DoD 66 (Phase 4.3.1 · 2026-09-25 실서버 실사용 중 나온 결함 5건):
//   ① 업로드가 막힌 상태(컨펌대기·승인·확정·파트너 첫 제출 전)는 고르기·끌어놓기·업로드 대신 이유와 다음 할 일부터 —
//      헤더 '새 버전 업로드'는 자리는 지키되(3.17b 주 액션 2개) 비활성 + 이유
//   ② 업로드 거부 문구에 영문 상태 코드가 없다 — provider 가드(mock·실서버)와 서버 SQL·Drive 함수 문구까지
//   ③ 발주처 링크가 0개인 행사에서 컨펌을 보내려 하면 경고(발송은 막지 않는다) → 행사 설정 ② 담당자로 가는 링크
//   ④ 버전마다 파일이 실제로 어디 있는지(실서버만): Drive · 임시(저장 안 됨)
//   ⑤ 실서버 + Drive 미연결이면 회색 한 줄 대신 경고 상자("지금 올리는 파일은 저장되지 않습니다")
// 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 이어진다(testUtils 주석).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { hasActiveClientLink } from '../components/internal/ClientLinkWarning'
import { createDriveClient, type DriveClient, type DriveStatus } from '../lib/drive/driveClient'
import { setDriveGateway } from '../lib/drive/driveGateway'
import { resetDriveStatusCache } from '../lib/drive/useDriveStatus'
import { humanizeStatusCodes, STATUS_LABELS } from '../lib/labels'
import {
  PENDING_FILE_PREFIX,
  UPLOADABLE_STATUSES,
  uploadBlockedMessage,
  uploadLock,
  versionStorage,
} from '../lib/uploadGate'
import { getAuthAdapter } from '../providers/auth'
import { mapPgError } from '../providers/supabase/errors'
import type { ClientToken } from '../types/entities'
import { DELIVERABLE_STATUSES } from '../types/enums'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  setDriveGateway(null)
  resetDriveStatusCache()
})
afterAll(() => setDriveGateway(null))

/** 영문 상태 코드 — 화면 문구에 나오면 안 된다 */
const RAW_CODES = /\b(requested|draft|internal_review|pending_approval|changes_requested|approved|final)\b/

describe('DoD 66 · ① 업로드 판정 — 한 목록·한 문구', () => {
  it('받는 상태 4종은 잠금 없음, 나머지는 상태 이름과 다음 할 일', () => {
    expect([...UPLOADABLE_STATUSES].sort()).toEqual(['changes_requested', 'draft', 'internal_review', 'requested'])
    for (const s of DELIVERABLE_STATUSES) {
      const lock = uploadLock(s)
      if (UPLOADABLE_STATUSES.includes(s)) {
        expect(lock).toBeNull()
      } else {
        expect(lock?.label).toBe(STATUS_LABELS[s])
        expect(lock?.reason.length).toBeGreaterThan(10)
      }
    }
    expect(uploadLock('pending_approval')?.reason).toContain('발주처가 수정요청을 보내면 다시 올릴 수 있습니다')
    expect(uploadLock('final')?.reason).toContain('새 항목')
  })

  it('파트너 inbound 첫 제출 전은 잠금(주최형 라벨) — 제출 뒤 수정요청은 다시 열린다', () => {
    expect(uploadLock('requested', { hasPartner: true })).toEqual({
      label: '제출 요청됨',
      reason: '파트너 제출 항목입니다 — 첫 버전은 파트너가 제출 링크로 올립니다.',
    })
    expect(uploadLock('pending_approval', { hasPartner: true })?.label).toBe('검토중')
    expect(uploadLock('changes_requested', { hasPartner: true })).toBeNull()
  })
})

describe('DoD 66 · ② 거부 문구에 영문 상태 코드가 없다', () => {
  it('provider 가드 — 컨펌대기 항목(dlv-001)에 올리면 상태 이름과 이유로 거부', async () => {
    const file = new File(['x'], '그림1.png', { type: 'image/png' })
    const err = await mockProvider()
      .uploadVersion('dlv-001', { file_name: '그림1.png', file })
      .then(() => null, (e: unknown) => e as Error)
    expect(err?.message).toBe(uploadBlockedMessage('pending_approval'))
    expect(err?.message).toContain("'컨펌대기' 상태에서는 새 버전을 올릴 수 없습니다")
    expect(err?.message).not.toMatch(RAW_CODES)
  })

  it('서버 문구(SQL 경합·Drive 함수)의 `상태(코드)`도 화면 이름으로', async () => {
    expect(humanizeStatusCodes('현재 상태(pending_approval)에서는 업로드할 수 없습니다.')).toBe(
      '현재 상태(컨펌대기)에서는 업로드할 수 없습니다.',
    )
    // 괄호 밖·다른 낱말은 건드리지 않는다
    expect(humanizeStatusCodes('draft 파일 — 상태(final)')).toBe('draft 파일 — 상태(확정)')

    const pg = mapPgError({ message: 'CONFLICT: 현재 상태(approved)에서는 업로드할 수 없습니다.' })
    expect(pg.code).toBe('conflict')
    expect(pg.message).toBe('현재 상태(승인)에서는 업로드할 수 없습니다.')

    const client = createDriveClient({
      accessToken: async () => 'token',
      apiBase: '/api',
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { code: 'conflict', message: '현재 상태(final)에서는 업로드할 수 없습니다.' } }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    })
    const driveErr = await client.status().then(() => null, (e: unknown) => e as Error)
    expect(driveErr?.message).toBe('현재 상태(확정)에서는 업로드할 수 없습니다.')
  })
})

describe('DoD 66 · ①′ 업로드 카드 — 막힌 상태는 고르기·업로드 없이 이유부터', () => {
  it('컨펌대기(dlv-001): 파일 입력 0 · 업로드 버튼 0 · 안내 1 · 헤더 버튼은 비활성 + 이유', async () => {
    const { container } = renderRoute('/items/dlv-001')
    const note = await screen.findByTestId('upload-locked')
    expect(note.textContent).toContain('지금은 새 버전을 올릴 수 없습니다 — 컨펌대기')
    expect(note.textContent).toContain('발주처가 수정요청을 보내면 다시 올릴 수 있습니다')
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(0)
    expect(screen.queryByTestId('upload-dropzone')).toBeNull()
    expect(screen.queryByRole('button', { name: '업로드' })).toBeNull()
    // 3.17b 주 액션 슬롯은 유지 — 누를 수 없고 이유가 붙는다
    const headerButton = screen.getByRole('button', { name: '새 버전 업로드' }) as HTMLButtonElement
    expect(headerButton.disabled).toBe(true)
    expect(headerButton.title).toContain('컨펌대기')
    expect(container.textContent).not.toMatch(/pending_approval/)
  })

  it('확정(dlv-002): 같은 잠금 + 확정 이유', async () => {
    renderRoute('/items/dlv-002')
    const note = await screen.findByTestId('upload-locked')
    expect(note.textContent).toContain('확정')
    expect(note.textContent).toContain('새 항목을 만들어 진행하세요')
  })

  it('초안(dlv-003): 기존 업로드 폼 그대로 — 헤더 버튼도 살아 있다', async () => {
    renderRoute('/items/dlv-003')
    await screen.findByTestId('upload-dropzone')
    expect(screen.queryByTestId('upload-locked')).toBeNull()
    expect(screen.getByRole('button', { name: '업로드' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '새 버전 업로드' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('DoD 66 · ③ 발송 — 발주처 링크 0개면 경고(발송은 막지 않는다)', () => {
  const token = (over: Partial<ClientToken>): ClientToken => ({
    token: 't',
    project_id: 'p',
    contact_id: null,
    expires_at: null,
    revoked_at: null,
    last_seen_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  })

  it('판정 — 회수·만료된 링크는 치지 않는다', () => {
    const now = Date.parse('2026-09-25T00:00:00.000Z')
    expect(hasActiveClientLink([], now)).toBe(false)
    expect(hasActiveClientLink([token({ revoked_at: '2026-09-02T00:00:00.000Z' })], now)).toBe(false)
    expect(hasActiveClientLink([token({ expires_at: '2026-09-24T00:00:00.000Z' })], now)).toBe(false)
    expect(hasActiveClientLink([token({ expires_at: '2026-10-01T00:00:00.000Z' })], now)).toBe(true)
    expect(hasActiveClientLink([token({})], now)).toBe(true)
  })

  it('링크가 있으면 경고 없음 — 내부검토 큐시트(dlv-004)의 PM 발송 폼', async () => {
    const spy = vi.spyOn(mockProvider(), 'listClientTokens')
    renderRoute('/items/dlv-004')
    await screen.findByRole('button', { name: '컨펌 발송' })
    // 토큰 조회가 실제로 끝난 뒤에도 경고가 없어야 한다(조회 전이라 안 보이는 것과 구분)
    await waitFor(() => expect(spy).toHaveBeenCalledWith('prj-stc26'))
    const tokens = await (spy.mock.results[0]!.value as Promise<ClientToken[]>)
    expect(hasActiveClientLink(tokens)).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('client-link-warning')).toBeNull()
    spy.mockRestore()
  })

  it('링크를 모두 회수하면 경고 + 발송 버튼은 그대로 → 링크를 누르면 행사 설정 ② 담당자 탭', async () => {
    const provider = mockProvider()
    for (const t of await provider.listClientTokens('prj-stc26')) {
      if (!t.revoked_at) await provider.revokeClientToken(t.token)
    }
    renderRoute('/items/dlv-004')
    const warning = await screen.findByTestId('client-link-warning')
    expect(warning.textContent).toContain('발주처 링크가 아직 없습니다')
    expect(warning.textContent).toContain('컨펌대기에서 멈춥니다')
    expect((screen.getByRole('button', { name: '컨펌 발송' }) as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(within(warning).getByRole('link', { name: '행사 설정 ② 담당자' }))
    await screen.findByRole('heading', { name: '행사 설정' })
    expect(await screen.findByText('발주처 연락처·토큰')).toBeTruthy()
  })
})

describe('DoD 66 · ④ 버전 저장 위치 — 실서버만', () => {
  it('판정 — mock은 표시 없음 · 자리표시 id는 임시(저장 안 됨) · 그 외는 Drive', () => {
    expect(versionStorage('drv-f-001', 'mock')).toBeNull()
    expect(versionStorage(`${PENDING_FILE_PREFIX}d46f`, 'mock')).toBeNull()
    const temp = versionStorage(`${PENDING_FILE_PREFIX}d46f0000-0000-0000-0000-000000000000`, 'supabase')
    expect(temp).toMatchObject({ label: '임시 · 저장 안 됨', level: 'attention' })
    expect(temp?.title).toContain('새로고침하면 사라집니다')
    expect(versionStorage('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', 'supabase')).toMatchObject({ label: 'Drive', level: 'neutral' })
  })

  it('mock 화면에는 저장 위치 표식이 없다(데모는 업로드 카드가 이미 말한다)', async () => {
    renderRoute('/items/dlv-001')
    await screen.findByText('버전 이력')
    expect(screen.queryAllByTestId('version-storage')).toHaveLength(0)
  })

  it('실서버 모드면 버전 이력 행마다 저장 위치가 붙는다(dlv-001 — Drive id 2건)', async () => {
    // 공급자·인증·Drive 게이트웨이는 이미 mock으로 만들어진 싱글턴을 그대로 쓴다 — 표시 판정만 실서버로
    getAuthAdapter()
    setDriveGateway({ mode: 'mock' })
    vi.stubEnv('VITE_DATA_PROVIDER', 'supabase')
    renderRoute('/items/dlv-001')
    await screen.findByText('버전 이력')
    const chips = await screen.findAllByTestId('version-storage')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    for (const chip of chips) expect(chip.textContent).toBe('Drive')
  })
})

describe('DoD 66 · ⑤ Drive 미연결 경고 상자 — 실서버만', () => {
  const statusOf = (over: Partial<DriveStatus>): DriveStatus =>
    ({
      configured: false,
      connected: false,
      mode: 'oauth',
      token_source: null,
      can_connect: false,
      ...over,
    }) as DriveStatus
  const serverGateway = (status: DriveStatus) =>
    setDriveGateway({ mode: 'server', client: { status: vi.fn(async () => status) } as unknown as DriveClient })

  it('실서버 + 미연결: 경고 상자 1개(행사 설정 ③ 링크) · 끌어놓기 영역의 회색 안내 없음', async () => {
    serverGateway(statusOf({ configured: false, connected: false }))
    renderRoute('/items/dlv-003')
    const box = await screen.findByTestId('drive-off-warning')
    expect(box.textContent).toContain('Drive 미연결 — 지금 올리는 파일은 저장되지 않습니다')
    expect(box.textContent).toContain('새로고침하면 사라집니다')
    expect(within(box).getByRole('link', { name: '행사 설정 ③ 유형·연동' }).getAttribute('href')).toBe(
      '/settings?tab=integration',
    )
    const zone = screen.getByTestId('upload-dropzone')
    expect(zone.textContent).not.toContain('이 세션에서만 보입니다')
    // 업로드 자체는 막지 않는다(경고만)
    expect(screen.getByRole('button', { name: '업로드' })).toBeTruthy()
  })

  it('실서버 + 연결됨: 경고 없음 · "Drive 행사 폴더에 저장됩니다"', async () => {
    serverGateway(statusOf({ configured: true, connected: true, token_source: 'vault' }))
    renderRoute('/items/dlv-003')
    const zone = await screen.findByTestId('upload-dropzone')
    await waitFor(() => expect(zone.textContent).toContain('Drive 행사 폴더에 저장됩니다'))
    expect(screen.queryByTestId('drive-off-warning')).toBeNull()
  })

  it('mock: 경고 상자 없음 · 데모 안내 그대로', async () => {
    setDriveGateway({ mode: 'mock' })
    renderRoute('/items/dlv-003')
    const zone = await screen.findByTestId('upload-dropzone')
    expect(zone.textContent).toContain('데모(mock) 모드')
    expect(screen.queryByTestId('drive-off-warning')).toBeNull()
  })
})
