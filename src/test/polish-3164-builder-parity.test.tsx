/** @vitest-environment jsdom */
// Phase 3.16.4 — 시나리오·운영가이드 빌더 시각 정합 → Phase 3.24 PR-B(디자인지시서 §7-2.14) 개정:
// 빌더 안의 두 번째 머리("시나리오 — {문서명}" + 컨펌 발송)를 걷고 요약 줄만 둔다(큐시트 PR-4b와 같은 모양).
// T1 시나리오: 요약 줄(멘트 n/m · 큐시트로 보내기 · 인쇄 · MC 배포용) · 세션 머리 · 구분 배지 컬러 · 역할 분리 각주.
// T2 운영가이드: 요약 줄(섹션 n/m 채움 · 연락망 포함 · 인쇄 · 스태프 배포용) · 번호 섹션 머리 · 미리보기 접힘 · 각주.
// 컨펌 발송 = 항목 상세 '다음 단계' 카드 한 줄(기존 상태 머신 — 내부검토+PM만, 주최형 숨김, 발송 시 doc-snapshot 자동 버전).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GuideBuilder from '../components/guide/GuideBuilder'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'
import { renderRoute } from './testUtils'

const provider = getDataProvider() as MockProvider
const RB27 = PROJECT_ID_REBUILD27
const SCENARIO_ID = 'dlv-rb27-scenario-01'
const GUIDE_ID = 'dlv-rb27-guide-01'

afterEach(cleanup)

function renderScenario(id: string, canEdit = true) {
  return render(
    <MemoryRouter>
      <ScenarioBuilder deliverableId={id} canEdit={canEdit} />
    </MemoryRouter>,
  )
}

function renderGuide(id: string, canEdit = true) {
  return render(
    <MemoryRouter>
      <GuideBuilder deliverableId={id} canEdit={canEdit} />
    </MemoryRouter>,
  )
}

describe('T1 — 시나리오 빌더 요약 줄·원고 컴포지션(§7-2.14)', () => {
  it('빌더 안에 두 번째 머리·컨펌 발송이 없고, 요약 줄에 멘트 n/m · 큐시트로 보내기 · 인쇄 · MC 배포용', async () => {
    renderScenario(SCENARIO_ID)
    const bar = await screen.findByRole('region', { name: '원고 요약' })
    expect(within(bar).getByTestId('scenario-progress').textContent).toMatch(/^멘트 \d+ \/ \d+ 작성$/)
    expect(within(bar).getByRole('button', { name: '큐시트로 보내기' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: '인쇄 · MC 배포용' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /시나리오 — / })).toBeNull()
    expect(screen.queryByRole('button', { name: '컨펌 발송' })).toBeNull()
  })

  it('구분 배지 컬러 — 멘트(MC·의전)=accent 틴트 · 영상·전환=steel 틴트 · 지시=중립(토큰 조합)', async () => {
    renderScenario(SCENARIO_ID)
    await screen.findByRole('heading', { name: /오프닝 키노트/ })
    expect(screen.getAllByText('MC')[0].className).toContain('bg-accent-tint')
    expect(screen.getAllByText('의전')[0].className).toContain('bg-accent-tint')
    expect(screen.getAllByText('영상')[0].className).toContain('bg-steel-tint')
    expect(screen.getAllByText('전환')[0].className).toContain('bg-steel-tint')
    expect(screen.getAllByText('지시')[0].className).toContain('bg-track')
  })

  it('하단 역할 분리 각주 카드가 있다(목업 .note)', async () => {
    renderScenario(SCENARIO_ID)
    await screen.findByRole('region', { name: '원고 요약' })
    expect(screen.getByText('역할 분리')).toBeTruthy()
    expect(screen.getByText(/큐 표기를 큐 뼈대로 변환해 큐시트 빌더에/)).toBeTruthy()
  })

  it('세션 머리에 시각(크게)·제목(h3)·프로그램표 연동 배지가 함께 표기된다', async () => {
    renderScenario(SCENARIO_ID)
    const title = await screen.findByRole('heading', { level: 3, name: /오프닝 키노트/ })
    const head = title.parentElement!
    expect(within(head).getByText('10:30').className).toContain('text-[22px]')
    expect(within(head).getByText('프로그램표 연동')).toBeTruthy()
  })
})

