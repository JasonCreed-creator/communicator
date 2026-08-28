/** @vitest-environment jsdom */
// Phase 3.17 시안 정렬 — 행사 목록(S-1) · 행사 설정(S6) 핵심 계약.
// 시안: design_handoff_mice_communicator_ui/행사 설정 · 행사 목록.dc.html + 패턴 기준 시트 §03·§06·§07.
// (1) 카드 3층 = 정체 / D-day pill + 진행률 / 주의 신호  (2) 주의 없으면 positive 한 칩
// (3) 현재 행사 = 2px accent 보더 + '현재' 배지  (4) 세팅 미완료 = canvas 면 + negative 보더 +
// 남은 필수 항목·온보딩 진행률·액션  (5) 설정 상단 필수 4 체크 스트립  (6) 탭 미입력 개수 배지
// (7) Drive·Slack 미연결 = 빈 상태 정본(무엇이 좋아지는지 + 언제 열리는지, accent CTA 없음).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

/** 필수 미입력(행사일·장소)만 비어 있는 세팅 미완료 행사 — 시안 3번째 카드의 실데이터 대응물 */
let draftId = ''

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  const created = await p.createProject({ name: '가상 정렬 점검 행사', code: 'ALIGN17' })
  draftId = created.id
})

function card(id: string): HTMLElement {
  const el = Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid="project-card"]'),
  ).find((c) => c.dataset.projectId === id)
  if (!el) throw new Error(`card not found: ${id}`)
  return el
}

describe('S-1 행사 목록 — 카드 3층', () => {
  it('(1)(3) 현재 행사 카드는 정체·D-day+진행률·주의 신호 3층이고 2px accent 보더 + 현재 배지', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '내 행사' })

    const summary = (await mockProvider().listProjects()).find((s) => s.id === PROJECT_ID)!
    const el = card(PROJECT_ID)

    // ① 정체 — 유형 · 일자 · 장소 한 줄 + 행사명
    expect(within(el).getByRole('heading', { name: summary.name })).toBeTruthy()
    expect(el.textContent).toContain(summary.venue!)

    // ② D-day pill + 확정 진행률(바 아래 줄 우측 수치)
    const dday = within(el).getByTestId('card-dday')
    expect(dday.textContent).toMatch(/^(D-\d+|D\+\d+|D-day|일정 미정)$/)
    expect(within(el).getByText(`확정 ${summary.finals}/${summary.deliverable_total}`)).toBeTruthy()

    // ③ 주의 신호 층이 분리선 아래 별도 블록으로 존재
    const signals = within(el).getByTestId('card-signals')
    expect(signals.className).toContain('border-t')

    // 현재 행사 = 2px accent 보더 + '현재' 배지(화면 통틀어 1개)
    expect(el.className).toContain('border-2')
    expect(el.className).toContain('border-accent')
    expect(screen.getAllByTestId('current-badge')).toHaveLength(1)
  })

  it('(2) 미결·지연이 없는 행사는 주의 신호가 positive "주의 없음" 한 칩뿐이다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '내 행사' })
    // 종료 섹션까지 펼쳐 조용한 행사를 찾는다(종료 행사도 3층 규격을 따른다)
    await userEvent.click(screen.getByRole('button', { name: /^종료 \d+$/ }))

    const summaries = await mockProvider().listProjects()
    const quiet = summaries.find(
      (s) => s.onboarded && s.pending_approvals === 0 && s.delayed_tasks === 0,
    )!
    const noisy = summaries.find((s) => s.onboarded && s.pending_approvals > 0)!

    const quietSignals = within(card(quiet.id)).getByTestId('card-signals')
    expect(quietSignals.textContent).toBe('주의 없음')
    expect(quietSignals.querySelectorAll('.ui-badge')).toHaveLength(1)
    expect(quietSignals.querySelector('[data-level="positive"]')).toBeTruthy()

    // 반대로 미결이 있는 행사는 주의(attention) 배지 + 도트를 단다
    const noisySignals = within(card(noisy.id)).getByTestId('card-signals')
    expect(noisySignals.textContent).toContain(`미결 컨펌 ${noisy.pending_approvals}`)
    expect(noisySignals.querySelector('[data-level="attention"]')).toBeTruthy()
    expect(noisySignals.textContent).not.toContain('주의 없음')
  })

  it('(4) 세팅 미완료 카드는 canvas 면 + negative 보더 + 남은 필수·온보딩 진행률·액션을 품는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '내 행사' })

    const el = card(draftId)
    expect(el.dataset.needsSetup).toBe('true')
    expect(el.className).toContain('bg-canvas')
    expect(el.className).toContain('border-negative')

    const panel = within(el).getByTestId('setup-panel')
    // 남은 필수 항목이 이름으로 적힌다(행사명·코드는 입력됨 → 행사일·장소만 남음)
    expect(panel.textContent).toContain('필수 2개 남음')
    expect(panel.textContent).toContain('행사일 · 장소')
    expect(panel.textContent).toContain('온보딩 1/3') // 생성자가 PM으로 자동 등록 → 1단계 완료

    // 액션 버튼이 카드 안에 있고, D-day/진행률 층은 이 카드에 없다
    expect(within(el).getByRole('button', { name: '온보딩 이어서 하기' })).toBeTruthy()
    expect(within(el).queryByTestId('card-dday')).toBeNull()
  })
})

