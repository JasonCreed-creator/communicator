/** @vitest-environment jsdom */
// DoD 107 (Phase 6.17 · 설계서 v2.22.3 §4-25 · §8.4 · §9 · §10 S3·S4) — 코멘트·등록 메모 'Slack에 올리기' + 다중 멘션 + 등록 탭 담당자 소통.
// 기획자님 2026-09-28 #1 "코멘트 … 자동으로 PUSH하기보다 슬랙에 올리기 버튼" · #2 "멘션을 여러명 달게" · #5 "등록탭 안에서도 담당자간 소통 · 슬랙 푸시도".
//   ① 순수 상수·판정(lib/slackRelay): 영역별 태그 어휘·기본값 · 모르는 태그는 기본값 · 멘션 정리(문자열만·중복·상한 10) · 채널 라벨
//   ② 서버 relay(api/notify — 가짜 저장소·가짜 Slack): 로그인 401 · 비멤버 403 · kind·id 400 · 스레드·웹훅 없음 409 · 없는 글 404 ·
//      다른 행사 글 403(선점 skipped) · design 코멘트 → 디자인 스레드 + 태그 + 멘션(ID는 <@> · 없으면 이메일 조회 → 미연결) + 인용 ·
//      등록 메모 → 운영 스레드 [등록] + 등록 탭 링크 · 웹훅 폴백(ID 있는 사람만) · Slack 거부 502 + failed · 성공 뒤 markRelayed · 금액 키 0
//   ③ mock provider(v18): 목록 0 → 남기기(멤버) → 목록 1 · 멘션은 이 행사 멤버만 · 빈 글 422 · 4000자 422 · 종료 행사 409 · 열람자 403
//   ④ 화면 — 항목 상세 코멘트마다 'Slack에 올리기' → 패널(태그 · 멤버 체크박스 여러 명) → mock 사실 안내(fetch 0) ·
//      실서버 게이트웨이 = relay 호출 인자(project·kind·id·멘션·태그) + 결과 줄 · 올린 시각 배지
//   ⑤ 화면 — 등록 보드 '소통' 탭: 빈 상태 → 메모 남기기(멘션 2명 · Slack에도 올리기 = mock 안내) → 행(작성자·멘션 칩) → 행의 'Slack에 올리기'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { relayUnit, type RelayRow } from '../../api/_lib/notify/format'
import { handleNotifyRequest, type NotifyEnv } from '../../api/_lib/notify/handler'
import type { NotifyStore } from '../../api/_lib/notify/store'
import {
  RELAY_MAX_MENTIONS,
  RELAY_TAGS,
  SLACK_RELAY_MOCK_MESSAGE,
  defaultRelayTag,
  normalizeMentionIds,
  normalizeRelayTag,
  relayAreaOf,
  relayChannelLabel,
} from '../lib/slackRelay'
import { setNotifyGateway } from '../lib/notify/notifyGateway'
import type { NotifyClient } from '../lib/notify/notifyClient'
import { PROJECT_ID, PROJECT_ID_CLOSED, PROJECT_ID_PARTNER } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  setNotifyGateway(null)
})

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const CMT = '33333333-3333-4333-8333-333333333333'
const NOTE = '44444444-4444-4444-8444-444444444444'
const DLV = '55555555-5555-4555-8555-555555555555'
const THREAD = 'https://acme.slack.com/archives/C0PROJ001/p1727251234567890'
const DESIGN_THREAD = 'https://acme.slack.com/archives/C0DESIGN1/p1727251234567891'
const HOOK = 'https://hooks.slack.com/services/TPRJ/BPRJ/project-secret'
const TOKEN = 'xoxb-test-token'
const BASE = 'https://app.example.com'

const PM = { id: 'p-pm', name: '박피엠', email: 'pm@example.com', slack_user_id: 'U0PM00001' }
const DESIGN = { id: 'p-design', name: '이디자', email: 'design@example.com', slack_user_id: null }
const OPS = { id: 'p-ops', name: '최운영', email: 'ops@example.com', slack_user_id: null }

function row(over: Partial<RelayRow> = {}): RelayRow {
  return {
    key: 'rel:comment:x:1',
    kind: 'relay_comment',
    project_id: P1,
    project_code: 'VST26',
    project_name: '가상 서밋 2026',
    webhook: null,
    thread: THREAD,
    design_thread: null,
    area: 'design',
    deliverable_id: DLV,
    title: '메인 무대 백월',
    author: '이디자',
    body: '2안 폰트가 더 <낫습니다> & 색은 그대로',
    tag: '[피드백]',
    mentions: [PM, DESIGN],
    ...over,
  }
}

