// 내부 로그인 화면(Phase 4c — 설계서 §12 이메일 매직링크). 웜 페이퍼 토큰만 사용(디자인지시서 v1).
// mock 공급자에서는 이 화면이 뜨지 않는다(AuthGate가 통과). 매직링크 클릭 후 /login으로 돌아오면
// supabase-js가 URL의 세션을 흡수하고 AuthContext가 갱신돼 원래 목적지로 보낸다.
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { mode, loading, user, signInWithEmail, allowedDomains } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? '/home'
  if (mode === 'mock' || (!loading && user)) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const message = await signInWithEmail(email)
    setPending(false)
    if (message) setError(message)
    else setSent(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <section className="w-full max-w-sm rounded-xl border border-line bg-paper p-6 shadow-sm" aria-labelledby="login-title">
        <BrandLogo variant="black" className="h-5 w-auto" />
        <h1 id="login-title" className="mt-5 text-lg font-semibold text-ink">
          MICE 커뮤니케이터 로그인
        </h1>
        <p className="mt-1 text-sm text-ink-sub">회사 이메일로 로그인 링크를 보내 드립니다. 비밀번호는 없습니다.</p>

        {sent ? (
          <div className="mt-5 rounded-md border border-line bg-canvas p-4 text-sm text-ink" role="status">
            <p className="font-medium">로그인 링크를 보냈습니다.</p>
            <p className="mt-1 text-ink-sub">
              <span className="font-medium text-ink">{email.trim().toLowerCase()}</span> 받은편지함에서 링크를 열어 주세요. 링크는 한 번만
              쓸 수 있고 곧 만료됩니다.
            </p>
            <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setSent(false)}>
              다른 이메일로 다시 보내기
            </button>
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={onSubmit} noValidate>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">이메일</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                className="ui-input w-full"
                placeholder={allowedDomains[0] ? `you@${allowedDomains[0]}` : 'you@company.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {allowedDomains.length > 0 && (
              <p className="text-xs text-ink-cap">허용 도메인: {allowedDomains.join(', ')}</p>
            )}
            {error && (
              <p className="text-sm text-negative" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={pending || !email.trim()}>
              {pending ? '보내는 중…' : '로그인 링크 받기'}
            </button>
          </form>
        )}
        <p className="mt-5 text-xs text-ink-cap">
          발주처·파트너 링크(<code>/c</code>·<code>/p</code>)는 로그인 없이 그대로 열립니다.
        </p>
      </section>
    </main>
  )
}
