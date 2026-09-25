// Slack 알림 서버 함수 — 설계서 v2.10.1 §9 · Phase 6. 진입점 api/notify.ts.
//
//   GET  (Authorization 없음)                  → { slack, bot, cron } — 공용 채널·봇 토큰·크론 비밀이 설정됐는가(값은 내보내지 않는다)
//   GET  (Authorization: Bearer CRON_SECRET)    → Vercel cron(매일 KST 9시대): 밀린 사건 + D-1 리마인드 + 미등록 파일 묶음
//   POST {action:'drain'} + 로그인 세션 | {token} → 앱이 사건 직후 보내는 신호 — 밀린 사건만 보낸다(누가 불러도 한 번만)
//   POST {action:'test', project_id}  (pm)      → 행사 스레드(봇) → 행사 채널 → 공용 채널로 시험 한 줄
//   POST {action:'remind', project_id, target} (멤버) → 홈 '리마인드' — 지연 태스크·컨펌 대기 목록(한 시간에 한 번)
//
// 원칙(§9 v2.3): 알림은 본 동작을 막지 않는다 — 앱은 신호를 보내고 기다리지 않으며, 보낼 곳이 없으면 no-op(선점 행 'skipped').
// 금액은 싣지 않는다(§19.7 — format.ts 화이트리스트).
// v2.12(Phase 6.1 — 봇): 보낼 곳 = 행사 스레드(봇 토큰 + 행사 설정 ③ 스레드 링크) → 행사 웹훅 → 공용 웹훅 → 없음.
// 스레드에는 줄(한 메시지로 묶음)과 의뢰 카드('확인했어요' 버튼 — 카드마다 한 메시지)를 답글로 단다. DM은 쓰지 않는다(사용자 결정).
// 서버가 요청하는 곳은 `https://slack.com/api/…`(봇) · `https://hooks.slack.com/services/…`(웹훅) 둘뿐이다.
import { randomUUID } from 'node:crypto'
import { parseSlackThreadLink, type SlackThreadRef } from '../../../src/lib/slackThread.js'
import { cardMessage, mentionText, type Recipient } from './cards.js'
import {
  appBaseUrl,
  eventUnits,
  isSlackWebhookUrl,
  manualUnit,
  reminderUnits,
  slackEscape,
  slackPayload,
  testLine,
  MAX_LINES_PER_MESSAGE,
  type MessageUnit,
} from './format.js'
import { createSlackApi, slackErrorMessage, type SlackApi } from './slack.js'
import { createSupabaseNotifyStore, notifyStoreConfigured, type NotifyStore, type NotifyStoreEnv } from './store.js'

export interface NotifyEnv extends NotifyStoreEnv {
  SLACK_BOT_TOKEN?: string
  SLACK_WEBHOOK_URL?: string
  CRON_SECRET?: string
  APP_BASE_URL?: string
  VERCEL_PROJECT_PRODUCTION_URL?: string
  VITE_BASE_PATH?: string
}

export interface NotifyDeps {
  store?: NotifyStore
  fetchImpl?: typeof fetch
  now?: () => number
}

export interface NotifySummary {
  sent: number
  failed: number
  skipped: number
  messages: number
}

class NotifyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'validation' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message)
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function bearer(request: Request): string | null {
  const h = request.headers.get('authorization') ?? ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() || null : null
}

/** 보낼 곳(웹훅) — 행사 채널(Slack 주소일 때만) → 공용 채널 → 없음 */
export function destinationFor(unitWebhook: string | null, env: NotifyEnv): string | null {
  if (isSlackWebhookUrl(unitWebhook)) return unitWebhook.trim()
  return isSlackWebhookUrl(env.SLACK_WEBHOOK_URL) ? env.SLACK_WEBHOOK_URL.trim() : null
}

/** 봇 토큰이 있고 행사 스레드 링크가 맞으면 그 스레드 — 아니면 null(웹훅으로) */
export function threadFor(thread: string | null | undefined, env: NotifyEnv): SlackThreadRef | null {
  return env.SLACK_BOT_TOKEN?.trim() ? parseSlackThreadLink(thread) : null
}

