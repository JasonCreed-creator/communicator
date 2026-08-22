// 아티팩트 중첩 경로(/_f/{id}/) 라우팅 증명 — `npm run demo:check:routing`
//
// 파일명이 *.check.tsx라 `npm test`(vitest 기본 include = *.test.*)에는 잡히지 않는다.
// 즉 앱 테스트 수(312)를 바꾸지 않으면서 데모 전용 계약만 따로 검증한다.
//
// jsdom URL은 demo/verify/vitest.config.ts에서 실제 아티팩트 경로로 고정한다.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { AppRoutes } from '../../src/App'

afterEach(() => {
  cleanup()
  document.querySelectorAll('base').forEach((el) => el.remove())
  window.location.hash = ''
})

const ARTIFACT_DIR = '/_f/1787393172-408d/'

describe('아티팩트 중첩 경로 라우팅', () => {
  it('전제: 문서는 중첩 경로로 서빙된다', () => {
    expect(window.location.pathname).toBe(ARTIFACT_DIR)
  })

  it('(회귀) BrowserRouter는 중첩 경로에서 404로 떨어진다 — 데모에 쓰면 안 되는 이유', async () => {
    render(
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>,
    )
    // basename 기본값 '/'이라 location.pathname('/_f/…/')이 어떤 라우트와도 안 맞고 path="*"로 간다.
    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeTruthy()
  })

  it('HashRouter는 같은 경로에서 홈 대시보드(S1)를 렌더한다', async () => {
    expect(window.location.hash).toBe('') // 해시 없음 = 아티팩트 첫 진입 상태
    render(
      <HashRouter>
        <AppRoutes />
      </HashRouter>,
    )
    // 초기 위치를 location.hash에서만 읽으므로(빈 해시 → '/') 경로에 독립적이다.
    expect(await screen.findByText('메인 키비주얼')).toBeTruthy()
    expect(screen.getByText('키비주얼 확정')).toBeTruthy()
    expect(screen.queryByText('페이지를 찾을 수 없습니다')).toBeNull()
  })

  it('<base href>가 있어도 링크가 아티팩트 디렉터리를 벗어나지 않는다', async () => {
    // 퍼블리셔가 주입하는 것과 동일한 base 태그를 재현한다.
    const base = document.createElement('base')
    base.setAttribute('href', ARTIFACT_DIR)
    document.head.appendChild(base)

    render(
      <HashRouter>
        <AppRoutes />
      </HashRouter>,
    )
    await screen.findByText('메인 키비주얼')

    const links = [...document.querySelectorAll('a[href]')] as HTMLAnchorElement[]
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      const href = a.getAttribute('href')!
      // createHashHref는 base가 있으면 "현재 URL + #/path" 절대형을 만든다.
      expect(href.includes('#')).toBe(true)
      const beforeHash = href.slice(0, href.indexOf('#'))
      if (beforeHash !== '') expect(beforeHash).toContain(ARTIFACT_DIR)
      // 아티팩트 디렉터리 밖을 가리키는 루트 절대 경로가 남아 있으면 안 된다.
      expect(/^\/(?!_f\/)/.test(href)).toBe(false)
    }
  })
})
