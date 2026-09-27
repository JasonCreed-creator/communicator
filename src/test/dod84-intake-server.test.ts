// DoD 84 (Phase 6.2 · 설계서 v2.15 §10 S0 · §8.7) — Slack 메시지로 행사 만들기(인테이크) · 견적서 첨부 · 행사 코드 자동: 순수 함수 + 서버.
// 가짜 Slack·가짜 저장소·가짜 AI 읽기·가짜 Drive로 돈다(실 DB 판정은 supabase:check '인테이크·견적서 첨부·AI 한도' 14항목).
//   ① 행사 코드: 단어 이니셜(영문·한글 초성·모음) + 연도 두 자리 · 한 단어면 음절 초성 · 겹치면 -2 · 글자 없으면 null · 자리표시 판정
//   ② 라벨 규칙: 행사명·일시(범위·시각)·장소·인원·주최·주제·대상 · 연도 없는 날짜 · 오후 시각 · 모객 낱말 · Slack 표기 정리 · 링크 추출
//   ③ AI 스키마·검사·병합: 구조화 출력 규약 · 개인정보 칸 0 · 틀린 날짜는 null · 종료 ≤ 시작 정리 · 라벨 값이 AI를 이긴다
//   ④ 서버 read: 로그인 · 빈 입력 · 글 붙여 넣기(키 없음 = 규칙 · 키 있음 = AI 병합 · AI 실패·한도 = 규칙 + 사유) · 링크(봇 없음 503 ·
//      권한 부족 403 스코프 안내 · 글·보낸 사람·첨부·링크·스레드 · 답글 링크는 replies) · 원문 미저장(응답만) · 응답에 토큰·키 0
//   ⑤ 서버 slack-file: 4MB 초과 413 · HTML 응답 = 권한 안내 403 · 성공 = 행사 폴더 02_견적·정산/견적서 · pm 아님 403
//   ⑥ Drive project-file(PUT): pm → 폴더 경로 · 로그 · design 403 · 종료 409 · id 400 · 4MB 초과 413
//   ⑦ 견적서 첨부 판정: https만 · kind · drive는 파일 id 필수 · 이름
import { describe, expect, it, vi } from 'vitest'
import type { AiReadOutput } from '../../api/_lib/ai/claude'
import type { AiUsageStore } from '../../api/_lib/ai/handler'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { handleIntakeRequest, INTAKE_SCOPES_MESSAGE, type IntakeEnv, type IntakeReadResult } from '../../api/_lib/intake/handler'
import { createSlackApi } from '../../api/_lib/notify/slack'
import { createDriveClient } from '../lib/drive/driveClient'
import {
  AI_EVENT_BRIEF_SCHEMA,
  aiEventBriefSystem,
  extractBriefByRules,
  extractLinks,
  findDates,
  findTimes,
  mergeBrief,
  resolveYear,
  slackTextToPlain,
  validateEventBrief,
  type EventBriefFields,
} from '../lib/intake/eventBrief'
import { codeLetter, codeStem, isPlaceholderCode, suggestProjectCode } from '../lib/projectCode'
import { normalizeQuoteAttachment, quoteAttachmentLabel } from '../lib/quoteAttachment'
import { parseSlackMessageLink } from '../lib/slackThread'
import { createFakeDrive } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'

const TODAY = new Date(2026, 8, 26) // 2026-09-26 (KST 기준 로컬)
const PRJ = '11111111-1111-4111-8111-111111111111'
const LINK = 'https://acme.slack.com/archives/C0PROJ001/p1727251234567890'
const REPLY_LINK = 'https://acme.slack.com/archives/C0PROJ001/p1727251299000000?thread_ts=1727251234.567890&cid=C0PROJ001'

const SAMPLE = [
  '행사명: 가상 테크 포럼 2027',
  '일시: 2027. 3. 12(금) 14:00~18:00',
  '장소: 가상홀 A',
  '인원: 약 300명',
  '고객사: 가상테크㈜',
  '주제: 개발자 생태계의 다음 10년',
  '대상: 개발 리더·CTO',
  '참가 신청 페이지 필요, 동시통역 2개 언어, 생중계 검토',
].join('\n')

// ── ① 행사 코드 ───────────────────────────────────────────────────────

