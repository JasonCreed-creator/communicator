/** @vitest-environment jsdom */
// DoD-10: S0 온보딩 위저드 + 라우트 가드 (CLAUDE.md Phase 3.6b §7 DoD-10).
// 픽스처 초기화 단위 = 이 파일. 시나리오 순서대로 실행되며 같은 MockProvider 상태를 공유한다
// (src/test/testUtils.tsx 참조). 픽스처는 onboarding_completed=true로 시작하므로
// resetOnboarding()(mock 전용 헬퍼)으로 미완료 상태를 만들어 가드를 검증한다.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-10 온보딩 위저드·라우트 가드', () => {
  it('(a) 온보딩 미완료 시 "/"는 위저드로 리다이렉트된다', async () => {
    mockProvider().resetOnboarding()
    renderRoute('/')

    expect(await screen.findByRole('heading', { name: '온보딩 위저드' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '홈 대시보드' })).toBeNull()
  })

  it('(b) 온보딩 미완료 시 "/board/design"도 위저드로 리다이렉트된다', async () => {
    renderRoute('/board/design')
    expect(await screen.findByRole('heading', { name: '온보딩 위저드' })).toBeTruthy()
  })

  it('(c) 발주처 화면(/c/demo)은 가드가 적용되지 않고 정상 렌더된다', async () => {
    renderRoute('/c/demo')
    expect(await screen.findByRole('heading', { name: /확인 부탁드립니다/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '온보딩 위저드' })).toBeNull()
  })

  it('(d) 위저드 3단계를 완료하면 본체(홈)로 진입하고 WBS가 자동 전개된다', async () => {
    renderRoute('/onboarding')

    // ① 행사 기본개요 — 픽스처 값이 이미 채워져 있으므로 그대로 다음
    await screen.findByRole('heading', { name: '① 행사 기본개요' })
    expect((screen.getByLabelText('행사명') as HTMLInputElement).value).toBe('샘플 테크 컨퍼런스 2026')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    // ② 행사 유형 — 픽스처 기본값(모객형) 유지
    await screen.findByRole('heading', { name: '② 행사 유형' })
    const recruitingRadio = screen.getByRole('radio', { name: /모객형/ }) as HTMLInputElement
    expect(recruitingRadio.checked).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    // ③ 담당자·토큰 — pm이므로 완료 버튼 활성
    await screen.findByRole('heading', { name: '③ 담당자 확인' })
    const completeButton = screen.getByRole('button', { name: '온보딩 완료' }) as HTMLButtonElement
    expect(completeButton.disabled).toBe(false)
    await userEvent.click(completeButton)

    expect(await screen.findByRole('heading', { name: '홈 대시보드' })).toBeTruthy()

    const status = await mockProvider().getOnboardingStatus('prj-stc26')
    expect(status.completed).toBe(true)
    // 모객형 유지 → 부수효과로 37태스크가 전개된다 (부록 §15)
    const tasks = await mockProvider().listWbsTasks('prj-stc26')
    expect(tasks).toHaveLength(37)
  })

  it('(e) 완료 후에는 본체 라우트가 정상 접근되고, S6에서 행사명 수정이 반영된다', async () => {
    renderRoute('/settings')
    const nameInput = (await screen.findByLabelText('행사명')) as HTMLInputElement
    expect(nameInput.value).toBe('샘플 테크 컨퍼런스 2026')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '새 행사명 컨퍼런스')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(async () => {
      const updated = await mockProvider().getProject('prj-stc26')
      expect(updated.name).toBe('새 행사명 컨퍼런스')
    })
    expect(screen.queryByText('행사명은 비울 수 없습니다.')).toBeNull()
  })
})
