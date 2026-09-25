// Supabase Auth 어댑터 — 이메일 매직링크(설계서 §12). 세션은 supabase-js가 localStorage에 보존·갱신한다.
// + 시험용 입구(Phase 4.3 · §12.1): 서버 api/gate가 준 1회용 token_hash를 verifyOtp로 세션으로 바꾼다(메일 없음).
import type { AuthAdapter, AuthGateApi, AuthSessionUser, GateStatus } from '../auth'
import { emailDomainAllowed } from '../auth'
import { appUrl } from '../../lib/basePath'
import { getSupabaseClient, readSupabaseEnv } from './client'
import type { SupabaseClient } from '@supabase/supabase-js'

const CLOSED_REASONS = new Set(['off', 'expired', 'misconfigured'])

/**
 * 입구 API. 함수가 없거나(로컬 vite — SPA가 index.html을 돌려준다) 응답이 깨지면 '닫힘(unavailable)'으로 본다 —
 * 입구가 안 보일 뿐 로그인 화면의 나머지는 그대로다.
 */
function createGateApi(sb: SupabaseClient, apiBase: string): AuthGateApi {
  return {
    async status(): Promise<GateStatus> {
      try {
        const res = await fetch(`${apiBase}/gate`, { headers: { accept: 'application/json' } })
        if (!res.ok) return { open: false, reason: 'unavailable' }
        const body = (await res.json()) as Record<string, unknown>
        if (body.open === true && typeof body.until === 'string' && Array.isArray(body.people)) {
          return { open: true, until: body.until, people: body.people as Extract<GateStatus, { open: true }>['people'] }
        }
        const reason = typeof body.reason === 'string' && CLOSED_REASONS.has(body.reason) ? body.reason : 'unavailable'
        return { open: false, reason: reason as Extract<GateStatus, { open: false }>['reason'] }
      } catch {
        return { open: false, reason: 'unavailable' }
      }
    },
    async enter(profileId) {
      let res: Response
      try {
        res = await fetch(`${apiBase}/gate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ profile_id: profileId }),
        })
      } catch {
        return '시험용 입구에 연결하지 못했습니다 — 잠시 후 다시 시도하세요.'
      }
      const body = (await res.json().catch(() => null)) as { token_hash?: string; error?: { message?: string } } | null
      if (!res.ok || !body?.token_hash) return body?.error?.message ?? `시험용 입구 오류(${res.status})`
      const { error } = await sb.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' })
      return error ? `들어가지 못했습니다 — ${error.message}` : null
    },
  }
}

function toUser(u: { id: string; email?: string | null } | null | undefined): AuthSessionUser | null {
  return u ? { id: u.id, email: u.email ?? null } : null
}

/** Auth 오류 → 한국어. 트리거가 던진 도메인 거부(AUTH_DOMAIN_NOT_ALLOWED)는 "Database error"로 감싸여 온다 */
function friendlyAuthError(message: string): string {
  if (/AUTH_DOMAIN_NOT_ALLOWED|Database error/i.test(message)) {
    return '허용되지 않은 이메일 도메인입니다 — 회사 이메일로 로그인하세요.'
  }
  if (/rate limit|too many/i.test(message)) return '요청이 너무 잦습니다 — 잠시 후 다시 시도하세요.'
  if (/invalid.*email/i.test(message)) return '이메일 형식을 확인하세요.'
  return `로그인 링크를 보내지 못했습니다 — ${message}`
}

export function createSupabaseAuthAdapter(): AuthAdapter {
  const env = readSupabaseEnv()
  const sb = getSupabaseClient(env)
  return {
    mode: 'supabase',
    allowedDomains: env.allowedDomains,
    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session?.user)
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithEmail(email) {
      const trimmed = email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return '이메일 형식을 확인하세요.'
      if (!emailDomainAllowed(trimmed, env.allowedDomains)) {
        return `허용된 도메인(${env.allowedDomains.join(', ')})의 이메일만 로그인할 수 있습니다.`
      }
      // 기본 경로(Phase 4.4 — 회사 도메인 하위 경로)까지 붙인 로그인 화면으로 돌아온다
      const redirectTo = typeof window !== 'undefined' ? appUrl('login') : undefined
      const { error } = await sb.auth.signInWithOtp({ email: trimmed, options: { emailRedirectTo: redirectTo } })
      return error ? friendlyAuthError(error.message) : null
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async getAccessToken() {
      const { data } = await sb.auth.getSession()
      return data.session?.access_token ?? null
    },
    gate: createGateApi(sb, env.apiBase),
  }
}
