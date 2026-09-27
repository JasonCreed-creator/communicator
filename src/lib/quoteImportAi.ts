// 견적서(우리가 낸 견적 · 국문/영문) PDF·사진 → AI(Claude) 읽기 — 설계서 v2.18 §22.5 (Phase 6.4 PR-2). 순수 함수·상수만 —
// 서버(api/ai ?action=quote-import)와 앱(SupabaseProvider.importQuoteFile)이 함께 쓴다.
//
// §22 원칙은 엑셀 파서와 같다: AI는 **옮겨 적기만** 하고, 결과는 같은 확인 큐(섹션 → 버킷 매핑 → 확정 → 분배)를 거친다(R-Q1 — quotes는 confirm으로만).
// 여기서는 ① Claude에 주는 규칙·출력 스키마 ② 받은 JSON 검사 ③ 파서 산출(ParsedQuoteDoc)과 같은 모양으로 바꾸기(검산은 우리 코드)를 한다.
// 개인정보: 스키마에 사람 이름·연락처·계좌·사업자번호 칸이 없다 — 헤더의 '담당자'도 읽지 않는다(확인 큐에서 사람이 채운다).
// 금액은 적힌 대로만 — 적혀 있지 않은 합계는 계산해 채우지 않는다. 통화가 원화가 아니면 코드만 적고 환산하지 않는다(§22.2 규칙 0과 같다).
// api/ 런타임이 이 파일을 불러오므로 런타임 import를 두지 않는다(타입만 — CLAUDE.md §6 api ESM 확장자 규칙). 받는 형식·크기 상한은 vendorQuoteAi와 같다.
import type { ParsedQuoteCheck, ParsedQuoteDoc, ParsedQuoteHeader, ParsedQuoteSection, ParsedQuoteTotals } from '../modules/quote/import/types'

// ── 규칙·출력 스키마 ──────────────────────────────────────────────────

/** 시스템 프롬프트 — 국문·영문 견적서 모두, 옮겨 적기만 · 계산·추측 금지 · 개인정보 금지 */
export const AI_QUOTE_IMPORT_SYSTEM = [
  '당신은 행사 대행사의 영업 담당을 돕습니다. 대행사가 고객에게 보낸 행사 견적서(PDF 또는 사진 · 한국어 또는 영어)에서 표를 옮겨 적는 일만 합니다.',
  '규칙:',
  '- 보이는 값만 옮깁니다. 보이지 않거나 흐려서 읽을 수 없는 값은 추측하지 말고 null로 둡니다. 영어 문서는 영어 그대로 옮깁니다(번역하지 않습니다).',
  '- 금액은 문서의 통화 단위 그대로 정수로 적습니다(쉼표·원·₩·$·"만" 표기를 풀어서). 할인·절사·조정은 음수입니다. 통화는 currency에 ISO 코드(KRW·USD·EUR…)로 적고, 표기가 없으면 null입니다. 환산하지 않습니다.',
  '- 헤더: event_name(행사명·Project/Event), client(고객사·Client/To), date_range(행사 일시·기간 — 적힌 그대로), venue(장소·Venue), quoted_at(견적일·Quote Date — 적힌 그대로), total_amount(문서에 인쇄된 대표 총액), vat_mode(부가세 별도/excl = excluded · 포함/incl = included · 표기 없음 = unknown).',
  '- 섹션은 "1. 장소 대관료"·"2. Stage & AV"처럼 번호가 붙은 대분류 제목 그대로 적습니다(번호 포함). 섹션이 없으면 이름 "전체" 한 섹션으로 적습니다.',
  '- 항목의 amount는 그 줄의 합계 금액입니다. 단가·수량·일수가 따로 적혀 있으면 unit_price·qty·days에도 적습니다. spec에는 규격·설명 칸의 글을 적습니다.',
  '- 소계·합계·부가세·총액 줄은 항목으로 넣지 않고 totals에 적습니다: items_sum(항목 합계·공급가액·Sub Total), agency_fee(대행료·기획료·Agency/Management Fee — 항목 표 밖에 따로 있을 때만), agency_fee_rate(비율이 적혀 있으면 0.15처럼 소수), rounding(절사·단수 조정 — 보통 음수), vat(부가세·VAT·Tax 금액), grand_total(부가세 포함 총액·Grand Total). 적혀 있지 않은 합계는 계산하지 말고 null입니다.',
  '- 섹션 소계(Subtotal)가 적혀 있으면 subtotal에, 없으면 null입니다.',
  '- 선택 옵션이거나 "총액 미포함"·"not included"·"optional"처럼 총액에 들어가지 않는 줄은 in_total=false, 그 밖의 줄은 true.',
  '- 사람 이름·전화번호·이메일·계좌번호·사업자등록번호·주소는 어디에도 적지 않습니다(담당자·비고 포함).',
  '- 견적서가 아니거나 표를 읽을 수 없으면 readable=false로 두고 unreadable_reason에 한 문장으로 이유를 적습니다.',
].join('\n')

