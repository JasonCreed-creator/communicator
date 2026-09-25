/** @vitest-environment jsdom */
// DoD 68 (Phase 6 · 설계서 v2.10.1 §9) — 앱 쪽 알림 연동.
//   ① 신호: 사건 직후 보내고 잊는다(묶음 1회 · keepalive · 로그인 없으면 안 보냄 · 실패해도 조용) · 발주처·파트너 화면은 링크 토큰으로
//   ② 사건 지점: 새 버전·컨펌 발송·발주처 결정·파트너 제출·새 지시 경로가 신호를 보낸다(소스 가드 — 기다리지 않는다)
//   ③ 행사 설정 ③ Slack 카드: 행사 채널 등록·해제(pm) · 형식 검증 · 가림 표시 · 공용 채널·크론 상태 · 테스트 보내기 · mock은 사실만
//   ④ 홈 리마인드: 실서버는 Slack으로(건수·없음·시간당 1회 문구) · mock은 보내는 흉내 없음
//   ⑤ `?project=` 링크: 목록에 있는 행사로 전환하고 주소에서 지운다(모르는 id는 무시)
// 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 이어진다(testUtils 주석).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../lib/errors'
import { createNotifyClient, type NotifyClient } from '../lib/notify/notifyClient'
import { setNotifyGateway } from '../lib/notify/notifyGateway'
import { isSlackWebhookUrl, maskSlackWebhook, normalizeSlackWebhook } from '../lib/slackWebhook'
import { mockProvider, renderRoute } from './testUtils'

const HOOK = 'https://hooks.slack.com/services/T000/B000/abcdefSECRET'

