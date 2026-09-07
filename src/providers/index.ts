// Provider 팩토리 — 프론트는 여기서 얻은 DataProvider만 사용한다 (CLAUDE.md §6).
// VITE_DATA_PROVIDER=mock(기본) | supabase — Phase 4: 프론트 무수정 교체(설계서 §2.1 2단계).
import { MockProvider } from './mock/MockProvider'
import type { DataProvider } from './DataProvider'
import { providerKind } from './kind'
import { createSupabaseProvider } from './supabase/SupabaseProvider'

let instance: DataProvider | null = null

export function getDataProvider(): DataProvider {
  if (!instance) {
    instance = providerKind() === 'supabase' ? createSupabaseProvider() : new MockProvider()
  }
  return instance
}

export type { DataProvider } from './DataProvider'
export { MockProvider } from './mock/MockProvider'
