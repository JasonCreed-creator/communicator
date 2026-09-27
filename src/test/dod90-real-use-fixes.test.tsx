/** @vitest-environment jsdom */
// DoD 90 — 실사용 결함 묶음 1(2026-09-27 · 실전 투입 전 실사용 테스트에서 기획자님이 하나씩 던진 것)
//   ① 정산보드 버킷 견적 금액 수기 조정(§19.2) — "버킷의 견적 금액 자체를 고치고 싶음"
//   ② 개요 저장 뒤 Drive 행사 폴더 자리·이름 맞춤 — 폴더가 '연도 미정/새 행사'로 남아 있었다
//   ③ Drive 카드 표준 트리 안내 — 두 열에서 03 줄이 옆 칸 위로 겹쳤다
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'
import { STANDARD_TREE } from '../components/settings/DriveCard'

const ensureTreeQuietly = vi.fn()
vi.mock('../providers/supabase/drive', () => ({
  driveFor: () => ({ ensureTreeQuietly }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mockProvider().switchUser('usr-pm')
})

async function openBoard() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
  renderRoute('/settlement')
  return screen.findByTestId('settlement-kpis')
}

function kpiNumber(label: string): number {
  const card = screen.getByText(label, { selector: 'span.t-caption' }).closest('.ui-card') as HTMLElement
  const big = card.querySelector('.text-2xl') as HTMLElement
  return Number((big.textContent ?? '').replace(/[^\d-]/g, ''))
}

describe('DoD 90 ① 버킷 견적 금액 수기 조정', () => {
  it('PM: 견적 칸의 고치기 단추 → 금액 줄 → 저장하면 버킷 견적·마진 기준 계약액이 바뀌고 표를 다시 읽는다', async () => {
    await openBoard()
    const provider = mockProvider()
    const before = (await provider.getSettlementBoard(PROJECT_ID))!
    const s2 = before.buckets.find((b) => b.bucket.code === 's2')!
    const baseBefore = kpiNumber('마진 기준 계약액')

    // 고치기 단추는 견적 칸 안에 있고, 누르면 그 행 아래 금액 줄이 열린다(행 펼침과 별개)
    const row = screen.getByTestId('bucket-row-s2')
    await userEvent.click(within(row).getByRole('button', { name: `${s2.bucket.label} 견적 금액 고치기` }))
    const form = await screen.findByTestId('bucket-quote-form-s2')
    expect(screen.queryByTestId('bucket-panel-s2')).toBeNull() // 견적 고치기가 발주 항목 판을 열지는 않는다
    const input = within(form).getByRole('textbox', { name: `${s2.bucket.label} 견적 금액` })
    expect((input as HTMLInputElement).value).toBe(s2.bucket.quote_amount.toLocaleString('ko-KR'))

    await userEvent.clear(input)
    await userEvent.type(input, String(s2.bucket.quote_amount + 1_000_000))
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(screen.queryByTestId('bucket-quote-form-s2')).toBeNull())
    const after = (await provider.getSettlementBoard(PROJECT_ID))!
    expect(after.buckets.find((b) => b.bucket.code === 's2')!.bucket.quote_amount).toBe(s2.bucket.quote_amount + 1_000_000)
    await waitFor(() => expect(kpiNumber('마진 기준 계약액')).toBe(baseBefore + 1_000_000))
    // 표의 견적 칸도 새 값
    expect(within(screen.getByTestId('bucket-row-s2')).getByRole('button', { name: `${s2.bucket.label} 견적 금액 고치기` }).textContent).toContain(
      (s2.bucket.quote_amount + 1_000_000).toLocaleString('ko-KR'),
    )
  })

  it('빈 값·음수는 저장이 막히고, 취소·Esc로 줄이 닫힌다', async () => {
    await openBoard()
    const provider = mockProvider()
    const s1 = (await provider.getSettlementBoard(PROJECT_ID))!.buckets.find((b) => b.bucket.code === 's1')!
    await userEvent.click(within(screen.getByTestId('bucket-row-s1')).getByRole('button', { name: `${s1.bucket.label} 견적 금액 고치기` }))
    const form = await screen.findByTestId('bucket-quote-form-s1')
    const input = within(form).getByRole('textbox', { name: `${s1.bucket.label} 견적 금액` })
    await userEvent.clear(input)
    expect((within(form).getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(input, '-5')
    expect((within(form).getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('bucket-quote-form-s1')).toBeNull())
    // 값은 그대로
    expect((await provider.getSettlementBoard(PROJECT_ID))!.buckets.find((b) => b.bucket.code === 's1')!.bucket.quote_amount).toBe(s1.bucket.quote_amount)
  })

  it('원가 없는 버킷(PCO 기획료)도 고칠 수 있다 — 마진 구성의 고정분이 함께 움직인다', async () => {
    await openBoard()
    const provider = mockProvider()
    const s5 = (await provider.getSettlementBoard(PROJECT_ID))!.buckets.find((b) => b.bucket.code === 's5')!
    const marginBefore = kpiNumber('최종 마진')
    await userEvent.click(within(screen.getByTestId('bucket-row-s5')).getByRole('button', { name: `${s5.bucket.label} 견적 금액 고치기` }))
    const form = await screen.findByTestId('bucket-quote-form-s5')
    const input = within(form).getByRole('textbox', { name: `${s5.bucket.label} 견적 금액` })
    await userEvent.clear(input)
    await userEvent.type(input, String(s5.bucket.quote_amount + 500_000))
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(kpiNumber('최종 마진')).toBe(marginBefore + 500_000))
  })

  it('PM이 아니면 고치기 단추가 없다 — 견적 칸은 숫자만', async () => {
    mockProvider().switchUser('usr-design')
    await openBoard()
    expect(screen.queryByRole('button', { name: /견적 금액 고치기/ })).toBeNull()
    expect(within(screen.getByTestId('bucket-row-s2')).getAllByRole('cell')[1].textContent).toMatch(/^[\d,]+$/)
  })
})

describe('DoD 90 ② 개요 저장 뒤 Drive 행사 폴더 자리·이름 맞춤(실서버 provider)', () => {
  beforeEach(() => ensureTreeQuietly.mockReset())

  function fakeCtx(updateResult: Record<string, unknown>) {
    const updates: Record<string, unknown>[] = []
    function builder(table: string) {
      const b: any = {
        select: () => b,
        eq: () => b,
        single: () => b,
        maybeSingle: () => b,
        update: (row: Record<string, unknown>) => {
          updates.push({ table, ...row })
          return b
        },
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data: { ...updateResult }, error: null }).then(ok, bad),
      }
      return b
    }
    const ctx = {
      sb: { from: builder },
      assertPm: async () => ({ id: 'me-pm' }),
      assertPmOps: async () => ({ id: 'me-pm' }),
      assertWritable: async () => ({ ...updateResult }),
      log: async () => undefined,
      q: (res: { data: unknown; error: unknown }) => {
        if (res.error) throw new Error('db')
        return res.data
      },
    }
    return { ctx, updates }
  }

  const baseRow = {
    id: 'prj-1',
    name: '새 행사',
    code: 'EVT-1',
    status: 'active',
    event_date: null,
    organizer: null,
    venue: null,
    drive_root_folder_id: 'fld-1',
    onboarded_at: null,
  }

  it('행사명·행사일·고객사가 바뀌면 ensure-tree를 신호한다(기다리지 않음)', async () => {
    const { projectsDomain } = await import('../providers/supabase/domains/projects')
    const { ctx } = fakeCtx(baseRow)
    const domain = projectsDomain(ctx as never)
    await domain.updateProject('prj-1', { name: '가상 컨퍼런스' })
    await domain.updateProject('prj-1', { event_date: '2026-11-04' })
    await domain.updateProject('prj-1', { organizer: '가상고객' })
    expect(ensureTreeQuietly).toHaveBeenCalledTimes(3)
    expect(ensureTreeQuietly).toHaveBeenCalledWith('prj-1')
  })

  it('행사 ID와 무관한 칸(장소·인원)만 바뀌면 신호하지 않는다 · 개요 편집(pm·ops)의 행사일은 신호한다', async () => {
    const { projectsDomain } = await import('../providers/supabase/domains/projects')
    const { ctx } = fakeCtx(baseRow)
    const domain = projectsDomain(ctx as never)
    await domain.updateProject('prj-1', { venue: '가상 홀', expected_headcount: 120 })
    expect(ensureTreeQuietly).not.toHaveBeenCalled()
    await domain.updateProjectOverview('prj-1', { theme: '주제' })
    expect(ensureTreeQuietly).not.toHaveBeenCalled()
    await domain.updateProjectOverview('prj-1', { event_date: '2026-12-01' })
    expect(ensureTreeQuietly).toHaveBeenCalledTimes(1)
  })
})

describe('DoD 90 ③ Drive 카드 표준 트리 안내 줄', () => {
  it('하위 폴더까지 적은 줄은 두 열 폭을 쓰고, 어떤 줄에도 줄바꿈 금지가 없다', async () => {
    const { default: DriveCard } = await import('../components/settings/DriveCard')
    render(<DriveCard projectId={PROJECT_ID} driveRootFolderId={null} isPm isAdmin={false} onChanged={() => undefined} />)
    const items = screen.getAllByRole('listitem').filter((li) => STANDARD_TREE.includes(li.textContent ?? ''))
    expect(items).toHaveLength(STANDARD_TREE.length)
    for (const li of items) expect(li.className).not.toContain('whitespace-nowrap')
    const wide = items.filter((li) => li.className.includes('sm:col-span-2'))
    expect(wide.map((li) => li.textContent)).toEqual(STANDARD_TREE.filter((p) => p.includes(' · ')))
  })
})
