// 등록 명단 구글 시트 읽기(설계서 §24 — 시트 → 앱 단방향, 앱은 시트에 쓰지 않는다 §24.6).
// Vercel Function(api/sheets.ts)이 감싼다. 세 작업: probe(문서·탭) · preview(컬럼 미리보기, 연락처 마스킹) · rows(원본 행).
// 읽는 계정 = 서비스 계정 JSON → (없으면) Drive 저장소에 연결된 OAuth 계정(Phase 6.15) → (SHEETS_DEMO=1일 때만) 결정적 시험 명단 → 그 밖은 503(Phase 6.14).
// 인증: 사용자 JWT → 프로필 → 그 행사의 멤버인지 확인(publishable+secret 키는 서버 env).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSign } from 'node:crypto'
import {
  buildColumnPreviews,
  buildProbe,
  DEFAULT_SOURCE_MODIFIED_AT,
  generateSourceRows,
  maskEmail,
  maskPhone,
  suggestField,
} from '../../src/providers/mock/sheetSync.js'
import type { SheetColumnMapping } from '../../src/types/entities'
import { driveAccessToken, driveConfigured, NOT_CONFIGURED_MESSAGE, NOT_CONNECTED_MESSAGE, type DriveAuthEnv } from './drive/auth.js'
import { supabaseDriveStore, type DriveStore } from './drive/store.js'
import type { SheetColumnPreview, SheetProbe, SheetTabInfo } from '../../src/types/views'
import type { SheetMappedField } from '../../src/types/enums'

export type SheetsOp = 'probe' | 'preview' | 'rows'

export interface SheetsRequest {
  op: SheetsOp
  project_id: string
  url: string
  tab_name?: string
  mapping?: SheetColumnMapping[]
  first_row_is_header?: boolean
}

export interface SheetsEnv {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** 구글 서비스 계정 JSON 전문(client_email·private_key). 없으면 503 — 시험 데이터는 SHEETS_DEMO=1일 때만(Phase 6.14) */
  GOOGLE_SHEETS_SA_JSON?: string
  /** '1'이면 자격증명 없이 결정적 시험 명단(12행)을 돌려준다 — 로컬·시험 배포 전용. 운영에서는 두지 않는다 */
  SHEETS_DEMO?: string
  /** Phase 6.15 — 서비스 계정 키가 없으면 Drive 저장소에 연결된 계정(OAuth · scope drive)으로 읽는다. Drive와 같은 env */
  DRIVE_AUTH?: string
  DRIVE_ROOT_FOLDER_ID?: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  GOOGLE_DRIVE_REFRESH_TOKEN?: string
}

/**
 * Phase 6.14(2026-09-28 실사용 "등록 보드가 실제 시트와 다르다"): 운영 서버에 서비스 계정 키가 없었는데 데모 모드가
 * 행사명으로 만든 가짜 시트(탭·418행·12행 명단)를 돌려줘 '연결됨 · 원본과 일치'로 보였다. 자격증명이 없으면 사실대로 503.
 */
export const SHEETS_NO_CREDENTIALS_MESSAGE =
  '시트를 읽을 계정이 서버에 없습니다 — 행사 설정 ③에서 Drive를 연결하면 그 계정으로 읽고(시트가 그 계정에 보여야 합니다), 또는 Vercel 환경 변수 GOOGLE_SHEETS_SA_JSON에 서비스 계정 JSON을 넣고 재배포한 뒤 시트를 그 서비스 계정 이메일에 뷰어로 공유하세요.'

/** Phase 6.15 — Drive 저장소(OAuth)에 연결된 계정으로 읽을 수 있으면 그 토큰과 계정 이메일. 설정·연결이 없으면 null(갱신 실패는 503으로 알린다) */
export async function driveReaderFor(
  env: SheetsEnv,
  fetchImpl: typeof fetch,
  deps: SheetsDeps,
): Promise<{ token: string; email: string | null } | null> {
  const authEnv = env as DriveAuthEnv
  if (!driveConfigured(authEnv)) return null
  const store = deps.driveStore ?? supabaseDriveStore(env as Parameters<typeof supabaseDriveStore>[0])
  let token: string
  try {
    token = await driveAccessToken(authEnv, store, fetchImpl, (deps.now ?? Date.now)())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message === NOT_CONFIGURED_MESSAGE || message === NOT_CONNECTED_MESSAGE) return null
    throw new SheetsError(503, 'unavailable', `Drive 계정으로 시트를 읽지 못했습니다 — ${message}`)
  }
  let email: string | null = null
  try {
    email = (await store.connectionInfo())?.account_email ?? null
  } catch {
    /* 계정 이름은 안내용 — 못 읽어도 읽기는 진행 */
  }
  return { token, email }
}

