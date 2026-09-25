// 시험용 입구(Phase 4.3 — 2026-09-25 사용자 결정: "로그인 기능은 나중에(Okta SSO) 만들고 지금은 아무나 들어갈 수 있는
// 게이트로 — 내부 기능과 저장공간 연동을 확인하고 싶다"). 실서버(supabase 모드)에서 로그인 없이 주소록의 한 사람으로 들어가는
// **임시** 입구다. 암호는 없다(위험 고지 후 사용자가 '완전 개방'을 골랐다). 그래서 스스로 닫히는 장치만 둔다:
//   · 서버 env `AUTH_GATE=open` + `AUTH_GATE_UNTIL`(ISO 시각)이 둘 다 맞아야 열린다 — 하나라도 없거나 틀리면 닫힘(fail-safe)
//   · 기한은 지금부터 GATE_MAX_DAYS 이내만 인정한다 — 더 먼 기한은 설정 오류로 보고 닫는다('영구 개방' 방지)
//   · 들어올 수 있는 사람 = 주소록(profiles)에 이미 있는 사람뿐. 이메일을 입력받지 않는다(새 계정·임의 주소로는 못 들어온다)
//   · 응답에 이메일·전화·로그인 링크를 싣지 않는다 — 목록은 이름·직함·권한, 입장은 1회용 token_hash만
// 흐름: POST {profile_id} → (로그인한 적 없으면) auth 사용자 생성(email_confirm — 트리거가 이메일로 프로필을 연결) →
// admin generateLink(magiclink — 메일을 보내지 않는다) → hashed_token → 브라우저가 verifyOtp로 세션을 받는다
// (scripts/supabase-dev-verify.ts의 로그인과 같은 경로). 권한은 그 사람의 app_role·행사 역할 그대로 — 입구가 올려 주지 않는다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { GatePerson, GateRole } from '../../src/providers/auth'

/** 기한 상한 — 이보다 먼 AUTH_GATE_UNTIL은 설정 오류로 본다 */
export const GATE_MAX_DAYS = 14

export type GateClosedReason = 'off' | 'expired' | 'misconfigured'
export type GateState = { open: true; until: string } | { open: false; reason: GateClosedReason }

export interface GateEnv {
  AUTH_GATE?: string
  AUTH_GATE_UNTIL?: string
  SUPABASE_URL?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

export class GateError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'validation' | 'forbidden' | 'not_found' | 'gone',
    message: string,
  ) {
    super(message)
  }
}

export interface GateDeps {
  /** secret 키 클라이언트(서버 전용) — 주소록 읽기·auth 사용자 준비·토큰 발급 */
  admin: () => SupabaseClient
}

export function gateState(env: GateEnv, now: Date = new Date()): GateState {
  if ((env.AUTH_GATE ?? '').trim().toLowerCase() !== 'open') return { open: false, reason: 'off' }
  const raw = (env.AUTH_GATE_UNTIL ?? '').trim()
  const until = raw ? Date.parse(raw) : Number.NaN
  if (!Number.isFinite(until)) return { open: false, reason: 'misconfigured' }
  if (until <= now.getTime()) return { open: false, reason: 'expired' }
  if (until - now.getTime() > GATE_MAX_DAYS * 86_400_000) return { open: false, reason: 'misconfigured' }
  return { open: true, until: new Date(until).toISOString() }
}

export function gateDepsFromEnv(env: GateEnv): GateDeps {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  if (!url || !secret) {
    throw new GateError(503, 'validation', '시험용 입구를 쓸 수 없습니다 — 서버 자격증명(SUPABASE_URL·SUPABASE_SECRET_KEY)이 설정되지 않았습니다.')
  }
  return { admin: () => createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) }
}

const ROLE_RANK: Record<GateRole, number> = { admin: 0, sales: 1, staff: 2 }

function toRole(value: unknown): GateRole {
  return value === 'admin' || value === 'sales' ? value : 'staff'
}

