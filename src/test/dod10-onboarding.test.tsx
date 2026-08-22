/** @vitest-environment jsdom */
// DoD-10: S0 온보딩 위저드 + 라우트 가드 (CLAUDE.md Phase 3.6b §7 DoD-10).
// 픽스처 초기화 단위 = 이 파일. 시나리오 순서대로 실행되며 같은 MockProvider 상태를 공유한다
// (src/test/testUtils.tsx 참조). 픽스처는 onboarded_at이 기록된(완료) 상태로 시작하므로
// resetOnboarding()(mock 전용 헬퍼, onboarded_at=null 복원)으로 미완료 상태를 만들어 가드를 검증한다.
// v1.5(설계서 §10): 가드는 차단이 아닌 '행사 설정 유도' — 미완료 행사 진입 시 /settings로 리다이렉트.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-10 온보딩 위저드·라우트 가드', () => {
  it('(a) v1.5: 온보딩 미완료 시 "/"는 행사 설정으로 유도된다(차단 아님)', async () => {
    mockProvider().resetOnboarding()
    renderRoute('/')

    expect(await screen.findByRole('heading', { name: '행사 설정' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '홈 대시보드' })).toBeNull()
  })

  it('(b) v1.5: 온보딩 미완료 시 "/board/design"도 행사 설정으로 유도된다', async () => {
    renderRoute('/board/design')
    expect(await screen.findByRole('heading', { name: '행사 설정' })).toBeTruthy()
  })

  it('(c) 발주처 화면(/c/demo)은 가드가 적용되지 않고 정상 렌더된다', async () => {
    renderRoute('/c/demo')
    expect(await screen.findByRole('heading', { name: /확인 부탁드립니다/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '온보딩 위저드' })).toBeNull()
  })

  it('(d) v1.5 위저드 3단계(개요→담당자→유형·확인)를 완료하면 본체(홈)로 진입하고 WBS가 자동 전개된다', async () => {
    renderRoute('/onboarding')

    // ① 행사개요 — 행사 설정과 동일 폼, 픽스처 값이 이미 채워져 있으므로 저장(다음)만
    await screen.findByRole('heading', { name: '① 행사개요' })
    expect((screen.getByLabelText('행사명') as HTMLInputElement).value).toBe('샘플 테크 컨퍼런스 2026')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    // ② 담당자 — 행사 설정 ②와 동일 컴포넌트(선택 입력) → 다음
    await screen.findByRole('heading', { name: '② 담당자' })
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    // ③ 유형·확인 — 픽스처 기본값(모객형) 유지, pm이므로 완료 버튼 활성
    await screen.findByRole('heading', { name: '③ 유형·확인' })
    const recruitingRadio = screen.getByRole('radio', { name: /모객형/ }) as HTMLInputElement
    expect(recruitingRadio.checked).toBe(true)
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
