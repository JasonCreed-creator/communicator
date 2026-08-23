/** @vitest-environment jsdom */
// DoD-20 (v1.5): 새 행사 만들기 → S0 3단계 → 완료 시 onboarded_at 기록·WBS 전개·R&R 시드·목록 등장.
// 세팅 미완료 행사 본체 진입 시 차단이 아닌 /settings 유도(가드 갱신은 dod10·dod16에서도 검증).
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-20 새 행사 흐름·유도', () => {
  it('(a) S-1 새 행사 만들기 → S0 3단계 완료 → onboarded_at·WBS 28건·R&R·목록 등장', async () => {
    const p = mockProvider()
    const before = await p.listProjects()

    renderRoute('/projects')
    await screen.findByRole('heading', { name: '내 행사' })
    // 헤더 버튼·dashed 카드 둘 다 같은 이름 — 첫 번째로 생성
    await userEvent.click(screen.getAllByRole('button', { name: '＋ 새 행사 만들기' })[0])

    // 새 행사가 생성되고 S0 위저드 ①로 진입 (자리표시 이름 '새 행사')
    await screen.findByRole('heading', { name: '① 행사개요' })
    const after = await p.listProjects()
    const created = after.find((s) => !before.some((b) => b.id === s.id))!
    expect(created).toBeTruthy()
    expect(created.onboarded).toBe(false)

    // ① 필수 입력 채우고 다음 (코드는 자동 제안값 유지)
    // 필드는 ProjectOverviewForm의 자체 async 로드 뒤에 붙는다(헤더보다 늦음)
    const nameInput = (await screen.findByLabelText('행사명')) as HTMLInputElement
    expect(nameInput.value).toBe('새 행사')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '신규 워크숍 2026')
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-12-01' } })
    await userEvent.type(screen.getByLabelText('장소'), '가상러닝센터 2F')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    // ② 담당자(생성자=pm 자동) → 다음
    await screen.findByRole('heading', { name: '② 담당자' })
    await userEvent.click(await screen.findByRole('button', { name: '다음' }))

    // ③ 유형·확인 — 기본 일반형 유지 → 완료
    await screen.findByRole('heading', { name: '③ 유형·확인' })
    const generalRadio = (await screen.findByRole('radio', { name: /일반형/ })) as HTMLInputElement
    expect(generalRadio.checked).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '온보딩 완료' }))
    expect(await screen.findByRole('heading', { name: '홈 대시보드' })).toBeTruthy()

    // 부수 효과: onboarded_at 기록 + 일반형 28건 전개 + R&R 시드 + 목록 반영
    const status = await p.getOnboardingStatus(created.id)
    expect(status.completed).toBe(true)
    expect(await p.listWbsTasks(created.id)).toHaveLength(28)
    expect((await p.listRoleCharters(created.id)).length).toBeGreaterThan(0)
    const final = (await p.listProjects()).find((s) => s.id === created.id)!
    expect(final.onboarded).toBe(true)
    expect(final.name).toBe('신규 워크숍 2026')
  })

  it('(b) 세팅 미완료 행사로 본체 진입 시 /settings 유도 + 온보딩 이어서 하기 동선', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-forum-h2')
    renderRoute('/')

    expect(await screen.findByRole('heading', { name: '행사 설정' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '홈 대시보드' })).toBeNull()

    // 유도 배너의 '온보딩 이어서 하기' → S0 위저드
    // 배너는 행사 설정 헤딩과 별개의 useAsync(온보딩 상태)에 달려 있다
    await userEvent.click(await screen.findByRole('button', { name: '온보딩 이어서 하기' }))
    expect(await screen.findByRole('heading', { name: '온보딩 위저드' })).toBeTruthy()
  })
})
