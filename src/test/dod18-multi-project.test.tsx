/** @vitest-environment jsdom */
// DoD-18 (v1.5): 셀렉터·S-1에서 행사 전환 시 화면이 해당 행사 데이터로 바뀌고,
// 새로고침(재마운트) 후에도 localStorage('communicator.currentProjectId')로 선택이 유지된다.
// 행사 ID 상수의 화면 코드 잔존 0건(grep, *.tsx)은 셸 검증(체크아웃 보고) — 픽스처 내부 정의만 허용.
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-18 다중 행사 — 셀렉터 전환·localStorage 유지', () => {
  it('(a) 셀렉터로 행사를 전환하면 홈·등록이 해당 행사 데이터로 바뀐다', async () => {
    renderRoute('/home')
    // 기본 선택 = ① 샘플 테크 — ① 전용 인박스 파일이 홈에 렌더
    expect(await screen.findByRole('heading', { name: '홈 대시보드' })).toBeTruthy()
    expect(await screen.findByText('리플렛 시안 수정본.pdf')).toBeTruthy()

    // 셀렉터 드롭다운 → ② 파트너 데이 2026 선택 (URL 불변 — 같은 홈이 ② 데이터로)
    await userEvent.click(screen.getByRole('button', { name: /현재 행사/ }))
    await userEvent.click(await screen.findByRole('button', { name: /파트너 데이 2026/ }))

    // ②에는 인박스 파일이 없고, ②의 컨펌대기 항목(무대 백월)이 미결 컨펌에 나타난다
    expect(await screen.findByText('무대 백월')).toBeTruthy()
    expect(screen.queryByText('리플렛 시안 수정본.pdf')).toBeNull()
  })

  it('(b) 전환한 선택이 localStorage에 남아 재마운트(새로고침) 후에도 유지된다', async () => {
    // (a)에서 ②로 전환됨 — 저장값 확인 후 새로 렌더
    expect(localStorage.getItem('communicator.currentProjectId')).toBe('prj-partner-day')

    renderRoute('/registration')
    // ②는 일반형 — RSVP 숨김 배너 + ② 데이터(참관객 없음) 기준으로 렌더
    expect(await screen.findByText(/일반형 행사 — 모객\(RSVP\) 모듈은 숨김 처리됨/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'RSVP' })).toBeNull()
  })

  it('(c) 일정(S5)도 전환된 행사 기준 — ②의 일반형 28건이 렌더된다', async () => {
    renderRoute('/schedule')
    await screen.findByText('3G.1') // 일반형 전용 태스크 코드
    const tasks = await mockProvider().listWbsTasks('prj-partner-day')
    expect(tasks).toHaveLength(28)
    // 모객형 전용 코드(3.1 리드젠)는 없다
    expect(screen.queryByText('3.1')).toBeNull()
  })
})
