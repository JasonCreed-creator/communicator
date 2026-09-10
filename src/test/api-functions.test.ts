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

// ── 견적서 → 구글 스프레드시트(2026-09-10) ──
import { generateKeyPairSync } from 'node:crypto'
import { createQuoteSpreadsheetOnDrive, GsheetError, handleGsheetRequest, safeFileName } from '../../api/_lib/quoteGsheet'

describe('api/quote-gsheet', () => {
  const fakeUser = { auth: { getUser: async () => ({ data: { user: { id: 'auth-1', email: 'sales@example.com' } }, error: null }) } }
  const fakeAdminWithRole = (role: string) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', app_role: role }, error: null }) }) }) }),
  })
  // 서비스 계정 JWT 서명에 쓸 일회용 RSA 키(테스트 전용 — 실키 아님)
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const SA = JSON.stringify({ client_email: 'sa@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
  const body = { file_name: '리멤버견적서_샘플_260910.xlsx', xlsx_base64: Buffer.from('PK-fake-xlsx').toString('base64') }

  it('GET은 준비 상태만(자격증명 값 없음) · POST 외 405 · 인증 없음 401', async () => {
    const r0 = await handleGsheetRequest(new Request('http://x/api/quote-gsheet', { method: 'GET' }), env)
    expect(await r0.json()).toEqual({ ready: false })
    const r1 = await handleGsheetRequest(new Request('http://x/api/quote-gsheet', { method: 'GET' }), { ...env, GOOGLE_SHEETS_SA_JSON: SA, GOOGLE_QUOTE_FOLDER_ID: 'f' })
    expect(await r1.json()).toEqual({ ready: true })
    expect((await handleGsheetRequest(new Request('http://x/api/quote-gsheet', { method: 'DELETE' }), env)).status).toBe(405)
    const r2 = await handleGsheetRequest(new Request('http://x/api/quote-gsheet', { method: 'POST', body: '{}' }), env)
    expect(r2.status).toBe(401)
  })

  it('staff는 403 — 자격증명보다 권한을 먼저 본다', async () => {
    await expect(
      createQuoteSpreadsheetOnDrive(body, 'tok', { ...env, GOOGLE_SHEETS_SA_JSON: SA, GOOGLE_QUOTE_FOLDER_ID: 'f' }, {
        userClient: () => fakeUser as never,
        adminClient: () => fakeAdminWithRole('staff') as never,
        fetchImpl: (async () => {
          throw new Error('구글 호출이 있어서는 안 된다')
        }) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<GsheetError>)
  })

  it('자격증명 미설정이면 503 — 데모로 흉내 내지 않는다', async () => {
    await expect(
      createQuoteSpreadsheetOnDrive(body, 'tok', env, {
        userClient: () => fakeUser as never,
        adminClient: () => fakeAdminWithRole('sales') as never,
        fetchImpl: fetch,
      }),
    ).rejects.toMatchObject({ status: 503 })
  })

  it('sales: 토큰 발급 → Drive 변환 업로드(폴더·mimeType) → 요청자 공유 → 링크', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'gtok' }), { status: 200 })
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        return new Response(JSON.stringify({ id: 'sid1', name: '리멤버견적서_샘플_260910', webViewLink: 'https://docs.google.com/spreadsheets/d/sid1/edit' }), { status: 200 })
      }
      if (url.includes('/permissions')) return new Response('{}', { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    const result = await createQuoteSpreadsheetOnDrive(
      body,
      'tok',
      { ...env, GOOGLE_SHEETS_SA_JSON: SA, GOOGLE_QUOTE_FOLDER_ID: 'folder-1' },
      { userClient: () => fakeUser as never, adminClient: () => fakeAdminWithRole('sales') as never, fetchImpl },
    )
    expect(result).toEqual({ url: 'https://docs.google.com/spreadsheets/d/sid1/edit', spreadsheet_id: 'sid1', file_name: '리멤버견적서_샘플_260910', shared_with: 'sales@example.com' })
    expect(calls.map((c) => c.url.split('?')[0])).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://www.googleapis.com/upload/drive/v3/files',
      'https://www.googleapis.com/drive/v3/files/sid1/permissions',
    ])
    const upload = calls[1]
    expect(upload.url).toContain('uploadType=multipart')
    expect(upload.url).toContain('supportsAllDrives=true')
    const raw = Buffer.from(upload.init.body as Uint8Array).toString('latin1')
    expect(raw).toContain('"mimeType":"application/vnd.google-apps.spreadsheet"')
    expect(raw).toContain('"parents":["folder-1"]')
    expect(raw).toContain('PK-fake-xlsx')
    expect(raw).toContain('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const perm = JSON.parse(String(calls[2].init.body)) as { role: string; type: string; emailAddress: string }
    expect(perm).toEqual({ role: 'writer', type: 'user', emailAddress: 'sales@example.com' })
    expect(calls[2].url).toContain('sendNotificationEmail=false')
  })

  it('공유 실패는 링크를 막지 않는다(shared_with=null) · 폴더 403은 안내 메시지', async () => {
    const okThenShareFails = (async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'gtok' }), { status: 200 })
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return new Response(JSON.stringify({ id: 'sid2', name: 'n' }), { status: 200 })
      return new Response('{}', { status: 400 })
    }) as unknown as typeof fetch
    const deps = { userClient: () => fakeUser as never, adminClient: () => fakeAdminWithRole('admin') as never }
    const r = await createQuoteSpreadsheetOnDrive(body, 'tok', { ...env, GOOGLE_SHEETS_SA_JSON: SA, GOOGLE_QUOTE_FOLDER_ID: 'f' }, { ...deps, fetchImpl: okThenShareFails })
    expect(r.shared_with).toBeNull()
    expect(r.url).toBe('https://docs.google.com/spreadsheets/d/sid2/edit')

    const folderDenied = (async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'gtok' }), { status: 200 })
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch
    await expect(
      createQuoteSpreadsheetOnDrive(body, 'tok', { ...env, GOOGLE_SHEETS_SA_JSON: SA, GOOGLE_QUOTE_FOLDER_ID: 'f' }, { ...deps, fetchImpl: folderDenied }),
    ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('GOOGLE_QUOTE_FOLDER_ID') })
  })

  it('파일명 정리 — 경로 구분자 제거·확장자 보장', () => {
    expect(safeFileName('../a/b\\c.xlsx')).toBe('.. a b c.xlsx')
    expect(safeFileName('견적서')).toBe('견적서.xlsx')
    expect(safeFileName('')).toBe('견적서.xlsx')
  })
})