describe('DoD 84 · ① 행사 코드 자동', () => {
  it('글자 하나: 영문 대문자 · 한글 초성(ㅇ은 모음) · 숫자·기호 없음', () => {
    expect(codeLetter('S')).toBe('S')
    expect(codeLetter('b')).toBe('B')
    expect(codeLetter('서')).toBe('S')
    expect(codeLetter('컨')).toBe('K')
    expect(codeLetter('아')).toBe('A')
    expect(codeLetter('이')).toBe('I')
    expect(codeLetter('오')).toBe('O')
    expect(codeLetter('리')).toBe('R')
    expect(codeLetter('7')).toBeNull()
    expect(codeLetter('·')).toBeNull()
  })

  it('행사명 → 코드: 이니셜 최대 4 + 연도(행사일 → 이름 속 연도 → 올해) · 한 단어면 음절 초성 · 글자 없으면 null', () => {
    expect(suggestProjectCode('서울 테크 컨퍼런스 2026', { today: TODAY })).toBe('STK26')
    expect(suggestProjectCode('서울 테크 Conference 2026', { today: TODAY })).toBe('STC26')
    expect(suggestProjectCode('리멤버 빌드 2027', { today: TODAY })).toBe('RB27')
    expect(suggestProjectCode('Virtual Summit 2026', { today: TODAY })).toBe('VS26')
    expect(suggestProjectCode('가상 테크 포럼 2027', { eventDate: '2027-03-12' })).toBe('GTP27')
    // 행사일이 이름 속 연도보다 먼저
    expect(suggestProjectCode('서울 테크 컨퍼런스 2026', { eventDate: '2027-01-10' })).toBe('STK27')
    // 다섯 단어 → 앞 4자
    expect(codeStem('글로벌 인재 채용 박람회 서울')).toBe('GICB')
    // 한 단어 → 음절 초성
    expect(suggestProjectCode('리멤버데이', { today: TODAY })).toBe('RMBD26')
    expect(suggestProjectCode('Buildup', { today: TODAY })).toBe('BUIL26')
    // 글자 없음
    expect(suggestProjectCode('2026', { today: TODAY })).toBeNull()
    expect(suggestProjectCode('   ', { today: TODAY })).toBeNull()
  })

  it('겹치면 -2, -3(대소문자 무관) · 자리표시 코드(EVT-…·빈 칸)만 자동이 덮어쓴다', () => {
    expect(suggestProjectCode('서울 테크 컨퍼런스 2026', { today: TODAY, taken: ['stk26'] })).toBe('STK26-2')
    expect(suggestProjectCode('서울 테크 컨퍼런스 2026', { today: TODAY, taken: ['STK26', 'STK26-2'] })).toBe('STK26-3')
    expect(isPlaceholderCode('EVT-101')).toBe(true)
    expect(isPlaceholderCode('EVT-MFZ9K2')).toBe(true)
    expect(isPlaceholderCode('')).toBe(true)
    expect(isPlaceholderCode('STC26')).toBe(false)
    expect(isPlaceholderCode('EVTX')).toBe(false)
  })
})

// ── ② 라벨 규칙 ───────────────────────────────────────────────────────

describe('DoD 84 · ② 라벨 규칙', () => {
  it('라벨 줄 → 행사명·일시(시각 범위)·장소·인원·고객사·주제·대상 · 모객 낱말 → recruiting', () => {
    const { fields, matched } = extractBriefByRules(SAMPLE, TODAY)
    expect(fields).toMatchObject<Partial<EventBriefFields>>({
      name: '가상 테크 포럼 2027',
      event_date: '2027-03-12',
      event_end_date: null,
      start_time: '14:00',
      end_time: '18:00',
      venue: '가상홀 A',
      expected_headcount: 300,
      organizer: '가상테크㈜',
      theme: '개발자 생태계의 다음 10년',
      target_audience: '개발 리더·CTO',
      event_type: 'recruiting',
      notes: null,
    })
    expect(matched).toEqual(expect.arrayContaining(['name', 'event_date', 'start_time', 'end_time', 'venue', 'expected_headcount', 'organizer', 'theme', 'target_audience', 'event_type']))
  })

  it('날짜: 연도 없는 10/15은 올해(이미 한 달 넘게 지났으면 내년) · 범위 10.15~16 · 2026.10.15 ~ 2026.10.16 · 시각 오후 2시~6시', () => {
    expect(resolveYear(10, 15, TODAY)).toBe(2026)
    expect(resolveYear(3, 2, TODAY)).toBe(2027) // 3/2는 6개월 전 → 내년
    expect(resolveYear(9, 1, TODAY)).toBe(2026) // 25일 전 — 한 달 안 → 올해(막 지난 행사 정리 요청일 수 있다)
    expect(findDates('10/15 오픈', TODAY)[0]).toMatchObject({ start: '2026-10-15', end: null })
    expect(findDates('기간 10.15~16', TODAY)[0]).toMatchObject({ start: '2026-10-15', end: '2026-10-16' })
    expect(findDates('2026.10.15 ~ 2026.10.16', TODAY)[0]).toMatchObject({ start: '2026-10-15', end: '2026-10-16' })
    expect(findDates('2027년 3월 12일(금)', TODAY)[0]).toMatchObject({ start: '2027-03-12', end: null })
    expect(findDates('13/45', TODAY)).toEqual([])
    expect(findTimes('오후 2시~6시')).toEqual({ start: '14:00', end: '18:00' })
    expect(findTimes('14:00-18:30')).toEqual({ start: '14:00', end: '18:30' })
    expect(findTimes('오전 10시 30분 시작')).toEqual({ start: '10:30', end: null })
    expect(findTimes('300명')).toBeNull()
  })

  it('라벨 없는 글: 첫 날짜·"300명"만 조심스럽게 · 행사명은 읽지 않는다(추측 금지)', () => {
    const { fields } = extractBriefByRules('다음 달 10월 15일에 가상홀에서 300명 규모로 진행합니다. 모객은 없습니다.', TODAY)
    expect(fields.name).toBeNull()
    expect(fields.venue).toBeNull()
    expect(fields.event_date).toBe('2026-10-15')
    expect(fields.expected_headcount).toBe(300)
    expect(fields.event_type).toBe('recruiting') // '모객'이라는 낱말 — 확인은 사람 몫(주황 표시)
  })

  it('Slack 표기 정리 · 링크 추출(라벨 표기·맨 URL·중복 제거·견적서 같음)', () => {
    expect(slackTextToPlain('<@U0PM00001> 확인 부탁 <https://docs.google.com/spreadsheets/d/x|견적 시트> &amp; <#C0PROJ001|행사-채널>')).toBe(
      '@담당자 확인 부탁 견적 시트 (https://docs.google.com/spreadsheets/d/x) & #행사-채널',
    )
    const links = extractLinks('<https://docs.google.com/spreadsheets/d/x|견적 시트> 그리고 https://example.com/brief.pdf, https://example.com/brief.pdf 참고 https://blog.example.com/post')
    expect(links.map((l) => l.url)).toEqual(['https://docs.google.com/spreadsheets/d/x', 'https://example.com/brief.pdf', 'https://blog.example.com/post'])
    expect(links.map((l) => l.looks_like_quote)).toEqual([true, true, false])
    expect(links[0].label).toBe('견적 시트')
  })
})

