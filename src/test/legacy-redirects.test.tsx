/** @vitest-environment jsdom */
// v2.0 §10 — 옛 Configurator 라우트 리다이렉트 가드 (SPA Navigate, 도메인 이전 후 301은 Phase 4.6).
// /quote·/configurator → /quotes(단일 견적 — 신규견적 탭 폐지, 사용자 지시 2026-08-22),
// /setup → /onboarding, /events(:id) → /projects, /events/:id/soc → /schedule,
// ?client_view=1 공유 링크는 410 안내(§12 4중 차단 ④).
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
})

describe('옛 라우트 리다이렉트 (§10)', () => {
  it('/quote → /quotes (단일 견적 화면)', async () => {
    renderRoute('/quote')
    await screen.findByRole('heading', { name: '견적' })
  })

  it('/configurator → /quotes (구 신규견적 탭 폐지 — 같은 화면)', async () => {
    renderRoute('/configurator')
    await screen.findByRole('heading', { name: '견적' })
  })

  it('/setup → /onboarding', async () => {
    renderRoute('/setup')
    await screen.findByText('온보딩 위저드')
  })

  it('/events → /projects (행사 목록)', async () => {
    renderRoute('/events')
    expect((await screen.findAllByText('행사 목록')).length).toBeGreaterThan(0)
  })

  it('/events/:id → /projects', async () => {
    renderRoute('/events/legacy-1')
    expect((await screen.findAllByText('행사 목록')).length).toBeGreaterThan(0)
  })

  it('/events/:id/soc → /schedule (S5)', async () => {
    renderRoute('/events/legacy-1/soc')
    await screen.findByText('일정·WBS·R&R')
  })

  it('/events/:id/soc?client_view=1 → 410 안내 (발주처는 토큰 링크만)', async () => {
    renderRoute('/events/legacy-1/soc?client_view=1')
    await screen.findByText('410')
    await screen.findByText(/담당자에게 새 링크를 요청/)
  })
})
