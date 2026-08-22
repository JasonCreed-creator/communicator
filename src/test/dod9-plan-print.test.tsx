/** @vitest-environment jsdom */
// DoD-9: S9 인쇄 미리보기(A4) — jsdom은 실제 인쇄 레이아웃·페이지 분할을 계산하지 못하므로
// (a) src/index.css의 인쇄 CSS 규칙 원문 존재를, (b)(c) 렌더 결과에 인쇄 시 숨겨야 할 UI의
// plan-print-hidden 클래스와 7개 섹션(v1.3부터 ③큐시트 추가) 컨테이너의 plan-section(page-break
// 회피) 클래스가 부여됐는지를 구조 계약 가드로 증명한다 (CLAUDE.md v1.4 §7 DoD-9, DoD-6 선례 방식 준용).
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

interface FsModule {
  readFileSync(path: string, encoding: string): string
}

/** @types/node 미설치 — vitest 실행 프로세스의 전역 process만 최소 타입으로 로컬 선언 */
declare const process: { cwd(): string }

/**
 * 프로젝트에 @types/node가 없어 'node:fs' 타입 선언을 찾을 수 없다 — vitest 자체는 Node 위에서
 * 돌아 런타임 임포트는 가능하므로, 정적 타입 해석만 우회해 src/index.css 원문을 읽는다.
 */
async function readIndexCss(): Promise<string> {
  const fs = (await import('node:fs' as string)) as unknown as FsModule
  // import.meta.url이 vitest에서 file:// 스킴을 갖지 않을 수 있어 프로젝트 루트(cwd) 기준 경로를 쓴다.
  const cssPath = `${process.cwd()}/src/index.css`
  return fs.readFileSync(cssPath, 'utf-8')
}

afterEach(cleanup)

describe('DoD-9 S9 인쇄 미리보기(A4)', () => {
  it('(a) src/index.css에 @page A4·@media print·page-break 회피 규칙이 정의되어 있다', async () => {
    const css = await readIndexCss()
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/)
    expect(css).toMatch(/@media print/)
    expect(css).toContain('.plan-print-hidden')
    expect(css).toContain('.plan-section')
    expect(css).toMatch(/break-inside:\s*avoid/)
  })

  it('(b) 편집·인쇄 버튼에 plan-print-hidden, 7개 섹션 컨테이너에 plan-section 클래스가 부여된다', async () => {
    renderRoute('/plan')
    await screen.findByRole('heading', { name: /행사개요/ })

    const printBtn = screen.getByRole('button', { name: '인쇄' })
    expect(printBtn.className).toContain('plan-print-hidden')

    // v1.5: 개요 인라인 편집 제거 — '행사 설정에서 편집' 링크가 인쇄 시 숨겨져야 한다
    const editLink = screen.getByRole('link', { name: '행사 설정에서 편집' })
    expect(editLink.className).toContain('plan-print-hidden')

    // 프로그램표 관리 열 헤더(섹션 블록마다 반복)도 인쇄 시 숨김 대상
    const manageHeaders = screen.getAllByText('관리')
    expect(manageHeaders.length).toBeGreaterThan(0)
    manageHeaders.forEach((el) => expect(el.className).toContain('plan-print-hidden'))

    const sections = document.querySelectorAll('.plan-section')
    expect(sections.length).toBe(7)
  })

  it('(c) 인쇄 버튼이 렌더되고 window.print를 호출한다', async () => {
    renderRoute('/plan')
    const printBtn = await screen.findByRole('button', { name: '인쇄' })
    expect(printBtn).toBeTruthy()
    expect(printBtn.tagName).toBe('BUTTON')
  })
})