export const AI_QUOTE_IMPORT_INSTRUCTION = '이 견적서의 헤더·섹션·항목·합계를 규칙대로 옮겨 적어 주세요.'

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

/** 구조화 출력 스키마 — 모든 객체 additionalProperties:false + 모든 키 required(구조화 출력 규약) · 숫자 범위 제약 없음(검사는 validateAiQuoteImport) */
export const AI_QUOTE_IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'unreadable_reason', 'language', 'currency', 'header', 'sections', 'totals'],
  properties: {
    readable: { type: 'boolean', description: '견적서 표를 읽었으면 true' },
    unreadable_reason: nullable({ type: 'string', description: '읽지 못한 이유 한 문장' }),
    language: { type: 'string', enum: ['ko', 'en', 'other'] },
    currency: nullable({ type: 'string', description: 'ISO 통화 코드(KRW·USD·EUR…) — 표기 없으면 null' }),
    header: {
      type: 'object',
      additionalProperties: false,
      required: ['event_name', 'client', 'date_range', 'venue', 'quoted_at', 'total_amount', 'vat_mode'],
      properties: {
        event_name: nullable({ type: 'string' }),
        client: nullable({ type: 'string', description: '고객사(회사·기관 이름) — 사람 이름 금지' }),
        date_range: nullable({ type: 'string', description: '행사 일시·기간 — 적힌 그대로' }),
        venue: nullable({ type: 'string' }),
        quoted_at: nullable({ type: 'string', description: '견적일 — 적힌 그대로' }),
        total_amount: nullable({ type: 'integer', description: '문서에 인쇄된 대표 총액' }),
        vat_mode: { type: 'string', enum: ['included', 'excluded', 'unknown'] },
      },
    },
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
              required: ['title', 'spec', 'unit_price', 'qty', 'days', 'amount', 'note', 'in_total'],
              properties: {
                title: { type: 'string', description: '품명' },
                spec: nullable({ type: 'string', description: '규격·설명' }),
                unit_price: nullable({ type: 'integer' }),
                qty: nullable({ type: 'number' }),
                days: nullable({ type: 'number' }),
                amount: { type: 'integer', description: '그 줄의 합계 금액' },
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

export interface AiQuoteImportItem {
  title: string
  spec: string | null
  unit_price: number | null
  qty: number | null
  days: number | null
  amount: number
  note: string | null
  in_total: boolean
}

export interface AiQuoteImportResult {
  readable: boolean
  unreadable_reason: string | null
  language: 'ko' | 'en' | 'other'
  currency: string | null
  header: {
    event_name: string | null
    client: string | null
    date_range: string | null
    venue: string | null
    quoted_at: string | null
    total_amount: number | null
    vat_mode: 'included' | 'excluded' | 'unknown'
  }
  sections: { name: string; subtotal: number | null; items: AiQuoteImportItem[] }[]
  totals: {
    items_sum: number | null
    agency_fee: number | null
    agency_fee_rate: number | null
    rounding: number | null
    vat: number | null
    grand_total: number | null
  }
}

const MAX_SECTIONS = 60
const MAX_ITEMS = 600
/** 금액 자릿수 상한(1조) — 자릿수를 잘못 읽은 값 걸러내기(외화도 같은 상한) */
const MAX_AMOUNT = 1_000_000_000_000

export class AiQuoteImportShapeError extends Error {}

function fail(path: string, what: string): never {
  throw new AiQuoteImportShapeError(`${path}: ${what}`)
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

function amount(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(path, '정수 금액이 아닙니다')
  if (Math.abs(v) >= MAX_AMOUNT) fail(path, '금액 자릿수가 너무 큽니다')
  return v
}

function optAmount(v: unknown, path: string): number | null {
  return v === null || v === undefined ? null : amount(v, path)
}

function optNum(v: unknown, path: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '숫자가 아닙니다')
  return v
}

const CURRENCY_RE = /^[A-Z]{3}$/

/** Claude가 돌려준 JSON 검사 — 구조화 출력이 모양을 지켜도 값 범위·개수·통화 코드는 여기서 본다. 틀리면 AiQuoteImportShapeError */
export function validateAiQuoteImport(raw: unknown): AiQuoteImportResult {
  if (!raw || typeof raw !== 'object') fail('응답', '객체가 아닙니다')
  const r = raw as Record<string, unknown>
  if (typeof r.readable !== 'boolean') fail('readable', '참·거짓이 아닙니다')
  const language = r.language
  if (language !== 'ko' && language !== 'en' && language !== 'other') fail('language', '알 수 없는 값입니다')
  let currency = optStr(r.currency, 'currency', 8)
  if (currency !== null) {
    currency = currency.toUpperCase()
    if (!CURRENCY_RE.test(currency)) fail('currency', 'ISO 통화 코드가 아닙니다')
  }
  if (!r.header || typeof r.header !== 'object') fail('header', '객체가 아닙니다')
  const h = r.header as Record<string, unknown>
  const vatMode = h.vat_mode
  if (vatMode !== 'included' && vatMode !== 'excluded' && vatMode !== 'unknown') fail('header.vat_mode', '알 수 없는 값입니다')
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
      name: str(so.name, `sections[${i}].name`, 120) || '전체',
      subtotal: optAmount(so.subtotal, `sections[${i}].subtotal`),
      items: so.items.map((it, j) => {
        const p = `sections[${i}].items[${j}]`
        if (!it || typeof it !== 'object') fail(p, '객체가 아닙니다')
        const io = it as Record<string, unknown>
        if (typeof io.in_total !== 'boolean') fail(`${p}.in_total`, '참·거짓이 아닙니다')
        return {
          title: str(io.title, `${p}.title`, 200) || '(품명 없음)',
          spec: optStr(io.spec, `${p}.spec`, 300),
          unit_price: optAmount(io.unit_price, `${p}.unit_price`),
          qty: optNum(io.qty, `${p}.qty`),
          days: optNum(io.days, `${p}.days`),
          amount: amount(io.amount, `${p}.amount`),
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
    language,
    currency,
    header: {
      event_name: optStr(h.event_name, 'header.event_name', 200),
      client: optStr(h.client, 'header.client', 200),
      date_range: optStr(h.date_range, 'header.date_range', 200),
      venue: optStr(h.venue, 'header.venue', 200),
      quoted_at: optStr(h.quoted_at, 'header.quoted_at', 60),
      total_amount: optAmount(h.total_amount, 'header.total_amount'),
      vat_mode: vatMode,
    },
    sections,
    totals: {
      items_sum: optAmount(t.items_sum, 'totals.items_sum'),
      agency_fee: optAmount(t.agency_fee, 'totals.agency_fee'),
      agency_fee_rate: rate,
      rounding: optAmount(t.rounding, 'totals.rounding'),
      vat: optAmount(t.vat, 'totals.vat'),
      grand_total: optAmount(t.grand_total, 'totals.grand_total'),
    },
  }
}

// ── 파서 산출(ParsedQuoteDoc)과 같은 모양으로 ─────────────────────────────

export const QUOTE_IMPORT_AI_READ_WARNING = 'AI가 읽은 결과입니다 — 헤더·항목·금액을 원본과 한 줄씩 대조한 뒤 확정하세요.'
export const QUOTE_IMPORT_AI_NO_MANAGER_NOTE = 'AI는 사람 이름을 읽지 않습니다 — 담당자는 확인 큐에서 직접 입력하세요.'

/** mock(데모)에는 AI 서버가 없다 — 흉내 내지 않고 사실대로 */
export const QUOTE_IMPORT_AI_MOCK_MESSAGE =
  'PDF·사진 견적서는 실서버(로그인) 모드에서 AI가 읽습니다 — 지금은 엑셀(.xlsx) 견적서만 불러올 수 있습니다.'

const NOT_IN_TOTAL_NOTE = '총액 미포함'

/**
 * AI 결과 → 확인 큐 입력(ParsedQuoteDoc · format 'ai'). 검산(섹션 소계 · 항목 합계 · 대행료 · 부가세 · 총액 체인)은 **우리 코드가** 한다 —
 * 어긋나면 경고로 보이고 진행은 막지 않는다(§22.2-5). 적혀 있지 않은 합계는 검산하지 않는다(값을 지어내지 않는다).
 * 부가세 10% 검산은 원화(통화 표기 없음·KRW)에서만 — 외화 문서의 세율은 나라마다 달라 총액 체인만 본다.
 */
export function docFromAiQuoteImport(result: AiQuoteImportResult): ParsedQuoteDoc {
  const sections: ParsedQuoteSection[] = result.sections.map((s, i) => ({
    name: s.name,
    order: i + 1,
    subtotal: s.subtotal ?? undefined,
    items: s.items.map((it) => {
      const notes = [it.note, it.in_total ? null : NOT_IN_TOTAL_NOTE].filter(Boolean)
      return {
        title: it.title,
        spec: it.spec ?? undefined,
        unit_price: it.unit_price ?? undefined,
        qty: it.qty ?? undefined,
        days: it.days ?? undefined,
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

  const foreign = result.currency !== null && result.currency !== 'KRW'
  const unit = foreign ? ` ${result.currency}` : '원'
  const fmt = (n: number) => `${n.toLocaleString('ko-KR')}${unit}`
  const inTotalSum = (items: AiQuoteImportItem[]) => items.filter((it) => it.in_total).reduce((s, it) => s + it.amount, 0)
  const checks: ParsedQuoteCheck[] = []
  for (const s of result.sections) {
    if (s.subtotal === null) continue
    const actual = inTotalSum(s.items)
    checks.push({ name: `섹션 소계 — ${s.name}`, expected: s.subtotal, actual, ok: Math.abs(actual - s.subtotal) <= 1 })
  }
  const sectionSum = result.sections.reduce((sum, s) => sum + (s.subtotal ?? inTotalSum(s.items)), 0)
  const itemsSum = t.items_sum ?? sectionSum
  if (t.items_sum !== null) {
    checks.push({ name: '항목 합계 = Σ 섹션 소계', expected: t.items_sum, actual: sectionSum, ok: Math.abs(sectionSum - t.items_sum) <= 1 })
  }
  if (t.agency_fee !== null && t.agency_fee_rate !== null && itemsSum > 0) {
    const expected = Math.round(itemsSum * t.agency_fee_rate)
    const percent = t.agency_fee_rate * 100
    checks.push({
      name: `대행료 ${percent.toFixed(Number.isInteger(percent) ? 0 : 1)}%`,
      expected,
      actual: t.agency_fee,
      ok: Math.abs(t.agency_fee - expected) < (foreign ? 2 : 10_000),
    })
  }
  const preVat = itemsSum + (t.agency_fee ?? 0) + (t.rounding ?? 0)
  if (t.vat !== null && !foreign) {
    const expected = Math.round(preVat * 0.1)
    checks.push({ name: '부가세 10%', expected, actual: t.vat, ok: Math.abs(expected - t.vat) <= 2 })
  }
  if (t.grand_total !== null) {
    const chain = preVat + (t.vat ?? 0)
    checks.push({ name: '총액 체인 (항목합+대행료+절사+부가세)', expected: t.grand_total, actual: chain, ok: Math.abs(chain - t.grand_total) <= 2 })
  }

  const warnings = [QUOTE_IMPORT_AI_READ_WARNING]
  if (foreign) {
    warnings.push(`통화가 ${result.currency}로 표기돼 있습니다 — 금액은 적힌 숫자 그대로 읽었습니다(원화 환산 없음). 확인 큐와 견적 화면에서 확인하세요.`)
  }
  for (const c of checks) {
    if (!c.ok) warnings.push(`'${c.name}'이(가) 맞지 않습니다 — 문서 ${fmt(c.expected)} · 계산 ${fmt(c.actual)}. 빠지거나 잘못 읽은 줄이 있는지 보세요.`)
  }
  const excluded = result.sections.reduce((n, s) => n + s.items.filter((it) => !it.in_total).length, 0)
  if (excluded > 0) warnings.push(`'총액 미포함' 표기 항목 ${excluded}건은 섹션 합계 검산에서 제외했습니다.`)
  warnings.push(QUOTE_IMPORT_AI_NO_MANAGER_NOTE)
  const missing = (['event_name', 'client', 'date_range', 'venue', 'quoted_at'] as const).filter((k) => result.header[k] === null)
  if (missing.length) {
    const label: Record<(typeof missing)[number], string> = { event_name: '행사명', client: '고객명', date_range: '일시', venue: '장소', quoted_at: '견적일' }
    warnings.push(`인식하지 못한 헤더 항목: ${missing.map((k) => label[k]).join(', ')} — 확인 큐에서 입력하세요.`)
  }

  const header: ParsedQuoteHeader = { vat_mode: result.header.vat_mode }
  if (result.header.event_name) header.event_name = result.header.event_name
  if (result.header.client) header.client = result.header.client
  if (result.header.date_range) header.date_range = result.header.date_range
  if (result.header.venue) header.venue = result.header.venue
  if (result.header.quoted_at) header.quoted_at = result.header.quoted_at
  const total = result.header.total_amount ?? t.grand_total ?? undefined
  if (total !== undefined) header.total_amount = total
  if (foreign && result.currency) header.currency = result.currency

  return { format: 'ai', header, sections, totals, checks, warnings }
}
