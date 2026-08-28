/** @vitest-environment jsdom */
// Phase 3.17b — 디자인 보드 · 운영 보드(S2) 시안 정렬 계약.
// 시안 정본 = `디자인 · 운영 보드.dc.html` + 패턴 기준 시트(§03 배지 4단계 · §05 표 · §06 빈 상태 · §07 진행 막대).
// 여기서 고정하는 것은 "시각 구조 계약" 6가지다:
//   (a) 항목 행이 고정 열 그리드(상태 92 · 제목 flex · 버전 48 · 담당 84 · 마감 132 · 액션 96)
//   (b) 담당은 이름 앞 역할 도트(형태) — 역할에 pill 배지를 쓰지 않는다 / 좌측 3px 상태 스트립 유지
//   (c) 상태 범례가 의미 4단계 + 중립으로 묶이고 각 묶음에 단계 이름이 붙는다
//   (d) 그룹 헤딩에 진행 막대 + '확정 n/m'
//   (e) 유형 카드에 진행 막대 — '3건'이 '3건 중 확정 n'으로 읽힌다
//   (f) 빈 상태 ②(문서 없음)와 ③(필터 결과 없음)이 갈린다
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ROLE_BAR_CLASSES } from '../lib/labels'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('3.17b (a)(b) 항목 행 — 고정 열 그리드 + 역할 도트', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
  })

  it('행이 flex-wrap이 아니라 시안의 고정 열 폭 그리드로 선다', async () => {
    renderRoute('/board/design')
    const row = (await screen.findByText('메인 키비주얼')).closest('li')!
    const grid = row.querySelector('a')!

    expect(grid.className).toContain('grid-cols-[92px_minmax(0,1fr)_48px_84px_132px_96px]')
    expect(grid.className).not.toContain('flex-wrap')
  })

  it('담당은 이름 앞 역할 도트(8px)로 표시되고, 좌측 3px 상태 스트립은 유지된다', async () => {
    renderRoute('/board/design')
    const row = (await screen.findByText('메인 키비주얼')).closest('li')!

    // 역할 = 형태(도트). design 담당이면 역할 컬러가 그대로 온다
    const dot = row.querySelector(`span.size-2.rounded-full.${ROLE_BAR_CLASSES.design}`)
    expect(dot).toBeTruthy()
    // 상태 스트립(3px)은 그대로
    expect(row.querySelector('span.w-\\[3px\\]')).toBeTruthy()
    // 제목이 잘려도 전체 값을 볼 수 있어야 한다(표 정본 조건 2)
    expect(screen.getByText('메인 키비주얼').getAttribute('title')).toBe('메인 키비주얼')
  })
})

describe('3.17b (c) 상태 범례 — 의미 4단계 + 중립', () => {
  it('7개 나열이 아니라 단계별로 묶이고 각 묶음에 단계 이름이 붙는다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/design')

    const legend = await screen.findByLabelText('상태 범례')
    for (const level of ['중립', '진행', '주의', '정상', '차단']) {
      expect(within(legend).getByText(level), `${level} 단계 이름 없음`).toBeTruthy()
    }
    // 묶음 = 단계별 그룹 5개. 상태 배지 자체(도움말 title 포함)는 그대로 살아 있다
    expect(legend.querySelectorAll('[data-legend-level]')).toHaveLength(5)
    expect(within(legend).getByText('컨펌대기').getAttribute('data-level')).toBe('attention')
    expect(within(legend).getByText('초안').getAttribute('data-level')).toBe('neutral')
  })
})

describe('3.17b (d)(e) 진행 막대 — 그룹 헤딩 · 유형 카드', () => {
  it('그룹 헤딩에 진행 막대와 "확정 n/m"이 붙는다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/design')
    await screen.findByText('메인 키비주얼')

    const bars = screen.getAllByTestId('board-group-progress')
    expect(bars.length).toBeGreaterThan(0)
    expect(bars[0].className).toContain('w-[88px]')
    expect(screen.getAllByText(/^확정 \d+\/\d+$/).length).toBeGreaterThan(0)
  })

  it('유형 카드에 진행 막대가 있어 "n건"이 "확정 n/m"으로 읽힌다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-rebuild27')
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const card = screen.getByTestId('ops-doc-card-cuesheet')
    expect(within(card).getByTestId('ops-doc-card-progress-cuesheet')).toBeTruthy()
    // 건수 노드는 그대로 남고(카드 요약 계약), 확정 캡션이 곁들여진다
    expect(within(card).getByText('1건')).toBeTruthy()
    expect(within(card).getByText(/^확정 \d+\/1$/)).toBeTruthy()
  })
})

describe('3.17b (f) 빈 상태 — ② 문서 없음 / ③ 필터 결과 없음', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', 'prj-rebuild27')
  })

  it('필터가 걸려 0건이면 ③ — 전체 건수 + 필터 칩 + 초기화가 함께 뜬다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    await userEvent.type(screen.getByLabelText('제목 검색'), '존재하지않는제목')

    expect(screen.getByText(/조건에 맞는 항목이 없습니다\./)).toBeTruthy()
    expect(screen.getByText('존재하지않는제목')).toBeTruthy() // 적용된 필터 칩
    const reset = screen.getByRole('button', { name: '필터 초기화' })

    // 전체 건수는 걸러지지 않은 실제 ops 항목 수와 같다
    const total = (await mockProvider().listDeliverables('prj-rebuild27', { area: 'ops' })).length
    expect(screen.getByText(new RegExp(`전체 ${total}건 중 0건`))).toBeTruthy()

    // 초기화하면 목록이 돌아온다
    await userEvent.click(reset)
    expect(await screen.findByText('개막 세션 큐시트')).toBeTruthy()
  })

  it('필터가 없는데 0건이면 ② — "문서 없음"이고 ③의 필터 칩·초기화는 뜨지 않는다', async () => {
    // RE:BUILD 26 샘플 행사에는 운영가이드 항목이 아직 없다(§23.4 이전 픽스처) — 필터 0건이 아니라
    // "아직 만든 적 없음"이므로 ②가 떠야 한다.
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/ops')
    await screen.findByText('개막식 큐시트')

    const guideCard = screen.getByTestId('ops-doc-card-guide')
    expect(within(guideCard).getByText('0건')).toBeTruthy()
    await userEvent.click(within(guideCard).getByRole('button', { name: '운영가이드' }))

    expect(await screen.findByText('아직 운영가이드 문서가 없습니다.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '필터 초기화' })).toBeNull()
    expect(screen.queryByText(/조건에 맞는 항목이 없습니다\./)).toBeNull()
  })
})
