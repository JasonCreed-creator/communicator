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
