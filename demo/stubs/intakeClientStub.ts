// 데모 아티팩트 전용 스텁 — 행사 인테이크(api/intake 호출)는 서버 경로라 단일 파일 아티팩트(외부 요청 0건 · fetch 호출부 1건 가드)에
// 싣지 않는다. 데모는 mock 공급자라 getIntakeGateway()가 {mode:'mock'}을 돌려 이 함수를 부르지 않는다(붙여 넣은 글은 라벨 규칙으로 읽는다).
export function createIntakeClient(): never {
  throw new Error('데모 아티팩트는 mock 공급자 전용입니다 — Slack 메시지 불러오기는 앱 빌드(실서버 모드)에서만 유효합니다.')
}
