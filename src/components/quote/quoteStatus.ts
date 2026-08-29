// 견적 상태 → 배지 정본(의미 4단계 + 중립) 매핑 — 패턴 기준 시트 §03.
// labels.ts는 동결이라 견적 계열 매핑은 이 모듈 디렉터리에서만 정의한다.
//  · 초안(draft)      = 중립 — 아직 제안 전
//  · 제안(proposed)   = 진행 — 발주처 검토 중, 개입 불필요
//  · 확정(accepted)   = 정상 — 잠긴 확정 버전
//  · 보관(archived)·구버전(superseded) = 중립 — 대체된 버전
import type { StatusLevel } from '../../lib/labels'
import type { QuoteStatus } from '../../types/enums'

export const QUOTE_STATUS_LEVEL: Record<QuoteStatus, StatusLevel> = {
  draft: 'neutral',
  proposed: 'progress',
  accepted: 'positive',
  archived: 'neutral',
  superseded: 'neutral',
}
