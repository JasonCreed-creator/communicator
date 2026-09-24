// 화면이 쓰는 Drive 연동 문 — 행사 설정 ③ Drive 카드·홈 인박스 '지금 확인'.
// 공급자 종류로 갈린다: mock은 서버가 없어 연결·폴더 작업을 흉내 내지 않고(무음 실패·가짜 링크 금지) 화면이
// "실서버 모드에서 연결" 안내를 띄운다. supabase는 driveClient(api/drive) + 로그인 세션 토큰.
import { getAuthAdapter } from '../../providers/auth'
import { providerKind } from '../../providers/kind'
import { createDriveClient, type DriveClient } from './driveClient'

export type DriveGateway = { mode: 'mock' } | { mode: 'server'; client: DriveClient }

let cached: DriveGateway | null = null

export function getDriveGateway(): DriveGateway {
  if (cached) return cached
  cached =
    providerKind() === 'supabase'
      ? { mode: 'server', client: createDriveClient({ accessToken: () => getAuthAdapter().getAccessToken() }) }
      : { mode: 'mock' }
  return cached
}

/** 테스트 주입 */
export function setDriveGateway(gateway: DriveGateway | null): void {
  cached = gateway
}

/** Google 동의 화면으로 이동(전체 페이지) — 테스트는 이동 대신 기록하도록 바꾼다(jsdom은 교차 출처 이동을 못 한다) */
let navigate = (url: string): void => {
  window.location.assign(url)
}

export function goToDriveConsent(url: string): void {
  navigate(url)
}

export function setDriveNavigator(fn: ((url: string) => void) | null): void {
  navigate =
    fn ??
    ((url: string) => {
      window.location.assign(url)
    })
}

/** OAuth 복귀(`/settings?drive=…`) 사유 코드 → 한국어 */
export function driveReturnMessage(search: string): { ok: boolean; message: string } | null {
  const q = new URLSearchParams(search)
  const drive = q.get('drive')
  if (!drive) return null
  if (drive === 'connected') return { ok: true, message: 'Drive가 연결됐습니다 — 이제 올리는 파일이 MICE Communicator 폴더에 저장됩니다.' }
  const reason = q.get('reason') ?? ''
  const reasons: Record<string, string> = {
    denied: 'Google 동의 화면에서 허용하지 않았습니다 — 다시 연결을 눌러 허용해 주세요.',
    state: '연결 요청이 만료됐습니다(10분) — 다시 연결을 눌러 주세요.',
    code: 'Google이 인증 코드를 주지 않았습니다 — 다시 연결해 주세요.',
    no_refresh_token: 'Google이 갱신 토큰을 주지 않았습니다 — Google 계정의 "타사 앱 접근"에서 이 앱을 지운 뒤 다시 연결해 주세요.',
    root_access: '이 계정은 저장 폴더(MICE Communicator)에 쓸 수 없습니다 — 폴더 편집 권한이 있는 계정으로 연결해 주세요.',
    exchange: '연결을 마치지 못했습니다(인증 교환·저장 실패) — 잠시 후 다시 시도하세요.',
    google: 'Google이 오류를 돌려줬습니다 — 잠시 후 다시 시도하세요.',
  }
  return { ok: false, message: reasons[reason] ?? 'Drive 연결에 실패했습니다 — 다시 시도하세요.' }
}
