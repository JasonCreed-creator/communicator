// 홈 대시보드(S1) 최근 활동 로그의 action 코드 → 한국어 요약 매핑.
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  'deliverable.created': '항목이 생성되었습니다',
  'deliverable.requested': '지시가 발행되었습니다',
  'status.transitioned': '상태가 변경되었습니다',
  'version.uploaded': '새 버전이 업로드되었습니다',
  'approval.requested': '컨펌이 발송되었습니다',
  'approval.decided': '발주처가 컨펌을 처리했습니다',
  'deliverable.finalized': '확정본으로 전환되었습니다',
  'inbox.linked': '인박스 파일이 항목에 연결되었습니다',
  'inbox.dismissed': '인박스 파일이 무시 처리되었습니다',
  'token.issued': '발주처 토큰이 발급되었습니다',
  'token.revoked': '발주처 토큰이 회수되었습니다',
}

export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action
}

export function activityActorLabel(actor: string): string {
  if (actor === 'system') return '시스템'
  if (actor.startsWith('client:')) return '발주처'
  if (actor.startsWith('user:')) return '내부 멤버'
  return actor
}
