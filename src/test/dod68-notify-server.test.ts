// DoD 68 (Phase 6 · 설계서 v2.10.1 §9) — Slack 알림 서버 계약. 가짜 저장소·가짜 Slack으로 돈다(실 DB 판정은 supabase:check).
//   ① no-op: 보낼 채널이 없으면 Slack 호출 0 · 선점 행은 skipped(나중에 채널을 붙여도 옛 사건이 쏟아지지 않는다)
//   ② 채널: 행사 채널 → 없으면 공용(env) → Slack 주소가 아니면 무시 · 채널별로 한 메시지
//   ③ 문구: [코드] 사건 — 항목 (링크 ?project=) · 새 지시는 행사마다 묶음 · 지워진 항목은 줄 없음 · Slack 특수문자 이스케이프
//   ④ 인증: 신호 = 로그인 세션 또는 살아 있는 링크 토큰 · 크론 = CRON_SECRET · 테스트 = pm · 리마인드 = 멤버(시간당 1회)
//   ⑤ 실패: Slack 거부·연결 실패는 failed로 기록하고 요청은 성공(본 동작을 막지 않는다)
//   ⑥ 금액 비노출(§19.7): 입력 행에 금액 키가 섞여 와도 본문에 0건
import { describe, expect, it } from 'vitest'
import {
  appBaseUrl,
  eventUnits,
  manualUnit,
  reminderUnits,
  slackEscape,
  slackPayload,
  type EventRow,
  type ManualRow,
  type ReminderRow,
} from '../../api/_lib/notify/format'
import { destinationFor, handleNotifyRequest, type NotifyEnv } from '../../api/_lib/notify/handler'
import type { NotifyStore } from '../../api/_lib/notify/store'

const PROJECT_HOOK = 'https://hooks.slack.com/services/TPRJ/BPRJ/project-secret'
const GLOBAL_HOOK = 'https://hooks.slack.com/services/TGLB/BGLB/global-secret'
const BASE = 'https://app.example.com'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const D1 = '33333333-3333-4333-8333-333333333333'

function event(over: Partial<EventRow> & { key: string; action: string }): EventRow {
  return {
    project_id: P1,
    project_code: 'STC26',
    project_name: '가상 컨퍼런스',
    webhook: null,
    deliverable_id: D1,
    title: '메인 키비주얼',
    area: 'design',
    ...over,
  }
}

function setup(opts: { events?: EventRow[]; reminders?: ReminderRow[]; manual?: ManualRow | null; env?: Partial<NotifyEnv>; slackStatus?: number } = {}) {
  const marks: { keys: string[]; status: string; error?: string | null }[] = []
  const posts: { url: string; body: { text: string; unfurl_links: boolean } }[] = []
  let events = opts.events ?? []
  let reminders = opts.reminders ?? []
  let manual = opts.manual ?? null
  const users: Record<string, string> = { 'jwt-pm': 'p-pm', 'jwt-design': 'p-design', 'jwt-out': 'p-out' }
  const roles: Record<string, string> = { [`p-pm:${P1}`]: 'pm', [`p-design:${P1}`]: 'design' }
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
      const out = manual
      manual = null
      return out
    },
    async mark(keys, status, error) {
      marks.push({ keys, status, error })
    },
    async authProfile(jwt) {
      return users[jwt] ?? null
    },
    async memberRole(profileId, projectId) {
      return roles[`${profileId}:${projectId}`] ?? null
    },
    async tokenActive(token) {
      return token === '44444444-4444-4444-8444-444444444444'
    },
    async project(projectId) {
      return projectId === P1 ? { code: 'STC26', name: '가상 컨퍼런스', webhook: opts.env?.SLACK_WEBHOOK_URL === undefined ? PROJECT_HOOK : null } : null
    },
    // v2.12 봇 경로(DoD 79가 검사) — 웹훅 계약에서는 쓰이지 않는다
    async setSlackUser() {},
    async recordCard() {
      return 0
    },
    async ackCard() {
      return { status: 'not_found' as const }
    },
    async profileBySlack() {
      return null
    },
    async profileByEmail() {
      return null
    },
  }
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    posts.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return new Response(opts.slackStatus && opts.slackStatus !== 200 ? 'invalid_token' : 'ok', { status: opts.slackStatus ?? 200 })
  }) as typeof fetch
  const env: NotifyEnv = { CRON_SECRET: 'cron-secret-for-tests', ...opts.env }
  const call = (method: 'GET' | 'POST', body?: Record<string, unknown>, auth?: string) =>
    handleNotifyRequest(
      new Request(`${BASE}/api/notify`, {
        method,
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      { store, fetchImpl },
    )
  return { store, marks, posts, call, env }
}

describe('DoD 68 · ① no-op 폴백 — 채널이 없으면 보내지 않고 skipped로 남긴다', () => {
  it('공용·행사 채널 둘 다 없음 → Slack 호출 0 · 선점 키 전부 skipped · 요청은 200', async () => {
    const s = setup({ events: [event({ key: 'act:1', action: 'version.uploaded', version_no: 2 })] })
    const r = await s.call('POST', { action: 'drain' }, 'jwt-pm')
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ sent: 0, skipped: 1, failed: 0, messages: 0 })
    expect(s.posts).toHaveLength(0)
    expect(s.marks).toEqual([{ keys: ['act:1'], status: 'skipped', error: undefined }])
  })

  it('DB 자격증명이 없는 배포(데모·미리보기)는 신호를 조용히 받고, 시험·리마인드는 503을 사실대로', async () => {
    const r = await handleNotifyRequest(new Request(`${BASE}/api/notify`, { method: 'POST', body: JSON.stringify({ action: 'drain' }) }), {})
    expect(await r.json()).toEqual({ mode: 'noop', reason: 'no_database' })
    const t = await handleNotifyRequest(
      new Request(`${BASE}/api/notify`, { method: 'POST', body: JSON.stringify({ action: 'test', project_id: P1 }) }),
      {},
    )
    expect(t.status).toBe(503)
  })
})

