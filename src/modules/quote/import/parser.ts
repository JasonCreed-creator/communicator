// 견적서 임포트 파서 (설계서 v2.4 §22.2 정본) — xlsx 바이너리 → ParsedQuoteDoc.
//
// 규칙 요약(§22.2):
//  1) 헤더는 라벨 사전 매칭. 실패 필드는 빈 값으로 두고 확인 큐가 사람에게 넘긴다(추정 금지).
//  2) 서식은 항목 표 헤더 행의 열 라벨로 판별한다 — A형(단가·수량·일수) / B형(금액 단식) / C형(UNIT PRICE·QTY·AMOUNT).
//  3) 섹션은 "N." 숫자 프리픽스 제목 행(5-1 같은 소수 번호·선행 공백 허용) + 소계/total 행.
//  4) 항목 행은 금액 열에 숫자가 있는 행. A형은 단가×수량×일수=금액으로 열 역할을 역확인한다.
//  5) 합계 체계(항목합·대행료/기획료·절사·부가세·총액)는 표 위 "총액 블록"에서 읽고, 없으면 섹션 합으로 파생한다.
//  6) 모든 검산은 checks[]에 기록만 한다 — **불일치가 진행을 막지 않는다**(확인 큐에서 사람이 판단).
//
// 계약상 이 함수는 **동기**다(MockProvider.importQuoteFile이 동기로 호출한다) —
// 그래서 xlsx 해제는 exceljs가 아니라 동기 리더(./xlsxReader)를 쓴다. 자세한 이유는 inflate.ts 머리말.
//
// 총액 규약(구현 결정, 아래 계약을 문서화해 둔다):
//  · `totals.grand_total` = **부가세 포함** 총액. 문서가 별도 기준 총액만 인쇄했으면 vat를 더해 채운다.
//    (MockProvider.buildImportedBreakdown이 grand_total − vat를 공급가로 쓰기 때문에 여기서 기준을 맞춘다.)
//  · `header.total_amount` = 문서에 **인쇄된 대표 금액 그대로** + `header.vat_mode`가 포함/별도를 알려준다.
import { ProviderError } from '../../../lib/errors'
import type {
  ParsedQuoteCheck,
  ParsedQuoteDoc,
  ParsedQuoteHeader,
  ParsedQuoteItem,
  ParsedQuoteSection,
  ParsedQuoteTotals,
} from './types'
import { readXlsxSheets, type CellValue, type SheetGrid } from './xlsxReader'

// ── 셀 유틸 ────────────────────────────────────────────────────────────
type Row = CellValue[]

function text(v: CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return v.trim()
}

/** 라벨 비교용 정규화 — 공백 제거·소문자·장식문자 정리("행 사 명" = "행사명") */
function norm(v: CellValue): string {
  return text(v)
    .replace(/\s+/g, '')
    .replace(/[：:]/g, '')
    .toLowerCase()
}

function num(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return null
}

/** 문자열 안의 대표 금액 — 자릿수가 가장 긴 숫자 덩어리("(￦376,000,000/원)" → 376000000) */
function amountInText(s: string): number | null {
  const matches = s.match(/-?[0-9][0-9,]*/g)
  if (!matches) return null
  let best: number | null = null
  let bestDigits = 0
  for (const raw of matches) {
    const digits = raw.replace(/[^0-9]/g, '').length
    if (digits < 4) continue
    const n = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    if (digits > bestDigits) {
      best = n
      bestDigits = digits
    }
  }
  return best
}

function rowText(row: Row): string {
  return row.map((c) => text(c)).filter(Boolean).join(' ')
}

function isEmptyRow(row: Row | undefined): boolean {
  return !row || row.every((c) => text(c) === '')
}

/** 행의 첫 비어 있지 않은 셀 [열, 값] */
function firstFilled(row: Row): [number, string] | null {
  for (let c = 0; c < row.length; c++) {
    const t = text(row[c])
    if (t) return [c, t]
  }
  return null
}

const EPS = 1

function near(a: number, b: number, tol = EPS): boolean {
  return Math.abs(a - b) <= tol
}

// ── 열 역할 ────────────────────────────────────────────────────────────
type ColRole = 'group' | 'title' | 'spec' | 'unit_price' | 'qty' | 'days' | 'amount' | 'note' | 'select'

