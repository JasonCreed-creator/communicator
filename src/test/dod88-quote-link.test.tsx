/** @vitest-environment jsdom */
// DoD 88 (Phase 6.4 PR-1 · 설계서 v2.18 §16.4·§22.4) — 견적 ↔ 기존 행사 연결.
//
// 운영 실측(2026-09-27): 견적서 가져오기 ③에서 '정산보드 기준 견적'을 켜자 프리필이 강제로 켜져 **새 행사가 하나 더** 생겼고,
// 정작 보고 있던 행사의 정산보드는 "확정 견적 없음"이었다. 앱 어디에도 견적을 이미 있는 행사에 붙이는 길이 없었다.
// 이 파일이 고정하는 것:
//   ① provider.linkQuoteToProject — 멱등 · 다른 행사 409 · 옛 버전 409 · 종료 행사 409 · 권한 403 · 확정본이면 다른 확정본 archived · 로그에 금액 0
//   ② distributeQuoteImport.link_project_id — 새 행사를 만들지 않고 고른 행사에 붙인다(project_created=false)
//   ③ createSettlementBoard — 행사 없는 확정 견적은 정산 시작과 함께 그 행사에 연결 · 다른 행사의 견적은 422
//   ④ 견적 목록 — 행사 없는 견적의 요약 패널에서 '기존 행사에 연결' → 그 행사 묶음으로 옮겨진다
//   ⑤ 정산보드 빈 상태 — 미연결 확정 견적을 고르면 안내가 뜨고, 정산 시작 뒤 보드가 그려지며 견적이 연결된다
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FINAL_QUOTE_ID, UNLINKED_QUOTE_ID } from '../fixtures/quoteFixtures'
import { PROJECT_ID, PROJECT_ID_CLOSED, PROJECT_ID_DRAFT, PROJECT_ID_PARTNER } from '../fixtures/sampleProject'
import { syntheticQuoteA } from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'
import type { ProviderError } from '../lib/errors'
import type { Quote, QuoteInput } from '../types/entities'
import { renderRoute } from './testUtils'

const provider = getDataProvider() as MockProvider

async function expectError(run: () => Promise<unknown>, code: ProviderError['code'], match?: RegExp) {
  await expect(run()).rejects.toMatchObject({ code })
  if (match) await expect(run()).rejects.toThrow(match)
}

/** 행사 없는 새 견적(초안) — 픽스처 확정본의 입력을 그대로 복사한다(엔진 무접촉) */
async function newUnlinkedQuote(): Promise<Quote> {
  const base = await provider.getQuote(FINAL_QUOTE_ID)
  const input: QuoteInput = { ...structuredClone(base.input), event_name: `연결 시험 ${Math.random().toString(36).slice(2, 6)}` }
  return provider.createQuote(input)
}

beforeEach(() => {
  provider.switchUser('usr-pm')
  provider.setAppRole('sales')
})

afterEach(cleanup)

