// 견적서 임포트 파서 (설계서 v2.4 §22.2 정본) — xlsx 바이너리 → ParsedQuoteDoc.
//
// 규칙 요약(§22.2):
//  0) (v2.18) 라벨 사전은 **국문·영문 둘 다** — 해외 인바운드 행사의 영문 견적서(Subtotal · VAT · Grand Total · Qty · Unit Price ·
//     Amount · Event/Client/Venue/Quote Date …)도 같은 규칙으로 읽는다. 영문 키는 단어 단위(정확히 일치하거나 뒤에 글자가 아닌 것이
//     올 때만)로 맞춘다 — 'event'가 'eventdate'를 삼키지 않게. 통화 표기가 원화가 아니면 header.currency에 적고 경고만 남긴다(환산 없음).
//  1) 헤더는 라벨 사전 매칭. 실패 필드는 빈 값으로 두고 확인 큐가 사람에게 넘긴다(추정 금지).
//  2) 서식은 항목 표 헤더 행의 열 라벨로 판별한다 — A형(단가·수량·일수) / B형(금액 단식) / C형(UNIT PRICE·QTY·AMOUNT·SELECT) /
//     (v2.22.1) P형(예산 워크북 — '기준안' 열이 금액, '구분' 열의 A~J가 섹션).
//  3) 섹션은 "N." 숫자 프리픽스 제목 행(5-1 같은 소수 번호·선행 공백·(v2.22.1) 앞의 `[발주 구분]` 태그 허용) + 소계/total 행.
//     P형은 구분 코드(A~J)가 바뀔 때 섹션이 시작되고 'A. 베뉴 소계' 줄이 이름을 준다.
//  4) 항목 행은 금액 열에 숫자가 있는 행. A형은 단가×수량×일수=금액으로 열 역할을 역확인한다(미선택 X 행은 검산에서 뺀다).
//  5) 합계 체계(항목합·대행료/기획료·절사·부가세·총액)는 표 위 "총액 블록"에서 읽고, 없으면 섹션 합으로 파생한다.
//     (v2.22.1) 대표 총액 줄이 둘이면(선택 항목 제외/포함) **본문 합과 맞는 줄**을 고른다 — 없으면 '포함' 줄, 그다음 첫 줄.
//  6) 모든 검산은 checks[]에 기록만 한다 — **불일치가 진행을 막지 않는다**(확인 큐에서 사람이 판단).
//
// 계약상 이 함수는 **동기**다(MockProvider.importQuoteFile이 동기로 호출한다) —
// 그래서 xlsx 해제는 exceljs가 아니라 동기 리더(./xlsxReader)를 쓴다. 자세한 이유는 inflate.ts 머리말.
//
// 총액 규약(구현 결정, 아래 계약을 문서화해 둔다):
//  · `totals.grand_total` = **부가세 포함** 총액. 문서가 별도 기준 총액만 인쇄했으면 vat를 더해 채운다.
//    (MockProvider.buildImportedBreakdown이 grand_total − vat를 공급가로 쓰기 때문에 여기서 기준을 맞춘다.)
//    P형(예산)은 부가세 줄이 없어 grand_total·vat를 비워 두고 items_sum만 채운다(확정은 items_sum을 공급가로 쓴다).
//  · `header.total_amount` = 문서에 **인쇄된 대표 금액 그대로** + `header.vat_mode`가 포함/별도를 알려준다.
import { ProviderError } from '../../../lib/errors'
import type {
  ParsedQuoteCheck,
  ParsedQuoteDoc,
  ParsedQuoteHeader,
  ParsedQuoteItem,
  ParsedQuoteSection,
  ParsedQuoteTotals,
  ParsedRevenueRow,
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

/** 라벨 비교용 정규화 — 공백 제거·소문자·장식문자 정리("행 사 명" = "행사명" · (v2.22.1) "V.A.T" = "vat") */
function norm(v: CellValue): string {
  return text(v)
    .replace(/\s+/g, '')
    .replace(/[：:]/g, '')
    .toLowerCase()
    .replace(/v\.a\.t\.?/g, 'vat')
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
type ColRole = 'group' | 'title' | 'spec' | 'unit_price' | 'qty' | 'days' | 'amount' | 'note' | 'select' | 'budget'

const COL_PATTERNS: { role: ColRole; keys: string[] }[] = [
  // v2.22.1 — 국문 '선택' 열(O/X · 실사용 리멤버 견적서 변형)도 선택 열이다
  { role: 'select', keys: ['select', '선택여부', '선택'] },
  // v2.22.1 — 예산 워크북(P형): '기준안'이 금액 열이다(절감안·상한안은 무시)
  { role: 'budget', keys: ['기준안', '예산액', '편성액', '예산금액', 'budget'] },
  { role: 'unit_price', keys: ['단가', 'unitprice', 'unit_price', 'price', 'rate'] },
  { role: 'qty', keys: ['수량', 'qty', "q'ty", 'quantity'] },
  { role: 'days', keys: ['일수', 'days', 'day', 'duration'] },
  { role: 'amount', keys: ['금액', 'amount', '합계금액', 'linetotal', 'total'] },
  { role: 'note', keys: ['비고', 'remarks', 'remark', 'note', 'comment'] },
  { role: 'group', keys: ['구분', '분류', 'category', 'section'] },
  { role: 'title', keys: ['항목', 'item', '품목', '내역', 'particulars', 'service', 'product'] },
  { role: 'spec', keys: ['규격', '사양', 'description', 'spec', 'size', '내용', 'details', 'detail'] },
]

interface ColumnMap {
  roles: Map<number, ColRole>
  amountCol: number
  /** 헤더 라벨이 영문 계열이면 C형 후보 */
  englishAmount: boolean
  /** v2.22.1 — 금액 열이 없고 '기준안' 같은 예산 열이 금액 자리(P형) */
  budget: boolean
}

function classifyHeaderRow(row: Row): ColumnMap | null {
  const roles = new Map<number, ColRole>()
  let amountCol = -1
  let budgetCol = -1
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
      englishAmount = /amount|total/.test(key)
    }
    if (hit.role === 'budget') {
      if (budgetCol >= 0) continue // 첫 예산 열(기준안)만
      budgetCol = c
    }
    roles.set(c, hit.role)
  }
  let budget = false
  if (amountCol < 0 && budgetCol >= 0) {
    amountCol = budgetCol
    budget = true
  }
  if (amountCol < 0) return null
  const kinds = new Set(roles.values())
  // 금액 + (항목·규격·구분·단가) 중 하나 이상이 있어야 항목 표 헤더로 본다
  const hasCompanion = ['title', 'spec', 'group', 'unit_price', 'qty'].some((r) => kinds.has(r as ColRole))
  if (!hasCompanion) return null
  return { roles, amountCol, englishAmount, budget }
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

type BodyFormat = 'A' | 'B' | 'C' | 'P'

function detectFormat(map: ColumnMap): BodyFormat {
  if (map.budget) return 'P'
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
const SUBTOTAL_KEYS = ['소계', 'subtotal', 'sub-total', 'sectiontotal', 'total', '합계', '계']
// v2.20.2 — 안내 줄: ※·*·⚠️(리멤버 견적서 '⚠️ 호텔 비용은 …')·! 로 시작하는 줄은 항목·제목이 아니다
// v2.22.1 — ✅·▼·▶·☑·✔ 안내 줄(실사용 '✅ 오른쪽 선택 칸에 O=포함 / X=제외' · '▼ 선택 옵션 (O/X)')도 같다
const NOTE_PREFIX = /^[※*＊·⚠!！✅▼▶☑✔]/

function isSubtotalRow(row: Row): boolean {
  const first = firstFilled(row)
  if (!first) return false
  const key = norm(first[1])
  return SUBTOTAL_KEYS.some((k) => key === k || key === `${k}:` || key.startsWith(`${k}(`))
}

/** "N. 이름" · "  5-1. 선택 옵션" · (v2.22.1) "[총괄사] 1. 행사장 사용료" → {number, name(원문 그대로 — 태그 포함)} */
function sectionTitleOf(row: Row): { number: string; name: string } | null {
  const first = firstFilled(row)
  if (!first) return null
  const raw = first[1]
  const m = /^(?:\[[^\]]*\]\s*)?(\d+(?:[-.]\d+)*)\s*[.．。]\s*(\S.*)$/.exec(raw)
  if (!m) return null
  return { number: m[1], name: raw }
}

/**
 * v2.22.1 P형 — 'A. 베뉴 소계' · 'H. 모객·리드젠 (계약 이행) 소계' → {code:'A', name:'베뉴'}. '직접비 소계 (A~I)'처럼
 * 구분 코드가 없는 소계 줄은 {code: undefined}(섹션 이름을 주지 않고 건너뛴다)
 */
function budgetSubtotalOf(label: string): { code?: string; name: string } | null {
  const m = /^(?:([A-Za-z]|\d{1,2})[.)]\s*)?(.*?)\s*소계\s*(?:\(.*\))?$/.exec(label.trim())
  if (!m) return null
  return { code: m[1] ? m[1].toUpperCase() : undefined, name: m[2].trim() }
}

