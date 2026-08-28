/** @vitest-environment jsdom */
// DoD 38 (v2.5) — S9 확장: ⑦비상 대응 섹션 렌더·인쇄 포함·진행률 집계 반영,
// ② 세션별 시나리오 펼침(있을 때만), 기존 6섹션 회귀 없음.
// 상호작용 세부(펼침/접기·존 섹션 배지)는 plan-v25.test.tsx(3.16d)가 정본 —
// 이 파일은 DoD 문장을 RE:BUILD 27·샘플 테크 양쪽에서 증명한다.
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD 38 — S9 확장', () => {
  it('(a) RE:BUILD 27 — ⑦비상 대응이 렌더되고 인쇄 구조(.plan-section 8개)에 포함된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')

    const heading = await screen.findByRole('heading', { name: '⑦비상 대응' })
    const section = heading.closest('section')!
    expect(section.className).toContain('plan-section')
    expect(section.className).not.toContain('plan-print-hidden')
    expect(document.querySelectorAll('.plan-section').length).toBe(8)
  })

  it('(b) 진행률 집계 — section_progress에 emergency가 포함되고 내용이 있으면 완료로 센다', async () => {
    const plan = await mockProvider().getPlan(PROJECT_ID_REBUILD27)
    const emergency = plan.section_progress.find((s) => s.key === 'emergency')
    expect(emergency).toBeTruthy()
    expect(emergency!.total).toBe(1)
    // RB27 운영가이드의 emergency 섹션에 내용이 있으므로 완료
    expect(emergency!.done).toBe(1)
  })

  it('(c) ② 세션별 시나리오 펼침 — 시나리오가 있는 RB27에는 토글이 있고, 없는 샘플 테크에는 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    const rb27 = renderRoute('/plan')
    const openingRow = (await screen.findByText(/오프닝 키노트/)).closest('tr')!
    expect(within(openingRow).getByRole('button', { name: '진행 시나리오 펼침' })).toBeTruthy()
    rb27.unmount()

    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '⑦비상 대응' })
    expect(screen.queryByText('진행 시나리오 펼침')).toBeNull()
  })

  it('(d) 기존 섹션 회귀 없음 — RB27에서 v2.5 이전 7섹션이 전부 그대로 렌더된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')

    await screen.findByRole('heading', { name: /행사개요/ })
    for (const name of [/프로그램/, '③큐시트', /존별 운영/, /제작물 리스트/, /등록 통계/, /일정/]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
  })
})