const COL_PATTERNS: { role: ColRole; keys: string[] }[] = [
  { role: 'select', keys: ['select', '선택여부'] },
  { role: 'unit_price', keys: ['단가', 'unitprice', 'unit_price'] },
  { role: 'qty', keys: ['수량', 'qty', 'quantity'] },
  { role: 'days', keys: ['일수', 'days', 'day'] },
  { role: 'amount', keys: ['금액', 'amount', '합계금액'] },
  { role: 'note', keys: ['비고', 'remarks', 'remark', 'note'] },
  { role: 'group', keys: ['구분', '분류', 'category'] },
  { role: 'title', keys: ['항목', 'item', '품목', '내역'] },
  { role: 'spec', keys: ['규격', '사양', 'description', 'spec', 'size', '내용'] },
]

interface ColumnMap {
  roles: Map<number, ColRole>
  amountCol: number
  /** 헤더 라벨이 영문 계열이면 C형 후보 */
  englishAmount: boolean
}

function classifyHeaderRow(row: Row): ColumnMap | null {
  const roles = new Map<number, ColRole>()
  let amountCol = -1
  let englishAmount = false
  for (let c = 0; c < row.length; c++) {
    const key = norm(row[c])
    if (!key) continue
    const hit = COL_PATTERNS.find((p) => p.keys.some((k) => key.includes(k)))
    if (!hit) continue
    if (roles.has(c)) continue
    if (hit.role === 'amount') {
      if (amountCol >= 0) continue // 첫 금액 열만 채택
      amountCol = c
      englishAmount = key.includes('amount')
    }
    roles.set(c, hit.role)
  }
  if (amountCol < 0) return null
  const kinds = new Set(roles.values())
  // 금액 + (항목·규격·구분·단가) 중 하나 이상이 있어야 항목 표 헤더로 본다
  const hasCompanion = ['title', 'spec', 'group', 'unit_price', 'qty'].some((r) => kinds.has(r as ColRole))
  if (!hasCompanion) return null
  return { roles, amountCol, englishAmount }
}

function colsOf(map: ColumnMap, role: ColRole): number[] {
  const out: number[] = []
  for (const [c, r] of map.roles) if (r === role) out.push(c)
  return out.sort((a, b) => a - b)
}

function firstCol(map: ColumnMap, role: ColRole): number {
  const cols = colsOf(map, role)
  return cols.length ? cols[0] : -1
}

function detectFormat(map: ColumnMap): 'A' | 'B' | 'C' {
  const hasUnit = firstCol(map, 'unit_price') >= 0
  const hasQty = firstCol(map, 'qty') >= 0
  const hasDays = firstCol(map, 'days') >= 0
  const hasSelect = firstCol(map, 'select') >= 0
  if (!hasUnit || !hasQty) return 'B'
  if (hasDays) return 'A'
  if (hasSelect || map.englishAmount) return 'C'
  return 'A'
}

// ── 행 종류 ────────────────────────────────────────────────────────────
const SUBTOTAL_KEYS = ['소계', 'subtotal', 'total', '합계', '계']
const NOTE_PREFIX = /^[※*＊·]/

function isSubtotalRow(row: Row): boolean {
  const first = firstFilled(row)
  if (!first) return false
  const key = norm(first[1])
  return SUBTOTAL_KEYS.some((k) => key === k || key === `${k}:` || key.startsWith(`${k}(`))
}

/** "N. 이름" · "  5-1. 선택 옵션" → {number, name} */
function sectionTitleOf(row: Row): { number: string; name: string } | null {
  const first = firstFilled(row)
  if (!first) return null
  const raw = first[1]
  const m = /^(\d+(?:[-.]\d+)*)\s*[.．。]\s*(\S.*)$/.exec(raw)
  if (!m) return null
  return { number: m[1], name: raw }
}

const TOTALS_LABEL_KEYS = ['합계', '총계', '총액', '부가세', 'vat', '절사', '대행료', '기획료', '견적']

function looksLikeTotalsRow(row: Row): boolean {
  const first = firstFilled(row)
  if (!first) return false
  const key = norm(first[1])
  return TOTALS_LABEL_KEYS.some((k) => key.includes(k))
}

