// 협력사 견적서 PDF·사진 → AI(Claude) 읽기 — 설계서 v2.14 §19.5b (Phase 4.8). 순수 함수·상수만 — 서버(api/ai)와 앱이 함께 쓴다.
//
// §19.5 원칙은 엑셀과 같다: AI는 **읽기만** 하고, 결과는 확인 큐(buildVendorQuote → 담당자 확인 → 확정 RPC)를 거쳐 저장된다.
// 여기서는 ① 받는 파일 종류 ② Claude에 주는 규칙·출력 스키마 ③ 받은 JSON 검사 ④ 파서 산출(ParsedQuoteDoc)과 같은 모양으로 바꾸기를 한다.
// 개인정보: 스키마에 사람 이름·연락처·계좌·사업자번호 칸이 없다 — Claude가 그런 값을 돌려줄 자리 자체가 없다(R-O6 준용).
// 금액은 견적서에 적힌 대로만 — 적혀 있지 않은 합계는 계산해 채우지 않는다(검산은 우리 코드가 한다 — 추측 금지).
// api/ 런타임이 이 파일을 불러오므로 런타임 import를 두지 않는다(타입만 — CLAUDE.md §6 api ESM 확장자 규칙).
import type { ParsedQuoteCheck, ParsedQuoteDoc, ParsedQuoteSection, ParsedQuoteTotals } from '../modules/quote/import/types'

// ── 받는 파일 ─────────────────────────────────────────────────────────

export type AiMediaType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

const EXT_MEDIA: Record<string, AiMediaType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** 파일 이름 → AI로 읽을 형식(아니면 null). 엑셀은 null — 파서가 읽는다 */
export function aiMediaTypeFor(fileName: string): AiMediaType | null {
  const m = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  return m ? (EXT_MEDIA[m[1].toLowerCase()] ?? null) : null
}

export function isAiVendorQuoteFile(fileName: string): boolean {
  return aiMediaTypeFor(fileName) !== null
}

export function isImageMedia(media: AiMediaType): boolean {
  return media !== 'application/pdf'
}

/**
 * 원본 크기 상한 — 서버 함수 요청 본문 한도(4.5MB) 안에 base64(×4/3)로 들어가야 한다.
 * 사진은 앱이 긴 변 2000px JPEG로 줄여 보내므로 보통 1MB 아래. PDF는 이 크기를 넘으면 나눠 올린다.
 */
export const AI_MAX_BYTES = 3 * 1024 * 1024

export const AI_FILE_TOO_LARGE_MESSAGE =
  'PDF·사진은 3MB까지 AI로 읽을 수 있습니다 — 스캔 PDF면 해상도를 낮추거나 쪽을 나눠 올려 주세요.'

// ── Claude에 주는 규칙·출력 스키마 ─────────────────────────────────────

/** 시스템 프롬프트 — 옮겨 적기만, 계산·추측 금지, 개인정보 금지 */
export const AI_VENDOR_QUOTE_SYSTEM = [
  '당신은 한국 행사 대행사의 정산 담당을 돕습니다. 협력사가 보낸 견적서(PDF 또는 사진)에서 표를 옮겨 적는 일만 합니다.',
  '규칙:',
  '- 보이는 값만 옮깁니다. 보이지 않거나 흐려서 읽을 수 없는 값은 추측하지 말고 null로 둡니다.',
  '- 금액은 원 단위 정수로 적습니다(쉼표·원·₩·"만" 표기를 풀어서). 할인·절사·조정은 음수입니다.',
  '- 섹션(구분·대분류 제목)이 있으면 섹션별로, 없으면 이름 "항목" 한 섹션으로 적습니다.',
  '- 항목의 amount는 그 줄의 합계 금액입니다. 단가·수량이 따로 적혀 있으면 unit_price·qty에도 적습니다.',
  '- 소계·합계·공급가액·부가세·총액 줄은 항목으로 넣지 않고 totals에 적습니다: items_sum(항목 합계·공급가액), agency_fee(대행료·관리비·일반관리비·기업이윤 — 항목 표 밖에 따로 있을 때만), agency_fee_rate(비율이 적혀 있으면 0.1처럼 소수), rounding(절사·단수 조정 — 보통 음수), vat(부가세 금액), grand_total(부가세 포함 총액). 적혀 있지 않은 합계는 계산하지 말고 null입니다.',
  '- 섹션 소계가 적혀 있으면 subtotal에, 없으면 null입니다.',
  '- vat_mode: "부가세 별도"·"VAT 별도" 표기면 excluded, "부가세 포함"·"VAT 포함"이면 included, 표기가 없으면 unknown.',
  '- 선택 옵션이거나 "총액 미포함"처럼 총액에 들어가지 않는 줄은 in_total=false, 그 밖의 줄은 true.',
  '- 사람 이름·전화번호·이메일·계좌번호·사업자등록번호·주소는 어디에도 적지 않습니다(비고 포함).',
  '- 견적서가 아니거나 표를 읽을 수 없으면 readable=false로 두고 unreadable_reason에 한 문장으로 이유를 적습니다.',
].join('\n')

