// DoD 79 (Phase 6.1 · 설계서 v2.12 §9) — Slack 봇 전환 + 의뢰 확인 버튼. 가짜 저장소·가짜 Slack으로 돈다(실 DB 판정은 supabase:check).
//   ① 행사 스레드 링크: 세 모양 인식 · DM·다른 호스트·틀린 ts 거부 · 카드 링크
//   ② 보낼 곳: 봇 토큰 + 스레드 → 스레드 답글 / 봇 없음·스레드 없음 → 웹훅 / 둘 다 없음 → skipped
//   ③ 멘션: 주소록 Slack ID → 없으면 이메일로 찾아 적어 둔다(한 번만) → 못 찾으면 '이름(Slack 미연결)' · 웹훅은 아는 ID만
//   ④ 카드: 새 지시 = 담당자 제작 요청 카드(같은 사람 여러 건 = 한 장) · 내부검토 요청·파트너 제출 = PM 검토 카드 ·
//          올린 카드는 기록(항목·받는 사람·ts) · 발주처 결정 = 담당자+PM 멘션 줄 + 공유 코멘트 인용 · 시안 올림은 멘션 없음
//   ⑤ 실패: 봇 오류는 failed + 한국어 사유, 카드 기록 없음 · 테스트 보내기의 오류 문구(채널에 앱 추가)
//   ⑥ 버튼: 서명(위조·5분 밖 401 · 비밀 없음 503) · 멘션된 사람 → 카드 교체(버튼 → ✓ 확인함) · 다른 사람 → 나만 보기 안내 ·
//          주소록에 Slack ID 없으면 이메일로 찾아 적어 둔다 · 이미 확인 · 응답 주소는 hooks.slack.com만
//   ⑦ 리마인드: 24시간 미확인 = 원래 카드 링크 + 멘션 · 항목 마감 D-1 = 담당자
//   ⑧ 금액·이메일 비노출 · 봇 비밀은 서버 전용 · 서버가 요청하는 곳은 slack.com/api · hooks.slack.com뿐
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ackedBlocks, cardMessage, dueText, mentionText } from '../../api/_lib/notify/cards'
import { eventUnits, reminderUnits, routeThread, type EventRow, type ReminderRow } from '../../api/_lib/notify/format'
import { handleNotifyRequest, renderLine, threadFor, type NotifyEnv } from '../../api/_lib/notify/handler'
import { handleSlackInteract, keyVisualAgreedLine, verifySlackSignature } from '../../api/_lib/notify/interact'
import type { AckResult, CardRecord, NotifyStore } from '../../api/_lib/notify/store'
import { normalizeSlackThreadLink, parseSlackThreadLink, slackMessageLink } from '../lib/slackThread'

const BASE = 'https://app.example.com'
const P1 = '11111111-1111-4111-8111-111111111111'
const D1 = '33333333-3333-4333-8333-333333333333'
const D2 = '44444444-4444-4444-8444-444444444444'
const THREAD = 'https://acme.slack.com/archives/C0PROJ001/p1727251234567890'
const HOOK = 'https://hooks.slack.com/services/TPRJ/BPRJ/project-secret'
const TOKEN = 'xoxb-test-token'
const SECRET = 'signing-secret-for-tests'
const NOW = Date.parse('2026-09-25T05:10:00Z') // KST 9/25(금) 14:10

const PM = { id: 'p-pm', name: '박피엠', email: 'pm@example.com', slack_user_id: 'U0PM00001' }
const DESIGN = { id: 'p-design', name: '이디자', email: 'design@example.com', slack_user_id: null }
const OPS = { id: 'p-ops', name: '최운영', email: 'ops@example.com', slack_user_id: null }

function event(over: Partial<EventRow> & { key: string; action: string }): EventRow {
  return {
    project_id: P1,
    project_code: 'VST26',
    project_name: '가상 서밋 2026',
    webhook: null,
    thread: THREAD,
    deliverable_id: D1,
    title: '메인 무대 백월',
    area: 'design',
    ...over,
  }
}

interface SlackCall {
  url: string
  method: string | null
  body: Record<string, unknown>
}

function fakeSlack(opts: { fail?: string; emails?: Record<string, string>; users?: Record<string, string> } = {}) {
  const calls: SlackCall[] = []
  let ts = 1000
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    const raw = String(init?.body ?? '')
    const ct = new Headers(init?.headers).get('content-type') ?? ''
    const body = ct.includes('x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : raw ? JSON.parse(raw) : {}
    const method = u.startsWith('https://slack.com/api/') ? u.slice('https://slack.com/api/'.length) : null
    calls.push({ url: u, method, body })
    if (method === 'chat.postMessage') {
      if (opts.fail) return Response.json({ ok: false, error: opts.fail })
      ts += 1
      return Response.json({ ok: true, ts: `1727251300.00${ts}`, channel: body.channel })
    }
    if (method === 'users.lookupByEmail') {
      const id = opts.emails?.[String(body.email)]
      return Response.json(id ? { ok: true, user: { id } } : { ok: false, error: 'users_not_found' })
    }
    if (method === 'users.info') {
      const email = opts.users?.[String(body.user)]
      return Response.json(email ? { ok: true, user: { id: body.user, profile: { email } } } : { ok: false, error: 'user_not_found' })
    }
    return new Response('ok', { status: 200 })
  }) as typeof fetch
  return { calls, fetchImpl, posts: () => calls.filter((c) => c.method === 'chat.postMessage') }
}

function fakeStore(opts: { events?: EventRow[]; reminders?: ReminderRow[]; project?: { thread?: string | null; webhook?: string | null; design_thread?: string | null } } = {}) {
  const marks: { keys: string[]; status: string; error?: string | null }[] = []
  const cards: CardRecord[] = []
  const slackIds: Record<string, string> = {}
  const acks: { card: string; profile: string | null }[] = []
  let events = opts.events ?? []
  let reminders = opts.reminders ?? []
  const people = [PM, DESIGN, OPS]
  let ackResult: (card: string, profile: string | null) => AckResult = () => ({ status: 'not_found' })
  const store: NotifyStore = {
    async claimEvents() {
      const out = events
      events = []
      return out
    },
    async claimReminders() {
      const out = reminders
      reminders = []
      return out
    },
    async claimManual() {
      return null
    },
    async claimRelay() {
      return null
    },
    async markRelayed() {},
    async mark(keys, status, error) {
      marks.push({ keys, status, error })
    },
    async authProfile(jwt) {
      return jwt === 'jwt-pm' ? { id: 'p-pm', app_role: 'sales' as const } : null
    },
    async memberRole(profileId) {
      return profileId === 'p-pm' ? 'pm' : null
    },
    async tokenActive() {
      return false
    },
    async project(id) {
      return id === P1 ? { code: 'VST26', name: '가상 서밋 2026', webhook: opts.project?.webhook ?? null, thread: opts.project?.thread ?? THREAD, design_thread: opts.project?.design_thread ?? null } : null
    },
    async setSlackUser(profileId, slackUserId) {
      slackIds[profileId] ??= slackUserId
    },
    async recordCard(card) {
      cards.push(card)
      return card.rows.length
    },
    async ackCard(cardId, profileId) {
      acks.push({ card: cardId, profile: profileId })
      return ackResult(cardId, profileId)
    },
    async profileBySlack(slackUserId) {
      const hit = people.find((p) => p.slack_user_id === slackUserId || slackIds[p.id] === slackUserId)
      return hit ? { id: hit.id, name: hit.name } : null
    },
    async profileByEmail(email) {
      const hit = people.find((p) => p.email === email.toLowerCase())
      return hit ? { id: hit.id, name: hit.name } : null
    },
  }
  return { store, marks, cards, slackIds, acks, setAck: (f: typeof ackResult) => (ackResult = f) }
}

