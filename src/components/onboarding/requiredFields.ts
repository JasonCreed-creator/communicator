// S0 온보딩 — '필수 남은 개수' 산식 (시안 '온보딩 · 파트너 포털.dc.html' 카드 상단 진행 막대).
// 필수 4항목은 행사 설정(S6) 헤더 배지와 **같은 정의**를 쓴다: 행사명·코드·시작일·장소.
// 두 화면이 서로 다른 개수를 말하면 사용자는 어느 쪽을 믿을지 알 수 없다 — 정의를 여기 한 곳에 둔다.
import type { Project } from '../../types/entities'

/** 행사 설정 ①탭·S0 ①단계가 저장하는 필수 4항목 (ProjectOverviewForm 검증과 동일) */
export const REQUIRED_FIELD_LABELS = ['행사명', '코드', '시작일', '장소'] as const

export function missingRequiredFields(project: Project | null): string[] {
  if (!project) return []
  const filled = [project.name, project.code, project.event_date, project.venue]
  return REQUIRED_FIELD_LABELS.filter((_, i) => !filled[i])
}

export function countMissingRequired(project: Project | null): number {
  return missingRequiredFields(project).length
}
