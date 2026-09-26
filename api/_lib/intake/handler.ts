// 행사 인테이크 서버 함수 — 설계서 v2.15 §8.7 · Phase 6.2. 진입점 api/intake.ts.
//
//   GET                              → { slack, ai, daily_limit } — 봇 토큰·AI 키가 설정됐는가(값은 내보내지 않는다)
//   POST ?action=read + 로그인 세션   → { link } 또는 { text } (+ project_id) → Slack 글(봇으로 읽음) + 행사 기본 정보 제안 + 첨부·링크 목록
//   POST ?action=slack-file + 세션    → { project_id, file_id } → Slack 첨부 파일을 봇으로 내려받아 행사 폴더 02_견적·정산/견적서에(4MB 이하)
//
// 원칙: 읽기만 한다 — 저장은 앱이 사람 확인 뒤 updateProject로. 글 원문은 어디에도 저장하지 않는다(응답으로 한 번 돌려줄 뿐).
// 정보 추출 = 라벨 규칙(항상) → AI(Claude, feature 'project_intake' — 키가 있고 한도가 남았을 때만)로 빈 칸 채우기. AI가 실패해도
// 규칙 결과로 답한다(AI는 보조 — 실패가 인테이크를 막지 않는다). 사람 이름·연락처는 어떤 칸에도 넣지 않는다(보낸 사람 표시 이름만 기록용).
// Slack 읽기 권한(channels:history · groups:history · files:read)이 없으면 어느 권한을 더해야 하는지 그대로 알린다.
import { createClient } from '@supabase/supabase-js'
import {
  AI_EVENT_BRIEF_INSTRUCTION,
  AI_EVENT_BRIEF_SCHEMA,
  aiEventBriefSystem,
  extractBriefByRules,
  extractLinks,
  filledBriefKeys,
  mergeBrief,
  slackTextToPlain,
  validateEventBrief,
  type BriefKey,
  type BriefLink,
  type EventBriefFields,
} from '../../../src/lib/intake/eventBrief.js'
import { QUOTE_ATTACHMENT_MAX_BYTES } from '../../../src/lib/quoteAttachment.js'
import { parseSlackMessageLink } from '../../../src/lib/slackThread.js'
import { AiUpstreamError, createClaudeJsonReader, type JsonReader, type JsonReadSpec } from '../ai/claude.js'
import { AiError, aiDailyLimit, aiModel, createSupabaseAiUsageStore, type AiEnv, type AiUsageStore } from '../ai/handler.js'
import { DriveError } from '../drive/errors.js'
import { makeCtx as makeDriveCtx, type DriveDeps } from '../drive/handler.js'
import { projectFileOp, type DriveEnv } from '../drive/service.js'
import { createSlackApi, slackErrorMessage, type SlackApi, type SlackFile } from '../notify/slack.js'

export interface IntakeEnv extends AiEnv, DriveEnv {
  SLACK_BOT_TOKEN?: string
}

export interface IntakeStore {
  /** 로그인 세션 → 주소록 id(내부 사용자). 없으면 null */
  authProfile(jwt: string): Promise<{ id: string } | null>
}

export interface IntakeDeps {
  store?: IntakeStore
  usage?: AiUsageStore
  slack?: SlackApi
  /** Slack 파일 내려받기(files.slack.com) — 테스트 주입 */
  slackFetch?: typeof fetch
  reader?: JsonReader
  drive?: DriveDeps
  now?: () => Date
}

export interface IntakeFile {
  id: string
  name: string
  mimetype: string | null
  size: number | null
  looks_like_quote: boolean
}

export interface IntakeReadResult {
  source: 'slack' | 'text'
  message: { permalink: string | null; posted_at: string | null; posted_by: string | null; text: string; channel: string; thread_ts: string } | null
  files: IntakeFile[]
  links: BriefLink[]
  fields: EventBriefFields
  filled: BriefKey[]
  /** ai = 규칙 + Claude · rules = 규칙만 */
  method: 'ai' | 'rules'
  /** 규칙만 썼을 때 그 이유(키 없음 · 한도 · AI 오류) — 없으면 null */
  ai_note: string | null
}