describe('DoD 88 ① linkQuoteToProject — provider 계약', () => {
  it('행사 없는 초안을 붙이면 상호 링크(quote.project_id · projects.quote_id) + quote.linked 로그(금액 키 0) · 두 번째 호출은 멱등', async () => {
    const draft = await newUnlinkedQuote()
    const draftProject = await provider.getProject(PROJECT_ID_DRAFT)
    expect(draftProject.quote_id).toBeNull()

    const linked = await provider.linkQuoteToProject(draft.id, PROJECT_ID_DRAFT)
    expect(linked.project_id).toBe(PROJECT_ID_DRAFT)
    expect((await provider.getProject(PROJECT_ID_DRAFT)).quote_id).toBe(draft.id)

    const again = await provider.linkQuoteToProject(draft.id, PROJECT_ID_DRAFT)
    expect(again.project_id).toBe(PROJECT_ID_DRAFT)

    const log = (await provider.listActivity(PROJECT_ID_DRAFT)).filter((e) => e.action === 'quote.linked' && e.target_id === draft.id)
    expect(log).toHaveLength(1)
    const json = JSON.stringify(log[0].meta ?? {})
    expect(json).not.toContain('total_amount')
    expect(json).not.toContain('breakdown')
    expect(json).not.toContain(String(draft.total_amount))
  })

  it('이미 다른 행사의 견적 → 409 · 종료 행사 → 409 · 없는 견적 → 404', async () => {
    await expectError(() => provider.linkQuoteToProject(FINAL_QUOTE_ID, PROJECT_ID_DRAFT), 'conflict', /이미 다른 행사/)
    const draft = await newUnlinkedQuote()
    await expectError(() => provider.linkQuoteToProject(draft.id, PROJECT_ID_CLOSED), 'conflict', /종료된 행사/)
    await expectError(() => provider.linkQuoteToProject('quo-nope', PROJECT_ID_DRAFT), 'not_found')
  })

  it('새 버전이 있는 옛 버전은 붙일 수 없다(409) — 최신 버전만', async () => {
    const v1 = await newUnlinkedQuote()
    const v2 = await provider.saveQuoteVersion(v1.id, { ...structuredClone(v1.input), headcount: v1.input.headcount + 10 })
    await expectError(() => provider.linkQuoteToProject(v1.id, PROJECT_ID_DRAFT), 'conflict', /새 버전/)
    const linked = await provider.linkQuoteToProject(v2.id, PROJECT_ID_DRAFT)
    expect(linked.project_id).toBe(PROJECT_ID_DRAFT)
  })

  it('권한 — 영업·관리자가 아니고 그 행사의 PM도 아니면 403', async () => {
    const draft = await newUnlinkedQuote()
    provider.switchUser('usr-design')
    provider.setAppRole('staff')
    await expectError(() => provider.linkQuoteToProject(draft.id, PROJECT_ID_DRAFT), 'forbidden', /영업·관리자 또는/)
  })

})

describe('DoD 88 ② 견적서 가져오기 분배 — link_project_id', () => {
  it('link_project_id를 주면 새 행사를 만들지 않고 고른 행사에 붙는다(project_created=false) · 보드 시드는 그 행사에', async () => {
    const before = (await provider.listProjects()).length
    const imp = await provider.importQuoteFile('가상견적_A형.xlsx', await syntheticQuoteA())
    const quote = await provider.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    expect(quote.project_id).toBeNull()

    const result = await provider.distributeQuoteImport(imp.id, { link_project_id: PROJECT_ID_DRAFT, board_seed: true })
    expect(result.project_id).toBe(PROJECT_ID_DRAFT)
    expect(result.project_created).toBe(false)
    expect(result.deliverables_seeded).toBeGreaterThan(0)
    expect((await provider.listProjects()).length).toBe(before) // 행사 수 불변
    expect((await provider.getQuote(quote.id)).project_id).toBe(PROJECT_ID_DRAFT)
  })

  it('project_prefill이면 여전히 새 행사(project_created=true) — 옛 흐름 보존', async () => {
    const before = (await provider.listProjects()).length
    const imp = await provider.importQuoteFile('가상견적_A형.xlsx', await syntheticQuoteA())
    await provider.confirmQuoteImport(imp.id, { mapping: imp.mapping })
    const result = await provider.distributeQuoteImport(imp.id, { project_prefill: true })
    expect(result.project_created).toBe(true)
    expect((await provider.listProjects()).length).toBe(before + 1)
  })
})

describe('DoD 88 ③ 정산 시작 — 미연결 확정 견적은 그 행사에 연결 · 다른 행사의 견적은 422', () => {
  it('행사 없는 확정 견적으로 정산을 시작하면 견적이 그 행사에 연결된다', async () => {
    const q = await provider.finalizeQuote((await newUnlinkedQuote()).id)
    const board = await provider.createSettlementBoard(PROJECT_ID_DRAFT, q.id)
    expect(board.board.quote_id).toBe(q.id)
    expect((await provider.getQuote(q.id)).project_id).toBe(PROJECT_ID_DRAFT)
    expect((await provider.getProject(PROJECT_ID_DRAFT)).quote_id).toBe(q.id)
  })

  it('다른 행사에 연결된 확정 견적은 정산 기준으로 쓸 수 없다(422)', async () => {
    const q = await provider.finalizeQuote((await newUnlinkedQuote()).id)
    await provider.linkQuoteToProject(q.id, PROJECT_ID_DRAFT)
    await expectError(() => provider.createSettlementBoard(PROJECT_ID_PARTNER, q.id), 'validation', /다른 행사에 연결된 견적/)
  })
})