const env = (over: Partial<NotifyEnv> = {}): NotifyEnv => ({ SLACK_BOT_TOKEN: TOKEN, CRON_SECRET: 'c', ...over })

async function drain(s: ReturnType<typeof fakeStore>, slack: ReturnType<typeof fakeSlack>, e: NotifyEnv = env()) {
  const r = await handleNotifyRequest(
    new Request(`${BASE}/api/notify`, { method: 'POST', headers: { authorization: 'Bearer jwt-pm' }, body: JSON.stringify({ action: 'drain' }) }),
    e,
    { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW },
  )
  return r.json()
}

describe('DoD 79 · ① 행사 스레드 링크', () => {
  it('세 모양을 읽는다 — 첫 글 링크 · 답글 링크(thread_ts가 스레드) · 브라우저 주소', () => {
    expect(parseSlackThreadLink(THREAD)).toEqual({ channel: 'C0PROJ001', thread_ts: '1727251234.567890' })
    expect(parseSlackThreadLink('https://acme.slack.com/archives/C0PROJ001/p1727259999000100?thread_ts=1727251234.567890&cid=C0PROJ001')).toEqual({
      channel: 'C0PROJ001',
      thread_ts: '1727251234.567890',
    })
    expect(parseSlackThreadLink('https://app.slack.com/client/T0TEAM/C0PROJ001/thread/C0PROJ001-1727251234.567890')).toEqual({
      channel: 'C0PROJ001',
      thread_ts: '1727251234.567890',
    })
    expect(parseSlackThreadLink('  https://acme.slack.com/archives/G0PRIV001/p1727251234567890  ')?.channel).toBe('G0PRIV001')
  })

  it('거부 — DM 채널 · 채널 링크만 · 다른 호스트 · http · 빈 칸', () => {
    for (const bad of [
      'https://acme.slack.com/archives/D0DMCHAN1/p1727251234567890',
      'https://acme.slack.com/archives/C0PROJ001',
      'https://acme.slack.com.evil.com/archives/C0PROJ001/p1727251234567890',
      'https://evil.com/archives/C0PROJ001/p1727251234567890',
      'http://acme.slack.com/archives/C0PROJ001/p1727251234567890',
      'https://acme.slack.com/archives/C0PROJ001/p123',
      'not a url',
    ]) {
      expect(parseSlackThreadLink(bad), bad).toBeNull()
    }
    expect(normalizeSlackThreadLink('')).toBeNull()
    expect(normalizeSlackThreadLink('https://x.com')).toBe('invalid')
    expect(normalizeSlackThreadLink(` ${THREAD} `)).toBe(THREAD)
  })

  it('카드 링크 = 스레드 워크스페이스 주소 + 답글 ts', () => {
    expect(slackMessageLink(THREAD, 'C0PROJ001', '1727251300.001001', '1727251234.567890')).toBe(
      'https://acme.slack.com/archives/C0PROJ001/p1727251300001001?thread_ts=1727251234.567890&cid=C0PROJ001',
    )
    expect(slackMessageLink('https://app.slack.com/client/T/C0PROJ001/thread/C0PROJ001-1727251234.567890', 'C0PROJ001', '1.000001')).toBe(
      'https://slack.com/archives/C0PROJ001/p1000001',
    )
  })
})

describe('DoD 79 · ② 보낼 곳 — 스레드(봇) → 웹훅 → 없음', () => {
  it('봇 토큰이 있어야 스레드로 — 없으면 null(웹훅으로)', () => {
    expect(threadFor(THREAD, env())).toEqual({ channel: 'C0PROJ001', thread_ts: '1727251234.567890' })
    expect(threadFor(THREAD, env({ SLACK_BOT_TOKEN: '' }))).toBeNull()
    expect(threadFor('https://x.com', env())).toBeNull()
  })

  it('스레드가 있으면 모든 글이 그 스레드의 답글(thread_ts) · 봇 토큰으로 · 웹훅 호출 0', async () => {
    const s = fakeStore({ events: [event({ key: 'act:1', action: 'version.uploaded', version_no: 2, webhook: HOOK })] })
    const slack = fakeSlack()
    expect(await drain(s, slack)).toMatchObject({ sent: 1, messages: 1 })
    expect(slack.calls).toHaveLength(1)
    expect(slack.calls[0]).toMatchObject({ method: 'chat.postMessage', body: { channel: 'C0PROJ001', thread_ts: '1727251234.567890', unfurl_links: false } })
    expect(String(slack.calls[0].body.text)).toContain('[가상 서밋 2026] [시안] 메인 무대 백월 v2')
  })

  it('봇 토큰이 없으면 같은 사건이 웹훅으로(카드 대신 줄) · 둘 다 없으면 skipped', async () => {
    const s = fakeStore({ events: [event({ key: 'act:1', action: 'deliverable.requested', webhook: HOOK, recipients: [DESIGN], assignee_name: '이디자' })] })
    const slack = fakeSlack()
    await drain(s, slack, env({ SLACK_BOT_TOKEN: undefined }))
    expect(slack.calls).toHaveLength(1)
    expect(slack.calls[0].url).toBe(HOOK)
    expect(Object.keys(slack.calls[0].body).sort()).toEqual(['text', 'unfurl_links', 'unfurl_media'])
    expect(s.cards).toHaveLength(0)
    const none = fakeStore({ events: [event({ key: 'act:2', action: 'version.uploaded', thread: null })] })
    const slack2 = fakeSlack()
    expect(await drain(none, slack2, env({ SLACK_BOT_TOKEN: undefined }))).toMatchObject({ skipped: 1 })
    expect(slack2.calls).toHaveLength(0)
  })
})

