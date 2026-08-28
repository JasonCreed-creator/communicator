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

  // ── P11 (3.16.2 시각 정합) — 목업 화면 A 구조 계약 ──────────────────────────
  it('(P11-a) 카드는 아이콘·설명·"n건 · 대표 상태" 요약을 갖는다(목업 문구 그대로)', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    const cuesheetCard = screen.getByTestId('ops-doc-card-cuesheet')
    expect(within(cuesheetCard).getByText('🎛')).toBeTruthy()
    expect(within(cuesheetCard).getByText('콘솔 오퍼용 3채널 큐 (음향·조명·영상)')).toBeTruthy()
    expect(within(cuesheetCard).getByText('1건')).toBeTruthy()
    // 대표 상태 = 가장 최근 수정 항목의 상태 라벨(RB27 큐시트는 가이드됨)
    expect(within(cuesheetCard).getByText('가이드됨')).toBeTruthy()

    const guideCard = screen.getByTestId('ops-doc-card-guide')
    expect(within(guideCard).getByText('📒')).toBeTruthy()
    expect(within(guideCard).getByText('존·역할별 지침 + 비상 대응 (스태프 배포용)')).toBeTruthy()
  })

  it('(P11-b) 유형 선택 시 통합 카드 1개 안에 목록·필터·항목 추가가 들어가고, 빌더는 그 행 아래에서 펼쳐진다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    await userEvent.click(
      within(screen.getByTestId('ops-doc-card-cuesheet')).getByRole('button', { name: '큐시트' }),
    )

    // 통합 카드 헤더 = "[유형명] — 문서 목록"
    const cardHeading = screen.getByRole('heading', { name: '큐시트 — 문서 목록' })
    const unified = cardHeading.closest('div')!.parentElement as HTMLElement
    // 필터·항목 추가가 같은 카드 안에 있다
    expect(within(unified).getByLabelText('제목 검색')).toBeTruthy()
    expect(within(unified).getByRole('button', { name: '＋ 항목 추가' })).toBeTruthy()

    // 빌더는 그 행(li) 안에서 펼쳐진다 — 페이지 하단 분리 패널이 아니다
    const row = within(unified).getByText('개막 세션 큐시트').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: '빌더 열기' }))
    const panel = await screen.findByTestId('builder-panel-cuesheet')
    expect(row.contains(panel)).toBe(true)
    // 펼침 헤더 우측에 상세 링크
    expect(within(row).getByRole('link', { name: '상세 화면으로 이동' })).toBeTruthy()
  })

  it('(P11-c) 상태 범례 행은 운영보드에서 사라지고 헤더 도움말이 그 내용을 담는다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    expect(screen.queryByLabelText('상태 범례')).toBeNull()

    // 헤더 InfoTip — PageHeader의 h1과 같은 컨테이너 안에 있다(카드 InfoTip과 구분)
    const header = screen.getByRole('heading', { name: '운영 보드' }).closest('div')!
      .parentElement as HTMLElement
    // InfoTip은 hover/focus로 열린다(클릭은 토글이라 hover로 이미 열린 것을 도로 닫는다)
    await userEvent.hover(within(header).getByRole('button', { name: '도움말' }))
    expect(screen.getByRole('tooltip').textContent).toContain('상태 흐름')
  })

  it('(P11-d) 전체 보기 그룹 헤더가 카드 명칭과 일치하고, 원시 카테고리는 기타 제작물 안 소제목이다', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    // 그룹 헤더(카드 명칭) — 카드 안 라벨과 구분해 카드 밖에서 찾는다
    const cards = screen.getByTestId('ops-doc-card-cuesheet').parentElement as HTMLElement
    const groupLabels = screen
      .getAllByText(/^(큐시트|시나리오|운영가이드|기타 제작물)$/)
      .filter((el) => !cards.contains(el))
      .map((el) => el.textContent)
    expect(groupLabels).toContain('큐시트')
    expect(groupLabels).toContain('기타 제작물')

    // 원시 카테고리(존운영)는 그룹 헤더가 아니라 기타 제작물 그룹 안 소제목으로 남는다
    const otherHeading = screen
      .getAllByText('기타 제작물')
      .filter((el) => !cards.contains(el))[0]
    const otherGroup = otherHeading.closest('div')!.parentElement as HTMLElement
    expect(within(otherGroup).getByText('존운영')).toBeTruthy()
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
