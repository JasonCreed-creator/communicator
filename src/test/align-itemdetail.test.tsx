/** @vitest-environment jsdom */
// Phase 3.17b → Phase 3.23 PR-4 — 항목 상세 정렬 계약(디자인지시서 v1.4 §7-2.7 · 캔버스 항목 상세).
// 여기서 고정하는 "시각 구조 계약"은 6가지다:
//   (a) 머리 집약 — 복귀 경로(보드 › 카테고리) · 상태 배지 · 담당 역할 도트 · 마감 기한 라벨 · [최신본 내려받기][⋯]
//       (올리기는 머리가 아니라 '다음 단계' 카드 — 채운 버튼은 화면에 1개)
//   (b) 5단계 진행 레일 — 완료(accent 원+체크) / 현재(2px 아웃라인) / 되돌아온 지점(수정요청 = '발주처 컨펌' 칸 negative)
//   (c) '다음 단계' 카드 — 상태 제목 한 줄 + 설명 + 버튼(채운 버튼 최대 1개)
//   (d) 발주처 수정요청이 상태 카드 밖(본문 최상단) 경고 카드로 승격 — 원문 인용 + 결정일시
//   (e) 코멘트 — 공유 건은 steel 틴트 면 + '발주처와 공유' 배지, 내부 메모는 canvas 면
//   (f) 컨펌 기록 타임라인(결정 = 의미 배지) · 정형 문서(큐시트)는 상단 스트립 단일 표시 유지
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    // 복귀 경로 — 보드 › 카테고리 (화면 코드 S3는 v1.4 §7-2.3에서 제거)
    expect(within(crumb).getByRole('link', { name: '디자인 보드' }).getAttribute('href')).toBe(
      '/board/design',
    )
    expect(within(crumb).getByText('키비주얼')).toBeTruthy()
    expect(within(crumb).queryByText('S3')).toBeNull()

    // 상태 배지가 제목 옆에(=헤더 안에) 온다. 제목의 접근성 이름은 오염되지 않는다
    expect(within(header).getAllByText('컨펌대기').some((el) => el.classList.contains('ui-badge'))).toBe(
      true,
    )
    expect(heading.textContent).toBe('메인 키비주얼')

    // 담당 = 형태(역할 도트). 역할에 pill 배지를 쓰지 않는다
    expect(header.querySelector(`span.size-2.rounded-full.${ROLE_BAR_CLASSES.design}`)).toBeTruthy()

    // 마감 + D-day 배지
    expect(within(header).getByText(/마감 .+/)).toBeTruthy()
    expect(within(header).getByText(/^D-\d+$|^오늘$|^\d+일 지남$/)).toBeTruthy()

    // 머리 동작 = 최신본 내려받기(링크) + ⋯ 메뉴. 올리기·발송은 '다음 단계' 카드에(머리에 채운 버튼 없음)
    expect(await within(header).findByRole('link', { name: '최신본 내려받기' })).toBeTruthy()
    expect(within(header).getByRole('button', { name: '항목 메뉴' })).toBeTruthy()
    expect(within(header).queryByRole('button', { name: '새 버전 업로드' })).toBeNull()
    expect(header.querySelectorAll('.btn-accent, .btn-primary')).toHaveLength(0)
  })

  it('화면 전체의 채운 버튼은 최대 1개 — 초안 항목은 다음 단계 카드의 "시안 올리기" 하나', async () => {
    const { container } = renderRoute('/items/dlv-003')
    const next = await screen.findByTestId('next-step-card')
    await within(next).findByRole('button', { name: '시안 올리기' })
    const filled = [...container.querySelectorAll('.btn-accent, .btn-primary')].filter(
      (el) => !el.closest('[data-testid="version-upload-form"], #version-upload-form'),
    )
    expect(filled.map((el) => el.textContent)).toEqual(['시안 올리기'])
  })
})