describe('DoD 79 · ③ 멘션', () => {
  it('Slack ID → <@U…> · 봇 경로에서 못 찾은 사람은 이름(Slack 미연결) · 웹훅은 아는 ID만', () => {
    expect(mentionText([PM, DESIGN])).toBe('<@U0PM00001> 이디자(Slack 미연결)')
    expect(mentionText([PM, DESIGN], false)).toBe('<@U0PM00001>')
    expect(mentionText([PM, PM])).toBe('<@U0PM00001>')
    expect(mentionText([{ id: 'x', name: '<!channel>' }])).toBe('&lt;!channel&gt;(Slack 미연결)')
    expect(renderLine({ keys: [], line: '[X] 줄', webhook: null, mentions: [PM], quote: '로고를\n줄여 주세요' }, true)).toBe('<@U0PM00001> [X] 줄\n>로고를\n>줄여 주세요')
  })

  it('주소록에 ID가 없으면 이메일로 찾아 적어 두고(같은 사람은 한 번만 묻는다) 멘션한다', async () => {
    const s = fakeStore({
      events: [
        event({ key: 'act:1', action: 'approval.decided', decision: 'approved', recipients: [DESIGN, PM] }),
        event({ key: 'act:2', action: 'approval.decided', decision: 'approved', deliverable_id: D2, title: '등록데스크 배너', recipients: [DESIGN, PM] }),
      ],
    })
    const slack = fakeSlack({ emails: { 'design@example.com': 'U0DESIGN1' } })
    await drain(s, slack)
    expect(slack.calls.filter((c) => c.method === 'users.lookupByEmail')).toHaveLength(1)
    expect(s.slackIds).toEqual({ 'p-design': 'U0DESIGN1' })
    const text = String(slack.posts()[0].body.text)
    expect(text.split('\n')).toEqual([
      `<@U0DESIGN1> <@U0PM00001> [가상 서밋 2026] [확정] 메인 무대 백월 — 발주처 승인 (<${BASE}/items/${D1}?project=${P1}|열기>)`,
      `<@U0DESIGN1> <@U0PM00001> [가상 서밋 2026] [확정] 등록데스크 배너 — 발주처 승인 (<${BASE}/items/${D2}?project=${P1}|열기>)`,
    ])
  })

  it('이메일로도 못 찾으면 이름(Slack 미연결) — 오류 없이 보낸다', async () => {
    const s = fakeStore({ events: [event({ key: 'act:1', action: 'approval.decided', decision: 'changes_requested', recipients: [OPS], client_comment: '로고 크기를 한 단계 줄여 주세요.' })] })
    const slack = fakeSlack()
    expect(await drain(s, slack)).toMatchObject({ sent: 1, failed: 0 })
    expect(String(slack.posts()[0].body.text)).toMatch(/^최운영\(Slack 미연결\) \[가상 서밋 2026\] \[피드백\] 메인 무대 백월 — 발주처 수정요청 .*\n>로고 크기를 한 단계 줄여 주세요\.$/)
    expect(s.slackIds).toEqual({})
  })

  it('시안 올림·컨펌 발송은 멘션 없음', () => {
    const units = eventUnits(
      [event({ key: 'a', action: 'version.uploaded', recipients: [PM] }), event({ key: 'b', action: 'approval.requested', recipients: [PM] })],
      BASE + '/',
    )
    expect(units.every((u) => !u.mentions?.length && !u.card)).toBe(true)
  })
})

