/** @vitest-environment jsdom */
// DoD 79 (Phase 6.1 · 설계서 v2.12 §9) — 앱 쪽: 행사 스레드 등록 · 담당자 Slack ID · 의뢰 확인 표시.
//   ① 확인 표시 판정: 지금 상태에 맞는 의뢰만(제작 요청 = 우리 손 · 검토 요청 = 내부검토·파트너 검토) · 확인함/아직 · 날짜
//   ② 행사 설정 ③: 스레드 링크 형식 검증 → 등록(채널·Slack에서 열기) → 웹훅은 예비로 접힘 → 해제 · mock은 사실만
//   ③ 실서버: 봇 토큰 없음 = '봇 준비 안 됨' + 안내 · 있음 = '행사 스레드' · 테스트 보내기 → 스레드 문구
//   ④ provider: 틀린 링크·ID 422 · 이메일을 바꾸면 Slack ID를 비운다 · Slack ID는 담당자 표기(UserRef)에 실리지 않는다
//   ⑤ 담당자 화면(S-13): Slack 칸(자동/ID) · 고치기 형식 검증 · 저장 왕복
//   ⑥ 항목 상세 '다음 단계' · 디자인 보드 '다음 행동' 아래 확인 한 줄
// 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 이어진다(testUtils 주석).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotifyClient } from '../lib/notify/notifyClient'
import { setNotifyGateway } from '../lib/notify/notifyGateway'
import { requestAckLine } from '../lib/requestAck'
import type { RequestAck } from '../types/views'
import { mockProvider, renderRoute } from './testUtils'

const THREAD = 'https://acme.slack.com/archives/C0PROJ001/p1727251234567890'
const NOW = Date.parse('2026-09-27T03:00:00Z')

afterEach(() => {
  cleanup()
  setNotifyGateway(null)
  vi.restoreAllMocks()
})

function fakeClient(over: Partial<NotifyClient> = {}): NotifyClient {
  return {
    status: async () => ({ slack: false, bot: true, cron: true }),
    ping: () => undefined,
    pingToken: () => undefined,
    test: async () => ({ sent: true, channel: 'thread' }),
    remind: async () => ({ sent: true, total: 1 }),
    ...over,
  }
}

const ack = (over: Partial<RequestAck>): RequestAck => ({
  kind: 'work',
  requested_at: '2026-09-25T05:10:00Z',
  acknowledged_at: null,
  acknowledged_by_name: null,
  ...over,
})

describe('DoD 79 · ① 확인 표시 판정', () => {
  it('제작 요청: 지시됨·초안·수정요청 동안만 · 확인 전은 n일째 · 확인하면 누가 언제', () => {
    expect(requestAckLine([ack({})], 'requested', { hasPartner: false, now: NOW })).toEqual({ tone: 'wait', text: 'Slack 제작 요청 아직 확인 안 함 · 1일째', days: 1 })
    expect(requestAckLine([ack({ requested_at: '2026-09-27T01:00:00Z' })], 'draft', { hasPartner: false, now: NOW })?.text).toBe('Slack 제작 요청 아직 확인 안 함')
    expect(requestAckLine([ack({ acknowledged_at: '2026-09-25T05:34:00Z', acknowledged_by_name: '이디자' })], 'changes_requested', { hasPartner: false, now: NOW })).toEqual({
      tone: 'ok',
      text: 'Slack 제작 요청 확인함 · 이디자 9/25',
      days: null,
    })
    expect(requestAckLine([ack({})], 'internal_review', { hasPartner: false, now: NOW })).toBeNull()
    expect(requestAckLine([], 'draft', { hasPartner: false })).toBeNull()
    expect(requestAckLine(undefined, 'draft', { hasPartner: false })).toBeNull()
  })

  it('검토 요청: 내부검토 동안 · 파트너 항목은 컨펌대기(우리 검토)까지 · 대행형 컨펌대기는 발주처 차례라 없음 · 최신 것', () => {
    const acks = [ack({ kind: 'review', requested_at: '2026-09-24T00:00:00Z', acknowledged_at: '2026-09-24T01:00:00Z', acknowledged_by_name: '옛' }), ack({ kind: 'review' })]
    expect(requestAckLine(acks, 'internal_review', { hasPartner: false, now: NOW })?.text).toBe('Slack 검토 요청 아직 확인 안 함 · 1일째')
    expect(requestAckLine(acks, 'pending_approval', { hasPartner: true, now: NOW })?.tone).toBe('wait')
    expect(requestAckLine(acks, 'pending_approval', { hasPartner: false, now: NOW })).toBeNull()
    expect(requestAckLine(acks, 'final', { hasPartner: false, now: NOW })).toBeNull()
  })
})

