// 협력사 견적서 → 정산 발주 항목 후보 (설계서 v2.11 §19.5 · Phase 4.7). 순수 함수만 — mock·실서버가 같은 결과를 낸다.
//
// §19.5 정본: "확신이 서지 않는 것만 담당자에게 묻는다 — 묻는 것은 대개 둘이다: 어느 버킷인지, 부가세가 포함인지."
// "읽은 결과는 항상 담당자 확인을 거쳐 저장한다(오독이 곧 정산 오류가 된다)." 그래서 여기서는 **제안만** 만든다.
//   · 행: 견적서의 항목 행 전부 + (항목 밖에 있을 때) 협력사 대행료·관리비 + 절사·조정. 행 합 = 공급가(부가세 전)
//   · 버킷: ① 행사별 추가 버킷 이름이 그대로 들어 있으면 그 버킷 ② 섹션 이름 ③ 항목 이름 — 키워드 규칙은 견적서 임포트(§22.2-6)
//     정본(`mapSectionName`)을 그대로 쓴다. **원가 버킷(has_cost)만** 제안한다 — s5(PCO 기획료)·rc·ld는 원가가 없어
//     협력사 비용을 담을 수 없다(R-S4). 못 고르면 null(확인 큐가 묻는다)
//   · 부가세: 부가세 줄이 따로 있으면 항목은 별도(확실) · '별도' 표기면 별도(확실) · '포함' 표기뿐이면 포함으로 제안하되 묻는다 ·
//     아무 표기도 없으면 제안 없이 묻는다(추측 금지)
// 파서는 견적서 임포트와 같은 것(`parseQuoteWorkbook` — A·B·C형)을 쓴다. 실서식 보정은 사용자 실샘플을 받은 뒤(가정 — §19.5 v2.11).
import { mapSectionName } from '../modules/quote/import/buckets'
import { parseQuoteWorkbook } from '../modules/quote/import/parser'
import { ProviderError } from './errors'
import type { ParsedQuoteCheck, ParsedQuoteDoc, ParsedQuoteTotals } from '../modules/quote/import/types'
import type { SettlementBucket } from '../types/entities'
import { toVatExcluded } from './settlement'
import { isAiVendorQuoteFile, type VendorQuoteSourceDoc } from './vendorQuoteAi'

export type VendorQuoteRowSource = 'item' | 'agency_fee' | 'rounding'

export interface VendorQuoteRow {
  /** 행 번호(0부터) — 확정 때 이 번호로 금액을 되찾는다(금액은 서버가 저장한 값을 쓴다) */
  index: number
  source: VendorQuoteRowSource
  section: string
  title: string
  spec: string | null
  /** 견적서에 적힌 금액 그대로(음수 = 할인·절사). 부가세 포함 여부는 가져오기 단위 질문 */
  amount: number
  /** 제안 버킷 코드(원가 버킷만) — null = 담당자가 고른다 */
  bucket_code: string | null
  confidence: 'high' | 'low'
  /** 기본 포함 여부 — 0원 행은 빼 둔다 */
  include: boolean
}

export interface VendorQuoteVat {
  /** 제안(true = 항목 금액에 부가세 포함) — null이면 제안 없음(반드시 골라야 한다) */
  suggested: boolean | null
  /** 확실한가 — false면 확인 큐가 묻는다 */
  certain: boolean
  reason: string
}

/** settlement_imports.parsed 저장 형태(원본 근거 스냅숏 — R-Q2와 같은 규약) */
export interface VendorQuoteParsed {
  kind: 'vendor_quote'
  /** A·B·C = 엑셀 파서 서식 · 'ai' = PDF·사진을 AI가 읽음(Phase 4.8) */
  format: VendorQuoteSourceDoc['format']
  /** AI가 읽었으면 그 표시(확인 큐가 'AI가 읽음' 배지와 대조 안내를 띄운다) — 엑셀은 없음 */
  reader?: { kind: 'ai'; model: string }
  header: { event_name?: string; manager?: string; quoted_at?: string; total_amount?: number; vat_mode?: 'included' | 'excluded' | 'unknown' }
  rows: VendorQuoteRow[]
  totals: ParsedQuoteTotals
  checks: ParsedQuoteCheck[]
  warnings: string[]
  vat: VendorQuoteVat
}

