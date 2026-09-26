// AI 서버 함수 — 설계서 v2.14 §19.5b · Phase 4.8. 진입점 api/ai.ts.
//
//   GET                                   → { enabled, model, daily_limit } — 키·저장소가 설정됐는가(값은 내보내지 않는다)
//   POST ?action=vendor-quote + 로그인 세션 → 협력사 견적서 PDF·사진을 Claude로 읽어 확인 큐 입력(doc)을 돌려준다
//       본문 { project_id, file_name, media_type, data_base64 }
//
// 순서: ① 키 확인(없으면 503 — 흉내 내지 않는다) ② 파일 형식·크기·내용 서명 ③ ai_usage_claim(사용자 JWT — pm·종료 안 된 행사·
// 1인 하루 한도, 넘으면 429) ④ Claude 읽기 ⑤ 결과 검사 → docFromAiVendorQuote(검산은 우리 코드) ⑥ ai_usage_finish(service).
// **저장하지 않는다** — 앱이 받은 doc으로 기존 가져오기(settlement_imports · 확인 큐 · 확정 RPC)를 그대로 탄다(§19.5a 원칙 불변).
// Claude 쪽 오류는 'failed'로 적어 한도에서 빼고, 읽었지만 견적서가 아니면 'unreadable'(한도에 센다 — 호출 비용이 났다).
// 로그에는 파일 이름·금액을 싣지 않는다(§19.7 준용).
import { createClient } from '@supabase/supabase-js'
import {
  AI_FILE_TOO_LARGE_MESSAGE,
  AI_MAX_BYTES,
  AiVendorQuoteShapeError,
  docFromAiVendorQuote,
  validateAiVendorQuote,
  type AiMediaType,
  type VendorQuoteSourceDoc,
} from '../../../src/lib/vendorQuoteAi.js'
import { AiUpstreamError, createClaudeReader, DEFAULT_AI_MODEL, type VendorQuoteReader } from './claude.js'

export interface AiEnv {
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
  AI_DAILY_LIMIT?: string
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export type AiUsageStatus = 'ok' | 'unreadable' | 'failed'

export interface AiUsageStore {
  /** 사용자 JWT로 선점 — 권한·한도 판정은 SQL(ai_usage_claim). 실패는 AiError로 던진다 */
  claim(accessToken: string, projectId: string, feature: 'vendor_quote', limit: number): Promise<{ id: string; used: number; limit: number }>
  /** service 경로로 결과 기록(best-effort) */
  finish(id: string, status: AiUsageStatus, model: string | null, inputTokens: number, outputTokens: number, error: string | null): Promise<void>
}

export interface AiDeps {
  store?: AiUsageStore
  reader?: VendorQuoteReader
}

export interface AiVendorQuoteResponse {
  doc: VendorQuoteSourceDoc
  model: string
  usage: { used: number; limit: number }
}

export class AiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'unavailable',
    message: string,
  ) {
    super(message)
  }
}

const MEDIA_TYPES: readonly AiMediaType[] = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const AI_NOT_READY_MESSAGE =
  'AI 읽기가 아직 준비되지 않았습니다 — 관리자가 서버 env ANTHROPIC_API_KEY를 설정해야 합니다. 엑셀(.xlsx) 견적서는 지금도 불러올 수 있습니다.'

export function aiDailyLimit(env: AiEnv): number {
  const n = Number.parseInt(env.AI_DAILY_LIMIT ?? '', 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : 30
}

export function aiModel(env: AiEnv): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_AI_MODEL
}

function storeEnv(env: AiEnv) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  return url && secret && publishable ? { url, secret, publishable } : null
}

export function aiEnabled(env: AiEnv): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim()) && storeEnv(env) !== null
}

interface PgErr {
  code?: string | null
  message?: string
}

/** ai_usage_claim 오류 → AiError. 접두어('FORBIDDEN: ' 등)를 떼어 사람 말만 남긴다 */
export function claimError(err: PgErr): AiError {
  const raw = err.message ?? ''
  const message = raw.replace(/^[A-Z_]+:\s*/, '') || 'AI 사용을 확인하지 못했습니다.'
  switch (err.code) {
    case 'P0429':
      return new AiError(429, 'rate_limited', message)
    case 'P0403':
      return new AiError(403, 'forbidden', message)
    case 'P0404':
      return new AiError(404, 'not_found', message)
    case 'P0409':
      return new AiError(409, 'conflict', message)
    case 'P0422':
      return new AiError(400, 'validation', message)
    default:
      if (/jwt|token/i.test(raw) || err.code === 'PGRST301' || err.code === 'PGRST303') {
        return new AiError(401, 'forbidden', '로그인이 필요합니다.')
      }
      return new AiError(503, 'unavailable', 'AI 사용 기록을 남기지 못했습니다 — 잠시 뒤 다시 시도하세요.')
  }
}

