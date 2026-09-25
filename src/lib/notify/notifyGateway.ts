// 화면이 쓰는 알림 연동 문 — 행사 설정 ③ Slack 카드 · 홈 '리마인드' 버튼(Phase 6, 설계서 §9).
// mock은 서버가 없어 보내는 흉내를 내지 않는다(무음 실패·가짜 성공 금지) — 화면이 "실서버 모드에서 Slack으로 갑니다" 안내를 띄운다.
import { getAuthAdapter } from '../../providers/auth'
import { providerKind } from '../../providers/kind'
import { createNotifyClient, type NotifyClient } from './notifyClient'

export type NotifyGateway = { mode: 'mock' } | { mode: 'server'; client: NotifyClient }

let cached: NotifyGateway | null = null

export function getNotifyGateway(): NotifyGateway {
  if (cached) return cached
  cached =
    providerKind() === 'supabase'
      ? { mode: 'server', client: createNotifyClient({ accessToken: () => getAuthAdapter().getAccessToken() }) }
      : { mode: 'mock' }
  return cached
}

/** 테스트 주입 */
export function setNotifyGateway(gateway: NotifyGateway | null): void {
  cached = gateway
}