describe('DoD 68 · ② 보낼 곳 — 행사 채널 → 공용 → 없음', () => {
  it('Slack Incoming Webhook 주소만 인정한다', () => {
    expect(destinationFor(PROJECT_HOOK, {})).toBe(PROJECT_HOOK)
    expect(destinationFor(null, { SLACK_WEBHOOK_URL: GLOBAL_HOOK })).toBe(GLOBAL_HOOK)
    expect(destinationFor('https://evil.example.com/hook', { SLACK_WEBHOOK_URL: GLOBAL_HOOK })).toBe(GLOBAL_HOOK)
    expect(destinationFor('https://hooks.slack.com/triggers/x', {})).toBeNull()
    expect(destinationFor(null, { SLACK_WEBHOOK_URL: 'http://hooks.slack.com/services/x' })).toBeNull()
  })

  it('행사 채널이 있는 행사와 없는 행사가 섞이면 채널마다 한 메시지 · 전부 sent', async () => {
    const s = setup({
      env: { SLACK_WEBHOOK_URL: GLOBAL_HOOK },
      events: [
        event({ key: 'act:1', action: 'version.uploaded', version_no: 1, webhook: PROJECT_HOOK }),
        event({ key: 'act:2', action: 'approval.requested', webhook: PROJECT_HOOK, due_at: '2026-10-01T09:00:00Z' }),
        event({ key: 'act:3', action: 'approval.decided', decision: 'approved', project_id: P2, project_code: 'OTH', webhook: null }),
      ],
    })
    const r = await s.call('POST', { action: 'drain' }, 'jwt-pm')
    expect(await r.json()).toMatchObject({ sent: 3, messages: 2 })
    expect(s.posts.map((p) => p.url).sort()).toEqual([GLOBAL_HOOK, PROJECT_HOOK].sort())
    const project = s.posts.find((p) => p.url === PROJECT_HOOK)!.body.text.split('\n')
    expect(project).toHaveLength(2)
    expect(s.posts.find((p) => p.url === GLOBAL_HOOK)!.body.text).toContain('[OTH] 발주처 승인 — 메인 키비주얼')
    expect(s.posts.every((p) => p.body.unfurl_links === false)).toBe(true)
  })
})

