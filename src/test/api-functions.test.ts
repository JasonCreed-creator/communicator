// Phase 4 — Vercel Functions(api/) 순수 로직 계약. 실 Supabase 없이 도는 부분만 본다:
//   ① 견적 재계산: 인증 헤더 없음 401 · POST 외 405 · 클라이언트가 보낸 total은 무시되고 엔진 값이 저장된다(가짜 클라이언트)
//   ② 시트 읽기: URL → spreadsheetId · 헤더 매핑 → 원본 행(무효 사유 3종·상태 한글 정규화·sheet_status 매핑)
import { describe, expect, it } from 'vitest'
import { handleRecalcRequest, recalcQuote, RecalcError } from '../../api/_lib/quoteRecalc'
import { handleSheetsRequest, rowsFromValues, spreadsheetIdFrom } from '../../api/_lib/sheets'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { createFixtureQuotes } from '../fixtures/quoteFixtures'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }

describe('api/quote-recalc', () => {
  it('POST 외 메서드는 405, Authorization 없으면 401', async () => {
    const r1 = await handleRecalcRequest(new Request('http://x/api/quote-recalc', { method: 'GET' }), env)
    expect(r1.status).toBe(405)
    const r2 = await handleRecalcRequest(new Request('http://x/api/quote-recalc', { method: 'POST', body: '{}' }), env)
    expect(r2.status).toBe(401)
    expect((await r2.json()).error.code).toBe('forbidden')
  })

  it('서버 재계산: 클라이언트가 보낸 total은 버려지고 엔진 산출이 저장된다(가짜 클라이언트)', async () => {
    const sample = createFixtureQuotes('prj-stc26')[0]
    const inserted: Record<string, unknown>[] = []
    const fakeAdmin = {
      from(table: string) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () =>
            table === 'profiles' ? { data: { id: 'p1', app_role: 'sales' }, error: null } : { data: null, error: null },
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, ...row })
            return { select: () => ({ single: async () => ({ data: { id: 'q-new', ...row }, error: null }) }) }
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        }
        return chain
      },
    }
    const fakeUser = { auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } }, error: null }) } }
    const deps = { userClient: () => fakeUser as never, adminClient: () => fakeAdmin as never }
    const tampered = { ...sample.input }
    const quote = await recalcQuote({ op: 'create', input: tampered }, 'tok', deps)
    const expected = computeQuoteOutputs(sample.input)
    expect(quote.total_amount).toBe(expected.total_amount)
    expect(quote.breakdown).toEqual(expected.breakdown)
    expect(inserted[0].source).toBe('engine')
    expect(inserted[0].total_amount).toBe(expected.total_amount)
  })

  it('staff는 403', async () => {
    const fakeAdmin = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', app_role: 'staff' }, error: null }) }) }) }),
    }
    const fakeUser = { auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } }, error: null }) } }
    const sample = createFixtureQuotes('prj-stc26')[0]
    await expect(
      recalcQuote({ op: 'create', input: sample.input }, 'tok', { userClient: () => fakeUser as never, adminClient: () => fakeAdmin as never }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<RecalcError>)
  })
})

describe('api/sheets', () => {
  it('POST 외 405 · 인증 없음 401', async () => {
    expect((await handleSheetsRequest(new Request('http://x/api/sheets', { method: 'GET' }), env)).status).toBe(405)
    expect((await handleSheetsRequest(new Request('http://x/api/sheets', { method: 'POST', body: '{}' }), env)).status).toBe(401)
  })

  it('spreadsheetId 추출', () => {
    expect(spreadsheetIdFrom('https://docs.google.com/spreadsheets/d/1AbC_d-9/edit#gid=0')).toBe('1AbC_d-9')
    expect(() => spreadsheetIdFrom('https://example.com/x')).toThrow()
  })

  it('헤더 매핑 → 원본 행: 무효 사유 3종 · 상태 한글 정규화 · sheet_status 매핑(3.17③) · 빈 줄 건너뜀', () => {
    const values = [
      ['성명', '회사', '이메일', '휴대폰', '구분', '신청일시', '상태'],
      ['김도현', '가상협회', 'a@example.com', '010-1', 'VIP', '2026-08-21 14:03', '확정'],
      ['', '', '', '', '', '', ''],
      ['이름없음행', '회사', '', '', '', '', ''],
      ['', '회사', 'b@example.com', '', '', '', '신청'],
      ['중복', '회사', 'A@example.com', '', '', '', '취소'],
    ]
    const mapping = [
      { column: '성명', field: 'name' as const },
      { column: '회사', field: 'org' as const },
      { column: '이메일', field: 'email' as const },
      { column: '휴대폰', field: 'phone' as const },
      { column: '구분', field: 'group_tag' as const },
      { column: '신청일시', field: 'registered_at' as const },
      { column: '상태', field: 'sheet_status' as const },
    ]
    const rows = rowsFromValues(values, mapping)
    expect(rows.map((r) => r.sheet_row_id)).toEqual(['row-2', 'row-4', 'row-5', 'row-6'])
    expect(rows[0]).toMatchObject({ name: '김도현', status: 'confirmed', invalid_reason: null, group_tag: 'VIP' })
    expect(rows[0].registered_at.startsWith('2026-08-21')).toBe(true)
    expect(rows[1].invalid_reason).toBe('no_email')
    expect(rows[2].invalid_reason).toBe('missing_required')
    expect(rows[3]).toMatchObject({ invalid_reason: 'duplicate_email', status: 'cancelled' })
  })
})
