// §22.2-6 섹션 → 버킷 매핑 기본표 (정본 규칙 한 곳).
//
// 주의: MockProvider(3.15a)는 같은 규칙을 private `defaultSectionMapping`으로 들고 있다.
// 인터페이스 동결 규약상 provider 파일은 이번 단계에서 손대지 않으므로, 규칙의 **정본은 여기**로
// 두고 provider 쪽 복사본과 결과가 100% 같은지 테스트(parser.buckets.test.ts)로 상시 대조한다.
// Phase 4(SupabaseProvider)에서 provider가 이 모듈을 import하도록 합치는 것이 다음 정리 지점이다.
import type { ParsedQuoteDoc, SectionMapping } from './types'

/** 매핑 규칙 — 위에서부터 검사하되 "복수 규칙 매칭"은 저신뢰로 떨어뜨린다(§22.2-6 말미) */
export const SECTION_BUCKET_RULES: { bucket: string; keywords: string[] }[] = [
  { bucket: 's1', keywords: ['베뉴', '대관', '장소'] },
  { bucket: 's2', keywords: ['무대', '시스템', 'av', 'led', '음향', '조명', '중계', '전기', '부스'] },
  { bucket: 's3', keywords: ['디자인', '브랜딩', '콘텐츠', '사인'] },
  { bucket: 's4', keywords: ['인력', '운영', '보험', 'mc'] },
  { bucket: 's5', keywords: ['대행료', '기획료'] },
  { bucket: 'recruit', keywords: ['등록', 'rsvp', '모객'] },
  { bucket: 'custom', keywords: ['기념품', '경품', 'f&b', '웰컴', '애드온'] },
]

/** 확인 큐 드롭다운 선택지 — 값은 견적 breakdown의 engine-shape 키(§22.4·MockProvider 합산 규약) */
export const QUOTE_IMPORT_BUCKETS: { code: string; label: string }[] = [
  { code: 's1', label: 's1 · 베뉴 사용료' },
  { code: 's2', label: 's2 · 시스템 구축' },
  { code: 's3', label: 's3 · 디자인·브랜딩' },
  { code: 's4', label: 's4 · 운영·등록·보험' },
  { code: 's5', label: 's5 · PCO 기획료' },
  { code: 'options', label: 'ot · 추가옵션' },
  { code: 'recruit', label: 'rc · 모객·RSVP' },
  { code: 'attendee', label: 'at · 참관객 관리' },
  { code: 'custom', label: 'custom · 기타(행사별 버킷)' },
]

export function bucketLabel(code: string): string {
  return QUOTE_IMPORT_BUCKETS.find((b) => b.code === code)?.label ?? code
}

/** 섹션명 하나를 버킷으로 — 무매칭·복수매칭은 custom + 저신뢰 */
export function mapSectionName(name: string): { bucket: string; confidence: 'high' | 'low' } {
  const lower = name.toLowerCase()
  const matched = SECTION_BUCKET_RULES.filter((r) => r.keywords.some((k) => lower.includes(k.toLowerCase())))
  if (matched.length === 1) return { bucket: matched[0].bucket, confidence: 'high' }
  return { bucket: 'custom', confidence: 'low' }
}

/** 파싱 결과 전체의 기본 매핑 — provider가 만드는 초기 mapping과 동일해야 한다 */
export function mapSectionsToBuckets(parsed: ParsedQuoteDoc): SectionMapping[] {
  return parsed.sections.map((section) => ({ section: section.name, ...mapSectionName(section.name) }))
}
