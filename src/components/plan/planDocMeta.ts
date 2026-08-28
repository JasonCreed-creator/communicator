// S9 운영계획서 발행 메타 — 표지·러닝 헤더/푸터·발행 게이트가 공유하는 값(전 7쪽 구성 포함).
// 표시 계층 전용이다 — 여기서 데이터를 만들지 않고, PlanData와 현재 시각만 조합한다.
import type { PlanSectionKey } from '../../types/views'
import { PLAN_SECTION_META, type PlanSectionStatus } from './planSections'

/** A4 쪽 구성 — 표지 1장 + 본문 6장 = 총 7쪽. 목차 레일의 '전 7쪽' 표기도 이 상수에서 나온다 */
export interface PlanPageSpec {
  /** 1부터 */
  no: number
  /** 표지는 null — 러닝 헤더 대신 표지 자체가 행사명을 크게 싣는다 */
  sections: PlanSectionKey[]
}

export const PLAN_PAGES: PlanPageSpec[] = [
  { no: 1, sections: [] },
  { no: 2, sections: ['overview', 'program'] },
  { no: 3, sections: ['cuesheet'] },
  { no: 4, sections: ['zones', 'production'] },
  { no: 5, sections: ['registration'] },
  { no: 6, sections: ['emergency'] },
  { no: 7, sections: ['schedule'] },
]

export const PLAN_TOTAL_PAGES = PLAN_PAGES.length

/** 러닝 헤더 우측 — '04 존별 운영 · 05 제작물 리스트' */
export function planPageSectionLabel(sections: PlanSectionKey[]): string {
  return sections.map((k) => `${PLAN_SECTION_META[k].number} ${PLAN_SECTION_META[k].title}`).join(' · ')
}

/** 출력일시 — 'YYYY-MM-DD HH:MM'. 인쇄물 하단에 그대로 찍히므로 로케일 의존 포맷을 쓰지 않는다 */
export function formatPrintedAt(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`
}

/**
 * 문서 버전 — 시안의 'v4'는 **컨펌 스냅숏 버전과 같은 값**이다. 운영계획서 자체는 아직 스냅숏
 * 대상 항목(deliverable)이 아니라 조립 뷰이므로, 스냅숏이 없는 동안에는 버전 번호를 지어내지
 * 않고 '초안'으로 표기한다(스냅숏이 생기면 그 version_no를 그대로 쓴다).
 */
export function planVersionLabel(snapshotVersionNo: number | null): string {
  return snapshotVersionNo == null ? '초안' : `v${snapshotVersionNo}`
}

/** 발행 게이트 — 미입력 섹션이 하나라도 있으면 컨펌 발송을 잠근다(인쇄는 항상 허용) */
export interface PlanPublishState {
  blocking: PlanSectionStatus[]
  locked: boolean
  /** 문서 전체 상태 라벨 — 섹션 상태에서 파생한다(문서 상태 엔티티는 아직 없다) */
  docStateLabel: string
}

export function planPublishState(statuses: PlanSectionStatus[]): PlanPublishState {
  const blocking = statuses.filter((s) => s.state === 'empty')
  const writing = statuses.some((s) => s.state === 'writing')
  return {
    blocking,
    locked: blocking.length > 0,
    docStateLabel: blocking.length > 0 || writing ? '작성 중' : '발송 준비',
  }
}

/** 목차 레일 하단 전체 진행률 — 섹션 진행률의 단순 합(설계서 §8 산식 그대로) */
export function planOverallProgress(statuses: PlanSectionStatus[]): { done: number; total: number; pct: number } {
  const done = statuses.reduce((sum, s) => sum + s.done, 0)
  const total = statuses.reduce((sum, s) => sum + s.total, 0)
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}