export type VendorQuoteQuestion = 'vat' | 'bucket'

/** 견적 엔진 키 → 정산 버킷 코드(원가 버킷만). s5·recruit(rc·ld)는 원가가 없어 null */
const ENGINE_TO_BUCKET: Record<string, string | null> = {
  s1: 's1',
  s2: 's2',
  s3: 's3',
  s4: 's4',
  options: 'ot',
  attendee: 'at',
  s5: null,
  recruit: null,
  custom: null,
}

/**
 * 파서 경고 중 협력사 견적에 해당하지 않는 것 — '인식하지 못한 헤더 항목(고객명·일시·장소 …) — 확인 큐에서 입력하세요'는
 * 우리 견적서 임포트(§22)의 확인 큐 질문이다. 협력사 견적의 확인 큐는 부가세·버킷만 묻는다(§19.5) — 남기면 없는 칸을 찾게 한다.
 */
const NOT_FOR_VENDOR_WARNING = /^인식하지 못한 헤더 항목/

/** 협력사 대행료·관리비가 항목 표 안의 섹션으로 들어 있는가(그러면 따로 행을 만들지 않는다 — 이중 계산 방지) */
const FEE_SECTION = /대행료|기획료|관리비|수수료|pco/i
/** '총액 미포함'·선택 옵션 — 견적서 총액에 들어가지 않은 행은 기본으로 뺀다(파서도 섹션 검산에서 제외한다) */
const NOT_IN_TOTAL = /총액\s*미포함|미포함|선택\s*옵션|optional/i

export function suggestBucket(
  section: string,
  title: string,
  buckets: readonly SettlementBucket[],
): { bucket_code: string | null; confidence: 'high' | 'low' } {
  const cost = buckets.filter((b) => b.has_cost)
  const text = `${section} ${title}`
  const custom = cost.filter((b) => b.source === 'custom' && b.label.trim().length >= 2 && text.includes(b.label.trim()))
  if (custom.length === 1) return { bucket_code: custom[0].code, confidence: 'high' }
  for (const name of [section, title]) {
    if (!name.trim()) continue
    const m = mapSectionName(name)
    const code = m.confidence === 'high' ? (ENGINE_TO_BUCKET[m.bucket] ?? null) : null
    if (code && cost.some((b) => b.code === code)) return { bucket_code: code, confidence: 'high' }
  }
  return { bucket_code: null, confidence: 'low' }
}

export function vatOf(doc: Pick<ParsedQuoteDoc, 'totals' | 'header'>): VendorQuoteVat {
  if ((doc.totals.vat ?? 0) !== 0) {
    return { suggested: false, certain: true, reason: '견적서에 부가세 줄이 따로 있어 항목 금액을 부가세 별도로 읽었습니다.' }
  }
  if (doc.header.vat_mode === 'excluded') {
    return { suggested: false, certain: true, reason: "견적서에 '부가세 별도' 표기가 있습니다." }
  }
  if (doc.header.vat_mode === 'included') {
    return {
      suggested: true,
      certain: false,
      reason: "견적서가 '부가세 포함'으로 표기돼 있고 부가세 줄이 따로 없습니다 — 항목 금액에 부가세가 들어 있는지 확인하세요.",
    }
  }
  return { suggested: null, certain: false, reason: '견적서에서 부가세 포함·별도 표기를 찾지 못했습니다 — 골라 주세요.' }
}

