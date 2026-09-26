/** @vitest-environment jsdom */
// DoD 83 (Phase 4.8 · 설계서 v2.14 §19.5b) — 협력사 견적서 PDF·사진: 앱 쪽.
//   ① 대화상자: 파일 고르기가 엑셀·PDF·사진을 받는다 · AI 안내 한 줄 · PDF·사진이면 버튼 'AI로 읽기' + 읽는 중 안내 ·
//      HEIC 등은 받지 않는다(바꿔 올리라는 안내) · mock(데모)은 AI를 흉내 내지 않고 사실대로 알린다(가져오기 0건)
//   ② 확인 큐: AI가 읽은 견적서 = 'AI가 읽음' 배지 + 원본 대조 안내 + 모델 캡션 · 총액 미포함 줄은 기본 해제 · 엑셀 견적서에는 배지 없음
//   ③ 실서버 공급자 분기: PDF → api/ai(Bearer · 행사 id · 형식) → 확인 큐 저장(parsed.format 'ai' · reader) → 원본은 Drive에 PDF 형식 그대로 ·
//      엑셀은 AI를 부르지 않는다 · AI 오류(하루 한도)는 그대로 · 저장 전 실패면 가져오기 0건
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VendorQuoteDialog } from '../components/settlement/VendorQuoteImport'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { buildVendorQuote, VENDOR_QUOTE_AI_MOCK_MESSAGE, VENDOR_QUOTE_FILE_MESSAGE } from '../lib/vendorQuote'
import { AI_READ_WARNING, docFromAiVendorQuote, type AiVendorQuoteResult } from '../lib/vendorQuoteAi'
import { syntheticVendorQuoteAV } from '../modules/quote/import/__tests__/fixtures/syntheticVendorQuotes'
import { settlementDomain } from '../providers/supabase/domains/settlement'
import type { SupabaseCtx } from '../providers/supabase/ctx'
import type { SettlementBucket } from '../types/entities'
import type { VendorQuoteImportView } from '../types/views'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  mockProvider().switchUser('usr-pm')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])

function aiResult(): AiVendorQuoteResult {
  return {
    readable: true,
    unreadable_reason: null,
    quoted_at: null,
    vat_mode: 'unknown',
    sections: [
      {
        name: '음향',
        subtotal: null,
        items: [
          { title: '메인 스피커', spec: 'L/R', qty: 2, unit_price: 2_500_000, amount: 5_000_000, note: null, in_total: true },
          { title: '추가 안개 효과', spec: null, qty: 1, unit_price: 300_000, amount: 300_000, note: null, in_total: false },
        ],
      },
    ],
    totals: { items_sum: 5_000_000, agency_fee: null, agency_fee_rate: null, rounding: null, vat: null, grand_total: null },
  }
}

async function boardBuckets(): Promise<SettlementBucket[]> {
  return (await mockProvider().getSettlementBoard(PROJECT_ID))!.buckets.map((b) => b.bucket)
}

async function openDialog() {
  renderRoute('/settlement')
  await screen.findByTestId('settlement-kpis')
  const btn = screen.getByRole('button', { name: '협력사 견적서 불러오기' })
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
  await userEvent.click(btn)
  return screen.findByTestId('vendor-quote-dialog')
}