describe('DoD 68 · ③ 문구 — [코드] 사건 — 항목 (링크)', () => {
  const base = appBaseUrl({}, `${BASE}/api/notify`)

  it('사건 5종 문구 · 항목 링크에 ?project= · 수정요청·승인 구분', () => {
    const units = eventUnits(
      [
        event({ key: 'a', action: 'version.uploaded', version_no: 3, actor_name: '김디자인' }),
        event({ key: 'b', action: 'approval.requested', due_at: '2026-10-01T00:00:00Z' }),
        event({ key: 'c', action: 'approval.decided', decision: 'changes_requested' }),
        event({ key: 'd', action: 'partner.submitted', partner_name: '가상 파트너', version_no: 1 }),
        event({ key: 'e', action: 'deliverable.requested', assignee_name: '박운영' }),
      ],
      base,
    )
    const lines = units.map((u) => u.line)
    expect(lines[0]).toBe(`[STC26] 새 버전 — 메인 키비주얼 v3 · 김디자인 (<${BASE}/items/${D1}?project=${P1}|열기>)`)
    expect(lines[1]).toContain('[STC26] 컨펌 발송 — 메인 키비주얼 · 기한 10/1')
    expect(lines[2]).toContain('[STC26] 발주처 수정요청 — 메인 키비주얼')
    expect(lines[3]).toContain('[STC26] 파트너 제출 — 메인 키비주얼 · 가상 파트너 v1')
    expect(lines[4]).toContain('[STC26] 새 지시 — 메인 키비주얼 → 박운영')
  })

  it('새 지시가 여러 건이면 행사마다 한 줄(보드 링크) · 키는 전부 그 줄에 묶인다', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      event({ key: `r${i}`, action: 'deliverable.requested', title: `제출물 ${i + 1}`, area: 'ops' }),
    )
    const units = eventUnits(rows, base)
    expect(units).toHaveLength(1)
    expect(units[0].keys).toHaveLength(12)
    expect(units[0].line).toContain('[STC26] 새 지시 12건 — 제출물 1, 제출물 2, 제출물 3 외 9건')
    expect(units[0].line).toContain(`/board/ops?project=${P1}|보드>`)
  })

  it('지워진 항목(항목 없음)은 줄 없이 키만 → skipped · 알 수 없는 결정도 줄 없음', () => {
    const units = eventUnits(
      [event({ key: 'x', action: 'version.uploaded', deliverable_id: null, title: null }), event({ key: 'y', action: 'approval.decided', decision: null })],
      base,
    )
    expect(units.map((u) => u.line)).toEqual([null, null])
  })

  it('Slack 특수문자(&·<·>)는 이스케이프 — 제목으로 링크를 위조할 수 없다', () => {
    expect(slackEscape('A&B <http://x|y>')).toBe('A&amp;B &lt;http://x|y&gt;')
    const [u] = eventUnits([event({ key: 'z', action: 'version.uploaded', title: '<!channel> 긴급' })], base)
    expect(u.line).toContain('&lt;!channel&gt; 긴급')
    expect(u.line).not.toContain('<!channel>')
  })

  it('리마인드 4종 · 수동 리마인드 · 20줄 넘으면 …외 N건', () => {
    const rem = reminderUnits(
      [
        { key: 'r1', kind: 'approval_due', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, deliverable_id: D1, title: '명찰' },
        { key: 'r2', kind: 'milestone_due', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, title: '인쇄 발주' },
        { key: 'r3', kind: 'partner_due', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, title: '부스 도면', partner_name: '가상 파트너' },
        { key: 'r4', kind: 'inbox_digest', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, count: 3 },
        { key: 'r5', kind: 'inbox_digest', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, count: 0 },
      ],
      base,
    )
    expect(rem.map((u) => u.line?.split(' (')[0])).toEqual([
      '[STC26] 컨펌 기한 D-1 — 명찰 · 발주처 응답 없음',
      '[STC26] 마일스톤 D-1 — 인쇄 발주',
      '[STC26] 파트너 마감 D-1 — 가상 파트너 · 부스 도면 미제출',
      '[STC26] 미등록 파일 3건 — 홈 인박스에서 항목에 연결하거나 무시하세요',
      undefined,
    ])
    const m = manualUnit(
      { key: 'm', kind: 'manual_delayed', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, total: 7, items: [{ title: '현장답사', date: '2026-09-20' }] },
      base,
    )
    expect(m.line).toContain('[STC26] 리마인드 — 지연 태스크 7건: 현장답사(9/20) 외 6건')
    expect(manualUnit({ key: 'm2', kind: 'manual_approval', project_id: P1, project_code: 'S', project_name: 'x', webhook: null, total: 0, items: [] }, base).line).toBeNull()
    const long = slackPayload(Array.from({ length: 25 }, (_, i) => `줄 ${i}`))
    expect(long.text.split('\n')).toHaveLength(21)
    expect(long.text.endsWith('…외 5건')).toBe(true)
  })

  it('앱 주소: APP_BASE_URL > 요청 출처 > Vercel 운영 도메인 · 하위 경로(VITE_BASE_PATH)', () => {
    expect(appBaseUrl({ APP_BASE_URL: 'https://mkt.example.com/leadgen/communicator' })).toBe('https://mkt.example.com/leadgen/communicator/')
    expect(appBaseUrl({ VITE_BASE_PATH: '/leadgen/communicator/' }, `${BASE}/api/notify`)).toBe(`${BASE}/leadgen/communicator/`)
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'www.example.com' })).toBe('https://www.example.com/')
    expect(appBaseUrl({})).toBeNull()
  })
})