describe('T2 — 운영가이드 빌더 헤더·섹션 컴포지션(화면 C)', () => {
  it('요약 줄 — 섹션 n/m 채움 · 연락망 포함(인쇄) · 인쇄 · 스태프 배포용, 빌더 안 두 번째 머리·컨펌 발송 없음', async () => {
    renderGuide(GUIDE_ID)
    const bar = await screen.findByRole('region', { name: '가이드 요약' })
    expect(within(bar).getByTestId('guide-summary').textContent).toMatch(/^섹션 \d+ \/ \d+ 채움$/)
    expect(within(bar).getByRole('button', { name: '인쇄 · 스태프 배포용' })).toBeTruthy()
    expect(within(bar).getByRole('checkbox', { name: /연락망 포함/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /운영가이드 — / })).toBeNull()
    expect(screen.queryByRole('button', { name: '컨펌 발송' })).toBeNull()
  })

  it('번호 섹션 헤더 + 연동 배지(steel), kind 칩·제목 중복은 제거된다', async () => {
    renderGuide(GUIDE_ID)
    // v2.13 §7-2.13 — 번호는 제목 앞의 두 자리 표시(01), 제목(h3)은 이름만
    const zoneHeading = await screen.findByRole('heading', { name: '존별 운영' })
    const zoneCard = zoneHeading.closest('article')!
    expect(within(zoneCard).getByText('01')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '역할별 체크리스트' })).toBeTruthy()
    const zoneBadge = screen.getByText('존운영 항목 연동')
    expect(zoneBadge.className).toContain('bg-steel-tint')
    expect(screen.getByText('R&R 연동')).toBeTruthy()
    // 예전 kind 칩("존별 운영" 단독 텍스트)이 카드 안에 더는 없다 — 제목 중복 제거(화면 C ①)
    expect(within(zoneCard).getAllByText('존별 운영')).toHaveLength(1)
  })

  it('본문은 기본 미리보기 접힘(line-clamp) — 펼치기 토글로 펼쳐진다', async () => {
    renderGuide(GUIDE_ID)
    await screen.findByRole('heading', { name: '존별 운영' })
    const toggles = screen.getAllByRole('button', { name: '펼치기 ▾' })
    expect(toggles.length).toBeGreaterThan(0)
    await userEvent.click(toggles[0])
    expect(await screen.findByRole('button', { name: '접기 ▴' })).toBeTruthy()
  })

  it('하단 각주 카드(연동 확인 반영·개인정보 인쇄 스냅숏만)가 있다', async () => {
    renderGuide(GUIDE_ID)
    await screen.findByRole('heading', { name: '존별 운영' })
    expect(screen.getByText(/자동 덮어쓰기 없음/)).toBeTruthy()
    expect(screen.getByText(/인쇄 스냅숏에만 포함 옵션/)).toBeTruthy()
  })
})

describe('컨펌 발송 — 항목 상세 다음 단계 카드 한 줄(큐시트와 같은 경로 · 기존 상태 머신)', () => {
  it('내부검토+PM이면 원고 스냅숏이 새 버전이 되고 컨펌대기로 전이된다', async () => {
    const fresh = await provider.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '발송 테스트 시나리오',
    })
    await provider.saveScenarioBlocks(fresh.id, [
      { session_id: null, time: '09:00', kind: 'mc', script: '발송 테스트 대본', note: null },
    ])
    await provider.transitionStatus(fresh.id, 'internal_review')
    localStorage.setItem('communicator.currentProjectId', RB27)

    renderRoute(`/items/${fresh.id}`)
    const card = await screen.findByTestId('next-step-card')
    expect(within(card).getByText(/보내면 지금 원고가 PDF로 저장돼 v1이 됩니다/)).toBeTruthy()
    await userEvent.click(within(card).getByRole('button', { name: '컨펌 발송' }))

    await waitFor(async () => {
      const after = await provider.getDeliverable(fresh.id)
      expect(after.status).toBe('pending_approval')
      expect(after.versions.length).toBe(1)
      expect(after.versions[0].file_name).toMatch(/\.pdf$/)
    })
    // 머리 메타 한 줄에 최신 버전이 붙는다(큐시트와 같은 모양)
    expect(await screen.findByText(/최신 v1 · /)).toBeTruthy()
  })

  it('주최형 행사에서는 컨펌 발송 버튼 자체가 없다(DoD 31 준수)', async () => {
    const hostDoc = await provider.createDeliverable({
      project_id: PROJECT_ID_HOST,
      area: 'ops',
      category: '시나리오',
      title: '주최형 시나리오',
    })
    await provider.saveScenarioBlocks(hostDoc.id, [
      { session_id: null, time: '09:00', kind: 'mc', script: '주최형 대본', note: null },
    ])
    await provider.transitionStatus(hostDoc.id, 'internal_review')
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)

    renderRoute(`/items/${hostDoc.id}`)
    const card = await screen.findByTestId('next-step-card')
    await waitFor(() => expect(within(card).getByText('내부에서 검토하는 중')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '컨펌 발송' })).toBeNull()
    // 인쇄는 남는다
    expect(screen.getByRole('button', { name: '인쇄 · MC 배포용' })).toBeTruthy()
  })
})