// ── 헤더 필드 사전 (§22.2-1) ───────────────────────────────────────────
const HEADER_FIELDS: { field: keyof ParsedQuoteHeader; keys: string[] }[] = [
  { field: 'event_name', keys: ['행사명', 'projecttitle', '프로젝트명', '행사제목', 'eventname', '사업명'] },
  { field: 'client', keys: ['고객명', '고객사', '발주처', '수신처', 'client', 'customer'] },
  { field: 'date_range', keys: ['일시', '행사기간', '기간', '행사일', 'eventdate'] },
  { field: 'venue', keys: ['장소', 'venue', '행사장', '개최장소'] },
  { field: 'quoted_at', keys: ['견적일시', '견적일', '견적일자', '제안일자', '작성일', 'quotedate'] },
  { field: 'manager', keys: ['담당자', 'manager', '담당'] },
]

const TOTAL_LABEL_KEYS = ['견적금액', '총견적', '최종견적', '총금액', '견적총액', 'grandtotal', 'totalamount']

/** 라벨 셀 오른쪽의 첫 비어 있지 않은 값 */
function valueRightOf(row: Row, labelCol: number): CellValue {
  for (let c = labelCol + 1; c < row.length; c++) {
    if (text(row[c]) !== '') return row[c]
  }
  return null
}

// ── 본체 ───────────────────────────────────────────────────────────────
interface BodyLayout {
  map: ColumnMap
  headerRowIndex: number
  bodyStart: number
  format: 'A' | 'B' | 'C'
}

function findBody(rows: Row[]): BodyLayout | null {
  for (let r = 0; r < rows.length; r++) {
    const map = classifyHeaderRow(rows[r] ?? [])
    if (!map) continue
    // 섹션 제목 행이 헤더 행 바로 위에 오는 서식(B형)이 있어 위로 되짚는다.
    let start = r
    for (let k = r - 1; k >= 0; k--) {
      const row = rows[k] ?? []
      if (isEmptyRow(row)) continue
      if (looksLikeTotalsRow(row)) break
      if (sectionTitleOf(row)) {
        start = k
        continue
      }
      break
    }
    return { map, headerRowIndex: r, bodyStart: start, format: detectFormat(map) }
  }
  return null
}

interface ParsedBody {
  sections: ParsedQuoteSection[]
  /** 섹션 합계 검산에서 제외한 "(총액 미포함)" 항목 수 */
  excludedItems: number
  /** 단가×수량×일수 검산 대상/일치 건수 */
  unitChecked: number
  unitMatched: number
  unitMismatchTitles: string[]
}

const EXCLUDE_HINT = /총액\s*미포함|합계\s*미포함|미포함|별도\s*견적|not\s*included/i

