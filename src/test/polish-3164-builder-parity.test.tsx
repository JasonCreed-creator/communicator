/** @vitest-environment jsdom */
// Phase 3.16.4 — 시나리오·운영가이드 빌더 시각 정합(목업 v2.5 화면 B·C = 시각 정본).
// T1 화면 B: 헤더 컴포지션("시나리오 — {문서명}"+상태 배지+큐시트로 내보내기·인쇄·컨펌 발송),
//   세션 카드(프로그램표 연동 배지·메타), 구분 배지 컬러 토큰, 역할 분리 각주 카드.
// T2 화면 C: 헤더 컴포지션, 번호 섹션 헤더+연동 배지(칩·제목 중복 제거), 본문 미리보기 접힘, 각주 카드.
// 컨펌 발송 동작 = 기존 상태 머신(내부검토+PM만, 주최형 숨김, 발송 시 doc-snapshot 자동 버전).
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

describe('T1 — 시나리오 빌더 헤더 컴포지션(화면 B)', () => {
  it('"시나리오 — {문서명}"+상태 배지 헤더, 우측에 큐시트로 내보내기·인쇄·컨펌 발송 버튼', async () => {
    renderScenario(SCENARIO_ID)
    const heading = await screen.findByRole('heading', { name: /시나리오 — 진행 시나리오 \(가안\)/ })
    // 상태 배지가 헤더 안에 있다(RB27 시나리오 = draft)
    expect(within(heading).getByText('초안')).toBeTruthy()
    expect(screen.getByRole('button', { name: '큐시트로 내보내기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy()
    // draft 상태 — 발송 버튼은 disabled + 사유 InfoTip(동작은 기존 상태 머신 준수)
    const sendBtn = screen.getByRole('button', { name: '컨펌 발송' }) as HTMLButtonElement
    expect(sendBtn.disabled).toBe(true)
    expect(screen.getAllByRole('button', { name: '도움말' }).length).toBeGreaterThan(0)
  })

  it('구분 배지 컬러 — mc=steel 틴트·video=steel 솔리드·transition=accent 틴트(토큰 조합)', async () => {
    renderScenario(SCENARIO_ID)
    await screen.findByRole('button', { name: /오프닝 키노트/ })
    expect(screen.getAllByText('MC')[0].className).toContain('bg-steel-tint')
    expect(screen.getAllByText('영상')[0].className).toContain('bg-steel ')
    expect(screen.getAllByText('전환')[0].className).toContain('bg-accent-tint')
    expect(screen.getAllByText('의전')[0].className).toContain('bg-track')
  })

  it('하단 역할 분리 각주 카드가 있다(목업 .note)', async () => {
    renderScenario(SCENARIO_ID)
    await screen.findByRole('heading', { name: /시나리오 — 진행 시나리오/ })
    expect(screen.getByText('역할 분리')).toBeTruthy()
    expect(screen.getByText(/큐 표기를 큐 뼈대로 변환해 큐시트 빌더에/)).toBeTruthy()
  })

  it('세션 카드 헤더에 시각·제목·프로그램표 연동 배지·메타가 함께 표기된다', async () => {
    renderScenario(SCENARIO_ID)
    const groupBtn = await screen.findByRole('button', { name: /오프닝 키노트/ })
    // 시각(start_time)이 헤더 버튼 안에 있다
    expect(groupBtn.textContent).toContain('10:30')
    const card = groupBtn.closest('section')!
    expect(within(card).getByText('프로그램표 연동')).toBeTruthy()
  })
})

describe('T2 — 운영가이드 빌더 헤더·섹션 컴포지션(화면 C)', () => {
  it('"운영가이드 — {문서명}"+상태 배지 헤더, 우측 인쇄·컨펌 발송·연락망 포함 토글', async () => {
    renderGuide(GUIDE_ID)
    const heading = await screen.findByRole('heading', { name: /운영가이드 — 현장 운영가이드 \(가안\)/ })
    expect(within(heading).getByText('초안')).toBeTruthy()
    expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '컨펌 발송' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('checkbox', { name: /연락망 포함/ })).toBeTruthy()
  })

  it('번호 섹션 헤더 + 연동 배지(steel), kind 칩·제목 중복은 제거된다', async () => {
    renderGuide(GUIDE_ID)
    await screen.findByRole('heading', { name: /^1\. 존별 운영$/ })
    expect(screen.getByRole('heading', { name: /^2\. 역할별 체크리스트$/ })).toBeTruthy()
    const zoneBadge = screen.getByText('존운영 항목 연동')
    expect(zoneBadge.className).toContain('bg-steel-tint')
    expect(screen.getByText('R&R 연동')).toBeTruthy()
    // 예전 kind 칩("존별 운영" 단독 텍스트)이 더는 없다 — 제목 중복 제거(화면 C ①)
    expect(screen.queryByText('존별 운영')).toBeNull()
  })

  it('본문은 기본 미리보기 접힘(line-clamp) — 펼치기 토글로 펼쳐진다', async () => {
    renderGuide(GUIDE_ID)
    await screen.findByRole('heading', { name: /^1\. 존별 운영$/ })
    const toggles = screen.getAllByRole('button', { name: '펼치기 ▾' })
    expect(toggles.length).toBeGreaterThan(0)
    await userEvent.click(toggles[0])
    expect(await screen.findByRole('button', { name: '접기 ▴' })).toBeTruthy()
  })

  it('하단 각주 카드(연동 확인 반영·개인정보 인쇄 스냅숏만)가 있다', async () => {
    renderGuide(GUIDE_ID)
    await screen.findByRole('heading', { name: /^1\. 존별 운영$/ })
    expect(screen.getByText(/자동 덮어쓰기 없음/)).toBeTruthy()
    expect(screen.getByText(/인쇄 스냅숏에만 포함 옵션/)).toBeTruthy()
  })
})

describe('컨펌 발송 — 헤더 버튼이 기존 상태 머신을 그대로 태운다', () => {
  it('내부검토+PM이면 발송 가능 — 발송 시 pending_approval 전이 + 인쇄 스냅숏 자동 버전 등록', async () => {
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

    renderScenario(fresh.id)
    await screen.findByRole('button', { name: '컨펌 발송' })
    // 활성화(비disabled)는 권한(currentUser)·행사(kind) 비동기 로드가 끝나야 확정된다
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '컨펌 발송' }) as HTMLButtonElement).disabled).toBe(false)
    })
    await userEvent.click(screen.getByRole('button', { name: '컨펌 발송' }))
    expect(await screen.findByText(/인쇄 스냅숏\(\.pdf\)이 자동 버전으로 등록됩니다/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '발송' }))

    await waitFor(async () => {
      const after = await provider.getDeliverable(fresh.id)
      expect(after.status).toBe('pending_approval')
      expect(after.versions.length).toBe(1)
      expect(after.versions[0].file_name).toMatch(/\.pdf$/)
    })
    // 헤더 배지도 갱신된다
    expect(await screen.findByText('컨펌대기')).toBeTruthy()
  })

  it('주최형 행사에서는 컨펌 발송 버튼 자체가 없다(DoD 31 준수)', async () => {
    const hostDoc = await provider.createDeliverable({
      project_id: PROJECT_ID_HOST,
      area: 'ops',
      category: '시나리오',
      title: '주최형 시나리오',
    })
    renderScenario(hostDoc.id)
    await screen.findByRole('heading', { name: /시나리오 — 주최형 시나리오/ })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '컨펌 발송' })).toBeNull()
    })
    // 인쇄는 남는다
    expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy()
  })
})
