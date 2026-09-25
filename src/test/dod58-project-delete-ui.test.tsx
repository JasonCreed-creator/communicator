/** @vitest-environment jsdom */
// DoD 58 (설계서 v2.8 §4-1c) — 행사 하드 삭제의 **화면 계층**.
// provider 계약(권한·캐스케이드·견적 분리·새 출발 보증)은 `dod58-project-delete.test.ts`가 본다.
// 여기서는 화면이 그 계약을 어떻게 노출하는지만 본다:
//   ① 진입점 2곳의 권한 표시가 서로 다르다 — S-1 카드는 숨김, 행사 설정 ③은 사유와 함께 잠김
//   ② 확인 단계(행사명 타이핑) 없이는 지워지지 않는다
//   ③ 삭제 후 ProjectContext가 스스로 되잡는다(죽은 저장값 정리 / 행사 0건 빈 화면)
//
// 주의: 이 파일은 상태를 **파괴**한다(행사를 실제로 지운다). testUtils 주석대로 픽스처는
// 파일 단위로 공유되므로 비파괴 테스트를 먼저, 파괴 테스트를 뒤에 둔다.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

const provider = mockProvider()
const SAMPLE_NAME = '샘플 테크 컨퍼런스 2026'
const STORAGE_KEY = 'communicator.currentProjectId'
const TAB_INTEGRATION = '③ 유형·연동'

afterEach(() => {
  cleanup()
  provider.setAppRole('sales') // 픽스처 기본으로 복원(dod25와 같은 관용구)
})

/**
 * Phase 3.23 PR-5 — 카드의 드문 동작(행사 설정 열기·종료·재개·삭제)은 ⋯ 메뉴에 있다. 권한(admin)은 비동기로 도착하므로
 * 메뉴를 열었을 때 삭제가 보일 때까지 다시 열어 본다.
 */
async function openCardMenu(cardEl?: HTMLElement): Promise<HTMLElement> {
  const scope = cardEl ? within(cardEl) : screen
  const buttons = await scope.findAllByRole('button', { name: /^행사 메뉴 / })
  await userEvent.click(buttons[0])
  return screen.getByRole('menu')
}

async function deleteItem(cardEl?: HTMLElement): Promise<HTMLElement> {
  let found: HTMLElement | null = null
  await waitFor(async () => {
    if (screen.queryByRole('menu')) await userEvent.keyboard('{Escape}')
    const menu = await openCardMenu(cardEl)
    found = within(menu).queryByTestId('card-delete')
    expect(found).not.toBeNull()
  })
  return found!
}

describe('DoD 58 화면 — 진입점 2곳의 권한 표시', () => {
  it('S-1 카드: admin이면 카드 ⋯ 메뉴에 삭제…(관리자만 · 되돌릴 수 없음)가 있다', async () => {
    provider.setAppRole('admin')
    renderRoute('/projects')
    const item = await deleteItem()
    expect(item.textContent).toContain('삭제…')
    expect(item.textContent).toContain('관리자만 · 되돌릴 수 없음')
  })

  it('S-1 카드: admin이 아니면 메뉴에 삭제 자체가 없다 (카드마다 죽은 버튼을 박지 않는다)', async () => {
    provider.setAppRole('sales')
    renderRoute('/projects')
    // 사이드바 견적 링크도 같은 getCurrentUser()에서 나온다 — 이게 떴다면 역할 판정은 끝났다
    await screen.findByRole('link', { name: /견적/ })
    await screen.findAllByTestId('project-card')
    const menu = await openCardMenu()
    expect(within(menu).getByRole('menuitem', { name: '행사 설정 열기' })).toBeTruthy()
    expect(within(menu).queryByTestId('card-delete')).toBeNull()
  })

  it('행사 설정 ③: admin이 아니어도 카드는 보이고 사유가 읽힌다 (§10 진입점 원칙)', async () => {
    provider.setAppRole('sales')
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: TAB_INTEGRATION }))

    // 숨기지 않는다 — 카드와 사유가 그 자리에 있다
    const zone = await screen.findByTestId('danger-zone')
    expect(within(zone).getByText(/관리자\(admin\) 권한이 필요합니다/)).toBeTruthy()
    // 버튼은 있으나 잠겨 있다
    expect(within(zone).getByRole('button', { name: '행사 삭제' }).hasAttribute('disabled')).toBe(true)
  })

  it('행사 설정 ③: admin이면 같은 자리의 버튼이 열린다', async () => {
    provider.setAppRole('admin')
    renderRoute('/settings')
    await userEvent.click(await screen.findByRole('button', { name: TAB_INTEGRATION }))
    const zone = await screen.findByTestId('danger-zone')
    await waitFor(() =>
      expect(within(zone).getByRole('button', { name: '행사 삭제' }).hasAttribute('disabled')).toBe(false),
    )
  })
})

