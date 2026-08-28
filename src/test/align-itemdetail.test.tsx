/** @vitest-environment jsdom */
// Phase 3.17b — 항목 상세(S3) 시안 정렬 계약.
// 시안 정본 = `항목 상세.dc.html` + 패턴 기준 시트(§03 배지 · §04 역할=형태 · §05 표 정본).
// 여기서 고정하는 "시각 구조 계약"은 6가지다:
//   (a) 헤더 집약 — 복귀 경로(보드 › 카테고리 › S3) · 상태 배지 · 담당 역할 도트 · 마감 D-day · 주 액션 2개
//   (b) 6단계 진행 레일 — 완료(accent 원+체크) / 현재(2px 아웃라인) / 되돌아온 지점(negative)
//   (c) 레일 아래 '다음 단계' 블록 — 할 일 하나 + 버튼 하나
//   (d) 발주처 수정요청이 상태 카드 밖(본문 최상단) 경고 카드로 승격 — 원문 인용 + 결정일시
//   (e) 코멘트는 공유(shared) 건만 좌측 3px steel 보더 / internal에는 없다
//   (f) 컨펌 이력 표에 표 정본(.ui-table + .ui-th) 적용, 정형 문서(큐시트)는 상단 스트립 단일 표시 유지
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ROLE_BAR_CLASSES } from '../lib/labels'
import { railStepState } from '../pages/ItemDetailPage'
import { renderRoute } from './testUtils'

afterEach(cleanup)

beforeEach(() => {
  localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
})

describe('3.17b (a) 헤더 집약', () => {
  it('복귀 경로·상태 배지·담당 역할 도트·마감 D-day·주 액션 2개가 헤더 한 덩어리에 모인다', async () => {
    // dlv-001 메인 키비주얼 — design · 컨펌대기 · 담당 이디자 · 마감 2026-09-04
    renderRoute('/items/dlv-001')
    const heading = await screen.findByRole('heading', { name: '메인 키비주얼' })
    const crumb = screen.getByRole('navigation', { name: '위치' })
    const header = crumb.parentElement!

    // 복귀 경로 — 보드 › 카테고리 › S3
    expect(within(crumb).getByRole('link', { name: '디자인 보드' }).getAttribute('href')).toBe(
      '/board/design',
    )
    expect(within(crumb).getByText('키비주얼')).toBeTruthy()
    expect(within(crumb).getByText('S3')).toBeTruthy()

    // 상태 배지가 제목 옆에(=헤더 안에) 온다. 제목의 접근성 이름은 오염되지 않는다
    expect(within(header).getAllByText('컨펌대기').some((el) => el.classList.contains('ui-badge'))).toBe(
      true,
    )
    expect(heading.textContent).toBe('메인 키비주얼')

    // 담당 = 형태(역할 도트). 역할에 pill 배지를 쓰지 않는다
    expect(header.querySelector(`span.size-2.rounded-full.${ROLE_BAR_CLASSES.design}`)).toBeTruthy()

    // 마감 + D-day 배지
    expect(within(header).getByText(/마감 .+/)).toBeTruthy()
    expect(within(header).getByText(/^D[-+]\d+$|^D-day$/)).toBeTruthy()

    // 주 액션 2개 — 최신본 다운로드(링크) + 새 버전 업로드(주 버튼)
    expect(await within(header).findByRole('link', { name: '최신본 다운로드' })).toBeTruthy()
    expect(within(header).getByRole('button', { name: '새 버전 업로드' })).toBeTruthy()
  })
})

