// Slack Web API 클라이언트(봇 토큰) — 설계서 v2.12 §9 · Phase 6.1. fetch 주입형(테스트 = 가짜 Slack, 실토큰 없이 계약 검증).
// 서버가 요청을 보내는 곳은 두 군데뿐이다: `https://slack.com/api/{메서드}`(봇) · 버튼 응답의 `https://hooks.slack.com/…`(response_url).
// 봇 토큰(SLACK_BOT_TOKEN)은 서버 env에만 있다 — 번들·응답·로그에 싣지 않는다.
export interface SlackResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export interface PostMessageInput {
  channel: string
  thread_ts?: string | null
  text: string
  blocks?: unknown[]
}

const API = 'https://slack.com/api/'

/** 사람이 읽는 오류 문구 — 설정 화면 '테스트 보내기'와 로그가 쓴다 */
export function slackErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not_in_channel':
      return '봇이 이 채널에 없습니다 — 채널 세부정보 → 에이전트 및 앱 → 앱 추가로 커뮤니케이터 앱을 넣으세요(또는 /invite @앱이름).'
    case 'channel_not_found':
      return '채널을 찾을 수 없습니다 — 비공개 채널이면 먼저 채널 세부정보 → 에이전트 및 앱 → 앱 추가로 커뮤니케이터 앱을 넣고, 링크가 이 워크스페이스의 것인지 확인하세요.'
    case 'thread_not_found':
    case 'message_not_found':
      return '스레드를 찾을 수 없습니다 — 스레드 첫 글의 링크를 다시 복사해 주세요.'
    case 'is_archived':
      return '보관된 채널입니다 — 다른 채널의 스레드를 등록하세요.'
    case 'invalid_auth':
    case 'not_authed':
    case 'account_inactive':
    case 'token_revoked':
      return '봇 토큰이 맞지 않습니다 — 관리자에게 알려 주세요(서버 SLACK_BOT_TOKEN).'
    case 'missing_scope':
      return '봇 권한이 모자랍니다 — Slack 앱 설정에서 권한(scope)을 확인하세요.'
    case 'ratelimited':
      return 'Slack이 잠시 요청을 막았습니다 — 잠시 뒤 다시 시도하세요.'
    default:
      return `Slack 오류(${code ?? '알 수 없음'})`
  }
}

export function createSlackApi(token: string, fetchImpl: typeof fetch = fetch) {
  async function call(method: string, body: Record<string, unknown>, form = false): Promise<SlackResult> {
    try {
      const res = await fetchImpl(`${API}${method}`, {
        method: 'POST',
        headers: form
          ? { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' }
          : { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
        body: form
          ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString()
          : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      if (res.status === 429) return { ok: false, error: 'ratelimited' }
      const data = (await res.json().catch(() => null)) as SlackResult | null
      if (!data || typeof data.ok !== 'boolean') return { ok: false, error: `http_${res.status}` }
      return data
    } catch (e) {
      return { ok: false, error: `connection: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  return {
    /** 채널(스레드)에 글 — 미리보기 펼침 끔 */
    async postMessage(input: PostMessageInput): Promise<SlackResult & { ts?: string }> {
      const body: Record<string, unknown> = { channel: input.channel, text: input.text, unfurl_links: false, unfurl_media: false }
      if (input.thread_ts) body.thread_ts = input.thread_ts
      if (input.blocks) body.blocks = input.blocks
      return call('chat.postMessage', body) as Promise<SlackResult & { ts?: string }>
    },
    /** 이메일 → Slack 멤버 ID(없으면 null — users_not_found) */
    async lookupByEmail(email: string): Promise<string | null> {
      const r = await call('users.lookupByEmail', { email }, true)
      const user = r.ok ? (r.user as { id?: string } | undefined) : undefined
      return user?.id ?? null
    },
    /** 멤버 ID → 이메일(버튼을 누른 사람을 주소록에서 찾을 때) */
    async userEmail(userId: string): Promise<string | null> {
      const r = await call('users.info', { user: userId }, true)
      const user = r.ok ? (r.user as { profile?: { email?: string } } | undefined) : undefined
      return user?.profile?.email ?? null
    },
  }
}

export type SlackApi = ReturnType<typeof createSlackApi>

/** 버튼 응답 주소(response_url)만 받는다 — 페이로드에 적힌 임의 주소로 서버가 요청하지 않게 */
export function isSlackResponseUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'hooks.slack.com'
  } catch {
    return false
  }
}

export async function postResponse(url: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!isSlackResponseUrl(url)) return false
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}
