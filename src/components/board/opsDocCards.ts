// v2.5 §10.2 운영보드 유형 카드 — 표시 레벨 분류 정본(P11 3.16.2에서 보드 페이지에서 분리).
// 데이터(Deliverable.category)는 절대 바꾸지 않는다(R-O1) — 어떤 카드에 얹어 보여줄지만 정한다.
import { OPS_DOC_CARD_LABELS } from '../../lib/labels'

export type OpsDocCardKey = keyof typeof OPS_DOC_CARD_LABELS

export function classifyOpsCard(category: string): OpsDocCardKey {
  if (category === '큐시트') return 'cuesheet'
  if (category === '시나리오') return 'scenario'
  if (category === '운영가이드') return 'guide'
  return 'other'
}

/** 유형 카드가 선택된 상태에서 "+ 항목 추가"에 프리셀렉트할 카테고리(기타 제작물은 없음) */
export const CARD_PRESET_CATEGORY: Record<OpsDocCardKey, string | undefined> = {
  cuesheet: '큐시트',
  scenario: '시나리오',
  guide: '운영가이드',
  other: undefined,
}

/** 카드 렌더 순서 — 목업 화면 A 그대로(큐시트 → 시나리오 → 운영가이드 → 기타 제작물) */
export const OPS_DOC_CARD_ORDER: OpsDocCardKey[] = ['cuesheet', 'scenario', 'guide', 'other']
