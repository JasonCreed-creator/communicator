/** @vitest-environment jsdom */
// DoD 101 (Phase 6.13 · 설계서 v2.21.7 §9) — 실사용 "슬랙 알림은 가는데 멘션이 안 걸림"(2026-09-28 캡처 = 새 버전 줄 · 멘션 없음이 정상).
// ① 내부검토 요청(draft→internal_review)은 PM 검토 카드 + 멘션이 가야 하는 사건인데 앱이 신호를 보내지 않아 다음 사건까지 선점되지 않았다
//    → transitionStatus가 internal_review로 갈 때만 ping(기다리지 않음) ② 멘션 규칙(주소록 Slack ID → 이메일 조회 → 이름(Slack 미연결))이 카드 안내에 보인다
//    ③ mentionText — ID가 있으면 <@id>, 없으면 이름(Slack 미연결), 웹훅(names=false)은 ID 있는 사람만.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mentionText } from '../../api/_lib/notify/cards.js'
import { SLACK_MENTION_HINT } from '../components/settings/SlackCard'
import { renderRoute } from './testUtils'

afterEach(() => cleanup())

describe('DoD 101 · ① 내부검토 요청 전이가 알림 신호를 보낸다(소스 가드)', () => {
  it('transitionStatus: to === internal_review일 때만 notifyFor(ctx).ping() · await 없음', () => {
    const s = readFileSync(join(process.cwd(), 'src/providers/supabase/domains/deliverables.ts'), 'utf8')
    const from = s.indexOf('async transitionStatus')
    expect(from).toBeGreaterThan(-1)
    const next = s.slice(from + 'async transitionStatus'.length).search(/\n {2,4}(async [a-zA-Z]+\(|async function )/)
    const body = s.slice(from, next === -1 ? undefined : from + 'async transitionStatus'.length + next)
    expect(body.split('notifyFor(ctx).ping()').length - 1).toBe(1)
    expect(body).toMatch(/if \(to === 'internal_review'\) notifyFor\(ctx\)\.ping\(\)/)
    expect(body).not.toMatch(/await notifyFor/)
    // 서버 선점 조건과 같은 값(설계서 §9 — status.transitioned는 to=internal_review만)
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260927000200_design_thread.sql'), 'utf8')
    expect(sql).toContain("(a.action <> 'status.transitioned' or a.meta->>'to' = 'internal_review')")
  })
})

describe('DoD 101 · ② Slack 카드 멘션 안내', () => {
  it('주소록 Slack ID → 이메일 조회(users:read.email) → (Slack 미연결) · 새 버전 줄은 멘션 없음', async () => {
    renderRoute('/settings?tab=integration')
    const hint = await screen.findByTestId('slack-mention-hint')
    expect(hint.textContent).toBe(SLACK_MENTION_HINT)
    expect(hint.textContent).toContain('users:read.email')
    expect(hint.textContent).toContain('(Slack 미연결)')
    expect(hint.textContent).toContain('새 버전 올림')
  })
})

describe('DoD 101 · ③ mentionText', () => {
  const people = [
    { id: 'a', name: '가상 담당', email: 'a@example.test', slack_user_id: 'U0A' },
    { id: 'b', name: '가상 PM', email: 'b@example.test', slack_user_id: null },
    { id: 'a', name: '가상 담당', email: 'a@example.test', slack_user_id: 'U0A' },
  ]
  it('봇 경로: ID는 <@id> · 없으면 이름(Slack 미연결) · 같은 사람 한 번', () => {
    expect(mentionText(people)).toBe('<@U0A> 가상 PM(Slack 미연결)')
  })
  it('웹훅 경로(names=false): ID 있는 사람만', () => {
    expect(mentionText(people, false)).toBe('<@U0A>')
  })
})