/** 서버가 적재하는 원본 행 — DB sheet_source_rows와 1:1 (registration 도메인이 RPC에 그대로 넘긴다) */
export interface SourceRowOut {
  sheet_row_id: string
  row_number: number
  name: string
  org: string | null
  title: string | null
  email: string | null
  phone: string | null
  group_tag: string | null
  registered_at: string
  status: 'applied' | 'confirmed' | 'cancelled' | 'removed'
  invalid_reason: 'no_email' | 'duplicate_email' | 'missing_required' | null
  previously_confirmed: boolean
}

export class SheetsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable',
    message: string,
  ) {
    super(message)
  }
}

// ── 인증 ─────────────────────────────────────────────────────────────
export function parseBearer(header: string | null | undefined): string {
  const m = (header ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new SheetsError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

/** 테스트 주입 — quoteRecalc와 같은 모양(실 Supabase 없이 권한 판정을 본다) */
export interface SheetsDeps {
  userClient?: (url: string, publishable: string) => SupabaseClient
  adminClient?: (url: string, secret: string) => SupabaseClient
  /** Phase 6.15 — Drive 연결(갱신 토큰·계정) 저장소. 테스트는 가짜를 넣는다 */
  driveStore?: Pick<DriveStore, 'readRefreshToken' | 'recordConnectionError' | 'connectionInfo'>
  now?: () => number
}

/**
 * 행사 멤버 판정 — SQL 정본 `app.member_role()`과 같은 규칙을 서버 함수가 따른다:
 * 전역 admin은 멤버가 아니어도 통과(Phase 6.5) · 한 사람이 여러 역할이면 행이 여러 개(Phase 6.6 — maybeSingle 금지).
 * 실사용 2026-09-27: 관리자가 등록 보드 '시트 확인'에서 "프로젝트 멤버가 아닙니다."를 받았다(서버 함수만 옛 판정).
 */
async function requireMember(env: SheetsEnv, accessToken: string, projectId: string, deps: SheetsDeps = {}): Promise<SupabaseClient> {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !secret || !publishable) {
    throw new SheetsError(500, 'validation', '서버 자격증명이 설정되지 않았습니다 (SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY).')
  }
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  const user = deps.userClient ? deps.userClient(url, publishable) : createClient(url, publishable, opts)
  const { data, error } = await user.auth.getUser(accessToken)
  if (error || !data.user) throw new SheetsError(401, 'forbidden', '로그인이 필요합니다.')
  const admin = deps.adminClient ? deps.adminClient(url, secret) : createClient(url, secret, opts)
  const { data: profile } = await admin.from('profiles').select('id, app_role').eq('auth_user_id', data.user.id).maybeSingle()
  const me = profile as { id: string; app_role: 'admin' | 'sales' | 'staff' } | null
  if (!me) throw new SheetsError(403, 'forbidden', '프로필이 없습니다 — 다시 로그인하세요.')
  if (me.app_role !== 'admin') {
    const { data: rows } = await admin.from('project_members').select('role').eq('project_id', projectId).eq('user_id', me.id).limit(1)
    if (!rows || rows.length === 0) throw new SheetsError(403, 'forbidden', '프로젝트 멤버가 아닙니다.')
  }
  return admin
}

// ── 구글 API (서비스 계정 JWT → access token) ───────────────────────────
export interface ServiceAccount {
  client_email: string
  private_key: string
}

/** 등록 시트 읽기 스코프(§24 단방향 — 읽기 전용) */
export const SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function googleAccessToken(sa: ServiceAccount, fetchImpl: typeof fetch = fetch, scope: string = SHEETS_READONLY_SCOPE): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = base64url(signer.sign(sa.private_key))
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  })
  if (!res.ok) throw new SheetsError(502, 'validation', `구글 인증 실패 (${res.status}) — 서비스 계정 키를 확인하세요.`)
  const json = (await res.json()) as { access_token: string }
  return json.access_token
}

