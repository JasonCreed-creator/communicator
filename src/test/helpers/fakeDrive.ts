// 가짜 Google Drive + OAuth 서버(메모리) — Phase 5 계약 테스트용(CLAUDE.md Phase 5 "모의 서버 계약 테스트로 커버").
// api/_lib/drive가 부르는 엔드포인트만 흉내 낸다: OAuth token·revoke · files get/list/create/update(PATCH)/copy ·
// 재개 업로드(세션 시작·조각 PUT·상태 조회) · multipart 업로드(견적 시트) · media(Range) · export · about.
// 권한 모델은 단순화: 발급된 access token이면 전부 보인다. `hidden`에 넣은 id는 "있지만 이 계정이 못 보는 파일"(404).
// permissions 엔드포인트는 일부러 구현하지 않는다 — 호출되면 calls에 남고 404를 준다(anyone 링크 0 가드 검증용).

export interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  trashed: boolean
  appProperties: Record<string, string>
  content: Uint8Array
  createdTime: string
  modifiedTime: string
  shortcutDetails?: { targetId: string }
  capabilities?: { canAddChildren?: boolean }
}

export interface FakeDriveOptions {
  /** 저장소 루트 폴더 id (이미 존재) */
  rootId?: string
  /** 루트의 부모(상위 폴더) — 루트 밖 파일을 둘 곳 */
  outsideId?: string
  refreshToken?: string
  accountEmail?: string
  now?: () => number
}

export const FOLDER = 'application/vnd.google-apps.folder'

