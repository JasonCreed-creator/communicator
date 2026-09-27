// Slack 행사 스레드 링크 · 멤버 ID 판정 — 행사 설정 ③(행사마다 스레드 하나)과 서버 알림 함수(api/_lib/notify)가 같은 규칙을 쓴다
// (Phase 6.1 · 설계서 v2.12 §9). 사용자 결정 2026-09-26: 행사는 채널의 스레드 하나로 운영한다 — 봇의 모든 글은 그 스레드의 답글.
//
// 받는 링크(Slack '링크 복사' 두 모양):
//   https://{워크스페이스}.slack.com/archives/{채널}/p{16자리}                — 스레드 첫 글
//   https://{워크스페이스}.slack.com/archives/{채널}/p{16자리}?thread_ts=…&cid=… — 스레드 안 답글(→ thread_ts가 스레드)
//   https://app.slack.com/client/{팀}/{채널}/thread/{채널}-{ts}              — 브라우저 주소창
// 채널은 공개(C)·비공개(G)만 — DM(D)은 받지 않는다(DM을 쓰지 않는 운영 규칙).
export interface SlackThreadRef {
  channel: string
  /** 스레드 첫 글의 ts — 'seconds.micros' */
  thread_ts: string
}

export const SLACK_THREAD_INVALID_MESSAGE =
  'Slack 스레드 링크가 아닙니다 — 스레드 첫 글의 ⋯ → 링크 복사로 받은 주소(https://….slack.com/archives/…/p…)를 붙여 주세요.'

const CHANNEL_RE = /^[CG][A-Z0-9]{6,}$/
const TS_RE = /^\d{10}\.\d{6}$/

function tsFromP(p: string): string | null {
  const m = /^p(\d{10})(\d{6})$/.exec(p)
  return m ? `${m[1]}.${m[2]}` : null
}

export function parseSlackThreadLink(value: string | null | undefined): SlackThreadRef | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host !== 'slack.com' && !host.endsWith('.slack.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)

  if (parts[0] === 'archives' && parts.length >= 3) {
    const channel = parts[1]
    if (!CHANNEL_RE.test(channel)) return null
    const threadTs = url.searchParams.get('thread_ts')
    const ts = threadTs && TS_RE.test(threadTs) ? threadTs : tsFromP(parts[2])
    return ts ? { channel, thread_ts: ts } : null
  }
  // app.slack.com/client/{팀}/{채널}/thread/{채널}-{ts}
  const i = parts.indexOf('thread')
  if (parts[0] === 'client' && i >= 0 && parts[i + 1]) {
    const m = /^([CG][A-Z0-9]{6,})-(\d{10}\.\d{6})$/.exec(parts[i + 1])
    return m ? { channel: m[1], thread_ts: m[2] } : null
  }
  return null
}

/** Phase 6.2 인테이크 — 메시지 링크 한 개(글 자체의 ts · 스레드 답글이면 thread_ts). 스레드 링크와 같은 모양을 받는다 */
export interface SlackMessageRef {
  channel: string
  /** 그 글의 ts */
  ts: string
  /** 스레드 답글이면 스레드 첫 글의 ts, 아니면 null */
  thread_ts: string | null
}

export function parseSlackMessageLink(value: string | null | undefined): SlackMessageRef | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host !== 'slack.com' && !host.endsWith('.slack.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'archives' && parts.length >= 3) {
    const channel = parts[1]
    if (!CHANNEL_RE.test(channel)) return null
    const ts = tsFromP(parts[2])
    if (!ts) return null
    const threadTs = url.searchParams.get('thread_ts')
    return { channel, ts, thread_ts: threadTs && TS_RE.test(threadTs) && threadTs !== ts ? threadTs : null }
  }
  const i = parts.indexOf('thread')
  if (parts[0] === 'client' && i >= 0 && parts[i + 1]) {
    const m = /^([CG][A-Z0-9]{6,})-(\d{10}\.\d{6})$/.exec(parts[i + 1])
    return m ? { channel: m[1], ts: m[2], thread_ts: null } : null
  }
  return null
}

export function isSlackThreadLink(value: string | null | undefined): value is string {
  return parseSlackThreadLink(value) !== null
}

/** 저장 값 정규화 — 빈 칸 = 해제(null), 형식이 틀리면 'invalid' */
export function normalizeSlackThreadLink(value: string | null | undefined): string | null | 'invalid' {
  const v = (value ?? '').trim()
  if (!v) return null
  return isSlackThreadLink(v) ? v : 'invalid'
}

/** 봇이 올린 글의 링크(스레드 답글) — 스레드 링크의 워크스페이스 주소를 그대로 쓴다(app.slack.com 모양이면 slack.com) */
export function slackMessageLink(threadLink: string | null | undefined, channel: string, ts: string, threadTs?: string | null): string {
  let origin = 'https://slack.com'
  try {
    const u = new URL((threadLink ?? '').trim())
    if (u.hostname.endsWith('.slack.com') && u.hostname !== 'app.slack.com') origin = `https://${u.hostname}`
  } catch {
    // 기본 주소
  }
  const p = `p${ts.replace('.', '')}`
  const q = threadTs && threadTs !== ts ? `?thread_ts=${threadTs}&cid=${channel}` : ''
  return `${origin}/archives/${channel}/${p}${q}`
}

/** Slack 멤버 ID(U… · Enterprise Grid W…) */
export const SLACK_USER_ID_RE = /^[UW][A-Z0-9]{2,}$/

export const SLACK_USER_ID_INVALID_MESSAGE = 'Slack 멤버 ID는 U로 시작하는 영문 대문자·숫자입니다(프로필 → ⋯ → 멤버 ID 복사).'

export function isSlackUserId(value: string | null | undefined): value is string {
  return typeof value === 'string' && SLACK_USER_ID_RE.test(value.trim())
}

/** 저장 값 정규화 — 빈 칸 = 없음(null, 서버가 이메일로 다시 찾는다), 형식이 틀리면 'invalid' */
export function normalizeSlackUserId(value: string | null | undefined): string | null | 'invalid' {
  const v = (value ?? '').trim()
  if (!v) return null
  return isSlackUserId(v) ? v : 'invalid'
}