// ── ③ AI 스키마·검사·병합 ─────────────────────────────────────────────

describe('DoD 84 · ③ AI 스키마 · 검사 · 병합', () => {
  it('구조화 출력 규약 + 개인정보 칸 0 + 규칙 문장(오늘 · 추측 금지 · 사람 이름 금지)', () => {
    const raw = JSON.stringify(AI_EVENT_BRIEF_SCHEMA)
    expect(AI_EVENT_BRIEF_SCHEMA.additionalProperties).toBe(false)
    expect([...AI_EVENT_BRIEF_SCHEMA.required].sort()).toEqual(Object.keys(AI_EVENT_BRIEF_SCHEMA.properties).sort())
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern']) expect(raw).not.toContain(`"${k}"`)
    for (const k of ['contact', 'phone', 'email', 'manager', 'account', 'amount', 'price']) expect(Object.keys(AI_EVENT_BRIEF_SCHEMA.properties)).not.toContain(k)
    const sys = aiEventBriefSystem(TODAY)
    expect(sys).toContain('오늘은 2026-09-26')
    expect(sys).toContain('추측하지 않습니다')
    expect(sys).toContain('사람 이름·직함·전화번호·이메일은 어떤 칸에도')
  })

  it('검사: 틀린 날짜·시각은 null · 종료 ≤ 시작이면 종료 null · 종료만 있으면 시작으로 · 인원 범위 · 객체 아니면 오류', () => {
    const v = validateEventBrief({
      name: ' 가상 포럼 ',
      event_date: '2027-02-30',
      event_end_date: '2027-03-01',
      start_time: '25:00',
      end_time: '9:00',
      venue: null,
      expected_headcount: 0,
      organizer: 'x',
      theme: null,
      target_audience: null,
      event_type: 'maybe',
      notes: null,
    })
    expect(v).toMatchObject({ name: '가상 포럼', event_date: '2027-03-01', event_end_date: null, start_time: null, end_time: null, expected_headcount: null, event_type: null })
    expect(validateEventBrief({ event_date: '2027-03-12', event_end_date: '2027-03-12' } as never)).toMatchObject({ event_date: '2027-03-12', event_end_date: null })
    expect(() => validateEventBrief(null)).toThrow()
  })

  it('병합: 라벨이 명시한 칸은 AI가 바꾸지 못하고, 빈 칸만 AI가 채운다', () => {
    const rules = extractBriefByRules('행사명: 가상 포럼\n장소: 가상홀', TODAY)
    const ai: EventBriefFields = { ...rules.fields, name: 'AI가 바꾼 이름', venue: '다른 홀', expected_headcount: 200, notes: '동시통역' }
    const merged = mergeBrief(rules, ai)
    expect(merged.name).toBe('가상 포럼')
    expect(merged.venue).toBe('가상홀')
    expect(merged.expected_headcount).toBe(200)
    expect(merged.notes).toBe('동시통역')
    expect(mergeBrief(rules, null)).toEqual(rules.fields)
  })

  it('메시지 링크 파싱: 글 ts · 답글이면 thread_ts · DM·http 거부', () => {
    expect(parseSlackMessageLink(LINK)).toEqual({ channel: 'C0PROJ001', ts: '1727251234.567890', thread_ts: null })
    expect(parseSlackMessageLink(REPLY_LINK)).toEqual({ channel: 'C0PROJ001', ts: '1727251299.000000', thread_ts: '1727251234.567890' })
    expect(parseSlackMessageLink('https://acme.slack.com/archives/D0DM00001/p1727251234567890')).toBeNull()
    expect(parseSlackMessageLink('http://acme.slack.com/archives/C0PROJ001/p1727251234567890')).toBeNull()
    expect(parseSlackMessageLink('행사명: x')).toBeNull()
  })
})