describe('DoD 79 · ② 행사 설정 ③ — 행사 스레드', () => {
  it('mock: 틀린 링크는 등록 비활성 + 문구 → 맞는 링크 등록 → 채널·Slack에서 열기 · 웹훅은 예비로 접힘 → 해제', async () => {
    renderRoute('/settings?tab=integration')
    const card = await screen.findByTestId('slack-card')
    expect(card.textContent).toContain('스레드에 답글로 남기고, 할 일이 생긴 사람을 멘션합니다')
    const input = within(card).getByLabelText('Slack 스레드 링크')
    await userEvent.type(input, 'https://acme.slack.com/archives/D0DMCHAN1/p1727251234567890')
    expect(card.textContent).toContain('Slack 스레드 링크가 아닙니다')
    expect((within(card).getByRole('button', { name: '스레드 등록' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.clear(input)
    await userEvent.type(input, THREAD)
    await userEvent.click(within(card).getByRole('button', { name: '스레드 등록' }))
    const saved = await screen.findByTestId('slack-thread-saved')
    expect(saved.textContent).toContain('C0PROJ001')
    expect(within(saved).getByRole('link', { name: 'Slack에서 열기' }).getAttribute('href')).toBe(THREAD)
    expect((await mockProvider().getProject('prj-stc26')).slack_thread_url).toBe(THREAD)
    // 스레드가 있으면 웹훅(예비)은 접힌다 — 펼치면 그대로 쓸 수 있다
    const fresh = screen.getByTestId('slack-card')
    expect(within(fresh).queryByTestId('slack-webhook-box')).toBeNull()
    await userEvent.click(within(fresh).getByRole('button', { name: '예비 웹훅 보기' }))
    expect(within(screen.getByTestId('slack-card')).getByLabelText('Slack 웹훅 주소')).toBeTruthy()
    expect(screen.getByTestId('slack-card').textContent).toContain('데모(mock)에서는 알림을 보내지 않습니다')
    expect(within(screen.getByTestId('slack-card')).queryByRole('button', { name: '테스트 보내기' })).toBeNull()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(within(screen.getByTestId('slack-card')).getByRole('button', { name: '스레드 해제' }))
    await waitFor(async () => expect((await mockProvider().getProject('prj-stc26')).slack_thread_url).toBeNull())
  })
})

describe('DoD 79 · ③ 실서버 — 봇 상태', () => {
  it('스레드는 있는데 봇 토큰이 없으면 "봇 준비 안 됨" + 웹훅·공용으로 간다는 안내 · 테스트 버튼 없음', async () => {
    await mockProvider().updateProject('prj-stc26', { slack_thread_url: THREAD })
    setNotifyGateway({ mode: 'server', client: fakeClient({ status: async () => ({ slack: false, bot: false, cron: true }) }) })
    renderRoute('/settings?tab=integration')
    const card = await screen.findByTestId('slack-card')
    const box = card.closest('.ui-card') as HTMLElement
    await waitFor(() => expect(within(box).getByRole('heading', { name: 'Slack 알림' }).parentElement!.textContent).toContain('봇 준비 안 됨'))
    expect(card.textContent).toContain('서버에 봇 토큰이 없어 스레드로 보내지 못합니다')
    expect(within(card).queryByRole('button', { name: '테스트 보내기' })).toBeNull()
  })

  it('봇 토큰이 있으면 "행사 스레드" · 테스트 보내기 → 스레드 문구', async () => {
    const test = vi.fn(async () => ({ sent: true as const, channel: 'thread' as const }))
    setNotifyGateway({ mode: 'server', client: fakeClient({ test }) })
    renderRoute('/settings?tab=integration')
    const card = await screen.findByTestId('slack-card')
    const box = card.closest('.ui-card') as HTMLElement
    await waitFor(() => expect(within(box).getByRole('heading', { name: 'Slack 알림' }).parentElement!.textContent).toContain('행사 스레드'))
    await userEvent.click(within(card).getByRole('button', { name: '테스트 보내기' }))
    expect((await within(card).findByRole('status')).textContent).toBe('보냈습니다 — 이 행사 스레드를 확인하세요.')
    expect(test).toHaveBeenCalledWith('prj-stc26')
  })
})

describe('DoD 79 · ④ provider', () => {
  it('틀린 스레드 링크 422 · 빈 칸 = 해제', async () => {
    const p = mockProvider()
    await expect(p.updateProject('prj-stc26', { slack_thread_url: 'https://evil.example.com/archives/C0PROJ001/p1727251234567890' })).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('Slack 스레드 링크가 아닙니다'),
    })
    await expect(p.updateProject('prj-stc26', { slack_thread_url: '' })).resolves.toMatchObject({ slack_thread_url: null })
  })

  it('담당자 Slack ID: 형식 422 · 등록·고치기·비우기 · 이메일을 바꾸면 비운다 · 담당자 표기(UserRef)에는 없다', async () => {
    const p = mockProvider()
    await expect(p.createPerson({ name: '슬랙 시험', email: 'slack-test@example.com', slack_user_id: 'abc' })).rejects.toMatchObject({ code: 'validation' })
    const person = await p.createPerson({ name: '슬랙 시험', email: 'slack-test@example.com', slack_user_id: 'U0SLACK01' })
    expect(person).not.toHaveProperty('slack_user_id')
    const find = async () => (await p.listPeople()).find((x) => x.id === person.id)!
    expect((await find()).slack_user_id).toBe('U0SLACK01')
    await p.updatePerson(person.id, { title: '과장' })
    expect((await find()).slack_user_id).toBe('U0SLACK01')
    await p.updatePerson(person.id, { email: 'slack-test2@example.com' })
    expect((await find()).slack_user_id).toBeNull()
    await p.updatePerson(person.id, { slack_user_id: 'W0GRID001' })
    expect((await find()).slack_user_id).toBe('W0GRID001')
    await p.updatePerson(person.id, { slack_user_id: '' })
    expect((await find()).slack_user_id).toBeNull()
    await expect(p.updatePerson(person.id, { slack_user_id: 'u123' })).rejects.toMatchObject({ code: 'validation' })
    const members = await p.listMembers('prj-stc26')
    expect(JSON.stringify(members)).not.toContain('slack_user_id')
    await p.removePerson(person.id)
  })
})

describe('DoD 79 · ⑤ 담당자 화면 — Slack 칸', () => {
  it('비어 있으면 "이메일로 자동" · 고치기에서 틀린 ID는 문구 · 맞는 ID는 저장되어 칸에 보인다', async () => {
    const target = (await mockProvider().listPeople())[0]
    renderRoute('/people')
    const cell = await screen.findByTestId(`person-slack-${target.id}`)
    expect(cell.textContent).toBe('이메일로 자동')
    const row = screen.getByTestId(`person-row-${target.id}`)
    await userEvent.click(within(row).getByRole('button', { name: '수정' }))
    const edit = screen.getByTestId(`person-row-${target.id}`)
    const input = within(edit).getByLabelText('Slack 멤버 ID')
    await userEvent.type(input, 'abc')
    await userEvent.click(within(edit).getByRole('button', { name: '저장' }))
    expect(edit.textContent).toContain('Slack 멤버 ID는 U로 시작하는')
    await userEvent.clear(input)
    await userEvent.type(input, 'U0PEOPLE1')
    await userEvent.click(within(edit).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.getByTestId(`person-slack-${target.id}`).textContent).toBe('U0PEOPLE1'))
    expect(screen.getByTestId('propagation-notice').textContent).toContain('Slack 멤버 ID는 알림 멘션에만')
  })
})

describe('DoD 79 · ⑥ 확인 한 줄 — 항목 상세 · 디자인 보드', () => {
  function withAcks(acks: RequestAck[]) {
    const p = mockProvider()
    const original = p.getDeliverable.bind(p)
    vi.spyOn(p, 'getDeliverable').mockImplementation(async (id) => ({ ...(await original(id)), request_acks: acks }))
  }

  it('항목 상세(초안): 다음 단계 설명 아래 "Slack 제작 요청 아직 확인 안 함 · n일째"', async () => {
    withAcks([ack({ requested_at: new Date(Date.now() - 2 * 86_400_000 - 60_000).toISOString() })])
    renderRoute('/items/dlv-003')
    const card = await screen.findByTestId('next-step-card')
    const line = await within(card).findByTestId('request-ack')
    expect(line.textContent).toBe('Slack 제작 요청 아직 확인 안 함 · 2일째')
    expect(line.className).toContain('text-accent-deep')
  })

  it('디자인 보드: 확인한 의뢰는 다음 행동 아래 "✓ Slack 제작 요청 확인함 · 이름 날짜"', async () => {
    withAcks([ack({ acknowledged_at: '2026-09-25T05:34:00Z', acknowledged_by_name: '이디자' })])
    renderRoute('/board/design')
    const lines = await screen.findAllByTestId('request-ack')
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.textContent === '✓ Slack 제작 요청 확인함 · 이디자 9/25')).toBe(true)
    expect(lines[0].className).toContain('text-positive')
  })
})
