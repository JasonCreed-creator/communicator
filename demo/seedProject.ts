// 데모 아티팩트의 기본 선택 행사 시드 (Phase 3.12).
//
// 앱 본체(src/main.tsx·BrowserRouter 빌드)의 동작은 건드리지 않는다 — 이 모듈은
// 데모 엔트리(demo/main.tsx)와 데모 라우팅 검증(demo/verify/routing.check.tsx)에서만 쓴다.
// ProjectContext가 읽는 것과 같은 키에, 저장값이 없을 때만 써 넣는다(재방문 선택 존중).
import { PROJECT_ID_REBUILD27 } from '../src/fixtures/sampleProject'

const STORAGE_KEY = 'communicator.currentProjectId'

/** 데모 첫 진입 시 현재 행사를 RE:BUILD 27로 맞춘다. 이미 고른 행사가 있으면 그대로 둔다. */
export function seedDemoProject(): void {
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, PROJECT_ID_REBUILD27)
    }
  } catch {
    // 저장 불가 환경(사생활 보호 모드 등) — 목록의 첫 진행 중 행사가 그대로 기본값이 된다.
  }
}
