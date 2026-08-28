// S9 운영계획서 섹션 넘버링·제목 정본 — PlanDocPage와 하위 섹션 컴포넌트가 공유한다.
import type { PlanSectionKey } from '../../types/views'

export interface PlanSectionMeta {
  number: string
  title: string
}

// v1.3: 큐시트 섹션은 프로그램 다음 배치(설계서 §10 S9) — 이하 섹션 번호가 한 칸씩 밀린다
// v2.5(3.16a AE가 번호·순서를 자리표시로 예약 → 3.16d AH가 렌더를 완성): ⑦비상 대응은
// EmergencySection.tsx가 렌더하고, 등록 통계(⑥) 다음·일정(⑧) 앞에 배치된다(PlanDocPage.tsx).
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
