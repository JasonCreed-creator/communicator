// 화면이 쓰는 마스터 시트 내보내기 문 — S9 운영계획서 발행 줄(설계서 v2.21 §27.5 · Phase 6.11 PR-G).
// 공급자 종류로 갈린다: mock은 서버·Drive가 없어 시트를 만들지 않고(가짜 링크 금지) 화면이 사실 안내를 띄운다.
// supabase는 masterSheetClient(api/master-sheet) + 로그인 세션 토큰.
import { getAuthAdapter } from '../../providers/auth'
import { providerKind } from '../../providers/kind'
import { createMasterSheetClient, type MasterSheetClient } from './masterSheetClient'

export type MasterSheetGateway = { mode: 'mock' } | { mode: 'server'; client: MasterSheetClient }

let cached: MasterSheetGateway | null = null

export function getMasterSheetGateway(): MasterSheetGateway {
  if (cached) return cached
  cached =
    providerKind() === 'supabase'
      ? { mode: 'server', client: createMasterSheetClient({ accessToken: () => getAuthAdapter().getAccessToken() }) }
      : { mode: 'mock' }
  return cached
}

/** 테스트 주입 */
export function setMasterSheetGateway(gateway: MasterSheetGateway | null): void {
  cached = gateway
}

export const MASTER_SHEET_MOCK_MESSAGE =
  '마스터 시트 만들기는 실서버(로그인) 모드에서 Drive 연결 계정으로 행사 폴더에 만듭니다 — 데모에서는 만들지 않습니다.'
