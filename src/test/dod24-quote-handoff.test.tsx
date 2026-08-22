/** @vitest-environment jsdom */
// DoD-24 (v2.0) — 핸드오프: 확정 견적 → 행사 만들기 → S0 ① 프리필(§16 매핑 전 필드) →
// quote.project_id·project.quote_id 상호 링크. 견적 없는 S-1 → S0 경로 그대로 동작.
// 미확정 견적은 '행사 만들기' 비활성(⑤).
import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UNLINKED_QUOTE_ID } from '../fixtures/quoteFixtures'
import { ProviderError } from '../lib/errors'
import type { Project } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

const provider = mockProvider()

afterEach(() => {
  cleanup()
})

describe('DoD-24 §16 핸드오프 (provider)', () => {
  it('미확정 견적으로는 행사를 만들 수 없다 (409)', async () => {
    await expect(provider.createProjectFromQuote(UNLINKED_QUOTE_ID)).rejects.toMatchObject({
      code: 'conflict',
    } satisfies Partial<ProviderError>)
  })

  let created: Project

  it('확정 견적 → createProjectFromQuote: §16 매핑 전 필드 프리필 + 상호 링크 + onboarded_at null', async () => {
    const finalized = await provider.finalizeQuote(UNLINKED_QUOTE_ID)
    expect(finalized.is_final).toBe(true)
    expect(finalized.locked_at).not.toBeNull()

    created = await provider.createProjectFromQuote(finalized.id)

    // §16 좌측(projects) ← 우측(quotes.input) 매핑
    expect(created.name).toBe('파트너 서밋 2026')
    expect(created.code).toMatch(/26$/) // 이니셜+연도 2자리 자동 제안 (S0 ①에서 확인)
    expect(created.event_date).toBe('2026-12-10')
    expect(created.start_time).toBe('14:00')
    expect(created.end_time).toBe('18:00')
    expect(created.venue).toBe('가상호텔 서울 · 볼룸 A') // selected_venue.name + ' · ' + hall
    expect(created.expected_headcount).toBe(150)
    expect(created.guarantee_pax).toBe(60)
    expect(created.event_type).toBe('recruiting') // include_leads → recruiting
    expect(created.organizer).toBe('가상파트너스') // client_company
    expect(created.kpi_show_rate).toBe(90) // §16 기본
    expect(created.targeting?.company_size).toContain('중소기업')
    expect(created.target_audience).toContain('중소기업·스타트업') // 타겟팅 요약 문장
    expect(created.target_audience).toContain('파트너사 대표·임원 초청') // + notes
    // overview_items: 행사 성격·담당 매니저·고객 연락처 — 금액 키 없음
    const labels = (created.overview_items ?? []).map((it) => it.label)
    expect(labels).toEqual(['행사 성격', '담당 매니저', '고객 연락처'])
    expect(created.onboarded_at).toBeNull() // S0 프리필 상태로 진입

    // 상호 링크 (§16 — 한 트랜잭션)
    expect(created.quote_id).toBe(finalized.id)
    const linked = await provider.getQuote(finalized.id)
    expect(linked.project_id).toBe(created.id)
  })

  it('이미 행사가 연결된 견적으로는 재생성할 수 없다 (409)', async () => {
    await expect(provider.createProjectFromQuote(UNLINKED_QUOTE_ID)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('S0 ① 프리필 — 주황 틴트 배너 + §16 값이 폼에 채워져 있고 수정 가능', async () => {
    localStorage.setItem('communicator.currentProjectId', created.id)
    renderRoute('/onboarding')
    // 프리필 배너 (주황 틴트 안내)
    await screen.findByTestId('quote-prefill-banner')
    // §16 값이 입력 필드에 프리필 + 주황 틴트 클래스, disabled 아님(수정 가능)
    const nameInput = (await screen.findByLabelText('행사명')) as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('파트너 서밋 2026'))
    expect(nameInput.className).toContain('bg-accent-tint')
    expect(nameInput.disabled).toBe(false)
    const codeInput = (await screen.findByLabelText('행사 코드')) as HTMLInputElement
    expect(codeInput.value).toBe(created.code)
    localStorage.removeItem('communicator.currentProjectId')
  })

  it('견적 없는 S-1 → S0 경로는 그대로 — 새 행사에는 프리필 배너가 없다', async () => {
    const blank = await provider.createProject({})
    localStorage.setItem('communicator.currentProjectId', blank.id)
    renderRoute('/onboarding')
    await screen.findByText('온보딩 위저드')
    expect(screen.queryByTestId('quote-prefill-banner')).toBeNull()
    localStorage.removeItem('communicator.currentProjectId')
  })

  it('온보딩 완료 후에도 상호 링크가 유지된다', async () => {
    const before = await provider.getProject(created.id)
    expect(before.onboarded_at).toBeNull()
    await provider.completeOnboarding(created.id)
    const after = await provider.getProject(created.id)
    expect(after.onboarded_at).not.toBeNull()
    expect(after.quote_id).toBe(UNLINKED_QUOTE_ID)
    const quote = await provider.getQuote(UNLINKED_QUOTE_ID)
    expect(quote.project_id).toBe(created.id)
    // 완료 후에는 프리필 틴트 대상이 아니다 — 모객형 WBS 37건 + 컴플라이언스 시드도 확인
    const tasks = await provider.listWbsTasks(created.id)
    expect(tasks).toHaveLength(37)
    const cards = await provider.listComplianceCards(created.id)
    expect(cards).toHaveLength(2)
  })
})

describe('DoD-24 에디터 ⑤ — 확정 전 비활성', () => {
  it('미확정 견적의 ⑤에서 "이 견적으로 행사 만들기" 버튼이 비활성이다', async () => {
    // 새 미확정 견적을 만들어 검증 (픽스처 quo-101은 위에서 확정됨)
    const draft = await provider.createQuote({
      event_name: '미확정 견적 행사',
      event_date: null,
      event_end_date: null,
      start_time: null,
      end_time: null,
      event_type: '기타',
      include_leads: false,
      headcount: 60,
      guarantee: 0,
      venues: [{ venue_id: null, name: '', hall: null, date: null, rental: 10_800_000 }],
      selected_venue: { venue_id: null, name: '', hall: null, date: null, rental: 10_800_000, index: 0 },
      options: {},
      display_type: 'projector',
      targeting: null,
      client_company: null,
      contact: null,
      manager: null,
      notes: null,
      adjustments: [],
    })
    renderRoute(`/quotes/${draft.id}/edit?step=5`)
    const btn = await screen.findByRole('button', { name: /이 견적으로 행사 만들기/ })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    await screen.findByText(/확정 후 활성화됩니다/)
  })
})