/** 주소록 → 입구 목록. 이름·직함·권한만 — 이메일·전화·auth 연결 여부는 싣지 않는다 */
export async function listGatePeople(deps: GateDeps): Promise<GatePerson[]> {
  const { data, error } = await deps.admin().from('profiles').select('id, display_name, title, app_role')
  if (error) throw new GateError(503, 'validation', `주소록을 읽지 못했습니다 — ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((p) => ({
      id: String(p.id),
      display_name: String(p.display_name ?? ''),
      title: typeof p.title === 'string' && p.title.trim() ? p.title : null,
      app_role: toRole(p.app_role),
    }))
    .sort((a, b) => ROLE_RANK[a.app_role] - ROLE_RANK[b.app_role] || a.display_name.localeCompare(b.display_name, 'ko'))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function enterGate(profileId: unknown, deps: GateDeps): Promise<{ token_hash: string }> {
  if (typeof profileId !== 'string' || !UUID_RE.test(profileId)) {
    throw new GateError(400, 'validation', '들어갈 사람을 골라 주세요.')
  }
  const admin = deps.admin()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, app_role, auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (error) throw new GateError(503, 'validation', `주소록을 읽지 못했습니다 — ${error.message}`)
  const email = typeof profile?.email === 'string' ? profile.email.trim() : ''
  if (!profile || !email) throw new GateError(404, 'not_found', '주소록에 없는 사람입니다 — 목록을 새로 고쳐 주세요.')

  // 로그인한 적 없는 사람 = auth 사용자가 아직 없다. 만들면 가입 트리거가 이메일로 이 프로필에 연결한다(§4-2b)
  if (!profile.auth_user_id) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (created.error && !/already|registered|exists/i.test(created.error.message)) {
      throw new GateError(503, 'validation', `입장 계정을 준비하지 못했습니다 — ${created.error.message}`)
    }
  }
  // generateLink는 메일을 보내지 않고 1회용 토큰만 만든다 — 링크(action_link)는 버리고 hashed_token만 돌려준다
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link.data?.properties?.hashed_token
  if (link.error || !tokenHash) {
    throw new GateError(503, 'validation', `입장 토큰을 만들지 못했습니다 — ${link.error?.message ?? '빈 응답'}`)
  }
  // 감사 흔적은 서버 로그에만(프로필 id·권한 — 이메일·이름은 남기지 않는다)
  console.info(`[gate] enter profile=${String(profile.id)} role=${toRole(profile.app_role)}`)
  return { token_hash: tokenHash }
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** GET = 입구 상태(열려 있으면 주소록 목록 포함) · POST {profile_id} = 입장 토큰 */
export async function handleGateRequest(request: Request, env: GateEnv, deps?: GateDeps, now: Date = new Date()): Promise<Response> {
  try {
    const state = gateState(env, now)
    if (request.method === 'GET') {
      if (!state.open) return json(200, state)
      const people = await listGatePeople(deps ?? gateDepsFromEnv(env))
      return json(200, { ...state, people })
    }
    if (request.method === 'POST') {
      if (!state.open) {
        if (state.reason === 'expired') throw new GateError(410, 'gone', '시험용 입구는 기한이 지나 닫혔습니다.')
        throw new GateError(403, 'forbidden', '시험용 입구가 닫혀 있습니다.')
      }
      let body: { profile_id?: unknown }
      try {
        body = (await request.json()) as { profile_id?: unknown }
      } catch {
        throw new GateError(400, 'validation', '요청 형식이 올바르지 않습니다.')
      }
      return json(200, await enterGate(body?.profile_id, deps ?? gateDepsFromEnv(env)))
    }
    return json(405, { error: { code: 'validation', message: 'GET·POST만 허용됩니다.' } })
  } catch (e) {
    if (e instanceof GateError) return json(e.status, { error: { code: e.code, message: e.message } })
    const message = e instanceof Error ? e.message : String(e)
    return json(500, { error: { code: 'validation', message: `시험용 입구 오류 — ${message}` } })
  }
}