describe('DoD 79 · ④ 의뢰 카드', () => {
  it('새 지시 → 담당자 제작 요청 카드: 멘션 · 마감·규격·종류·위치 · 가이드 인용 · 버튼(확인했어요 = 카드 id · 앱에서 열기) → 기록', async () => {
    const s = fakeStore({
      events: [
        event({
          key: 'act:10',
          action: 'deliverable.requested',
          recipients: [DESIGN],
          assignee_name: '이디자',
          actor_name: '박피엠',
          due_date: '2026-10-02',
          spec_size: '23000×5000mm',
          spec_qty: 1,
          spec_type: '현수막',
          spec_location: '그랜드볼룸 무대 뒤',
          brief: '행사 로고와 슬로건을 중앙에',
          brief_ref_count: 2,
        }),
      ],
    })
    const slack = fakeSlack({ emails: { 'design@example.com': 'U0DESIGN1' } })
    expect(await drain(s, slack)).toMatchObject({ sent: 1, messages: 1 })
    const post = slack.posts()[0].body
    expect(post).toMatchObject({ channel: 'C0PROJ001', thread_ts: '1727251234.567890' })
    expect(post.text).toBe('<@U0DESIGN1> [가상 서밋 2026] [의뢰] 메인 무대 백월 — 제작 요청 · 마감 10/2 (금)')
    const json = JSON.stringify(post.blocks)
    expect(json).toContain('<@U0DESIGN1> [의뢰] 새 제작 요청이에요 · 요청 박피엠')
    for (const t of ['*마감*\\n10/2 (금) · 7일 남음', '*규격*\\n23000×5000mm · 1개', '*종류*\\n현수막', '*위치*\\n그랜드볼룸 무대 뒤', '>행사 로고와 슬로건을 중앙에', '참고 자료 2개 · 전문은 앱에서']) {
      expect(json).toContain(t)
    }
    const actions = (post.blocks as { type: string; block_id?: string; elements?: { action_id: string; value?: string; url?: string; style?: string }[] }[]).find((b) => b.type === 'actions')!
    expect(actions.block_id).toBe('ack')
    expect(actions.elements!.map((e) => e.action_id)).toEqual(['ack', 'open'])
    expect(actions.elements![0].style).toBe('primary')
    expect(s.cards).toHaveLength(1)
    expect(actions.elements![0].value).toBe(s.cards[0].card_id)
    expect(actions.elements![1].url).toBe(`${BASE}/items/${D1}?project=${P1}`)
    expect(s.cards[0]).toMatchObject({
      project_id: P1,
      rows: [{ deliverable_id: D1, kind: 'work', notify_key: 'act:10' }],
      recipient_ids: ['p-design'],
      channel: 'C0PROJ001',
      thread_ts: '1727251234.567890',
    })
    expect(s.cards[0].message_ts).toMatch(/^1727251300\./)
  })

  it('같은 사람의 새 지시 여러 건 = 카드 한 장(마감 이른 순 · n건 모두 확인) · 다른 사람은 따로', () => {
    const units = eventUnits(
      [
        event({ key: 'a', action: 'deliverable.requested', title: '명찰', due_date: '2026-10-08', recipients: [DESIGN] }),
        event({ key: 'b', action: 'deliverable.requested', deliverable_id: D2, title: '백월', due_date: '2026-10-02', recipients: [DESIGN] }),
        event({ key: 'c', action: 'deliverable.requested', title: '동선도', area: 'ops', recipients: [OPS] }),
      ],
      BASE + '/',
    )
    expect(units).toHaveLength(2)
    expect(units[0].keys).toEqual(['a', 'b'])
    const msg = cardMessage(units[0].card!, units[0].mentions!, 'card-1', NOW)
    const json = JSON.stringify(msg.blocks)
    expect(json).toContain('새 제작 요청 2건이에요')
    expect(json.indexOf('백월')).toBeLessThan(json.indexOf('명찰'))
    expect(json).toContain('2건 모두 확인했어요')
    expect(json).toContain('디자인 보드 열기')
  })

  it('내부검토 요청 → PM 검토 카드(버전·메모·파일·마감) · 파트너 제출 → 파트너 이름', () => {
    const [review, partner] = eventUnits(
      [
        event({ key: 'r', action: 'status.transitioned', recipients: [PM], actor_name: '이디자', version_no: 2, version_note: '띠 높이를 줄였습니다', file_name: '260925_VST26_백월_v2.pdf', due_date: '2026-10-02' }),
        event({ key: 'p', action: 'partner.submitted', recipients: [PM], partner_name: '가상골드플랫폼', version_no: 1, title: '부스 그래픽' }),
      ],
      BASE + '/',
    )
    expect(review.line).toContain('[가상 서밋 2026] [검토요청] 메인 무대 백월 v2 — 내부검토 요청 · 이디자')
    const r = cardMessage(review.card!, review.mentions!, 'c1', NOW)
    expect(r.text).toBe('<@U0PM00001> [가상 서밋 2026] [검토요청] 메인 무대 백월 v2 — 검토 요청 · 이디자')
    const rj = JSON.stringify(r.blocks)
    for (const t of ['[검토요청] 검토 요청이에요 · 보낸 사람 이디자', '>띠 높이를 줄였습니다', '`260925_VST26_백월_v2.pdf`', '10/2 (금) · 7일 남음', '검토하러 가기']) expect(rj).toContain(t)
    const p = cardMessage(partner.card!, partner.mentions!, 'c2', NOW)
    expect(p.text).toBe('<@U0PM00001> [가상 서밋 2026] [제작] 부스 그래픽 v1 — 파트너 제출 · 가상골드플랫폼')
    expect(JSON.stringify(p.blocks)).toContain('[제작] 파트너 제출물이 왔어요 · 가상골드플랫폼')
  })

  it('다른 상태 전이는 사건 목록에 와도 알리지 않는다(줄 없음 → skipped)', () => {
    const [u] = eventUnits([event({ key: 'x', action: 'deliverable.finalized' })], BASE + '/')
    expect(u.line).toBeNull()
  })

  it('기한 표기: 남음 · 오늘 · 지남(KST)', () => {
    expect(dueText('2026-09-25', NOW)).toBe('9/25 (금) · 오늘')
    expect(dueText('2026-09-23', NOW)).toBe('9/23 (수) · 2일 지남')
    expect(dueText(null, NOW)).toBeNull()
  })
})

describe('DoD 79 · ⑤ 실패해도 막지 않는다', () => {
  it('봇 오류 → failed + 한국어 사유 · 카드 기록 없음', async () => {
    const s = fakeStore({ events: [event({ key: 'act:1', action: 'deliverable.requested', recipients: [PM] })] })
    const slack = fakeSlack({ fail: 'not_in_channel' })
    expect(await drain(s, slack)).toMatchObject({ failed: 1, sent: 0 })
    expect(s.marks[0]).toMatchObject({ keys: ['act:1'], status: 'failed' })
    expect(s.marks[0].error).toContain('에이전트 및 앱 → 앱 추가')
    expect(s.cards).toHaveLength(0)
  })

  it('테스트 보내기: 스레드면 봇으로 그 스레드에 · 봇이 채널에 없으면 502 + 초대 안내', async () => {
    const s = fakeStore()
    const call = (slack: ReturnType<typeof fakeSlack>) =>
      handleNotifyRequest(
        new Request(`${BASE}/api/notify`, { method: 'POST', headers: { authorization: 'Bearer jwt-pm' }, body: JSON.stringify({ action: 'test', project_id: P1 }) }),
        env(),
        { store: s.store, fetchImpl: slack.fetchImpl },
      )
    const ok = fakeSlack()
    expect(await (await call(ok)).json()).toEqual({ sent: true, channel: 'thread' })
    expect(ok.posts()[0].body).toMatchObject({ channel: 'C0PROJ001', thread_ts: '1727251234.567890', text: '[가상 서밋 2026] 알림 테스트 — 이 행사의 알림이 이 스레드로 옵니다.' })
    const bad = await call(fakeSlack({ fail: 'not_in_channel' }))
    expect(bad.status).toBe(502)
    expect((await bad.json()).error.message).toContain('에이전트 및 앱 → 앱 추가')
  })

  it('상태: 봇 토큰 유무만 알린다(값 없음)', async () => {
    const r = await handleNotifyRequest(new Request(`${BASE}/api/notify`), env(), { store: fakeStore().store })
    const body = await r.json()
    expect(body).toEqual({ slack: false, bot: true, cron: true })
    expect(JSON.stringify(body)).not.toContain('xoxb')
  })
})

function signed(payload: unknown, opts: { secret?: string; at?: number } = {}) {
  const raw = `payload=${encodeURIComponent(JSON.stringify(payload))}`
  const ts = String(Math.floor((opts.at ?? NOW) / 1000))
  const sig = `v0=${createHmac('sha256', opts.secret ?? SECRET).update(`v0:${ts}:${raw}`).digest('hex')}`
  return new Request(`${BASE}/api/slack-interact`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': ts, 'x-slack-signature': sig },
    body: raw,
  })
}

const RESPONSE_URL = 'https://hooks.slack.com/actions/T0/1/abc'
const CARD_ID = '55555555-5555-4555-8555-555555555555'
function ackPayload(user: string, over: Record<string, unknown> = {}) {
  const card = cardMessage(
    { kind: 'work', project_code: 'VST26', project_name: '가상 서밋 2026', area: 'design', requester: '박피엠', board_url: null, items: [{ deliverable_id: D1, notify_key: 'k', title: '메인 무대 백월', url: `${BASE}/items/${D1}` }] },
    [{ ...DESIGN, slack_user_id: 'U0DESIGN1' }],
    CARD_ID,
    NOW,
  )
  return {
    type: 'block_actions',
    user: { id: user },
    actions: [{ action_id: 'ack', value: CARD_ID }],
    response_url: RESPONSE_URL,
    message: { text: card.text, blocks: card.blocks },
    ...over,
  }
}

