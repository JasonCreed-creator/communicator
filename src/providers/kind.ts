// 공급자 종류 — env 한 곳에서만 읽는다. 기본 mock(데모·테스트 불파손 — CLAUDE.md §4 Phase 4b).
export type ProviderKind = 'mock' | 'supabase'

export function providerKind(): ProviderKind {
  const kind = (import.meta.env?.VITE_DATA_PROVIDER ?? 'mock') as string
  if (kind === 'mock' || kind === 'supabase') return kind
  throw new Error(`알 수 없는 VITE_DATA_PROVIDER: ${kind} (mock | supabase)`)
}