export interface IntakeSlackFileResult {
  file_id: string
  file_name: string
  url: string
  mimetype: string | null
}

export const INTAKE_SCOPES_MESSAGE =
  'Slack 봇에 글 읽기 권한이 없습니다 — Slack 앱 설정 → OAuth & Permissions → Bot Token Scopes에 channels:history · groups:history · files:read를 더하고 워크스페이스에 다시 설치하세요. 그동안은 글을 복사해 붙여 넣으면 됩니다.'
export const INTAKE_NO_BOT_MESSAGE = 'Slack 봇이 준비되지 않았습니다(서버 SLACK_BOT_TOKEN) — 글을 복사해 붙여 넣어 주세요.'
export const INTAKE_NOT_IN_CHANNEL_MESSAGE =
  '봇이 이 채널에 없습니다 — 채널 세부정보 → 에이전트 및 앱 → 앱 추가로 커뮤니케이터 앱을 넣은 뒤 다시 불러오세요(또는 글을 붙여 넣기).'

const MAX_TEXT = 6000
const AI_MIN_TEXT = 20
const AI_MAX_TOKENS = 2000

export const EVENT_BRIEF_SPEC = (today: Date): JsonReadSpec => ({
  system: aiEventBriefSystem(today),
  schema: AI_EVENT_BRIEF_SCHEMA as unknown as Record<string, unknown>,
  maxTokens: AI_MAX_TOKENS,
  effort: 'low',
})

export function intakeSlackReady(env: IntakeEnv): boolean {
  return Boolean(env.SLACK_BOT_TOKEN?.trim())
}

function storeEnv(env: IntakeEnv) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  return url && secret && publishable ? { url, secret, publishable } : null
}

export function createSupabaseIntakeStore(env: IntakeEnv): IntakeStore {
  const cfg = storeEnv(env)
  if (!cfg) throw new AiError(503, 'unavailable', '서버 자격증명이 설정되지 않았습니다 (SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY).')
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  return {
    async authProfile(jwt) {
      const user = createClient(cfg.url, cfg.publishable, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } })
      const { data, error } = await user.auth.getUser(jwt)
      if (error || !data.user) return null
      const admin = createClient(cfg.url, cfg.secret, opts)
      const { data: profile } = await admin.from('profiles').select('id').eq('auth_user_id', data.user.id).maybeSingle()
      return profile ? { id: profile.id as string } : null
    },
  }
}