describe('DoD 79 · ⑥ 버튼 — 확인했어요', () => {
  const ienv = { SLACK_SIGNING_SECRET: SECRET, SLACK_BOT_TOKEN: TOKEN }

  it('서명: 맞으면 통과 · 위조·5분 밖·비밀 없음은 거부', async () => {
    expect(verifySlackSignature(SECRET, '1', 'v0=x', 'b', 1000)).toBe(false)
    const s = fakeStore()
    const slack = fakeSlack()
    const deps = { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW }
    expect((await handleSlackInteract(signed(ackPayload('U0DESIGN1'), { secret: 'wrong' }), ienv, deps)).status).toBe(401)
    expect((await handleSlackInteract(signed(ackPayload('U0DESIGN1'), { at: NOW - 6 * 60_000 }), ienv, deps)).status).toBe(401)
    expect((await handleSlackInteract(signed(ackPayload('U0DESIGN1')), {}, deps)).status).toBe(503)
    expect(s.acks).toHaveLength(0)
  })

  it('멘션된 사람 → 기록 + 카드 교체: 확인했어요 버튼이 빠지고 "✓ 이디자 확인함 · 시각", 앱 링크는 남는다', async () => {
    const s = fakeStore()
    s.setAck((_c, profile) => (profile === 'p-design' ? { status: 'ok', by: '이디자', at: '2026-09-25T05:34:00Z', count: 1 } : { status: 'not_recipient', names: ['이디자'] }))
    s.store.profileBySlack = async (id) => (id === 'U0DESIGN1' ? { id: 'p-design', name: '이디자' } : null)
    const slack = fakeSlack()
    const r = await handleSlackInteract(signed(ackPayload('U0DESIGN1')), ienv, { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW })
    expect(r.status).toBe(200)
    expect(s.acks).toEqual([{ card: CARD_ID, profile: 'p-design' }])
    const resp = slack.calls.find((c) => c.url === RESPONSE_URL)!
    expect(resp.body.replace_original).toBe(true)
    const json = JSON.stringify(resp.body.blocks)
    expect(json).toContain('✓ 이디자 확인함 · 9/25 오후 2:34')
    expect(json).not.toContain('"action_id":"ack"')
    expect(json).toContain('"action_id":"open"')
  })

  it('다른 사람이 누르면 그 사람에게만 안내(카드는 그대로) · 이미 확인됐으면 누가 언제', async () => {
    const s = fakeStore()
    s.setAck(() => ({ status: 'not_recipient', names: ['이디자'] }))
    const slack = fakeSlack()
    await handleSlackInteract(signed(ackPayload('U0PM00001')), ienv, { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW })
    const eph = slack.calls.find((c) => c.url === RESPONSE_URL)!
    expect(eph.body).toMatchObject({ response_type: 'ephemeral', replace_original: false, text: '이 요청은 이디자 님이 확인할 요청이에요. 카드는 그대로 둡니다.' })
    s.setAck(() => ({ status: 'already', by: '이디자', at: '2026-09-25T05:34:00Z' }))
    const slack2 = fakeSlack()
    await handleSlackInteract(signed(ackPayload('U0PM00001')), ienv, { store: s.store, fetchImpl: slack2.fetchImpl, now: () => NOW })
    expect(slack2.calls.find((c) => c.url === RESPONSE_URL)!.body.text).toBe('이미 이디자 님이 9/25 오후 2:34에 확인했어요.')
  })

  it('주소록에 Slack ID가 없으면 봇으로 이메일을 물어 찾고 적어 둔다 · 못 찾으면 주소록 안내', async () => {
    const s = fakeStore()
    s.setAck((_c, p) => (p === 'p-ops' ? { status: 'ok', by: '최운영', at: '2026-09-25T05:40:00Z', count: 1 } : { status: 'not_recipient', names: [] }))
    const slack = fakeSlack({ users: { U0OPS0001: 'ops@example.com' } })
    await handleSlackInteract(signed(ackPayload('U0OPS0001')), ienv, { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW })
    expect(slack.calls.some((c) => c.method === 'users.info')).toBe(true)
    expect(s.slackIds).toEqual({ 'p-ops': 'U0OPS0001' })
    expect(s.acks).toEqual([{ card: CARD_ID, profile: 'p-ops' }])
    const slack2 = fakeSlack()
    await handleSlackInteract(signed(ackPayload('U0STRANGER')), ienv, { store: s.store, fetchImpl: slack2.fetchImpl, now: () => NOW })
    expect(String(slack2.calls.find((c) => c.url === RESPONSE_URL)!.body.text)).toContain('주소록에서 이 Slack 계정을 찾지 못했어요')
  })

  it('응답 주소가 hooks.slack.com이 아니면 보내지 않는다 · 링크 버튼(open)은 200만', async () => {
    const s = fakeStore()
    s.setAck(() => ({ status: 'not_found' }))
    const slack = fakeSlack()
    await handleSlackInteract(signed(ackPayload('U0PM00001', { response_url: 'https://evil.example.com/x' })), ienv, { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW })
    expect(slack.calls.filter((c) => c.url.includes('evil'))).toHaveLength(0)
    const slack2 = fakeSlack()
    const open = await handleSlackInteract(signed(ackPayload('U0PM00001', { actions: [{ action_id: 'open' }] })), ienv, { store: s.store, fetchImpl: slack2.fetchImpl, now: () => NOW })
    expect(open.status).toBe(200)
    expect(slack2.calls).toHaveLength(0)
  })

  it('ackedBlocks: 확인 표시는 한 번 · 버튼 줄이 없던 카드에도 끝에 붙는다', () => {
    const out = ackedBlocks([{ type: 'section' }], '박피엠', NOW)
    expect(JSON.stringify(out)).toContain('✓ 박피엠 확인함 · 9/25 오후 2:10')
    expect(out).toHaveLength(2)
  })
})

