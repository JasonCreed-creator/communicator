// 화면이 쓰는 인테이크 연동 문 — S0 온보딩 ① 'Slack 메시지에서 불러오기' · 견적서 첨부(Phase 6.2, 설계서 v2.15 §10 S0).
// mock은 서버가 없어 Slack 글을 읽지 못한다 — 대신 붙여 넣은 글을 **라벨 규칙**(src/lib/intake/eventBrief)으로 그 자리에서 읽는다
// (흉내가 아니라 같은 규칙의 실제 결과 · AI는 실서버에서만). 링크 불러오기·Slack 첨부 옮기기는 실서버 안내.
import { getAuthAdapter } from '../../providers/auth'
import { providerKind } from '../../providers/kind'
import { createIntakeClient, type IntakeClient } from './intakeClient'

export type IntakeGateway = { mode: 'mock' } | { mode: 'server'; client: IntakeClient }

let cached: IntakeGateway | null = null

export function getIntakeGateway(): IntakeGateway {
  if (cached) return cached
  cached =
    providerKind() === 'supabase'
      ? { mode: 'server', client: createIntakeClient({ accessToken: () => getAuthAdapter().getAccessToken() }) }
      : { mode: 'mock' }
  return cached
}

/** 테스트 주입 */
export function setIntakeGateway(gateway: IntakeGateway | null): void {
  cached = gateway
}

export const INTAKE_MOCK_LINK_MESSAGE =
  '링크로 불러오기는 실서버(로그인) 모드에서 Slack 봇이 합니다 — 데모에서는 Slack 글을 복사해 아래에 붙여 넣어 보세요.'