export const AI_VENDOR_QUOTE_INSTRUCTION = '이 견적서의 항목과 합계를 규칙대로 옮겨 적어 주세요.'

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

/**
 * 구조화 출력 스키마(output_config.format — json_schema). 모든 객체는 additionalProperties:false + 모든 키 required
 * (구조화 출력 규약). 숫자 범위 제약은 쓰지 않는다(미지원) — 범위는 validateAiVendorQuote가 본다.
 */
export const AI_VENDOR_QUOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'unreadable_reason', 'quoted_at', 'vat_mode', 'sections', 'totals'],
  properties: {
    readable: { type: 'boolean', description: '견적서 표를 읽었으면 true' },
    unreadable_reason: nullable({ type: 'string', description: '읽지 못한 이유 한 문장' }),
    quoted_at: nullable({ type: 'string', description: '견적일 — 적힌 그대로' }),
    vat_mode: { type: 'string', enum: ['included', 'excluded', 'unknown'] },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'subtotal', 'items'],
        properties: {
          name: { type: 'string' },
          subtotal: nullable({ type: 'integer' }),
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'spec', 'qty', 'unit_price', 'amount', 'note', 'in_total'],
              properties: {
                title: { type: 'string', description: '품명' },
                spec: nullable({ type: 'string', description: '규격·사양' }),
                qty: nullable({ type: 'number' }),
                unit_price: nullable({ type: 'integer' }),
                amount: { type: 'integer', description: '그 줄의 합계 금액(원)' },
                note: nullable({ type: 'string', description: '비고 — 개인정보 금지' }),
                in_total: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['items_sum', 'agency_fee', 'agency_fee_rate', 'rounding', 'vat', 'grand_total'],
      properties: {
        items_sum: nullable({ type: 'integer' }),
        agency_fee: nullable({ type: 'integer' }),
        agency_fee_rate: nullable({ type: 'number' }),
        rounding: nullable({ type: 'integer' }),
        vat: nullable({ type: 'integer' }),
        grand_total: nullable({ type: 'integer' }),
      },
    },
  },
} as const

// ── 받은 JSON ─────────────────────────────────────────────────────────

export interface AiVendorQuoteItem {
  title: string
  spec: string | null
  qty: number | null
  unit_price: number | null
  amount: number
  note: string | null
  in_total: boolean
}

export interface AiVendorQuoteResult {
  readable: boolean
  unreadable_reason: string | null
  quoted_at: string | null
  vat_mode: 'included' | 'excluded' | 'unknown'
  sections: { name: string; subtotal: number | null; items: AiVendorQuoteItem[] }[]
  totals: {
    items_sum: number | null
    agency_fee: number | null
    agency_fee_rate: number | null
    rounding: number | null
    vat: number | null
    grand_total: number | null
  }
}

/** 한 견적서에서 받을 최대 — 이보다 많으면 잘못 읽은 것으로 본다 */
const MAX_SECTIONS = 60
const MAX_ITEMS = 600
/** 원 단위 상한(1조) — 자릿수를 잘못 읽은 값 걸러내기 */
const MAX_WON = 1_000_000_000_000

