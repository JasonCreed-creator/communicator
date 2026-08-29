/** @vitest-environment jsdom */
// 시안 「발주처 보드」 정렬 계약 — 외부 지면(/c)은 카드 우선·터치 44 고정·1열 스택이고,
// 내부 운영 맥락(금액·WBS 코드·역할 컬러·파트너사명·지연 태스크)은 한 글자도 넘어가지 않는다.
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import ClientLayout from '../components/layout/ClientLayout'
import ClientConfirmQueuePage from '../pages/ClientConfirmQueuePage'
import ClientMaterialsPage from '../pages/ClientMaterialsPage'
import ClientStatusPage from '../pages/ClientStatusPage'
import ClientMaterialCard from '../components/client/ClientMaterialCard'
import { deriveClientSchedule } from '../components/client/clientDerive'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

afterEach(cleanup)

// testUtils.renderRoute는 이 스프린트에서 건드리지 않는 공용 파일이라(파일 소유 규칙)
// 발주처 3탭 라우트만 담은 최소 라우터를 여기서 세운다 — App.tsx의 /c 구성과 동일하다.
function renderClient(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/c/:token" element={<ClientLayout />}>
          <Route index element={<ClientConfirmQueuePage />} />
          <Route path="status" element={<ClientStatusPage />} />
          <Route path="materials" element={<ClientMaterialsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('발주처 보드 정렬', () => {
  it('탭 3개(컨펌 요청·진행 현황·제출 자료)가 44px 터치 타깃으로 렌더된다', async () => {
    renderClient('/c/demo/status')
    const tabs = await screen.findAllByRole('link', { name: /컨펌 요청|진행 현황|제출 자료/ })
    const names = tabs.map((t) => t.textContent?.replace(/\d+/g, '').trim())
    expect(names).toEqual(expect.arrayContaining(['컨펌 요청', '진행 현황', '제출 자료']))
    for (const tab of tabs) {
      expect(tab.className).toContain('h-11') // 외부 지면 터치 44 고정
      expect(tab.className).not.toContain('btn-sm')
    }
  })

  it('진행 현황: 전체 진행률 도넛 + 행사 D-day + 지금 필요한 것 2장(44px 풀폭 액션)', async () => {
    renderClient('/c/demo/status')
    // 도넛 — 단일 비율 1개(role=img, 진행률 aria-label)
    const donut = await screen.findByRole('img', { name: /진행률 \d+%/ })
    expect(donut).toBeTruthy()
    // 행사 D-day
    expect(screen.getByText(/^행사일 /)).toBeTruthy()

    const needed = screen.getByRole('heading', { name: '지금 필요한 것' }).closest('section')!
    const cards = within(needed).getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(needed).getByText(/^컨펌 요청 \d+건$/)).toBeTruthy()
    expect(within(needed).getByText(/^보내주실 자료 \d+건$/)).toBeTruthy()
    for (const card of cards) {
      const action = within(card).getByRole('link')
      expect(action.className).toContain('h-11')
      expect(action.className).toContain('w-full') // 풀폭
      expect(action.className).not.toContain('btn-sm')
    }
  })

  it('다가오는 일정은 고객사가 관여하는 날짜만 — 영역 한정(내부 공정) 마일스톤은 넘어가지 않는다', async () => {
    const p = getDataProvider() as MockProvider
    const [status, queue] = await Promise.all([p.getClientStatus('demo'), p.getClientQueue('demo')])
    const entries = deriveClientSchedule(queue, status)
    const internalOnly = status.milestones.filter((m) => m.area !== null)
    expect(internalOnly.length).toBeGreaterThan(0) // 대조군: 내부 공정 마일스톤이 실제로 존재한다
    for (const m of internalOnly) {
      expect(entries.some((e) => e.title === m.title)).toBe(false)
    }
    // 공통(area=null) 마일스톤·컨펌 회신 기한·행사일은 들어온다
    for (const m of status.milestones.filter((m) => m.area === null)) {
      expect(entries.some((e) => e.title === m.title)).toBe(true)
    }
    expect(entries.some((e) => e.kind === 'confirm')).toBe(true)
    expect(entries.some((e) => e.kind === 'event')).toBe(true)
    // 날짜 오름차순
    expect([...entries].sort((a, b) => a.date.localeCompare(b.date))).toEqual(entries)

    renderClient('/c/demo/status')
    const schedule = (await screen.findByRole('heading', { name: '다가오는 일정' })).closest(
      'section',
    )!
    for (const m of internalOnly) {
      expect(within(schedule).queryByText(m.title)).toBeNull()
    }
  })

  it('제출 자료 탭: 파생할 데이터가 없으면 빈 상태 ②(ghost 액션·accent 금지)로 비우고 무엇이 채워질 자리인지 설명한다', async () => {
    renderClient('/c/demo/materials')
    expect(await screen.findByText('아직 요청된 제출 자료가 없습니다.')).toBeTruthy()
    expect(screen.getByText(/이 자리에 카드로 쌓입니다/)).toBeTruthy()
    const action = screen.getByRole('link', { name: '진행 현황 보기' })
    expect(action.className).toContain('btn-ghost') // ②에 accent 금지
    expect(action.className).toContain('h-11')
    expect(action.className).not.toContain('btn-accent')
  })

  it('제출 자료 카드: 액션 2개 모두 44px(btn-sm 금지), 접수 완료 건은 흐리게 + 액션 없음', () => {
    const { container, unmount } = render(
      <ClientMaterialCard
        material={{
          id: 'mat-1',
          title: '대표 인사말 원고',
          note: '개회식 대본에 들어갑니다.',
          due_date: '2026-09-03',
          received: false,
          received_note: null,
          mailto: 'mailto:pm@example.com',
        }}
        onUpload={() => {}}
      />,
    )
    const upload = screen.getByRole('button', { name: '파일 올리기' })
    const mail = screen.getByRole('link', { name: '메일로 보내기' })
    for (const el of [upload, mail]) {
      expect(el.className).toContain('h-11')
      expect(el.className).not.toContain('btn-sm')
    }
    expect(container.querySelector('.flex-1')).toBeTruthy() // 파일 올리기 = 주 액션(넓게)
    unmount()

    render(
      <ClientMaterialCard
        material={{
          id: 'mat-2',
          title: '참가 기업 리스트',
          note: null,
          due_date: null,
          received: true,
          received_note: '8월 20일 수신 완료',
          mailto: null,
        }}
        onUpload={() => {}}
      />,
    )
    expect(screen.getByText('접수 완료')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '파일 올리기' })).toBeNull()
    expect(document.querySelector('.opacity-75')).toBeTruthy()
  })

  it('담당자 블록: 발주처 담당자를 마스킹 없이 이름 그대로 노출한다', async () => {
    // Phase 3.18.1 §2 — 담당자(내부 스태프·발주처 담당자)는 /c에서 가리지 않는다.
    const p = getDataProvider() as MockProvider
    const queue = await p.getClientQueue('demo')
    expect(queue.contact_name).toBeTruthy() // 대조군: 계약이 담당자 이름을 싣고 있다
    renderClient('/c/demo/status')
    const section = (await screen.findByRole('heading', { name: '담당자' })).closest('section')!
    expect(within(section).getByText(queue.contact_name!)).toBeTruthy()
    expect(within(section).getByText('발주처 담당자')).toBeTruthy()
    expect(section.textContent).not.toMatch(/[*●]/) // 마스킹 흔적 없음
  })

  it('비공개 원칙: 금액·WBS 코드·역할 컬러·파트너·지연 태스크가 세 탭 어디에도 없다', async () => {
    // 각 탭의 본문 마커를 기다려 '데이터가 실린 뒤'를 보장한 다음 검사한다
    const marks: [string, RegExp][] = [
      ['/c/demo', /메인 키비주얼/],
      ['/c/demo/status', /영역별 진행률/],
      ['/c/demo/materials', /아직 요청된 제출 자료가 없습니다/],
    ]
    for (const [path, marker] of marks) {
      const view = renderClient(path)
      await screen.findAllByText(marker)
      const html = document.body.innerHTML
      for (const forbidden of ['total_amount', 'breakdown', 'ordered_amount', 'margin', '정산', '파트너']) {
        expect(html).not.toContain(forbidden)
      }
      // 역할 컬러(형태 어휘)와 WBS 코드 패턴은 외부 지면에 없다
      expect(html).not.toMatch(/bg-role-|text-role-|bg-brown/)
      expect(html).not.toMatch(/\bWBS\b/)
      view.unmount()
    }
  })
})
