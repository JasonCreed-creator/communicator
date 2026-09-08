// Phase 4 — SupabaseProvider 완전성 계약(서버 0). 125메서드가 인터페이스 정본(DataProvider.ts)과 1:1인지,
// mock과 같은 이름 집합인지, 오류 매핑(mapPgError)·행 정규화(normalizeRow)·env 검증이 계약대로인지 본다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSupabaseProvider } from '../providers/supabase/SupabaseProvider'
import { mapPgError, unwrap } from '../providers/supabase/errors'
import { normalizeRow } from '../providers/supabase/ctx'
import { readSupabaseEnv } from '../providers/supabase/client'
import { MockProvider } from '../providers/mock/MockProvider'
import type { DataProvider } from '../providers/DataProvider'

function interfaceMethodNames(): string[] {
  const src = readFileSync(join(process.cwd(), 'src/providers/DataProvider.ts'), 'utf8')
  const body = src.slice(src.indexOf('export interface DataProvider {'), src.indexOf('\n}\n', src.indexOf('export interface DataProvider {')))
  return [...body.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1])
}

const fakeClient = {
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
} as never
const env = { url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', allowedDomains: [], apiBase: '/api' }

describe('Phase 4 · SupabaseProvider 완전성', () => {
  it('인터페이스 정본의 125메서드를 전부, 그리고 그것만 구현한다', () => {
    const names = interfaceMethodNames()
    expect(names).toHaveLength(125)
    const provider = createSupabaseProvider({ client: fakeClient, env })
    const keys = Object.keys(provider).sort()
    expect(keys).toEqual([...names].sort())
    for (const n of names) expect(typeof (provider as unknown as Record<string, unknown>)[n]).toBe('function')
  })

  it('mock이 구현한 공개 메서드 집합과 같다(mock 전용 헬퍼 제외)', () => {
    const names = new Set(interfaceMethodNames())
    const mockNames = Object.getOwnPropertyNames(MockProvider.prototype).filter((n) => names.has(n))
    expect(mockNames.sort()).toEqual([...names].sort())
    const provider: DataProvider = createSupabaseProvider({ client: fakeClient, env })
    expect(Object.keys(provider)).toHaveLength(125)
  })

  it('오류 매핑: RLS 위반 → forbidden · RPC 접두 코드 → 해당 code · unique → conflict · 0행 → not_found', () => {
    expect(mapPgError({ code: '42501', message: 'new row violates row-level security policy for table "quotes"' }).code).toBe('forbidden')
    const c = mapPgError({ code: 'P0409', message: 'CONFLICT: 이미 온보딩이 완료된 프로젝트입니다.' })
    expect(c.code).toBe('conflict')
    expect(c.message).toBe('이미 온보딩이 완료된 프로젝트입니다.')
    expect(mapPgError({ code: 'P0410', message: 'GONE: 링크가 만료되었습니다.' }).code).toBe('gone')
    expect(mapPgError({ code: '23505', message: 'duplicate key value violates unique constraint' }).code).toBe('conflict')
    expect(mapPgError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }).code).toBe('not_found')
    expect(mapPgError({ code: '22P02', message: 'invalid input syntax for type uuid: "demo"' }).code).toBe('not_found')
    expect(() => unwrap({ data: null, error: null }, '항목을 찾을 수 없습니다.')).toThrow('항목을 찾을 수 없습니다.')
  })

  it('행 정규화: timestamptz 오프셋 → ISO Z · time → HH:MM · jsonb 내부 Z 표기는 그대로', () => {
    const row = normalizeRow({
      created_at: '2026-08-14T05:00:00+00:00',
      start_time: '09:30:00',
      items: [{ checked_at: '2026-08-14T05:00:00.000Z', text: '09:30:00 회의' }],
      event_date: '2026-10-20',
    })
    expect(row.created_at).toBe('2026-08-14T05:00:00.000Z')
    expect(row.start_time).toBe('09:30')
    expect(row.items[0].checked_at).toBe('2026-08-14T05:00:00.000Z')
    expect(row.items[0].text).toBe('09:30:00 회의')
    expect(row.event_date).toBe('2026-10-20')
  })

  it('env 검증: URL·publishable 필수, 레거시 anon JWT 거부(§12 신형 키만)', () => {
    expect(() => readSupabaseEnv({})).toThrow(/VITE_SUPABASE_URL/)
    expect(() => readSupabaseEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOi.legacy.jwt' })).toThrow(/sb_publishable_/)
    const e = readSupabaseEnv({
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ok',
      VITE_AUTH_ALLOWED_DOMAINS: 'Company.com, partner.co.kr',
    })
    expect(e.allowedDomains).toEqual(['company.com', 'partner.co.kr'])
    expect(e.apiBase).toBe('/api')
  })
})