describe('DoD 88 ④ 견적 목록 — 기존 행사에 연결', () => {
  it("행사 없는 견적의 요약 패널에 '기존 행사에 연결'(진행 중 행사 셀렉트 + 연결) → 그 행사 묶음으로 옮겨진다", async () => {
    renderRoute('/quotes')
    await screen.findByRole('heading', { name: '견적' })
    const row = await screen.findByTestId(`quote-row-${UNLINKED_QUOTE_ID}`)
    await userEvent.click(within(row).getByRole('button', { name: 'v1' }))
    const summary = await screen.findByTestId('quote-summary')
    const box = within(summary).getByTestId('quote-link-existing')
    const select = within(box).getByLabelText('연결할 행사') as HTMLSelectElement
    // 진행 중 행사만 — 종료 행사는 후보에 없다
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain(PROJECT_ID_DRAFT)
    expect(options).not.toContain(PROJECT_ID_CLOSED)

    await userEvent.selectOptions(select, PROJECT_ID_DRAFT)
    await userEvent.click(within(box).getByRole('button', { name: '연결' }))

    const draftName = (await provider.getProject(PROJECT_ID_DRAFT)).name
    await waitFor(async () => {
      const group = screen.getByRole('region', { name: draftName })
      expect(within(group).getByTestId(`quote-row-${UNLINKED_QUOTE_ID}`)).toBeTruthy()
    })
    expect((await provider.getQuote(UNLINKED_QUOTE_ID)).project_id).toBe(PROJECT_ID_DRAFT)
    // 연결된 견적의 요약에는 연결 상자가 없다
    expect(within(screen.getByTestId('quote-summary')).queryByTestId('quote-link-existing')).toBeNull()
  })
})

describe('DoD 88 ⑤ 정산보드 빈 상태 — 미연결 확정 견적 고르기', () => {
  it('미연결 확정 견적을 고르면 "정산을 시작하면 이 행사에 연결됩니다" 안내 → 정산 시작 → 보드 + 연결', async () => {
    const q = await provider.finalizeQuote((await newUnlinkedQuote()).id)
    // 세팅 미완료 행사(③)는 OnboardingGuard가 설정으로 보내므로, 온보딩이 끝났고 보드가 없는 ②에서 시작한다
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_PARTNER)
    renderRoute('/settlement')
    const select = (await screen.findByLabelText('기준 견적')) as HTMLSelectElement
    expect(screen.queryByTestId('settlement-link-note')).toBeNull()
    await userEvent.selectOptions(select, q.id)
    expect(screen.getByTestId('settlement-link-note').textContent).toContain('이 행사에 연결됩니다')
    await userEvent.click(screen.getByRole('button', { name: '정산 시작' }))
    await screen.findByRole('heading', { name: '정산보드' })
    await waitFor(async () => {
      expect(await provider.getSettlementBoard(PROJECT_ID_PARTNER)).not.toBeNull()
    })
    expect((await provider.getQuote(q.id)).project_id).toBe(PROJECT_ID_PARTNER)
  })
})

describe('DoD 88 ⑥ 확정본 연결 — 맨 뒤(샘플 행사의 확정본을 archived로 바꾼다)', () => {
  it('확정본을 붙이면 finalize와 같은 규칙 — 같은 행사의 다른 확정본은 archived, projects.quote_id는 새 확정본', async () => {
    const q = await newUnlinkedQuote()
    const final = await provider.finalizeQuote(q.id)
    expect(final.project_id).toBeNull()
    const before = await provider.getProject(PROJECT_ID)
    expect(before.quote_id).toBe(FINAL_QUOTE_ID)

    const linked = await provider.linkQuoteToProject(final.id, PROJECT_ID)
    expect(linked.project_id).toBe(PROJECT_ID)
    expect((await provider.getProject(PROJECT_ID)).quote_id).toBe(final.id)
    const old = await provider.getQuote(FINAL_QUOTE_ID)
    expect(old.is_final).toBe(false)
    expect(old.status).toBe('archived')
  })
})
