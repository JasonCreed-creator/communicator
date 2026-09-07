// SupabaseProvider — DataProvider 2단계 구현(설계서 §2.1 · Phase 4). 인터페이스 v12(124메서드) 무수정.
// 도메인 10모듈의 팩토리를 스프레드로 합친다 — 한 메서드라도 빠지면 아래 `DataProvider` 타입 단언에서 tsc가 잡는다.
// 파일은 아직 세션 메모리(Phase 5 Drive에서 교체), 견적 재계산·시트 읽기는 Vercel Functions(api/), 토큰 경로는 SQL RPC.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataProvider } from '../DataProvider'
import { getSupabaseClient, readSupabaseEnv, type SupabaseEnv } from './client'
import { SupabaseCtx } from './ctx'
import { clientPortalDomain } from './domains/clientPortal'
import { deliverablesDomain } from './domains/deliverables'
import { landingDomain } from './domains/landing'
import { partnersDomain } from './domains/partners'
import { programDomain } from './domains/program'
import { projectsDomain } from './domains/projects'
import { quotesDomain } from './domains/quotes'
import { registrationDomain } from './domains/registration'
import { settlementDomain } from './domains/settlement'
import { wbsDomain } from './domains/wbs'

export interface SupabaseProviderOptions {
  client?: SupabaseClient
  env?: SupabaseEnv
}

export function createSupabaseProvider(opts: SupabaseProviderOptions = {}): DataProvider {
  const env = opts.env ?? readSupabaseEnv()
  const sb = opts.client ?? getSupabaseClient(env)
  const ctx = new SupabaseCtx(sb, env)
  const provider: DataProvider = {
    ...projectsDomain(ctx),
    ...deliverablesDomain(ctx),
    ...clientPortalDomain(ctx),
    ...registrationDomain(ctx),
    ...landingDomain(ctx),
    ...programDomain(ctx),
    ...wbsDomain(ctx),
    ...quotesDomain(ctx),
    ...settlementDomain(ctx),
    ...partnersDomain(ctx),
  }
  return provider
}
