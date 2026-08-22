// S9 운영계획서 섹션 넘버링·제목 정본 — PlanDocPage와 하위 섹션 컴포넌트가 공유한다.
import type { PlanSectionKey } from '../../types/views'

export interface PlanSectionMeta {
  number: string
  title: string
}

export const PLAN_SECTION_META: Record<PlanSectionKey, PlanSectionMeta> = {
  overview: { number: '①', title: '행사개요' },
  program: { number: '②', title: '프로그램' },
  zones: { number: '③', title: '존별 운영' },
  production: { number: '④', title: '제작물 리스트' },
  registration: { number: '⑤', title: '등록 통계' },
  schedule: { number: '⑥', title: '일정' },
}

/** getPlan()의 section_progress 배열 순서는 provider 구현에 따라 달라질 수 있어 항상 여기서 재정렬한다 */
export const PLAN_SECTION_ORDER: PlanSectionKey[] = [
  'overview',
  'program',
  'zones',
  'production',
  'registration',
  'schedule',
]

export interface SectionProgressData {
  done: number
  total: number
}