/** 파싱 결과 → 확인 큐(행·부가세·질문) */
export function buildVendorQuote(
  doc: VendorQuoteSourceDoc,
  buckets: readonly SettlementBucket[],
  reader?: VendorQuoteParsed['reader'],
): { parsed: VendorQuoteParsed; questions: VendorQuoteQuestion[] } {
  const rows: VendorQuoteRow[] = []
  for (const section of doc.sections) {
    for (const item of section.items) {
      rows.push({
        index: rows.length,
        source: 'item',
        section: section.name,
        title: item.title,
        spec: item.spec?.trim() || null,
        amount: item.amount,
        ...suggestBucket(section.name, item.title, buckets),
        include: item.amount !== 0 && !NOT_IN_TOTAL.test(`${section.name} ${item.note ?? ''}`),
      })
    }
  }
  // 합계 줄(대행료·절사)은 가장 큰 제안 버킷에 붙인다(확신 없음 — 담당자가 본다)
  const dominant = dominantBucket(rows)
  const feeInside = doc.sections.some((s) => FEE_SECTION.test(s.name))
  if (!feeInside && (doc.totals.agency_fee ?? 0) !== 0) {
    rows.push({
      index: rows.length,
      source: 'agency_fee',
      section: '합계',
      title: '협력사 대행료·관리비',
      spec: doc.totals.agency_fee_rate ? `${Math.round(doc.totals.agency_fee_rate * 1000) / 10}%` : null,
      amount: doc.totals.agency_fee!,
      bucket_code: dominant,
      confidence: 'low',
      include: true,
    })
  }
  if ((doc.totals.rounding ?? 0) !== 0) {
    rows.push({
      index: rows.length,
      source: 'rounding',
      section: '합계',
      title: '절사·조정',
      spec: null,
      amount: doc.totals.rounding!,
      bucket_code: dominant,
      confidence: 'low',
      include: true,
    })
  }
  const vat = vatOf(doc)
  const questions: VendorQuoteQuestion[] = []
  if (!vat.certain) questions.push('vat')
  if (rows.some((r) => r.include && (r.bucket_code === null || r.confidence === 'low'))) questions.push('bucket')
  return {
    parsed: {
      kind: 'vendor_quote',
      format: doc.format,
      ...(reader ? { reader } : {}),
      header: {
        event_name: doc.header.event_name,
        manager: doc.header.manager,
        quoted_at: doc.header.quoted_at,
        total_amount: doc.header.total_amount,
        vat_mode: doc.header.vat_mode,
      },
      rows,
      totals: doc.totals,
      checks: doc.checks,
      warnings: doc.warnings.filter((w) => !NOT_FOR_VENDOR_WARNING.test(w)),
      vat,
    },
    questions,
  }
}

function dominantBucket(rows: readonly VendorQuoteRow[]): string | null {
  const sums = new Map<string, number>()
  for (const r of rows) {
    if (r.bucket_code && r.confidence === 'high') sums.set(r.bucket_code, (sums.get(r.bucket_code) ?? 0) + Math.abs(r.amount))
  }
  let best: string | null = null
  let max = -1
  for (const [code, sum] of sums) {
    if (sum > max) {
      best = code
      max = sum
    }
  }
  return best
}

/** 확정 미리보기 — 고른 행의 견적서 금액 합과 저장될 공급가(부가세 별도) 합 */
export function vendorQuoteSums(rows: readonly Pick<VendorQuoteRow, 'amount'>[], vatIncluded: boolean): { raw: number; supply: number } {
  return rows.reduce(
    (acc, r) => ({ raw: acc.raw + r.amount, supply: acc.supply + toVatExcluded(r.amount, vatIncluded) }),
    { raw: 0, supply: 0 },
  )
}

/**
 * 공급가 대조 — 견적서의 부가세 전 합계(항목 + 대행료 + 절사)와 행 합이 맞는가(맞지 않아도 막지 않는다 — §22.2-5).
 * 기본은 제안상 포함 행(총액 미포함·0원 행 제외), 화면은 지금 고른 행을 넘긴다.
 */
