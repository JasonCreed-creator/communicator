// 가짜 Google Sheets API — api/_lib/masterSheet/sheets.ts 계약 테스트용. 흉내 내는 엔드포인트:
//   GET  /v4/spreadsheets/{id}?fields=…            → 기본 시트 1장(sheetId 0)
//   POST /v4/spreadsheets/{id}:batchUpdate         → addSheet·updateSheetProperties·repeatCell·updateDimensionProperties 기록
//   POST /v4/spreadsheets/{id}/values:batchUpdate  → 범위별 값 저장
// `fail`로 구글 오류 본문(Sheets API 꺼짐 · scope 부족 · 인증 만료 · 요청 몰림)을 흉내 낸다. Drive 요청은 `wrap(driveFetch)`로 넘긴다.
export type FakeSheetsFailure = 'disabled' | 'scope' | 'unauthorized' | 'rate' | 'server' | null

export interface FakeSpreadsheet {
  sheets: { sheetId: number; title: string; grid: Record<string, unknown> }[]
  values: Map<string, unknown[][]>
}

export function createFakeSheets(opts: { fail?: FakeSheetsFailure; failAt?: 'get' | 'structure' | 'values' } = {}) {
  const spreadsheets = new Map<string, FakeSpreadsheet>()
  const calls: { method: string; url: string; body: unknown }[] = []
  let fail: FakeSheetsFailure = opts.fail ?? null
  const failAt = opts.failAt ?? 'structure'

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  function failure(): Response | null {
    if (!fail) return null
    if (fail === 'disabled') {
      return json(403, {
        error: {
          code: 403,
          message:
            'Google Sheets API has not been used in project 123456 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456 then retry.',
          status: 'PERMISSION_DENIED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'SERVICE_DISABLED',
              domain: 'googleapis.com',
              metadata: { activationUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456', service: 'sheets.googleapis.com' },
            },
          ],
        },
      })
    }
    if (fail === 'scope') {
      return json(403, {
        error: {
          code: 403,
          message: 'Request had insufficient authentication scopes.',
          status: 'PERMISSION_DENIED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', domain: 'googleapis.com' }],
        },
      })
    }
    if (fail === 'unauthorized') return json(401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } })
    if (fail === 'rate') return json(429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } })
    return json(500, { error: { code: 500, message: 'Internal error', status: 'INTERNAL' } })
  }

  function handles(url: URL): boolean {
    return url.hostname === 'sheets.googleapis.com'
  }

  async function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = new Headers(init?.headers ?? {}).get('authorization') ?? ''
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    calls.push({ method, url: url.href, body })
    if (!auth.startsWith('Bearer ')) return json(401, { error: { code: 401, message: 'no token', status: 'UNAUTHENTICATED' } })
    const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(?::batchUpdate|\/values:batchUpdate)?$/)
    if (!m) return json(404, { error: { code: 404, message: 'not found', status: 'NOT_FOUND' } })
    const id = decodeURIComponent(m[1])
    const ss = spreadsheets.get(id) ?? { sheets: [{ sheetId: 0, title: 'Sheet1', grid: {} }], values: new Map() }
    spreadsheets.set(id, ss)

    if (method === 'GET') {
      if (failAt === 'get') {
        const f = failure()
        if (f) return f
      }
      return json(200, { spreadsheetId: id, sheets: ss.sheets.map((s) => ({ properties: { sheetId: s.sheetId, title: s.title } })) })
    }
    if (url.pathname.endsWith('/values:batchUpdate')) {
      if (failAt === 'values') {
        const f = failure()
        if (f) return f
      }
      const data = ((body as { data?: { range: string; values: unknown[][] }[] })?.data ?? [])
      for (const d of data) {
        const title = d.range.replace(/^'(.*)'!.*$/, '$1').replace(/''/g, "'")
        if (!ss.sheets.some((s) => s.title === title)) return json(400, { error: { code: 400, message: `Unable to parse range: ${d.range}`, status: 'INVALID_ARGUMENT' } })
        ss.values.set(title, d.values)
      }
      return json(200, { spreadsheetId: id, totalUpdatedSheets: data.length })
    }
    if (url.pathname.endsWith(':batchUpdate')) {
      if (failAt === 'structure') {
        const f = failure()
        if (f) return f
      }
      const requests = ((body as { requests?: Record<string, { properties?: { sheetId?: number; title?: string; gridProperties?: Record<string, unknown> } }>[] })?.requests ?? [])
      for (const r of requests) {
        if (r.addSheet) {
          const p = r.addSheet.properties ?? {}
          if (ss.sheets.some((s) => s.sheetId === p.sheetId)) return json(400, { error: { code: 400, message: `A sheet with the id ${p.sheetId} already exists.`, status: 'INVALID_ARGUMENT' } })
          if (ss.sheets.some((s) => s.title === p.title)) return json(400, { error: { code: 400, message: `A sheet with the name "${p.title}" already exists.`, status: 'INVALID_ARGUMENT' } })
          ss.sheets.push({ sheetId: p.sheetId ?? ss.sheets.length, title: p.title ?? `Sheet${ss.sheets.length + 1}`, grid: p.gridProperties ?? {} })
        }
        if (r.updateSheetProperties) {
          const p = r.updateSheetProperties.properties ?? {}
          const s = ss.sheets.find((x) => x.sheetId === p.sheetId)
          if (!s) return json(400, { error: { code: 400, message: `No sheet with id: ${p.sheetId}`, status: 'INVALID_ARGUMENT' } })
          if (p.title) s.title = p.title
          if (p.gridProperties) s.grid = p.gridProperties
        }
      }
      return json(200, { spreadsheetId: id, replies: requests.map(() => ({})) })
    }
    return json(404, { error: { code: 404, message: 'not found', status: 'NOT_FOUND' } })
  }

  return {
    calls,
    spreadsheets,
    setFailure(next: FakeSheetsFailure) {
      fail = next
    },
    fetch: fetchImpl as typeof fetch,
    /** Sheets 요청은 여기서, 나머지(Drive·OAuth)는 넘긴 fetch로 */
    wrap(other: typeof fetch): typeof fetch {
      return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        return handles(url) ? fetchImpl(input, init) : other(input, init)
      }) as typeof fetch
    },
  }
}

export type FakeSheets = ReturnType<typeof createFakeSheets>