// ── ④⑤ 서버 ──────────────────────────────────────────────────────────

const ENV: IntakeEnv = {
  SUPABASE_URL: 'https://db.example.com',
  SUPABASE_SECRET_KEY: 'server-secret',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable',
}

function fakeSlackFetch(opts: { scopeError?: string; files?: boolean; text?: string; fileBody?: Uint8Array; fileHtml?: boolean } = {}) {
  const calls: { method: string | null; body: Record<string, string>; url: string }[] = []
  const message = (ts: string, thread?: string) => ({
    ts,
    user: 'U0SALES01',
    text: opts.text ?? SAMPLE.replace('고객사: 가상테크㈜', '고객사: 가상테크㈜ <https://docs.google.com/spreadsheets/d/x|견적 시트>'),
    ...(thread ? { thread_ts: thread } : {}),
    ...(opts.files === false
      ? {}
      : {
          files: [
            { id: 'F0QUOTE01', name: '가상_견적서.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 24_000, url_private_download: 'https://files.slack.com/files-pri/T0/F0QUOTE01/download/quote.xlsx' },
            { id: 'F0PHOTO01', name: 'venue.jpg', mimetype: 'image/jpeg', size: 5_000_000, url_private_download: 'https://files.slack.com/files-pri/T0/F0PHOTO01/download/venue.jpg' },
          ],
        }),
  })
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('https://files.slack.com/')) {
      calls.push({ method: 'download', body: {}, url: u })
      if (opts.fileHtml) return new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })
      return new Response(opts.fileBody ?? new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]), { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    }
    const method = u.startsWith('https://slack.com/api/') ? u.slice('https://slack.com/api/'.length) : null
    const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')))
    calls.push({ method, body, url: u })
    if (opts.scopeError) return Response.json({ ok: false, error: opts.scopeError })
    if (method === 'conversations.history') return Response.json({ ok: true, messages: [message(body.latest)] })
    if (method === 'conversations.replies') return Response.json({ ok: true, messages: [message(body.ts, '1727251234.567890')] })
    if (method === 'users.info') return Response.json({ ok: true, user: { id: body.user, real_name: '김영업', profile: { display_name: '영업 김' } } })
    if (method === 'files.info') {
      const f = body.file === 'F0QUOTE01'
        ? { id: 'F0QUOTE01', name: '가상_견적서.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 24_000, url_private_download: 'https://files.slack.com/files-pri/T0/F0QUOTE01/download/quote.xlsx' }
        : body.file === 'F0PHOTO01'
          ? { id: 'F0PHOTO01', name: 'venue.jpg', mimetype: 'image/jpeg', size: 5_000_000, url_private_download: 'https://files.slack.com/files-pri/T0/F0PHOTO01/download/venue.jpg' }
          : null
      return Response.json(f ? { ok: true, file: f } : { ok: false, error: 'file_not_found' })
    }
    return Response.json({ ok: false, error: 'unknown_method' })
  }) as typeof fetch
  return { fetchImpl, calls, slack: createSlackApi('xoxb-test-token', fetchImpl) }
}

function fakeUsage(claimImpl?: () => Promise<{ id: string; used: number; limit: number }>) {
  const finishes: { status: string; error: string | null }[] = []
  const usage: AiUsageStore = {
    async claim(_t, _p, _f, limit) {
      return claimImpl ? claimImpl() : { id: 'use-1', used: 1, limit }
    },
    async finish(_id, status, _m, _i, _o, error) {
      finishes.push({ status, error })
    },
  }
  return { usage, finishes }
}

const store = { async authProfile(jwt: string) { return jwt === 'jwt-pm' || jwt === 'jwt-design' ? { id: jwt === 'jwt-pm' ? 'p-pm' : 'p-design' } : null } }

function aiJson(json: unknown | null, stop = 'end_turn'): (content: unknown) => Promise<AiReadOutput> {
  return async () => ({ json, stop_reason: stop, model: 'claude-sonnet-5', input_tokens: 900, output_tokens: 120 })
}

