/** @vitest-environment jsdom */
// DoD-19 (v1.5): 행사 설정 — ① 필수 4(행사명·코드·시작일·장소) 미입력 저장 거부·세팅 미완료 뱃지,
// ② 담당자 추가/삭제·마지막 PM 삭제 409. (①에서 저장한 값의 S9 ① 반영은 dod8 (c)가 증명.)
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DoD-19 행사 설정 3탭', () => {
  it('(a) 세팅 미완료 행사: 미완료 뱃지·유도 배너가 뜨고, 필수 미입력 저장은 거부된다', async () => {
    // 세팅 미완료 행사(③)를 현재 행사로 선택
    localStorage.setItem('communicator.currentProjectId', 'prj-forum-h2')
    renderRoute('/settings')

    expect(await screen.findByRole('heading', { name: '행사 설정' })).toBeTruthy()
    expect(await screen.findByText(/세팅 미완료/)).toBeTruthy()
    // 3.10.1 R5 — ③은 필수 4가 모두 입력된 상태(missingCount 0)라 '필수 0개' 대신 확인 유도 문구가 뜬다
    expect(await screen.findByText(/필수 항목은 모두 입력됐습니다/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '온보딩 이어서 하기' })).toBeTruthy()

    // 필수인 장소를 비우고 저장 → 클라이언트 검증이 거부
    const venueInput = (await screen.findByLabelText('장소')) as HTMLInputElement
    await userEvent.clear(venueInput)
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('필수 항목(행사명·코드·시작일·장소)을 입력하세요.')).toBeTruthy()
    const draft = await mockProvider().getProject('prj-forum-h2')
    expect(draft.venue).not.toBeNull() // 저장이 실행되지 않아 기존 값 유지
  })

  it('(b) ② 담당자: 추가·삭제가 동작하고 마지막 PM 삭제는 409로 거부된다', async () => {
    // 완료된 ① 행사 기준
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })

    await userEvent.click(await screen.findByRole('button', { name: '② 담당자' }))
    expect(await screen.findByText('김기획')).toBeTruthy()

    // 마지막 PM(김기획) 삭제 시도 → 409 메시지
    const pmRow = screen.getByText('김기획').closest('tr')!
    await userEvent.click(within(pmRow).getByRole('button', { name: '삭제' }))
    expect(
      await screen.findByText(/마지막 PM은 삭제할 수 없습니다/),
    ).toBeTruthy()

    // 담당자 추가(reg) → 표에 등장 — 발주처 연락처 폼에도 '이름' 라벨이 있어 담당자 카드로 스코프
    const membersCard = within(
      screen.getByRole('heading', { name: '담당자' }).closest('.ui-card') as HTMLElement,
    )
    await userEvent.type(membersCard.getByLabelText('이름'), '오신규')
    await userEvent.type(membersCard.getByLabelText('이메일'), 'new-member@example.com')
    await userEvent.selectOptions(membersCard.getByLabelText('역할'), 'reg')
    await userEvent.click(membersCard.getByRole('button', { name: '추가' }))
    expect(await screen.findByText('오신규')).toBeTruthy()

    // 새 담당자 삭제는 성공(제거됨) — 재조회 반영까지 대기
    const newRow = screen.getByText('오신규').closest('tr')!
    await userEvent.click(within(newRow).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.queryByText('오신규')).toBeNull())
  })
})