afterEach(() => {
  cleanup()
  setNotifyGateway(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function fakeClient(over: Partial<NotifyClient> = {}): NotifyClient {
  return {
    status: async () => ({ slack: false, cron: true }),
    ping: () => undefined,
    pingToken: () => undefined,
    test: async () => ({ sent: true, channel: 'project' }),
    remind: async () => ({ sent: true, total: 1 }),
    ...over,
  }
}

describe('DoD 68 · ① 신호 — 보내고 잊는다', () => {
  it('짧은 시간의 여러 신호는 한 번으로 묶고 · 로그인 토큰을 Bearer로 · keepalive', async () => {
    vi.useFakeTimers()
    const calls: { url: string; init: RequestInit }[] = []
    const client = createNotifyClient({
      apiBase: '/api',
      accessToken: async () => 'jwt-1',
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response('{}')
      }) as unknown as typeof fetch,
    })
    client.ping()
    client.ping()
    client.ping()
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/notify')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: 'drain' })
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer jwt-1')
    expect(calls[0].init.keepalive).toBe(true)
  })

  it('로그인 세션이 없으면 보내지 않고 · 서버·네트워크 실패도 삼킨다(본 동작을 막지 않는다)', async () => {
    vi.useFakeTimers()
    let n = 0
    const noSession = createNotifyClient({ apiBase: '/api', accessToken: async () => null, fetchImpl: (async () => { n++; return new Response('{}') }) as typeof fetch })
    noSession.ping()
    await vi.advanceTimersByTimeAsync(1000)
    expect(n).toBe(0)
    const failing = createNotifyClient({ apiBase: '/api', accessToken: async () => 'jwt', fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch })
    expect(() => failing.ping()).not.toThrow()
    await vi.advanceTimersByTimeAsync(1000)
    expect(() => failing.pingToken('tok')).not.toThrow()
  })

  it('발주처·파트너 화면은 로그인 대신 링크 토큰을 본문에(Authorization 없음)', async () => {
    const calls: RequestInit[] = []
    const client = createNotifyClient({ apiBase: '/api', accessToken: async () => 'jwt', fetchImpl: (async (_u: string, init: RequestInit) => { calls.push(init); return new Response('{}') }) as unknown as typeof fetch })
    client.pingToken('44444444-4444-4444-8444-444444444444')
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(JSON.parse(String(calls[0].body))).toEqual({ action: 'drain', token: '44444444-4444-4444-8444-444444444444' })
    expect((calls[0].headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('시험·리마인드 오류는 서버 문구 그대로 ProviderError', async () => {
    const client = createNotifyClient({
      apiBase: '/api',
      accessToken: async () => 'jwt',
      fetchImpl: (async () => new Response(JSON.stringify({ error: { code: 'conflict', message: '이 시간에 이미 보냈습니다.' } }), { status: 409 })) as typeof fetch,
    })
    const err = await client.remind('p', 'approval').catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.code).toBe('conflict')
    expect(err.message).toBe('이 시간에 이미 보냈습니다.')
  })
})

describe('DoD 68 · ② 사건 지점이 신호를 보낸다(소스 가드)', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), 'src/providers/supabase/domains', f), 'utf8')
  it.each([
    ['deliverables.ts', 'async uploadVersion', 'notifyFor(ctx).ping()', 3],
    ['deliverables.ts', 'async createDeliverable', 'notifyFor(ctx).ping()', 1],
    ['program.ts', 'async requestApproval', 'notifyFor(ctx).ping()', 1],
    ['clientPortal.ts', 'async submitClientDecision', 'notifyFor(ctx).pingToken(token)', 1],
    ['partners.ts', 'async submitPartnerItem', 'notifyFor(ctx).pingToken(token)', 1],
    ['wbs.ts', 'async function logInbound', 'notifyFor(ctx).ping()', 1],
  ])('%s %s → %s', (file, start, call, times) => {
    const s = src(file)
    const from = s.indexOf(start)
    expect(from).toBeGreaterThan(-1)
    const next = s.slice(from + start.length).search(/\n {2,4}(async [a-zA-Z]+\(|async function )/)
    const body = s.slice(from, next === -1 ? undefined : from + start.length + next)
    expect(body.split(call).length - 1).toBe(times)
    expect(body).not.toMatch(/await notifyFor/)
  })
})

describe('DoD 68 · ③ 행사 설정 ③ Slack 카드', () => {
  it('주소 규칙: Incoming Webhook만 · 빈 칸 = 해제 · 가림 표시', () => {
    expect(isSlackWebhookUrl(HOOK)).toBe(true)
    expect(isSlackWebhookUrl('https://hooks.slack.com/triggers/T/1/x')).toBe(false)
    expect(isSlackWebhookUrl('https://example.com/services/x')).toBe(false)
    expect(normalizeSlackWebhook('  ')).toBeNull()
    expect(normalizeSlackWebhook(` ${HOOK} `)).toBe(HOOK)
    expect(normalizeSlackWebhook('http://hooks.slack.com/services/x')).toBe('invalid')
    expect(maskSlackWebhook(HOOK)).toBe('https://hooks.slack.com/services/T000/B000/••••')
  })

  it('mock: 등록은 되고(가림 표시) 발송은 실서버 전용이라는 사실만 · 틀린 주소는 등록 비활성 + 문구 · 해제', async () => {
    renderRoute('/settings?tab=integration')
    const card = await screen.findByTestId('slack-card')
    expect(card.textContent).toContain('데모(mock)에서는 알림을 보내지 않습니다')
    const input = within(card).getByLabelText('Slack 웹훅 주소')
    await userEvent.type(input, 'https://example.com/hook')
    expect(card.textContent).toContain('https://hooks.slack.com/services/… 형식')
    expect((within(card).getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.clear(input)
    await userEvent.type(input, HOOK)
    await userEvent.click(within(card).getByRole('button', { name: '등록' }))
    const masked = await screen.findByTestId('slack-webhook-masked')
    expect(masked.textContent).toBe('https://hooks.slack.com/services/T000/B000/••••')
    expect(document.body.textContent).not.toContain('abcdefSECRET')
    expect((await mockProvider().getProject('prj-stc26')).slack_webhook_url).toBe(HOOK)
    expect(within(screen.getByTestId('slack-card')).queryByRole('button', { name: '테스트 보내기' })).toBeNull()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(within(screen.getByTestId('slack-card')).getByRole('button', { name: '해제' }))
    await waitFor(async () => expect((await mockProvider().getProject('prj-stc26')).slack_webhook_url).toBeNull())
  })

  it('provider: 틀린 주소는 422(무엇을 붙여야 하는지) · 빈 칸은 해제', async () => {
    const p = mockProvider()
    await expect(p.updateProject('prj-stc26', { slack_webhook_url: 'https://evil.example.com/x' })).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('hooks.slack.com/services'),
    })
    await expect(p.updateProject('prj-stc26', { slack_webhook_url: '' })).resolves.toMatchObject({ slack_webhook_url: null })
  })

  it('실서버: 행사 채널 없음 + 공용 있음 → 공용 채널 · 크론 꺼짐 안내 · 테스트 보내기 → 결과 문구', async () => {
    const test = vi.fn(async () => ({ sent: true as const, channel: 'global' as const }))
    setNotifyGateway({ mode: 'server', client: fakeClient({ status: async () => ({ slack: true, cron: false }), test }) })
    renderRoute('/settings?tab=integration')
    const card = await screen.findByTestId('slack-card')
    const box = card.closest('.ui-card') as HTMLElement
    // 상태 칩은 카드 머리(제목 옆)에 있다
    await waitFor(() => expect(within(box).getByRole('heading', { name: 'Slack 알림' }).parentElement!.textContent).toContain('공용 채널'))
    expect(card.textContent).toContain('CRON_SECRET')
    await userEvent.click(within(card).getByRole('button', { name: '테스트 보내기' }))
    expect(await within(card).findByRole('status')).toBeTruthy()
    expect(within(card).getByRole('status').textContent).toBe('보냈습니다 — 공용 채널을 확인하세요.')
    expect(test).toHaveBeenCalledWith('prj-stc26')
  })

  it('실서버: 채널이 하나도 없으면 꺼짐 · 테스트 버튼 없음', async () => {
    setNotifyGateway({ mode: 'server', client: fakeClient({ status: async () => ({ slack: false, cron: true }) }) })
    renderRoute('/settings?tab=integration')
    const card = await screen.findByTestId('slack-card')
    const box = card.closest('.ui-card') as HTMLElement
    await waitFor(() => expect(within(box).getByRole('heading', { name: 'Slack 알림' }).parentElement!.textContent).toContain('꺼짐'))
    await waitFor(() => expect(card.textContent).toContain('지금은 알림을 보내지 않습니다'))
    expect(within(card).queryByRole('button', { name: '테스트 보내기' })).toBeNull()
  })
})

describe('DoD 68 · ④ 홈 리마인드', () => {
  it('실서버: 지연 리마인드 → Slack 건수 문구 · 컨펌 독촉 서버 거부 → 서버 문구', async () => {
    const remind = vi.fn(async (_p: string, target: 'delayed' | 'approval') => {
      if (target === 'approval') throw new ProviderError('conflict', '이 시간에 이미 보냈습니다 — 한 시간 뒤에 다시 보낼 수 있습니다.')
      return { sent: true, total: 3 }
    })
    setNotifyGateway({ mode: 'server', client: fakeClient({ remind }) })
    renderRoute('/home')
    await screen.findByTestId('event-dday')
    await userEvent.click(screen.getByRole('button', { name: '담당에게 리마인드' }))
    expect((await screen.findByRole('status')).textContent).toBe('Slack으로 보냈습니다 — 지연 태스크 3건.')
    expect(remind).toHaveBeenCalledWith('prj-stc26', 'delayed')
    await userEvent.click(screen.getByRole('button', { name: '컨펌 독촉' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('한 시간 뒤'))
  })

  it('실서버: 보낼 것이 없으면 그 사실', async () => {
    setNotifyGateway({ mode: 'server', client: fakeClient({ remind: async () => ({ sent: false, total: 0 }) }) })
    renderRoute('/home')
    await screen.findByTestId('event-dday')
    await userEvent.click(screen.getByRole('button', { name: '담당에게 리마인드' }))
    expect((await screen.findByRole('status')).textContent).toBe('보낼 지연 태스크가 없습니다.')
  })
})

describe('DoD 68 · ⑤ ?project= 링크', () => {
  it('목록에 있는 행사로 전환하고 주소에서 project만 지운다 · 모르는 id는 무시', async () => {
    const other = (await mockProvider().listProjects()).find((s) => s.id !== 'prj-stc26' && s.status === 'active')!
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute(`/settings?tab=integration&project=${other.id}`)
    await waitFor(() => expect(localStorage.getItem('communicator.currentProjectId')).toBe(other.id))
    await screen.findByTestId('slack-card')
    cleanup()

    renderRoute('/home?project=prj-없는-행사')
    await screen.findByTestId('event-dday')
    expect(localStorage.getItem('communicator.currentProjectId')).toBe(other.id)
  })
})

describe('DoD 68 · ⑥ 컨펌 발송 폼 — 이메일은 아직(Phase 6b)이라는 사실', () => {
  it('발송 폼에 이메일 준비 중 안내(링크 복사 전달 · 내부 Slack은 자동) — 게이트 뒤에 숨기지 않는다', async () => {
    renderRoute('/items/dlv-004')
    const note = await screen.findByTestId('email-pending-note')
    expect(note.textContent).toContain('이메일은 아직 가지 않습니다')
    expect(note.textContent).toContain('링크를 복사해 직접 전달')
  })
})
