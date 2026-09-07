// 견적 서버 재계산 — 설계서 §8 "POST /quotes · /quotes/{id}/versions: 서버가 엔진으로 breakdown·total 재계산해 저장
// (클라이언트 값 신뢰 안 함)". Vercel Function(api/quote-recalc.ts)이 이 순수 핸들러를 감싼다.
// 같은 레포의 견적 엔진(src/modules/quote)을 그대로 import하므로 골든 벡터 등가(DoD 21)가 서버에도 그대로 성립한다.
//
// 흐름: ① 사용자 JWT 검증(getUser) ② app_role admin·sales 확인 ③ 엔진 재계산 ④ secret 키로 insert(RLS 우회 —
// 권한은 ②에서 이미 판정) ⑤ 새 버전이면 이전 버전 superseded 체인. 클라이언트가 보낸 breakdown·total_amount는 무시한다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { computeQuoteOutputs } from '../../src/modules/quote/engine/quoteInput'
import type { Quote, QuoteInput } from '../../src/types/entities'

export interface RecalcRequest {
  op: 'create' | 'version'
  input: QuoteInput
  quote_id?: string
}

export interface RecalcEnv {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export class RecalcError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'validation' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message)
  }
}

export interface RecalcDeps {
  /** 사용자 JWT 검증용(publishable key) */
  userClient: (accessToken: string) => SupabaseClient
  /** 쓰기용(secret key — 서버 전용) */
  adminClient: () => SupabaseClient
}

export function depsFromEnv(env: RecalcEnv): RecalcDeps {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !secret || !publishable) {
    throw new RecalcError(500, 'validation', '서버 자격증명이 설정되지 않았습니다 (SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY).')
  }
  return {
    userClient: (token) =>
      createClient(url, publishable, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    adminClient: () => createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
  }
}

export function parseBearer(header: string | null | undefined): string {
  const m = (header ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new RecalcError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

export async function recalcQuote(body: RecalcRequest, accessToken: string, deps: RecalcDeps): Promise<Quote> {
  if (!body || (body.op !== 'create' && body.op !== 'version') || !body.input) {
    throw new RecalcError(400, 'validation', '요청 형식이 올바르지 않습니다 (op·input).')
  }
  // ① 사용자 확인
  const user = deps.userClient(accessToken)
  const { data: authData, error: authErr } = await user.auth.getUser(accessToken)
  if (authErr || !authData.user) throw new RecalcError(401, 'forbidden', '로그인이 필요합니다.')
  const admin = deps.adminClient()
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('id, app_role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()
  if (pErr || !profile) throw new RecalcError(403, 'forbidden', '프로필이 없습니다 — 다시 로그인하세요.')
  // ② app_role 게이트(§6.1)
  if (profile.app_role !== 'admin' && profile.app_role !== 'sales') {
    throw new RecalcError(403, 'forbidden', '견적 메뉴는 영업·관리자 권한이 필요합니다.')
  }
  // ③ 재계산 — 클라이언트가 보낸 breakdown·total_amount는 어떤 경로로도 저장되지 않는다
  const input = body.input
  const { breakdown, total_amount } = computeQuoteOutputs(input)

  if (body.op === 'create') {
    const { data, error } = await admin
      .from('quotes')
      .insert({
        project_id: null,
        title: input.event_name?.trim() || '새 견적',
        version: 1,
        status: 'draft',
        is_final: false,
        input,
        breakdown,
        total_amount,
        source: 'engine',
        created_by: profile.id,
      })
      .select('*')
      .single()
    if (error) throw new RecalcError(400, 'validation', error.message)
    return data as Quote
  }

  // ⑤ 새 버전 — 이전 버전은 superseded 체인(§4-18). 확정본은 잠금 유지(status 그대로), 미확정은 superseded
  if (!body.quote_id) throw new RecalcError(400, 'validation', 'quote_id가 필요합니다.')
  const { data: prev, error: prevErr } = await admin.from('quotes').select('*').eq('id', body.quote_id).maybeSingle()
  if (prevErr) throw new RecalcError(400, 'validation', prevErr.message)
  if (!prev) throw new RecalcError(404, 'not_found', '견적을 찾을 수 없습니다.')
  if (prev.superseded_by) {
    throw new RecalcError(409, 'conflict', '이미 새 버전이 있는 견적입니다 — 최신 버전에서 수정하세요.')
  }
  const { data: next, error: nextErr } = await admin
    .from('quotes')
    .insert({
      project_id: prev.project_id,
      title: input.event_name?.trim() || prev.title,
      version: prev.version + 1,
      status: 'draft',
      is_final: false,
      input,
      breakdown,
      total_amount,
      source: 'engine',
      created_by: profile.id,
    })
    .select('*')
    .single()
  if (nextErr) throw new RecalcError(400, 'validation', nextErr.message)
  const { error: linkErr } = await admin
    .from('quotes')
    .update(prev.is_final ? { superseded_by: next.id } : { superseded_by: next.id, status: 'superseded' })
    .eq('id', prev.id)
  if (linkErr) throw new RecalcError(400, 'validation', linkErr.message)
  return next as Quote
}

/** Web 표준 Request → Response (Vercel Node 함수 · 테스트 공용) */
export async function handleRecalcRequest(request: Request, env: RecalcEnv): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'POST만 허용됩니다.' } })
  try {
    const token = parseBearer(request.headers.get('authorization'))
    const body = (await request.json()) as RecalcRequest
    const quote = await recalcQuote(body, token, depsFromEnv(env))
    return json(200, { quote })
  } catch (e) {
    if (e instanceof RecalcError) return json(e.status, { error: { code: e.code, message: e.message } })
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return json(500, { error: { code: 'validation', message } })
  }
}