export function supplyCheck(
  parsed: Pick<VendorQuoteParsed, 'rows' | 'totals'>,
  chosen: readonly Pick<VendorQuoteRow, 'amount'>[] = parsed.rows.filter((r) => r.include),
): { expected: number | null; actual: number; ok: boolean } {
  const actual = chosen.reduce((s, r) => s + r.amount, 0)
  const t = parsed.totals
  // 대행료가 항목 밖(합계 줄)일 때만 행에 따로 있다 — 그때만 더한다(항목 안 섹션이면 items_sum에 이미 들어 있다)
  const feeRow = parsed.rows.find((r) => r.source === 'agency_fee')?.amount ?? 0
  const expected =
    t.grand_total !== undefined && t.vat !== undefined
      ? t.grand_total - t.vat
      : t.items_sum !== undefined
        ? t.items_sum + feeRow + (t.rounding ?? 0)
        : null
  return { expected, actual, ok: expected === null || Math.abs(expected - actual) <= 1 }
}

/** 엑셀 견적서 — 파서가 읽는다(§19.5a) */
export function isVendorQuoteXlsx(name: string): boolean {
  return /\.xlsx$/i.test(name.trim())
}

/** 받는 파일 — 엑셀(파서) + PDF·사진(AI — Phase 4.8 · §19.5b) */
export function isVendorQuoteFile(name: string): boolean {
  return isVendorQuoteXlsx(name) || isAiVendorQuoteFile(name)
}

export const VENDOR_QUOTE_FILE_MESSAGE =
  '엑셀(.xlsx)·PDF·사진(JPG·PNG·WEBP) 견적서를 불러올 수 있습니다 — 아이폰 사진(HEIC)은 JPG로 바꿔 올려 주세요.'

/** mock(데모)에는 AI 서버가 없다 — 흉내 내지 않고 사실대로 */
export const VENDOR_QUOTE_AI_MOCK_MESSAGE =
  'PDF·사진은 실서버에서 AI(Claude)가 읽습니다 — 데모에서는 엑셀(.xlsx) 견적서로 시험해 보세요.'

/** 파일 입력 accept — 엑셀 + PDF + 사진 */
export const VENDOR_QUOTE_ACCEPT =
  '.xlsx,.pdf,.jpg,.jpeg,.png,.webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/jpeg,image/png,image/webp'

export const VENDOR_QUOTE_NO_BOARD_MESSAGE = '정산보드를 먼저 만드세요 — 확정 견적을 불러와야 버킷이 생기고, 협력사 견적을 그 버킷에 나눌 수 있습니다.'
export const VENDOR_QUOTE_NOT_PARSED_MESSAGE = '이미 확정했거나 버린 견적서입니다 — 다시 불러오세요.'

/**
 * 엑셀 → 파싱(견적서 임포트와 같은 파서 · A·B·C형). 읽지 못하면 무엇을 확인할지 한국어로 422 —
 * 항목이 하나도 없으면(표 머리를 못 찾음 등) 같은 422. 파서의 오류 문구는 그대로 살린다.
 */
export function parseVendorQuoteWorkbook(data: ArrayBuffer, fileName: string): ParsedQuoteDoc {
  let doc: ParsedQuoteDoc
  try {
    doc = parseQuoteWorkbook(data, fileName)
  } catch (e) {
    if (e instanceof ProviderError) throw e
    throw new ProviderError('validation', '견적서를 읽지 못했습니다 — 암호가 걸려 있거나 손상된 파일인지 확인하세요.')
  }
  if (!doc.sections.some((s) => s.items.length > 0)) {
    throw new ProviderError('validation', '견적서에서 항목 표를 찾지 못했습니다 — 품목·금액 열이 있는 견적서인지 확인하세요.')
  }
  return doc
}
