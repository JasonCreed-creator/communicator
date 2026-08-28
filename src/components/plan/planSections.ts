// S9 운영계획서 섹션 넘버링·제목·상태 정본 — PlanDocPage와 하위 섹션 컴포넌트가 공유한다.
import type { StatusLevel } from '../../lib/labels'
import type { PlanSectionKey, PlanSectionProgress } from '../../types/views'

export interface PlanSectionMeta {
  number: string
  title: string
}

// v1.3: 큐시트 섹션은 프로그램 다음 배치(설계서 §10 S9) — 이하 섹션 번호가 한 칸씩 밀린다.
// v2.5: 07 비상 대응 신설(EmergencySection) — 등록 통계 다음·일정 앞.
// v2.5.2(정렬): 유니코드 원문자(①)를 폐기하고 두 자리 숫자(01~08)로 바꾼다 — 시안 정본.
// 번호 자체가 문서 넘버링의 단일 원천이며, 디자인지시서 §10 S9의 옛 번호와 충돌하면 이 파일이 정본이다.
export const PLAN_SECTION_META: Record<PlanSectionKey, PlanSectionMeta> = {
  overview: { number: '01', title: '행사개요' },
  program: { number: '02', title: '프로그램' },
  cuesheet: { number: '03', title: '큐시트' },
  zones: { number: '04', title: '존별 운영' },
  production: { number: '05', title: '제작물 리스트' },
  registration: { number: '06', title: '등록 통계' },
  emergency: { number: '07', title: '비상 대응' },
  schedule: { number: '08', title: '일정' },
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

/** 목차 레일 앵커 — 섹션 컨테이너의 id와 목차 링크가 이 함수 하나만 쓴다 */
export function planSectionAnchor(key: PlanSectionKey): string {
  return `plan-sec-${key}`
}

/** 섹션 상태 — n/m 숫자 대신 세 단어로 읽는다(숫자는 배지 안에 남는다) */
export type PlanSectionState = 'complete' | 'writing' | 'empty'

export const PLAN_SECTION_STATE_LABELS: Record<PlanSectionState, string> = {
  complete: '완료',
  writing: '작성 중',
  empty: '미입력',
}

/** 패턴 기준 시트 §03 의미 4단계 매핑 — 완료=정상 · 작성 중=진행 · 미입력=차단(발행을 막는 상태) */
export const PLAN_SECTION_STATE_LEVEL: Record<PlanSectionState, StatusLevel> = {
  complete: 'positive',
  writing: 'progress',
  empty: 'blocked',
}

/** 목차 도트 — 배지 원색 계열 그대로 */
export const PLAN_SECTION_STATE_DOT: Record<PlanSectionState, string> = {
  complete: 'bg-positive',
  writing: 'bg-steel',
  empty: 'bg-negative',
}

/** done=0(또는 소스가 아예 없음)이면 미입력, 전부 채워졌으면 완료, 그 사이는 작성 중 */
export function planSectionState({ done, total }: SectionProgressData): PlanSectionState {
  if (total > 0 && done >= total) return 'complete'
  if (done <= 0) return 'empty'
  return 'writing'
}

export interface PlanSectionStatus extends SectionProgressData {
  key: PlanSectionKey
  meta: PlanSectionMeta
  state: PlanSectionState
}

/** section_progress를 정본 순서로 정렬하고 상태를 얹는다(누락 키는 0/0 = 미입력) */
export function planSectionStatuses(sections: PlanSectionProgress[]): PlanSectionStatus[] {
  const byKey = new Map(sections.map((s) => [s.key, s]))
  return PLAN_SECTION_ORDER.map((key) => {
    const progress = byKey.get(key) ?? { key, done: 0, total: 0 }
    return {
      key,
      meta: PLAN_SECTION_META[key],
      done: progress.done,
      total: progress.total,
      state: planSectionState(progress),
    }
  })
}
