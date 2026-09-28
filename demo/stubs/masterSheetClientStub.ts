// 데모 아티팩트 전용 스텁 — 마스터 시트 내보내기(api/master-sheet 호출)는 서버 경로라 단일 파일 아티팩트(외부 요청 0건 · fetch 호출부 1건 가드)에
// 싣지 않는다. 데모는 mock 공급자라 getMasterSheetGateway()가 {mode:'mock'}을 돌려 이 함수를 부르지 않는다(화면은 사실 안내).
export function createMasterSheetClient(): never {
  throw new Error('데모 아티팩트는 mock 공급자 전용입니다 — 마스터 시트 만들기는 앱 빌드(실서버 모드)에서만 유효합니다.')
}