function parseBody(rows: Row[], layout: BodyLayout): ParsedBody {
  let map = layout.map
  const sections: ParsedQuoteSection[] = []
  let current: ParsedQuoteSection | null = null
  let excludedItems = 0
  let unitChecked = 0
  let unitMatched = 0
  const unitMismatchTitles: string[] = []
  const pendingSubtotal = new Map<ParsedQuoteSection, number>()

  const ensureSection = (): ParsedQuoteSection => {
    if (!current) {
      current = { name: '전체', order: 1, items: [] }
      sections.push(current)
    }
    return current
  }

  for (let r = layout.bodyStart; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (isEmptyRow(row)) continue

    // ① 반복되는 열 헤더 행(B형은 섹션마다 다시 나온다) — 역할만 갱신
    const asHeader = classifyHeaderRow(row)
    if (asHeader) {
      map = asHeader
      continue
    }

    const amount = num(row[map.amountCol])
    const first = firstFilled(row)
    const label = first ? first[1] : ''

    // ② 섹션 제목
    const title = sectionTitleOf(row)
    if (title) {
      current = { name: title.name, order: sections.length + 1, items: [] }
      sections.push(current)
      if (amount !== null) pendingSubtotal.set(current, amount) // 제목 행에 섹션 합계가 오는 서식(B형)
      continue
    }

    // ③ 소계·total 행
    if (isSubtotalRow(row)) {
      const section = ensureSection()
      if (amount !== null) section.subtotal = amount
      continue
    }

    // ④ ※ 안내 문구 행
    if (NOTE_PREFIX.test(label)) continue

    // ⑤ 항목 행 — 금액 열에 숫자가 있어야 한다
    if (amount === null) continue

    const section = ensureSection()
    const titleCol = firstCol(map, 'title')
    const groupCol = firstCol(map, 'group')
    const noteCol = firstCol(map, 'note')
    const itemTitle =
      (titleCol >= 0 ? text(row[titleCol]) : '') || (groupCol >= 0 ? text(row[groupCol]) : '') || label || '(무제)'
    const spec = colsOf(map, 'spec')
      .map((c) => text(row[c]))
      .filter(Boolean)
      .join(' / ')
    const note = noteCol >= 0 ? text(row[noteCol]) : ''
    const unitPrice = num(row[firstCol(map, 'unit_price')] ?? null)
    const qty = num(row[firstCol(map, 'qty')] ?? null)
    const days = num(row[firstCol(map, 'days')] ?? null)

    // C형 SELECT 열의 미선택 표기 — 항목으로는 담되 합계 검산에서는 빠진다(§22.1 C형 O/X)
    const selectCol = firstCol(map, 'select')
    const selectRaw = selectCol >= 0 ? norm(row[selectCol]) : ''
    const unselected = selectRaw !== '' && ['x', '-', '미선택', 'no', 'false', 'n'].includes(selectRaw)
    const fullNote = unselected ? [note, '(미선택 — 총액 미포함)'].filter(Boolean).join(' ') : note

    const item: ParsedQuoteItem = { title: itemTitle, amount }
    if (spec) item.spec = spec
    if (unitPrice !== null) item.unit_price = unitPrice
    if (qty !== null) item.qty = qty
    if (days !== null) item.days = days
    if (fullNote) item.note = fullNote
    section.items.push(item)

    // 단가×수량(×일수) 역확인 (§22.2-3)
    if (unitPrice !== null && qty !== null) {
      unitChecked++
      const expected = unitPrice * qty * (days ?? 1)
      if (near(expected, amount)) unitMatched++
      else unitMismatchTitles.push(itemTitle)
    }
    // "(총액 미포함)"·미선택 옵션 행은 섹션 합계 검산에서 뺀다
    if (EXCLUDE_HINT.test(fullNote) || EXCLUDE_HINT.test(itemTitle)) excludedItems++
  }

  for (const section of sections) {
    if (section.subtotal === undefined) {
      const pending = pendingSubtotal.get(section)
      if (pending !== undefined) section.subtotal = pending
    }
  }
  return { sections, excludedItems, unitChecked, unitMatched, unitMismatchTitles }
}

/** 섹션 소계 검산용 항목 합 — "(총액 미포함)" 표기 항목은 제외 */
function sectionItemsSum(section: ParsedQuoteSection): number {
  return section.items.reduce((sum, item) => {
    const flagged = EXCLUDE_HINT.test(item.note ?? '') || EXCLUDE_HINT.test(item.title)
    return flagged ? sum : sum + item.amount
  }, 0)
}

// ── 총액 블록 ──────────────────────────────────────────────────────────
interface TotalsBlock {
  items_sum?: number
  agency_fee?: number
  agency_fee_rate?: number
  rounding?: number
  vat?: number
  /** "3. 총계 (1+2)" 같은 부가세 전 합계 */
  pre_vat_total?: number
  /** "총 견적"·"최종 견적" 등 대표 금액(포함/별도는 이후 판정) */
  headline?: number
  headlineRow?: number
  /** "총 금액 (부가세 포함)"처럼 라벨이 포함을 명시한 총액 */
  vat_included_total?: number
}

/** 라벨과 비고에서 % 후보를 모두 긁는다 (예: "기획 인건비 15% + 기업이윤 10%" → 15·10·25) */
function rateCandidates(...texts: string[]): number[] {
  const out: number[] = []
  for (const t of texts) {
    const found = t.match(/(\d+(?:\.\d+)?)\s*%/g)
    if (!found) continue
    const values = found.map((f) => Number(f.replace(/[^0-9.]/g, '')))
    for (const v of values) if (Number.isFinite(v)) out.push(v / 100)
    if (values.length > 1) {
      const sum = values.reduce((a, b) => a + b, 0)
      if (Number.isFinite(sum)) out.push(sum / 100)
    }
  }
  return out
}

