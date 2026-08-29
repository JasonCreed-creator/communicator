/** @vitest-environment jsdom */
// DoD-1: Mock E2E 컨펌 루프 — 발송 조건(미리보기 포맷) → PM 발송 → /c/demo 승인 → final → 보드 '확정' 반영.
// 한 파일 = 한 픽스처 상태. 테스트는 시나리오 순서대로 이어진다.
// v1.3부터 큐시트 항목(dlv-004)은 발송 시 스냅숏이 자동 등록되어 발송 조건 검사를 우회하므로,
// 본 시나리오는 비큐시트 ops 항목 dlv-005(운영 시나리오)로 수행한다 — 스냅숏 동작은 dod12에서 검증.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-1 컨펌 루프 (dlv-005 운영 시나리오)', () => {
  it('미리보기 포맷이 아닌 버전(.ai)은 컨펌 발송이 거부되고 에러가 표시된다', async () => {
    const p = mockProvider()
    // 준비: changes_requested → 새 버전 업로드로 draft 복귀 → 내부검토 → .ai 원본 추가 업로드
    p.switchUser('usr-ops')
    await p.uploadVersion('dlv-005', { file_name: '수정본.pdf', note: 'VIP 동선 반영' })
    await p.transitionStatus('dlv-005', 'internal_review')
    await p.uploadVersion('dlv-005', { file_name: '원본.ai' })
    p.switchUser('usr-pm')

    renderRoute('/items/dlv-005')
    await screen.findByRole('button', { name: '컨펌 발송' })

    const select = screen.getByRole('combobox')
    const aiOption = within(select)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('.ai'))
    expect(aiOption).toBeDefined()
    await userEvent.selectOptions(select, aiOption!)
    await userEvent.click(screen.getByRole('button', { name: '컨펌 발송' }))

    expect(await screen.findByText(/미리보기 포맷/)).toBeTruthy()
    expect((await p.getDeliverable('dlv-005')).status).toBe('internal_review')
  })

  it('미리보기 포맷 버전(.pdf) 발송 → 컨펌대기 전이', async () => {
    renderRoute('/items/dlv-005')
    await screen.findByRole('button', { name: '컨펌 발송' })

    const select = screen.getByRole('combobox')
    const pdfOption = within(select)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('수정본') || /\.pdf/.test(o.textContent ?? ''))
    await userEvent.selectOptions(select, pdfOption!)
    await userEvent.click(screen.getByRole('button', { name: '컨펌 발송' }))

    // 3.17b — S3에 6단계 진행 레일이 생겨 '컨펌대기'가 레일 라벨로도 나온다.
    // 의미는 그대로: **상태 배지(.ui-badge)** 가 새 상태를 표시하는지 확인한다.
    const badges = await screen.findAllByText('컨펌대기')
    expect(badges.some((el) => el.classList.contains('ui-badge'))).toBe(true)
    expect(await p_status()).toBe('pending_approval')
  })

  it('/c/demo에서 승인 → approved → (스냅숏) → final 자동 전이', async () => {
    renderRoute('/c/demo')
    // 이력에도 같은 제목이 있으므로 카드(article) 안의 것을 고른다
    const titles = await screen.findAllByText('운영 시나리오')
    const card = titles.map((el) => el.closest('article')).find((a): a is HTMLElement => !!a)!
    await userEvent.click(within(card).getByRole('button', { name: '승인' }))
    await userEvent.click(within(card).getByRole('button', { name: '예, 승인합니다' }))

    expect(await screen.findByText(/승인 처리되었습니다/)).toBeTruthy()
    expect(await p_status()).toBe('final')
  })

  it('내부 보드(/board/ops)에 확정 뱃지가 반영된다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('운영 시나리오')
    expect(screen.getAllByText('확정').length).toBeGreaterThan(0)
  })
})

async function p_status() {
  return (await mockProvider().getDeliverable('dlv-005')).status
}
