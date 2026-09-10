// 인증 어댑터 — AuthContext가 공급자 종류를 몰라도 되게 하는 얇은 층.
// mock: 세션 개념 없음(항상 통과). supabase: 이메일 매직링크(signInWithOtp) + 세션 구독.
// 프론트는 supabase client를 직접 import하지 않는다(CLAUDE.md §6) — providers/supabase/ 내부만 예외.
import { providerKind } from './kind'
import { createSupabaseAuthAdapter } from './supabase/authAdapter'

export interface AuthSessionUser {
  id: string
  email: string | null
}

export interface AuthAdapter {
  mode: 'mock' | 'supabase'
  allowedDomains: string[]
  getUser(): Promise<AuthSessionUser | null>
  onChange(cb: (user: AuthSessionUser | null) => void): () => void
  /** 성공 시 null, 실패 시 사용자에게 보일 한국어 메시지 */
  signInWithEmail(email: string): Promise<string | null>
  signOut(): Promise<void>
  /**
   * 현재 세션의 액세스 토큰 — Vercel Functions(`api/`)를 화면이 직접 부를 때 Bearer로 싣는다
   * (예: 견적서 → 구글 스프레드시트 생성). mock은 세션이 없어 항상 null.
   */
  getAccessToken(): Promise<string | null>
}

export const mockAuthAdapter: AuthAdapter = {
  mode: 'mock',
  allowedDomains: [],
  getUser: async () => ({ id: 'mock', email: null }),
  onChange: () => () => undefined,
  signInWithEmail: async () => null,
  signOut: async () => undefined,
  getAccessToken: async () => null,
}

/** 허용 도메인 검사(프론트 선안내 — 서버 정본은 app_config + auth 트리거) */
export function emailDomainAllowed(email: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  return allowed.includes(domain)
}

let cached: AuthAdapter | null = null

export function getAuthAdapter(): AuthAdapter {
  if (cached) return cached
  cached = providerKind() === 'supabase' ? createSupabaseAuthAdapter() : mockAuthAdapter
  return cached
}

/** 테스트용 주입 */
export function setAuthAdapter(adapter: AuthAdapter | null): void {
  cached = adapter
}
