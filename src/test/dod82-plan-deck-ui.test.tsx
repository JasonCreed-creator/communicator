/** @vitest-environment jsdom */
// DoD 82 (Phase 3.24 PR-C · 설계서 v2.13.2 §23.7 · 디자인지시서 §7-2.15) — 화면:
// 운영계획서(S9) '16:9 장표' 링크 · 장표 화면(사이드바 없음 · 장 수 = 조립 결과 · 1쪽 표지 · 목차 쪽 번호) ·
// 싣지 못한 표 펼침 · 인쇄 버튼 · 탭 제목(PDF 파일 이름) · 인쇄 CSS(@page deck 16:9 · 장마다 쪽 넘김).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPlanDeck } from '../components/plan/deck/planDeck'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD 82 화면 ① 운영계획서 → 16:9 장표', () => {
  it("S9 발행 줄에 '16:9 장표' 링크(/plan/deck)", async () => {
    renderRoute('/plan')
    const link = await screen.findByRole('link', { name: '16:9 장표' })
    expect(link.getAttribute('href')).toBe('/plan/deck')
  })

  it('장표 화면 = 사이드바 없음 · 장 수가 조립 결과와 같다 · 1쪽 표지 · 2쪽 목차 · 목차 쪽 번호가 그 장을 가리킨다', async () => {
    renderRoute('/plan/deck')
    const slides = await screen.findAllByTestId('deck-slide')
    const plan = await mockProvider().getPlan('prj-stc26')
    expect(slides).toHaveLength(buildPlanDeck(plan).slides.length)
    expect(screen.queryByRole('link', { name: /^홈$/ })).toBeNull()
    expect(slides[0].getAttribute('aria-label')).toBe('1쪽 — 표지')
    expect(slides[1].getAttribute('aria-label')).toBe('2쪽 — 목차')
    expect(within(slides[0]).getByRole('heading', { level: 1, name: '운영계획서' })).toBeTruthy()
    expect(within(slides[0]).getByText(plan.project.name)).toBeTruthy()
    const entries = within(slides[1]).getAllByTestId('deck-toc-entry')
    expect(entries).toHaveLength(8)
    for (const e of entries) {
      const no = Number(e.getAttribute('data-slide-no'))
      expect(slides[no - 1].getAttribute('data-chapter')).toBe(e.getAttribute('data-chapter'))
    }
    // 꼬리 줄 쪽 번호
    expect(within(slides[2]).getByText(`3 / ${slides.length}`)).toBeTruthy()
    await waitFor(() => expect(document.title).toBe(`${plan.project.name} 운영계획서 (16:9)`))
  })

  it("'싣지 못한 표 n개' → 어디서 채우는지 목록 · 인쇄 버튼은 window.print", async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderRoute('/plan/deck')
    await screen.findAllByTestId('deck-slide')
    const gaps = screen.getByRole('button', { name: /^싣지 못한 표 \d+개$/ })
    expect(gaps.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(gaps)
    expect(gaps.getAttribute('aria-expanded')).toBe('true')
    const list = document.getElementById('deck-gaps') as HTMLElement
    expect(within(list).getByText('현장 인력·콜타임')).toBeTruthy()
    expect(within(list).getAllByText(/에서 채우면 들어갑니다/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '인쇄 · PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: '← 운영계획서' }).getAttribute('href')).toBe('/plan')
    print.mockRestore()
  })

  it('빈 장은 "아직 채운 내용이 없습니다" + 어디서 채우는지', async () => {
    renderRoute('/plan/deck')
    const slides = await screen.findAllByTestId('deck-slide')
    const safety = slides.filter((s) => s.getAttribute('data-chapter') === 'safety')
    expect(safety.length).toBeGreaterThan(0)
    const text = safety.map((s) => s.textContent).join(' ')
    expect(text).toMatch(/비상 대응|아직 채운 내용이 없습니다/)
  })
})

describe('DoD 82 화면 ② 인쇄 규칙(16:9)', () => {
  it('@page deck = 338.67mm × 190.5mm · 여백 0 · 장표 틀마다 page: deck + 쪽 넘김 · 화면 배율 해제', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/@page deck\s*\{\s*size:\s*338\.67mm 190\.5mm;\s*margin:\s*0;/)
    const zoomRule = /\.deck-zoom\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(zoomRule).toMatch(/zoom:\s*1 !important/)
    expect(zoomRule).toMatch(/page:\s*deck/)
    expect(zoomRule).toMatch(/break-after:\s*page/)
    // A4 운영계획서 규칙은 그대로
    expect(css).toMatch(/@page\s*\{\s*size:\s*A4;/)
  })
})
