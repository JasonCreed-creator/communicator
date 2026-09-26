/** @vitest-environment jsdom */
// DoD 81 (Phase 3.24 PR-B · 설계서 v2.13 §23.6 · 디자인지시서 §7-2.14) — 화면:
// 운영 보드 카드 문서 요약 · 유형별 표 칸 · 파일 문서 올리기/열기 · 빌더를 닫으면 요약 다시 읽기 ·
// 운영가이드 발송 안내 · 큐시트 칸 순서(S9 포함).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { guideSummary } from '../lib/guideStructured'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const RB27 = PROJECT_ID_REBUILD27

async function cueTotal(): Promise<number> {
  const docs = (await mockProvider().listDeliverables(RB27, { area: 'ops' })).filter((d) => d.category === '큐시트')
  let n = 0
  for (const d of docs) n += (await mockProvider().listCues(d.id)).length
  return n
}

describe('DoD 81 ① 운영 보드 — 카드 문서 요약 · 유형별 표', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', RB27)
    mockProvider().switchUser('usr-pm')
  })

  it('카드마다 그 유형의 숫자 — 큐 n개 · 멘트 n/m 작성 · 섹션 n/m 채움 · 확정 n/m', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')

    await waitFor(async () => expect(screen.getByTestId('ops-doc-card-headline-cuesheet').textContent).toBe(`큐 ${await cueTotal()}개`))
    expect(screen.getByTestId('ops-doc-card-headline-scenario').textContent).toBe('멘트 2/2 작성')
    const scenarioCard = screen.getByTestId('ops-doc-card-scenario')
    expect(within(scenarioCard).getByText(/^세션 3/)).toBeTruthy()

    const guides = (await mockProvider().listDeliverables(RB27, { area: 'ops' })).filter((d) => d.category === '운영가이드')
    const sums = await Promise.all(guides.map(async (g) => guideSummary(await mockProvider().listGuideSections(g.id))))
    const filled = sums.reduce((n, s) => n + s.filled, 0)
    const total = sums.reduce((n, s) => n + s.total, 0)
    expect(screen.getByTestId('ops-doc-card-headline-guide').textContent).toBe(`섹션 ${filled}/${total} 채움`)
    expect(screen.getByTestId('ops-doc-card-headline-other').textContent).toMatch(/^확정 \d+\/\d+$/)
  })

  it('유형마다 표의 칸이 다르다(문서 · 유형 칸 · 상태 · 담당 · 마감 · 동작)', async () => {
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')
    const head = (key: string) => screen.getByTestId(`ops-doc-table-${key}`).querySelector('thead tr')!.textContent
    expect(head('cuesheet')).toBe('문서큐운영 시간대본 작성버전상태담당마감동작')
    expect(head('scenario')).toBe('문서세션멘트 작성연사 확인비상 멘트상태담당마감동작')
    expect(head('guide')).toBe('문서섹션 채움현장 인력무전원본 갱신상태담당마감동작')
    expect(head('other')).toBe('문서최신 파일상태담당마감동작')

    // 시나리오 줄 = 세션 3 · 멘트 2 / 2 · 연사 확인 완료 · 비상 멘트 없음
    const row = screen.getByText('진행 시나리오 (가안)').closest('tr')!
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells.slice(1, 5)).toEqual(['3', '2 / 2', '완료', '—'])
  })

  it('파일이 없는 기타 문서는 "올리기"(상세 업로드 카드로), 정형 문서는 "열기"가 그 행 아래에서 빌더를 편다', async () => {
    const doc = await mockProvider().createDeliverable({ project_id: RB27, area: 'ops', category: '운영안', title: '파일 없는 운영안' })
    renderRoute('/board/ops')
    const row = (await screen.findByText('파일 없는 운영안')).closest('tr')!
    expect(within(row).getByText('파일 없음')).toBeTruthy()
    expect(within(row).getByText('운영안')).toBeTruthy() // 원시 카테고리는 문서 칸 아래 줄
    expect(within(row).getByRole('link', { name: '파일 없는 운영안 올리기' }).getAttribute('href')).toBe(`/items/${doc.id}?upload=1`)

    const cueRow = screen.getByText('개막 세션 큐시트').closest('tr')!
    const open = within(cueRow).getByRole('button', { name: '개막 세션 큐시트 열기' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(open)
    expect((cueRow.nextElementSibling as HTMLElement).getAttribute('data-testid')).toMatch(/^builder-row-/)
  })

  it('빌더에서 큐를 더하고 닫으면 카드·표의 숫자가 새로 읽힌다', async () => {
    const before = await cueTotal()
    renderRoute('/board/ops')
    await screen.findByText('개막 세션 큐시트')
    await userEvent.click(screen.getByRole('button', { name: '개막 세션 큐시트 열기' }))
    const panel = await screen.findByTestId('builder-panel-cuesheet')
    await userEvent.click(await within(panel).findByRole('button', { name: '큐 추가' }))
    await waitFor(async () => expect(await cueTotal()).toBe(before + 1))

    await userEvent.click(screen.getByRole('button', { name: '개막 세션 큐시트 닫기' }))
    await waitFor(() => expect(screen.getByTestId('ops-doc-card-headline-cuesheet').textContent).toBe(`큐 ${before + 1}개`))
  })
})

describe('DoD 81 ② 운영가이드 발송 — 다음 단계 카드 한 줄(가이드 스냅숏)', () => {
  it('내부검토 + PM이면 "보내면 지금 가이드가 PDF로 저장돼 v1이 됩니다" · 빌더 안에는 발송 버튼이 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', RB27)
    mockProvider().switchUser('usr-pm')
    const doc = await mockProvider().createDeliverable({ project_id: RB27, area: 'ops', category: '운영가이드', title: '발송 테스트 가이드' })
    await mockProvider().seedGuideFromSources(doc.id)
    await mockProvider().transitionStatus(doc.id, 'internal_review')

    renderRoute(`/items/${doc.id}`)
    const card = await screen.findByTestId('next-step-card')
    expect(within(card).getByText(/보내면 지금 가이드가 PDF로 저장돼 v1이 됩니다/)).toBeTruthy()
    const bar = await screen.findByRole('region', { name: '가이드 요약' })
    expect(within(bar).queryByRole('button', { name: '컨펌 발송' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '컨펌 발송' })).toHaveLength(1)
  })
})

describe('DoD 81 ③ 큐시트 칸 이름 — 운영계획서(S9)도 같은 순서', () => {
  it('S9 03 큐시트 머리 = 시각 · 큐 · 구분 · MC·진행 · 조명 · 영상 · 음향', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/plan')
    const section = (await screen.findByRole('heading', { name: '03 큐시트' })).closest('section')!
    const head = await within(section).findAllByRole('columnheader')
    expect(head.map((th) => th.textContent)).toEqual(['시각', '큐', '구분', 'MC·진행', '조명', '영상', '음향'])
  })
})
