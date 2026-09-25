/** @vitest-environment jsdom */
// Phase 3.17 시안 정렬 → Phase 3.23 PR-5(디자인지시서 v1.4 §7-2.9) — 행사 목록(S-1) · 행사 설정(S6) 핵심 계약.
// (1) 진행 중 카드 = 정체 / D-day pill + 진행률 / 확인할 것 + PM  (2) 확인할 것이 없으면 중립 '확인할 것 없음' 한 칩
// (3) 지금 보는 행사 = accent 테두리 + '지금 보는 행사' 배지  (4) 세팅 미완료 = '먼저 확인할 행사' 줄(세팅 n/3단계 · 남은 필수 ·
// 이어서 세팅하기)  (5) 설정 상단 필수 4 체크 스트립  (6) 탭 미입력 개수 배지  (7) Drive·Slack 미연결 = 빈 상태 정본.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

/** 필수 미입력(행사일·장소)만 비어 있는 세팅 미완료 행사 — 시안 '먼저 확인할 행사' 첫 줄의 실데이터 대응물 */
let draftId = ''

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  const created = await p.createProject({ name: '가상 정렬 점검 행사', code: 'ALIGN17' })
  draftId = created.id
  // 샘플 행사가 언제 돌려도 '진행 중'(행사일 전)에 있도록 오늘 기준으로 옮긴다
  await p.updateProject(PROJECT_ID, { event_date: addDays(toIsoDate(new Date()), 27) })
})

function card(id: string): HTMLElement {
  const el = Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid="project-card"]'),
  ).find((c) => c.dataset.projectId === id)
  if (!el) throw new Error(`card not found: ${id}`)
  return el
}

describe('S-1 행사 목록 — 진행 중 카드', () => {
  it('(1)(3) 지금 보는 행사 카드 = 정체 · D-day + 진행률 · 확인할 것 + PM, accent 테두리 + 배지', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '행사 목록' })

    const summary = (await mockProvider().listProjects()).find((s) => s.id === PROJECT_ID)!
    const el = card(PROJECT_ID)

    // ① 정체 — 유형 · 요일 날짜 + 행사명 + 장소
    expect(within(el).getByRole('heading', { name: summary.name })).toBeTruthy()
    expect(el.textContent).toContain(summary.venue!)
    expect(el.textContent).toMatch(/\d+월 \d+일 \([일월화수목금토]\)/)

    // ② D-day pill(dark) + 확정 진행률
    const dday = within(el).getByTestId('card-dday')
    expect(dday.textContent).toBe('D-27')
    expect(dday.className).toContain('bg-dark')
    expect(within(el).getByText(`확정 ${summary.finals}/${summary.deliverable_total}`)).toBeTruthy()

    // ③ 확인할 것 — 분리선 아래 줄, 오른쪽에 PM
    const signals = within(el).getByTestId('card-signals')
    expect(signals.parentElement!.className).toContain('border-t')
    expect(signals.parentElement!.textContent).toContain(`PM ${summary.pm_name}`)

    // 지금 보는 행사 = accent 테두리 + 배지(화면 통틀어 1개)
    expect(el.className).toContain('border-accent')
    expect(el.getAttribute('aria-current')).toBe('true')
    expect(screen.getAllByTestId('current-badge')).toHaveLength(1)
    expect(screen.getByTestId('current-badge').textContent).toBe('지금 보는 행사')
  })

  it('(2) 확인할 것이 없는 행사는 중립 "확인할 것 없음" 한 칩, 있으면 발주처 답 대기(도트)·지연', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '행사 목록' })
    // 종료 묶음까지 펼쳐 조용한 행사를 찾는다(종료 행사도 같은 카드 규격)
    await userEvent.click(screen.getByRole('button', { name: /^종료된 행사 \d+$/ }))

    const summaries = await mockProvider().listProjects()
    const onScreen = (id: string) => screen.queryAllByTestId('project-card').some((c) => c.dataset.projectId === id)
    const quiet = summaries.find((s) => s.pending_approvals === 0 && s.delayed_tasks === 0 && onScreen(s.id))!
    const noisy = summaries.find((s) => s.pending_approvals > 0 && s.kind !== 'host' && onScreen(s.id))!

    const quietSignals = within(card(quiet.id)).getByTestId('card-signals')
    expect(quietSignals.textContent).toBe('확인할 것 없음')
    expect(quietSignals.querySelectorAll('.ui-badge')).toHaveLength(1)
    expect(quietSignals.querySelector('[data-level="neutral"]')).toBeTruthy()

    const noisySignals = within(card(noisy.id)).getByTestId('card-signals')
    expect(noisySignals.textContent).toContain(`발주처 답 대기 ${noisy.pending_approvals}`)
    expect(noisySignals.querySelector('[data-level="attention"]')).toBeTruthy()
    expect(noisySignals.textContent).not.toContain('확인할 것 없음')
  })

  it('(4) 세팅 미완료 행사는 카드가 아니라 "먼저 확인할 행사" 줄 — 세팅 n/3단계 · 남은 필수 · 이어서 세팅하기', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '행사 목록' })

    expect(screen.queryAllByTestId('project-card').some((c) => c.dataset.projectId === draftId)).toBe(false)
    const group = screen.getByRole('region', { name: '먼저 확인할 행사' })
    const row = within(group)
      .getAllByTestId('setup-row')
      .find((r) => r.dataset.projectId === draftId)!
    expect(within(row).getByText('세팅 1/3단계').getAttribute('data-level')).toBe('attention') // 생성자 PM 자동 등록 → 1단계
    // 남은 필수 항목이 이름으로(행사명·코드는 입력됨 → 행사일·장소만 남음)
    expect(row.textContent).toContain('필수 2개 남음 — 행사일 · 장소')
    await userEvent.click(within(row).getByRole('button', { name: '이어서 세팅하기' }))
    expect(await screen.findByRole('heading', { name: '① 행사개요' })).toBeTruthy()
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

    // v2.9(Phase 5): 'Phase 5 예정' 자리표시 → Drive 카드. mock은 연결을 흉내 내지 않고 효용·표준 트리·개시 시점을 적는다
    const drive = await screen.findByTestId('drive-card')
    expect(drive.textContent).toContain('미등록 인박스')
    expect(drive.textContent).toContain('실서버')
    expect(drive.textContent).toContain('05_산출물/디자인')

    // v2.10.1(Phase 6): 'Phase 6 예정' 자리표시 → Slack 카드. mock은 보내는 흉내 없이 무엇이 언제 가는지와 실서버 전용임을 적는다
    const slack = screen.getByTestId('slack-card')
    expect(slack.textContent).toContain('컨펌 발송')
    expect(slack.textContent).toContain('D-1')
    expect(slack.textContent).toContain('실서버')

    // 빈 상태에 accent CTA를 두지 않는다(패턴 §06 ②)
    expect(drive.querySelector('.btn-accent')).toBeNull()
    expect(slack.querySelector('.btn-accent')).toBeNull()
  })
})
