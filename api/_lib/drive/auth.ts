// Drive 접근 토큰 — 설계서 v2.9 §2 Drive 인증.
//   oauth(기본): 폴더 소유(또는 전용 운영) 계정의 OAuth 갱신 토큰 → access token. 갱신 토큰은 env(GOOGLE_DRIVE_REFRESH_TOKEN)가
//     있으면 그것, 없으면 앱의 '연결하기'가 Supabase Vault에 넣어 둔 값(§12 "Vault/환경변수"). 내 드라이브 폴더에서 동작한다.
//   service_account: 서비스 계정 JWT — **공유 드라이브 폴더에서만** 쓴다(서비스 계정은 저장 용량이 없어 내 드라이브에 파일을
//     만들 수 없다 — Google 공식 문서, 2026-09-24 확인). DRIVE_AUTH=service_account로 명시할 때만.
// access token은 인스턴스 메모리에 만료 1분 전까지 캐시한다(Fluid compute 재사용 시 호출 절약).
import { createHash } from 'node:crypto'
import { googleAccessToken, type ServiceAccount } from '../sheets.js'
import { DriveError, notReady } from './errors.js'
import type { DriveStore } from './store.js'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
export const OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export interface DriveAuthEnv {
  DRIVE_ROOT_FOLDER_ID?: string
  DRIVE_AUTH?: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  GOOGLE_DRIVE_REFRESH_TOKEN?: string
  GOOGLE_SHEETS_SA_JSON?: string
  DRIVE_OAUTH_REDIRECT_URI?: string
}

export type DriveAuthMode = 'oauth' | 'service_account'

export function driveAuthMode(env: DriveAuthEnv): DriveAuthMode {
  return env.DRIVE_AUTH === 'service_account' ? 'service_account' : 'oauth'
}

/** 서버 설정(env)이 갖춰졌는가 — 연결(갱신 토큰) 여부와는 별개 */
export function driveConfigured(env: DriveAuthEnv): boolean {
  if (!env.DRIVE_ROOT_FOLDER_ID) return false
  return driveAuthMode(env) === 'service_account'
    ? Boolean(env.GOOGLE_SHEETS_SA_JSON)
    : Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export const NOT_CONFIGURED_MESSAGE =
  'Drive 저장소가 아직 설정되지 않았습니다 — 서버 env(DRIVE_ROOT_FOLDER_ID · GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET)를 넣고 다시 배포하세요.'
export const NOT_CONNECTED_MESSAGE = 'Drive가 아직 연결되지 않았습니다 — 관리자가 행사 설정 ③ 유형·연동에서 "Drive 연결하기"를 눌러 주세요.'

const cache = new Map<string, { token: string; exp: number }>()

/** 테스트용 */
export function clearTokenCache(): void {
  cache.clear()
}

function keyOf(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

export async function refreshTokenFor(env: DriveAuthEnv, store: Pick<DriveStore, 'readRefreshToken'> | null): Promise<string | null> {
  if (env.GOOGLE_DRIVE_REFRESH_TOKEN) return env.GOOGLE_DRIVE_REFRESH_TOKEN
  if (!store) return null
  try {
    return await store.readRefreshToken()
  } catch (e) {
    console.warn('[drive] 갱신 토큰을 읽지 못했습니다:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Drive access token. 설정·연결이 없으면 503(사실대로), 갱신 토큰이 취소·만료됐으면 연결 오류를 기록하고 503.
 */
export async function driveAccessToken(
  env: DriveAuthEnv,
  store: Pick<DriveStore, 'readRefreshToken' | 'recordConnectionError'> | null,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<string> {
  if (!driveConfigured(env)) throw notReady(NOT_CONFIGURED_MESSAGE)

  if (driveAuthMode(env) === 'service_account') {
    let sa: ServiceAccount
    try {
      sa = JSON.parse(env.GOOGLE_SHEETS_SA_JSON!) as ServiceAccount
      if (!sa.client_email || !sa.private_key) throw new Error('missing')
    } catch {
      throw new DriveError(500, 'validation', 'GOOGLE_SHEETS_SA_JSON 형식이 올바르지 않습니다 (client_email·private_key).')
    }
    const k = `sa:${sa.client_email}`
    const hit = cache.get(k)
    if (hit && hit.exp > nowMs) return hit.token
    const token = await googleAccessToken(sa, fetchImpl, DRIVE_SCOPE)
    cache.set(k, { token, exp: nowMs + 50 * 60 * 1000 })
    return token
  }

  const refresh = await refreshTokenFor(env, store)
  if (!refresh) throw notReady(NOT_CONNECTED_MESSAGE)
  const k = `oa:${keyOf(refresh)}`
  const hit = cache.get(k)
  if (hit && hit.exp > nowMs) return hit.token

  const res = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) {
    let reason = ''
    try {
      reason = ((await res.json()) as { error?: string }).error ?? ''
    } catch {
      /* 본문 없음 */
    }
    const message =
      reason === 'invalid_grant'
        ? 'Drive 연결이 끊겼습니다(권한 취소·토큰 만료) — 관리자가 행사 설정 ③에서 다시 연결해야 합니다.'
        : `Drive 인증에 실패했습니다(${res.status}${reason ? ` ${reason}` : ''}) — OAuth 클라이언트 설정을 확인하세요.`
    await store?.recordConnectionError(message)
    throw notReady(message)
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number }
  cache.set(k, { token: body.access_token, exp: nowMs + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 })
  return body.access_token
}

export function oauthRedirectUri(env: DriveAuthEnv, requestUrl: string): string {
  if (env.DRIVE_OAUTH_REDIRECT_URI) return env.DRIVE_OAUTH_REDIRECT_URI
  return `${new URL(requestUrl).origin}/api/drive`
}

/** 동의 화면 URL — access_type=offline + prompt=consent로 갱신 토큰을 반드시 받는다 */
export function oauthAuthorizeUrl(env: DriveAuthEnv, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeOAuthCode(
  env: DriveAuthEnv,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<{ access_token: string; refresh_token?: string; scope?: string }> {
  const res = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    }),
  })
  if (!res.ok) throw new DriveError(502, 'validation', `Google 인증 코드 교환 실패(${res.status}) — 다시 연결해 주세요.`)
  return (await res.json()) as { access_token: string; refresh_token?: string; scope?: string }
}