function parseTotalsBlock(rows: Row[], bodyStart: number): TotalsBlock {
  const block: TotalsBlock = {}
  for (let r = 0; r < bodyStart; r++) {
    const row = rows[r] ?? []
    const first = firstFilled(row)
    if (!first) continue
    const [labelCol, labelRaw] = first
    const key = norm(labelRaw)
    // 라벨 오른쪽의 첫 숫자 셀
    let amount: number | null = null
    for (let c = labelCol + 1; c < row.length; c++) {
      const n = num(row[c])
      if (n !== null) {
        amount = n
        break
      }
    }
    const line = rowText(row)

    // 같은 이름의 라벨이 여러 번 나오면 **처음 것이 이긴다**(하단 안내 문구가 값을 덮지 않도록)
    if (/항목합계|항목합|직접비합계|소계합계/.test(key)) {
      if (amount !== null && block.items_sum === undefined) block.items_sum = amount
      continue
    }
    if (/대행료|기획료|pco/.test(key)) {
      if (amount !== null && block.agency_fee === undefined) {
        block.agency_fee = amount
        const rates = rateCandidates(labelRaw, line)
        if (rates.length) block.agency_fee_rate = rates[0]
      }
      continue
    }
    if (/절사|절삭|단수/.test(key)) {
      if (amount !== null && block.rounding === undefined) block.rounding = amount
      continue
    }
    if (/부가세|vat|세액/.test(key)) {
      // "총 금액 (부가세 포함)"·"Grand Total (VAT included)"은 총액이지 세액이 아니다
      if (/총금액|총액|합계|총계|total/.test(key)) {
        if (amount !== null && block.vat_included_total === undefined) block.vat_included_total = amount
      } else if (amount !== null && block.vat === undefined) {
        block.vat = amount
      }
      continue
    }
    if (/총계/.test(key)) {
      if (amount !== null && block.pre_vat_total === undefined) block.pre_vat_total = amount
      continue
    }
    if (TOTAL_LABEL_KEYS.some((k) => key.includes(k))) {
      const value = amount ?? amountInText(text(valueRightOf(row, labelCol)))
      if (value !== null && block.headline === undefined) {
        block.headline = value
        block.headlineRow = r
      }
      continue
    }
  }
  return block
}

function detectVatMode(
  rows: Row[],
  bodyStart: number,
  block: TotalsBlock,
  preVatBase: number | null,
): 'included' | 'excluded' | 'unknown' {
  const phraseOf = (s: string): 'included' | 'excluded' | null => {
    if (/(부가세|vat)[^가-힣a-z]*(별도|미포함)/i.test(s) || /(별도|미포함)[^가-힣a-z]*(부가세|vat)/i.test(s)) {
      return 'excluded'
    }
    if (/(부가세|vat)[^가-힣a-z]*포함/i.test(s) || /포함[^가-힣a-z]*(부가세|vat)/i.test(s)) return 'included'
    return null
  }
  // ① 대표 금액이 인쇄된 행의 문구가 1순위
  if (block.headlineRow !== undefined) {
    const own = phraseOf(rowText(rows[block.headlineRow] ?? []))
    if (own) return own
  }
  // ② 산술로 판정 — 대표 금액이 (공급가+부가세)인지 공급가인지
  if (block.headline !== undefined && block.vat !== undefined && preVatBase !== null) {
    if (near(block.headline, preVatBase + block.vat, 2)) return 'included'
    if (near(block.headline, preVatBase, 2)) return 'excluded'
  }
  // ③ 문서 상단 전체 문구
  for (let r = 0; r < bodyStart; r++) {
    const found = phraseOf(rowText(rows[r] ?? []))
    if (found) return found
  }
  return 'unknown'
}

/** 기획료 산정 기준(직접비) — 기획료 섹션·베뉴(s1)·옵션/식음/모객 섹션을 뺀 합 */
const FEE_BASE_EXCLUDE = /옵션|식음|케이터링|모객|f&b|선택/i
const VENUE_HINT = /베뉴|대관|장소|venue/i
const FEE_HINT = /대행료|기획료|pco/i

function feeBaseOf(sections: ParsedQuoteSection[]): number {
  return sections.reduce((sum, s) => {
    if (FEE_HINT.test(s.name) || VENUE_HINT.test(s.name) || FEE_BASE_EXCLUDE.test(s.name)) return sum
    return sum + (s.subtotal ?? sectionItemsSum(s))
  }, 0)
}

function truncateTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit
}

// ── 진입점 ─────────────────────────────────────────────────────────────
function pickSheet(sheets: SheetGrid[]): { sheet: SheetGrid; layout: BodyLayout | null } {
  for (const sheet of sheets) {
    const layout = findBody(sheet.rows)
    if (layout) return { sheet, layout }
  }
  return { sheet: sheets[0], layout: null }
}