describe('(b)(c) 5단계 진행 레일 + 다음 단계 카드', () => {
  it('레일 단계 판정 — 완료/현재, 수정요청은 발주처 컨펌 칸으로 되돌아옴, 승인은 확정 칸', () => {
    expect(railStepState('changes_requested', 0)).toBe('done')
    expect(railStepState('changes_requested', 2)).toBe('done')
    expect(railStepState('changes_requested', 3)).toBe('current')
    expect(railStepState('changes_requested', 4)).toBe('future')
    expect(railStepState('internal_review', 1)).toBe('done')
    expect(railStepState('internal_review', 2)).toBe('current')
    expect(railStepState('internal_review', 3)).toBe('future')
    expect(railStepState('approved', 3)).toBe('done')
    expect(railStepState('approved', 4)).toBe('current')
    expect(railStepState('final', 4)).toBe('done')
  })

  it('다음 단계 카드 안에 5단계 레일이 서고, 되돌아온 지점만 negative — 제목 한 줄 + 채운 버튼 1개', async () => {
    // dlv-005 운영 시나리오 — 발주처 수정요청 상태
    renderRoute('/items/dlv-005')
    const rail = await screen.findByRole('list', { name: '진행 단계' })
    const card = screen.getByTestId('next-step-card')
    expect(card.contains(rail)).toBe(true)
    expect(card.className).toContain('ui-card')

    const steps = rail.querySelectorAll('li[data-step-state]')
    expect(steps).toHaveLength(5)
    expect(Array.from(steps).map((el) => el.getAttribute('data-step-state'))).toEqual([
      'done',
      'done',
      'done',
      'current',
      'future',
    ])
    // 되돌아온 지점 = negative 아웃라인(2px) + '수정요청' 라벨 + 진입 커넥터도 negative
    const current = steps[3]
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(current.querySelector('span')!.className).toContain('border-negative')
    expect(current.querySelector('span')!.className).toContain('border-2')
    expect(within(current as HTMLElement).getByText('수정요청')).toBeTruthy()
    expect(rail.querySelector('li[aria-hidden].bg-negative')).toBeTruthy()
    // 완료 칸은 accent 원 + 체크 글리프
    expect(steps[0].querySelector('span.bg-accent svg')).toBeTruthy()
    // 위치 캡션
    expect(within(card).getByText('5단계 중 4단계 · 되돌아옴')).toBeTruthy()

    // 제목 한 줄 + 버튼 — 수정본 올리기(채운 버튼 1개)
    expect(within(card).getByRole('heading', { name: '수정본을 올릴 차례' })).toBeTruthy()
    const buttons = within(card).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['수정본 올리기'])
    expect(buttons[0].className).toContain('btn-accent')
    // 누르면 업로드 카드로 시선이 간다(전이 없음)
    await userEvent.click(buttons[0])
    expect(document.activeElement?.id).toBe('version-upload-file')
  })

  it('컨펌대기 — 보낸 날·기다린 날 한 문장, PM에게 발주처 링크, 채운 버튼 없음', async () => {
    renderRoute('/items/dlv-001')
    const card = await screen.findByTestId('next-step-card')
    expect(within(card).getByRole('heading', { name: '발주처 답을 기다리는 중' })).toBeTruthy()
    expect(within(card).getByText(/^v2를 \d+월 \d+일에 보냈고 \d+일째 답이 없습니다/)).toBeTruthy()
    expect(await within(card).findByRole('button', { name: '발주처 링크 복사' })).toBeTruthy()
    expect(card.querySelectorAll('.btn-accent, .btn-primary')).toHaveLength(0)
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

describe('(e) 코멘트 — 공유는 steel 틴트 + 배지, 내부 메모는 canvas', () => {
  it('shared에는 bg-steel-tint·"발주처와 공유", internal에는 bg-canvas·"내부 메모" · 칩으로 거른다', async () => {
    renderRoute('/items/dlv-001')
    await screen.findByText(/채도를 낮췄습니다/)

    const sharedItem = document.querySelector('li[data-visibility="shared"]') as HTMLElement
    const internalItem = document.querySelector('li[data-visibility="internal"]') as HTMLElement
    expect(sharedItem.className).toContain('bg-steel-tint')
    expect(within(sharedItem).getByText('발주처와 공유').classList.contains('ui-badge')).toBe(true)
    expect(internalItem.className).toContain('bg-canvas')
    expect(internalItem.className).not.toContain('bg-steel-tint')
    expect(within(internalItem).getByText('내부 메모').classList.contains('ui-badge')).toBe(true)
    // 대조군 — internal 코멘트는 내부 화면에는 그대로 보인다(DoD-3의 비노출은 /c 전용)
    expect(within(internalItem).getByText(/단가 협의/)).toBeTruthy()

    const thread = screen.getByRole('region', { name: '코멘트' })
    await userEvent.click(within(thread).getByRole('button', { name: /^발주처와 공유 \d+$/ }))
    expect(thread.querySelectorAll('li[data-visibility="internal"]')).toHaveLength(0)
    expect(thread.querySelectorAll('li[data-visibility="shared"]').length).toBeGreaterThan(0)
  })

  it('쓰기 — 공개 범위를 먼저 고른다(기본 내부 메모), 공유를 고르면 안내가 바뀌고 shared로 저장된다', async () => {
    renderRoute('/items/dlv-003')
    const thread = await screen.findByRole('region', { name: '코멘트' })
    const scope = within(thread).getByRole('group', { name: '코멘트 공개 범위' })
    expect(within(scope).getByRole('button', { name: '내부 메모' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(thread).getByTestId('comment-visibility-note').textContent).toBe('내부 메모는 발주처에게 보이지 않습니다.')
    await userEvent.click(within(scope).getByRole('button', { name: '발주처와 공유' }))
    expect(within(thread).getByTestId('comment-visibility-note').textContent).toBe('발주처 화면에도 보입니다.')
    await userEvent.type(within(thread).getByLabelText('코멘트'), '색상 두 안을 함께 보냅니다.')
    await userEvent.click(within(thread).getByRole('button', { name: '등록' }))
    const li = (await within(thread).findByText('색상 두 안을 함께 보냅니다.')).closest('li')!
    expect(li.getAttribute('data-visibility')).toBe('shared')
    // 등록 뒤 기본값(내부 메모)으로 돌아간다
    expect(within(scope).getByRole('button', { name: '내부 메모' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('(f) 컨펌 기록 + 정형 문서 단일 표시', () => {
  it('컨펌 기록은 오른쪽 열 타임라인 — 발송 · 발주처 답(의미 배지) · 원문', async () => {
    renderRoute('/items/dlv-005')
    const timeline = await screen.findByTestId('approval-timeline')
    expect(timeline.closest('aside')).not.toBeNull()
    expect(within(timeline).getByRole('heading', { name: '컨펌 기록' })).toBeTruthy()
    expect(within(timeline).getAllByText(/발주처에 발송$/).length).toBeGreaterThan(0)
    const decision = within(timeline).getByText('수정요청')
    expect(decision.classList.contains('ui-badge')).toBe(true)
    expect(decision.getAttribute('data-level')).toBe('blocked')
    expect(within(timeline).getByText(/VIP 동선 안내 부분을 더 구체화해 주세요/)).toBeTruthy()
  })

  it('컨펌대기 항목 — 열린 컨펌은 "발주처 답 — 아직 없음", 발송본 버전에 표시', async () => {
    renderRoute('/items/dlv-001')
    const timeline = await screen.findByTestId('approval-timeline')
    expect(within(timeline).getByText(/^아직 없음/)).toBeTruthy()
    const versions = screen.getByRole('region', { name: '버전 이력' })
    const v2 = within(versions).getByText('v2').closest('button')!
    expect(within(v2).getByText('발송본')).toBeTruthy()
  })

  it('큰 미리보기 — 최신 시안이 본문 폭 16:9, 버전을 누르면 같은 자리에서 바뀐다', async () => {
    renderRoute('/items/dlv-001')
    const preview = await screen.findByTestId('version-preview')
    expect(preview.querySelector('.aspect-video')).not.toBeNull()
    expect(within(preview).getAllByTitle(/_v2\.png$/).length).toBeGreaterThan(0)
    // 머리의 버전 토글(2개) — v1을 누르면 파일 이름이 바뀐다
    await userEvent.click(within(preview).getByRole('button', { name: 'v1' }))
    expect(within(preview).getAllByTitle(/_v1\.ai$/).length).toBeGreaterThan(0)
    expect(within(preview).getByText(/이 형식은 화면에서 미리볼 수 없습니다/)).toBeTruthy()
    // 오른쪽 목록으로도 고른다 — 고른 버전은 눌린 표시
    const list = screen.getByRole('region', { name: '버전 이력' })
    const v2 = within(list).getByText('v2').closest('button')!
    await userEvent.click(v2)
    expect(v2.getAttribute('aria-pressed')).toBe('true')
    expect(within(preview).getAllByTitle(/_v2\.png$/).length).toBeGreaterThan(0)
  })

  it('큐시트(§7-2.8)는 메타를 머리 한 줄에만(스트립 없음) · 레일 없음 · 대본 칸 옆에 코멘트·컨펌 기록', async () => {
    renderRoute('/items/dlv-004')
    const heading = await screen.findByRole('heading', { name: '개막식 큐시트' })
    const crumb = screen.getByRole('navigation', { name: '위치' })
    const header = crumb.parentElement!
    expect(heading.textContent).toBe('개막식 큐시트')
    // 머리 메타 — 상태 배지 · 담당 도트 · 마감 · 최신 버전
    expect(within(header).getAllByText('내부검토').some((el) => el.classList.contains('ui-badge'))).toBe(true)
    expect(within(header).getByText(/^최신 v\d+ · \d+월 \d+일$/)).toBeTruthy()
    // 옛 메타 스트립(상태·담당·마감 칸 이름)과 레일은 없다
    expect(screen.queryByText('상태')).toBeNull()
    expect(screen.queryByText('버전 이력')).toBeNull()
    expect(screen.queryByRole('list', { name: '진행 단계' })).toBeNull()
    // 복귀 경로
    expect(within(crumb).getByRole('link', { name: '운영 보드' }).getAttribute('href')).toBe('/board/ops')
    // 대본 칸 오른쪽에 코멘트·컨펌 기록
    const panel = await screen.findByTestId('cue-script-panel')
    const row = panel.parentElement!
    expect(within(row).getByRole('region', { name: '코멘트' })).toBeTruthy()
    expect(within(row).getByTestId('approval-timeline')).toBeTruthy()
  })
})