describe('DoD 58 화면 — 확인 단계', () => {
  it('행사명을 정확히 입력하기 전에는 잠겨 있고, 취소하면 행사가 그대로다', async () => {
    provider.setAppRole('admin')
    const before = (await provider.listProjects()).length

    renderRoute('/projects')
    // 카드 자체가 role="button"이므로 메뉴에서 삭제를 눌러도 행사로 진입하지 않아야 한다
    await userEvent.click(await deleteItem())

    const dialog = await screen.findByTestId('delete-project-dialog')
    const confirm = within(dialog).getByRole('button', { name: '영구 삭제' })
    expect(confirm.hasAttribute('disabled')).toBe(true)

    // 비슷하지만 다른 이름 — 여전히 잠김
    await userEvent.type(within(dialog).getByLabelText(/행사명/), '샘플 테크 컨퍼런스')
    expect(confirm.hasAttribute('disabled')).toBe(true)

    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    expect((await provider.listProjects()).length).toBe(before)
    // 모달을 닫고 S-1에 그대로 있다(삭제 클릭이 카드 진입으로 새지 않았다)
    expect(screen.getByRole('heading', { name: '행사 목록' })).toBeTruthy()
  })
})

describe('DoD 58 화면 — 삭제 후 컨텍스트 자가 복구 (파괴적)', () => {
  it('현재 행사를 지우면 목록에서 사라지고 죽은 저장값이 남지 않는다', async () => {
    provider.setAppRole('admin')
    localStorage.setItem(STORAGE_KEY, PROJECT_ID)

    renderRoute('/projects')
    await screen.findAllByTestId('project-card')
    const target = screen
      .getAllByTestId('project-card')
      .find((c) => c.getAttribute('data-project-id') === PROJECT_ID)!
    await userEvent.click(await deleteItem(target))

    const dialog = await screen.findByTestId('delete-project-dialog')
    await userEvent.type(within(dialog).getByLabelText(/행사명/), SAMPLE_NAME)
    await userEvent.click(within(dialog).getByRole('button', { name: '영구 삭제' }))

    // provider에서 사라지고
    await waitFor(async () =>
      expect((await provider.listProjects()).some((s) => s.id === PROJECT_ID)).toBe(false),
    )
    // 화면 목록에서도 사라지며
    await waitFor(() =>
      expect(
        screen.queryAllByTestId('project-card').some((c) => c.getAttribute('data-project-id') === PROJECT_ID),
      ).toBe(false),
    )
    // 죽은 id가 localStorage에 남지 않는다 — 남으면 새로고침 후에도 전 화면이 404가 된다
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBe(PROJECT_ID))
  })
})

describe('DoD 58 화면 — 행사 0건 새 출발 (파괴적 · 이 파일 마지막)', () => {
  it('전부 지우면 막다른 길이 아니라 "첫 행사 만들기" 지면이 뜨고, 거기서 만들 수 있다', async () => {
    provider.setAppRole('admin')
    for (const s of await provider.listProjects()) await provider.deleteProject(s.id)
    expect(await provider.listProjects()).toEqual([])

    renderRoute('/home')

    // 예전의 "표시할 행사가 없습니다." 막다른 길 대신 CTA가 있는 빈 지면(§4-2c 진입점 원칙)
    const empty = await screen.findByTestId('no-projects-empty')
    await userEvent.click(within(empty).getByRole('button', { name: /첫 행사 만들기/ }))

    // 새 행사가 만들어지고 S0 위저드로 들어간다 — 빈 상태에서 튕기지 않는다
    await waitFor(async () => expect((await provider.listProjects()).length).toBe(1))
    expect(await screen.findByRole('heading', { name: '① 행사개요' })).toBeTruthy()
  })
})
