// S9 운영계획서 섹션 넘버링·제목 정본 — PlanDocPage와 하위 섹션 컴포넌트가 공유한다.
import type { PlanSectionKey } from '../../types/views'

export interface PlanSectionMeta {
  number: string
  title: string
}

// v1.3: 큐시트 섹션은 프로그램 다음 배치(설계서 §10 S9) — 이하 섹션 번호가 한 칸씩 밀린다
// v2.5(3.16a, AE — 최소 컴파일 호환 패치): §23이 PlanSectionKey에 'emergency'를 추가해
// 이 Record가 그 키를 요구하게 됐다. 번호·타이틀만 채워 빌드를 지키는 자리표시이고,
// 실제 ⑦비상 대응 섹션 렌더(§9 확장)·정확한 위치·인쇄 규약은 Phase 3.16d(AH)가 완성한다.
export const PLAN_SECTION_META: Record<PlanSectionKey, PlanSectionMeta> = {
  overview: { number: '①', title: '행사개요' },
  program: { number: '②', title: '프로그램' },
  cuesheet: { number: '③', title: '큐시트' },
  zones: { number: '④', title: '존별 운영' },
  production: { number: '⑤', title: '제작물 리스트' },
  registration: { number: '⑥', title: '등록 통계' },
  emergency: { number: '⑦', title: '비상 대응' },
  schedule: { number: '⑧', title: '일정' },
}

/** getPlan()의 section_progress 배열 순서는 provider 구현에 따라 달라질 수 있어 항상 여기서 재정렬한다 */
export const PLAN_SECTION_ORDER: PlanSectionKey[] = [
  'overview',
  'program',
  'cuesheet',
  'zones',
  'production',
  'registration',
  'emergency',
  'schedule',
]

export interface SectionProgressData {
  done: number
  total: number
}
