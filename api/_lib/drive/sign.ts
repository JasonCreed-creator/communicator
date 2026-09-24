// 서명 토큰 — 업로드 티켓·파일 스트림 URL·OAuth state를 서버 비밀키 HMAC으로 묶는다.
// 형식: base64url(JSON payload).base64url(HMAC-SHA256). payload.exp(초)가 지나면 410.
// 비밀키: DRIVE_SIGNING_KEY가 있으면 그것, 없으면 SUPABASE_SECRET_KEY에서 용도 고정 문자열로 파생한다
// (별도 env를 늘리지 않기 위함 — secret 키를 바꾸면 발급된 링크·티켓이 함께 무효가 되는 것은 의도).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { DriveError } from './errors.js'

export interface SigningEnv {
  DRIVE_SIGNING_KEY?: string
  SUPABASE_SECRET_KEY?: string
}

export function signingKey(env: SigningEnv): Buffer {
  if (env.DRIVE_SIGNING_KEY) return Buffer.from(env.DRIVE_SIGNING_KEY, 'utf8')
  if (!env.SUPABASE_SECRET_KEY) {
    throw new DriveError(500, 'validation', '서버 서명 키가 없습니다 — SUPABASE_SECRET_KEY(또는 DRIVE_SIGNING_KEY)를 설정하세요.')
  }
  return createHmac('sha256', env.SUPABASE_SECRET_KEY).update('communicator-drive-signing-v1').digest()
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function signToken(payload: Record<string, unknown>, key: Buffer, ttlSeconds: number, nowMs: number): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(nowMs / 1000) + ttlSeconds }), 'utf8'))
  const mac = b64url(createHmac('sha256', key).update(body).digest())
  return `${body}.${mac}`
}

/** 서명·만료 검증 후 payload. kind가 주어지면 payload.k가 같아야 한다(티켓을 스트림 토큰으로 돌려쓰지 못하게) */
export function verifyToken<T extends Record<string, unknown>>(token: string, key: Buffer, nowMs: number, kind?: string): T {
  const [body, mac] = String(token ?? '').split('.')
  if (!body || !mac) throw new DriveError(403, 'forbidden', '서명이 올바르지 않습니다.')
  const expected = createHmac('sha256', key).update(body).digest()
  const given = fromB64url(mac)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new DriveError(403, 'forbidden', '서명이 올바르지 않습니다.')
  }
  let payload: T & { exp?: number; k?: string }
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'))
  } catch {
    throw new DriveError(403, 'forbidden', '서명이 올바르지 않습니다.')
  }
  if (kind && payload.k !== kind) throw new DriveError(403, 'forbidden', '용도가 다른 서명입니다.')
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < nowMs) {
    throw new DriveError(410, 'gone', '링크가 만료되었습니다 — 화면을 새로고침한 뒤 다시 시도하세요.')
  }
  return payload
}