describe('DoD 79 · ⑦ 리마인드', () => {
  it('24시간 미확인 = 원래 카드 링크 + 받는 사람 멘션 · 항목 마감 D-1 = 담당자', () => {
    const units = reminderUnits(
      [
        { key: 'rem:unacked:x', kind: 'unacked', project_id: P1, project_code: 'VST26', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, title: '현장 동선도', count: 1, request_kind: 'work', channel_id: 'C0PROJ001', message_ts: '1727251300.001001', thread_ts: '1727251234.567890', recipients: [OPS] },
        { key: 'rem:due:y', kind: 'deliverable_due', project_id: P1, project_code: 'VST26', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, deliverable_id: D1, title: '메인 무대 백월', recipients: [DESIGN] },
      ],
      BASE + '/',
    )
    expect(units[0].line).toBe(
      '[가상 서밋 2026] [제작] 현장 동선도 — 어제 제작 요청을 아직 확인하지 않았어요 (<https://acme.slack.com/archives/C0PROJ001/p1727251300001001?thread_ts=1727251234.567890&cid=C0PROJ001|요청 카드>)',
    )
    expect(units[0].mentions).toEqual([OPS])
    expect(units[1].line).toContain('[가상 서밋 2026] [제작] 메인 무대 백월 — 마감 D-1')
    expect(units[1].mentions).toEqual([DESIGN])
    expect(units.every((u) => u.thread === THREAD)).toBe(true)
  })
})


const DESIGN_THREAD = 'https://acme.slack.com/archives/C0DESIGN1/p1727260000123456'
const OPS_ITEM = { deliverable_id: D2, title: '현장 동선도', area: 'ops' }