export class AiVendorQuoteShapeError extends Error {}

function fail(path: string, what: string): never {
  throw new AiVendorQuoteShapeError(`${path}: ${what}`)
}

function str(v: unknown, path: string, max = 500): string {
  if (typeof v !== 'string') fail(path, '문자열이 아닙니다')
  return v.trim().slice(0, max)
}

function optStr(v: unknown, path: string, max = 500): string | null {
  if (v === null || v === undefined) return null
  const s = str(v, path, max)
  return s ? s : null
}

function won(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(path, '정수 금액이 아닙니다')
  if (Math.abs(v) >= MAX_WON) fail(path, '금액 자릿수가 너무 큽니다')
  return v
}

function optWon(v: unknown, path: string): number | null {
  return v === null || v === undefined ? null : won(v, path)
}

function optNum(v: unknown, path: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '숫자가 아닙니다')
  return v
}

/** Claude가 돌려준 JSON 검사 — 구조화 출력이 모양을 지켜도 값 범위·개수는 여기서 본다. 틀리면 AiVendorQuoteShapeError */
export function validateAiVendorQuote(raw: unknown): AiVendorQuoteResult {
  if (!raw || typeof raw !== 'object') fail('응답', '객체가 아닙니다')
  const r = raw as Record<string, unknown>
  if (typeof r.readable !== 'boolean') fail('readable', '참·거짓이 아닙니다')
  const vatMode = r.vat_mode
  if (vatMode !== 'included' && vatMode !== 'excluded' && vatMode !== 'unknown') fail('vat_mode', '알 수 없는 값입니다')
  if (!Array.isArray(r.sections)) fail('sections', '배열이 아닙니다')
  if (r.sections.length > MAX_SECTIONS) fail('sections', '섹션이 너무 많습니다')
  let itemCount = 0
  const sections = r.sections.map((s, i) => {
    if (!s || typeof s !== 'object') fail(`sections[${i}]`, '객체가 아닙니다')
    const so = s as Record<string, unknown>
    if (!Array.isArray(so.items)) fail(`sections[${i}].items`, '배열이 아닙니다')
    itemCount += so.items.length
    if (itemCount > MAX_ITEMS) fail('items', '항목이 너무 많습니다')
    return {
      name: str(so.name, `sections[${i}].name`, 120) || '항목',
      subtotal: optWon(so.subtotal, `sections[${i}].subtotal`),
      items: so.items.map((it, j) => {
        const p = `sections[${i}].items[${j}]`
        if (!it || typeof it !== 'object') fail(p, '객체가 아닙니다')
        const io = it as Record<string, unknown>
        if (typeof io.in_total !== 'boolean') fail(`${p}.in_total`, '참·거짓이 아닙니다')
        return {
          title: str(io.title, `${p}.title`, 200) || '(품명 없음)',
          spec: optStr(io.spec, `${p}.spec`, 200),
          qty: optNum(io.qty, `${p}.qty`),
          unit_price: optWon(io.unit_price, `${p}.unit_price`),
          amount: won(io.amount, `${p}.amount`),
          note: optStr(io.note, `${p}.note`, 200),
          in_total: io.in_total,
        }
      }),
    }
  })
  if (!r.totals || typeof r.totals !== 'object') fail('totals', '객체가 아닙니다')
  const t = r.totals as Record<string, unknown>
  const rate = optNum(t.agency_fee_rate, 'totals.agency_fee_rate')
  if (rate !== null && (rate < 0 || rate > 1)) fail('totals.agency_fee_rate', '0~1 사이 비율이 아닙니다')
  return {
    readable: r.readable,
    unreadable_reason: optStr(r.unreadable_reason, 'unreadable_reason', 300),
    quoted_at: optStr(r.quoted_at, 'quoted_at', 40),
    vat_mode: vatMode,
    sections,
    totals: {
      items_sum: optWon(t.items_sum, 'totals.items_sum'),
      agency_fee: optWon(t.agency_fee, 'totals.agency_fee'),
      agency_fee_rate: rate,
      rounding: optWon(t.rounding, 'totals.rounding'),
      vat: optWon(t.vat, 'totals.vat'),
      grand_total: optWon(t.grand_total, 'totals.grand_total'),
    },
  }
}

