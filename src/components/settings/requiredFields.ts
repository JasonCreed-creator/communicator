// 필수 4항목(행사명·고객사·행사일·장소) 정본 — 설계서 v1.5 §10 S6·DoD 19 · v2.16 §4-1d(행사 코드 → 고객사: 행사 ID = YYMMDD_고객사_행사명).
// S-1 카드('남은 필수 항목')·S6 탭 줄 요약·온보딩 진행 줄이 같은 목록을 쓰도록 한 곳에 둔다.
// 표시 계층 전용 — 저장 검증의 정본은 ProjectOverviewForm·MockProvider 쪽이다.

export type RequiredFieldKey = 'name' | 'organizer' | 'event_date' | 'venue'

export interface RequiredFieldSource {
  name?: string | null
  organizer?: string | null
  event_date?: string | null
  venue?: string | null
}

export const REQUIRED_FIELDS: { key: RequiredFieldKey; label: string }[] = [
  { key: 'name', label: '행사명' },
  { key: 'organizer', label: '고객사' },
  { key: 'event_date', label: '행사일' },
  { key: 'venue', label: '장소' },
]

function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** 입력된 필수 항목 키 집합 */
export function filledRequired(src: RequiredFieldSource): Set<RequiredFieldKey> {
  const set = new Set<RequiredFieldKey>()
  for (const f of REQUIRED_FIELDS) if (filled(src[f.key])) set.add(f.key)
  return set
}

/** 미입력 필수 항목(표시 순서 유지) */
export function missingRequired(src: RequiredFieldSource): { key: RequiredFieldKey; label: string }[] {
  const done = filledRequired(src)
  return REQUIRED_FIELDS.filter((f) => !done.has(f.key))
}