describe('3.17b (b)(c) 6단계 진행 레일 + 다음 단계', () => {
  it('레일 단계 판정 — 완료/현재/되돌아온 지점(수정요청)', () => {
    // 지나온 4단계는 완료, 수정요청 칸이 현재, 확정은 아직
    expect(railStepState('changes_requested', 0)).toBe('done')
    expect(railStepState('changes_requested', 3)).toBe('done')
    expect(railStepState('changes_requested', 4)).toBe('current')
    expect(railStepState('changes_requested', 5)).toBe('future')
    // 정상 진행 중에는 수정요청 칸을 지나온 단계로 치지 않는다
    expect(railStepState('internal_review', 1)).toBe('done')
    expect(railStepState('internal_review', 2)).toBe('current')
    expect(railStepState('internal_review', 4)).toBe('future')
    expect(railStepState('final', 4)).toBe('future')
    expect(railStepState('final', 5)).toBe('done')
  })

  it('상태 액션 카드 안에 6단계 레일이 서고, 되돌아온 지점만 negative로 표시된다', async () => {
    // dlv-005 운영 시나리오 — 발주처 수정요청 상태
    renderRoute('/items/dlv-005')
    const rail = await screen.findByRole('list', { name: '진행 단계' })

    // 카드 안(상태 액션) — 별도 화면으로 빠지지 않는다
    expect(rail.closest('.ui-card')).toBeTruthy()
    const steps = rail.querySelectorAll('li[data-step-state]')
    expect(steps).toHaveLength(6)
    expect(Array.from(steps).map((el) => el.getAttribute('data-step-state'))).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
      'future',
    ])
    // 되돌아온 지점 = negative 아웃라인(2px) + 진입 커넥터도 negative
    const current = steps[4]
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(current.querySelector('span')!.className).toContain('border-negative')
    expect(current.querySelector('span')!.className).toContain('border-2')
    expect(rail.querySelector('li[aria-hidden].bg-negative')).toBeTruthy()
    // 완료 칸은 accent 원 + 체크 글리프
    expect(steps[0].querySelector('span.bg-accent svg')).toBeTruthy()

    // 카드 헤더에 위치 캡션
    expect(screen.getByText('6단계 중 5단계 · 되돌아옴')).toBeTruthy()

    // (c) 레일 아래 '다음 단계' 블록 — 할 일 하나 + 버튼 하나
    const next = screen.getByText('다음 단계 — 수정본 업로드').closest('div')!.parentElement!
    expect(within(next).getAllByRole('button')).toHaveLength(1)
  })
})

describe('3.17b (d) 발주처 수정요청 경고 카드', () => {
  it('상태 카드 밖(본문 최상단)에서 원문 인용 + 결정일시로 뜬다', async () => {
    renderRoute('/items/dlv-005')
    const alert = (await screen.findByText(/^발주처가 수정을 요청했습니다 — /)).closest(
      'div[role="status"]',
    ) as HTMLElement

    expect(alert).toBeTruthy()
    // 상태 액션 카드 안이 아니다(승격)
    expect(alert.closest('.ui-card')).toBeNull()
    // 원문 인용 — 발주처 코멘트 전문
    expect(within(alert).getByText(/VIP 동선 안내 부분을 더 구체화해 주세요/)).toBeTruthy()
    expect(within(alert).getByText(/새 버전을 업로드하면 자동으로 초안\(draft\) 상태로 돌아갑니다/)).toBeTruthy()
  })
})

describe('3.17b (e) 코멘트 — 공유 건만 좌측 3px steel 보더', () => {
  it('shared에는 border-l-steel이 붙고 internal에는 붙지 않는다', async () => {
    renderRoute('/items/dlv-001')
    await screen.findByText(/채도를 낮췄습니다/)

    const sharedItem = document.querySelector('li[data-visibility="shared"]')!
    const internalItem = document.querySelector('li[data-visibility="internal"]')!
    expect(sharedItem.className).toContain('border-l-[3px]')
    expect(sharedItem.className).toContain('border-l-steel')
    expect(internalItem.className).not.toContain('border-l-steel')
    // 대조군 — internal 코멘트는 내부 화면에는 그대로 보인다(DoD-3의 비노출은 /c 전용)
    expect(within(internalItem as HTMLElement).getByText(/단가 협의/)).toBeTruthy()
  })
})

describe('3.17b (f) 표 정본 + 정형 문서 단일 표시', () => {
  it('컨펌 이력 표가 .ui-table/.ui-th 정본을 쓰고 결정은 의미 배지로 그려진다', async () => {
    renderRoute('/items/dlv-005')
    await screen.findByRole('heading', { name: '컨펌 이력' })

    const table = document.querySelector('table.ui-table') as HTMLTableElement
    expect(table).toBeTruthy()
    expect(table.querySelectorAll('th.ui-th')).toHaveLength(5)
    const decision = within(table).getByText('수정요청')
    expect(decision.classList.contains('ui-badge')).toBe(true)
    expect(decision.getAttribute('data-level')).toBe('blocked')
  })

  it('정형 문서(큐시트)는 상단 스트립 단일 표시를 유지한다 — 헤더 메타·레일 없음', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByRole('heading', { name: '개막식 큐시트' })

    // 3.16.3/3.16.4 계약 — 메타는 상단 스트립 1곳뿐
    expect(screen.getAllByText('상태')).toHaveLength(1)
    expect(screen.getAllByText('담당')).toHaveLength(1)
    expect(screen.getAllByText('마감')).toHaveLength(1)
    expect(screen.queryByRole('list', { name: '진행 단계' })).toBeNull()
    // 복귀 경로는 정형 문서에도 남는다
    const crumb = screen.getByRole('navigation', { name: '위치' })
    expect(within(crumb).getByRole('link', { name: '운영 보드' }).getAttribute('href')).toBe('/board/ops')
  })
})
