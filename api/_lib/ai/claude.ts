// Claude 호출(서버 전용) — 설계서 v2.14 §19.5b · Phase 4.8.
// 키 = 서버 env ANTHROPIC_API_KEY(VITE_ 판 금지 — 번들에 실리면 누구나 쓴다). 모델 = ANTHROPIC_MODEL(기본 claude-sonnet-5 — 사용자 결정).
// 요청 = 문서(PDF) 또는 그림(사진) 한 장 + 옮겨 적기 지시, 출력 = 구조화 JSON(output_config.format — 스키마는 src/lib/vendorQuoteAi).
// 스트림으로 받아 마지막 메시지만 쓴다(긴 표를 읽는 동안 연결이 끊기지 않게).
// 이 파일만 SDK를 안다 — 핸들러는 VendorQuoteReader만 받으므로 테스트는 가짜 읽기 함수를 주입한다.
import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import {
  AI_VENDOR_QUOTE_INSTRUCTION,
  AI_VENDOR_QUOTE_SCHEMA,
  AI_VENDOR_QUOTE_SYSTEM,
  type AiMediaType,
} from '../../../src/lib/vendorQuoteAi.js'

export const DEFAULT_AI_MODEL = 'claude-sonnet-5'
/** 표가 긴 견적서도 한 번에 옮길 만큼 — 넘치면 'max_tokens'로 알려 쪽을 나눠 올리게 한다 */
export const AI_MAX_TOKENS = 16_000
/** SDK 전체 제한 시간 — 서버 함수 최대 실행 시간(120초) 안에서 끝나게 */
export const AI_TIMEOUT_MS = 100_000

export interface AiReadInput {
  media_type: AiMediaType
  data_base64: string
}

export interface AiReadOutput {
  /** 구조화 출력 JSON(파싱 전 원문을 JSON.parse한 값). refusal·max_tokens면 null */
  json: unknown | null
  stop_reason: string | null
  model: string
  input_tokens: number
  output_tokens: number
}

export type VendorQuoteReader = (input: AiReadInput) => Promise<AiReadOutput>

/** 구조화 JSON 읽기 한 종류 — 시스템 규칙 · 출력 스키마 · 출력 상한. 협력사 견적서 · 행사 인테이크가 각자 하나씩 갖는다 */
export interface JsonReadSpec {
  system: string
  schema: Record<string, unknown>
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}

/** 내용 블록(문서·그림·글)을 주면 구조화 JSON을 돌려주는 읽기 함수 */
export type JsonReader = (content: Anthropic.ContentBlockParam[]) => Promise<AiReadOutput>

/** Claude API 쪽 오류(키 틀림·한도·과부하·연결) — 핸들러가 사람 말로 바꾼다 */
export class AiUpstreamError extends Error {
  constructor(
    public readonly kind: 'auth' | 'rate_limit' | 'overloaded' | 'bad_request' | 'connection' | 'other',
    public readonly upstreamStatus: number | null,
    message: string,
  ) {
    super(message)
  }
}

function contentFor(input: AiReadInput): Anthropic.ContentBlockParam {
  if (input.media_type === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.data_base64 } }
  }
  return { type: 'image', source: { type: 'base64', media_type: input.media_type, data: input.data_base64 } }
}

/** 구조화 JSON 요청 본문(공용) */
export function jsonRequest(model: string, spec: JsonReadSpec, content: Anthropic.ContentBlockParam[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: spec.maxTokens ?? AI_MAX_TOKENS,
    system: spec.system,
    messages: [{ role: 'user', content }],
    output_config: {
      effort: spec.effort ?? 'medium',
      format: { type: 'json_schema', schema: spec.schema },
    },
  }
}

export const VENDOR_QUOTE_SPEC: JsonReadSpec = {
  system: AI_VENDOR_QUOTE_SYSTEM,
  schema: AI_VENDOR_QUOTE_SCHEMA as unknown as Record<string, unknown>,
  maxTokens: AI_MAX_TOKENS,
  effort: 'medium',
}

/** SDK 요청 본문 — 테스트가 모양(문서가 글보다 먼저 · 스키마 · 모델)을 확인한다 */
export function vendorQuoteRequest(model: string, input: AiReadInput): Anthropic.MessageCreateParamsNonStreaming {
  return jsonRequest(model, VENDOR_QUOTE_SPEC, [contentFor(input), { type: 'text', text: AI_VENDOR_QUOTE_INSTRUCTION }])
}

function upstream(e: unknown): AiUpstreamError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiUpstreamError('auth', e.status ?? null, 'auth')
  }
  if (e instanceof Anthropic.RateLimitError) return new AiUpstreamError('rate_limit', 429, 'rate_limit')
  if (e instanceof Anthropic.BadRequestError) return new AiUpstreamError('bad_request', 400, e.message.slice(0, 200))
  if (e instanceof Anthropic.APIConnectionError) return new AiUpstreamError('connection', null, 'connection')
  if (e instanceof Anthropic.APIError) {
    return new AiUpstreamError(e.status === 529 ? 'overloaded' : 'other', e.status ?? null, `status ${e.status ?? '?'}`)
  }
  return new AiUpstreamError('other', null, e instanceof Error ? e.message.slice(0, 200) : 'unknown')
}

/** 구조화 JSON 읽기(공용) — clientOptions = 테스트 주입(가짜 fetch · 재시도 0), 운영은 기본값 */
export function createClaudeJsonReader(apiKey: string, model: string, spec: JsonReadSpec, clientOptions: Partial<ClientOptions> = {}): JsonReader {
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1, ...clientOptions })
  return async (content) => {
    let message: Anthropic.Message
    try {
      message = await client.messages.stream(jsonRequest(model, spec, content)).finalMessage()
    } catch (e) {
      throw upstream(e)
    }
    const usage = { input_tokens: message.usage?.input_tokens ?? 0, output_tokens: message.usage?.output_tokens ?? 0 }
    if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
      return { json: null, stop_reason: message.stop_reason, model: message.model, ...usage }
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { json, stop_reason: message.stop_reason, model: message.model, ...usage }
  }
}

/** 협력사 견적서 읽기 = 공용 읽기 + 견적서 규칙·스키마 */
export function createClaudeReader(apiKey: string, model: string, clientOptions: Partial<ClientOptions> = {}): VendorQuoteReader {
  const read = createClaudeJsonReader(apiKey, model, VENDOR_QUOTE_SPEC, clientOptions)
  return (input) => read([contentFor(input), { type: 'text', text: AI_VENDOR_QUOTE_INSTRUCTION }])
}
