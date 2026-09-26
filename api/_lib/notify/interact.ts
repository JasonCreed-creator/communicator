// Slack 버튼 응답 — 설계서 v2.12 §9 · Phase 6.1. 진입점 api/slack-interact.ts(Slack 앱 Interactivity Request URL).
//
//   POST (application/x-www-form-urlencoded · payload=JSON) — Slack이 보낸다. 서명(X-Slack-Signature)이 맞아야 한다.
//   '확인했어요'(action_id=ack, value=card_id)
//     → 누른 사람을 주소록에서 찾는다(Slack ID → 없으면 봇으로 이메일을 물어 찾고 적어 둔다)
//     → 멘션된 사람이면 확인 기록 + 카드를 "✓ 이름 확인함 · 시각"으로 바꾼다(채널의 모두가 본다)
//     → 아니면 그 사람에게만 보이는 안내(카드는 그대로)
//   '앱에서 열기'(action_id=open, 링크 버튼)는 Slack이 알려만 준다 — 200만.
// 확인은 상태가 아니라 표식이다 — 항목 상태(§5 전이표)는 바뀌지 않는다. Slack은 3초 안의 응답을 기대한다(DB 1회 + 응답 1회).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ackedBlocks, kstTime } from './cards.js'
import { createSlackApi, postResponse } from './slack.js'
import { createSupabaseNotifyStore, notifyStoreConfigured, type NotifyStore, type NotifyStoreEnv } from './store.js'

export interface InteractEnv extends NotifyStoreEnv {
  SLACK_SIGNING_SECRET?: string
  SLACK_BOT_TOKEN?: string
}

export interface InteractDeps {
  store?: NotifyStore
  fetchImpl?: typeof fetch
  now?: () => number
}

const WINDOW_SECONDS = 60 * 5

/** Slack 서명 검증 — v0:{타임스탬프}:{본문}의 HMAC-SHA256, 5분 창(재전송 공격 방지) */
export function verifySlackSignature(secret: string, timestamp: string | null, signature: string | null, body: string, nowMs: number): boolean {
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > WINDOW_SECONDS) return false
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface BlockActionsPayload {
  type?: string
  user?: { id?: string }
  actions?: { action_id?: string; value?: string }[]
  response_url?: string
  message?: { text?: string; blocks?: unknown[] }
}

function text(status: number, body = ''): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function handleSlackInteract(request: Request, env: InteractEnv, deps: InteractDeps = {}): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? Date.now
  if (request.method !== 'POST') return text(405, 'POST only')
  const secret = env.SLACK_SIGNING_SECRET?.trim()
  if (!secret) return text(503, 'SLACK_SIGNING_SECRET not configured')
  const raw = await request.text()
  if (!verifySlackSignature(secret, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature'), raw, now())) {
    return text(401, 'invalid signature')
  }
  let payload: BlockActionsPayload
  try {
    payload = JSON.parse(new URLSearchParams(raw).get('payload') ?? '') as BlockActionsPayload
  } catch {
    return text(400, 'bad payload')
  }
  const action = payload.type === 'block_actions' ? payload.actions?.find((a) => a.action_id === 'ack') : undefined
  if (!action) return text(200)
  const responseUrl = payload.response_url ?? ''
  const tell = (message: string) =>
    postResponse(responseUrl, { response_type: 'ephemeral', replace_original: false, text: message }, fetchImpl)

  if (!deps.store && !notifyStoreConfigured(env)) {
    await tell('알림 서버가 설정되지 않아 확인을 기록하지 못했어요. 관리자에게 알려 주세요.')
    return text(200)
  }
  const store = deps.store ?? createSupabaseNotifyStore(env)
  const slackUser = payload.user?.id ?? ''
  try {
    let person = slackUser ? await store.profileBySlack(slackUser) : null
    if (!person && slackUser && env.SLACK_BOT_TOKEN?.trim()) {
      const email = await createSlackApi(env.SLACK_BOT_TOKEN.trim(), fetchImpl).userEmail(slackUser)
      person = email ? await store.profileByEmail(email) : null
      if (person) await store.setSlackUser(person.id, slackUser).catch(() => undefined)
    }
    const result = await store.ackCard(action.value ?? '', person?.id ?? null)
    switch (result.status) {
      case 'ok':
        await postResponse(
          responseUrl,
          { replace_original: true, text: payload.message?.text ?? '', blocks: ackedBlocks(payload.message?.blocks, result.by, result.at) },
          fetchImpl,
        )
        break
      case 'already':
        await tell(`이미 ${result.by ?? '담당자'} 님이 ${kstTime(result.at)}에 확인했어요.`)
        break
      case 'not_recipient':
        await tell(
          person
            ? `이 요청은 ${result.names.join(', ') || '멘션된 분'} 님이 확인할 요청이에요. 카드는 그대로 둡니다.`
            : '커뮤니케이터 주소록에서 이 Slack 계정을 찾지 못했어요 — 담당자 화면에서 Slack 멤버 ID를 확인해 주세요.',
        )
        break
      default:
        await tell('이 요청을 찾을 수 없어요 — 항목이 지워졌을 수 있어요.')
    }
  } catch (e) {
    console.error('[slack-interact] 처리 실패:', e instanceof Error ? e.message : e)
    await tell('확인을 기록하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
  }
  return text(200)
}
