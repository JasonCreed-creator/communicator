// SupabaseProvider ↔ api/notify 다리 — 설계서 v2.10.1 §9 · Phase 6 (DataProvider 메서드 수 불변 — 도메인 내부 동작만 더한다).
// 알릴 사건(새 버전·컨펌 발송·발주처 결정·파트너 제출·새 지시)은 SQL이 activity_log에 이미 적는다. 여기서는 사건 직후 서버에
// "밀린 사건을 보내라"는 신호만 보낸다 — 기다리지 않고, 실패해도 본 동작에 영향이 없다(놓친 신호는 매일 크론이 거둔다).
import { createNotifyClient, type NotifyClient } from '../../lib/notify/notifyClient'
import type { SupabaseCtx } from './ctx'

const clients = new WeakMap<SupabaseCtx, NotifyClient>()

export function notifyFor(ctx: SupabaseCtx): NotifyClient {
  const hit = clients.get(ctx)
  if (hit) return hit
  const client = createNotifyClient({
    apiBase: ctx.env.apiBase,
    accessToken: async () => (await ctx.sb.auth.getSession()).data.session?.access_token ?? null,
  })
  clients.set(ctx, client)
  return client
}
