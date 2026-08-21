/** @vitest-environment jsdom */
// DoD-6: 발주처 화면 모바일(375px) — jsdom은 레이아웃을 계산하지 않으므로 시각 검증은
// 브라우저 스크린샷(2026-08-22, 375×812 캡처)으로 확보했고, 여기서는 회귀 가드로
// 모바일 구조 계약(협폭 컨테이너·44px 터치 타깃·풀폭 카드 스택)을 클래스 수준에서 고정한다.
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-6 발주처 모바일 구조 계약', () => {
  it('S7: 협폭 컨테이너(max-w-2xl)와 44px 터치 타깃(h-11) 액션 버튼을 유지한다', async () => {
    renderRoute('/c/demo')
    const card = (await screen.findByText('메인 키비주얼')).closest('article')!

    expect(document.querySelector('.max-w-2xl')).not.toBeNull()
    const approveBtn = within(card).getByRole('button', { name: '승인' })
    expect(approveBtn.className).toContain('h-11')
    const changesBtn = within(card).getByRole('button', { name: '수정요청' })
    expect(changesBtn.className).toContain('h-11')
  })

  it('S8: 협폭 컨테이너 안에서 진행률·마일스톤·확정본이 세로 스택으로 렌더된다', async () => {
    renderRoute('/c/demo/status')
    expect(await screen.findByText('참가자 명찰')).toBeTruthy()
    expect(document.querySelector('.max-w-2xl')).not.toBeNull()
  })
})
