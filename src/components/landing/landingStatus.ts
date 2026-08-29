// 랜딩 상태 → 배지 정본(의미 4단계 + 중립) 매핑 — 패턴 기준 시트 §03.
// labels.ts는 동결이라 랜딩 계열 매핑은 이 화면 디렉터리에서만 정의한다.
//  · 초안(draft)      = 중립 — 아직 발행하지 않음
//  · 발행됨(published) = 정상 — 공개 중
//  · 신청 마감(closed) = 중립 — 페이지는 살아 있고 CTA만 잠긴 상태(§4-19)
import type { StatusLevel } from '../../lib/labels'
import type { LandingStatus } from '../../types/enums'

export const LANDING_STATUS_LEVEL: Record<LandingStatus, StatusLevel> = {
  draft: 'neutral',
  published: 'positive',
  closed: 'neutral',
}

export const LANDING_STATUS_LABELS: Record<LandingStatus, string> = {
  draft: '초안',
  published: '발행됨',
  closed: '신청 마감',
}
