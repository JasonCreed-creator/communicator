// api/notify 호출(클라이언트 측) — 설계서 v2.10.1 §9 · Phase 6.
// 쓰는 곳: SupabaseProvider(사건 직후 신호 — 기다리지 않는다) · 행사 설정 ③ Slack 카드(상태·테스트) · 홈 '리마인드' 버튼.
// DataProvider 인터페이스 밖의 연동 층이다(driveClient와 같은 자리). 데모 아티팩트에는 싣지 않는다 — vite.demo.config.ts 스텁.
import { defaultApiBase as apiBaseFor } from '../basePath'
import { ProviderError, type ErrorCode } from '../errors'

export interface NotifyStatus {
  /** 공용 채널(서버 env SLACK_WEBHOOK_URL)이 설정됐는가 */
  slack: boolean
  /** v2.12 — 봇 토큰(서버 env)이 있는가. 없으면 행사 스레드로 보내지 못한다(웹훅으로) */
  bot?: boolean
  /** 매일 리마인드(Vercel cron 인증)가 설정됐는가 */
  cron: boolean
}

export interface NotifyClientOptions {
  accessToken: () => Promise<string | null>
  apiBase?: string
  fetchImpl?: typeof fetch
  /** 신호 묶음 대기(ms) — 한 동작이 여러 사건을 남겨도 신호는 한 번 */
  debounceMs?: number
}

const CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']

export function createNotifyClient(opts: NotifyClientOptions) {
  const base = `${(opts.apiBase ?? apiBaseFor(import.meta.env?.VITE_API_BASE as string | undefined)).replace(/\/$/, '')}/notify`
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const debounceMs = opts.debounceMs ?? 800
  let timer: ReturnType<typeof setTimeout> | null = null

  async function call<T>(body: Record<string, unknown>, withAuth = true): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (withAuth) {
      const token = await opts.accessToken()
      if (token) headers.authorization = `Bearer ${token}`
    }
    const res = await fetchImpl(base, { method: 'POST', headers, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    if (!res.ok) {
      const code = CODES.includes(data?.error?.code as ErrorCode) ? (data!.error!.code as ErrorCode) : 'conflict'
      throw new ProviderError(code, data?.error?.message ?? `알림 서버 오류(${res.status})`)
    }
    return data as T
  }

  /** 보내고 잊는다 — 알림 실패가 본 동작을 막지 않는다(§9). 탭을 닫아도 가도록 keepalive */
  function fire(body: Record<string, unknown>, bearerToken: string | null): void {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (bearerToken) headers.authorization = `Bearer ${bearerToken}`
    void Promise.resolve()
      .then(() => fetchImpl(base, { method: 'POST', headers, body: JSON.stringify(body), keepalive: true }))
      .catch(() => undefined)
  }

  return {
    async status(): Promise<NotifyStatus> {
      const res = await fetchImpl(base, { method: 'GET' })
      if (!res.ok) throw new ProviderError('conflict', `알림 서버 오류(${res.status})`)
      const data = (await res.json()) as Partial<NotifyStatus>
      return { slack: Boolean(data.slack), bot: Boolean(data.bot), cron: Boolean(data.cron) }
    },

    /** 사건 직후 신호(로그인 세션) — 짧은 시간의 여러 사건을 한 번으로 묶는다 */
    ping(): void {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void opts
          .accessToken()
          .then((t) => (t ? fire({ action: 'drain' }, t) : undefined))
          .catch(() => undefined)
      }, debounceMs)
    },

    /** 발주처(/c)·파트너(/p) 화면의 결정·제출 직후 신호 — 로그인 대신 그 링크 토큰으로 */
    pingToken(token: string): void {
      fire({ action: 'drain', token }, null)
    },

    test(projectId: string): Promise<{ sent: true; channel: 'thread' | 'project' | 'global' }> {
      return call({ action: 'test', project_id: projectId })
    },

    remind(projectId: string, target: 'delayed' | 'approval'): Promise<{ sent: boolean; total: number }> {
      return call({ action: 'remind', project_id: projectId, target })
    },
  }
}

export type NotifyClient = ReturnType<typeof createNotifyClient>