export function parseQuoteWorkbook(data: ArrayBuffer, fileName: string): ParsedQuoteDoc {
  let sheets: SheetGrid[]
  try {
    sheets = readXlsxSheets(data)
  } catch (err) {
    const reason = err instanceof Error ? err.message : '알 수 없는 오류'
    throw new ProviderError('validation', `견적서(xlsx)를 읽지 못했습니다 — ${reason} (${fileName})`)
  }

  const warnings: string[] = []
  const { sheet, layout } = pickSheet(sheets)
  if (!layout) {
    throw new ProviderError(
      'validation',
      '항목 표(금액 열)를 찾지 못했습니다 — 지원 서식(A·B·C형)의 열 제목이 있는지 확인해 주세요.',
    )
  }
  if (sheets.length > 1) warnings.push(`시트 ${sheets.length}개 중 '${sheet.name}' 시트를 읽었습니다.`)

  const rows = sheet.rows
  const body = parseBody(rows, layout)
  const sections = body.sections
  if (sections.length === 0) {
    throw new ProviderError('validation', '항목 행을 한 건도 찾지 못했습니다 — 파일을 확인해 주세요.')
  }
  if (sections.length === 1 && sections[0].name === '전체') {
    warnings.push('"N. 제목" 형식의 섹션 구분이 없어 전체를 1섹션으로 처리했습니다.')
  }

  // ── 헤더 필드 (§22.2-1: 실패 필드는 비워 둔다) ──
  const header: ParsedQuoteHeader = {}
  for (let r = 0; r < layout.bodyStart; r++) {
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const key = norm(row[c])
      if (!key) continue
      const hit = HEADER_FIELDS.find((f) => f.keys.some((k) => key === k || key.startsWith(k)))
      if (!hit || header[hit.field] !== undefined) continue
      const value = text(valueRightOf(row, c))
      if (value) (header as Record<string, unknown>)[hit.field] = value
    }
  }

  // ── 총액 블록 + 섹션 합 ──
  const block = parseTotalsBlock(rows, layout.bodyStart)
  const sectionSum = sections.reduce((sum, s) => sum + (s.subtotal ?? sectionItemsSum(s)), 0)
  const itemsSum = block.items_sum ?? sectionSum

  // 기획료가 섹션 안에 들어 있는 서식(B·C형)은 총액 체인에서 다시 더하지 않는다
  const feeSection = sections.find((s) => FEE_HINT.test(s.name))
  const feeInsideItems = block.agency_fee === undefined && feeSection !== undefined
  const agencyFee = block.agency_fee ?? (feeSection ? feeSection.subtotal ?? sectionItemsSum(feeSection) : undefined)

  let agencyFeeRate = block.agency_fee_rate
  if (feeInsideItems && feeSection) {
    // "6. PCO 기획료  (직접비의 25%)" — 제목 행 옆 문구에서 율을 읽는다
    const titleRow = rows.findIndex((row) => {
      const t = sectionTitleOf(row ?? [])
      return t?.name === feeSection.name
    })
    const rates = titleRow >= 0 ? rateCandidates(rowText(rows[titleRow] ?? [])) : []
    if (rates.length) agencyFeeRate = rates[0]
  }
  // 실제 비율로 후보를 되짚어 고른다(라벨에 "인건비 15% + 이윤 10%"처럼 나눠 적힌 A형 대응)
  const feeBase = feeInsideItems ? feeBaseOf(sections) : itemsSum
  if (agencyFee !== undefined && feeBase > 0) {
    const implied = agencyFee / feeBase
    const candidates = rateCandidates(...rows.slice(0, layout.bodyStart).map((row) => rowText(row ?? [])))
    const pool = [...(agencyFeeRate !== undefined ? [agencyFeeRate] : []), ...candidates]
    let best: number | undefined
    let bestDiff = Number.POSITIVE_INFINITY
    for (const rate of pool) {
      const diff = Math.abs(rate - implied)
      if (diff < bestDiff) {
        best = rate
        bestDiff = diff
      }
    }
    if (best !== undefined && bestDiff <= 0.02) agencyFeeRate = best
  }

  const rounding = block.rounding
  const preVatBase =
    (block.pre_vat_total !== undefined
      ? block.pre_vat_total
      : itemsSum + (feeInsideItems ? 0 : agencyFee ?? 0)) + (rounding ?? 0)

  const vatMode = detectVatMode(rows, layout.bodyStart, block, preVatBase)
  let vat = block.vat
  if (vat === undefined) {
    if (block.vat_included_total !== undefined) vat = block.vat_included_total - preVatBase
    else if (vatMode === 'included' && block.headline !== undefined) vat = block.headline - preVatBase
  }
  const grandTotal =
    block.vat_included_total ??
    (vatMode === 'included' && block.headline !== undefined
      ? block.headline
      : vat !== undefined
        ? preVatBase + vat
        : block.headline)

  const totals: ParsedQuoteTotals = {}
  if (Number.isFinite(itemsSum)) totals.items_sum = itemsSum
  if (agencyFee !== undefined) totals.agency_fee = agencyFee
  if (agencyFeeRate !== undefined) totals.agency_fee_rate = agencyFeeRate
  if (rounding !== undefined) totals.rounding = rounding
  if (vat !== undefined) totals.vat = vat
  if (grandTotal !== undefined) totals.grand_total = grandTotal

  header.total_amount = block.headline ?? grandTotal
  header.vat_mode = vatMode

  // ── 검산 (§22.2-5: 기록만 하고 막지 않는다) ──
  const checks: ParsedQuoteCheck[] = []
  for (const section of sections) {
    if (section.subtotal === undefined) continue
    const actual = sectionItemsSum(section)
    const ok = near(section.subtotal, actual)
    checks.push({ name: `섹션 소계 — ${section.name}`, expected: section.subtotal, actual, ok })
    if (!ok) {
      warnings.push(
        `'${section.name}' 소계(${section.subtotal.toLocaleString('ko-KR')})와 항목 합(${actual.toLocaleString('ko-KR')})이 다릅니다.`,
      )
    }
  }
  checks.push({ name: '항목 합계 = Σ 섹션 소계', expected: itemsSum, actual: sectionSum, ok: near(itemsSum, sectionSum) })
  if (agencyFee !== undefined && agencyFeeRate !== undefined && feeBase > 0) {
    const expected = truncateTo(feeBase * agencyFeeRate, 10_000)
    const percent = agencyFeeRate * 100
    checks.push({
      name: `${feeInsideItems ? '기획료' : '대행료'} ${percent.toFixed(Number.isInteger(percent) ? 0 : 1)}% (만원 절사 기준)`,
      expected,
      actual: agencyFee,
      ok: Math.abs(agencyFee - expected) < 10_000,
    })
  }
  if (vat !== undefined) {
    const expected = Math.round(preVatBase * 0.1)
    checks.push({ name: '부가세 10%', expected, actual: vat, ok: near(expected, vat, 2) })
  }
  if (grandTotal !== undefined) {
    const chain = preVatBase + (vat ?? 0)
    checks.push({ name: '총액 체인 (항목합+대행료+절사+부가세)', expected: grandTotal, actual: chain, ok: near(grandTotal, chain, 2) })
    if (!near(grandTotal, chain, 2)) {
      warnings.push(
        `문서 총액(${grandTotal.toLocaleString('ko-KR')})과 산출 합(${chain.toLocaleString('ko-KR')})의 차이가 ${Math.abs(grandTotal - chain).toLocaleString('ko-KR')}원입니다.`,
      )
    }
  }
  if (body.unitChecked > 0) {
    checks.push({
      name: '항목 단가×수량×일수 = 금액',
      expected: body.unitChecked,
      actual: body.unitMatched,
      ok: body.unitChecked === body.unitMatched,
    })
    if (body.unitMismatchTitles.length) {
      warnings.push(`단가×수량과 금액이 다른 행 ${body.unitMismatchTitles.length}건: ${body.unitMismatchTitles.slice(0, 3).join(', ')}`)
    }
  }
  if (body.excludedItems > 0) {
    warnings.push(`'총액 미포함' 표기 항목 ${body.excludedItems}건은 섹션 합계 검산에서 제외했습니다.`)
  }
  const missing = HEADER_FIELDS.filter((f) => header[f.field] === undefined).map((f) => f.keys[0])
  if (missing.length) warnings.push(`인식하지 못한 헤더 항목: ${missing.join(', ')} — 확인 큐에서 입력하세요.`)

  return { format: layout.format, header, sections, totals, checks, warnings }
}

export { mapSectionsToBuckets, QUOTE_IMPORT_BUCKETS, bucketLabel } from './buckets'