/** P형 구분 코드 — 한 글자(A~J) 또는 두 자리 이내 숫자만 섹션 코드로 본다(요약표의 긴 구분 라벨은 코드가 아니다) */
function budgetCodeOf(raw: string): string | null {
  const t = raw.trim()
  return /^([A-Za-z]|\d{1,2})$/.test(t) ? t.toUpperCase() : null
}

const TOTALS_LABEL_KEYS = [
  '합계', '총계', '총액', '부가세', 'vat', '절사', '대행료', '기획료', '견적', '사업비',
  // v2.18 영문 — 총액 블록 라벨
  'total', 'subtotal', 'tax', 'fee', 'rounding', 'discount', 'quotation', 'estimate',
]

function looksLikeTotalsRow(row: Row): boolean {
  const first = firstFilled(row)
  if (!first) return false
  const key = norm(first[1])
  return TOTALS_LABEL_KEYS.some((k) => key.includes(k))
}

// ── 헤더 필드 사전 (§22.2-1) ───────────────────────────────────────────
const HEADER_FIELDS: { field: keyof ParsedQuoteHeader; keys: string[] }[] = [
  {
    field: 'event_name',
    keys: ['행사명', 'projecttitle', '프로젝트명', '행사제목', 'eventname', '사업명',
      'event', 'eventtitle', 'project', 'projectname', 'subject', 'title'],
  },
  { field: 'client', keys: ['고객명', '고객사', '발주처', '수신처', 'client', 'customer', 'clientname', 'to', 'attn', 'attention', 'billto'] },
  { field: 'date_range', keys: ['일시', '행사기간', '기간', '행사일', 'eventdate', 'eventdates', 'dates', 'period', 'schedule', 'eventperiod'] },
  { field: 'venue', keys: ['장소', '베뉴', 'venue', '행사장', '개최장소', 'location', 'place'] }, // v2.20.2 — 리멤버 견적서 라벨 '베뉴'
  {
    field: 'quoted_at',
    // v2.20.2 — 영문 'Date' 한 단어는 견적일(리멤버 영문 견적서 'Date' · 제안일자). 행사일은 'Event Date'·'Period'
    keys: ['견적일시', '견적일', '견적일자', '제안일자', '작성일', 'quotedate', 'quotationdate', 'dateofquote', 'issuedate', 'dateissued', 'issued', 'date'],
  },
  { field: 'manager', keys: ['담당자', 'manager', '담당', 'contact', 'contactperson', 'preparedby', 'pic', 'incharge'] },
]

/** 헤더 라벨 매칭 — 국문은 앞부분 일치(‘담당자명’), 영문은 단어 단위(‘event’가 ‘eventdate’를 삼키지 않게) */
function headerKeyMatches(key: string, k: string): boolean {
  if (key === k) return true
  if (!key.startsWith(k)) return false
  if (/^[a-z]/.test(k)) return !/[a-z]/.test(key[k.length] ?? '')
  return true
}