// ── 파서 산출과 같은 모양으로 ──────────────────────────────────────────

/** 협력사 견적 확인 큐의 입력 — 엑셀 파서 산출(A·B·C형) 또는 AI가 읽은 것('ai') */
export type VendorQuoteSourceDoc = Omit<ParsedQuoteDoc, 'format'> & { format: ParsedQuoteDoc['format'] | 'ai' }

export const AI_READ_WARNING = 'AI가 읽은 결과입니다 — 금액을 원본과 한 줄씩 대조한 뒤 확정하세요.'

const NOT_IN_TOTAL_NOTE = '총액 미포함'

/**
 * AI 결과 → 확인 큐 입력. 검산(섹션 소계 · 항목 합계 · 총액)은 여기서 **우리 코드가** 한다 —
 * 어긋나면 경고로 보이고 진행은 막지 않는다(§22.2-5 준용). 합계가 적혀 있지 않으면 검산하지 않는다(값을 지어내지 않는다).
 */
export function docFromAiVendorQuote(result: AiVendorQuoteResult): VendorQuoteSourceDoc {
  const sections: ParsedQuoteSection[] = result.sections.map((s, i) => ({
    name: s.name,
    order: i + 1,
    subtotal: s.subtotal ?? undefined,
    items: s.items.map((it) => {
      const notes = [it.note, it.in_total ? null : NOT_IN_TOTAL_NOTE].filter(Boolean)
      return {
        title: it.title,
        spec: it.spec ?? undefined,
        qty: it.qty ?? undefined,
        unit_price: it.unit_price ?? undefined,
        amount: it.amount,
        note: notes.length ? notes.join(' · ') : undefined,
      }
    }),
  }))
  const t = result.totals
  const totals: ParsedQuoteTotals = {}
  if (t.items_sum !== null) totals.items_sum = t.items_sum
  if (t.agency_fee !== null) totals.agency_fee = t.agency_fee
  if (t.agency_fee_rate !== null) totals.agency_fee_rate = t.agency_fee_rate
  if (t.rounding !== null) totals.rounding = t.rounding
  if (t.vat !== null) totals.vat = t.vat
  if (t.grand_total !== null) totals.grand_total = t.grand_total

  const inTotalSum = (items: AiVendorQuoteItem[]) => items.filter((it) => it.in_total).reduce((s, it) => s + it.amount, 0)
  const checks: ParsedQuoteCheck[] = []
  for (const s of result.sections) {
    if (s.subtotal === null) continue
    const actual = inTotalSum(s.items)
    checks.push({ name: `${s.name} 소계`, expected: s.subtotal, actual, ok: Math.abs(actual - s.subtotal) <= 1 })
  }
  const itemsActual = result.sections.reduce((sum, s) => sum + inTotalSum(s.items), 0)
  if (t.items_sum !== null) {
    checks.push({ name: '항목 합계', expected: t.items_sum, actual: itemsActual, ok: Math.abs(itemsActual - t.items_sum) <= 1 })
  }
  if (t.grand_total !== null && t.vat !== null) {
    const supply = (t.items_sum ?? itemsActual) + (t.agency_fee ?? 0) + (t.rounding ?? 0)
    const actual = supply + t.vat
    checks.push({ name: '총액', expected: t.grand_total, actual, ok: Math.abs(actual - t.grand_total) <= 1 })
  }
  const warnings = [AI_READ_WARNING]
  for (const c of checks) {
    if (!c.ok) warnings.push(`${c.name}이(가) 맞지 않습니다 — 견적서 ${c.expected.toLocaleString('ko-KR')}원 · 읽은 줄 합 ${c.actual.toLocaleString('ko-KR')}원. 빠지거나 잘못 읽은 줄이 있는지 보세요.`)
  }
  return {
    format: 'ai',
    header: {
      quoted_at: result.quoted_at ?? undefined,
      vat_mode: result.vat_mode,
    },
    sections,
    totals,
    checks,
    warnings,
  }
}