async function call(action: string, body: unknown, env: IntakeEnv, deps: Record<string, unknown>, jwt: string | null = 'jwt-pm') {
  const res = await handleIntakeRequest(
    new Request(`https://app.example.com/api/intake?action=${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify(body),
    }),
    env,
    deps as never,
  )
  const raw = await res.text()
  return { status: res.status, body: JSON.parse(raw) as Record<string, any>, raw }
}

describe('DoD 84 · ④ api/intake read', () => {
  it('GET = 준비 상태만(값 없음)', async () => {
    const r = await handleIntakeRequest(new Request('https://x/api/intake'), { ...ENV, SLACK_BOT_TOKEN: 'xoxb-secret', ANTHROPIC_API_KEY: 'k' })
    const text = await r.text()
    expect(JSON.parse(text)).toEqual({ slack: true, ai: true, daily_limit: 30 })
    expect(text).not.toContain('xoxb')
    const off = await (await handleIntakeRequest(new Request('https://x/api/intake'), ENV)).json()
    expect(off).toEqual({ slack: false, ai: false, daily_limit: 30 })
  })

  it('로그인 401(헤더 없음 · 모르는 세션) · 빈 입력 400 · 모르는 동작 400', async () => {
    expect((await call('read', { text: 'x' }, ENV, { store }, null)).status).toBe(401)
    expect((await call('read', { text: 'x' }, ENV, { store }, 'jwt-nobody')).status).toBe(401)
    const empty = await call('read', {}, ENV, { store })
    expect(empty.status).toBe(400)
    expect(empty.body.error.message).toContain('붙여 주세요')
    expect((await call('other', { text: 'x' }, ENV, { store })).status).toBe(400)
  })

  it('글 붙여 넣기 + AI 키 없음 → 라벨 규칙 · method rules · 사유 · 원문은 응답으로만 · 링크 목록', async () => {
    const r = await call('read', { text: `${SAMPLE}\n견적: <https://docs.google.com/spreadsheets/d/x|견적 시트>` }, ENV, { store })
    expect(r.status).toBe(200)
    const out = r.body as IntakeReadResult
    expect(out.source).toBe('text')
    expect(out.method).toBe('rules')
    expect(out.ai_note).toContain('AI 키가 없어')
    expect(out.fields.name).toBe('가상 테크 포럼 2027')
    expect(out.fields.event_date).toBe('2027-03-12')
    expect(out.filled).toEqual(expect.arrayContaining(['name', 'event_date', 'venue', 'expected_headcount']))
    expect(out.links[0]).toMatchObject({ url: 'https://docs.google.com/spreadsheets/d/x', looks_like_quote: true, label: '견적 시트' })
    expect(out.message).toBeNull()
    expect(out.files).toEqual([])
  })

  it('AI 키 있음 → 선점(project_intake · 행사 id) → AI가 빈 칸을 채우고 라벨 값은 그대로 · 기록 ok', async () => {
    const { usage, finishes } = fakeUsage()
    const claimed: unknown[] = []
    usage.claim = async (jwt, projectId, feature, limit) => {
      claimed.push([jwt, projectId, feature, limit])
      return { id: 'use-9', used: 2, limit }
    }
    const reader = aiJson({
      name: 'AI 이름(무시돼야 함)',
      event_date: '2027-03-12',
      event_end_date: null,
      start_time: '14:00',
      end_time: '18:00',
      venue: 'AI 장소(무시)',
      expected_headcount: 300,
      organizer: '가상테크㈜',
      theme: null,
      target_audience: null,
      event_type: 'recruiting',
      notes: '동시통역 2개 언어, 생중계 검토',
    })
    const r = await call('read', { text: SAMPLE, project_id: PRJ }, { ...ENV, ANTHROPIC_API_KEY: 'test-key', AI_DAILY_LIMIT: '7' }, { store, usage, reader })
    expect(r.status).toBe(200)
    expect(claimed).toEqual([['jwt-pm', PRJ, 'project_intake', 7]])
    const out = r.body as IntakeReadResult
    expect(out.method).toBe('ai')
    expect(out.ai_note).toBeNull()
    expect(out.fields.name).toBe('가상 테크 포럼 2027')
    expect(out.fields.venue).toBe('가상홀 A')
    expect(out.fields.notes).toBe('동시통역 2개 언어, 생중계 검토')
    expect(finishes).toEqual([{ status: 'ok', error: null }])
    expect(r.raw).not.toContain('test-key')
  })

  it('AI 실패·거절·한도는 인테이크를 막지 않는다 — 규칙 결과 + 사유 · 기록 failed/unreadable · 권한 오류(403)는 그대로', async () => {
    const boom = fakeUsage()
    const failed = await call('read', { text: SAMPLE }, { ...ENV, ANTHROPIC_API_KEY: 'k' }, { store, usage: boom.usage, reader: async () => { throw new Error('network') } })
    expect(failed.status).toBe(200)
    expect(failed.body.method).toBe('rules')
    expect(failed.body.ai_note).toContain('AI 읽기에 실패')
    expect(boom.finishes).toEqual([{ status: 'failed', error: 'shape' }])

    const refused = fakeUsage()
    const ref = await call('read', { text: SAMPLE }, { ...ENV, ANTHROPIC_API_KEY: 'k' }, { store, usage: refused.usage, reader: aiJson(null, 'refusal') })
    expect(ref.body.method).toBe('rules')
    expect(refused.finishes).toEqual([{ status: 'unreadable', error: 'refusal' }])

    const { AiError } = await import('../../api/_lib/ai/handler')
    const limited = fakeUsage(async () => { throw new AiError(429, 'rate_limited', '오늘 AI 읽기 30회를 모두 썼습니다 — 내일(한국 시각 0시) 다시 쓸 수 있습니다.') })
    const lim = await call('read', { text: SAMPLE }, { ...ENV, ANTHROPIC_API_KEY: 'k' }, { store, usage: limited.usage, reader: aiJson({}) })
    expect(lim.status).toBe(200)
    expect(lim.body.method).toBe('rules')
    expect(lim.body.ai_note).toContain('모두 썼습니다')

    const forbidden = fakeUsage(async () => { throw new AiError(403, 'forbidden', '이 행사의 담당자만 쓸 수 있습니다.') })
    expect((await call('read', { text: SAMPLE, project_id: PRJ }, { ...ENV, ANTHROPIC_API_KEY: 'k' }, { store, usage: forbidden.usage })).status).toBe(403)
    // 짧은 글(20자 미만)은 AI를 부르지 않는다
    const short = fakeUsage()
    const s = await call('read', { text: '행사명: 포럼' }, { ...ENV, ANTHROPIC_API_KEY: 'k' }, { store, usage: short.usage, reader: aiJson({}) })
    expect(s.body.method).toBe('rules')
    expect(short.finishes).toEqual([])
  })

  it('링크: 봇 없음 503 · 권한 부족 403 스코프 안내 · 봇이 채널에 없음 403 · 링크 아님 400', async () => {
    const noBot = await call('read', { link: LINK }, ENV, { store })
    expect(noBot.status).toBe(503)
    expect(noBot.body.error.message).toContain('붙여 넣어')
    const scope = fakeSlackFetch({ scopeError: 'missing_scope' })
    const sc = await call('read', { link: LINK }, { ...ENV, SLACK_BOT_TOKEN: 'xoxb-t' }, { store, slack: scope.slack })
    expect(sc.status).toBe(403)
    expect(sc.body.error.message).toBe(INTAKE_SCOPES_MESSAGE)
    expect(INTAKE_SCOPES_MESSAGE).toContain('channels:history')
    expect(INTAKE_SCOPES_MESSAGE).toContain('files:read')
    const nic = fakeSlackFetch({ scopeError: 'not_in_channel' })
    expect((await call('read', { link: LINK }, { ...ENV, SLACK_BOT_TOKEN: 'xoxb-t' }, { store, slack: nic.slack })).status).toBe(403)
    const bad = await call('read', { link: 'https://acme.slack.com/archives/D0DM00001/p1727251234567890' }, { ...ENV, SLACK_BOT_TOKEN: 'xoxb-t' }, { store, slack: nic.slack })
    expect(bad.status).toBe(400)
  })

  it('링크: 글·보낸 사람(표시 이름)·시각·첨부(견적서 같음)·링크·스레드 ts · 답글 링크는 replies · 규칙으로 읽음', async () => {
    const f = fakeSlackFetch()
    const r = await call('read', { link: LINK, project_id: PRJ }, { ...ENV, SLACK_BOT_TOKEN: 'xoxb-t' }, { store, slack: f.slack })
    expect(r.status).toBe(200)
    const out = r.body as IntakeReadResult
    expect(out.source).toBe('slack')
    expect(out.message).toMatchObject({
      permalink: 'https://slack.com/archives/C0PROJ001/p1727251234567890',
      posted_by: '영업 김',
      posted_at: '2024-09-25T08:00:34.000Z',
      channel: 'C0PROJ001',
      thread_ts: '1727251234.567890',
    })
    expect(out.message!.text).toContain('견적 시트 (https://docs.google.com/spreadsheets/d/x)')
    expect(out.files).toEqual([
      { id: 'F0QUOTE01', name: '가상_견적서.xlsx', mimetype: expect.stringContaining('spreadsheet'), size: 24_000, looks_like_quote: true },
      { id: 'F0PHOTO01', name: 'venue.jpg', mimetype: 'image/jpeg', size: 5_000_000, looks_like_quote: false },
    ])
    expect(out.links.map((l) => l.url)).toEqual(['https://docs.google.com/spreadsheets/d/x'])
    expect(out.fields.name).toBe('가상 테크 포럼 2027')
    expect(f.calls.map((c) => c.method)).toEqual(['conversations.history', 'users.info'])
    expect(f.calls[0].body).toMatchObject({ channel: 'C0PROJ001', latest: '1727251234.567890', oldest: '1727251234.567890', inclusive: 'true', limit: '1' })
    // 응답에 토큰 없음
    expect(r.raw).not.toContain('xoxb')

    const g = fakeSlackFetch()
    const reply = await call('read', { link: REPLY_LINK }, { ...ENV, SLACK_BOT_TOKEN: 'xoxb-t' }, { store, slack: g.slack })
    expect(reply.status).toBe(200)
    expect(g.calls[0].method).toBe('conversations.replies')
    expect(g.calls[0].body.ts).toBe('1727251299.000000')
    expect(reply.body.message.permalink).toBe('https://slack.com/archives/C0PROJ001/p1727251299000000?thread_ts=1727251234.567890&cid=C0PROJ001')
    expect(reply.body.message.thread_ts).toBe('1727251234.567890')
  })
})

