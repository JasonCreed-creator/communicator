// 행사 ID(라벨) — 운영 커뮤니케이션 프로토콜 v1.0(2026-09-27 사용자 제공 · 설계서 v2.16 §4-1d): **행사 ID = YYMMDD_고객사_행사명**
// = Slack 운영·디자인 스레드 제목 = Drive 행사 폴더 = 파일명 접두 = WBS 제목. 앱은 행사일·고객사(주최·주관)·행사명에서 늘 파생한다(저장하지 않는다).
// 순수 함수 · 런타임 import 0 — api/ Drive 트리(폴더 이름)와 앱 파일명 규약(statusMachine)이 같은 함수를 쓴다.
// 가정: 프로토콜의 '행사일 미정 = YYMM00'은 달을 아는 경우인데 앱은 날짜 하나만 받으므로, 행사일이 없으면 날짜 칸을 뺀다.
//       고객사가 없으면 고객사 칸을 뺀다(고객사는 필수 4에 들어 있어 세팅이 끝난 행사는 늘 있다). 주최형은 고객사 = 우리 회사명(사람이 적는다 — 회사명 하드코딩 금지).

export interface ProjectLabelSource {
  name: string
  organizer?: string | null
  event_date?: string | null
}

/** 이름 조각 정리 — 경로 구분자·Drive가 못 쓰는 문자·제어문자 제거, 공백 정리, 길이 상한 */
export function labelSegment(s: string | null | undefined, max = 80): string {
  return String(s ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/** YYYY-MM-DD → YYMMDD(행사일이 없거나 모양이 다르면 null) */
export function labelDate(eventDate: string | null | undefined): string | null {
  const m = /^\d{2}(\d{2})-(\d{2})-(\d{2})/.exec(eventDate ?? '')
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

export interface ProjectLabelParts {
  date: string | null
  organizer: string | null
  name: string
  /** 비어 있어 ID에서 빠진 칸 */
  missing: ('event_date' | 'organizer')[]
}

export function projectLabelParts(p: ProjectLabelSource): ProjectLabelParts {
  const date = labelDate(p.event_date)
  const organizer = labelSegment(p.organizer, 40) || null
  const name = labelSegment(p.name, 80) || '이름 없음'
  const missing: ProjectLabelParts['missing'] = []
  if (!date) missing.push('event_date')
  if (!organizer) missing.push('organizer')
  return { date, organizer, name, missing }
}

/** 행사 ID — 예: 261020_가상고객_가상 컨퍼런스 (행사일·고객사가 비면 그 칸 없이) */
export function projectLabel(p: ProjectLabelSource): string {
  const { date, organizer, name } = projectLabelParts(p)
  return [date, organizer, name].filter((x): x is string => !!x).join('_')
}