export function createSupabaseAiUsageStore(env: AiEnv): AiUsageStore {
  const cfg = storeEnv(env)
  if (!cfg) throw new AiError(503, 'unavailable', AI_NOT_READY_MESSAGE)
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  return {
    async claim(accessToken, projectId, feature, limit) {
      const user = createClient(cfg.url, cfg.publishable, { ...opts, global: { headers: { Authorization: `Bearer ${accessToken}` } } })
      const { data, error } = await user.rpc('ai_usage_claim', { p_project: projectId, p_feature: feature, p_limit: limit })
      if (error) throw claimError(error)
      const row = data as { id: string; used: number; limit: number }
      return { id: row.id, used: row.used, limit: row.limit }
    },
    async finish(id, status, model, inputTokens, outputTokens, error) {
      const admin = createClient(cfg.url, cfg.secret, opts)
      const { error: err } = await admin.rpc('ai_usage_finish', {
        p_id: id,
        p_status: status,
        p_model: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_error: error,
      })
      if (err) console.warn('[ai] usage finish failed:', err.code ?? err.message)
    },
  }
}

export function parseBearer(header: string | null | undefined): string {
  const m = (header ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) throw new AiError(401, 'forbidden', '로그인이 필요합니다.')
  return m[1].trim()
}

/** 내용 서명 — 확장자만 바꾼 파일을 Claude에 보내지 않는다 */
export function matchesSignature(media: AiMediaType, bytes: Uint8Array): boolean {
  const at = (i: number) => bytes[i]
  switch (media) {
    case 'application/pdf':
      return at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46 // %PDF
    case 'image/jpeg':
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff
    case 'image/png':
      return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47
    case 'image/webp':
      return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  }
}

const MEDIA_LABEL: Record<AiMediaType, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG 사진',
  'image/png': 'PNG 그림',
  'image/webp': 'WEBP 그림',
}

interface VendorQuoteBody {
  project_id?: unknown
  file_name?: unknown
  media_type?: unknown
  data_base64?: unknown
}

function upstreamMessage(e: AiUpstreamError): AiError {
  switch (e.kind) {
    case 'auth':
      return new AiError(503, 'unavailable', 'AI 키가 올바르지 않거나 막혔습니다 — 관리자가 서버 env ANTHROPIC_API_KEY와 Anthropic 콘솔의 결제·한도를 확인하세요.')
    case 'rate_limit':
    case 'overloaded':
      return new AiError(503, 'unavailable', 'AI 사용량이 잠시 몰렸습니다 — 1분쯤 뒤 다시 시도하세요. 이번 시도는 오늘 횟수에 세지 않습니다.')
    case 'bad_request':
      return new AiError(422, 'validation', 'AI가 이 파일을 열지 못했습니다 — 암호가 걸렸거나 100쪽이 넘는 PDF일 수 있습니다. 견적서 쪽만 따로 저장해 올려 주세요.')
    case 'connection':
      return new AiError(503, 'unavailable', 'AI 서버에 연결하지 못했습니다 — 잠시 뒤 다시 시도하세요. 이번 시도는 오늘 횟수에 세지 않습니다.')
    default:
      return new AiError(502, 'unavailable', 'AI 읽기에 실패했습니다 — 잠시 뒤 다시 시도하세요. 이번 시도는 오늘 횟수에 세지 않습니다.')
  }
}