function driveSetup() {
  const drive = createFakeDrive({ accountEmail: 'owner@company.example' })
  const db = createFakeDriveStore()
  const env: DriveEnv = {
    DRIVE_ROOT_FOLDER_ID: drive.rootId,
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    SUPABASE_SECRET_KEY: 'test-signing-secret-not-a-real-key',
  }
  db.refreshToken = 'refresh-token-1'
  db.addUser({ jwt: 'jwt-pm', authUserId: 'auth-pm', email: 'pm@example.com', profileId: 'p-pm', appRole: 'sales' })
  db.addUser({ jwt: 'jwt-design', authUserId: 'auth-design', email: 'design@example.com', profileId: 'p-design', appRole: 'staff' })
  db.addProject({ id: PRJ, code: 'GTP27', name: '가상 테크 포럼', event_date: '2027-03-12', status: 'active', drive_root_folder_id: null })
  db.addProject({ id: '22222222-2222-4222-8222-222222222222', code: 'OLD25', name: '끝난 행사', event_date: '2025-01-10', status: 'closed', drive_root_folder_id: null })
  db.addMember('p-pm', PRJ, 'pm')
  db.addMember('p-pm', '22222222-2222-4222-8222-222222222222', 'pm')
  db.addMember('p-design', PRJ, 'design')
  const deps = { store: db.store, fetchImpl: drive.fetch, now: () => Date.parse('2026-09-26T03:00:00Z'), sleep: async () => undefined }
  return { drive, db, env, deps }
}

