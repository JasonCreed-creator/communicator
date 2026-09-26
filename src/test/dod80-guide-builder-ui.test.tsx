/** @vitest-environment jsdom */
// DoD 80 (Phase 3.24 PR-A · 설계서 v2.13 §23.5 · 디자인지시서 §7-2.13) — 운영가이드 빌더 화면: 기본 섹션 만들기 →
// 섹션 목록 채움 상태 · 표 섹션 고치기(인력 합계 · 등록 대기 계산 · 역할 분담 · D-day 진행표 다시 불러오기 · 행 추가·빼기) ·
// 옛 문서 뼈대 추가(기존 섹션 불변) · 읽기 전용.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GuideBuilder from '../components/guide/GuideBuilder'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

const provider = getDataProvider() as MockProvider

function renderBuilder(id: string, canEdit = true) {
  return render(
    <MemoryRouter>
      <GuideBuilder deliverableId={id} canEdit={canEdit} />
    </MemoryRouter>,
  )
}

async function freshSeeded(title: string) {
  const d = await provider.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title })
  await provider.seedGuideFromSources(d.id)
  return d.id
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DoD 80 — 운영가이드 빌더 화면', () => {
  it('(a) 빈 문서 → 기본 섹션 만들기 → 12섹션 · 섹션 목록 11/12 채움 · VIP 의전만 비어 있음', async () => {
    const d = await provider.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title: '빈 가이드' })
    renderBuilder(d.id)
    await userEvent.click(await screen.findByRole('button', { name: '기본 섹션 만들기' }))
    await screen.findByRole('heading', { name: '설치·철거 일정' })
    for (const name of ['현장 인력·콜타임', '무전·지휘 체계', '역할 분담', 'D-day 진행표', '구간별 체크리스트', '등록 운영', 'VIP 의전', '안전관리', '존별 운영', '비상 대응', '연락망/비품']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
    expect(screen.getByTestId('guide-filled').textContent).toBe('섹션 11 / 12 채움')
    expect(within(card('VIP 의전')).getByText('비어 있음')).toBeTruthy()
    expect(within(card('현장 인력·콜타임')).queryByText('비어 있음')).toBeNull()
    // 섹션 목록은 묶음(준비·당일·안전·공통)으로 나뉜다
    const rail = screen.getByRole('navigation', { name: '섹션 목록' })
    for (const g of ['준비', '당일', '안전 · 공통']) expect(within(rail).getByText(g)).toBeTruthy()
    // 새 문서에는 뼈대 추가 안내가 없다(빠진 섹션 없음)
    expect(screen.queryByTestId('guide-skeleton-banner')).toBeNull()
  })

  it('(b) 인력·콜타임 고치기 → 인원을 넣으면 합계가 바뀌고, 저장된 글에도 들어간다', async () => {
    const id = await freshSeeded('인력 가이드')
    const members = await provider.listMembers(PROJECT_ID)
    renderBuilder(id)
    await screen.findByRole('heading', { name: '현장 인력·콜타임' })
    const staffing = card('현장 인력·콜타임')
    expect(within(staffing).getByText(`합계 ${members.length}명`)).toBeTruthy()
    await userEvent.click(within(staffing).getByRole('button', { name: '고치기' }))
    await userEvent.type(within(staffing).getByRole('textbox', { name: '현장 운영 요원 인원' }), '12')
    expect(within(staffing).getByText(`합계 ${members.length + 12}명`)).toBeTruthy()
    await userEvent.click(within(staffing).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'staffing')!
      expect(saved.content).toContain('현장 운영 요원 12명')
    })
    expect(within(card('현장 인력·콜타임')).getByText(`합계 ${members.length + 12}명`)).toBeTruthy()
  })

  it('(c) 등록 운영 — 라인·도착 인원을 넣는 즉시 처리 속도·줄·최대 대기가 보이고, 저장된다', async () => {
    const id = await freshSeeded('등록 가이드')
    renderBuilder(id)
    await screen.findByRole('heading', { name: '등록 운영' })
    const section = card('등록 운영')
    await userEvent.click(within(section).getByRole('button', { name: '고치기' }))
    await userEvent.type(within(section).getByLabelText('접수 라인'), '5')
    await userEvent.type(within(section).getByLabelText('피크 도착 인원'), '400')
    expect(within(section).getByText('20명 / 분')).toBeTruthy()
    expect(within(section).getByText('100명')).toBeTruthy()
    expect(within(section).getByTestId('registration-wait').textContent).toContain('약 5분')
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'registration')!
      expect(saved.data?.type === 'registration' && saved.data.lines).toBe(5)
      expect(saved.content).toContain('최대 대기 약 5분')
    })
  })

  it('(d) 역할 분담 — 칸마다 주관·협조·없음을 고르고 저장한다', async () => {
    const id = await freshSeeded('역할 가이드')
    renderBuilder(id)
    await screen.findByRole('heading', { name: '역할 분담' })
    const section = card('역할 분담')
    // 읽기 표 — 기호마다 '열 이름 + 주관/협조/해당 없음' 접근 이름
    expect(within(section).getAllByLabelText('주최사 주관', { selector: 'span' }).length).toBeGreaterThan(0)
    await userEvent.click(within(section).getByRole('button', { name: '고치기' }))
    await userEvent.selectOptions(within(section).getByRole('combobox', { name: '모객 · 초청 발송 우리' }), 'main')
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'raci')!
      const row = saved.data?.type === 'raci' ? saved.data.rows.find((r) => r.area === '모객 · 초청 발송') : undefined
      expect(row?.marks).toEqual(['main', 'main', 'none'])
    })
  })

  it('(e) D-day 진행표 — 묶음(사전 준비·본행사·마무리) · 프로그램표 줄 표시 · 다시 불러오기는 확인 후 본행사 줄만 바꾼다', async () => {
    const id = await freshSeeded('진행표 가이드')
    const sessions = await provider.listProgramSessions(PROJECT_ID)
    renderBuilder(id)
    await screen.findByRole('heading', { name: 'D-day 진행표' })
    const section = card('D-day 진행표')
    for (const g of ['사전 준비', '본행사', '마무리']) expect(within(section).getByText(g)).toBeTruthy()
    expect(within(section).getAllByText('프로그램표')).toHaveLength(sessions.length)

    await userEvent.click(within(section).getByRole('button', { name: '고치기' }))
    const firstSegment = within(section).getAllByRole('textbox', { name: /^본행사 .* 구간$/ })[0] as HTMLInputElement
    await userEvent.clear(firstSegment)
    await userEvent.type(firstSegment, '직접 고친 줄')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(within(section).getByRole('button', { name: '프로그램표에서 다시 불러오기' }))
    expect(confirm).toHaveBeenCalled()
    expect(within(section).getByDisplayValue('직접 고친 줄')).toBeTruthy() // 취소하면 그대로
    confirm.mockReturnValue(true)
    await userEvent.click(within(section).getByRole('button', { name: '프로그램표에서 다시 불러오기' }))
    expect(within(section).queryByDisplayValue('직접 고친 줄')).toBeNull()
    expect(within(section).getByDisplayValue(sessions[0].title)).toBeTruthy()
    // 사전 준비 줄은 건드리지 않는다
    expect(within(section).getByDisplayValue('입장 · 최종 셋업')).toBeTruthy()
  })

  it('(f) 표 행 추가·빼기·옮기기 — 설치·철거 일정', async () => {
    const id = await freshSeeded('일정 가이드')
    const before = (await provider.listGuideSections(id)).find((s) => s.kind === 'setup')!
    const rows = before.data?.type === 'setup' ? before.data.rows : []
    renderBuilder(id)
    await screen.findByRole('heading', { name: '설치·철거 일정' })
    const section = card('설치·철거 일정')
    await userEvent.click(within(section).getByRole('button', { name: '고치기' }))
    await userEvent.click(within(section).getByRole('button', { name: '＋ 일정 줄 추가' }))
    expect(within(section).getAllByRole('button', { name: /빼기$/ }).length).toBeGreaterThanOrEqual(rows.length + 1)
    await userEvent.click(within(section).getByRole('button', { name: `${rows[0].task} 빼기` }))
    await userEvent.click(within(section).getByRole('button', { name: `${rows[2].task} 위로` }))
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'setup')!
      const tasks = saved.data?.type === 'setup' ? saved.data.rows.map((r) => r.task) : []
      expect(tasks).toEqual([rows[2].task, rows[1].task, rows[3].task, ''])
    })
  })

  it('(g) 옛 문서(RE:BUILD 27) — 뼈대 추가 안내 → 누르면 빠진 9섹션이 존별 운영 앞에 들어가고 기존 섹션·갱신 표시는 그대로', async () => {
    const before = await provider.listGuideSections('dlv-rb27-guide-01')
    const zoneBefore = before.find((s) => s.kind === 'zone')!
    renderBuilder('dlv-rb27-guide-01')
    const banner = await screen.findByTestId('guide-skeleton-banner')
    expect(banner.textContent).toContain('9개')
    await userEvent.click(within(banner).getByRole('button', { name: '뼈대 추가' }))
    await screen.findByRole('heading', { name: '설치·철거 일정' })
    await waitFor(() => expect(screen.queryByTestId('guide-skeleton-banner')).toBeNull())
    const after = await provider.listGuideSections('dlv-rb27-guide-01')
    expect(after).toHaveLength(13)
    expect(after.map((s) => s.kind).slice(0, 9)).toEqual(['setup', 'staffing', 'radio', 'raci', 'dayplan', 'checklists', 'registration', 'vip', 'safety'])
    const zoneAfter = after.find((s) => s.kind === 'zone')!
    expect(zoneAfter.id).toBe(zoneBefore.id)
    expect(zoneAfter.content).toBe(zoneBefore.content)
    expect(zoneAfter.source_stale).toBe(zoneBefore.source_stale)
    expect(after.some((s) => s.kind === 'role')).toBe(true)
  })

  it('(i) 섹션 목록 링크는 주소(해시)를 바꾸지 않고 그 카드로 스크롤만 한다 — 해시 라우팅 데모에서 화면 이동 방지', async () => {
    const id = await freshSeeded('목록 가이드')
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    try {
      renderBuilder(id)
      await screen.findByRole('heading', { name: 'D-day 진행표' })
      const rail = screen.getByRole('navigation', { name: '섹션 목록' })
      const before = window.location.hash
      await userEvent.click(within(rail).getByRole('link', { name: /D-day 진행표/ }))
      expect(window.location.hash).toBe(before)
      expect(scrolled).toEqual([card('D-day 진행표').id])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('(h) 읽기 전용 — 표는 보이고, 고치기·뼈대 추가·기본 섹션 만들기는 없다', async () => {
    const id = await freshSeeded('읽기 가이드')
    renderBuilder(id, false)
    await screen.findByRole('heading', { name: '현장 인력·콜타임' })
    expect(within(card('현장 인력·콜타임')).getByText('현장 운영 요원')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '고치기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '뼈대 추가' })).toBeNull()
    cleanup()
    renderBuilder('dlv-rb27-guide-01', false)
    await screen.findByRole('heading', { name: '존별 운영' })
    expect(screen.queryByTestId('guide-skeleton-banner')).toBeNull()
  })
})