describe('DoD 87 · 스레드 2개 + 프로토콜 태그 (Phase 6.3 [B2] · 설계서 v2.17.1 §9)', () => {
  it('보낼 스레드: design 영역 + 디자인 스레드 → 디자인 스레드 · 그 밖·디자인 스레드 없음 → 운영 스레드 · 컨펌 기한 D-1·미등록 파일은 늘 운영', () => {
    expect(routeThread({ thread: THREAD, design_thread: DESIGN_THREAD, area: 'design' })).toBe(DESIGN_THREAD)
    expect(routeThread({ thread: THREAD, design_thread: DESIGN_THREAD, area: 'ops' })).toBe(THREAD)
    expect(routeThread({ thread: THREAD, design_thread: null, area: 'design' })).toBe(THREAD)
    expect(routeThread({ thread: THREAD, design_thread: 'https://x.com', area: 'design' })).toBe(THREAD)
    expect(routeThread({ thread: THREAD, design_thread: DESIGN_THREAD, area: 'design' }, true)).toBe(THREAD)
    const rem = reminderUnits(
      [
        { key: 'a', kind: 'approval_due', project_id: P1, project_code: 'V', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, design_thread: DESIGN_THREAD, area: 'design', deliverable_id: D1, title: '메인 무대 백월' },
        { key: 'b', kind: 'deliverable_due', project_id: P1, project_code: 'V', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, design_thread: DESIGN_THREAD, area: 'design', deliverable_id: D1, title: '메인 무대 백월' },
        { key: 'c', kind: 'milestone_due', project_id: P1, project_code: 'V', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, design_thread: DESIGN_THREAD, area: 'design', title: '인쇄 발주' },
        { key: 'd', kind: 'inbox_digest', project_id: P1, project_code: 'V', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, design_thread: DESIGN_THREAD, count: 2 },
        { key: 'e', kind: 'unacked', project_id: P1, project_code: 'V', project_name: '가상 서밋 2026', webhook: null, thread: THREAD, design_thread: DESIGN_THREAD, area: 'design', title: '메인 무대 백월', count: 1, request_kind: 'work', channel_id: 'C0DESIGN1', message_ts: '1727260000.200000', thread_ts: '1727260000.123456' },
      ],
      BASE + '/',
    )
    expect(rem.map((u) => u.thread)).toEqual([THREAD, DESIGN_THREAD, DESIGN_THREAD, THREAD, DESIGN_THREAD])
    expect(rem[0].line).toContain('[결정] 메인 무대 백월 — 컨펌 기한 D-1')
    expect(rem[1].line).toContain('[일정] 메인 무대 백월 — 마감 D-1')
    expect(rem[2].line).toContain('[일정] 인쇄 발주 — 마일스톤 D-1')
    expect(rem[4].line).toContain('[의뢰] 메인 무대 백월 — 어제 제작 요청을 아직 확인하지 않았어요')
    expect(rem[4].line).toContain('https://acme.slack.com/archives/C0DESIGN1/p1727260000200000?thread_ts=1727260000.123456&cid=C0DESIGN1')
  })

  it('태그 어휘: 디자인 = [의뢰][시안][검토요청][피드백][확정][납품] · 운영·공통 = [제작][결정] · 카드 머리에도', () => {
    const base = BASE + '/'
    const d = (over: Partial<EventRow> & { key: string; action: string }) => event({ design_thread: DESIGN_THREAD, ...over })
    const design = eventUnits(
      [
        d({ key: '1', action: 'deliverable.requested', recipients: [DESIGN], assignee_name: '이디자' }),
        d({ key: '2', action: 'version.uploaded', version_no: 2, actor_name: '이디자' }),
        d({ key: '3', action: 'status.transitioned', version_no: 2, recipients: [PM] }),
        d({ key: '4', action: 'approval.requested', version_no: 2, due_at: '2026-10-01T00:00:00Z' }),
        d({ key: '5', action: 'approval.decided', decision: 'changes_requested', recipients: [DESIGN, PM] }),
        d({ key: '6', action: 'drive.snapshot_copied', version_no: 3 }),
      ],
      base,
    )
    const lines = design.filter((u) => u.keys.length).map((u) => u.line!.split(' (<')[0])
    expect(lines).toEqual([
      '[가상 서밋 2026] [시안] 메인 무대 백월 v2 · 이디자',
      '[가상 서밋 2026] [검토요청] 메인 무대 백월 v2 — 내부검토 요청',
      '[가상 서밋 2026] [검토요청] 메인 무대 백월 v2 — 발주처 컨펌 발송 · 기한 10/1',
      '[가상 서밋 2026] [피드백] 메인 무대 백월 — 발주처 수정요청',
      '[가상 서밋 2026] [납품] 메인 무대 백월 v3 — 확정본 저장(납품 폴더)',
      '[가상 서밋 2026] [의뢰] 메인 무대 백월 — 제작 요청 → 이디자',
    ])
    expect(design.filter((u) => u.keys.length).every((u) => u.thread === DESIGN_THREAD)).toBe(true)
    const ops = eventUnits(
      [
        event({ key: '1', action: 'deliverable.requested', ...OPS_ITEM, recipients: [OPS], assignee_name: '최운영' }),
        event({ key: '2', action: 'version.uploaded', ...OPS_ITEM, version_no: 1 }),
        event({ key: '3', action: 'approval.requested', ...OPS_ITEM }),
        event({ key: '4', action: 'approval.decided', ...OPS_ITEM, decision: 'approved', recipients: [OPS, PM] }),
        event({ key: '5', action: 'status.transitioned', ...OPS_ITEM, recipients: [PM] }),
      ],
      base,
    )
    expect(ops.map((u) => u.line!.split(' (<')[0])).toEqual([
      '[가상 서밋 2026] [제작] 현장 동선도 v1 새 버전',
      '[가상 서밋 2026] [제작] 현장 동선도 — 발주처 컨펌 발송',
      '[가상 서밋 2026] [결정] 현장 동선도 — 발주처 승인',
      '[가상 서밋 2026] [제작] 현장 동선도 — 내부검토 요청',
      '[가상 서밋 2026] [제작] 현장 동선도 — 제작 요청 → 최운영',
    ])
    expect(ops.every((u) => u.thread === THREAD)).toBe(true)
    const work = cardMessage(ops[4].card!, [OPS], 'c', NOW)
    expect(work.text).toBe('최운영(Slack 미연결) [가상 서밋 2026] [제작] 현장 동선도 — 제작 요청')
    expect(JSON.stringify(work.blocks)).toContain('[제작] 새 제작 요청이에요')
    const review = cardMessage(ops[3].card!, [PM], 'c', NOW)
    expect(review.text).toBe('<@U0PM00001> [가상 서밋 2026] [제작] 현장 동선도 — 검토 요청')
  })

  it('운영 스레드 [키비주얼] 3줄 중 확정·납품: 디자인 스레드가 따로 있을 때만 · 멘션 없음 · 선점 키 없음 · 스레드로 못 보내면 웹훅으로 흘리지 않음', async () => {
    const s = fakeStore({
      events: [
        event({ key: 'act:1', action: 'approval.decided', decision: 'approved', version_no: 2, recipients: [DESIGN, PM], design_thread: DESIGN_THREAD }),
        event({ key: 'act:2', action: 'drive.snapshot_copied', version_no: 2, design_thread: DESIGN_THREAD }),
      ],
    })
    const slack = fakeSlack({ emails: { 'design@example.com': 'U0DESIGN1' } })
    expect(await drain(s, slack)).toMatchObject({ sent: 2, failed: 0, skipped: 0, messages: 2 })
    const posts = slack.posts().map((p) => p.body as { channel: string; thread_ts: string; text: string })
    const design = posts.find((p) => p.channel === 'C0DESIGN1')!
    const ops = posts.find((p) => p.channel === 'C0PROJ001')!
    expect(design.thread_ts).toBe('1727260000.123456')
    expect(design.text.split('\n').map((l) => l.split(' (<')[0])).toEqual([
      '<@U0DESIGN1> <@U0PM00001> [가상 서밋 2026] [확정] 메인 무대 백월 v2 — 발주처 승인',
      '[가상 서밋 2026] [납품] 메인 무대 백월 v2 — 확정본 저장(납품 폴더)',
    ])
    expect(ops.thread_ts).toBe('1727251234.567890')
    expect(ops.text.split('\n')).toEqual([
      '[가상 서밋 2026] [키비주얼] 확정 — 메인 무대 백월 v2 · 발주처 승인',
      '[가상 서밋 2026] [키비주얼] 납품 — 메인 무대 백월 v2 · 확정본 납품 폴더',
    ])
    expect(ops.text).not.toContain('<@')
    expect(s.marks.map((m) => m.keys.sort())).toEqual([['act:1', 'act:2']])

    // 디자인 스레드가 없으면 운영 스레드에 [확정]만 — [키비주얼] 중복 줄 없음
    const one = fakeStore({ events: [event({ key: 'act:3', action: 'approval.decided', decision: 'approved', recipients: [PM] })] })
    const slack2 = fakeSlack()
    await drain(one, slack2)
    expect(slack2.posts()).toHaveLength(1)
    expect(String(slack2.posts()[0].body.text)).not.toContain('[키비주얼]')
    // 운영 항목의 승인·납품은 [키비주얼] 없음
    const opsOnly = eventUnits([event({ key: 'x', action: 'approval.decided', ...OPS_ITEM, decision: 'approved', design_thread: DESIGN_THREAD })], BASE + '/')
    expect(opsOnly).toHaveLength(1)
    // 봇 토큰이 없으면(웹훅 경로) 디자인 소식은 웹훅으로, [키비주얼] 소식은 조용히 건너뛴다(웹훅에 두 번 적지 않는다)
    const hook = fakeStore({ events: [event({ key: 'act:4', action: 'approval.decided', decision: 'approved', design_thread: DESIGN_THREAD, webhook: HOOK })] })
    const slack3 = fakeSlack()
    expect(await drain(hook, slack3, env({ SLACK_BOT_TOKEN: undefined }))).toMatchObject({ sent: 1, skipped: 0, messages: 1 })
    expect(slack3.calls).toHaveLength(1)
    expect(String(slack3.calls[0].body.text)).toContain('[확정]')
    expect(String(slack3.calls[0].body.text)).not.toContain('[키비주얼]')
  })

  it('[키비주얼] 일정 합의 = 디자인 항목 제작 요청을 담당자가 확인했을 때(디자인 스레드가 따로 있을 때만) — 순수 판정 + 버튼 응답 뒤 운영 스레드 한 줄', async () => {
    const ctx = { project_id: P1, project_name: '가상 서밋 2026', thread: THREAD, design_thread: DESIGN_THREAD, kind: 'work', items: [{ deliverable_id: D1, title: '메인 무대 백월', area: 'design', due_date: '2026-10-02' }] }
    expect(keyVisualAgreedLine(ctx, '이디자')).toBe('[가상 서밋 2026] [키비주얼] 일정 합의 — 메인 무대 백월 마감 10/2 (금) · 이디자 확인')
    expect(keyVisualAgreedLine({ ...ctx, kind: 'review' }, '박피엠')).toBeNull()
    expect(keyVisualAgreedLine({ ...ctx, design_thread: null }, '이디자')).toBeNull()
    expect(keyVisualAgreedLine({ ...ctx, design_thread: THREAD }, '이디자')).toBeNull()
    expect(keyVisualAgreedLine({ ...ctx, items: [{ deliverable_id: D2, title: '동선도', area: 'ops', due_date: null }] }, '최운영')).toBeNull()
    expect(
      keyVisualAgreedLine(
        { ...ctx, items: [{ deliverable_id: D1, title: '백월', area: 'design', due_date: '2026-10-02' }, { deliverable_id: D2, title: '명찰', area: 'design', due_date: null }, { deliverable_id: 'x', title: '리플렛 <A&B>', area: 'design', due_date: null }, { deliverable_id: 'y', title: '배너', area: 'design', due_date: null }] },
        '이디자',
      ),
    ).toBe('[가상 서밋 2026] [키비주얼] 일정 합의 — 4건 — 백월 마감 10/2 (금), 명찰, 리플렛 &lt;A&amp;B&gt; 외 1건 · 이디자 확인')

    const s = fakeStore()
    s.setAck((_c, profile) => (profile === 'p-design' ? { status: 'ok', by: '이디자', at: '2026-09-25T05:34:00Z', count: 1, ...ctx } : { status: 'not_recipient', names: ['이디자'] }))
    s.store.profileBySlack = async (id) => (id === 'U0DESIGN1' ? { id: 'p-design', name: '이디자' } : null)
    const slack = fakeSlack()
    await handleSlackInteract(signed(ackPayload('U0DESIGN1')), { SLACK_SIGNING_SECRET: SECRET, SLACK_BOT_TOKEN: TOKEN }, { store: s.store, fetchImpl: slack.fetchImpl, now: () => NOW })
    expect(slack.calls.find((c) => c.url === RESPONSE_URL)!.body.replace_original).toBe(true)
    expect(slack.posts()).toHaveLength(1)
    expect(slack.posts()[0].body).toMatchObject({ channel: 'C0PROJ001', thread_ts: '1727251234.567890', text: '[가상 서밋 2026] [키비주얼] 일정 합의 — 메인 무대 백월 마감 10/2 (금) · 이디자 확인' })
    // 디자인 스레드가 없으면 줄 없음(카드가 운영 스레드에 있었다)
    const s2 = fakeStore()
    s2.setAck(() => ({ status: 'ok', by: '이디자', at: '2026-09-25T05:34:00Z', count: 1, ...ctx, design_thread: null }))
    s2.store.profileBySlack = async () => ({ id: 'p-design', name: '이디자' })
    const slack2 = fakeSlack()
    await handleSlackInteract(signed(ackPayload('U0DESIGN1')), { SLACK_SIGNING_SECRET: SECRET, SLACK_BOT_TOKEN: TOKEN }, { store: s2.store, fetchImpl: slack2.fetchImpl, now: () => NOW })
    expect(slack2.posts()).toHaveLength(0)
  })

  it('테스트 보내기 target=design: 디자인 스레드로 디자인 알림 문구 · 없으면 409 · 봇 없으면 409', async () => {
    const call = (s: ReturnType<typeof fakeStore>, slack: ReturnType<typeof fakeSlack>, e: NotifyEnv = env()) =>
      handleNotifyRequest(
        new Request(`${BASE}/api/notify`, { method: 'POST', headers: { authorization: 'Bearer jwt-pm' }, body: JSON.stringify({ action: 'test', project_id: P1, target: 'design' }) }),
        e,
        { store: s.store, fetchImpl: slack.fetchImpl },
      )
    const s = fakeStore({ project: { design_thread: DESIGN_THREAD } })
    const slack = fakeSlack()
    expect(await (await call(s, slack)).json()).toEqual({ sent: true, channel: 'design' })
    expect(slack.posts()[0].body).toMatchObject({ channel: 'C0DESIGN1', thread_ts: '1727260000.123456', text: '[가상 서밋 2026] 알림 테스트 — 이 행사의 디자인 알림(의뢰·시안·검토요청·피드백·확정·납품)이 이 스레드로 옵니다.' })
    const none = await call(fakeStore(), fakeSlack())
    expect(none.status).toBe(409)
    expect((await none.json()).error.message).toContain('디자인 스레드')
    expect((await call(s, fakeSlack(), env({ SLACK_BOT_TOKEN: undefined }))).status).toBe(409)
  })
})

