// 데모 아티팩트 전용 스텁 — Drive 연동(api/drive 호출)은 서버 경로라 단일 파일 아티팩트(외부 요청 0건 · fetch 호출부 1건 가드)에
// 싣지 않는다. 데모는 mock 공급자라 getDriveGateway()가 {mode:'mock'}을 돌려 이 함수를 부르지 않는다. 실제 앱 빌드(vite.config.ts)는 alias가 없다.
export function createDriveClient(): never {
  throw new Error('데모 아티팩트는 mock 공급자 전용입니다 — Drive 연동은 앱 빌드(실서버 모드)에서만 유효합니다.')
}
