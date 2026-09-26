// api/intake 호출(클라이언트 측) — 설계서 v2.15 §8.7 · Phase 6.2.
// 쓰는 곳: S0 온보딩 ①의 'Slack 메시지에서 불러오기' 카드 · 견적서 첨부(Slack 첨부 파일 → 행사 폴더).
// DataProvider 인터페이스 밖의 연동 층(driveClient·notifyClient·aiClient와 같은 자리). 데모 아티팩트에는 싣지 않는다(vite.demo.config.ts 스텁).
import { defaultApiBase as apiBaseFor } from '../basePath'
import { ProviderError, type ErrorCode } from '../errors'
import type { BriefKey, BriefLink, EventBriefFields } from './eventBrief'

export interface IntakeStatus {
  /** 봇 토큰이 있어 링크로 글을 읽을 수 있는가 */
  slack: boolean
  /** AI 키가 있어 자유 문장을 읽는가(없으면 라벨 규칙만) */
  ai: boolean
  daily_limit: number
}

export interface IntakeFileInfo {
  id: string
  name: string
  mimetype: string | null
  size: number | null
  looks_like_quote: boolean
}

export interface IntakeReadResult {
  source: 'slack' | 'text'
  message: { permalink: string | null; posted_at: string | null; posted_by: string | null; text: string; channel: string; thread_ts: string } | null
  files: IntakeFileInfo[]
  links: BriefLink[]
  fields: EventBriefFields
  filled: BriefKey[]
  method: 'ai' | 'rules'
  ai_note: string | null
}

export interface IntakeSlackFileResult {
  file_id: string
  file_name: string
  url: string
  mimetype: string | null
}

export interface IntakeClientOptions {
  accessToken: () => Promise<string | null>
  apiBase?: string
  fetchImpl?: typeof fetch
}

const CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']

function codeFor(status: number, code: unknown): ErrorCode {
  if (CODES.includes(code as ErrorCode)) return code as ErrorCode
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409 || status === 429) return 'conflict'
  return 'validation'
}

export function createIntakeClient(opts: IntakeClientOptions) {
  const base = `${(opts.apiBase ?? apiBaseFor(import.meta.env?.VITE_API_BASE as string | undefined)).replace(/\/$/, '')}/intake`
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function post<T>(action: string, body: Record<string, unknown>): Promise<T> {
    const token = await opts.accessToken()
    if (!token) throw new ProviderError('forbidden', '로그인이 필요합니다.')
    let res: Response
    try {
      res = await fetchImpl(`${base}?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ProviderError('validation', '인테이크 서버에 연결할 수 없습니다 — 잠시 후 다시 시도하세요.')
    }
    const data = (await res.json().catch(() => null)) as (T & { error?: undefined }) | { error?: { code?: string; message?: string } } | null
    if (!res.ok) {
      const err = data && typeof data === 'object' && 'error' in data ? data.error : undefined
      throw new ProviderError(codeFor(res.status, err?.code), err?.message || `인테이크 서버 오류(${res.status}).`)
    }
    if (!data) throw new ProviderError('validation', '인테이크 서버 응답을 해석하지 못했습니다.')
    return data as T
  }

  return {
    async status(): Promise<IntakeStatus> {
      const res = await fetchImpl(base, { method: 'GET' })
      if (!res.ok) throw new ProviderError('conflict', `인테이크 서버 오류(${res.status})`)
      const data = (await res.json()) as Partial<IntakeStatus>
      return { slack: Boolean(data.slack), ai: Boolean(data.ai), daily_limit: Number(data.daily_limit ?? 30) }
    },
    /** 링크 또는 붙여 넣은 글 → 행사 기본 정보 제안 + 첨부·링크 목록 */
    read(input: { link?: string; text?: string; project_id?: string }): Promise<IntakeReadResult> {
      return post<IntakeReadResult>('read', input)
    },
    /** Slack 첨부 파일 → 행사 폴더 02_견적·정산/견적서(4MB 이하) */
    slackFile(input: { project_id: string; file_id: string }): Promise<IntakeSlackFileResult> {
      return post<IntakeSlackFileResult>('slack-file', input)
    },
  }
}

export type IntakeClient = ReturnType<typeof createIntakeClient>
