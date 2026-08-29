/** @vitest-environment jsdom */
// Phase 3.20 — 진입점 정정(사용자 실측 지적 3건).
// 기능은 이미 있었고 진입점이 틀렸다: 파트너 등록/수정은 '행사 설정 ② 담당자', 등급(상품) 정의는
// '행사 설정 ③ 유형·연동'에 흩어져 있었고, 발주처·파트너가 보는 화면은 링크 복사만 가능해
// 열어볼 수가 없었다. 여기서 고정하는 계약:
//  ① 파트너 보드에서 파트너를 직접 등록하고, 등록분이 그 자리의 접수 표에 반영된다
//  ② 파트너 보드에서 그 파트너의 제출 포털(/p/{token})을 새 탭으로 연다
//  ③ 판매 플래너 ①에서 등급을 직접 만들 수 있다(다른 화면으로 보내는 안내 없음)
//  ④ 행사 설정 ②에서 발주처 화면(/c/{token})을 새 탭으로 연다 — 무로그인 고지 포함
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_TOKEN, PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { PARTNER_DEMO_TOKEN } from '../fixtures/hostFixtures'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('① 파트너 보드에서 파트너를 직접 관리한다', () => {
  it('빈 상태가 다른 화면으로 보내지 않고, 관리 섹션에서 추가한 파트너가 접수 표에 나타난다', async () => {
    mockProvider().switchUser('usr-pm')
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    const { container } = renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })
    await screen.findByText('가상다이아텍')

    // 옛 안내(다른 화면으로 보내는 문구)는 화면에 없다
    expect(container.textContent ?? '').not.toContain('행사 설정 ② 담당자에서 파트너를 추가하세요')

    // 관리 섹션은 기본 접힘 — 보드의 기본 화면은 접수 현황이다
    expect(screen.queryByTestId('partner-roster')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '파트너 관리' }))
    const roster = await screen.findByTestId('partner-roster')

    await userEvent.type(within(roster).getByLabelText('파트너명'), '가상브론즈웍스')
    await userEvent.click(within(roster).getByRole('button', { name: '파트너 추가' }))

    // 추가분이 보드의 접수 표(첫 .ui-table)에도 반영된다
    const board = container.querySelector('table.ui-table') as HTMLElement
    await waitFor(() => expect(within(board).getByText('가상브론즈웍스')).toBeTruthy())
  })
})

describe('② 파트너 보드에서 제출 포털을 연다', () => {
  it('선택한 파트너의 /p/{token} 링크가 새 탭으로 열리고, 미발급이면 발급 안내가 뜬다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    const { container } = renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })
    const board = container.querySelector('table.ui-table') as HTMLElement
    await userEvent.click(within(board).getByText('가상다이아텍'))
    await screen.findByRole('heading', { name: /파트너 상세 — 가상다이아텍/ })

    const link = screen.getByRole('link', { name: '제출 포털 열기' })
    expect(link.getAttribute('href')).toContain(`/p/${PARTNER_DEMO_TOKEN}`)
    expect(link.getAttribute('target')).toBe('_blank')
  })
})

describe('③ 판매 플래너 ①에서 등급을 만든다', () => {
  it('등급 관리가 상품 정의 안에 있고, 다른 화면으로 보내는 안내가 없다', async () => {
    mockProvider().switchUser('usr-pm')
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    const { container } = renderRoute('/partners')
    await userEvent.click(await screen.findByRole('button', { name: '판매 플래너' }))
    await screen.findByText('① 상품 정의')

    expect(container.textContent ?? '').not.toContain('행사 설정 ③ 유형·연동에서 파트너 등급')

    await userEvent.click(screen.getByRole('button', { name: '등급 관리' }))
    expect(await screen.findByRole('button', { name: '등급 추가' })).toBeTruthy()

    // 만든 등급이 상품 카드로 이어진다 — 등급 생성과 상품 정의가 한 자리다
    // 등급 추가 폼의 두 칸(코드·명칭) — 라벨이 컨트롤을 감싸는 형태라 플레이스홀더로 집는다
    await userEvent.type(screen.getByPlaceholderText('platinum'), 'bronze')
    await userEvent.type(screen.getByPlaceholderText('PLATINUM'), 'BRONZE')
    await userEvent.click(screen.getByRole('button', { name: '등급 추가' }))
    await waitFor(() => expect(screen.getByLabelText('BRONZE 저장')).toBeTruthy())
  })
})

describe('④ 행사 설정에서 발주처 화면을 연다', () => {
  it('발급된 토큰이 /c/{token} 링크로 열리고 무로그인 고지가 붙는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '② 담당자' }))

    const links = await screen.findByTestId('client-view-links')
    expect(links.textContent).toContain('로그인 없이')
    const link = within(links).getByRole('link', { name: /화면 열기$/ })
    expect(link.getAttribute('href')).toContain(`/c/${DEMO_TOKEN}`)
    expect(link.getAttribute('target')).toBe('_blank')
  })
})