export async function readVendorQuote(
  body: VendorQuoteBody,
  accessToken: string,
  env: AiEnv,
  deps: AiDeps = {},
): Promise<AiVendorQuoteResponse> {
  const key = env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new AiError(503, 'unavailable', AI_NOT_READY_MESSAGE)

  // ② 형식·크기·내용 — Claude를 부르기 전에(한도도 쓰기 전에) 거른다
  const projectId = typeof body.project_id === 'string' ? body.project_id : ''
  if (!UUID_RE.test(projectId)) throw new AiError(400, 'validation', '행사 id 형식이 올바르지 않습니다.')
  const media = body.media_type as AiMediaType
  if (!MEDIA_TYPES.includes(media)) {
    throw new AiError(400, 'validation', 'AI로 읽을 수 있는 파일은 PDF·JPG·PNG·WEBP입니다.')
  }
  if (typeof body.data_base64 !== 'string' || !body.data_base64) throw new AiError(400, 'validation', '빈 파일입니다.')
  if (body.data_base64.length > Math.ceil((AI_MAX_BYTES * 4) / 3) + 8) throw new AiError(413, 'validation', AI_FILE_TOO_LARGE_MESSAGE)
  const bytes = new Uint8Array(Buffer.from(body.data_base64, 'base64'))
  if (bytes.length === 0) throw new AiError(400, 'validation', '빈 파일입니다.')
  if (bytes.length > AI_MAX_BYTES) throw new AiError(413, 'validation', AI_FILE_TOO_LARGE_MESSAGE)
  if (!matchesSignature(media, bytes)) {
    throw new AiError(400, 'validation', `파일 내용이 ${MEDIA_LABEL[media]}이(가) 아닙니다 — 원본 파일을 다시 골라 주세요.`)
  }

  // ③ 권한·한도(SQL)
  const store = deps.store ?? createSupabaseAiUsageStore(env)
  const claim = await store.claim(accessToken, projectId, 'vendor_quote', aiDailyLimit(env))
  const model = aiModel(env)
  const reader = deps.reader ?? createClaudeReader(key, model)
  const finish = (status: AiUsageStatus, m: string | null, i: number, o: number, error: string | null) =>
    store.finish(claim.id, status, m, i, o, error).catch((e: unknown) => {
      console.warn('[ai] usage finish failed:', e instanceof Error ? e.message : e)
    })

  // ④ 읽기
  let out: Awaited<ReturnType<VendorQuoteReader>>
  try {
    out = await reader({ media_type: media, data_base64: body.data_base64 })
  } catch (e) {
    const up = e instanceof AiUpstreamError ? e : new AiUpstreamError('other', null, e instanceof Error ? e.message : 'unknown')
    console.warn(`[ai] vendor-quote upstream ${up.kind}${up.upstreamStatus ? ` (${up.upstreamStatus})` : ''}`)
    await finish('failed', model, 0, 0, `${up.kind}${up.upstreamStatus ? ` ${up.upstreamStatus}` : ''}`)
    throw upstreamMessage(up)
  }
  const tokens = [out.input_tokens, out.output_tokens] as const
  if (out.stop_reason === 'refusal') {
    await finish('unreadable', out.model, ...tokens, 'refusal')
    throw new AiError(422, 'validation', 'AI가 이 파일을 읽지 않았습니다 — 협력사 견적서가 맞는지 확인하세요.')
  }
  if (out.stop_reason === 'max_tokens') {
    await finish('unreadable', out.model, ...tokens, 'max_tokens')
    throw new AiError(422, 'validation', '견적서가 길어 한 번에 다 읽지 못했습니다 — PDF를 몇 쪽씩 나눠 올려 주세요.')
  }

  // ⑤ 검사 — 모양이 틀리면 우리 쪽 실패로(한도에서 뺀다)
  let result
  try {
    result = validateAiVendorQuote(out.json)
  } catch (e) {
    const why = e instanceof AiVendorQuoteShapeError ? e.message : 'invalid json'
    console.warn('[ai] vendor-quote shape:', why.slice(0, 120))
    await finish('failed', out.model, ...tokens, `shape: ${why}`)
    throw new AiError(502, 'unavailable', 'AI 응답을 해석하지 못했습니다 — 다시 시도하세요. 이번 시도는 오늘 횟수에 세지 않습니다.')
  }
  if (!result.readable) {
    await finish('unreadable', out.model, ...tokens, 'not a quote')
    throw new AiError(
      422,
      'validation',
      `견적서로 읽지 못했습니다${result.unreadable_reason ? ` — ${result.unreadable_reason}` : ''}. 흐리거나 잘린 사진이면 다시 찍어 올려 주세요.`,
    )
  }
  if (!result.sections.some((s) => s.items.length > 0)) {
    await finish('unreadable', out.model, ...tokens, 'no items')
    throw new AiError(422, 'validation', '견적서에서 항목 줄을 찾지 못했습니다 — 표가 보이게 다시 찍거나 PDF로 올려 주세요.')
  }
  await finish('ok', out.model, ...tokens, null)
  return { doc: docFromAiVendorQuote(result), model: out.model, usage: { used: claim.used, limit: claim.limit } }
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

/** Web 표준 Request → Response. GET은 준비 상태만(키 값은 어떤 경우에도 돌려주지 않는다) */
export async function handleAiRequest(request: Request, env: AiEnv, deps: AiDeps = {}): Promise<Response> {
  if (request.method === 'GET') {
    return json(200, { enabled: aiEnabled(env), model: aiModel(env), daily_limit: aiDailyLimit(env) })
  }
  if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'GET·POST만 허용됩니다.' } })
  try {
    const action = new URL(request.url).searchParams.get('action')
    if (action !== 'vendor-quote') throw new AiError(400, 'validation', '알 수 없는 동작입니다.')
    if (!env.ANTHROPIC_API_KEY?.trim()) throw new AiError(503, 'unavailable', AI_NOT_READY_MESSAGE)
    const accessToken = parseBearer(request.headers.get('authorization'))
    const body = (await request.json().catch(() => null)) as VendorQuoteBody | null
    if (!body || typeof body !== 'object') throw new AiError(400, 'validation', 'JSON 본문이 필요합니다.')
    return json(200, await readVendorQuote(body, accessToken, env, deps))
  } catch (e) {
    if (e instanceof AiError) return json(e.status, { error: { code: e.code, message: e.message } })
    console.warn('[ai] unexpected:', e instanceof Error ? e.message.slice(0, 200) : e)
    return json(500, { error: { code: 'validation', message: 'AI 읽기 중 알 수 없는 오류가 났습니다.' } })
  }
}
