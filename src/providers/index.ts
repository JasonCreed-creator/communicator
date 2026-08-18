// Provider 팩토리 — 프론트는 여기서 얻은 DataProvider만 사용한다 (CLAUDE.md §6).
// Phase 4에서 VITE_DATA_PROVIDER='supabase' 분기가 추가되며, 프론트 무수정 교체가 목표.
import { MockProvider } from './mock/MockProvider'
import type { DataProvider } from './DataProvider'

let instance: DataProvider | null = null

export function getDataProvider(): DataProvider {
  if (!instance) {
    const kind = import.meta.env?.VITE_DATA_PROVIDER ?? 'mock'
    if (kind !== 'mock') {
      throw new Error(`알 수 없는 VITE_DATA_PROVIDER: ${kind} (Phase 1은 mock만 지원)`)
    }
    instance = new MockProvider()
  }
  return instance
}

export type { DataProvider } from './DataProvider'
export { MockProvider } from './mock/MockProvider'
