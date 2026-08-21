/** @vitest-environment jsdom */
// DoD-2: 수정요청 루프 — /c/demo 수정요청+코멘트 → 새 버전 업로드 시 draft 자동 복귀.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-2 수정요청 루프 (dlv-001 메인 키비주얼, pending_approval)', () => {
  it('발주처 수정요청은 코멘트가 없으면 제출 불가, 입력 후 제출되며 shared 코멘트로 기록된다', async () => {
    renderRoute('/c/demo')
    const card = (await screen.findByText('메인 키비주얼')).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: '수정요청' }))

    const submit = within(card).getByRole('button', { name: '제출' })
    expect(submit).toHaveProperty('disabled', true)

    await userEvent.type(within(card).getByRole('textbox'), '로고를 더 키워주세요.')
    await userEvent.click(within(card).getByRole('button', { name: '제출' }))
    expect(await screen.findByText(/수정요청이 접수되었습니다/)).toBeTruthy()

    const d = await mockProvider().getDeliverable('dlv-001')
    expect(d.status).toBe('changes_requested')
    const clientComment = d.comments.find((c) => c.body === '로고를 더 키워주세요.')
    expect(clientComment?.visibility).toBe('shared')
    expect(clientComment?.author_token).toBe('demo')
  })

  it('새 버전 업로드 시 draft로 자동 복귀한다', async () => {
    renderRoute('/items/dlv-001')
    await screen.findByText(/발주처가 수정을 요청했습니다/)

    const fileInput = screen.getByLabelText(/파일/) as HTMLInputElement
    await userEvent.upload(fileInput, new File(['fake'], '수정본.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: '업로드' }))

    expect(await screen.findByText('초안')).toBeTruthy()
    const d = await mockProvider().getDeliverable('dlv-001')
    expect(d.status).toBe('draft')
    expect(d.versions[0]?.version_no).toBe(3)
  })
})
