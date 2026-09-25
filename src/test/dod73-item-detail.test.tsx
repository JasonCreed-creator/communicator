/** @vitest-environment jsdom */
// DoD 73 — 항목 상세 재배치 (Phase 3.23 PR-4 · 디자인지시서 v1.4 §7-2.7 · 캔버스 항목 상세).
// ① 다음 단계 카드 — 상태마다 제목·버튼, 화면의 채운 버튼은 최대 1개 ② ⋯ 메뉴 — 바깥 누르기·Esc로 닫힘
// ③ 큰 미리보기 — 이미지/파일 표지 · 새 탭 ④ 제작 가이드 — 비면 PM '채우기'(고치기 폼) ⑤ PM 폼(반려 사유·답 기한·컨펌 발송)
// ⑥ 주최형 파트너 항목 — 파트너 보드로
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { objectParticle } from '../lib/labels'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

async function openItem(id: string, projectId: string = PROJECT_ID) {
  localStorage.setItem('communicator.currentProjectId', projectId)
  const view = renderRoute(`/items/${id}`)
  const card = await screen.findByTestId('next-step-card')
  return { ...view, card }
}

/** 업로드 카드(자체 제출 버튼)를 뺀 화면의 채운 버튼 */
const filledOutsideUpload = (container: HTMLElement) =>
  [...container.querySelectorAll('.btn-accent, .btn-primary')].filter((el) => !el.closest('#version-upload-form'))

describe('DoD 73 ① 다음 단계 카드 — 상태마다 한 문장 + 채운 버튼 최대 1개', () => {
  it('가이드됨(dlv-007): 첫 시안을 올릴 차례 · 채운 버튼 = 첫 시안 올리기', async () => {
    const { container, card } = await openItem('dlv-007')
    expect(within(card).getByRole('heading', { name: '첫 시안을 올릴 차례' })).toBeTruthy()
    await within(card).findByRole('button', { name: '첫 시안 올리기' })
    expect(filledOutsideUpload(container).map((b) => b.textContent)).toEqual(['첫 시안 올리기'])
    // 레일 첫 칸이 지금 자리
    expect(within(card).getByText('5단계 중 1단계')).toBeTruthy()
  })

  it('확정(dlv-002): 확정됨 · 버튼 없음 · 올리기 없음 · 레일 5칸 모두 완료', async () => {
    const { container, card } = await openItem('dlv-002')
    expect(within(card).getByRole('heading', { name: '확정됨' })).toBeTruthy()
    expect(within(card).queryAllByRole('button')).toHaveLength(0)
    expect(filledOutsideUpload(container)).toHaveLength(0)
    const steps = within(card).getByRole('list', { name: '진행 단계' }).querySelectorAll('li[data-step-state]')
    expect([...steps].every((s) => s.getAttribute('data-step-state') === 'done')).toBe(true)
  })

  it('디자인 담당이 보는 내부검토: PM 검토를 기다리는 중 · 폼 없음', async () => {
    mockProvider().switchUser('usr-design')
    try {
      await mockProvider().uploadVersion('dlv-003', { file_name: '백월_v1.png' })
      await mockProvider().transitionStatus('dlv-003', 'internal_review')
      const { card } = await openItem('dlv-003')
      expect(await within(card).findByRole('heading', { name: 'PM 검토를 기다리는 중' })).toBeTruthy()
      expect(within(card).queryByRole('button', { name: '컨펌 발송' })).toBeNull()
      expect(within(card).queryByLabelText('반려 사유')).toBeNull()
    } finally {
      mockProvider().switchUser('usr-pm')
    }
  })

  it('PM이 보는 내부검토: 발송 폼(버전·답 기한·컨펌 발송) + 반려(사유) — 채운 버튼은 컨펌 발송 하나', async () => {
    const { container, card } = await openItem('dlv-003')
    expect(await within(card).findByRole('heading', { name: '검토하고 발주처로 보낼 차례' })).toBeTruthy()
    expect(within(card).getByLabelText('버전')).toBeTruthy()
    expect(within(card).getByLabelText('답 기한')).toBeTruthy()
    expect(within(card).getByLabelText('반려 사유')).toBeTruthy()
    expect(filledOutsideUpload(container).map((b) => b.textContent)).toEqual(['컨펌 발송'])
    // 반려 → 초안(사유 필수 · 기존 전이 그대로)
    await userEvent.type(within(card).getByLabelText('반려 사유'), '색 대비를 더 올려 주세요')
    await userEvent.click(within(card).getByRole('button', { name: '반려' }))
    await waitFor(async () => expect((await mockProvider().getDeliverable('dlv-003')).status).toBe('draft'))
  })

  it('버전 있는 초안: PM 검토로 넘길 차례 — 채운 버튼 = 내부검토 요청, 새 버전 올리기는 ghost', async () => {
    const { container, card } = await openItem('dlv-003')
    expect(await within(card).findByRole('heading', { name: 'PM 검토로 넘길 차례' })).toBeTruthy()
    const again = within(card).getByRole('button', { name: '새 버전 올리기' })
    expect(again.className).toContain('btn-ghost')
    expect(filledOutsideUpload(container).map((b) => b.textContent)).toEqual(['내부검토 요청'])
    await userEvent.click(within(card).getByRole('button', { name: '내부검토 요청' }))
    await waitFor(async () => expect((await mockProvider().getDeliverable('dlv-003')).status).toBe('internal_review'))
  })
})