const TOTAL_LABEL_KEYS = [
  '견적금액', '총견적', '최종견적', '총금액', '견적총액', '총사업비', 'grandtotal', 'totalamount',
  // v2.18 영문 — 'total' 한 단어는 총계(부가세 전)로 따로 본다(아래 parseTotalsBlock)
  'totalquotation', 'quotationtotal', 'totalestimate', 'estimatetotal', 'totalprice', 'totalcost', 'nettotal', 'amountdue', 'totaldue',
]

// ── 통화 표기 (v2.18) — 원화가 아닐 때만 header.currency + 경고. 환산하지 않는다 ──
const FOREIGN_CURRENCY: { code: string; pattern: RegExp }[] = [
  { code: 'USD', pattern: /\bUSD\b|US\$|U\.S\.\s*dollars?/i },
  { code: 'EUR', pattern: /\bEUR\b|€|\beuros?\b/i },
  { code: 'JPY', pattern: /\bJPY\b|¥|\byen\b/i },
  { code: 'GBP', pattern: /\bGBP\b|£|\bpounds?\s*sterling\b/i },
  { code: 'SGD', pattern: /\bSGD\b|S\$/ },
  { code: 'HKD', pattern: /\bHKD\b|HK\$/ },
  { code: 'AUD', pattern: /\bAUD\b|A\$/ },
  { code: 'CNY', pattern: /\bCNY\b|\bRMB\b/ },
  { code: 'USD', pattern: /\$/ },
]
const KRW_PATTERN = /₩|￦|\bKRW\b|원/

function detectCurrency(rows: Row[]): string | undefined {
  const all = rows.map((row) => rowText(row ?? [])).join('\n')
  if (KRW_PATTERN.test(all)) return undefined // 원화 표기가 있으면 원화 문서로 본다(혼재는 사람 몫)
  for (const c of FOREIGN_CURRENCY) if (c.pattern.test(all)) return c.code
  return undefined
}

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
  format: BodyFormat
}

