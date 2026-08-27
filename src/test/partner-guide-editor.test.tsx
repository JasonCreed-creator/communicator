/** @vitest-environment jsdom */
// Phase 3.15.1 P2 UI(감수 M2) — 행사 설정 ③ 주최형 블록의 파트너 안내 창구(가이드 링크·문의 이메일).
// updateProject 경유 저장 왕복 + 값이 없으면 /p 포털에 UI가 뜨지 않는다(별도 partner-portal 파일에서
// 검증)와 대칭인, 여기서는 설정 화면 쪽 저장 왕복만 검증한다.
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'
import { renderRoute } from './testUtils'

afterEach(cleanup)

function mockProvider(): MockProvider {
  return getDataProvider() as MockProvider
}

async function openIntegrationTab() {
  renderRoute('/settings')
  await screen.findByRole('heading', { name: '행사 설정' })
  await userEvent.click(await screen.findByRole('button', { name: '③ 유형·연동' }))
  await screen.findByRole('heading', { name: '파트너 안내 창구' })
}

describe('행사 설정 ③ — 파트너 안내 창구', () => {
  it('픽스처 값(가이드 링크·문의 이메일)이 미리 채워진다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    await openIntegrationTab()

    expect((screen.getByLabelText('참가 가이드 링크') as HTMLInputElement).value).toBe(
      'https://guide.example.com/vst26',
    )
    expect((screen.getByLabelText('문의 창구 이메일') as HTMLInputElement).value).toBe(
      'partners@example.com',
    )
  })

  it('값을 바꾸고 저장하면 updateProject로 왕복 반영된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    await openIntegrationTab()

    const guideInput = screen.getByLabelText('참가 가이드 링크')
    const emailInput = screen.getByLabelText('문의 창구 이메일')
    await userEvent.clear(guideInput)
    await userEvent.type(guideInput, 'https://guide.example.com/vst26-v2')
    await userEvent.clear(emailInput)
    await userEvent.type(emailInput, 'partners-v2@example.com')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    const saved = await mockProvider().getProject(PROJECT_ID_HOST)
    expect(saved.partner_guide_url).toBe('https://guide.example.com/vst26-v2')
    expect(saved.partner_contact_email).toBe('partners-v2@example.com')

    // 뒤처리 — 포털 가이드 버튼 테스트(partner-portal.test.tsx)가 기대하는 픽스처 원본값으로 복원
    await mockProvider().updateProject(PROJECT_ID_HOST, {
      partner_guide_url: 'https://guide.example.com/vst26',
      partner_contact_email: 'partners@example.com',
    })
  })

  it('필드를 비우고 저장하면 null로 저장된다(포털에서 미노출 처리의 전제)', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    await openIntegrationTab()

    await userEvent.clear(screen.getByLabelText('참가 가이드 링크'))
    await userEvent.clear(screen.getByLabelText('문의 창구 이메일'))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    const saved = await mockProvider().getProject(PROJECT_ID_HOST)
    expect(saved.partner_guide_url).toBeNull()
    expect(saved.partner_contact_email).toBeNull()

    // 뒤처리 — 원본값 복원
    await mockProvider().updateProject(PROJECT_ID_HOST, {
      partner_guide_url: 'https://guide.example.com/vst26',
      partner_contact_email: 'partners@example.com',
    })
  })
})
