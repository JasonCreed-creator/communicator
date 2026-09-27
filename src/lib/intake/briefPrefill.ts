// 인테이크 결과(EventBriefFields) → 행사 개요 폼에 채울 값(Phase 6.2). 순수 함수 — 화면과 테스트가 같은 매핑을 쓴다.
// 요구사항 요약(notes)은 개요의 '기타 항목' 한 줄로 들어간다(운영계획서 개요에 실린다 — 금액·연락처는 애초에 없다).
import type { OverviewPrefillValues } from '../../components/settings/ProjectOverviewForm'
import type { EventBriefFields } from './eventBrief'

export const INTAKE_NOTES_LABEL = '요청 사항(Slack)'

export function briefToPrefill(f: EventBriefFields): OverviewPrefillValues {
  const v: OverviewPrefillValues = {}
  if (f.name) v.name = f.name
  if (f.event_date) v.eventDate = f.event_date
  if (f.event_end_date) v.eventEndDate = f.event_end_date
  if (f.start_time) v.startTime = f.start_time
  if (f.end_time) v.endTime = f.end_time
  if (f.venue) v.venue = f.venue
  if (f.expected_headcount !== null) v.expectedHeadcount = String(f.expected_headcount)
  if (f.organizer) v.organizer = f.organizer
  if (f.theme) v.theme = f.theme
  if (f.target_audience) v.targetAudience = f.target_audience
  // 모객형만 채운다 — 뚜렷하지 않으면(null) 기본값(일반형)을 건드리지 않는다
  if (f.event_type === 'recruiting') v.eventType = 'recruiting'
  if (f.notes) v.items = [{ label: INTAKE_NOTES_LABEL, value: f.notes }]
  return v
}