async function postSlack(url: string, lines: string[], fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(slackPayload(lines)),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return null
    const text = (await res.text().catch(() => '')).slice(0, 200)
    return `Slack ${res.status}${text ? ` ${text}` : ''}`
  } catch (e) {
    return `Slack 연결 실패: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** 줄 + 멘션(앞) + 인용(아래). names=false(웹훅)면 Slack ID를 아는 사람만 멘션한다 */
export function renderLine(u: MessageUnit, names: boolean): string {
  const who = mentionText(u.mentions, names)
  const q = (u.quote ?? '').trim()
  const quote = q ? '\n' + q.slice(0, 150).split('\n').map((l) => `>${slackEscape(l)}`).join('\n') : ''
  return `${who ? `${who} ` : ''}${u.line}${quote}`
}

/** 멘션 대상의 Slack ID 채우기 — 주소록에 적힌 값 → 없으면 이메일로 찾아 적어 둔다(한 번의 전달 안에서는 한 번만 묻는다) */
function createResolver(api: SlackApi, store: NotifyStore) {
  const memo = new Map<string, Promise<string | null>>()
  return async (people: readonly Recipient[] | undefined): Promise<Recipient[]> =>
    Promise.all(
      (people ?? []).map(async (p) => {
        if (p.slack_user_id || !p.email) return p
        const key = p.email.toLowerCase()
        if (!memo.has(key)) {
          memo.set(
            key,
            api.lookupByEmail(p.email).then(async (id) => {
              if (id) await store.setSlackUser(p.id, id).catch(() => undefined)
              return id
            }),
          )
        }
        const id = await memo.get(key)!
        return id ? { ...p, slack_user_id: id } : p
      }),
    )
}

interface ThreadGroup {
  ref: SlackThreadRef
  projectId: string
  lines: { keys: string[]; unit: MessageUnit }[]
  cards: MessageUnit[]
}

/**
 * 단위를 보낼 곳별로 묶어 보내고 결과를 기록한다. 줄 없는 단위·보낼 곳 없는 단위는 skipped.
 * 스레드(봇): 줄은 한 답글로 묶고(20줄마다 한 답글), 카드는 한 장씩 — 올린 카드는 확인 기록(request_acks)에 남긴다.
 * 웹훅: 줄만(카드는 줄로 대신한다 — 버튼 없음), 채널마다 한 메시지.
 */
export async function deliver(
  units: MessageUnit[],
  env: NotifyEnv,
  store: NotifyStore,
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
): Promise<NotifySummary> {
  const summary: NotifySummary = { sent: 0, failed: 0, skipped: 0, messages: 0 }
  const skipped: string[] = []
  const byHook = new Map<string, { keys: string[]; lines: string[] }>()
  const byThread = new Map<string, ThreadGroup>()
  for (const u of units) {
    if (!u.line) {
      skipped.push(...u.keys)
      continue
    }
    const ref = threadFor(u.thread, env)
    if (ref) {
      const k = `${ref.channel}:${ref.thread_ts}`
      const g = byThread.get(k) ?? { ref, projectId: u.project_id ?? '', lines: [], cards: [] }
      if (u.card) g.cards.push(u)
      else g.lines.push({ keys: u.keys, unit: u })
      byThread.set(k, g)
      continue
    }
    const dest = destinationFor(u.webhook, env)
    if (!dest) {
      skipped.push(...u.keys)
      console.log(`[notify] 보낼 곳 없음(no-op): ${u.line}`)
      continue
    }
    const group = byHook.get(dest) ?? { keys: [], lines: [] }
    group.keys.push(...u.keys)
    group.lines.push(renderLine(u, false))
    byHook.set(dest, group)
  }
  if (skipped.length) {
    await store.mark(skipped, 'skipped')
    summary.skipped += skipped.length
  }
  const record = async (keys: string[], error: string | null) => {
    summary.messages += 1
    if (error) {
      console.warn(`[notify] ${error}`)
      await store.mark(keys, 'failed', error)
      summary.failed += keys.length
    } else {
      await store.mark(keys, 'sent')
      summary.sent += keys.length
    }
  }
  for (const [dest, group] of byHook) {
    await record(group.keys, await postSlack(dest, group.lines, fetchImpl))
  }
  if (byThread.size) {
    const api = createSlackApi(env.SLACK_BOT_TOKEN!.trim(), fetchImpl)
    const resolve = createResolver(api, store)
    for (const g of byThread.values()) {
      // ① 줄 — 20줄마다 한 답글
      for (let i = 0; i < g.lines.length; i += MAX_LINES_PER_MESSAGE) {
        const chunk = g.lines.slice(i, i + MAX_LINES_PER_MESSAGE)
        const rendered = await Promise.all(chunk.map(async (c) => renderLine({ ...c.unit, mentions: await resolve(c.unit.mentions) }, true)))
        const r = await api.postMessage({ channel: g.ref.channel, thread_ts: g.ref.thread_ts, text: rendered.join('\n') })
        await record(chunk.flatMap((c) => c.keys), r.ok ? null : `Slack 봇 ${r.error ?? '오류'}: ${slackErrorMessage(r.error)}`)
      }
      // ② 의뢰 카드 — 한 장씩, 올린 뒤 확인 기록
      for (const u of g.cards) {
        const mentions = await resolve(u.mentions)
        const cardId = randomUUID()
        const msg = cardMessage(u.card!, mentions, cardId, now())
        const r = await api.postMessage({ channel: g.ref.channel, thread_ts: g.ref.thread_ts, text: msg.text, blocks: msg.blocks })
        if (r.ok && typeof r.ts === 'string') {
          const card = u.card!
          const rows =
            card.kind === 'work'
              ? card.items.map((it) => ({ deliverable_id: it.deliverable_id, kind: 'work' as const, notify_key: it.notify_key }))
              : [{ deliverable_id: card.deliverable_id, kind: 'review' as const, notify_key: card.notify_key }]
          await store
            .recordCard({
              card_id: cardId,
              project_id: u.project_id ?? g.projectId,
              rows,
              recipient_ids: mentions.map((m) => m.id),
              channel: g.ref.channel,
              message_ts: r.ts,
              thread_ts: g.ref.thread_ts,
            })
            .catch((e) => console.warn(`[notify] 카드 기록 실패: ${e instanceof Error ? e.message : e}`))
        }
        await record(u.keys, r.ok ? null : `Slack 봇 ${r.error ?? '오류'}: ${slackErrorMessage(r.error)}`)
      }
    }
  }
  return summary
}

function add(a: NotifySummary, b: NotifySummary): NotifySummary {
  return { sent: a.sent + b.sent, failed: a.failed + b.failed, skipped: a.skipped + b.skipped, messages: a.messages + b.messages }
}

async function drain(env: NotifyEnv, store: NotifyStore, fetchImpl: typeof fetch, now: () => number, requestUrl?: string): Promise<NotifySummary> {
  const base = appBaseUrl(env, requestUrl)
  const rows = await store.claimEvents(100)
  if (rows.length === 0) return { sent: 0, failed: 0, skipped: 0, messages: 0 }
  return deliver(eventUnits(rows, base), env, store, fetchImpl, now)
}

async function cron(env: NotifyEnv, store: NotifyStore, fetchImpl: typeof fetch, now: () => number): Promise<NotifySummary> {
  const base = appBaseUrl(env)
  const events = await drain(env, store, fetchImpl, now)
  const reminders = await store.claimReminders()
  return reminders.length ? add(events, await deliver(reminderUnits(reminders, base), env, store, fetchImpl, now)) : events
}

async function requireMember(store: NotifyStore, jwt: string | null, projectId: string): Promise<string> {
  const profileId = jwt ? await store.authProfile(jwt) : null
  if (!profileId) throw new NotifyError(401, 'forbidden', '로그인이 필요합니다.')
  const role = await store.memberRole(profileId, projectId)
  if (!role) throw new NotifyError(403, 'forbidden', '이 행사의 담당자가 아닙니다.')
  return role
}

const NO_CHANNEL = '보낼 Slack 스레드·채널이 없습니다 — 행사 설정 ③ 유형·연동에서 이 행사의 Slack 스레드 링크를 등록하세요.'

export async function handleNotifyRequest(request: Request, env: NotifyEnv, deps: NotifyDeps = {}): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? Date.now
  try {
    if (request.method === 'GET') {
      const auth = bearer(request)
      if (!auth)
        return json(200, {
          slack: isSlackWebhookUrl(env.SLACK_WEBHOOK_URL),
          bot: Boolean(env.SLACK_BOT_TOKEN?.trim()),
          cron: Boolean(env.CRON_SECRET),
        })
      if (!env.CRON_SECRET) return json(503, { error: { code: 'validation', message: 'CRON_SECRET이 설정되지 않았습니다.' } })
      if (auth !== env.CRON_SECRET) return json(401, { error: { code: 'forbidden', message: '크론 인증이 맞지 않습니다.' } })
      if (!deps.store && !notifyStoreConfigured(env)) return json(200, { mode: 'noop', reason: 'no_database' })
      const store = deps.store ?? createSupabaseNotifyStore(env)
      return json(200, await cron(env, store, fetchImpl, now))
    }
    if (request.method !== 'POST') return json(405, { error: { code: 'validation', message: 'GET·POST만 허용됩니다.' } })

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    if (!deps.store && !notifyStoreConfigured(env)) {
      // 서버 자격증명 없음(데모·미리보기) — 신호는 조용히 받고 끝낸다. 시험·리마인드는 사실대로 503
      if (action === 'drain') return json(200, { mode: 'noop', reason: 'no_database' })
      return json(503, { error: { code: 'validation', message: '알림 서버가 설정되지 않았습니다(SUPABASE_URL·SUPABASE_SECRET_KEY).' } })
    }
    const store = deps.store ?? createSupabaseNotifyStore(env)
    const jwt = bearer(request)

    if (action === 'drain') {
      const token = typeof body.token === 'string' ? body.token : null
      const allowed = jwt ? Boolean(await store.authProfile(jwt)) : token ? await store.tokenActive(token) : false
      if (!allowed) return json(401, { error: { code: 'forbidden', message: '로그인 세션 또는 유효한 링크가 필요합니다.' } })
      return json(200, await drain(env, store, fetchImpl, now, request.url))
    }

    const projectId = typeof body.project_id === 'string' ? body.project_id : ''
    if (!projectId) throw new NotifyError(400, 'validation', '행사 id가 필요합니다.')

    if (action === 'test') {
      const role = await requireMember(store, jwt, projectId)
      if (role !== 'pm') throw new NotifyError(403, 'forbidden', '알림 테스트는 PM만 보낼 수 있습니다.')
      const project = await store.project(projectId)
      if (!project) throw new NotifyError(404, 'not_found', '프로젝트를 찾을 수 없습니다.')
      const ref = threadFor(project.thread, env)
      if (ref) {
        const api = createSlackApi(env.SLACK_BOT_TOKEN!.trim(), fetchImpl)
        const r = await api.postMessage({
          channel: ref.channel,
          thread_ts: ref.thread_ts,
          text: testLine({ project_code: project.code, project_name: project.name }, 'thread'),
        })
        if (!r.ok) throw new NotifyError(502, 'conflict', slackErrorMessage(r.error))
        return json(200, { sent: true, channel: 'thread' })
      }
      const dest = destinationFor(project.webhook, env)
      if (!dest) throw new NotifyError(409, 'conflict', NO_CHANNEL)
      const error = await postSlack(dest, [testLine({ project_code: project.code, project_name: project.name })], fetchImpl)
      if (error) throw new NotifyError(502, 'conflict', `Slack이 받지 않았습니다 — 웹훅 주소를 확인하세요. (${error})`)
      return json(200, { sent: true, channel: isSlackWebhookUrl(project.webhook) ? 'project' : 'global' })
    }

    if (action === 'remind') {
      const target = body.target === 'delayed' || body.target === 'approval' ? body.target : null
      if (!target) throw new NotifyError(400, 'validation', '리마인드 대상은 delayed 또는 approval이어야 합니다.')
      await requireMember(store, jwt, projectId)
      const project = await store.project(projectId)
      if (!project) throw new NotifyError(404, 'not_found', '프로젝트를 찾을 수 없습니다.')
      if (!threadFor(project.thread, env) && !destinationFor(project.webhook, env)) throw new NotifyError(409, 'conflict', NO_CHANNEL)
      const row = await store.claimManual(projectId, target)
      if (!row) throw new NotifyError(409, 'conflict', '이 시간에 이미 보냈습니다 — 한 시간 뒤에 다시 보낼 수 있습니다.')
      if (!row.total) {
        await store.mark([row.key], 'skipped')
        return json(200, { sent: false, total: 0 })
      }
      const summary = await deliver([manualUnit(row, appBaseUrl(env, request.url))], env, store, fetchImpl, now)
      if (summary.failed) throw new NotifyError(502, 'conflict', 'Slack이 받지 않았습니다 — 행사 설정 ③의 스레드 링크·웹훅 주소를 확인하세요.')
      return json(200, { sent: true, total: row.total })
    }

    return json(400, { error: { code: 'validation', message: `알 수 없는 작업입니다: ${action || '(없음)'}` } })
  } catch (e) {
    if (e instanceof NotifyError) return json(e.status, { error: { code: e.code, message: e.message } })
    console.error('[notify] 처리 실패:', e instanceof Error ? e.message : e)
    return json(500, { error: { code: 'internal', message: '알림 처리 중 오류가 났습니다.' } })
  }
}