function fakeSlack(opts: { fail?: string; emails?: Record<string, string> } = {}) {
  const calls: { url: string; method: string | null; body: Record<string, unknown> }[] = []
  let n = 0
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    const raw = String(init?.body ?? '')
    const ct = new Headers(init?.headers).get('content-type') ?? ''
    const body = (ct.includes('x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : raw ? JSON.parse(raw) : {}) as Record<string, unknown>
    const method = u.startsWith('https://slack.com/api/') ? u.slice('https://slack.com/api/'.length) : null
    calls.push({ url: u, method, body })
    if (method === 'chat.postMessage') {
      if (opts.fail) return Response.json({ ok: false, error: opts.fail })
      n += 1
      return Response.json({ ok: true, ts: `1727251300.00${n}`, channel: body.channel })
    }
    if (method === 'users.lookupByEmail') {
      const id = opts.emails?.[String(body.email)]
      return Response.json(id ? { ok: true, user: { id } } : { ok: false, error: 'users_not_found' })
    }
    return new Response('ok', { status: 200 })
  }) as typeof fetch
  return { calls, fetchImpl, posts: () => calls.filter((c) => c.method === 'chat.postMessage'), hooks: () => calls.filter((c) => c.url === HOOK) }
}

function fakeStore(opts: { project?: { thread?: string | null; webhook?: string | null; design_thread?: string | null }; relay?: RelayRow | null } = {}) {
  const marks: { keys: string[]; status: string; error?: string | null }[] = []
  const relayed: { kind: string; id: string }[] = []
  const claims: { kind: string; id: string; mentions: string[]; tag: string }[] = []
  const slackIds: Record<string, string> = {}
  const store: NotifyStore = {
    async claimEvents() {
      return []
    },
    async claimReminders() {
      return []
    },
    async claimManual() {
      return null
    },
    async mark(keys, status, error) {
      marks.push({ keys, status, error })
    },
    async authProfile(jwt) {
      if (jwt === 'jwt-pm') return { id: 'p-pm', app_role: 'sales' }
      if (jwt === 'jwt-out') return { id: 'p-out', app_role: 'staff' }
      return null
    },
    async memberRole(profileId, projectId) {
      return profileId === 'p-pm' && projectId === P1 ? 'pm' : null
    },
    async tokenActive() {
      return false
    },
    async project(id) {
      return id === P1
        ? { code: 'VST26', name: '가상 서밋 2026', webhook: opts.project?.webhook ?? null, thread: opts.project?.thread === undefined ? THREAD : opts.project.thread, design_thread: opts.project?.design_thread ?? null }
        : null
    },
    async setSlackUser(profileId, slackUserId) {
      slackIds[profileId] ??= slackUserId
    },
    async recordCard() {
      return 0
    },
    async ackCard() {
      return { status: 'not_found' }
    },
    async profileBySlack() {
      return null
    },
    async profileByEmail() {
      return null
    },
    async claimRelay(kind, id, mentions, tag) {
      claims.push({ kind, id, mentions, tag })
      if (opts.relay === null) return null
      const base = opts.relay ?? row()
      return { ...base, tag: tag || base.tag, key: `rel:${kind}:${id}:1` }
    },
    async markRelayed(kind, id) {
      relayed.push({ kind, id })
    },
  }
  return { store, marks, relayed, claims, slackIds }
}

function env(over: Partial<NotifyEnv> = {}): NotifyEnv {
  return { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SLACK_BOT_TOKEN: TOKEN, APP_BASE_URL: BASE, ...over }
}