function findBody(rows: Row[]): BodyLayout | null {
  for (let r = 0; r < rows.length; r++) {
    const map = classifyHeaderRow(rows[r] ?? [])
    if (!map) continue
    // 섹션 제목 행이 헤더 행 바로 위에 오는 서식(B형·리멤버 견적서)이 있어 위로 되짚는다.
    // 제목과 열 헤더 사이의 안내 줄(⚠️·※ — 리멤버 견적서 베뉴 섹션)은 건너뛴다(v2.20.2 실사용: 첫 섹션 제목을 잃어 '전체'가 됐다)
    let start = r
    for (let k = r - 1; k >= 0; k--) {
      const row = rows[k] ?? []
      if (isEmptyRow(row)) continue
      const first = firstFilled(row)
      if (first && NOTE_PREFIX.test(first[1])) continue
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

// 분명한 제외 표기 — 조건부 문구가 옆에 있어도 제외다("선택 시 추가 (총액 미포함)")
const EXCLUDE_STRONG = /총액\s*미포함|합계\s*미포함|견적\s*제외|미선택|not\s*included|not\s*incl\.?|excluded\s*from\s*total/i
// 약한 제외 표기 — "호텔 화면 미제공 **시 별도 견적**"처럼 조건부 안내(v2.22.1 실사용: 소계 검산이 어긋났다)면 제외가 아니다
const EXCLUDE_WEAK = /미포함|별도\s*견적|optional/i
const CONDITIONAL_HINT = /(시|경우|때)\s*(별도|추가)|\b(if|when|upon)\b[^,]*\b(extra|additional|separate)/i

function isExcludedText(t: string): boolean {
  if (EXCLUDE_STRONG.test(t)) return true
  return EXCLUDE_WEAK.test(t) && !CONDITIONAL_HINT.test(t)
}

const UNSELECTED_MARKS = ['x', '-', '미선택', 'no', 'false', 'n', '×', '✕', '✗', '제외']

function parseBody(rows: Row[], layout: BodyLayout): ParsedBody {
  let map = layout.map
  const sections: ParsedQuoteSection[] = []
  let current: ParsedQuoteSection | null = null
  let excludedItems = 0
  let unitChecked = 0
  let unitMatched = 0
  const unitMismatchTitles: string[] = []
  const pendingSubtotal = new Map<ParsedQuoteSection, number>()
  const budget = layout.format === 'P'

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

    // ①-P (v2.22.1) 예산 워크북 — 'A. 베뉴 소계' 줄이 섹션 이름·소계. 캐시값 0(계산되지 않은 수식)은 소계로 쓰지 않는다
    if (budget) {
      const sub = budgetSubtotalOf(label)
      if (sub) {
        if (sub.code) {
          const target = sections.find((s) => s.code === sub.code)
          if (target) {
            if (sub.name && target.name === `${sub.code}.`) target.name = `${sub.code}. ${sub.name}`
            if (amount !== null && amount !== 0) target.subtotal = amount
          }
        }
        continue
      }
    }

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

    const titleCol = firstCol(map, 'title')
    const groupCol = firstCol(map, 'group')
    const noteCol = firstCol(map, 'note')

    // ⑤-P (v2.22.1) 예산 워크북 — 구분 코드(A~J)가 바뀌면 새 섹션(이름은 소계 줄이 준다 · 없으면 코드만).
    // 코드 없는 줄은 이어지는 줄로 보되, 금액 0이거나 합계·참고 줄('지출 합계 (VAT 별도)'·'VAT 포함 참고')이면 항목이 아니다
    if (budget && groupCol >= 0) {
      const code = budgetCodeOf(text(row[groupCol]))
      if (!code && (amount === 0 || /합계|총계|참고|total/i.test(label))) continue
      if (code && (!current || current.code !== code)) {
        current = { name: `${code}.`, order: sections.length + 1, items: [], code }
        sections.push(current)
      }
    }

    const section = ensureSection()
    const itemTitle =
      (titleCol >= 0 ? text(row[titleCol]) : '') || (groupCol >= 0 && !budget ? text(row[groupCol]) : '') || label || '(무제)'
    const spec = colsOf(map, 'spec')
      .map((c) => text(row[c]))
      .filter(Boolean)
      .join(' / ')
    const note = noteCol >= 0 ? text(row[noteCol]) : ''
    const unitPrice = num(row[firstCol(map, 'unit_price')] ?? null)
    const qty = num(row[firstCol(map, 'qty')] ?? null)
    const days = num(row[firstCol(map, 'days')] ?? null)

    // C형 SELECT 열·국문 '선택' 열의 미선택 표기 — 항목으로는 담되 합계 검산에서는 빠진다(§22.1 C형 O/X · v2.22.1 R형 변형 O/X 대안 행)
    const selectCol = firstCol(map, 'select')
    const selectRaw = selectCol >= 0 ? norm(row[selectCol]) : ''
    const unselected = selectRaw !== '' && UNSELECTED_MARKS.includes(selectRaw)
    const fullNote = unselected ? [note, '(미선택 — 총액 미포함)'].filter(Boolean).join(' ') : note

    const item: ParsedQuoteItem = { title: itemTitle, amount }
    if (spec) item.spec = spec
    if (unitPrice !== null) item.unit_price = unitPrice
    if (qty !== null) item.qty = qty
    if (days !== null) item.days = days
    if (fullNote) item.note = fullNote
    section.items.push(item)

    // 단가×수량(×일수) 역확인 (§22.2-3) — 단가×수량은 있는데 금액을 0으로 적은 미선택(X) 대안 행은 검산 대상이 아니다
    // (v2.22.1 실사용 후보 베뉴·선택 옵션 · 금액이 적힌 X 행이나 단가도 0인 행은 그대로 검산)
    const zeroedAlternative = unselected && amount === 0 && unitPrice !== null && qty !== null && unitPrice * qty * (days ?? 1) !== 0
    if (unitPrice !== null && qty !== null && !zeroedAlternative) {
      unitChecked++
      const expected = unitPrice * qty * (days ?? 1)
      if (near(expected, amount)) unitMatched++
      else unitMismatchTitles.push(itemTitle)
    }
    // "(총액 미포함)"·미선택 옵션 행은 섹션 합계 검산에서 뺀다
    if (isExcludedText(fullNote) || isExcludedText(itemTitle)) excludedItems++
  }

  for (const section of sections) {
    if (section.subtotal === undefined) {
      const pending = pendingSubtotal.get(section)
      if (pending !== undefined) section.subtotal = pending
    }
    // P형 — 소계 줄이 없어 코드만 남은 섹션은 항목이 하나뿐일 때 그 제목으로 부른다('J. 예비비')
    if (budget && section.code && section.name === `${section.code}.` && section.items.length === 1) {
      section.name = `${section.code}. ${section.items[0].title}`
    }
  }
  return { sections, excludedItems, unitChecked, unitMatched, unitMismatchTitles }
}

/** 섹션 소계 검산용 항목 합 — "(총액 미포함)" 표기 항목은 제외 */
function sectionItemsSum(section: ParsedQuoteSection): number {
  return section.items.reduce((sum, item) => {
    const flagged = isExcludedText(item.note ?? '') || isExcludedText(item.title)
    return flagged ? sum : sum + item.amount
  }, 0)
}

function sectionAmount(section: ParsedQuoteSection): number {
  return section.subtotal ?? sectionItemsSum(section)
}

// ── 총액 블록 ──────────────────────────────────────────────────────────
/**
 * v2.22.1 — 대표 총액 줄 후보. 실사용 견적서는 "기본 견적금액 (선택 항목 제외, VAT별도)"와 "총 견적금액 (선택 항목 포함, VAT별도)"
 * 두 줄을 같이 인쇄한다(순서는 문서마다 다르다). 어느 줄이 본문(항목 표)과 같은 기준인지는 본문 합으로 판정한다.
 */
interface HeadlineCandidate {
  row: number
  value: number
  pre_vat?: number
  vat_included?: number
  /** with = 선택 항목 포함 · without = 선택 항목 제외/기본 · plain = 표기 없음 */
  tag: 'with' | 'without' | 'plain'
}

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
  headlines: HeadlineCandidate[]
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

/**
 * v2.20.2 — 한 행에 라벨이 둘인 서식: 첫 라벨 오른쪽 어딘가에 "VAT 포함"·"부가세 별도" 같은 짧은 라벨 셀이 더 있고
 * 그 오른쪽 숫자가 그 값이다(리멤버 견적서 총액 행). 첫 라벨은 호출자가 처리한다.
 */
function scanSecondaryLabels(row: Row, labelCol: number, target: { pre_vat?: number; vat_included?: number }): void {
  for (let c = labelCol + 1; c < row.length; c++) {
    const key = norm(row[c])
    if (!key || num(row[c]) !== null) continue
    const included = /^(vat|v\.a\.t\.?|부가세)(포함|incl\.?|included|inclusive)$/.test(key)
    const excluded = /^(vat|v\.a\.t\.?|부가세)(별도|미포함|excl\.?|excluded|exclusive)$/.test(key)
    if (!included && !excluded) continue
    let value: number | null = null
    for (let k = c + 1; k < row.length; k++) {
      const n = num(row[k])
      if (n !== null) {
        value = n
        break
      }
    }
    if (value === null) continue
    if (included && target.vat_included === undefined) target.vat_included = value
    if (excluded && target.pre_vat === undefined) target.pre_vat = value
  }
}

function headlineTag(key: string): HeadlineCandidate['tag'] {
  if (!/(선택|옵션|option|add-?on)/.test(key)) return 'plain'
  if (/(제외|excl|기본|base|without)/.test(key)) return 'without'
  if (/(포함|incl|with)/.test(key)) return 'with'
  return 'plain'
}

function parseTotalsBlock(rows: Row[], bodyStart: number): TotalsBlock {
  const block: TotalsBlock = { headlines: [] }
  for (let r = 0; r < bodyStart; r++) {
    const row = rows[r] ?? []
    const first = firstFilled(row)
    if (!first) continue
    const [labelCol, labelRaw] = first
    const key = norm(labelRaw)
    const isHeadline = TOTAL_LABEL_KEYS.some((k) => key.includes(k))
    // v2.20.2 — 참고용 대안 총액("추가옵션 제외(VAT별도)"·"Excl. Add-ons (VAT excl.)" — 리멤버 견적서 둘째 총액 줄)은
    // 총액 체인이 아니다. 통째로 건너뛴다(전에는 라벨 속 'VAT' 때문에 부가세 금액으로 읽혀 검산이 어긋났다).
    // v2.22.1 — 대표 금액 라벨이 붙은 줄("기본 견적금액 (선택 항목 제외…)")은 건너뛰지 않고 후보로 둔다(아래 resolveHeadline)
    if (!isHeadline && /(제외|excl)/.test(key) && /(옵션|option|add-?on)/.test(key)) continue
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

    // v2.20.2 — 같은 행의 두 번째 라벨("Total (VAT excl.) · … | VAT incl. | …" — 대표 라벨이 아닌 총계 줄에도 온다). 처음 것이 이긴다
    if (!isHeadline) {
      const found: { pre_vat?: number; vat_included?: number } = { pre_vat: block.pre_vat_total, vat_included: block.vat_included_total }
      scanSecondaryLabels(row, labelCol, found)
      if (found.pre_vat !== undefined && block.pre_vat_total === undefined) block.pre_vat_total = found.pre_vat
      if (found.vat_included !== undefined && block.vat_included_total === undefined) block.vat_included_total = found.vat_included
    }

    // v2.20.2 — 대표 금액 라벨("총 견적금액(VAT별도)"·"Grand Total (VAT included)")은 부가세 줄보다 먼저 본다.
    // 전에는 라벨 속 'VAT' 때문에 부가세 줄로 읽혀 공급가 39,770,000이 부가세가 되고 총액이 두 배가 됐다(실사용 2026-09-27).
    if (isHeadline) {
      const value = amount ?? amountInText(text(valueRightOf(row, labelCol)))
      if (value !== null) {
        const cand: HeadlineCandidate = { row: r, value, tag: headlineTag(key) }
        if (/별도|미포함|excl|exclusive|before|without|net|plus/.test(key)) cand.pre_vat = value
        else if (/포함|incl|inclusive|including|with/.test(key)) cand.vat_included = value
        // v2.20.2 — 같은 행의 두 번째 라벨(리멤버 견적서: "총 견적금액(VAT별도) · 일금… · 39,770,000 | VAT 포함 | 43,747,000") —
        // 대표 줄의 값은 그 후보에만 둔다(제외/포함 줄의 VAT 포함 값이 섞이지 않게 · resolveHeadline)
        scanSecondaryLabels(row, labelCol, cand)
        block.headlines.push(cand)
      }
      continue
    }

    // 같은 이름의 라벨이 여러 번 나오면 **처음 것이 이긴다**(하단 안내 문구가 값을 덮지 않도록)
    if (/항목합계|항목합|직접비합계|소계합계|^sub-?total|itemstotal|itemtotal|directcost|totalofitems/.test(key)) {
      if (amount !== null && block.items_sum === undefined) block.items_sum = amount
      continue
    }
    if (/대행료|기획료|대행수수료|pco|agencyfee|managementfee|servicefee|coordinationfee|handlingfee|professionalfee/.test(key)) {
      if (amount !== null && block.agency_fee === undefined) {
        block.agency_fee = amount
        const rates = rateCandidates(labelRaw, line)
        if (rates.length) block.agency_fee_rate = rates[0]
      }
      continue
    }
    if (/절사|절삭|단수|rounding|roundoff|^adjustment/.test(key)) {
      if (amount !== null && block.rounding === undefined) block.rounding = amount
      continue
    }
    if (/부가세|vat|세액|\btax|^tax|salestax/.test(key)) {
      // "총 금액 (부가세 포함)"·"Grand Total (VAT included)"은 총액이지 세액이 아니다.
      // "Total (excl. VAT)"·"합계 (부가세 별도)"는 부가세 전 총계다(v2.18).
      if (/총금액|총액|합계|총계|사업비|total/.test(key)) {
        if (/별도|미포함|excl|exclusive|before|without|net|plus/.test(key)) {
          if (amount !== null && block.pre_vat_total === undefined) block.pre_vat_total = amount
        } else if (amount !== null && block.vat_included_total === undefined) {
          block.vat_included_total = amount
        }
      } else if (amount !== null && block.vat === undefined) {
        block.vat = amount
      }
      continue
    }
    if (/총계/.test(key) || key === 'total' || /^total\(/.test(key)) {
      if (amount !== null && block.pre_vat_total === undefined) block.pre_vat_total = amount
      continue
    }
  }
  return block
}

/**
 * v2.22.1 — 대표 총액 줄 고르기. 본문 합(Σ 섹션 소계 — 기획료가 섹션 안이면 포함)과 부가세 전 값이 맞는 줄 →
 * 없으면 '선택 항목 포함' 줄 → 그다음 첫 줄. 고른 줄에 없는 값(별도/포함)은 **같은 표기의 다른 줄**에서만 보충한다 —
 * '제외' 줄의 VAT 포함 값을 '포함' 줄에 섞으면 총액 체인이 어긋난다(실사용 2026-09-28).
 */
function resolveHeadline(block: TotalsBlock, bodyPreVat: number): void {
  const cands = block.headlines
  if (!cands.length) return
  const matches = (c: HeadlineCandidate): boolean =>
    c.pre_vat !== undefined
      ? near(c.pre_vat, bodyPreVat, 2)
      : c.vat_included === undefined && near(c.value, bodyPreVat, 2)
  const chosen = cands.find(matches) ?? cands.find((c) => c.tag === 'with') ?? cands[0]
  block.headline = chosen.value
  block.headlineRow = chosen.row
  const peers = cands.filter((c) => c !== chosen && c.tag === chosen.tag)
  const pre = chosen.pre_vat ?? peers.find((c) => c.pre_vat !== undefined)?.pre_vat
  const incl = chosen.vat_included ?? peers.find((c) => c.vat_included !== undefined)?.vat_included
  if (pre !== undefined && block.pre_vat_total === undefined) block.pre_vat_total = pre
  if (incl !== undefined && block.vat_included_total === undefined) block.vat_included_total = incl
}

function detectVatMode(
  rows: Row[],
  bodyStart: number,
  block: TotalsBlock,
  preVatBase: number | null,
): 'included' | 'excluded' | 'unknown' {
  const phraseOf = (raw: string): 'included' | 'excluded' | null => {
    const s = raw.replace(/v\.a\.t\.?/gi, 'VAT') // v2.22.1 — "V.A.T 포함"(실사용 다자 발주 견적서)
    if (/(부가세|vat)[^가-힣a-z]*(별도|미포함)/i.test(s) || /(별도|미포함)[^가-힣a-z]*(부가세|vat)/i.test(s)) {
      return 'excluded'
    }
    if (/(부가세|vat)[^가-힣a-z]*포함/i.test(s) || /포함[^가-힣a-z]*(부가세|vat)/i.test(s)) return 'included'
    // v2.18 영문 — "VAT excluded"·"excl. VAT"·"plus VAT"·"VAT not included" / "VAT included"·"incl. VAT"·"inclusive of VAT"
    if (/\b(vat|tax)\b[^a-z가-힣]*(excl\w*|not\s*incl\w*|exclusive|extra|additional)/i.test(s)) return 'excluded'
    if (/\b(excl\w*|exclusive\s+of|plus|before|without|net\s+of|not\s+including)\s*(of\s+)?(vat|tax)\b/i.test(s)) return 'excluded'
    if (/\b(vat|tax)\b[^a-z가-힣]*(incl\w*|inclusive)/i.test(s)) return 'included'
    if (/\b(incl\w*|inclusive\s+of|including|with)\s*(of\s+)?(vat|tax)\b/i.test(s)) return 'included'
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
const FEE_BASE_EXCLUDE = /옵션|식음|케이터링|모객|f&b|선택|option|add-?on|catering|recruit|lead\s*gen/i
const VENUE_HINT = /베뉴|대관|장소|venue|hall\s*rental|room\s*rental/i
// v2.22.1 — '대행 수수료'·'수수료'(실사용 만찬 견적서 "6. 대행 수수료 (실행비의 15%)")도 기획료 섹션이다
const FEE_HINT = /대행료|기획료|대행\s*수수료|수수료|pco|agency\s*fee|management\s*fee|service\s*fee|coordination\s*fee|handling\s*fee|commission/i
/** 비율(%) 후보를 읽을 줄 — 대행료·기획료·이윤·인건비를 말하는 줄만(v2.20.2) */
const FEE_RATE_CONTEXT = /대행료|기획료|수수료|이윤|인건비|관리비|pco|fee|commission|margin|markup/i

function feeBaseOf(sections: ParsedQuoteSection[]): number {
  return sections.reduce((sum, s) => {
    if (FEE_HINT.test(s.name) || VENUE_HINT.test(s.name) || FEE_BASE_EXCLUDE.test(s.name)) return sum
    return sum + sectionAmount(s)
  }, 0)
}

function truncateTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit
}

/**
 * v2.22.1 — 섹션 안 기획료의 산정 기준·비율을 문서에서 되짚는다. 기획료 줄 자체가 "실행비 38,960,000 × 요율 0.15"처럼
 * 기준·비율을 숫자 셀로 갖거나(리멤버 견적서·만찬 견적서), 제목이 "(실행비의 15%)"처럼 비율을 말한다. 후보 기준 =
 * 문서가 적은 기준 셀 → 직접비 어림(베뉴·옵션·모객 제외) → 기획료 뺀 전 섹션 → 베뉴만 뺀 합. 비율 후보 = 적힌 비율 →
 * 기준마다 어림한 비율(0.5% 단위 — 참 비율이 그 단위와 0.05%p 안에서 맞을 때만). 만원 절사(외화는 반올림)로 **정확히** 맞는
 * 조합만 받아들인다 — 못 찾으면 옛 규칙(어림 기준 + 가장 가까운 후보) 그대로.
 */
function resolveFeeBase(
  sections: ParsedQuoteSection[],
  feeSection: ParsedQuoteSection,
  fee: number,
  ratesHinted: number[],
  feeRowNumbers: number[],
  foreign: boolean,
): { base: number; rate: number } | null {
  const others = sections.filter((s) => s !== feeSection)
  const sumOf = (list: ParsedQuoteSection[]) => list.reduce((sum, s) => sum + sectionAmount(s), 0)
  const baseHints = feeRowNumbers.filter((n) => n >= 100_000 && !near(n, fee))
  const rateHintsInRow = feeRowNumbers.filter((n) => n > 0 && n < 1)
  const bases = [...baseHints, feeBaseOf(sections), sumOf(others), sumOf(others.filter((s) => !VENUE_HINT.test(s.name)))].filter(
    (b, i, arr) => b > 0 && arr.indexOf(b) === i,
  )
  const hinted = [...rateHintsInRow, ...ratesHinted].filter((r) => r > 0 && r <= 1)
  const exact = (base: number, rate: number): boolean => {
    const expected = foreign ? Math.round(base * rate) : truncateTo(base * rate, 10_000)
    return Math.abs(expected - fee) < (foreign ? 1 : 10_000)
  }
  for (const base of bases) {
    for (const rate of hinted) if (exact(base, rate)) return { base, rate }
  }
  for (const base of bases) {
    const raw = fee / base
    const stepped = Math.round(raw * 200) / 200 // 0.5% 단위
    if (stepped < 0.05 || stepped > 0.4) continue
    if (Math.abs(raw - stepped) > 0.0005) continue
    if (exact(base, stepped)) return { base, rate: stepped }
  }
  return null
}

/** 기획료 섹션 제목 행 다음의 항목 줄들에 적힌 숫자(기준·비율·금액) — 소계 줄 전까지, 최대 6줄 */
function feeRowNumbers(rows: Row[], titleRow: number): number[] {
  const out: number[] = []
  if (titleRow < 0) return out
  for (let r = titleRow + 1; r < Math.min(rows.length, titleRow + 8); r++) {
    const row = rows[r] ?? []
    if (isEmptyRow(row)) continue
    if (isSubtotalRow(row) || sectionTitleOf(row)) break
    if (classifyHeaderRow(row)) continue
    for (const c of row) {
      const n = num(c)
      if (n !== null) out.push(n)
    }
  }
  return out
}

// ── 수입 표 (v2.22.1 P형 — 주최형 워킹버짓의 파트너 계약 매출) ──────────────
const REVENUE_PARTNER_KEYS = ['파트너사', '파트너', '스폰서', '후원사', 'partner', 'sponsor']
const REVENUE_AMOUNT_KEYS_STRONG = ['계약매출', '계약금액', 'contractamount', 'contractrevenue', 'contractvalue']
const REVENUE_AMOUNT_KEYS_WEAK = ['매출', '수입', 'revenue', 'income']
const REVENUE_GRADE_KEYS = ['등급', 'grade', 'tier', 'level']

/** 수입 시트: 파트너사·등급·계약 매출 열이 있는 표 → 파트너마다 한 줄(합계 줄에서 멈춘다). 견적 금액에는 넣지 않는다 */
function readRevenue(sheets: SheetGrid[], picked: SheetGrid): ParsedRevenueRow[] {
  for (const sheet of sheets) {
    if (sheet === picked) continue
    const rows = sheet.rows
    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const row = rows[r] ?? []
      const keys = row.map((c) => norm(c))
      const partnerCol = keys.findIndex((k) => k !== '' && REVENUE_PARTNER_KEYS.some((p) => k.startsWith(p)))
      if (partnerCol < 0) continue
      let amountCol = keys.findIndex((k) => REVENUE_AMOUNT_KEYS_STRONG.some((p) => k.includes(p)))
      if (amountCol < 0) amountCol = keys.findIndex((k) => REVENUE_AMOUNT_KEYS_WEAK.some((p) => k === p || k.startsWith(p)))
      if (amountCol < 0 || amountCol === partnerCol) continue
      const gradeCol = keys.findIndex((k) => REVENUE_GRADE_KEYS.some((p) => k === p || k.startsWith(p)))
      const out: ParsedRevenueRow[] = []
      for (let k = r + 1; k < rows.length; k++) {
        const line = rows[k] ?? []
        if (isEmptyRow(line)) break
        const first = firstFilled(line)
        if (first && /^(합계|총계|계|total|sum)/i.test(norm(first[1]))) break
        const amount = num(line[amountCol])
        const partner = text(line[partnerCol])
        if (amount === null || amount === 0 || !partner) continue
        const grade = gradeCol >= 0 ? text(line[gradeCol]) : ''
        out.push({ title: grade ? `${partner} · ${grade}` : partner, amount })
      }
      if (out.length) return out
    }
  }
  return []
}

// ── 진입점 ─────────────────────────────────────────────────────────────
/**
 * 읽을 시트 — 항목 표가 있는 첫 시트가 기본. (v2.22.1) 그 시트에 섹션 구조가 없으면(제목 행 2개 미만 — 요약표·현금흐름표) 섹션이
 * 있는 뒤 시트를 고른다(실사용 워킹버짓: 요약 → 가정 → 수입 → **지출**). A안/B안처럼 둘 다 구조가 있으면 앞 시트.
 */
function pickSheet(sheets: SheetGrid[]): { sheet: SheetGrid; layout: BodyLayout | null } {
  let first: { sheet: SheetGrid; layout: BodyLayout } | null = null
  for (const sheet of sheets) {
    const layout = findBody(sheet.rows)
    if (!layout) continue
    if (!first) first = { sheet, layout }
    const named = parseBody(sheet.rows, layout).sections.filter((s) => s.name !== '전체').length
    if (named >= 2) return { sheet, layout }
  }
  return first ?? { sheet: sheets[0], layout: null }
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
      '항목 표(금액 열)를 찾지 못했습니다 — 지원 서식(A·B·C·P형)의 열 제목이 있는지 확인해 주세요.',
    )
  }
  if (sheets.length > 1) warnings.push(`시트 ${sheets.length}개 중 '${sheet.name}' 시트를 읽었습니다.`)
  const budget = layout.format === 'P'

  const rows = sheet.rows
  const body = parseBody(rows, layout)
  const sections = body.sections
  if (sections.length === 0) {
    throw new ProviderError('validation', '항목 행을 한 건도 찾지 못했습니다 — 파일을 확인해 주세요.')
  }
  if (sections.length === 1 && sections[0].name === '전체') {
    warnings.push('"N. 제목" 형식의 섹션 구분이 없어 전체를 1섹션으로 처리했습니다.')
  }
  if (budget) {
    warnings.push(
      "예산 워크북(지출 표)을 읽었습니다 — '기준안' 열을 금액으로 읽었고 절감안·상한안은 무시했습니다. 부가세 줄이 없어 총액은 지출 합(VAT 별도)입니다.",
    )
  }

  // ── 헤더 필드 (§22.2-1: 실패 필드는 비워 둔다) ──
  const header: ParsedQuoteHeader = {}
  for (let r = 0; r < layout.bodyStart; r++) {
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const key = norm(row[c])
      if (!key) continue
      const hit = HEADER_FIELDS.find((f) => f.keys.some((k) => headerKeyMatches(key, k)))
      if (!hit || header[hit.field] !== undefined) continue
      const value = text(valueRightOf(row, c))
      if (value) (header as Record<string, unknown>)[hit.field] = value
    }
  }

  // ── 총액 블록 + 섹션 합 ──
  const block = parseTotalsBlock(rows, layout.bodyStart)
  const sectionSum = sections.reduce((sum, s) => sum + sectionAmount(s), 0)
  resolveHeadline(block, sectionSum)
  const itemsSum = block.items_sum ?? sectionSum

  // 기획료가 섹션 안에 들어 있는 서식(B·C형)은 총액 체인에서 다시 더하지 않는다
  const feeSection = sections.find((s) => FEE_HINT.test(s.name))
  const feeInsideItems = block.agency_fee === undefined && feeSection !== undefined
  const agencyFee = block.agency_fee ?? (feeSection ? sectionAmount(feeSection) : undefined)
  const currency = detectCurrency(rows)
  const foreign = currency !== undefined

  let agencyFeeRate = block.agency_fee_rate
  let feeBase = feeInsideItems ? feeBaseOf(sections) : itemsSum
  if (feeInsideItems && feeSection) {
    // "6. PCO 기획료  (직접비의 25%)" — 제목 행 옆 문구에서 율을 읽는다
    const titleRow = rows.findIndex((row) => {
      const t = sectionTitleOf(row ?? [])
      return t?.name === feeSection.name
    })
    const rates = titleRow >= 0 ? rateCandidates(rowText(rows[titleRow] ?? [])) : []
    if (rates.length) agencyFeeRate = rates[0]
    // v2.22.1 — 기획료 줄의 기준·비율 셀과 제목의 비율로 정확히 맞는 기준을 되짚는다
    if (agencyFee !== undefined && agencyFee > 0) {
      const resolved = resolveFeeBase(sections, feeSection, agencyFee, rates, feeRowNumbers(rows, titleRow), foreign)
      if (resolved) {
        feeBase = resolved.base
        agencyFeeRate = resolved.rate
      }
    }
  }
  // 실제 비율로 후보를 되짚어 고른다(라벨에 "인건비 15% + 이윤 10%"처럼 나눠 적힌 A형 대응)
  if (agencyFee !== undefined && feeBase > 0) {
    const implied = agencyFee / feeBase
    // v2.20.2 — 비율 후보는 대행료·기획료를 말하는 줄에서만(리멤버 견적서 머리 "KPI 달성선 68명 (85% 인정)"이 기획료 85%로 잡혔다)
    const candidates = rateCandidates(
      ...rows
        .slice(0, layout.bodyStart)
        .map((row) => rowText(row ?? []))
        .filter((t) => FEE_RATE_CONTEXT.test(t)),
    )
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
  if (vat === undefined && !budget) {
    if (block.vat_included_total !== undefined) vat = block.vat_included_total - preVatBase
    else if (vatMode === 'included' && block.headline !== undefined) vat = block.headline - preVatBase
  }
  const grandTotal = budget
    ? undefined
    : block.vat_included_total ??
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

  // v2.20.2 — 대표 금액 라벨이 없으면(영문 'Total (VAT excl.)') 부가세 판정과 같은 쪽 값을 쓴다(별도 = 부가세 전 총계)
  header.total_amount = budget
    ? itemsSum
    : (block.headline ?? (vatMode === 'excluded' && block.pre_vat_total !== undefined ? block.pre_vat_total : grandTotal))
  header.vat_mode = budget && vatMode === 'unknown' ? 'excluded' : vatMode
  if (currency) {
    header.currency = currency
    warnings.push(
      `통화가 ${currency}로 표기돼 있습니다 — 금액은 적힌 숫자 그대로 읽었습니다(원화 환산 없음). 확인 큐와 견적 화면에서 확인하세요.`,
    )
  }

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
    // 만원 절사는 원화 규약 — 외화 문서(v2.18)는 반올림 기준으로만 대조한다
    const expected = foreign ? Math.round(feeBase * agencyFeeRate) : truncateTo(feeBase * agencyFeeRate, 10_000)
    const percent = agencyFeeRate * 100
    checks.push({
      name: `${feeInsideItems ? '기획료' : '대행료'} ${percent.toFixed(Number.isInteger(percent) ? 0 : 1)}%${foreign ? '' : ' (만원 절사 기준)'}`,
      expected,
      actual: agencyFee,
      ok: foreign ? near(agencyFee, expected, 1) : Math.abs(agencyFee - expected) < 10_000,
    })
  }
  if (vat !== undefined) {
    const expected = Math.round(preVatBase * 0.1)
    const ok = near(expected, vat, 2)
    checks.push({ name: '부가세 10%', expected, actual: vat, ok })
    // v2.22.1 — 문서 총액에서 역산한 부가세가 10%와 크게 다르면 총액 블록과 항목 표의 기준이 다른 문서다(다자 발주 견적서 등)
    if (!ok && block.vat === undefined && preVatBase > 0 && Math.abs(vat - expected) > preVatBase * 0.01) {
      warnings.push(
        `문서 총액에서 역산한 부가세(${vat.toLocaleString('ko-KR')})가 항목 표 기준 10%(${expected.toLocaleString('ko-KR')})와 다릅니다 — 총액 블록과 항목 표의 기준이 다른지 확인하세요.`,
      )
    }
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

  const doc: ParsedQuoteDoc = { format: layout.format, header, sections, totals, checks, warnings }
  if (budget) {
    doc.kind = 'budget'
    const revenue = readRevenue(sheets, sheet)
    doc.revenue = revenue
    if (revenue.length) {
      const total = revenue.reduce((sum, r) => sum + r.amount, 0)
      warnings.push(
        `수입 표에서 파트너 계약 매출 ${revenue.length}건(합계 ${total.toLocaleString('ko-KR')}원)을 읽었습니다 — 견적 금액에는 넣지 않고 기록만 합니다(주최형 정산 참고).`,
      )
    }
  }
  return doc
}

export { mapSectionsToBuckets, QUOTE_IMPORT_BUCKETS, bucketLabel } from './buckets'