describe('DoD 68 · ④ 인증 — 누가 무엇을 부를 수 있나', () => {
  it('신호: 로그인 세션 또는 살아 있는 링크 토큰 — 둘 다 없거나 틀리면 401', async () => {
    const s = setup()
    expect((await s.call('POST', { action: 'drain' })).status).toBe(401)
    expect((await s.call('POST', { action: 'drain' }, 'jwt-unknown')).status).toBe(401)
    expect((await s.call('POST', { action: 'drain', token: '55555555-5555-4555-8555-555555555555' })).status).toBe(401)
    expect((await s.call('POST', { action: 'drain', token: '44444444-4444-4444-8444-444444444444' })).status).toBe(200)
    expect((await s.call('POST', { action: 'drain' }, 'jwt-design')).status).toBe(200)
  })

  it('크론: Authorization 없는 GET은 상태만(값 없음) · 틀린 비밀 401 · 비밀 미설정 503 · 맞으면 사건 + 리마인드', async () => {
    const s = setup({
      env: { SLACK_WEBHOOK_URL: GLOBAL_HOOK },
      events: [event({ key: 'act:9', action: 'version.uploaded' })],
      reminders: [{ key: 'rem:m', kind: 'milestone_due', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: null, title: '인쇄' }],
    })
    const status = await s.call('GET')
    const body = await status.json()
    expect(body).toEqual({ slack: true, bot: false, cron: true })
    expect(JSON.stringify(body)).not.toContain('hooks.slack.com')
    expect((await s.call('GET', undefined, 'wrong')).status).toBe(401)
    const noSecret = await handleNotifyRequest(new Request(`${BASE}/api/notify`, { headers: { authorization: 'Bearer x' } }), {}, { store: s.store })
    expect(noSecret.status).toBe(503)
    const run = await s.call('GET', undefined, 'cron-secret-for-tests')
    expect(await run.json()).toMatchObject({ sent: 2, messages: 2 })
  })

  it('테스트 보내기: pm만(design 403 · 비멤버 403 · 로그인 없음 401) · 행사 채널로 한 줄', async () => {
    const s = setup()
    expect((await s.call('POST', { action: 'test', project_id: P1 })).status).toBe(401)
    expect((await s.call('POST', { action: 'test', project_id: P1 }, 'jwt-out')).status).toBe(403)
    expect((await s.call('POST', { action: 'test', project_id: P1 }, 'jwt-design')).status).toBe(403)
    const ok = await s.call('POST', { action: 'test', project_id: P1 }, 'jwt-pm')
    expect(await ok.json()).toEqual({ sent: true, channel: 'project' })
    expect(s.posts[0]).toMatchObject({ url: PROJECT_HOOK })
    expect(s.posts[0].body.text).toBe('[STC26] 알림 테스트 — 가상 컨퍼런스의 알림이 이 채널로 옵니다.')
  })

  it('리마인드: 멤버면 누구나 · 같은 시간 두 번째는 409 · 목록이 비면 보내지 않고 skipped', async () => {
    const row: ManualRow = { key: 'man:1', kind: 'manual_approval', project_id: P1, project_code: 'STC26', project_name: 'x', webhook: PROJECT_HOOK, total: 2, items: [{ title: '명찰', date: '2026-10-02T00:00:00Z' }, { title: '배너', date: null }] }
    const s = setup({ manual: row })
    const first = await s.call('POST', { action: 'remind', project_id: P1, target: 'approval' }, 'jwt-design')
    expect(await first.json()).toEqual({ sent: true, total: 2 })
    expect(s.posts[0].body.text).toContain('[STC26] 리마인드 — 컨펌 대기 2건: 명찰(기한 10/2), 배너')
    const again = await s.call('POST', { action: 'remind', project_id: P1, target: 'approval' }, 'jwt-design')
    expect(again.status).toBe(409)
    expect((await again.json()).error.message).toContain('한 시간 뒤')
    const empty = setup({ manual: { ...row, key: 'man:2', total: 0, items: [] } })
    expect(await (await empty.call('POST', { action: 'remind', project_id: P1, target: 'approval' }, 'jwt-pm')).json()).toEqual({ sent: false, total: 0 })
    expect(empty.marks).toEqual([{ keys: ['man:2'], status: 'skipped', error: undefined }])
    expect((await s.call('POST', { action: 'remind', project_id: P1, target: 'x' }, 'jwt-pm')).status).toBe(400)
  })

  it('채널이 없으면 테스트·리마인드는 409(무엇을 하면 되는지 문구)', async () => {
    const s = setup({ env: { SLACK_WEBHOOK_URL: '' } })
    const r = await s.call('POST', { action: 'test', project_id: P1 }, 'jwt-pm')
    expect(r.status).toBe(409)
    expect((await r.json()).error.message).toContain('행사 설정 ③')
  })
})

