/** @vitest-environment jsdom */
// DoD 45 (v2.6 §10 / 3.17.1 T1) — S-12 현장 체크인 분리.
//
// 체크인을 등록 보드 탭에 두면 현장 접수 담당(협력사·단기 인력)에게 전체 명단 · 시트 URL ·
// 연결 설정 · 내보내기가 함께 열린다. 레이아웃이 아니라 **권한** 문제라 화면 자체를 나눈다.
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

const SHEET_PROJECT = 'prj-rebuild27'

afterEach(cleanup)

describe('DoD 45 S-12 현장 체크인 분리', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', SHEET_PROJECT)
  })

  it('사이드바에 별도 진입점이 있다 — 게이트 뒤에 숨기지 않는다(§10)', async () => {
    renderRoute('/registration')
    const link = await screen.findByRole('link', { name: '현장 체크인' })
    expect(link.getAttribute('href')).toContain('/checkin')
  })

  it('S-12에는 명단 편집·시트 설정·내보내기 경로가 0건이다', async () => {
    const { container } = renderRoute('/checkin')
    await screen.findByLabelText('이름 · 소속 · 뱃지번호 검색')

    expect(screen.queryByRole('region', { name: '구글 시트 연결' })).toBeNull()
    for (const name of ['연결 설정', '지금 동기화', '내보내기', '시트 열기 ↗']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
      expect(screen.queryByRole('link', { name })).toBeNull()
    }
    expect(container.textContent).not.toMatch(/docs\.google\.com/)

    // 명단 편집 입력 요소 0개 — 검색창(type=search)만 허용
    const inputs = Array.from(container.querySelectorAll('input, select, textarea'))
    expect(inputs).toHaveLength(1)
    expect((inputs[0] as HTMLInputElement).type).toBe('search')
  })

  it('등록 보드 참관객 표에서 체크인 조작 UI가 제거됐다', async () => {
    const { container } = renderRoute('/registration')
    await screen.findByRole('region', { name: '구글 시트 연결' })
    const tabs = within(container).getAllByRole('button', { name: '참관객' })
    tabs[0].click()

    const table = await screen.findByRole('table', { name: '참관객 시트 명단' })
    expect(within(table).queryAllByRole('button', { name: '체크인' })).toHaveLength(0)
  })

  it('두 화면이 같은 snapshot_at을 각자 표기한다', async () => {
    const onsite = renderRoute('/checkin')
    const onsiteAt = (await within(onsite.container).findByTestId('snapshot-badge')).getAttribute(
      'data-snapshot-at',
    )
    expect(onsiteAt).toBeTruthy()
    cleanup()

    const board = renderRoute('/registration')
    await within(board.container).findByRole('region', { name: '구글 시트 연결' })
    within(board.container).getAllByRole('button', { name: '참관객' })[0].click()
    const badges = await within(board.container).findAllByTestId('snapshot-badge')
    expect(badges.some((b) => b.getAttribute('data-snapshot-at') === onsiteAt)).toBe(true)
  })
})