let seq = 0
function newId(prefix = 'F'): string {
  seq += 1
  return `${prefix}${String(seq).padStart(4, '0')}xxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 33)
}

function unescapeQ(s: string): string {
  return s.replace(/\\(.)/g, '$1')
}

export function createFakeDrive(opts: FakeDriveOptions = {}) {
  const rootId = opts.rootId ?? 'ROOT_FOLDER_ID_0000000000000000001'
  const outsideId = opts.outsideId ?? 'OUTSIDE_FOLDER_ID_000000000000001'
  const now = opts.now ?? (() => Date.parse('2026-09-24T10:00:00Z'))
  const files = new Map<string, FakeFile>()
  const sessions = new Map<string, { meta: Partial<FakeFile> & { parents: string[] }; size: number; mime: string; chunks: Uint8Array[]; received: number }>()
  const hidden = new Set<string>()
  const calls: { method: string; url: string }[] = []
  const tokens = new Set<string>()
  let refreshToken = opts.refreshToken ?? 'refresh-token-1'
  let invalidGrant = false
  let tokenIssues = 0
  /** 다음 copy 호출 n회 실패(502) */
  let failCopies = 0
  /** 다음 조각 PUT n회 네트워크 실패 흉내(fetch reject) */
  let failChunks = 0

  function add(f: Partial<FakeFile> & { name: string; parents: string[] }): FakeFile {
    const file: FakeFile = {
      id: f.id ?? newId(f.mimeType === FOLDER ? 'D' : 'F'),
      name: f.name,
      mimeType: f.mimeType ?? 'application/octet-stream',
      parents: f.parents,
      trashed: f.trashed ?? false,
      appProperties: f.appProperties ?? {},
      content: f.content ?? new Uint8Array(0),
      createdTime: f.createdTime ?? new Date(now()).toISOString(),
      modifiedTime: f.modifiedTime ?? new Date(now()).toISOString(),
      shortcutDetails: f.shortcutDetails,
      capabilities: f.capabilities ?? { canAddChildren: true },
    }
    files.set(file.id, file)
    return file
  }

  add({ id: outsideId, name: '상위 폴더', mimeType: FOLDER, parents: [] })
  add({ id: rootId, name: 'MICE Communicator', mimeType: FOLDER, parents: [outsideId] })

  function view(f: FakeFile) {
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.mimeType === FOLDER ? undefined : String(f.content.length),
      parents: f.parents,
      trashed: f.trashed,
      appProperties: f.appProperties,
      webViewLink: `https://drive.google.com/file/d/${f.id}/view`,
      shortcutDetails: f.shortcutDetails,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      capabilities: f.capabilities,
    }
  }

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

  function authed(init: RequestInit | undefined): boolean {
    const h = new Headers(init?.headers ?? {})
    const m = (h.get('authorization') ?? '').match(/^Bearer (.+)$/)
    return !!m && tokens.has(m[1])
  }

  function matchQuery(q: string): FakeFile[] {
    const parent = q.match(/'((?:[^'\\]|\\.)*)' in parents/)?.[1]
    const name = q.match(/name = '((?:[^'\\]|\\.)*)'/)?.[1]
    const mime = q.match(/mimeType = '([^']+)'/)?.[1]
    const ap = q.match(/appProperties has \{ key='((?:[^'\\]|\\.)*)' and value='((?:[^'\\]|\\.)*)' \}/)
    const notTrashed = /trashed = false/.test(q)
    return [...files.values()].filter(
      (f) =>
        !hidden.has(f.id) &&
        (!parent || f.parents.includes(unescapeQ(parent))) &&
        (!name || f.name === unescapeQ(name)) &&
        (!mime || f.mimeType === mime) &&
        (!ap || f.appProperties[unescapeQ(ap[1])] === unescapeQ(ap[2])) &&
        (!notTrashed || !f.trashed),
    )
  }

  async function bodyBytes(init: RequestInit | undefined): Promise<Uint8Array> {
    const b = init?.body
    if (!b) return new Uint8Array(0)
    if (b instanceof Uint8Array) return b
    if (b instanceof ArrayBuffer) return new Uint8Array(b)
    if (typeof Blob !== 'undefined' && b instanceof Blob) return new Uint8Array(await b.arrayBuffer())
    if (typeof b === 'string') return new TextEncoder().encode(b)
    return new Uint8Array(await new Response(b as BodyInit).arrayBuffer())
  }

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ method, url: url.href })

    // ── OAuth ──
    if (url.href.startsWith('https://oauth2.googleapis.com/token')) {
      const form = new URLSearchParams(String(init?.body ?? ''))
      const grant = form.get('grant_type')
      if (grant === 'refresh_token') {
        if (invalidGrant || form.get('refresh_token') !== refreshToken) return json(400, { error: 'invalid_grant' })
        tokenIssues++
        const t = `at-${tokenIssues}`
        tokens.add(t)
        return json(200, { access_token: t, expires_in: 3600 })
      }
      if (grant === 'authorization_code') {
        if (form.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' })
        tokenIssues++
        const t = `at-${tokenIssues}`
        tokens.add(t)
        return json(200, { access_token: t, refresh_token: form.get('client_id') === 'no-refresh' ? undefined : refreshToken, expires_in: 3600 })
      }
      if (grant === 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
        tokenIssues++
        const t = `sa-${tokenIssues}`
        tokens.add(t)
        return json(200, { access_token: t, expires_in: 3600 })
      }
      return json(400, { error: 'unsupported_grant_type' })
    }
    if (url.href.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('', { status: 200 })

    // ── 재개 업로드: 세션 URI(PUT)는 인증 없이 ──
    if (url.pathname === '/upload/drive/v3/files' && url.searchParams.get('upload_id') && method === 'PUT') {
      if (failChunks > 0) {
        failChunks--
        throw new TypeError('network error (fake)')
      }
      const s = sessions.get(url.searchParams.get('upload_id')!)
      if (!s) return json(404, { error: { message: 'session expired' } })
      const range = new Headers(init?.headers ?? {}).get('content-range') ?? ''
      const bytes = await bodyBytes(init)
      const finish = () => {
        const all = new Uint8Array(s.received)
        let o = 0
        for (const c of s.chunks) {
          all.set(c, o)
          o += c.length
        }
        const f = add({ ...s.meta, name: s.meta.name!, parents: s.meta.parents, mimeType: s.mime, content: all })
        sessions.delete(url.searchParams.get('upload_id')!)
        return json(200, view(f))
      }
      const statusQ = range.match(/^bytes \*\/(\d+)$/)
      if (statusQ) {
        if (Number(statusQ[1]) === 0 && s.size === 0) return finish()
        return s.received >= s.size && s.size > 0
          ? finish()
          : new Response(null, { status: 308, headers: s.received > 0 ? { range: `bytes=0-${s.received - 1}` } : {} })
      }
      const m = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
      if (!m) return json(400, { error: { message: 'bad range' } })
      const [start, end] = [Number(m[1]), Number(m[2])]
      if (start !== s.received || end - start + 1 !== bytes.length) return json(400, { error: { message: 'range mismatch' } })
      s.chunks.push(bytes)
      s.received += bytes.length
      if (s.received >= s.size) return finish()
      return new Response(null, { status: 308, headers: { range: `bytes=0-${s.received - 1}` } })
    }

    if (!authed(init)) return json(401, { error: { message: 'unauthenticated' } })

    // ── 업로드 시작 · multipart ──
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      if (url.searchParams.get('uploadType') === 'resumable') {
        const meta = JSON.parse(String(init?.body ?? '{}')) as Partial<FakeFile> & { parents: string[] }
        const h = new Headers(init?.headers ?? {})
        if (meta.parents?.some((p) => !files.has(p))) return json(404, { error: { message: 'parent not found' } })
        const id = `up${sessions.size + 1}${Math.random().toString(36).slice(2, 8)}`
        sessions.set(id, { meta, size: Number(h.get('x-upload-content-length') ?? 0), mime: h.get('x-upload-content-type') ?? 'application/octet-stream', chunks: [], received: 0 })
        return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` } })
      }
      if (url.searchParams.get('uploadType') === 'multipart') {
        const raw = new TextDecoder('latin1').decode(await bodyBytes(init))
        const meta = JSON.parse(raw.slice(raw.indexOf('{'), raw.indexOf('}\r\n') + 1)) as { name: string; mimeType: string; parents: string[] }
        if (meta.parents.some((p) => !files.has(p))) return json(404, { error: { message: 'parent not found' } })
        const f = add({ name: meta.name, mimeType: meta.mimeType, parents: meta.parents })
        return json(200, view(f))
      }
    }

    const fm = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)(\/copy|\/export|\/permissions)?$/)
    // ── files.get / media / export ──
    if (fm && method === 'GET' && !fm[2]) {
      const f = files.get(decodeURIComponent(fm[1]))
      if (!f || hidden.has(f.id)) return json(404, { error: { message: 'not found' } })
      if (url.searchParams.get('alt') === 'media') {
        const range = new Headers(init?.headers ?? {}).get('range')
        const m = range?.match(/^bytes=(\d+)-(\d*)$/)
        if (m) {
          const start = Number(m[1])
          const end = m[2] ? Number(m[2]) : f.content.length - 1
          const part = f.content.slice(start, end + 1)
          return new Response(part, {
            status: 206,
            headers: { 'content-type': f.mimeType, 'content-length': String(part.length), 'content-range': `bytes ${start}-${end}/${f.content.length}`, 'accept-ranges': 'bytes' },
          })
        }
        return new Response(f.content, { status: 200, headers: { 'content-type': f.mimeType, 'content-length': String(f.content.length) } })
      }
      return json(200, view(f))
    }
    if (fm && method === 'GET' && fm[2] === '/export') {
      const f = files.get(decodeURIComponent(fm[1]))
      if (!f) return json(404, { error: { message: 'not found' } })
      const pdf = new TextEncoder().encode(`%PDF-export-of-${f.name}`)
      return new Response(pdf, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': String(pdf.length) } })
    }
    if (fm && fm[2] === '/permissions') return json(404, { error: { message: 'permissions not supported by fake' } })

    // ── files.create(폴더) ──
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(String(init?.body ?? '{}')) as Partial<FakeFile> & { name: string; parents: string[] }
      if (meta.parents.some((p) => !files.has(p))) return json(404, { error: { message: 'parent not found' } })
      return json(200, view(add(meta)))
    }
    // ── files.list ──
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      return json(200, { files: matchQuery(q).map(view) })
    }
    // ── files.update(PATCH) ──
    if (fm && method === 'PATCH' && !fm[2]) {
      const f = files.get(decodeURIComponent(fm[1]))
      if (!f) return json(404, { error: { message: 'not found' } })
      const body = JSON.parse(String(init?.body ?? '{}')) as Partial<FakeFile>
      if (body.name !== undefined) f.name = body.name
      if (body.trashed !== undefined) f.trashed = body.trashed
      if (body.appProperties) f.appProperties = { ...f.appProperties, ...body.appProperties }
      const add_ = url.searchParams.get('addParents')
      const remove = url.searchParams.get('removeParents')
      if (remove) f.parents = f.parents.filter((p) => p !== remove)
      if (add_) f.parents = [...f.parents, add_]
      return json(200, view(f))
    }
    // ── files.copy ──
    if (fm && method === 'POST' && fm[2] === '/copy') {
      if (failCopies > 0) {
        failCopies--
        return json(502, { error: { message: 'backend error' } })
      }
      const src = files.get(decodeURIComponent(fm[1]))
      if (!src) return json(404, { error: { message: 'not found' } })
      const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string; parents: string[]; appProperties?: Record<string, string> }
      return json(200, view(add({ name: body.name ?? src.name, parents: body.parents, mimeType: src.mimeType, content: src.content, appProperties: body.appProperties })))
    }
    if (url.pathname === '/drive/v3/about') return json(200, { user: { emailAddress: opts.accountEmail ?? 'owner@company.example', displayName: '소유자' } })

    return json(404, { error: { message: `fake drive: unhandled ${method} ${url.pathname}` } })
  }

  return {
    rootId,
    outsideId,
    files,
    calls,
    hidden,
    fetch: fetchImpl as typeof fetch,
    add,
    childrenOf: (parentId: string) => [...files.values()].filter((f) => f.parents.includes(parentId) && !f.trashed),
    childNamed: (parentId: string, name: string) => [...files.values()].find((f) => f.parents.includes(parentId) && f.name === name && !f.trashed),
    folderCount: () => [...files.values()].filter((f) => f.mimeType === FOLDER).length,
    setInvalidGrant: (v: boolean) => {
      invalidGrant = v
    },
    setRefreshToken: (t: string) => {
      refreshToken = t
    },
    failNextCopies: (n: number) => {
      failCopies = n
    },
    failNextChunks: (n: number) => {
      failChunks = n
    },
    tokenIssues: () => tokenIssues,
  }
}

export type FakeDrive = ReturnType<typeof createFakeDrive>
