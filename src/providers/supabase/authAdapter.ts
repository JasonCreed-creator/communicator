// Supabase Auth 어댑터 — 이메일 매직링크(설계서 §12). 세션은 supabase-js가 localStorage에 보존·갱신한다.
import type { AuthAdapter, AuthSessionUser } from '../auth'
import { emailDomainAllowed } from '../auth'
import { getSupabaseClient, readSupabaseEnv } from './client'

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
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
      const { error } = await sb.auth.signInWithOtp({ email: trimmed, options: { emailRedirectTo: redirectTo } })
      return error ? friendlyAuthError(error.message) : null
    },
    async signOut() {
      await sb.auth.signOut()
    },
  }
}
