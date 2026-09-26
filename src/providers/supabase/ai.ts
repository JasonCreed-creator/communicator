// SupabaseProvider ↔ api/ai 다리 — 설계서 v2.14 §19.5b · Phase 4.8 (DataProvider 메서드 수 불변 — 도메인 내부 동작만 더한다).
// 협력사 견적서 불러오기(importVendorQuote)가 PDF·사진이면 이 다리로 서버에 읽기를 맡긴다. 키는 서버에만 있다.
import { createAiClient, type AiClient } from '../../lib/ai/aiClient'
import type { SupabaseCtx } from './ctx'

const clients = new WeakMap<SupabaseCtx, AiClient>()

export function aiFor(ctx: SupabaseCtx): AiClient {
  const hit = clients.get(ctx)
  if (hit) return hit
  const client = createAiClient({
    apiBase: ctx.env.apiBase,
    accessToken: async () => (await ctx.sb.auth.getSession()).data.session?.access_token ?? null,
  })
  clients.set(ctx, client)
  return client
}