export function spreadsheetIdFrom(url: string): string {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) throw new SheetsError(400, 'validation', '시트 URL을 확인해 주세요 — docs.google.com/spreadsheets/d/… 형태여야 합니다.')
  return m[1]
}

/** Google API 오류 본문 — 마스터 시트 서버(masterSheet/sheets.ts)와 같은 분류: API 꺼짐 · 스코프 부족 · 그 밖(접근 불가) */
interface GoogleErrorBody {
  error?: {
    message?: string
    status?: string
    details?: { reason?: string; metadata?: { activationUrl?: string } }[]
    errors?: { reason?: string }[]
  }
}

async function gget<T>(token: string, url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 403 || res.status === 404) {
    // Phase 6.15 — 403의 사유를 구분해 조치 문구로. 운영 실측: 시트를 공유한 뒤에도 403이 이어져 사유가 가려져 있었다
    let body: GoogleErrorBody = {}
    try {
      body = (await res.json()) as GoogleErrorBody
    } catch {
      /* 본문 없음 */
    }
    const e = body.error ?? {}
    const reasons = [...(e.details ?? []).map((d) => d.reason ?? ''), ...(e.errors ?? []).map((d) => d.reason ?? '')]
    const message = e.message ?? ''
    const activation =
      (e.details ?? []).map((d) => d.metadata?.activationUrl).find(Boolean) ?? message.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\S+/)?.[0] ?? null
    if (reasons.includes('SERVICE_DISABLED') || reasons.includes('accessNotConfigured') || /has not been used|is disabled|not enabled/i.test(message)) {
      throw new SheetsError(
        503,
        'unavailable',
        `구글 클라우드 프로젝트에서 Google Sheets API가 꺼져 있어 시트를 읽을 수 없습니다 — 켠 뒤(반영까지 몇 분) 다시 시도하세요.${activation ? ` ${activation}` : ''}`,
      )
    }
    if (reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || /insufficient authentication scopes|insufficientPermissions/i.test(message)) {
      throw new SheetsError(503, 'unavailable', 'Drive 연결 계정의 권한 범위가 시트 읽기에 부족합니다 — 행사 설정 ③에서 Drive를 연결 해제하고 다시 연결하세요.')
    }
    throw new SheetsError(403, 'forbidden', `시트에 접근할 수 없습니다 — 서비스 계정을 뷰어로 초대했는지 확인하세요.${message ? ` (구글: ${message.slice(0, 160)})` : ''}`)
  }
  if (!res.ok) throw new SheetsError(502, 'validation', `구글 시트 API 오류 (${res.status})`)
  return (await res.json()) as T
}

