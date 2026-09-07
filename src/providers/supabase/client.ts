// Supabase 클라이언트 — 이 파일과 providers/supabase/ 내부에서만 @supabase/supabase-js를 import한다(CLAUDE.md §6).
// 키는 env(VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY)만 — 번들 하드코딩 금지(설계서 §12). secret은 여기 없다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseEnv {
  url: string
  publishableKey: string
  /** 로그인 화면이 먼저 안내하는 허용 도메인(서버측 정본은 app_config·auth 트리거) — 쉼표 구분 */
  allowedDomains: string[]
  /** Vercel Functions 기본 경로(견적 서버 재계산 등). 미설정이면 같은 오리진 `/api` */
  apiBase: string
}

export function readSupabaseEnv(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): SupabaseEnv {
  const url = (env.VITE_SUPABASE_URL ?? '').trim()
  const publishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  if (!url || !publishableKey) {
    throw new Error(
      'VITE_DATA_PROVIDER=supabase에는 VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY가 필요합니다 (.env.local — 설계서 §12 신형 키).',
    )
  }
  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY는 신형 sb_publishable_ 키여야 합니다(레거시 anon JWT 사용 금지 — 설계서 §12).')
  }
  return {
    url,
    publishableKey,
    allowedDomains: (env.VITE_AUTH_ALLOWED_DOMAINS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    apiBase: (env.VITE_API_BASE ?? '/api').replace(/\/$/, ''),
  }
}

let cached: SupabaseClient | null = null

export function getSupabaseClient(env?: SupabaseEnv): SupabaseClient {
  if (!cached) {
    const e = env ?? readSupabaseEnv()
    cached = createClient(e.url, e.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return cached
}

/** 테스트·검증 스크립트용 — 명시 클라이언트 주입 */
export function setSupabaseClient(client: SupabaseClient | null): void {
  cached = client
}
