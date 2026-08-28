// v2.5 §10.2 운영가이드 빌더 — Phase 3.16d(AH)가 이 파일을 완성한다.
// 메인이 보드(3.16b)·상세 화면 배선용으로 선배선한 스텁 — props 계약은 CuesheetEditor와 동일.
export default function GuideBuilder({
  deliverableId,
  canEdit,
}: {
  deliverableId: string
  /** pm·ops만 true — §8.2 guide-sections 쓰기 권한 */
  canEdit: boolean
}) {
  void deliverableId
  void canEdit
  return <p className="text-sm text-ink-cap">운영가이드 빌더 준비 중…</p>
}
