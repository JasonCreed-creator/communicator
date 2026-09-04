/** @vitest-environment jsdom */
// DoD-16 (v1.4.1): 온보딩 완료 판정은 Project.onboarded_at에서만 파생된다 (설계서 v1.4.1 §4-1·§8).
// ① null이면 라우트 가드가 위저드로 리다이렉트 ② 완료 시 onboarded_at 타임스탬프 기록(completed는 파생값)
// ③ 이미 완료된 프로젝트의 재완료 시도는 409 CONFLICT.
// 픽스처 초기화 단위 = 이 파일 — 시나리오 (a)→(b)→(c) 순서로 같은 MockProvider 상태를 공유한다.
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProviderError } from '../lib/errors'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-16 온보딩 완료 = onboarded_at 파생 (v1.4.1)', () => {
  it('(a) onboarded_at이 null이면 내부 라우트가 행사 설정으로 유도된다 (v1.5 §10)', async () => {
    const p = mockProvider()
    p.resetOnboarding()
    expect((await p.getOnboardingStatus('prj-stc26')).onboarded_at).toBeNull()

    renderRoute('/home')
    expect(await screen.findByRole('heading', { name: '행사 설정' })).toBeTruthy()
  })

  it('(b) 완료 처리 시 onboarded_at 타임스탬프가 기록되고 completed가 파생된다', async () => {
    const p = mockProvider()
    await p.completeOnboarding('prj-stc26')

    const status = await p.getOnboardingStatus('prj-stc26')
    expect(status.completed).toBe(true)
    expect(status.onboarded_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })

  it('(c) 이미 완료된 프로젝트의 재완료 시도는 409 CONFLICT', async () => {
    const p = mockProvider()
    const err = await p.completeOnboarding('prj-stc26').then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ProviderError)
    expect((err as ProviderError).status).toBe(409)
    expect((err as ProviderError).code).toBe('conflict')
  })
})
