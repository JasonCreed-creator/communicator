// 내부 로그인 화면(Phase 4c — 설계서 §12 이메일 매직링크). 웜 페이퍼 토큰만 사용(디자인지시서 v1).
// mock 공급자에서는 이 화면이 뜨지 않는다(AuthGate가 통과). 매직링크 클릭 후 /login으로 돌아오면
// supabase-js가 URL의 세션을 흡수하고 AuthContext가 갱신돼 원래 목적지로 보낸다.
// + 시험용 입구(Phase 4.3 · §12.1): 서버가 열어 둔 동안만 주소록 인물 카드가 뜨고, 누르면 그 사람으로 들어간다.
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import { useAuth } from '../context/AuthContext'
import type { AuthGateApi, GateRole, GateStatus } from '../providers/auth'

const GATE_ROLE_LABEL: Record<GateRole, string> = { admin: '관리자', sales: '견적 권한', staff: '일반' }

/** 닫히는 시각 — 한국 시간으로 고정해 보인다(보는 기기의 시간대와 무관) */
function formatGateUntil(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso))
}

function GateSection({ gate }: { gate: AuthGateApi }) {
  const [status, setStatus] = useState<GateStatus | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    gate.status().then((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
    }
  }, [gate])

  if (!status) return <p className="mt-5 text-xs text-ink-cap">시험용 입구 확인 중…</p>
  if (!status.open) {
    // 닫힘 사유는 기한 만료일 때만 알린다 — 꺼져 있거나 서버에 함수가 없으면 입구 자체가 없는 화면이 맞다
    return status.reason === 'expired' ? (
      <p className="mt-5 text-xs text-ink-cap" role="status">
        시험용 입구는 기한이 지나 닫혔습니다.
      </p>
    ) : null
  }

  async function enter(profileId: string) {
    setPendingId(profileId)
    setError(null)
    const message = await gate.enter(profileId)
    if (message) {
      setError(message)
      setPendingId(null)
    }
    // 성공이면 세션이 onChange로 들어와 이 화면이 원래 목적지로 넘어간다
  }

  return (
    <section className="mt-5 rounded-lg border border-line bg-canvas p-4" aria-labelledby="gate-title">
      <h2 id="gate-title" className="text-sm font-semibold text-ink">
        시험용 입구
      </h2>
      <p className="mt-1 text-xs text-ink-sub">
        로그인 없이 누구나 들어올 수 있는 임시 입구입니다. <strong className="font-semibold text-ink">{formatGateUntil(status.until)}</strong>에
        자동으로 닫힙니다. 실제 고객 자료는 올리지 마세요.
      </p>
      {status.people.length === 0 ? (
        <p className="mt-3 text-sm text-ink-sub">주소록에 등록된 사람이 없습니다.</p>
      ) : (
        <ul className="mt-3 grid gap-2" aria-label="들어갈 사람">
          {status.people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void enter(p.id)}
                disabled={pendingId !== null}
                aria-label={`${p.display_name}(으)로 들어가기`}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-card transition-colors hover:border-border-strong disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-track text-sm font-semibold text-brown"
                >
                  {p.display_name.trim().charAt(0) || '?'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.display_name}</span>
                  <span className="block truncate text-xs text-ink-sub">{p.title || GATE_ROLE_LABEL[p.app_role]}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-ink-cap">
                  {pendingId === p.id ? '들어가는 중…' : GATE_ROLE_LABEL[p.app_role]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-2 text-sm text-negative" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export default function LoginPage() {
  const { mode, loading, user, signInWithEmail, allowedDomains, gate } = useAuth()
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

        {gate && <GateSection gate={gate} />}

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