describe('DoD 84 · ⑤ api/intake slack-file → 행사 폴더', () => {
  it('Slack 첨부(4MB 이하)를 봇으로 내려받아 02_견적·정산/견적서에 · 파일 id·주소 · pm 아님 403 · 4MB 초과 413 · HTML 응답 403 · id 형식 400', async () => {
    clearTokenCache()
    const d = driveSetup()
    const f = fakeSlackFetch()
    const env: IntakeEnv = { ...ENV, ...d.env, SLACK_BOT_TOKEN: 'xoxb-t' }
    const deps = { store, slack: f.slack, slackFetch: f.fetchImpl, drive: d.deps }
    const ok = await call('slack-file', { project_id: PRJ, file_id: 'F0QUOTE01' }, env, deps)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ file_name: '가상_견적서.xlsx', mimetype: expect.stringContaining('spreadsheet') })
    const file = d.drive.files.get(ok.body.file_id)!
    expect(file.name).toBe('가상_견적서.xlsx')
    const folder = d.drive.files.get(file.parents[0])!
    expect(folder.name).toBe('견적서')
    expect(d.drive.files.get(folder.parents[0])!.name).toBe('02_견적·정산')
    expect(d.db.logs.some((l) => l.action === 'drive.project_file' && l.projectId === PRJ)).toBe(true)
    expect(f.calls.some((c) => c.method === 'download' && c.url.startsWith('https://files.slack.com/'))).toBe(true)

    expect((await call('slack-file', { project_id: PRJ, file_id: 'F0QUOTE01' }, env, deps, 'jwt-design')).status).toBe(403)
    expect((await call('slack-file', { project_id: PRJ, file_id: 'F0PHOTO01' }, env, deps)).status).toBe(413)
    expect((await call('slack-file', { project_id: PRJ, file_id: 'bad id' }, env, deps)).status).toBe(400)
    const html = fakeSlackFetch({ fileHtml: true })
    const h = await call('slack-file', { project_id: PRJ, file_id: 'F0QUOTE01' }, env, { ...deps, slack: html.slack, slackFetch: html.fetchImpl })
    expect(h.status).toBe(403)
    expect(h.body.error.message).toBe(INTAKE_SCOPES_MESSAGE)
    expect((await call('slack-file', { project_id: PRJ, file_id: 'F0QUOTE01' }, ENV, { store })).status).toBe(503)
  })
})

