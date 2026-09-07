// 데모 아티팩트 전용 스텁 — 데모 빌드(vite.demo.config.ts)는 mock 공급자만 싣는다.
// providers/index.ts·providers/auth.ts의 './supabase/SupabaseProvider'·'./supabase/authAdapter' import를
// 이 파일로 alias해 @supabase/supabase-js(fetch·Worker·localhost 참조)가 단일 파일 아티팩트에 들어오지 않게 한다
// (check-artifact의 "외부 요청 0건" 가드 유지). 실제 앱 빌드(vite.config.ts)는 이 alias가 없다.
export function createSupabaseProvider(): never {
  throw new Error('데모 아티팩트는 mock 공급자 전용입니다 — VITE_DATA_PROVIDER=supabase는 앱 빌드에서만 유효합니다.')
}

export function createSupabaseAuthAdapter(): never {
  throw new Error('데모 아티팩트는 mock 공급자 전용입니다 — 로그인은 앱 빌드에서만 유효합니다.')
}