function post(body: Record<string, unknown>, jwt: string | null = 'jwt-pm'): Request {
  return new Request('https://app.example.com/api/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  })
}

const relayBody = (over: Record<string, unknown> = {}) => ({ action: 'relay', project_id: P1, kind: 'comment', id: CMT, mention_ids: ['p-pm', 'p-design'], tag: '[피드백]', ...over })

describe('DoD 107 ① lib/slackRelay — 태그·멘션 정리', () => {
  it('영역별 태그 어휘와 기본값 · 모르는 태그·다른 영역 태그는 기본값 · 등록 메모는 늘 registration', () => {
    expect(defaultRelayTag('design')).toBe('[피드백]')
    expect(defaultRelayTag('ops')).toBe('[제작]')
    expect(defaultRelayTag('common')).toBe('[제작]')
    expect(defaultRelayTag('registration')).toBe('[등록]')
    expect(RELAY_TAGS.design).toContain('[검토요청]')
    expect(RELAY_TAGS.ops).toContain('[WBS]')
    expect(normalizeRelayTag('design', '[긴급]')).toBe('[긴급]')
    expect(normalizeRelayTag('design', '[WBS]')).toBe('[피드백]') // 디자인 어휘가 아니다
    expect(normalizeRelayTag('ops', '<@U1>')).toBe('[제작]')
    expect(normalizeRelayTag('registration', undefined)).toBe('[등록]')
    expect(relayAreaOf('note', 'design')).toBe('registration')
    expect(relayAreaOf('comment', 'design')).toBe('design')
    expect(relayAreaOf('comment', 'ops')).toBe('ops')
    expect(relayAreaOf('comment', 'common')).toBe('common')
    expect(relayAreaOf('comment', null)).toBe('common')
  })

  it('멘션 id 정리 = 문자열만 · 공백 제거 · 중복 제거 · 상한 10 · 채널 라벨', () => {
    expect(normalizeMentionIds(['a', ' a ', 'b', 3, null, '', 'b'])).toEqual(['a', 'b'])
    expect(normalizeMentionIds('a')).toEqual([])
    expect(normalizeMentionIds(Array.from({ length: 14 }, (_, i) => `p${i}`))).toHaveLength(RELAY_MAX_MENTIONS)
    expect(relayChannelLabel('design')).toBe('디자인 스레드')
    expect(relayChannelLabel('thread')).toBe('행사 스레드')
    expect(relayChannelLabel('project')).toBe('행사 채널')
    expect(relayChannelLabel('global')).toBe('공용 채널')
  })

  it('relayUnit — 코멘트는 항목 링크·영역 스레드, 등록 메모는 등록 탭 링크·운영 스레드 · 인용 = 본문 · 금액 키 0', () => {
    const c = relayUnit(row({ design_thread: DESIGN_THREAD }), BASE + '/')
    expect(c.keys).toEqual(['rel:comment:x:1'])
    expect(c.line).toContain('[가상 서밋 2026] [피드백] 메인 무대 백월 — 코멘트 · 이디자')
    expect(c.line).toContain(`${BASE}/items/${DLV}?project=${P1}|열기`)
    expect(c.thread).toBe(DESIGN_THREAD)
    expect(c.quote).toBe('2안 폰트가 더 <낫습니다> & 색은 그대로')
    expect(c.mentions?.map((m) => m.id)).toEqual(['p-pm', 'p-design'])
    const n = relayUnit(row({ kind: 'relay_note', area: 'registration', deliverable_id: null, title: null, tag: '[WBS]', design_thread: DESIGN_THREAD }), BASE + '/')
    expect(n.line).toContain('[가상 서밋 2026] [등록] 등록 메모 — 메모 · 이디자')
    expect(n.line).toContain(`${BASE}/registration?project=${P1}|열기`)
    expect(n.thread).toBe(THREAD) // 등록 메모는 디자인 스레드가 있어도 운영 스레드
    expect(JSON.stringify(c)).not.toMatch(/total_amount|breakdown|ordered_amount|actual_amount|margin/)
  })
})

describe('DoD 107 ② 서버 relay', () => {
  it('로그인 없음 401 · 비멤버 403 · kind·id 없음 400 · 스레드·웹훅 없음 409 · 없는 글 404', async () => {
    const slack = fakeSlack()
    let res = await handleNotifyRequest(post(relayBody(), null), env(), { store: fakeStore().store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(401)
    res = await handleNotifyRequest(post(relayBody(), 'jwt-out'), env(), { store: fakeStore().store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(403)
    res = await handleNotifyRequest(post(relayBody({ kind: 'reply' })), env(), { store: fakeStore().store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(400)
    res = await handleNotifyRequest(post(relayBody({ id: '' })), env(), { store: fakeStore().store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(400)
    res = await handleNotifyRequest(post(relayBody()), env(), { store: fakeStore({ project: { thread: null } }).store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain('Slack 스레드')
    const f = fakeStore({ relay: null })
    res = await handleNotifyRequest(post(relayBody()), env(), { store: f.store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(404)
    expect(f.claims[0]).toEqual({ kind: 'comment', id: CMT, mentions: ['p-pm', 'p-design'], tag: '[피드백]' })
    expect(slack.posts()).toHaveLength(0)
  })

  it('다른 행사의 글이면 403이고 선점 키는 skipped', async () => {
    const slack = fakeSlack()
    const f = fakeStore({ relay: row({ project_id: P2 }) })
    const res = await handleNotifyRequest(post(relayBody()), env(), { store: f.store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(403)
    expect(f.marks).toEqual([{ keys: [`rel:comment:${CMT}:1`], status: 'skipped', error: undefined }])
    expect(slack.posts()).toHaveLength(0)
    expect(f.relayed).toEqual([])
  })

  it('design 코멘트 → 디자인 스레드 답글: 태그 · 멘션(<@ID> · 이메일로 찾아 적어 둠 · 못 찾으면 미연결) · 인용 · 성공 뒤 markRelayed · sent 기록', async () => {
    const slack = fakeSlack({ emails: { 'design@example.com': 'U0DESIGN1' } })
    const f = fakeStore({ project: { design_thread: DESIGN_THREAD }, relay: row({ design_thread: DESIGN_THREAD }) })
    const res = await handleNotifyRequest(post(relayBody({ mention_ids: ['p-pm', 'p-design', 'p-design'] })), env(), { store: f.store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: true, channel: 'design', mentioned: 2 })
    const posts = slack.posts()
    expect(posts).toHaveLength(1)
    expect(posts[0].body.channel).toBe('C0DESIGN1')
    expect(posts[0].body.thread_ts).toBe('1727251234.567891')
    const text = String(posts[0].body.text)
    expect(text).toContain('<@U0PM00001> <@U0DESIGN1> [가상 서밋 2026] [피드백] 메인 무대 백월 — 코멘트 · 이디자')
    expect(text).toContain('>2안 폰트가 더 &lt;낫습니다&gt; &amp; 색은 그대로')
    expect(f.slackIds).toEqual({ 'p-design': 'U0DESIGN1' })
    expect(f.relayed).toEqual([{ kind: 'comment', id: CMT }])
    expect(f.marks[f.marks.length - 1]).toEqual({ keys: [`rel:comment:${CMT}:1`], status: 'sent', error: undefined })
    // 멘션 정리는 서버에서도(중복 제거) — 저장소에 넘긴 목록
    expect(f.claims[0].mentions).toEqual(['p-pm', 'p-design'])
  })

  it('등록 메모 → 운영 스레드 [등록] + 등록 탭 링크 · Slack 미연결 사람은 이름(Slack 미연결) · 태그가 어휘 밖이면 기본값', async () => {
    const slack = fakeSlack()
    const f = fakeStore({ project: { design_thread: DESIGN_THREAD }, relay: row({ kind: 'relay_note', area: 'registration', deliverable_id: null, title: null, mentions: [OPS], design_thread: DESIGN_THREAD }) })
    const res = await handleNotifyRequest(post(relayBody({ kind: 'note', id: NOTE, mention_ids: ['p-ops'], tag: '[피드백]' })), env(), { store: f.store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: true, channel: 'thread', mentioned: 1 })
    const text = String(slack.posts()[0].body.text)
    expect(slack.posts()[0].body.channel).toBe('C0PROJ001')
    expect(text).toContain('최운영(Slack 미연결) [가상 서밋 2026] [등록] 등록 메모 — 메모 · 이디자')
    expect(text).toContain(`${BASE}/registration?project=${P1}|열기`)
    expect(f.relayed).toEqual([{ kind: 'note', id: NOTE }])
  })

  it('봇 없음 → 웹훅 폴백(행사 채널 · ID 있는 사람만 멘션) · Slack 거부 → 502 + failed + markRelayed 0', async () => {
    const slack = fakeSlack()
    // 선점 행의 스레드·웹훅은 SQL이 행사 설정에서 읽어 오는 값 — 스레드 없음 · 행사 웹훅
    const f = fakeStore({ project: { thread: null, webhook: HOOK }, relay: row({ thread: null, webhook: HOOK }) })
    let res = await handleNotifyRequest(post(relayBody()), env({ SLACK_BOT_TOKEN: undefined }), { store: f.store, fetchImpl: slack.fetchImpl })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: true, channel: 'project', mentioned: 2 })
    const hook = slack.hooks()
    expect(hook).toHaveLength(1)
    expect(String(hook[0].body.text)).toContain('<@U0PM00001> [가상 서밋 2026] [피드백]')
    expect(String(hook[0].body.text)).not.toContain('미연결')
    expect(f.relayed).toEqual([{ kind: 'comment', id: CMT }])

    const bad = fakeSlack({ fail: 'not_in_channel' })
    const g = fakeStore()
    res = await handleNotifyRequest(post(relayBody()), env(), { store: g.store, fetchImpl: bad.fetchImpl })
    expect(res.status).toBe(502)
    expect(g.marks[g.marks.length - 1]?.status).toBe('failed')
    expect(g.relayed).toEqual([])
  })
})

describe('DoD 107 ③ mock provider — 등록 메모(v18)', () => {
  // 파트너 행사(멤버 4명 같음)에서 — 샘플 행사는 ⑤ 화면 흐름(빈 상태 → 첫 메모)이 쓴다(mock 상태는 파일 안에서 이어진다)
  it('목록 0 → 남기기(멤버 · 멘션은 이 행사 멤버만 · 공백 정리) → 목록 1 · 빈 글 422 · 4000자 422 · 종료 행사 409', async () => {
    const provider = mockProvider()
    provider.switchUser('usr-pm')
    expect(await provider.listRegistrationNotes(PROJECT_ID_PARTNER)).toEqual([])
    const note = await provider.createRegistrationNote(PROJECT_ID_PARTNER, { body: '  명단 확정 전 확인 부탁  ', mention_ids: ['usr-reg', 'usr-design', 'usr-reg', 'usr-nobody'] })
    expect(note).toMatchObject({ project_id: PROJECT_ID_PARTNER, author_id: 'usr-pm', body: '명단 확정 전 확인 부탁', mention_ids: ['usr-reg', 'usr-design'], slack_posted_at: null })
    expect((await provider.listRegistrationNotes(PROJECT_ID_PARTNER)).map((n) => n.id)).toEqual([note.id])
    await expect(provider.createRegistrationNote(PROJECT_ID_PARTNER, { body: '   ' })).rejects.toMatchObject({ code: 'validation' })
    await expect(provider.createRegistrationNote(PROJECT_ID_PARTNER, { body: 'x'.repeat(4001) })).rejects.toMatchObject({ code: 'validation' })
    await expect(provider.createRegistrationNote(PROJECT_ID_CLOSED, { body: '메모' })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('담당이 아닌 행사(열람자)는 목록·남기기 403 — design 사용자가 종료 행사(pm만 멤버)에', async () => {
    const provider = mockProvider()
    provider.switchUser('usr-design')
    await expect(provider.listRegistrationNotes(PROJECT_ID_CLOSED)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(provider.createRegistrationNote(PROJECT_ID_CLOSED, { body: '메모' })).rejects.toMatchObject({ code: 'forbidden' })
    // 담당 행사에서는 design 역할도 남길 수 있다(담당자간 소통 — 역할 구분 없음)
    const mine = await provider.createRegistrationNote(PROJECT_ID_PARTNER, { body: '디자인 쪽 확인' })
    expect(mine.author_id).toBe('usr-design')
  })
})

describe('DoD 107 ④ 화면 — 항목 상세 코멘트 Slack에 올리기', () => {
  it('코멘트마다 단추 → 패널(태그 · 멤버 체크박스) → mock은 사실 안내 · fetch 0 · 채운 버튼 늘지 않음', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderRoute('/items/dlv-001')
    const buttons = await screen.findAllByRole('button', { name: 'Slack에 올리기' })
    expect(buttons.length).toBeGreaterThan(0)
    await user.click(buttons[0])
    const panel = screen.getByRole('group', { name: 'Slack에 올리기' })
    const tag = within(panel).getByRole('combobox', { name: '댓글 태그' }) as HTMLSelectElement
    expect(tag.value).toBe('[피드백]') // 디자인 항목
    expect(within(panel).getAllByRole('checkbox').length).toBeGreaterThan(1)
    await user.click(within(panel).getAllByRole('checkbox')[0])
    await user.click(within(panel).getByRole('button', { name: '올리기' }))
    expect((await screen.findByTestId('slack-relay-result')).textContent).toBe(SLACK_RELAY_MOCK_MESSAGE)
    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/api'))).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('실서버 게이트웨이면 relay 호출(행사·kind·코멘트 id·고른 멘션·태그) → 결과 줄', async () => {
    const user = userEvent.setup()
    const relay = vi.fn(async (_input: { project_id: string; kind: string; id: string; mention_ids: string[]; tag?: string }) => ({ sent: true as const, channel: 'design' as const, mentioned: 2 }))
    setNotifyGateway({ mode: 'server', client: { relay } as unknown as NotifyClient })
    renderRoute('/items/dlv-001')
    await user.click((await screen.findAllByRole('button', { name: 'Slack에 올리기' }))[0])
    const panel = screen.getByRole('group', { name: 'Slack에 올리기' })
    await user.selectOptions(within(panel).getByRole('combobox', { name: '댓글 태그' }), '[긴급]')
    const boxes = within(panel).getAllByRole('checkbox')
    await user.click(boxes[0])
    await user.click(boxes[1])
    await user.click(within(panel).getByRole('button', { name: '올리기' }))
    await waitFor(() => expect(relay).toHaveBeenCalledTimes(1))
    const arg = relay.mock.calls[0][0]
    expect(arg.project_id).toBe(PROJECT_ID)
    expect(arg.kind).toBe('comment')
    expect(arg.id).toMatch(/^cmt-/)
    expect(arg.mention_ids).toHaveLength(2)
    expect(arg.tag).toBe('[긴급]')
    expect((await screen.findByTestId('slack-relay-result')).textContent).toBe('Slack에 올렸어요 · 디자인 스레드 · 멘션 2명')
  })
})

describe('DoD 107 ⑤ 화면 — 등록 보드 소통 탭', () => {
  it('빈 상태 → 남기기(멘션 2명 · Slack에도 올리기 = mock 안내) → 행(작성자·멘션 칩·본문) → 행의 Slack에 올리기', async () => {
    const user = userEvent.setup()
    renderRoute('/registration')
    await user.click(await screen.findByRole('button', { name: '소통' }))
    const section = await screen.findByTestId('registration-notes')
    expect(await within(section).findByText(/아직 메모가 없습니다/)).toBeTruthy()
    await user.type(within(section).getByLabelText('메모'), '명단 확정 전 확인 부탁')
    const form = within(section).getByRole('form', { name: '메모 남기기' })
    const boxes = within(form).getAllByRole('checkbox')
    await user.click(boxes[0])
    await user.click(boxes[1])
    await user.click(within(form).getByLabelText('남기면서 Slack에도 올리기'))
    expect(within(form).getByRole('combobox', { name: '댓글 태그' })).toBeTruthy()
    await user.click(within(form).getByRole('button', { name: '남기기' }))
    const noteRow = await within(section).findByTestId('registration-note')
    expect(within(noteRow).getByText('명단 확정 전 확인 부탁')).toBeTruthy()
    expect(within(noteRow).getAllByTestId('note-mention')).toHaveLength(2)
    expect((await screen.findByTestId('registration-note-notice')).textContent).toBe(SLACK_RELAY_MOCK_MESSAGE)
    expect(within(noteRow).getByRole('button', { name: 'Slack에 올리기' })).toBeTruthy()
    // 채운 버튼은 늘지 않는다(전부 ghost)
    expect(within(section).queryAllByRole('button').filter((b) => /btn-accent|btn-primary/.test(b.className))).toHaveLength(0)
  })

  it('SlackRelayPanel 단독 — 올린 시각 배지 · 다시 올리기 · 초기 멘션 체크', async () => {
    const SlackRelayPanel = (await import('../components/internal/SlackRelayPanel')).default
    const members = await mockProvider().listMembers(PROJECT_ID)
    render(
      <SlackRelayPanel projectId={PROJECT_ID} kind="note" targetId="rnt-1" area="registration" members={members} postedAt="2026-09-29T01:00:00.000Z" initialMentions={[members[0].user_id]} />,
    )
    expect(screen.getByText(/^Slack에 올림 · /)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Slack에 다시 올리기' }))
    const panel = screen.getByRole('group', { name: 'Slack에 올리기' })
    expect((within(panel).getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true)
    expect((within(panel).getByRole('combobox', { name: '댓글 태그' }) as HTMLSelectElement).value).toBe('[등록]')
  })
})