function parseBearer(header: string | null): string {
  const m = (header ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new AiError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

function slackFailure(code: string | undefined): AiError {
  switch (code) {
    case 'missing_scope':
      return new AiError(403, 'forbidden', INTAKE_SCOPES_MESSAGE)
    case 'not_in_channel':
      return new AiError(403, 'forbidden', INTAKE_NOT_IN_CHANNEL_MESSAGE)
    case 'channel_not_found':
      return new AiError(404, 'not_found', slackErrorMessage(code))
    case 'message_not_found':
    case 'thread_not_found':
      return new AiError(404, 'not_found', '링크가 가리키는 글을 찾을 수 없습니다 — 글의 ⋯ → 링크 복사로 다시 받아 주세요.')
    case 'file_not_found':
      return new AiError(404, 'not_found', '첨부 파일을 찾을 수 없습니다 — 삭제됐거나 봇이 볼 수 없는 파일입니다.')
    case 'invalid_auth':
    case 'not_authed':
    case 'account_inactive':
    case 'token_revoked':
      return new AiError(503, 'unavailable', slackErrorMessage(code))
    case 'ratelimited':
      return new AiError(503, 'unavailable', slackErrorMessage(code))
    default:
      return new AiError(502, 'unavailable', code?.startsWith('connection') ? 'Slack에 연결하지 못했습니다 — 잠시 뒤 다시 시도하세요.' : slackErrorMessage(code))
  }
}

/** 견적서처럼 보이는 첨부 — 이름에 견적·quote·estimate, 또는 엑셀·PDF(사진은 이름에 '견적'이 있을 때만) */
const QUOTE_LIKE_EXT_RE = /\.(xlsx|xls|csv|pdf)$/i
function looksLikeQuoteFile(f: SlackFile): boolean {
  const name = `${f.name ?? ''} ${f.title ?? ''}`
  return /견적|quote|estimate/i.test(name) || QUOTE_LIKE_EXT_RE.test(f.name ?? '') || /pdf|spreadsheet|excel/i.test(f.mimetype ?? '')
}

function permalinkOf(channel: string, ts: string, threadTs: string | null): string {
  const p = `p${ts.replace('.', '')}`
  return `https://slack.com/archives/${channel}/${p}${threadTs ? `?thread_ts=${threadTs}&cid=${channel}` : ''}`
}

/** Slack 글 → 인테이크 결과(추출 전) */
async function readSlackMessage(link: string, slack: SlackApi) {
  const ref = parseSlackMessageLink(link)
  if (!ref) throw new AiError(400, 'validation', 'Slack 메시지 링크가 아닙니다 — 글의 ⋯ → 링크 복사로 받은 주소(https://….slack.com/archives/…/p…)를 붙여 주세요.')
  const r = await slack.message(ref.channel, ref.ts, ref.thread_ts)
  if (!r.ok || !r.message) throw slackFailure(r.error)
  const msg = r.message
  const raw = String(msg.text ?? '')
  const postedBy = msg.user ? await slack.userName(msg.user) : null
  const posted = /^\d{10}/.test(msg.ts) ? new Date(Number(msg.ts.slice(0, 10)) * 1000).toISOString() : null
  const files: IntakeFile[] = (msg.files ?? [])
    .filter((f) => f && typeof f.id === 'string')
    .map((f) => ({
      id: f.id,
      name: f.name || f.title || '파일',
      mimetype: f.mimetype ?? null,
      size: typeof f.size === 'number' ? f.size : null,
      looks_like_quote: looksLikeQuoteFile(f),
    }))
  return {
    raw,
    message: {
      permalink: permalinkOf(ref.channel, ref.ts, ref.thread_ts),
      posted_at: posted,
      posted_by: postedBy,
      text: slackTextToPlain(raw).slice(0, MAX_TEXT),
      channel: ref.channel,
      thread_ts: msg.thread_ts ?? ref.thread_ts ?? ref.ts,
    },
    files,
  }
}

interface ReadBody {
  link?: unknown
  text?: unknown
  project_id?: unknown
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function readIntake(body: ReadBody, jwt: string, env: IntakeEnv, deps: IntakeDeps = {}): Promise<IntakeReadResult> {
  const store = deps.store ?? createSupabaseIntakeStore(env)
  const me = await store.authProfile(jwt)
  if (!me) throw new AiError(401, 'forbidden', '로그인이 필요합니다.')
  const projectId = typeof body.project_id === 'string' && UUID_RE.test(body.project_id) ? body.project_id : null
  const now = deps.now ?? (() => new Date())
  const today = now()

  let source: IntakeReadResult['source']
  let text: string
  let message: IntakeReadResult['message'] = null
  let files: IntakeFile[] = []
  let linkSource = ''
  const link = typeof body.link === 'string' ? body.link.trim() : ''
  if (link) {
    if (!intakeSlackReady(env)) throw new AiError(503, 'unavailable', INTAKE_NO_BOT_MESSAGE)
    const slack = deps.slack ?? createSlackApi(env.SLACK_BOT_TOKEN!.trim())
    const read = await readSlackMessage(link, slack)
    source = 'slack'
    text = read.message.text
    linkSource = read.raw
    message = read.message
    files = read.files
  } else {
    const pasted = typeof body.text === 'string' ? body.text.trim() : ''
    if (!pasted) throw new AiError(400, 'validation', 'Slack 메시지 링크나 글을 붙여 주세요.')
    source = 'text'
    text = slackTextToPlain(pasted).slice(0, MAX_TEXT)
    linkSource = pasted
  }
  if (!text.trim()) throw new AiError(422, 'validation', '글에 읽을 내용이 없습니다(파일만 있는 글이면 파일만 첨부할 수 있습니다).')

  // ① 라벨 규칙(항상)
  const rules = extractBriefByRules(text, today)

  // ② AI로 빈 칸 채우기 — 키·한도·오류 어느 것도 인테이크를 막지 않는다(규칙 결과로 답한다)
  let ai: EventBriefFields | null = null
  let aiNote: string | null = null
  const key = env.ANTHROPIC_API_KEY?.trim()
  if (!key) aiNote = 'AI 키가 없어 라벨(행사명: · 일시: · 장소: …)이 붙은 줄만 읽었습니다.'
  else if (text.length < AI_MIN_TEXT) aiNote = null
  else {
    const usage = deps.usage ?? createSupabaseAiUsageStore(env)
    let claim: { id: string; used: number; limit: number } | null = null
    try {
      claim = await usage.claim(jwt, projectId, 'project_intake', aiDailyLimit(env))
    } catch (e) {
      if (e instanceof AiError && e.status === 429) aiNote = `${e.message} 이번에는 라벨이 붙은 줄만 읽었습니다.`
      else if (e instanceof AiError && (e.status === 403 || e.status === 404 || e.status === 409)) throw e
      else aiNote = 'AI 사용 기록을 남기지 못해 라벨이 붙은 줄만 읽었습니다.'
    }
    if (claim) {
      const model = aiModel(env)
      const reader = deps.reader ?? createClaudeJsonReader(key, model, EVENT_BRIEF_SPEC(today))
      const finish = (status: 'ok' | 'unreadable' | 'failed', m: string | null, i: number, o: number, error: string | null) =>
        usage.finish(claim!.id, status, m, i, o, error).catch(() => undefined)
      try {
        const out = await reader([{ type: 'text', text: `${AI_EVENT_BRIEF_INSTRUCTION}\n\n---\n${text}` }])
        if (out.stop_reason === 'refusal' || out.stop_reason === 'max_tokens' || out.json === null) {
          await finish('unreadable', out.model, out.input_tokens, out.output_tokens, out.stop_reason ?? 'no json')
          aiNote = 'AI가 이 글을 읽지 못해 라벨이 붙은 줄만 읽었습니다.'
        } else {
          ai = validateEventBrief(out.json)
          await finish('ok', out.model, out.input_tokens, out.output_tokens, null)
        }
      } catch (e) {
        const kind = e instanceof AiUpstreamError ? e.kind : 'shape'
        console.warn(`[intake] ai ${kind}`)
        await finish('failed', model, 0, 0, kind)
        aiNote = 'AI 읽기에 실패해 라벨이 붙은 줄만 읽었습니다 — 잠시 뒤 다시 불러오면 AI가 다시 읽습니다.'
      }
    }
  }

  const fields = mergeBrief(rules, ai)
  return {
    source,
    message,
    files,
    links: extractLinks(linkSource),
    fields,
    filled: filledBriefKeys(fields),
    method: ai ? 'ai' : 'rules',
    ai_note: aiNote,
  }
}

function isSlackFileHost(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'files.slack.com' || u.hostname.endsWith('.slack.com'))
  } catch {
    return false
  }
}

/** Slack 첨부 파일 → 행사 폴더(견적서). 권한은 Drive 쪽 SQL(pm · 종료 안 된 행사)이 다시 본다 */
export async function slackFileToProject(
  body: { project_id?: unknown; file_id?: unknown },
  jwt: string,
  env: IntakeEnv,
  deps: IntakeDeps = {},
): Promise<IntakeSlackFileResult> {
  const store = deps.store ?? createSupabaseIntakeStore(env)
  if (!(await store.authProfile(jwt))) throw new AiError(401, 'forbidden', '로그인이 필요합니다.')
  const projectId = typeof body.project_id === 'string' ? body.project_id : ''
  if (!UUID_RE.test(projectId)) throw new AiError(400, 'validation', '행사 id 형식이 올바르지 않습니다.')
  const fileId = typeof body.file_id === 'string' && /^F[A-Z0-9]{6,}$/.test(body.file_id) ? body.file_id : ''
  if (!fileId) throw new AiError(400, 'validation', 'Slack 파일 id 형식이 올바르지 않습니다.')
  if (!intakeSlackReady(env)) throw new AiError(503, 'unavailable', INTAKE_NO_BOT_MESSAGE)
  const slack = deps.slack ?? createSlackApi(env.SLACK_BOT_TOKEN!.trim())
  const info = await slack.fileInfo(fileId)
  if (!info.ok || !info.file) throw slackFailure(info.error)
  const f = info.file
  const size = typeof f.size === 'number' ? f.size : 0
  if (size > QUOTE_ATTACHMENT_MAX_BYTES) {
    throw new AiError(413, 'validation', '4MB가 넘는 첨부는 여기서 옮기지 못합니다 — Slack에서 내려받아 Drive에 올린 뒤 링크로 붙여 주세요.')
  }
  const downloadUrl = f.url_private_download || f.url_private || ''
  if (!isSlackFileHost(downloadUrl)) throw new AiError(502, 'unavailable', 'Slack이 내려받기 주소를 주지 않았습니다 — 봇에 files:read 권한이 있는지 확인하세요.')
  const fetchImpl = deps.slackFetch ?? fetch
  let bytes: Uint8Array
  try {
    const res = await fetchImpl(downloadUrl, { headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN!.trim()}` }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`http ${res.status}`)
    const ct = res.headers.get('content-type') ?? ''
    // 로그인 페이지(HTML)가 오면 권한이 없는 것 — 파일로 저장하지 않는다
    if (/text\/html/i.test(ct)) throw new AiError(403, 'forbidden', INTAKE_SCOPES_MESSAGE)
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    if (e instanceof AiError) throw e
    throw new AiError(502, 'unavailable', 'Slack에서 파일을 내려받지 못했습니다 — 잠시 뒤 다시 시도하세요.')
  }
  if (bytes.byteLength === 0) throw new AiError(422, 'validation', '빈 파일입니다.')
  if (bytes.byteLength > QUOTE_ATTACHMENT_MAX_BYTES) throw new AiError(413, 'validation', '4MB가 넘는 첨부는 여기서 옮기지 못합니다.')
  const name = f.name || f.title || '견적서'
  try {
    const drive = makeDriveCtx(env, deps.drive ?? {})
    const r = await projectFileOp(drive, jwt, projectId, name, f.mimetype || 'application/octet-stream', bytes)
    return { file_id: r.file_id, file_name: r.file_name, url: r.url, mimetype: f.mimetype ?? null }
  } catch (e) {
    if (e instanceof DriveError) throw new AiError(e.status, e.code === 'gone' ? 'validation' : e.code, e.message)
    throw e
  }
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

/** Web 표준 Request → Response. GET은 준비 상태만(토큰·키 값은 어떤 경우에도 돌려주지 않는다) */
export async function handleIntakeRequest(request: Request, env: IntakeEnv, deps: IntakeDeps = {}): Promise<Response> {
  if (request.method === 'GET') {
    return json(200, { slack: intakeSlackReady(env), ai: Boolean(env.ANTHROPIC_API_KEY?.trim()), daily_limit: aiDailyLimit(env) })
  }
  if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'GET·POST만 허용됩니다.' } })
  try {
    const action = new URL(request.url).searchParams.get('action')
    const jwt = parseBearer(request.headers.get('authorization'))
    const body = ((await request.json().catch(() => null)) ?? null) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new AiError(400, 'validation', 'JSON 본문이 필요합니다.')
    if (action === 'read') return json(200, await readIntake(body, jwt, env, deps))
    if (action === 'slack-file') return json(200, await slackFileToProject(body, jwt, env, deps))
    throw new AiError(400, 'validation', '알 수 없는 동작입니다.')
  } catch (e) {
    if (e instanceof AiError) return json(e.status, { error: { code: e.code, message: e.message } })
    console.warn('[intake] unexpected:', e instanceof Error ? e.message.slice(0, 200) : e)
    return json(500, { error: { code: 'validation', message: '인테이크 처리 중 알 수 없는 오류가 났습니다.' } })
  }
}