describe('S6 행사 설정 — 필수 스트립 · 탭 배지 · 연동 빈 상태', () => {
  it('(5) 상단 필수 4항목 체크 스트립이 입력 여부를 항목별로 표시한다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })

    const strip = await screen.findByTestId('required-strip')
    for (const key of ['name', 'code', 'event_date', 'venue']) {
      expect(within(strip).getByTestId(`required-${key}`).dataset.filled).toBe('true')
    }
    expect(within(strip).getByTestId('required-summary').textContent).toContain('4/4 입력')
    expect(strip.textContent).toContain('행사명')
    expect(strip.textContent).toContain('행사 코드')
    expect(strip.textContent).toContain('행사일')
    expect(strip.textContent).toContain('장소')
  })

  it('(6) 탭 라벨의 미입력 개수 배지는 선택 항목이면 중립이고, 탭 이름은 흔들지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })

    // 연동 2종 중 미설정 개수(픽스처 ①은 Slack만 등록됨 → Drive 1건) = 선택 미입력 → 중립 배지
    const project = await mockProvider().getProject(PROJECT_ID)
    const expected = (project.drive_root_folder_id ? 0 : 1) + (project.slack_webhook_url ? 0 : 1)
    expect(expected).toBeGreaterThan(0)
    const badge = await screen.findByTestId('tab-gap-integration')
    expect(badge.textContent).toBe(String(expected))
    expect(badge.dataset.tone).toBe('optional')
    expect(badge.className).toContain('bg-track')

    // 배지가 붙어도 탭의 접근 가능한 이름은 그대로다(기존 동선 보존)
    expect(screen.getByRole('button', { name: '③ 유형·연동' })).toBeTruthy()
    cleanup()

    // 필수 미입력(PM 미지정)이 있는 세팅 미완료 행사는 같은 자리에 accent 배지를 단다
    localStorage.setItem('communicator.currentProjectId', draftId)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    const overviewGap = await screen.findByTestId('tab-gap-overview')
    expect(overviewGap.textContent).toBe('2') // 행사일 · 장소
    expect(overviewGap.dataset.tone).toBe('required')
    expect(overviewGap.className).toContain('bg-accent-tint')
  })

  it('(7) Drive·Slack 미연결 자리가 빈 상태 정본이다 — 효용 + 개시 시점, accent CTA 없음', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(screen.getByRole('button', { name: '③ 유형·연동' }))

    const drive = await screen.findByTestId('drive-empty')
    expect(drive.textContent).toContain('미등록 인박스')
    expect(drive.textContent).toContain('Phase 5 예정')

    const slack = screen.getByTestId('slack-empty')
    expect(slack.textContent).toContain('컨펌 요청·수정요청·지연 알림')
    expect(slack.textContent).toContain('Phase 6 예정')

    // 빈 상태에 accent CTA를 두지 않는다(패턴 §06 ②)
    expect(drive.querySelector('.btn-accent')).toBeNull()
    expect(slack.querySelector('.btn-accent')).toBeNull()
  })
})