describe('DoD 68 · ⑤ 실패해도 막지 않는다', () => {
  it('Slack 거부(403) → failed + 사유 기록, 응답 200', async () => {
    const s = setup({ env: { SLACK_WEBHOOK_URL: GLOBAL_HOOK }, slackStatus: 403, events: [event({ key: 'act:1', action: 'version.uploaded' })] })
    const r = await s.call('POST', { action: 'drain' }, 'jwt-pm')
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ failed: 1, sent: 0 })
    expect(s.marks[0]).toMatchObject({ keys: ['act:1'], status: 'failed' })
    expect(s.marks[0].error).toContain('Slack 403')
  })

  it('연결 실패(예외)도 failed', async () => {
    const s = setup({ env: { SLACK_WEBHOOK_URL: GLOBAL_HOOK }, events: [event({ key: 'act:1', action: 'version.uploaded' })] })
    const r = await handleNotifyRequest(
      new Request(`${BASE}/api/notify`, { method: 'POST', headers: { authorization: 'Bearer jwt-pm' }, body: JSON.stringify({ action: 'drain' }) }),
      s.env,
      { store: s.store, fetchImpl: (async () => { throw new Error('ECONNRESET') }) as typeof fetch },
    )
    expect(await r.json()).toMatchObject({ failed: 1 })
    expect(s.marks[0].error).toContain('ECONNRESET')
  })
})

describe('DoD 68 · ⑥ 금액 비노출(§19.7)', () => {
  it('입력 행에 금액 키가 섞여 와도 Slack 본문에 0건', async () => {
    const tainted = {
      ...event({ key: 'act:1', action: 'approval.requested', webhook: PROJECT_HOOK }),
      total_amount: 12_345_678,
      breakdown: { a: 1 },
      contract_amount: 5_000_000,
      ordered_amount: 1,
      actual_amount: 2,
      markup: 3,
      margin: 4,
      settlement: 'x',
    } as EventRow
    const s = setup({ events: [tainted] })
    await s.call('POST', { action: 'drain' }, 'jwt-pm')
    const raw = JSON.stringify(s.posts)
    for (const k of ['total_amount', 'breakdown', 'contract_amount', 'ordered_amount', 'actual_amount', 'markup', 'margin', 'settlement', '12345678', '12,345,678', '5000000']) {
      expect(raw).not.toContain(k)
    }
    expect(Object.keys(s.posts[0].body).sort()).toEqual(['text', 'unfurl_links', 'unfurl_media'])
  })
})

describe('DoD 68 · ⑦ 알림 비밀은 서버 전용', () => {
  it('앱 소스(src — 테스트 제외)가 Slack·크론 비밀을 읽지 않고 · env 예시에 VITE_ 판이 없다', async () => {
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
    const leak = /VITE_SLACK|VITE_CRON|import\.meta\.env(\?\.|\.)(SLACK_WEBHOOK_URL|CRON_SECRET)/
    expect(files.filter((f) => leak.test(readFileSync(f, 'utf8')))).toEqual([])
    for (const file of ['.env.production.example', '.env.example']) {
      const text = readFileSync(resolve(ROOT, file), 'utf8')
      expect(text).toMatch(/^SLACK_WEBHOOK_URL=$/m)
      expect(text).toMatch(/^CRON_SECRET=$/m)
      expect(text).not.toMatch(/VITE_SLACK|VITE_CRON/)
    }
  })

  it('vercel.json 크론 = 하루 한 번(Hobby 한도) · /api/notify', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as { crons?: { path: string; schedule: string }[] }
    expect(cfg.crons).toEqual([{ path: '/api/notify', schedule: '0 0 * * *' }])
  })
})