describe('DoD 79 · ⑧ 비노출 · 서버 전용 · 나가는 곳', () => {
  it('금액 키·이메일이 봇 메시지에 0건', async () => {
    const tainted = { ...event({ key: 'act:1', action: 'deliverable.requested', recipients: [DESIGN, PM], brief: '가이드' }), total_amount: 12_345_678, contract_amount: 5_000_000 } as EventRow
    const s = fakeStore({ events: [tainted, event({ key: 'act:2', action: 'status.transitioned', recipients: [PM] })] })
    const slack = fakeSlack()
    await drain(s, slack)
    const raw = JSON.stringify(slack.posts())
    for (const k of ['total_amount', 'contract_amount', '12345678', '12,345,678', '5000000', 'pm@example.com', 'design@example.com']) expect(raw).not.toContain(k)
  })

  it('서버가 요청하는 곳은 slack.com/api · hooks.slack.com뿐(전 흐름 호출 기록)', async () => {
    const s = fakeStore({
      events: [
        event({ key: 'a', action: 'deliverable.requested', recipients: [DESIGN] }),
        event({ key: 'b', action: 'approval.decided', decision: 'approved', recipients: [OPS, PM] }),
        event({ key: 'c', action: 'version.uploaded', thread: null, webhook: HOOK }),
      ],
    })
    const slack = fakeSlack()
    await drain(s, slack)
    expect(slack.calls.length).toBeGreaterThan(2)
    expect(slack.calls.every((c) => c.url.startsWith('https://slack.com/api/') || c.url.startsWith('https://hooks.slack.com/'))).toBe(true)
  })

  it('봇 토큰·서명 비밀은 서버 전용 — 앱 소스(src, 테스트 제외)에 없고 env 예시에 VITE_ 판이 없다', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, resolve } = await import('node:path')
    const ROOT = resolve(__dirname, '../..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
          if (name !== 'test') walk(p)
        } else if (/\.(ts|tsx)$/.test(name)) files.push(p)
      }
    }
    walk(resolve(ROOT, 'src'))
    const leak = /SLACK_BOT_TOKEN|SLACK_SIGNING_SECRET|xoxb-/
    expect(files.filter((f) => leak.test(readFileSync(f, 'utf8')))).toEqual([])
    for (const file of ['.env.production.example', '.env.example']) {
      const text = readFileSync(resolve(ROOT, file), 'utf8')
      expect(text).toMatch(/^SLACK_BOT_TOKEN=$/m)
      expect(text).toMatch(/^SLACK_SIGNING_SECRET=$/m)
      expect(text).not.toMatch(/VITE_SLACK/)
    }
  })

  it('api/_lib/notify 소스의 절대 주소는 Slack 두 곳뿐', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const dir = resolve(__dirname, '../../api/_lib/notify')
    const urls = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => readFileSync(resolve(dir, f), 'utf8').match(/['"`]https:\/\/[a-z0-9.-]+/g) ?? [])
      .map((u) => u.slice(1))
    expect([...new Set(urls)].sort()).toEqual(['https://hooks.slack.com', 'https://slack.com'].filter((u) => urls.includes(u)).sort())
    expect(urls.every((u) => u === 'https://slack.com' || u.startsWith('https://hooks.slack.com') || u === 'https://slack.com/api/')).toBe(true)
  })
})
