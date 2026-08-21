/** @vitest-environment jsdom */
// DoD-1: Mock E2E 컨펌 루프 — 발송 조건(미리보기 포맷) → PM 발송 → /c/demo 승인 → final → 보드 '확정' 반영.
// 한 파일 = 한 픽스처 상태. 테스트는 시나리오 순서대로 이어진다.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-1 컨펌 루프 (dlv-004 개막식 큐시트, internal_review)', () => {
  it('미리보기 포맷이 아닌 버전(.ai)은 컨펌 발송이 거부되고 에러가 표시된다', async () => {
    const p = mockProvider()
    p.switchUser('usr-ops')
    await p.uploadVersion('dlv-004', { file_name: '원본.ai' })
    p.switchUser('usr-pm')

    renderRoute('/items/dlv-004')
    await screen.findByRole('button', { name: '컨펌 발송' })

    const select = screen.getByRole('combobox')
    const aiOption = within(select)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('.ai'))
    expect(aiOption).toBeDefined()
    await userEvent.selectOptions(select, aiOption!)
    await userEvent.click(screen.getByRole('button', { name: '컨펌 발송' }))

    expect(await screen.findByText(/미리보기 포맷/)).toBeTruthy()
    expect((await p.getDeliverable('dlv-004')).status).toBe('internal_review')
  })

  it('미리보기 포맷 버전(.pdf) 발송 → 컨펌대기 전이', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByRole('button', { name: '컨펌 발송' })

    const select = screen.getByRole('combobox')
    const pdfOption = within(select)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('.pdf'))
    await userEvent.selectOptions(select, pdfOption!)
    await userEvent.click(screen.getByRole('button', { name: '컨펌 발송' }))

    expect(await screen.findByText('컨펌대기')).toBeTruthy()
    expect((await p_status())).toBe('pending_approval')
  })

  it('/c/demo에서 승인 → approved → (스냅숏) → final 자동 전이', async () => {
    renderRoute('/c/demo')
    const card = (await screen.findByText('개막식 큐시트')).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: '승인' }))
    await userEvent.click(within(card).getByRole('button', { name: '예, 승인합니다' }))

    expect(await screen.findByText(/승인 처리되었습니다/)).toBeTruthy()
    expect(await p_status()).toBe('final')
  })

  it('내부 보드(/board/ops)에 확정 뱃지가 반영된다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막식 큐시트')
    expect(screen.getAllByText('확정').length).toBeGreaterThan(0)
  })
})

async function p_status() {
  return (await mockProvider().getDeliverable('dlv-004')).status
}
