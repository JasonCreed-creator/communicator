/** @vitest-environment jsdom */
// Phase 3.16.3 — 챗 상호작용 실검수(2026-08-28) 결함 수정 검증.
// T1 InfoTip 뷰포트 클램프(순수 판정 함수 + 컴포넌트 클램프 적용) ·
// T2 사이드바/발주처 탭 hover 하이라이트 클래스 계약 ·
// T3① S9 존별 운영 단일 표시 · T3② S3 정형 문서 하단 메타 카드 제거.
// 실 브라우저 픽셀 실측(툴팁이 뷰포트 안에 완전 노출되는가)은 상호작용 스모크
// (demo/verify/interaction-smoke.mjs, CLAUDE.md §7 상시 항목)가 담당한다.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import InfoTip, { resolveTipPlacement } from '../components/internal/InfoTip'
import { PROJECT_ID, PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('T1 — resolveTipPlacement 클램프 판정(순수 함수)', () => {
  const viewport = { width: 1440, height: 900 }
  const anchor = { left: 1240, right: 1256, top: 100, bottom: 116, width: 16, height: 16 }

  it('우측 넘침이면 오른쪽 정렬 — 실측 재현 케이스(x1244 + w240 = 1484 > 1440)', () => {
    const tip = { left: 1244, right: 1484, top: 122, bottom: 180, width: 240, height: 58 }
    expect(resolveTipPlacement(tip, anchor, viewport)).toEqual({ align: 'right', flipUp: false })
  })

  it('좌측 넘침이면 왼쪽 정렬', () => {
    const leftAnchor = { ...anchor, left: 4, right: 20 }
    const tip = { left: -108, right: 132, top: 122, bottom: 180, width: 240, height: 58 }
    expect(resolveTipPlacement(tip, leftAnchor, viewport)).toEqual({ align: 'left', flipUp: false })
  })

  it('뷰포트 안에 다 들어가면 중앙 유지', () => {
    const midAnchor = { ...anchor, left: 700, right: 716 }
    const tip = { left: 588, right: 828, top: 122, bottom: 180, width: 240, height: 58 }
    expect(resolveTipPlacement(tip, midAnchor, viewport)).toEqual({ align: 'center', flipUp: false })
  })

  it('하단 넘침 + 위 공간이 있으면 위로 반전한다', () => {
    const lowAnchor = { left: 700, right: 716, top: 820, bottom: 836, width: 16, height: 16 }
    const tip = { left: 588, right: 828, top: 842, bottom: 900, width: 240, height: 58 }
    expect(resolveTipPlacement(tip, lowAnchor, viewport).flipUp).toBe(true)
  })

  it('하단이 넘쳐도 위 공간이 없으면 반전하지 않는다', () => {
    const shortViewport = { width: 1440, height: 120 }
    const topAnchor = { left: 700, right: 716, top: 40, bottom: 56, width: 16, height: 16 }
    const tip = { left: 588, right: 828, top: 62, bottom: 120, width: 240, height: 58 }
    expect(resolveTipPlacement(tip, topAnchor, shortViewport).flipUp).toBe(false)
  })
})

describe('T1 — InfoTip 컴포넌트 클램프 적용', () => {
  it('호버로 열리고 실측 기반 클램프 클래스가 적용된다(jsdom 0-rect → 왼쪽 정렬 경로)', async () => {
    render(<InfoTip text="도움말 본문" />)
    await userEvent.hover(screen.getByRole('button', { name: '도움말' }))
    const tip = await screen.findByRole('tooltip')
    expect(tip.textContent).toBe('도움말 본문')
    // jsdom getBoundingClientRect는 전부 0 — left(0) < margin(8)이라 왼쪽 정렬로 클램프된다.
    // 중앙 정렬 고정(translateX(-50%))이 풀렸다는 사실 자체가 클램프 경로의 증명이다.
    expect(tip.className).toContain('left-0')
    expect(tip.style.transform).toBe('')
    await userEvent.unhover(screen.getByRole('button', { name: '도움말' }))
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })
})

describe('T2 — hover 하이라이트 클래스 계약', () => {
  it('사이드바 비활성 메뉴 항목에 hover 배경·transition 토큰이 있다(활성 항목은 현행 유지)', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })
    const nav = document.querySelector('aside nav')
    expect(nav).not.toBeNull()
    const row = within(nav as HTMLElement).getByRole('link', { name: '일정' }).querySelector('span')!
    expect(row.className).toContain('hover:bg-dark-ink/10')
    expect(row.className).toContain('transition-colors')
    // 활성 항목(홈, 주황 바+font-medium)은 hover 배경 없이 현행 유지
    const active = within(nav as HTMLElement).getByRole('link', { name: '홈' }).querySelector('span')!
    expect(active.className).toContain('font-medium')
    expect(active.className).not.toContain('hover:bg-dark-ink/10')
  })

  it('발주처 상단 탭 비활성 항목에 hover 배경·transition 토큰이 있다', async () => {
    renderRoute('/c/demo')
    const statusTab = await screen.findByRole('link', { name: '진행 현황' })
    expect(statusTab.className).toContain('hover:bg-track')
    expect(statusTab.className).toContain('transition-colors')
  })
})

describe('T3① — S9 ④존별 운영 단일 표시', () => {
  it('가이드 존 섹션이 있으면(RB27) 그것만 정본으로 표시 — 존운영 항목은 이중 렌더하지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')
    const heading = await screen.findByRole('heading', { name: /존별 운영/ })
    const section = heading.closest('section')!
    await within(section).findByText('운영가이드 존 섹션')
    // 존운영 항목은 <article>로 그려진다 — 가이드 존 섹션이 정본이면 article 0건이어야 한다
    // (제목 문자열은 가이드 마크다운 본문에도 남으므로 텍스트가 아니라 구조 단위로 판정)
    expect(section.querySelectorAll('article')).toHaveLength(0)
  })

  it('가이드 존 섹션이 없으면(prj-stc26) 기존 존운영 항목 렌더 유지 — 회귀 없음', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/plan')
    const heading = await screen.findByRole('heading', { name: /존별 운영/ })
    const section = heading.closest('section')!
    await within(section).findByText('등록존 운영')
    expect(within(section).queryByText('운영가이드 존 섹션')).toBeNull()
  })
})

describe('T3② — S3 정형 문서 하단 메타 카드 제거', () => {
  it('빌더 문서(RB27 시나리오)는 메타가 상단 스트립 1곳뿐 — 상태·담당·마감·버전 이력 중복 0', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/items/dlv-rb27-scenario-01')
    await screen.findByRole('heading', { name: '진행 시나리오 (가안)' })
    await screen.findByText('상태') // 메타 스트립 로드 대기
    expect(screen.getAllByText('상태')).toHaveLength(1)
    expect(screen.getAllByText('담당')).toHaveLength(1)
    expect(screen.getAllByText('마감')).toHaveLength(1)
    expect(screen.getAllByText('버전 이력')).toHaveLength(1)
    // 사이드바(aside) 외에 본문 메타 aside가 없다
    expect(document.querySelectorAll('main aside')).toHaveLength(0)
  })

  it('레거시 파일 문서(dlv-005 운영 시나리오)는 2단 유지 — 우측 메타 카드가 남는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/items/dlv-005')
    await screen.findByRole('heading', { name: '운영 시나리오' })
    await screen.findByText('상태')
    expect(document.querySelectorAll('main aside')).toHaveLength(1)
    expect(screen.getAllByText('버전 이력')).toHaveLength(1)
  })
})
