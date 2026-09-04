/** @vitest-environment jsdom */
// S-00 제품 런처 — 도메인 루트(`/`)에서 견적 컨피규레이터·MICE 커뮤니케이터를 골라 들어간다 (DoD 56).
// 사용자 지시(2026-09-04): "같은 도메인에서 선택하여 각각 진입할 수 있는 루트".
//
// 계약: ① 루트는 셸(사이드바·셀렉터) 없는 중립 지면에 두 제품 카드만 ② 카드 전체가 링크(accent 버튼 0개)
// ③ 견적 → /quotes(S-2) · 커뮤니케이터 → /home(S1) ④ 사이드바 로고가 런처로 되돌아가는 경로
// ⑤ 옛 견적 주소(/configurator)는 런처를 거치지 않고 바로 견적으로 간다(§10 리다이렉트 표 불변).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(cleanup)

const LAUNCHER_TITLE = '어떤 도구로 시작할까요?'

describe('S-00 제품 런처 (/)', () => {
  it('(a) 루트는 두 제품 카드를 렌더하고, 제품 셸(사이드바·프로젝트 셀렉터)은 없다', async () => {
    renderRoute('/')
    expect(await screen.findByRole('heading', { name: LAUNCHER_TITLE })).toBeTruthy()

    const section = screen.getByRole('region', { name: '제품 선택' })
    const quote = within(section).getByRole('link', { name: '견적 컨피규레이터 들어가기' })
    const comm = within(section).getByRole('link', { name: 'MICE 커뮤니케이터 들어가기' })
    expect(quote.getAttribute('href')).toBe('/quotes')
    expect(comm.getAttribute('href')).toBe('/home')

    // 중립 지면 — 어느 제품의 셸도 아니다
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByText('현재 행사')).toBeNull()
    // §5 CTA 원칙 — 카드 전체가 링크라 accent/primary 버튼이 0개
    expect(document.querySelectorAll('.btn-accent, .btn-primary').length).toBe(0)
  })

  it('(b) 견적 컨피규레이터 카드 → /quotes (S-2)', async () => {
    renderRoute('/')
    await userEvent.click(await screen.findByRole('link', { name: '견적 컨피규레이터 들어가기' }))
    expect(await screen.findByRole('heading', { name: '견적' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: LAUNCHER_TITLE })).toBeNull()
  })

  it('(c) MICE 커뮤니케이터 카드 → /home (S1 홈 대시보드) — 사이드바 "홈"이 /home으로 활성', async () => {
    renderRoute('/')
    await userEvent.click(await screen.findByRole('link', { name: 'MICE 커뮤니케이터 들어가기' }))
    expect(await screen.findByRole('heading', { name: '홈 대시보드' })).toBeTruthy()

    const nav = screen.getAllByRole('navigation')[0]
    const home = within(nav).getByRole('link', { name: '홈' })
    expect(home.getAttribute('href')).toBe('/home')
    expect(home.getAttribute('aria-current')).toBe('page')
  })

  it('(d) 사이드바 로고가 제품 선택(/)으로 되돌아가는 경로다', async () => {
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })

    const back = screen.getAllByRole('link', { name: '제품 선택으로' })[0]
    expect(back.getAttribute('href')).toBe('/')
    await userEvent.click(back)
    expect(await screen.findByRole('heading', { name: LAUNCHER_TITLE })).toBeTruthy()
  })

  it('(e) 옛 견적 도구 주소(/configurator)는 런처를 거치지 않고 견적으로 간다', async () => {
    renderRoute('/configurator')
    expect(await screen.findByRole('heading', { name: '견적' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: LAUNCHER_TITLE })).toBeNull()
  })
})
