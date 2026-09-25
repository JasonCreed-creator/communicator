// 알림 서버 함수의 DB 경계 — 인터페이스(NotifyStore)와 Supabase 구현(secret 키 = 서버 전용).
// 사건 선점·리마인드·결과 기록은 service 전용 SQL 함수(…20260925000200_notifications.sql)가, 사람 확인(로그인·행사 멤버·
// 발주처/파트너 링크)은 표 조회가 한다. 테스트는 메모리 구현(src/test/helpers/fakeNotifyStore.ts)으로 돈다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EventRow, ManualRow, ReminderRow } from './format.js'

export interface NotifyStoreEnv {
  SUPABASE_URL?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

export interface NotifyStore {
  claimEvents(limit: number): Promise<EventRow[]>
  claimReminders(today?: string): Promise<ReminderRow[]>
  claimManual(projectId: string, target: 'delayed' | 'approval'): Promise<ManualRow | null>
  mark(keys: string[], status: 'sent' | 'failed' | 'skipped', error?: string | null): Promise<void>
  /** 로그인 세션 → 주소록 id(없으면 null) */
  authProfile(jwt: string): Promise<string | null>
  memberRole(profileId: string, projectId: string): Promise<string | null>
  /** 발주처(/c)·파트너(/p) 링크가 살아 있는가 — 그 화면의 결정·제출 직후 신호용 */
  tokenActive(token: string): Promise<boolean>
  /** '테스트 보내기'용 행사 정보(행사 채널 주소 포함) */
  project(projectId: string): Promise<{ code: string; name: string; webhook: string | null } | null>
}

export function notifyStoreConfigured(env: NotifyStoreEnv): boolean {
  return Boolean((env.SUPABASE_URL ?? env.VITE_SUPABASE_URL) && env.SUPABASE_SECRET_KEY)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createSupabaseNotifyStore(env: NotifyStoreEnv): NotifyStore {
  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)!
  const admin: SupabaseClient = createClient(url, env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.rpc(fn, args)
    if (error) throw new Error(`${fn}: ${error.message}`)
    return data as T
  }
  return {
    async claimEvents(limit) {
      return ((await rpc<EventRow[] | null>('notify_claim_events', { p_limit: limit })) ?? []) as EventRow[]
    },
    async claimReminders(today) {
      return ((await rpc<ReminderRow[] | null>('notify_claim_reminders', { p_today: today ?? null })) ?? []) as ReminderRow[]
    },
    async claimManual(projectId, target) {
      return (await rpc<ManualRow | null>('notify_claim_manual', { p_project: projectId, p_target: target })) ?? null
    },
    async mark(keys, status, error) {
      if (keys.length === 0) return
      await rpc<void>('notify_mark', { p_keys: keys, p_status: status, p_error: error ?? null })
    },
    async authProfile(jwt) {
      if (!jwt) return null
      const { data, error } = await admin.auth.getUser(jwt)
      if (error || !data.user) return null
      const { data: p } = await admin.from('profiles').select('id').eq('auth_user_id', data.user.id).maybeSingle()
      return (p as { id: string } | null)?.id ?? null
    },
    async memberRole(profileId, projectId) {
      if (!UUID_RE.test(projectId)) return null
      const { data } = await admin
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', profileId)
        .maybeSingle()
      return (data as { role: string } | null)?.role ?? null
    },
    async tokenActive(token) {
      if (!UUID_RE.test(token)) return false
      const now = new Date().toISOString()
      const active = (rows: unknown) =>
        ((rows as { revoked_at: string | null; expires_at: string | null }[] | null) ?? []).some(
          (t) => !t.revoked_at && (!t.expires_at || t.expires_at > now),
        )
      const c = await admin.from('client_tokens').select('revoked_at, expires_at').eq('token', token).limit(1)
      if (active(c.data)) return true
      const p = await admin.from('partner_tokens').select('revoked_at, expires_at').eq('token', token).limit(1)
      return active(p.data)
    },
    async project(projectId) {
      if (!UUID_RE.test(projectId)) return null
      const { data } = await admin.from('projects').select('code, name, slack_webhook_url').eq('id', projectId).maybeSingle()
      const row = data as { code: string; name: string; slack_webhook_url: string | null } | null
      return row ? { code: row.code, name: row.name, webhook: row.slack_webhook_url } : null
    },
  }
}