describe('DoD 83 · ① 대화상자 — 엑셀·PDF·사진', () => {
  it('파일 고르기가 PDF·사진을 받고 AI 안내가 있다 · PDF면 AI로 읽기 → mock은 사실대로(가져오기 0건)', async () => {
    const before = (await mockProvider().listVendorQuoteImports(PROJECT_ID)).length
    const dialog = await openDialog()
    const input = within(dialog).getByLabelText('견적서 파일') as HTMLInputElement
    for (const a of ['.xlsx', '.pdf', '.jpg', '.png', '.webp', 'application/pdf', 'image/jpeg']) expect(input.accept).toContain(a)
    expect(within(dialog).getByTestId('vendor-quote-ai-note').textContent).toContain('AI(Claude)')
    expect(within(dialog).getByRole('button', { name: '읽기' })).toBeTruthy()

    await userEvent.upload(input, new File([PDF_BYTES], '가상음향_견적.pdf', { type: 'application/pdf' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'AI로 읽기' }))
    expect(await within(dialog).findByText(VENDOR_QUOTE_AI_MOCK_MESSAGE)).toBeTruthy()
    expect(within(dialog).queryByTestId('vendor-quote-rows')).toBeNull()
    expect((await mockProvider().listVendorQuoteImports(PROJECT_ID)).length).toBe(before)
  })

  it('HEIC 사진은 받지 않는다(JPG로 바꾸라는 안내) · 읽는 동안 AI 안내 문구', async () => {
    const dialog = await openDialog()
    const input = within(dialog).getByLabelText('견적서 파일') as HTMLInputElement
    await userEvent.upload(input, new File([PDF_BYTES], 'IMG_0001.HEIC', { type: 'image/heic' }), { applyAccept: false })
    await userEvent.click(within(dialog).getByRole('button', { name: '읽기' }))
    expect(await within(dialog).findByText(VENDOR_QUOTE_FILE_MESSAGE)).toBeTruthy()
    expect(VENDOR_QUOTE_FILE_MESSAGE).toContain('HEIC')

    vi.spyOn(mockProvider(), 'importVendorQuote').mockImplementation(() => new Promise(() => {}))
    await userEvent.upload(input, new File([PDF_BYTES], '견적_사진.jpg', { type: 'image/jpeg' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'AI로 읽기' }))
    expect((await within(dialog).findByTestId('vendor-quote-reading')).textContent).toContain('AI가 견적서를 읽는 중')
    expect((within(dialog).getByRole('button', { name: 'AI로 읽기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('DoD 83 · ② 확인 큐 — AI가 읽은 견적서', () => {
  function viewOf(parsed: VendorQuoteImportView['parsed'], questions: VendorQuoteImportView['questions']): VendorQuoteImportView {
    return {
      id: 'sim-ai-1',
      board_id: 'board',
      file_name: '가상음향_견적.pdf',
      drive_file_id: null,
      vendor_id: null,
      vendor_name: null,
      status: 'parsed',
      created_at: '2026-09-26T03:00:00.000Z',
      parsed,
      questions,
      item_count: 0,
    }
  }

  it("'AI가 읽음' 배지 + 원본 대조 안내 + 모델 캡션 · 총액 미포함 줄 기본 해제 · 경고 줄", async () => {
    const buckets = await boardBuckets()
    const { parsed, questions } = buildVendorQuote(docFromAiVendorQuote(aiResult()), buckets, { kind: 'ai', model: 'claude-sonnet-5' })
    render(<VendorQuoteDialog projectId={PROJECT_ID} initial={viewOf(parsed, questions)} buckets={buckets} vendors={[]} onClose={() => {}} onConfirmed={() => {}} />)
    const dialog = screen.getByTestId('vendor-quote-dialog')
    const banner = within(dialog).getByTestId('vendor-quote-ai-read')
    expect(within(banner).getByText('AI가 읽음')).toBeTruthy()
    expect(banner.textContent).toContain('원본 견적서와 한 줄씩 대조')
    expect(dialog.textContent).toContain('AI 읽기(claude-sonnet-5) · 행 2개')
    expect((within(dialog).getByLabelText('추가 안개 효과 포함') as HTMLInputElement).checked).toBe(false)
    expect((within(dialog).getByLabelText('메인 스피커 포함') as HTMLInputElement).checked).toBe(true)
    expect(within(dialog).getByTestId('vendor-quote-sums').textContent).toContain(AI_READ_WARNING)
    // 표기 없음 → 부가세는 반드시 고른다(AI라고 추측하지 않는다)
    expect(within(dialog).getByTestId('vendor-quote-vat-needs')).toBeTruthy()
  })

  it('엑셀 견적서에는 AI 배지가 없다(서식 n형 캡션 그대로)', async () => {
    const view = await mockProvider().importVendorQuote(PROJECT_ID, { file_name: '가상음향.xlsx', data: await syntheticVendorQuoteAV() })
    render(<VendorQuoteDialog projectId={PROJECT_ID} initial={view} buckets={await boardBuckets()} vendors={[]} onClose={() => {}} onConfirmed={() => {}} />)
    const dialog = screen.getByTestId('vendor-quote-dialog')
    expect(within(dialog).queryByTestId('vendor-quote-ai-read')).toBeNull()
    expect(dialog.textContent).toMatch(/서식 [ABC]형 · 행 6개/)
    await mockProvider().discardVendorQuoteImport(view.id)
  })
})

// ── ③ 실서버 공급자 분기(가짜 Supabase ctx · 가짜 fetch) ────────────────

function fakeCtx(buckets: SettlementBucket[]) {
  const inserts: { table: string; payload: any }[] = []
  function builder(table: string) {
    const st: { op: 'select' | 'insert'; payload: any } = { op: 'select', payload: null }
    const result = () => {
      if (table === 'settlement_boards') return { data: { id: 'board-1', project_id: 'prj-1' }, error: null }
      if (table === 'settlement_buckets') return { data: buckets, error: null }
      if (table === 'settlement_items') return { data: [], error: null }
      if (table === 'settlement_imports' && st.op === 'insert') {
        return { data: { ...st.payload, id: 'imp-ai-1', drive_file_id: null, created_at: '2026-09-26T03:00:00Z' }, error: null }
      }
      return { data: [], error: null }
    }
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      maybeSingle: () => b,
      single: () => b,
      insert: (p: any) => {
        st.op = 'insert'
        st.payload = p
        inserts.push({ table, payload: p })
        return b
      },
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
    }
    return b
  }
  const ctx = {
    env: { apiBase: '/api' },
    sb: { from: builder, auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-ai' } } }) } },
    assertWritable: async () => ({ id: 'prj-1', status: 'active' }),
    assertPm: async () => ({ id: 'me-pm' }),
    q: (res: { data: unknown; error: unknown }) => {
      if (res.error) throw new Error('db')
      return res.data
    },
    ok: (res: { error: unknown }) => {
      if (res.error) throw new Error('db')
    },
  } as unknown as SupabaseCtx
  return { ctx, inserts }
}

function fakeServer(aiResponse: () => Response) {
  const calls: { url: string; method: string; headers: Headers; body: any }[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const body = init?.body
    calls.push({ url: u, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: typeof body === 'string' ? JSON.parse(body) : body })
    if (u.startsWith('/api/ai')) return aiResponse()
    if (u.startsWith('/api/drive?action=settlement-file')) return new Response(JSON.stringify({ file_id: 'drv-orig-1' }), { status: 200 })
    if (u.startsWith('/api/drive')) return new Response(JSON.stringify({ configured: true, connected: true }), { status: 200 })
    return new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchImpl)
  return calls
}

describe('DoD 83 · ③ 실서버 공급자 — PDF는 api/ai로, 엑셀은 그대로', () => {
  it('PDF → api/ai(Bearer · 행사 id · 형식 · base64) → 확인 큐 저장(format ai · reader) → 원본 Drive 보관은 PDF 형식 그대로', async () => {
    const buckets = await boardBuckets()
    const { ctx, inserts } = fakeCtx(buckets)
    const doc = docFromAiVendorQuote(aiResult())
    const calls = fakeServer(() => new Response(JSON.stringify({ doc, model: 'claude-sonnet-5', usage: { used: 1, limit: 30 } }), { status: 200 }))
    const view = await settlementDomain(ctx).importVendorQuote('prj-1', { file_name: '가상음향_견적.pdf', data: PDF_BYTES.buffer.slice(0) as ArrayBuffer })

    const ai = calls.find((c) => c.url.startsWith('/api/ai'))!
    expect(ai.url).toBe('/api/ai?action=vendor-quote')
    expect(ai.method).toBe('POST')
    expect(ai.headers.get('authorization')).toBe('Bearer jwt-ai')
    expect(ai.body).toEqual({
      project_id: 'prj-1',
      file_name: '가상음향_견적.pdf',
      media_type: 'application/pdf',
      data_base64: Buffer.from(PDF_BYTES).toString('base64'),
    })
    const saved = inserts.find((i) => i.table === 'settlement_imports')!.payload
    expect(saved.parsed).toMatchObject({ kind: 'vendor_quote', format: 'ai', reader: { kind: 'ai', model: 'claude-sonnet-5' } })
    expect(saved.status).toBe('parsed')
    expect(view.parsed.format).toBe('ai')
    expect(view.drive_file_id).toBe('drv-orig-1')
    const drive = calls.find((c) => c.url.startsWith('/api/drive?action=settlement-file'))!
    expect(drive.method).toBe('PUT')
    expect(drive.headers.get('content-type')).toBe('application/pdf')
  })

  it('엑셀은 AI를 부르지 않는다 · 원본은 xlsx 형식', async () => {
    const { ctx } = fakeCtx(await boardBuckets())
    const calls = fakeServer(() => new Response('{}', { status: 500 }))
    const view = await settlementDomain(ctx).importVendorQuote('prj-1', { file_name: '가상음향.xlsx', data: await syntheticVendorQuoteAV() })
    expect(calls.some((c) => c.url.startsWith('/api/ai'))).toBe(false)
    expect(view.parsed.format).not.toBe('ai')
    expect('reader' in view.parsed).toBe(false)
    expect(calls.find((c) => c.url.startsWith('/api/drive?action=settlement-file'))!.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  })

  it('AI 오류(하루 한도)는 문구 그대로 · 가져오기는 저장되지 않는다', async () => {
    const { ctx, inserts } = fakeCtx(await boardBuckets())
    fakeServer(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'rate_limited', message: '오늘 AI 읽기 30회를 모두 썼습니다 — 내일(한국 시각 0시) 다시 쓸 수 있습니다.' } }),
          { status: 429 },
        ),
    )
    await expect(
      settlementDomain(ctx).importVendorQuote('prj-1', { file_name: '견적.pdf', data: PDF_BYTES.buffer.slice(0) as ArrayBuffer }),
    ).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('30회를 모두 썼습니다') })
    expect(inserts.filter((i) => i.table === 'settlement_imports')).toEqual([])
  })
})
