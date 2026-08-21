/** @vitest-environment jsdom */
// DoD-3: internal 코멘트가 발주처 화면(/c/demo·/c/demo/status)에 절대 렌더되지 않음을 증명.
// 대조군: 같은 데이터가 내부 화면(S3)에는 렌더됨 → 부재가 데이터 부재가 아니라 필터링임을 보인다.
// 보너스: 토큰 회수/만료 410, 무효 404 화면.
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(cleanup)

// 픽스처 cmt-001 (visibility='internal'): '[내부] 단가 협의 전이라 인쇄 사양은 미정입니다.'
const INTERNAL_MARKER = '[내부]'
const INTERNAL_BODY = '단가 협의'

describe('DoD-3 코멘트 가시성', () => {
  it('내부 화면(S3 dlv-001)에는 internal 코멘트가 렌더된다 (대조군)', async () => {
    renderRoute('/items/dlv-001')
    expect(await screen.findByText(new RegExp(INTERNAL_BODY))).toBeTruthy()
    expect(document.body.textContent).toContain(INTERNAL_MARKER)
  })

  it('/c/demo 컨펌 큐에는 internal 코멘트가 절대 렌더되지 않고 shared 코멘트만 보인다', async () => {
    renderRoute('/c/demo')
    await screen.findByText('메인 키비주얼')
    // shared(cmt-002)는 보인다
    expect(screen.getByText(/채도를 낮췄습니다/)).toBeTruthy()
    // internal(cmt-001)은 마커·본문 모두 부재
    expect(document.body.textContent).not.toContain(INTERNAL_MARKER)
    expect(document.body.textContent).not.toContain(INTERNAL_BODY)
  })

  it('/c/demo/status에도 internal 코멘트가 렌더되지 않는다', async () => {
    renderRoute('/c/demo/status')
    expect(await screen.findByText('참가자 명찰')).toBeTruthy()
    expect(document.body.textContent).not.toContain(INTERNAL_MARKER)
    expect(document.body.textContent).not.toContain(INTERNAL_BODY)
  })

  it('회수·만료 토큰은 410 안내, 무효 토큰은 404 안내를 보여준다 (§6.3)', async () => {
    renderRoute('/c/tok-revoked')
    expect(await screen.findByText('링크가 만료되었습니다')).toBeTruthy()
    cleanup()

    renderRoute('/c/tok-expired')
    expect(await screen.findByText('링크가 만료되었습니다')).toBeTruthy()
    cleanup()

    renderRoute('/c/no-such-token')
    expect(await screen.findByText('유효하지 않은 링크입니다')).toBeTruthy()
  })
})