describe('DoD 73 ② ⋯ 메뉴 — 바깥을 누르면 닫히고 Esc는 버튼으로 초점을 돌린다', () => {
  it('열기 → 첫 항목에 초점 → Esc → 메뉴 닫힘·버튼에 초점 / 다시 열고 바깥 누르기 → 닫힘', async () => {
    await openItem('dlv-007')
    const button = await screen.findByRole('button', { name: '항목 메뉴' })
    await userEvent.click(button)
    const menu = screen.getByRole('menu', { name: '항목 메뉴' })
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '고치기' }))
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
    await userEvent.click(button)
    expect(screen.getByRole('menu')).toBeTruthy()
    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('DoD 73 ③ 큰 미리보기', () => {
  it('이미지 최신본은 16:9 그림 + 새 탭 링크, 버전이 없으면 미리보기 카드 없음', async () => {
    await openItem('dlv-001')
    const preview = await screen.findByTestId('version-preview')
    expect((await within(preview).findByTestId('version-picture')).getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect((await within(preview).findByRole('link', { name: '새 탭에서 보기' })).getAttribute('target')).toBe('_blank')
    cleanup()
    await openItem('dlv-007')
    expect(screen.queryByTestId('version-preview')).toBeNull()
  })

  it('PDF 최신본(dlv-002)은 파일 표지 + 미리볼 수 없다는 안내', async () => {
    await openItem('dlv-002')
    const preview = await screen.findByTestId('version-preview')
    expect(within(preview).getByTestId('version-file-cover').textContent).toContain('PDF')
    expect(within(preview).getByText(/이 형식은 화면에서 미리볼 수 없습니다/)).toBeTruthy()
  })
})

describe('DoD 73 ④ 제작 가이드 — 오른쪽 열, 비면 PM만 채우기', () => {
  it('가이드 없는 항목: 안내 + PM "채우기" → 고치기 폼(가이드 칸 열림)', async () => {
    await openItem('dlv-001')
    const guide = (await screen.findByRole('heading', { name: '제작 가이드' })).closest('.ui-card') as HTMLElement
    expect(guide.closest('aside')).not.toBeNull()
    expect(within(guide).getByText(/가이드 없이 만든 항목입니다/)).toBeTruthy()
    await userEvent.click(within(guide).getByRole('button', { name: '채우기' }))
    const form = await screen.findByTestId('item-edit-form')
    expect(within(form).getByLabelText('제작 가이드 추가')).toBeTruthy()
  })

  it('디자인 담당에게는 채우기가 없다(담당·가이드는 PM)', async () => {
    mockProvider().switchUser('usr-design')
    try {
      await openItem('dlv-001')
      const guide = (await screen.findByRole('heading', { name: '제작 가이드' })).closest('.ui-card') as HTMLElement
      expect(within(guide).queryByRole('button', { name: '채우기' })).toBeNull()
    } finally {
      mockProvider().switchUser('usr-pm')
    }
  })
})

describe('DoD 73 ⑥ 주최형 파트너 항목', () => {
  it('제출 요청 상태: 파트너 제출을 기다리는 중 · 파트너 보드로 · 레일 첫 칸 "제출 요청" · 넷째 칸 "검토"', async () => {
    const items = await mockProvider().listDeliverables(PROJECT_ID_HOST, { area: 'design' })
    const partnerItem = items.find((d) => d.partner_id && d.status === 'requested')!
    const { card } = await openItem(partnerItem.id, PROJECT_ID_HOST)
    expect(within(card).getByRole('heading', { name: '파트너 제출을 기다리는 중' })).toBeTruthy()
    expect(within(card).getByRole('link', { name: '파트너 보드' }).getAttribute('href')).toBe(`/partners?partner=${partnerItem.partner_id}`)
    const labels = [...within(card).getByRole('list', { name: '진행 단계' }).querySelectorAll('li[data-step-state]')].map((li) => li.textContent)
    expect(labels[0]).toContain('제출 요청')
    expect(labels[3]).toContain('검토')
    // 코멘트 공개 범위도 파트너 기준
    const thread = screen.getByRole('region', { name: '코멘트' })
    expect(within(thread).getByRole('button', { name: '파트너와 공유' })).toBeTruthy()
  })
})

describe('DoD 73 ⑦ 숫자 뒤 조사', () => {
  it('v1을 · v2를 · v3을 · v4를 · v5를 · v9를 · v10을 · v12를 · v20을', () => {
    const pairs: [number, string][] = [[1, '을'], [2, '를'], [3, '을'], [4, '를'], [5, '를'], [6, '을'], [7, '을'], [8, '을'], [9, '를'], [10, '을'], [12, '를'], [20, '을']]
    for (const [n, want] of pairs) expect(objectParticle(n), `v${n}`).toBe(want)
  })
})
