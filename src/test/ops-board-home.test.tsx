/** @vitest-environment jsdom */
// v2.5 §10.2·§23 — 운영보드 유형 우선 홈 (Phase 3.16b, 에이전트 AF).
// RE:BUILD 27 픽스처(prj-rebuild27, §23.4)로 카드 4종 렌더·건수·이관 무손실(R-O1)·
// 레거시 파일 문서 보호·정형 카테고리 생성 시 빌더 인라인 오픈을 검증한다.
// design 보드는 렌더 무변경(카드 미노출)도 함께 확인한다.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('v2.5 §10.2 — 운영보드 유형 우선 홈 (RE:BUILD 27 · prj-rebuild27)', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', 'prj-rebuild27')
  })

  it('카드 4종이 렌더되고 건수가 정확하다(큐시트 1·시나리오 1·운영가이드 1·기타 1 — 픽스처 실측)', async () => {
    renderRoute('/board/ops')

    // 카드는 마운트 즉시(로딩 전, 건수 0) 렌더되므로, 목록이 실제로 뜬 뒤(비동기 로드 완료)에 읽는다.
    await screen.findByText('개막 세션 큐시트')

    const cuesheetCard = screen.getByTestId('ops-doc-card-cuesheet')
    const scenarioCard = screen.getByTestId('ops-doc-card-scenario')
    const guideCard = screen.getByTestId('ops-doc-card-guide')
    const otherCard = screen.getByTestId('ops-doc-card-other')

    expect(within(cuesheetCard).getByText('큐시트')).toBeTruthy()
    expect(within(cuesheetCard).getByText('1건')).toBeTruthy()

    expect(within(scenarioCard).getByText('시나리오')).toBeTruthy()
    expect(within(scenarioCard).getByText('1건')).toBeTruthy()

    expect(within(guideCard).getByText('운영가이드')).toBeTruthy()
    expect(within(guideCard).getByText('1건')).toBeTruthy()

    // RB27 ops 항목 중 정형 3종을 제외한 나머지는 존운영 1건뿐(§23.4 실측 — rebuildFixtures.ts REBUILD27_ZONES)
    expect(within(otherCard).getByText('기타 제작물')).toBeTruthy()
    expect(within(otherCard).getByText('1건')).toBeTruthy()
  })

  it('R-O1 무손실 — 4개 카드 건수 합 = 전체 ops 항목 수, provider 쓰기 호출 0건(분류는 표시 레벨)', async () => {
    const p = mockProvider()
    const writeSpies = [
      vi.spyOn(p, 'createDeliverable'),
      vi.spyOn(p, 'saveScenarioBlocks'),
      vi.spyOn(p, 'seedScenarioFromProgram'),
      vi.spyOn(p, 'saveGuideSections'),
      vi.spyOn(p, 'seedGuideFromSources'),
      vi.spyOn(p, 'exportScenarioToCues'),
      vi.spyOn(p, 'createDocSnapshot'),
    ]

    const totalOpsItems = (await p.listDeliverables('prj-rebuild27', { area: 'ops' })).length

    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const counts = ['cuesheet', 'scenario', 'guide', 'other'].map((key) => {
      const card = screen.getByTestId(`ops-doc-card-${key}`)
      const text = within(card).getByText(/^\d+건$/).textContent ?? '0건'
      return Number(text.replace('건', ''))
    })
    const sum = counts.reduce((a, b) => a + b, 0)
    expect(sum).toBe(totalOpsItems)
    expect(totalOpsItems).toBeGreaterThan(0)

    for (const spy of writeSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('카드 선택 시 해당 유형 문서 목록으로 좁혀지고, 다시 누르면 전체로 돌아온다', async () => {
    renderRoute('/board/ops')

    const scenarioCard = await screen.findByTestId('ops-doc-card-scenario')
    // 선택 전 — 큐시트 항목도 같은 화면에 보인다(기본은 전체 보기)
    expect(await screen.findByText('개막 세션 큐시트')).toBeTruthy()
    expect(screen.getByText('진행 시나리오 (가안)')).toBeTruthy()

    await userEvent.click(within(scenarioCard).getByRole('button', { name: '시나리오' }))

    expect(screen.getByText('진행 시나리오 (가안)')).toBeTruthy()
    expect(screen.queryByText('개막 세션 큐시트')).toBeNull()

    // 다시 누르면 선택 해제 — 전체로 복귀
    await userEvent.click(within(scenarioCard).getByRole('button', { name: '시나리오' }))
    expect(await screen.findByText('개막 세션 큐시트')).toBeTruthy()
    expect(screen.getByText('진행 시나리오 (가안)')).toBeTruthy()
  })

  it('정형 카테고리("시나리오")로 생성하면 직후 인라인 빌더 패널이 열린다(스텁 문구가 아니라 패널 존재로 검증)', async () => {
    renderRoute('/board/ops')
    await screen.findByTestId('ops-doc-card-cuesheet')

    expect(screen.queryByTestId('builder-panel-scenario')).toBeNull()

    await userEvent.click(await screen.findByRole('button', { name: '＋ 항목 추가' }))
    const heading = await screen.findByRole('heading', { name: '항목 추가' })
    const form = heading.closest('div')!.parentElement!

    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '시나리오')
    await userEvent.type(within(form).getByLabelText('제목'), '네트워킹 세션 시나리오')
    await userEvent.click(within(form).getByRole('button', { name: '생성' }))

    // 스텁이 곧 실물로 교체되므로 문구가 아니라 패널 존재·헤딩으로 검증한다
    expect(await screen.findByTestId('builder-panel-scenario')).toBeTruthy()
    expect(
      await screen.findByRole('heading', { name: /시나리오 바로 편집 — 네트워킹 세션 시나리오/ }),
    ).toBeTruthy()

    const created = (await mockProvider().listDeliverables('prj-rebuild27', { area: 'ops' })).find(
      (d) => d.title === '네트워킹 세션 시나리오',
    )
    expect(created?.category).toBe('시나리오')
  })
})

