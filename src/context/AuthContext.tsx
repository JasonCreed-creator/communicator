// Phase 4 — 내부 로그인 컨텍스트(설계서 §12 "내부 로그인 = Supabase Auth 이메일 매직링크").
// mock 공급자에서는 항상 '로그인됨'으로 통과한다(데모·기존 테스트 불파손). supabase 공급자에서만
// 세션을 구독하고, 없으면 AuthGate가 로그인 화면을 그린다. `/c/*`·`/p/*`·`/`는 게이트 밖(무로그인 지면).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAuthAdapter, type AuthAdapter, type AuthSessionUser } from '../providers/auth'

interface AuthContextValue {
  /** 'mock'이면 로그인 개념이 없다 */
  mode: 'mock' | 'supabase'
  loading: boolean
  user: AuthSessionUser | null
  /** 매직링크 발송 — 성공 시 null, 실패 시 한국어 메시지 */
  signInWithEmail: (email: string) => Promise<string | null>
  signOut: () => Promise<void>
  /** 로그인 화면이 먼저 안내하는 허용 도메인(비어 있으면 제한 없음) */
  allowedDomains: string[]
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children, adapter }: { children: ReactNode; adapter?: AuthAdapter }) {
  const auth = useMemo(() => adapter ?? getAuthAdapter(), [adapter])
  const [user, setUser] = useState<AuthSessionUser | null>(null)
  const [loading, setLoading] = useState(auth.mode === 'supabase')

  useEffect(() => {
    if (auth.mode !== 'supabase') return
    let cancelled = false
    auth.getUser().then((u) => {
      if (!cancelled) {
        setUser(u)
        setLoading(false)
      }
    })
    const unsubscribe = auth.onChange((u) => {
      if (!cancelled) {
        setUser(u)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [auth])

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: auth.mode,
      loading,
      user: auth.mode === 'mock' ? { id: 'mock', email: null } : user,
      signInWithEmail: (email) => auth.signInWithEmail(email),
      signOut: async () => {
        await auth.signOut()
        setUser(null)
      },
      allowedDomains: auth.allowedDomains,
    }),
    [auth, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // AuthProvider 밖(테스트의 부분 렌더 등)에서는 mock과 같은 '로그인됨'으로 취급한다
    return {
      mode: 'mock',
      loading: false,
      user: { id: 'mock', email: null },
      signInWithEmail: async () => null,
      signOut: async () => undefined,
      allowedDomains: [],
    }
  }
  return ctx
}
