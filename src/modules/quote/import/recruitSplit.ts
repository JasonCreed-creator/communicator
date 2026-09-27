// v2.20.2 — 임포트 견적의 모객(recruit) 섹션을 정산보드 버킷 rc(RSVP 운영비)·ld(리드젠/쇼업 보장)로 나눈다(§19.2 · §22.4).
//
// 엔진 견적은 rsvpPkg·showup 산출값이 있어 나눌 필요가 없지만, 가져온 견적은 엔진 입력이 비어 있어 둘 다 0이 됐다 —
// 실사용 2026-09-27: 리멤버 견적서의 모객 14,000,000이 정산보드에서 사라졌다(RSVP 0 · 리드젠 0).
// 규칙: recruit로 매핑된 섹션의 항목마다 제목·규격에 쇼업/리드젠/참석 보장 표기가 있으면 ld, 그 밖은 rc(버킷 이름이 'rc · 모객·RSVP'다).
// 추측으로 비율을 나누지 않는다 — 항목 줄이 없고 소계만 있으면 전부 rc.
import type { ParsedQuoteDoc, SectionMapping } from './types'

export const RECRUIT_SHOWUP_HINT = /쇼업|show\s*-?\s*up|리드젠|lead\s*-?\s*gen|참석\s*보장|show-?up\s*guarantee|guaranteed\s*attend/i

export interface RecruitSplit {
  rsvp: number
  showup: number
}

/** recruit로 매핑된 섹션이 없으면 null */
export function splitRecruit(parsed: Pick<ParsedQuoteDoc, 'sections'>, mapping: readonly SectionMapping[]): RecruitSplit | null {
  const names = new Set(mapping.filter((m) => m.bucket === 'recruit').map((m) => m.section))
  if (names.size === 0) return null
  let rsvp = 0
  let showup = 0
  for (const section of parsed.sections) {
    if (!names.has(section.name)) continue
    if (section.items.length === 0) {
      rsvp += section.subtotal ?? 0
      continue
    }
    for (const item of section.items) {
      const text = `${item.title} ${item.spec ?? ''}`
      if (RECRUIT_SHOWUP_HINT.test(text)) showup += item.amount || 0
      else rsvp += item.amount || 0
    }
    // 소계가 항목 합보다 크면(반올림·누락) 차이는 rc에 둔다 — 값을 지어내지 않고 합만 맞춘다
    if (section.subtotal !== undefined) {
      const diff = section.subtotal - (rsvp + showup)
      if (diff > 0) rsvp += diff
    }
  }
  return { rsvp, showup }
}
