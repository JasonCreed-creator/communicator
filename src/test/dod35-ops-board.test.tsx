/** @vitest-environment jsdom */
// DoD 35 (v2.5 §23) — 유형 우선 보드: 카드 4종 렌더·건수 정확, 기존 운영 항목 자동 분류
// 이관 무손실(R-O1), 정형 카테고리 선택·생성 시 빌더가 인라인으로 열림.
// 세부 상호작용(카드 좁히기·레거시 보호)은 ops-board-home.test.tsx(3.16b)가 정본 —
// 이 파일은 DoD 문장 자체를 보완 각도(데이터 스냅숏 불변·운영가이드 카테고리)로 증명한다.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD 35 — 유형 우선 보드 (RE:BUILD 27)', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
  })

  it('(a) 카드 4종이 렌더되고 건수 합이 전체 ops 항목 수와 같다', async () => {
    const total = (await mockProvider().listDeliverables(PROJECT_ID_REBUILD27, { area: 'ops' }))
      .length

    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    let sum = 0
    for (const key of ['cuesheet', 'scenario', 'guide', 'other']) {
      const card = screen.getByTestId(`ops-doc-card-${key}`)
      sum += Number((within(card).getByText(/^\d+건$/).textContent ?? '0건').replace('건', ''))
    }
    expect(sum).toBe(total)
    expect(total).toBeGreaterThan(0)
  })

  it('(b) R-O1 — 이관은 표시 레벨 분류일 뿐, 렌더 전후 항목 데이터(카테고리 포함)가 그대로다', async () => {
    const p = mockProvider()
    const before = JSON.stringify(
      (await p.listDeliverables(PROJECT_ID_REBUILD27, { area: 'ops' })).map((d) => ({
        id: d.id,
        category: d.category,
        title: d.title,
        status: d.status,
      })),
    )

    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const after = JSON.stringify(
      (await p.listDeliverables(PROJECT_ID_REBUILD27, { area: 'ops' })).map((d) => ({
        id: d.id,
        category: d.category,
        title: d.title,
        status: d.status,
      })),
    )
    expect(after).toBe(before)
  })

  // ── P10 (챗 검수 후속, 2026-08-28) — 카드 = 선택 컨트롤 ─────────────────────
  it('(P10-a) 카드 선택 시 그 유형만 렌더되고, 기존 "빌더 열기" 인라인 펼침이 그 범위 안에서 동작한다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const cuesheetCard = screen.getByTestId('ops-doc-card-cuesheet')
    const cardButton = within(cuesheetCard).getByRole('button', { name: '큐시트' })
    expect(cardButton.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(cardButton)
    expect(cardButton.getAttribute('aria-pressed')).toBe('true')
    // 선택 스타일 — 주황 테두리 + 틴트 링(시각안 v2.5 화면 A)
    expect(cuesheetCard.className).toContain('border-accent')
    expect(cuesheetCard.className).toContain('ring-accent-tint')

    // 그 유형만 남는다 — 다른 유형 그룹 숨김
    expect(screen.getByText('개막 세션 큐시트')).toBeTruthy()
    expect(screen.queryByText('진행 시나리오 (가안)')).toBeNull()
    expect(screen.queryByText('현장 운영가이드 (가안)')).toBeNull()

    // 인라인 빌더 — 기존 "빌더 열기" 로직 재사용
    const row = screen.getByText('개막 세션 큐시트').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: '빌더 열기' }))
    expect(await screen.findByTestId('builder-panel-cuesheet')).toBeTruthy()

    // 재클릭 = 해제 → 전체 그룹 목록 복귀
    await userEvent.click(cardButton)
    expect(cardButton.getAttribute('aria-pressed')).toBe('false')
    expect(await screen.findByText('진행 시나리오 (가안)')).toBeTruthy()
  })

  it('(P10-b) 다른 유형 카드를 선택하면 열려 있던 타 유형 빌더 패널이 닫힌다(표시 정합)', async () => {
    renderRoute('/board/ops')
    const row = (await screen.findByText('개막 세션 큐시트')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: '빌더 열기' }))
    expect(await screen.findByTestId('builder-panel-cuesheet')).toBeTruthy()

    const scenarioCard = screen.getByTestId('ops-doc-card-scenario')
    await userEvent.click(within(scenarioCard).getByRole('button', { name: '시나리오' }))
    expect(screen.queryByTestId('builder-panel-cuesheet')).toBeNull()
  })

  it('(P10-c) 제목 검색이 선택된 유형 범위 안에서만 적용된다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const scenarioCard = screen.getByTestId('ops-doc-card-scenario')
    await userEvent.click(within(scenarioCard).getByRole('button', { name: '시나리오' }))
    expect(screen.getByText('진행 시나리오 (가안)')).toBeTruthy()

    // '개막'은 큐시트 제목에만 있다 — 시나리오 범위에선 0건이어야 한다
    await userEvent.type(screen.getByLabelText('제목 검색'), '개막')
    expect(screen.queryByText('개막 세션 큐시트')).toBeNull()
    expect(screen.queryByText('진행 시나리오 (가안)')).toBeNull()
    expect(screen.getByText('조건에 맞는 항목이 없습니다.')).toBeTruthy()

    await userEvent.clear(screen.getByLabelText('제목 검색'))
    expect(await screen.findByText('진행 시나리오 (가안)')).toBeTruthy()
  })

  it('(P10-d) 유형 선택 상태에서 "+ 항목 추가"를 열면 해당 카테고리가 프리셀렉트된다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const guideCard = screen.getByTestId('ops-doc-card-guide')
    await userEvent.click(within(guideCard).getByRole('button', { name: '운영가이드' }))

    await userEvent.click(screen.getByRole('button', { name: '＋ 항목 추가' }))
    const heading = await screen.findByRole('heading', { name: '항목 추가' })
    const form = heading.closest('div')!.parentElement!
    const select = within(form).getByLabelText('카테고리') as HTMLSelectElement
    expect(select.value).toBe('운영가이드')
  })

  it('(c) 정형 카테고리("운영가이드")로 생성하면 해당 빌더가 인라인으로 열린다', async () => {
    renderRoute('/board/ops')
    await screen.findByTestId('ops-doc-card-guide')
    expect(screen.queryByTestId('builder-panel-guide')).toBeNull()

    await userEvent.click(await screen.findByRole('button', { name: '＋ 항목 추가' }))
    const heading = await screen.findByRole('heading', { name: '항목 추가' })
    const form = heading.closest('div')!.parentElement!

    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '운영가이드')
    await userEvent.type(within(form).getByLabelText('제목'), '스태프 운영가이드 v2')
    await userEvent.click(within(form).getByRole('button', { name: '생성' }))

    expect(await screen.findByTestId('builder-panel-guide')).toBeTruthy()
    expect(
      await screen.findByRole('heading', { name: /운영가이드 바로 편집 — 스태프 운영가이드 v2/ }),
    ).toBeTruthy()
  })
})
