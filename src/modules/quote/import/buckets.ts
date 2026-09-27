// §22.2-6 섹션 → 버킷 매핑 기본표 (정본 규칙 한 곳).
//
// 주의: MockProvider(3.15a)는 같은 규칙을 private `defaultSectionMapping`으로 들고 있다.
// 인터페이스 동결 규약상 provider 파일은 이번 단계에서 손대지 않으므로, 규칙의 **정본은 여기**로
// 두고 provider 쪽 복사본과 결과가 100% 같은지 테스트(parser.buckets.test.ts)로 상시 대조한다.
// Phase 4(SupabaseProvider)에서 provider가 이 모듈을 import하도록 합치는 것이 다음 정리 지점이다.
import type { ParsedQuoteDoc, SectionMapping } from './types'

/** 매핑 규칙 — 위에서부터 검사하되 "복수 규칙 매칭"은 저신뢰로 떨어뜨린다(§22.2-6 말미) */
export const SECTION_BUCKET_RULES: { bucket: string; keywords: string[] }[] = [
  // v2.18 — 영문 키워드(해외 인바운드 견적서)는 **단어 단위**로 맞춘다('av'가 'travel'을 삼키지 않게 — matchesKeyword)
  { bucket: 's1', keywords: ['베뉴', '대관', '장소', 'venue', 'rental', 'hall'] },
  {
    bucket: 's2',
    keywords: ['무대', '시스템', 'av', 'led', '음향', '조명', '중계', '전기', '부스',
      'stage', 'system', 'sound', 'audio', 'lighting', 'screen', 'streaming', 'broadcast', 'electric', 'booth', 'equipment'],
  },
  { bucket: 's3', keywords: ['디자인', '브랜딩', '콘텐츠', '사인', 'design', 'branding', 'content', 'signage', 'graphic', 'creative'] },
  { bucket: 's4', keywords: ['인력', '운영', '보험', 'mc', 'staff', 'staffing', 'operation', 'operations', 'insurance', 'manpower', 'personnel', 'security'] },
  { bucket: 's5', keywords: ['대행료', '기획료', 'agency fee', 'management fee', 'service fee', 'pco', 'coordination'] },
  { bucket: 'recruit', keywords: ['등록', 'rsvp', '모객', 'registration', 'recruit', 'lead', 'leads', 'marketing', 'promotion'] },
  { bucket: 'custom', keywords: ['기념품', '경품', 'f&b', '웰컴', '애드온', 'gift', 'souvenir', 'giveaway', 'catering', 'welcome', 'add-on', 'add-ons', 'addon', 'addons', 'option', 'options', 'optional'] },
]

/** 키워드 매칭 — 국문은 부분 일치, 영문(ASCII)은 단어 단위 */
export function matchesKeyword(lowerName: string, keyword: string): boolean {
  const k = keyword.toLowerCase()
  if (!/^[a-z0-9&' -]+$/.test(k)) return lowerName.includes(k)
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lowerName)
}

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

/**
 * v2.20.2 — 우리 견적서(리멤버 MICE 솔루션 견적서 — Configurator 내보내기 `exportEstimate`)의 섹션 제목은 정해져 있다.
 * 키워드 규칙보다 먼저 본다(실사용 2026-09-27: "운영인력·등록·보험"이 운영(s4)·등록(recruit) 두 규칙에 걸려 custom이 됐다).
 * 국문·영문 제목 모두 — 제목 뒤의 꼬리("(100명 기준)"·"[게런티 40명]"·"[예상치 · 확정 아님]")는 무시한다.
 */
export const KNOWN_SECTION_BUCKETS: { bucket: string; pattern: RegExp }[] = [
  { bucket: 's1', pattern: /베뉴\s*사용료|venue\s*rental/i },
  { bucket: 's2', pattern: /시스템\s*구축|system\s*\/?\s*av\b/i },
  { bucket: 's3', pattern: /디자인\s*[·/]\s*브랜딩|design\s*\/?\s*branding/i },
  { bucket: 's4', pattern: /운영\s*인력\s*[·/]\s*등록\s*[·/]\s*보험|운영\s*[·/]\s*등록\s*[·/]\s*보험|operations?\s*[·/]\s*staff\s*[·/]\s*insurance/i },
  { bucket: 'options', pattern: /추가\s*옵션|^\s*\d*[.)]?\s*add-?ons?\s*$/i }, // 영문은 제목이 'N. Add-ons'뿐일 때만(리멤버 영문 견적서) — 'Optional Add-ons (not included)' 같은 남의 제목은 §22.2-6 custom 규칙 그대로
  { bucket: 's5', pattern: /pco\s*(기획료|planning\s*fee)/i },
  { bucket: 'recruit', pattern: /모객\s*솔루션|audience\s*recruitment/i },
  { bucket: 'attendee', pattern: /참가\s*인원\s*관리|참관객\s*관리|attendee\s*management/i },
]

/** 섹션명 하나를 버킷으로 — 우리 견적서 제목은 확신 · 키워드 규칙 하나면 확신 · 여러 규칙이면 키워드 적중이 뚜렷이 많은 쪽 · 그 밖은 custom + 저신뢰 */
export function mapSectionName(name: string): { bucket: string; confidence: 'high' | 'low' } {
  const known = KNOWN_SECTION_BUCKETS.find((k) => k.pattern.test(name))
  if (known) return { bucket: known.bucket, confidence: 'high' }
  const lower = name.toLowerCase()
  const scored = SECTION_BUCKET_RULES.map((r) => ({ bucket: r.bucket, hits: r.keywords.filter((k) => matchesKeyword(lower, k)).length })).filter(
    (r) => r.hits > 0,
  )
  if (scored.length === 1) return { bucket: scored[0].bucket, confidence: 'high' }
  if (scored.length > 1) {
    // v2.20.2 — "운영인력·등록·보험"처럼 두 규칙에 걸려도 한쪽 적중이 2개 이상 많으면 그쪽(§22.2-6)
    const sorted = [...scored].sort((a, b) => b.hits - a.hits)
    if (sorted[0].hits - sorted[1].hits >= 2) return { bucket: sorted[0].bucket, confidence: 'high' }
  }
  return { bucket: 'custom', confidence: 'low' }
}

/** 파싱 결과 전체의 기본 매핑 — provider가 만드는 초기 mapping과 동일해야 한다 */
export function mapSectionsToBuckets(parsed: ParsedQuoteDoc): SectionMapping[] {
  return parsed.sections.map((section) => ({ section: section.name, ...mapSectionName(section.name) }))
}
