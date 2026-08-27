// 견적서 임포트 — 파서 계약 타입 (설계서 §22 정본).
// parseQuoteWorkbook(3.15d, 에이전트 AD 구현 예정)의 입출력 계약을 여기서 먼저 확정한다 —
// 파서 본체가 스텁이어도 provider·확인 큐·테스트는 이 타입 위에서 먼저 움직일 수 있어야 한다.
// #RULE-NO-COMPANY: 실서식 구조를 본뜬 가상 데이터만 골든 테스트에 쓴다(§22.3 R-Q4).

/** §22.1 — 헤더 필드. 인식 실패 필드는 빈 값(undefined)으로 두고 확인 큐가 사람에게 넘긴다(§22.2-1) */
export interface ParsedQuoteHeader {
  event_name?: string
  client?: string
  /** 자유 텍스트 — 이 단계에서 IsoDate로 파싱하지 않는다(확인 큐 영역) */
  date_range?: string
  venue?: string
  quoted_at?: string
  manager?: string
  total_amount?: number
  vat_mode?: 'included' | 'excluded' | 'unknown'
}

/** §22.2-3 — 항목 행. amount 외에는 서식(A·B·C형)에 따라 있거나 없을 수 있다 */
export interface ParsedQuoteItem {
  title: string
  spec?: string
  unit_price?: number
  qty?: number
  days?: number
  amount: number
  note?: string
}

/** §22.2-2 — "N." 숫자 프리픽스 제목 행 기준 섹션. 섹션이 없는 문서는 전체를 1섹션으로 */
export interface ParsedQuoteSection {
  name: string
  order: number
  items: ParsedQuoteItem[]
  subtotal?: number
}

/** §22.2-4 — 합계 체계(항목합·대행료·절사·VAT·총액) */
export interface ParsedQuoteTotals {
  items_sum?: number
  agency_fee?: number
  agency_fee_rate?: number
  rounding?: number
  vat?: number
  grand_total?: number
}

/** §22.2-5 — 검산 결과. 불일치는 경고로 표시하되 진행을 막지 않는다 */
export interface ParsedQuoteCheck {
  name: string
  expected: number
  actual: number
  ok: boolean
}

/** 파서(parseQuoteWorkbook) 산출 — quote_imports.parsed에 원본 스냅숏으로 그대로 저장된다(R-Q2) */
export interface ParsedQuoteDoc {
  format: 'A' | 'B' | 'C'
  header: ParsedQuoteHeader
  sections: ParsedQuoteSection[]
  totals: ParsedQuoteTotals
  checks: ParsedQuoteCheck[]
  warnings: string[]
}

/**
 * §22.2-6 — 섹션 → 버킷 매핑 한 줄. `bucket`은 견적 breakdown의 engine-shape 키
 * (s1·s2·s3·s4·s5·options·recruit·attendee) 중 하나이거나, 매칭되지 않는 섹션은 'custom'이다.
 * confidence='low'는 키워드 무매칭·복수매칭 — 확인 큐에서 사람이 확정해야 한다(§22.2-6 말미).
 */
export interface SectionMapping {
  section: string
  bucket: string
  confidence: 'high' | 'low'
}