interface GSheetMeta {
  properties: { title: string }
  sheets: { properties: { title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[]
}

async function readTabValues(token: string, id: string, tab: string, fetchImpl: typeof fetch): Promise<string[][]> {
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)
  const data = await gget<{ values?: string[][] }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS`, fetchImpl)
  return data.values ?? []
}

async function realProbe(token: string, url: string, fetchImpl: typeof fetch): Promise<SheetProbe & { _tabs: Record<string, string[][]> }> {
  const id = spreadsheetIdFrom(url)
  const meta = await gget<GSheetMeta>(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties`, fetchImpl)
  const drive = await gget<{ modifiedTime?: string }>(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=modifiedTime&supportsAllDrives=true`, fetchImpl)
  const tabs: SheetTabInfo[] = []
  const cache: Record<string, string[][]> = {}
  for (const s of meta.sheets) {
    const values = await readTabValues(token, id, s.properties.title, fetchImpl)
    cache[s.properties.title] = values
    const headers = (values[0] ?? []).map((h) => String(h ?? '').trim())
    const selectable = headers.filter(Boolean).length >= 2 && values.length >= 2
    tabs.push({
      name: s.properties.title,
      rows: Math.max(values.length - 1, 0),
      columns: headers.length,
      headers,
      selectable,
      note: selectable ? null : '표 형태가 아님 — 명단으로 쓸 수 없습니다',
    })
  }
  return { title: meta.properties.title, source_modified_at: drive.modifiedTime ?? new Date().toISOString(), service_account: '', tabs, _tabs: cache }
}

// ── 행 변환 (헤더 매핑 → SourceRowOut) — 무효 사유 3종(§24.5·3.17.1 T3) ─────────
const STATUS_WORDS: Record<string, SourceRowOut['status']> = {
  신청: 'applied', applied: 'applied', 확정: 'confirmed', confirmed: 'confirmed', 참석확정: 'confirmed',
  취소: 'cancelled', cancelled: 'cancelled', canceled: 'cancelled', 불참: 'cancelled',
}

export function rowsFromValues(values: string[][], mapping: SheetColumnMapping[], firstRowIsHeader = true): SourceRowOut[] {
  const headers = firstRowIsHeader ? (values[0] ?? []).map((h) => String(h ?? '').trim()) : []
  const colIndex = (column: string): number => {
    if (firstRowIsHeader) return headers.indexOf(column)
    // 열 문자 A·B… → 0·1…
    return column.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  }
  const fieldCol = new Map<string, number>()
  for (const m of mapping) if (m.field) fieldCol.set(m.field, colIndex(m.column))
  const get = (row: string[], field: SheetMappedField | 'sheet_status'): string | null => {
    const i = fieldCol.get(field)
    if (i === undefined || i < 0) return null
    const v = row[i]
    return v === undefined || String(v).trim() === '' ? null : String(v).trim()
  }
  const dataRows = firstRowIsHeader ? values.slice(1) : values
  const seenEmail = new Set<string>()
  const out: SourceRowOut[] = []
  dataRows.forEach((row, i) => {
    const rowNumber = i + (firstRowIsHeader ? 2 : 1)
    if (row.every((c) => String(c ?? '').trim() === '')) return
    const name = get(row, 'name')
    const email = get(row, 'email')
    const emailKey = email?.toLowerCase() ?? null
    let invalid: SourceRowOut['invalid_reason'] = null
    if (!name) invalid = 'missing_required'
    else if (!emailKey) invalid = 'no_email'
    else if (seenEmail.has(emailKey)) invalid = 'duplicate_email'
    if (emailKey && !invalid) seenEmail.add(emailKey)
    const statusRaw = get(row, 'sheet_status')?.toLowerCase().replace(/\s/g, '') ?? ''
    const registered = get(row, 'registered_at')
    const parsed = registered ? new Date(registered.replace(/\./g, '-').replace(' ', 'T')) : null
    out.push({
      sheet_row_id: `row-${rowNumber}`,
      row_number: rowNumber,
      name: name ?? '(이름 없음)',
      org: get(row, 'org'),
      title: get(row, 'title'),
      email,
      phone: get(row, 'phone'),
      group_tag: get(row, 'group_tag'),
      registered_at: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString(),
      status: STATUS_WORDS[statusRaw] ?? 'applied',
      invalid_reason: invalid,
      previously_confirmed: false,
    })
  })
  return out
}

// ── 진입점 ──────────────────────────────────────────────────────────
export async function handleSheets(
  body: SheetsRequest,
  accessToken: string,
  env: SheetsEnv,
  fetchImpl: typeof fetch = fetch,
  deps: SheetsDeps = {},
): Promise<unknown> {
  if (!body?.op || !body.project_id || typeof body.url !== 'string') {
    throw new SheetsError(400, 'validation', '요청 형식이 올바르지 않습니다 (op·project_id·url).')
  }
  if (!/^https?:\/\/\S+$/.test(body.url.trim())) {
    throw new SheetsError(400, 'validation', '시트 URL을 확인해 주세요 — http로 시작하는 주소여야 합니다.')
  }
  const admin = await requireMember(env, accessToken, body.project_id, deps)
  const { data: project } = await admin.from('projects').select('name').eq('id', body.project_id).maybeSingle()
  const sa = env.GOOGLE_SHEETS_SA_JSON ? (JSON.parse(env.GOOGLE_SHEETS_SA_JSON) as ServiceAccount) : null

  // Phase 6.15 — 읽는 계정의 우선순위: 서비스 계정 키 → Drive 저장소에 연결된 계정(OAuth) → (SHEETS_DEMO=1) 시험 명단 → 503
  const oauth = sa ? null : await driveReaderFor(env, fetchImpl, deps)
  if (!sa && !oauth) {
    // Phase 6.14 — 자격증명이 없으면 가짜 명단을 만들지 않는다. 시험 데이터는 SHEETS_DEMO=1을 명시한 환경에서만
    if (env.SHEETS_DEMO !== '1') throw new SheetsError(503, 'unavailable', SHEETS_NO_CREDENTIALS_MESSAGE)
    // ── 데모 모드(SHEETS_DEMO=1 · 자격증명 없음): mock과 같은 결정적 값. 서비스 계정 주소는 sheetSync의 합성 주소 ──
    const { data: conn } = await admin.from('sheet_connections').select('source_modified_at').eq('project_id', body.project_id).maybeSingle()
    const probe = buildProbe(`${project?.name ?? '행사'} — 참가자 명단`, conn?.source_modified_at ?? DEFAULT_SOURCE_MODIFIED_AT)
    if (body.op === 'probe') return { probe, demo: true }
    const tab = probe.tabs.find((t) => t.name === body.tab_name)
    if (!tab) throw new SheetsError(404, 'not_found', '해당 이름의 탭을 찾을 수 없습니다.')
    if (!tab.selectable) throw new SheetsError(422, 'validation', '표 형태가 아닌 탭입니다 — 명단으로 쓸 수 없습니다.')
    if (body.op === 'preview') return { columns: buildColumnPreviews(tab), demo: true }
    // rows: 이미 적재된 원본 행이 있으면 그대로(감지 시 변화 없음), 없으면 결정적 12행
    const { data: existing } = await admin.from('sheet_source_rows').select('*').eq('project_id', body.project_id).order('row_number')
    const rows: SourceRowOut[] = existing && existing.length > 0
      ? (existing as SourceRowOut[])
      : generateSourceRows(body.project_id, 12).map((r, i) => ({
          sheet_row_id: r.sheet_row_id, row_number: i + 2, name: r.name, org: r.org, title: r.title, email: r.email, phone: r.phone,
          group_tag: r.group_tag, registered_at: r.registered_at, status: r.status, invalid_reason: r.invalid_reason ?? null,
          previously_confirmed: r.previously_confirmed ?? false,
        }))
    return { rows, source_modified_at: probe.source_modified_at, demo: true }
  }

  // ── 실모드: 서비스 계정 또는 Drive 연결 계정으로 읽기 ──
  const token = sa ? await googleAccessToken(sa, fetchImpl) : oauth!.token
  const probe = await realProbe(token, body.url, fetchImpl)
  probe.service_account = sa ? sa.client_email : (oauth!.email ?? '')
  const { _tabs, ...probeOut } = probe
  if (body.op === 'probe') return { probe: probeOut }
  const tab = probeOut.tabs.find((t) => t.name === body.tab_name)
  if (!tab) throw new SheetsError(404, 'not_found', '해당 이름의 탭을 찾을 수 없습니다.')
  if (!tab.selectable) throw new SheetsError(422, 'validation', '표 형태가 아닌 탭입니다 — 명단으로 쓸 수 없습니다.')
  const values = _tabs[tab.name] ?? []
  if (body.op === 'preview') {
    const first = values[1] ?? []
    const columns: SheetColumnPreview[] = tab.headers.map((header, i) => {
      const suggested = suggestField(header)
      const raw = String(first[i] ?? '')
      if (suggested === 'email') return { column: header, sample: raw ? maskEmail(raw) : '', masked: true, suggested }
      if (suggested === 'phone') return { column: header, sample: raw ? maskPhone(raw) : '', masked: true, suggested }
      return { column: header, sample: raw, masked: false, suggested }
    })
    return { columns }
  }
  const rows = rowsFromValues(values, body.mapping ?? [], body.first_row_is_header ?? true)
  return { rows, source_modified_at: probeOut.source_modified_at }
}

export async function handleSheetsRequest(request: Request, env: SheetsEnv): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'POST만 허용됩니다.' } })
  try {
    const token = parseBearer(request.headers.get('authorization'))
    const body = (await request.json()) as SheetsRequest
    return json(200, await handleSheets(body, token, env))
  } catch (e) {
    if (e instanceof SheetsError) return json(e.status, { error: { code: e.code, message: e.message } })
    return json(500, { error: { code: 'validation', message: e instanceof Error ? e.message : '알 수 없는 오류' } })
  }
}