describe('DoD 84 · ⑥ api/drive project-file(PUT)', () => {
  it('pm → 행사 폴더 02_견적·정산/견적서 · 보기 주소 · 로그 / design 403 · 종료 409 · id 400 · 4MB 초과 413 · 빈 파일 400', async () => {
    clearTokenCache()
    const d = driveSetup()
    const appFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      handleDriveRequest(new Request(new URL(String(input), 'https://app.example.com'), init), d.env, d.deps)) as typeof fetch
    const clientAs = (jwt: string | null) => createDriveClient({ apiBase: '/api', accessToken: async () => jwt, fetchImpl: appFetch, sleep: async () => undefined })
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]).buffer as ArrayBuffer
    const r = await clientAs('jwt-pm').projectFile(PRJ, '가상 견적서.pdf', data, 'application/pdf')
    const file = d.drive.files.get(r.file_id)!
    expect(file.name).toBe('가상 견적서.pdf')
    expect(file.mimeType).toBe('application/pdf')
    expect(d.drive.files.get(d.drive.files.get(file.parents[0])!.parents[0])!.name).toBe('02_견적·정산')
    expect(r.url).toContain(r.file_id)
    expect(d.db.logs.some((l) => l.action === 'drive.project_file')).toBe(true)

    const put = (jwt: string | null, projectId: string, bytes: Uint8Array) =>
      handleDriveRequest(
        new Request(`https://app.example.com/api/drive?action=project-file&project_id=${projectId}&name=q.pdf`, {
          method: 'PUT',
          headers: { 'content-type': 'application/pdf', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
          body: bytes,
        }),
        d.env,
        d.deps,
      )
    expect((await put('jwt-design', PRJ, new Uint8Array(8))).status).toBe(403)
    expect((await put('jwt-pm', '22222222-2222-4222-8222-222222222222', new Uint8Array(8))).status).toBe(409)
    expect((await put('jwt-pm', 'nope', new Uint8Array(8))).status).toBe(400)
    expect((await put('jwt-pm', PRJ, new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(413)
    expect((await put('jwt-pm', PRJ, new Uint8Array(0))).status).toBe(400)
    expect((await put(null, PRJ, new Uint8Array(8))).status).toBe(401)
  })
})

describe('DoD 84 · ⑦ 견적서 첨부 판정', () => {
  it('https만 · kind drive|link · drive는 파일 id 필수 · null = 지움 · 이름(구글 시트 · Drive 파일 · 호스트 · 파일 이름)', () => {
    expect(normalizeQuoteAttachment(null)).toBeNull()
    expect(normalizeQuoteAttachment('x')).toBe('invalid')
    expect(normalizeQuoteAttachment({ kind: 'link', url: 'http://insecure.example' })).toBe('invalid')
    expect(normalizeQuoteAttachment({ kind: 'drive', url: 'https://drive.google.com/file/d/1/view' })).toBe('invalid')
    expect(normalizeQuoteAttachment({ kind: 'link', url: ' https://docs.google.com/spreadsheets/d/x ' })).toMatchObject({
      kind: 'link',
      url: 'https://docs.google.com/spreadsheets/d/x',
      file_name: null,
      drive_file_id: null,
      source: 'link',
    })
    const d = normalizeQuoteAttachment({ kind: 'drive', url: 'https://drive.google.com/file/d/1/view', drive_file_id: '1', file_name: '견적.pdf', source: 'slack', added_at: '2026-09-26T00:00:00.000Z' })
    expect(d).toMatchObject({ kind: 'drive', drive_file_id: '1', file_name: '견적.pdf', source: 'slack', added_at: '2026-09-26T00:00:00.000Z' })
    expect(quoteAttachmentLabel({ kind: 'link', url: 'https://docs.google.com/spreadsheets/d/x', file_name: null, drive_file_id: null, source: 'link', added_at: '' })).toBe('구글 시트')
    expect(quoteAttachmentLabel({ kind: 'link', url: 'https://drive.google.com/file/d/1', file_name: null, drive_file_id: null, source: 'link', added_at: '' })).toBe('Drive 파일')
    expect(quoteAttachmentLabel({ kind: 'link', url: 'https://www.example.com/q', file_name: null, drive_file_id: null, source: 'link', added_at: '' })).toBe('example.com')
    expect(quoteAttachmentLabel({ kind: 'drive', url: 'https://x', file_name: '견적.pdf', drive_file_id: '1', source: 'upload', added_at: '' })).toBe('견적.pdf')
  })

  it('봇 비밀·키가 소스에 새지 않는다 — 인테이크 파일의 절대 주소는 slack.com·files.slack.com뿐', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../api/_lib/intake/handler.ts'), 'utf8')
    const hosts = [...new Set((src.match(/https:\/\/[a-z0-9.-]+/g) ?? []))].sort()
    expect(hosts).toEqual(['https://slack.com'])
    // 파일 내려받기는 Slack이 준 주소를 호스트로 검사한다(files.slack.com·*.slack.com만)
    expect(src).toContain("u.hostname === 'files.slack.com'")
    expect(vi.isMockFunction(fetch)).toBe(false)
  })
})