describe('v2.5 §10.2 — 레거시 파일 문서 보호 (RE:BUILD 26 · prj-stc26 · dlv-005)', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
  })

  it('버전 있음·빌더 행 0인 시나리오 항목(dlv-005)은 빌더를 열지 않고 "파일 문서" 안내만 노출한다', async () => {
    renderRoute('/board/ops')

    const row = (await screen.findByText('운영 시나리오')).closest('li')!
    expect(within(row).getByText('파일 문서 — 상세에서 열람')).toBeTruthy()
    expect(within(row).queryByRole('button', { name: /^빌더 (열기|닫기)$/ })).toBeNull()
  })

  it('버전 있는 큐시트(dlv-004)는 레거시 취급하지 않고 빌더 열기 버튼을 그대로 제공한다(대조군)', async () => {
    renderRoute('/board/ops')

    const row = (await screen.findByText('개막식 큐시트')).closest('li')!
    expect(within(row).getByRole('button', { name: '빌더 열기' })).toBeTruthy()
    expect(within(row).queryByText('파일 문서 — 상세에서 열람')).toBeNull()
  })
})

describe('v2.5 §10.2 — design 보드는 렌더 무변경', () => {
  it('design 보드에는 유형 카드·빌더 열기 버튼이 전혀 뜨지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/design')

    await screen.findByRole('heading', { name: '디자인 보드' })
    expect(screen.queryByTestId('ops-doc-card-cuesheet')).toBeNull()
    expect(screen.queryByTestId('ops-doc-card-scenario')).toBeNull()
    expect(screen.queryByTestId('ops-doc-card-guide')).toBeNull()
    expect(screen.queryByTestId('ops-doc-card-other')).toBeNull()
    expect(screen.queryByRole('button', { name: /^빌더 (열기|닫기)$/ })).toBeNull()
  })
})
