// 16:9 장표형 운영계획서 조립 — 설계서 v2.13.2 §23.7 · 디자인지시서 §7-2.15 (Phase 3.24 PR-C).
// 순수 함수: PlanData(운영계획서 조립 데이터)만 읽어 장표 목록을 만든다. 새 입력 칸이 없다 — 앱에 이미 있는
// 표·숫자·목록만 싣는다(목표·성공 기준·확인 요청·계약 범위 대응표는 입력 칸이 생긴 뒤).
// 장표 한 장 = 1280×720 CSS px = 338.67mm×190.5mm(파워포인트 16:9와 같은 크기). 표·글은 칸 폭과 글자 수로
// 줄 수를 어림해 넘치기 전에 다음 장으로 넘긴다(실브라우저 넘침 검사 = demo:smoke ③).
// 금액·개인 연락처는 어떤 장에도 없다(#RULE-NO-PRICE-TO-CLIENT · R-O6 — PlanData에 애초에 없다).
import { estimateRegistration, GUIDE_KIND_META, staffingTotal } from '../../../lib/guideStructured'
import { AREA_LABELS, ddayLabel, formatDateWeekday, STATUS_LABELS } from '../../../lib/labels'
import type {
  GuideChecklistsData,
  GuideDayplanRow,
  GuideMark,
  GuideSection,
  GuideSectionData,
  OverviewItem,
} from '../../../types/entities'
import type { GuideSectionKind } from '../../../types/enums'
import type { PlanData } from '../../../types/views'
import { summaryLine } from '../../cue/cueFormValues'

// ── 장표 치수 — 컴포넌트와 쪽 나누기가 같은 값을 쓴다 ─────────────────────────

export const DECK_SIZE = {
  /** CSS px — 인쇄 338.67mm(= 13.333in) */
  width: 1280,
  /** CSS px — 인쇄 190.5mm(= 7.5in) */
  height: 720,
  padX: 64,
  /** 본문 폭 = width − padX × 2 */
  bodyWidth: 1152,
  /** 본문 높이 예산 — 720 − 헤어라인 4 − 머리 줄 52 − 제목 76 − 꼬리 줄 48 − 아래 여백 16 = 524에서 20을 남긴 값 */
  bodyBudget: 504,
} as const

/** 표 — 머리 줄 36 + 굵은 선 2 · 행 = 위아래 7.5 + 줄 20 + 선 1 */
const TABLE = { font: 13, head: 38, rowPad: 16, line: 20, cellPad: 24 } as const
const FLOW = { font: 15, line: 25, heading: 36, indent: 22, gap: 4 } as const
const NOTE = { line: 22, gap: 14 } as const
/** 행사 개요 사실 칸 값 폭 — (본문 폭 − 가운데 48) ÷ 2 − 이름 칸 96 − 사이 24 */
export const FACT_VALUE_WIDTH = (DECK_SIZE.bodyWidth - 48) / 2 - 96 - 24

// ── 장 ───────────────────────────────────────────────────────────────

export type DeckChapterKey = 'summary' | 'overview' | 'production' | 'space' | 'program' | 'people' | 'org' | 'safety'

export const DECK_CHAPTER_ORDER: readonly DeckChapterKey[] = [
  'summary',
  'overview',
  'production',
  'space',
  'program',
  'people',
  'org',
  'safety',
]

export const DECK_CHAPTERS: Record<DeckChapterKey, { number: string | null; title: string; empty: string }> = {
  summary: { number: null, title: '운영 요약', empty: '' },
  overview: { number: '01', title: '행사 개요', empty: '행사 설정의 개요를 채우면 이 장이 만들어집니다.' },
  production: { number: '02', title: '제작물', empty: '디자인 보드에 제작물을 등록하면 규격·수량·상태 표가 들어옵니다.' },
  space: {
    number: '03',
    title: '공간 · 설치',
    empty: "운영가이드의 '설치·철거 일정'·'존별 운영'을 채우거나 존운영 항목을 쓰면 이 장이 만들어집니다.",
  },
  program: {
    number: '04',
    title: '프로그램',
    empty: "프로그램표·큐시트·운영가이드의 'D-day 진행표'를 채우면 이 장이 만들어집니다.",
  },
  people: {
    number: '05',
    title: '참가자',
    empty: "등록 명단이나 운영가이드의 '등록 운영'·'VIP 의전'을 채우면 이 장이 만들어집니다.",
  },
  org: {
    number: '06',
    title: '조직 · 인력',
    empty: "운영가이드의 '현장 인력·콜타임'·'무전·지휘 체계'·'역할 분담'이나 일정 마일스톤을 채우면 이 장이 만들어집니다.",
  },
  safety: {
    number: '07',
    title: '안전 · 비상',
    empty: "운영가이드의 '안전관리'·'비상 대응'을 채우면 이 장이 만들어집니다.",
  },
}

// ── 장표 종류 ─────────────────────────────────────────────────────────

export interface DeckColumn {
  label: string
  /** 본문 폭에 대한 비율(합 1) */
  width: number
  align?: 'left' | 'center' | 'right'
  /** 짧은 식별 칸 — 한 줄 고정 */
  nowrap?: boolean
  /** ●/○/— 표시 칸 — 기호마다 색 */
  mark?: boolean
  /** 첫 칸처럼 굵게 읽을 칸 */
  strong?: boolean
}

export type DeckTableRow = { band: string } | { cells: string[] }

export interface DeckTile {
  label: string
  value: string
  sub: string
  /** 값이 없음(—) — 흐리게 */
  empty?: boolean
}

export type DeckFlowItem = { type: 'h'; text: string } | { type: 'li'; text: string } | { type: 'p'; text: string }

export interface DeckChecklistCard {
  title: string
  span: string
  style: 'check' | 'timeline'
  items: { at: string; text: string }[]
  /** 한 구간이 길어 나눠 실린 뒷부분 */
  continued: boolean
}

export interface DeckTocEntry {
  chapter: DeckChapterKey
  number: string | null
  title: string
  /** 1부터 — 이 장의 첫 장표 번호 */
  slideNo: number
  /** 이 장에 실린 장표 제목(나눠 실린 장표는 한 번만) */
  items: string[]
  empty: boolean
}

/** 장표에 싣지 못한 것 — 화면 도구 줄에만 보인다(인쇄 제외). 추측으로 채우지 않고 어디서 채우는지 알린다 */
export interface DeckGap {
  chapter: DeckChapterKey
  label: string
  where: string
}

interface SlideCommon {
  id: string
  chapter: DeckChapterKey | null
  title: string
  /** 한 표가 여러 장에 나뉘면 { index: 2, total: 3 } */
  part: { index: number; total: number } | null
  /** 제목 옆 보조 한 줄(항목 이름·합계 등) */
  subtitle: string | null
}

export type DeckSlide =
  | (SlideCommon & { kind: 'cover' })
  | (SlideCommon & { kind: 'toc'; entries: DeckTocEntry[] })
  | (SlideCommon & { kind: 'summary'; tiles: DeckTile[]; line: string | null })
  | (SlideCommon & { kind: 'facts'; facts: { label: string; value: string }[]; items: OverviewItem[] })
  | (SlideCommon & {
      kind: 'table'
      columns: DeckColumn[]
      rows: DeckTableRow[]
      /** 표 아래 한 줄씩 — 마지막 장에만 */
      notes: string[]
      /** 표 아래 화살표 흐름 — 마지막 장에만 */
      chain: string[]
      /** 표 위 오른쪽 범례 */
      legend: string | null
      /** 비상 대응 표 — 경고 색 머리 */
      tone: 'default' | 'emergency'
    })
  | (SlideCommon & { kind: 'flow'; items: DeckFlowItem[]; tone: 'default' | 'emergency' })
  | (SlideCommon & { kind: 'registration'; stats: DeckTile[]; capacity: DeckTile[]; notes: string[]; caption: string | null })
  | (SlideCommon & { kind: 'checklists'; cards: DeckChecklistCard[] })
  | (SlideCommon & { kind: 'empty'; message: string })

export interface PlanDeck {
  slides: DeckSlide[]
  gaps: DeckGap[]
}

// ── 글 폭 어림 ────────────────────────────────────────────────────────

const WIDE = /[ᄀ-ᇿ　-〿㄰-㆏㐀-鿿가-힯＀-￯]/

/** 글 폭(px) 어림 — 한글·전각 1em, 숫자·영문 0.6em, 공백 0.3em, 기호 0.45em */
export function textWidth(text: string, fontPx: number): number {
  let em = 0
  for (const ch of text) {
    if (WIDE.test(ch)) em += 1
    else if (ch === ' ') em += 0.3
    else if (/[0-9A-Za-z]/.test(ch)) em += 0.6
    else em += 0.45
  }
  return em * fontPx
}

/** 칸 폭(px) 안에서 몇 줄이 되는지 — 줄바꿈 문자는 새 줄 */
export function lineCount(text: string, widthPx: number, fontPx: number): number {
  const usable = Math.max(40, widthPx)
  return text
    .split('\n')
    .reduce((sum, part) => sum + Math.max(1, Math.ceil(textWidth(part, fontPx) / usable)), 0)
}

function rowHeight(row: DeckTableRow, columns: DeckColumn[]): number {
  if ('band' in row) return TABLE.line + TABLE.rowPad
  const lines = row.cells.reduce((max, cell, i) => {
    const col = columns[i]
    if (!col) return max
    if (col.nowrap) return Math.max(max, 1)
    return Math.max(max, lineCount(cell || '—', col.width * DECK_SIZE.bodyWidth - TABLE.cellPad, TABLE.font))
  }, 1)
  return TABLE.rowPad + TABLE.line * lines
}

function notesHeight(notes: string[], chain: string[]): number {
  let h = 0
  if (notes.length) h += NOTE.gap + notes.reduce((s, n) => s + NOTE.line * lineCount(n, DECK_SIZE.bodyWidth, 13), 0)
  if (chain.length) h += NOTE.gap + 40
  return h
}

/**
 * 쪽 나누기 공통 — 앞에서부터 채우되 ① 묶음 머리(표의 구분 줄·글의 소제목)는 다음 줄과 같은 장에 ② 마지막 줄은
 * 표 아래 메모와 같은 장에 ③ 새 장이 묶음 한가운데서 시작하면 그 묶음 머리를 '(이어서)'로 다시 싣는다.
 * 여러 장이 되면 장마다 높이를 고르게 다시 나눈다(한두 줄만 다음 장에 남지 않게 — 장 수는 늘리지 않는다).
 */
function paginate<T>(
  items: T[],
  opts: {
    height: (t: T) => number
    isHead: (t: T) => boolean
    continuation: (head: T) => T
    /** 장마다 먼저 차지하는 높이(표 머리 줄) */
    start: number
    budget: number
    /** 마지막 장 아래에 남길 자리(메모·지휘 흐름) */
    reserveLast: number
  },
): T[][] {
  const run = (budget: number): T[][] => {
    const pages: T[][] = []
    let page: T[] = []
    let used = opts.start
    let head: T | null = null
    items.forEach((item, i) => {
      const h = opts.height(item)
      const next = items[i + 1]
      let need = h
      if (opts.isHead(item) && next !== undefined) need += opts.height(next)
      if (next === undefined) need += opts.reserveLast
      if (page.length > 0 && used + need > budget) {
        pages.push(page)
        page = []
        used = opts.start
        if (head !== null && !opts.isHead(item)) {
          const cont = opts.continuation(head)
          page.push(cont)
          used += opts.height(cont)
        }
      }
      page.push(item)
      used += h
      if (opts.isHead(item)) head = item
    })
    if (page.length > 0 || pages.length === 0) pages.push(page)
    return pages
  }
  const greedy = run(opts.budget)
  if (greedy.length < 2) return greedy
  const total = items.reduce((sum, t) => sum + opts.height(t), 0) + opts.reserveLast
  const tallest = Math.max(...items.map(opts.height))
  const even = Math.min(opts.budget, opts.start + Math.ceil(total / greedy.length) + tallest)
  const balanced = run(even)
  return balanced.length <= greedy.length ? balanced : greedy
}

/** 표 쪽 나누기 — 머리 줄은 장마다 반복(컴포넌트), 구분 줄(band)은 다음 행과 함께, 마지막 행은 메모와 함께 */
export function paginateTable(
  rows: DeckTableRow[],
  columns: DeckColumn[],
  reserveLast = 0,
  budget: number = DECK_SIZE.bodyBudget,
): DeckTableRow[][] {
  return paginate(rows, {
    height: (r) => rowHeight(r, columns),
    isHead: (r) => 'band' in r,
    continuation: (r) => ({ band: `${(r as { band: string }).band.replace(/ \(이어서\)$/, '')} (이어서)` }),
    start: TABLE.head,
    budget,
    reserveLast,
  })
}

function flowHeight(item: DeckFlowItem): number {
  if (item.type === 'h') return FLOW.heading
  const width = DECK_SIZE.bodyWidth - (item.type === 'li' ? FLOW.indent : 0)
  return FLOW.line * lineCount(item.text, width, FLOW.font) + FLOW.gap
}

/** 글 쪽 나누기 — 소제목은 다음 줄과 함께, 소제목 한가운데서 넘어가면 '(이어서)' 소제목 */
export function paginateFlow(items: DeckFlowItem[], budget: number = DECK_SIZE.bodyBudget): DeckFlowItem[][] {
  const pages = paginate(items, {
    height: flowHeight,
    isHead: (t) => t.type === 'h',
    continuation: (t): DeckFlowItem => ({ type: 'h', text: `${t.text.replace(/ \(이어서\)$/, '')} (이어서)` }),
    start: 0,
    budget,
    reserveLast: 0,
  })
  return pages.filter((p) => p.length > 0)
}

/** 초경량 마크다운(### · -)을 장표 글 줄로 — S9 renderLiteMarkdown과 같은 규칙 */
export function flowFromMarkdown(source: string): DeckFlowItem[] {
  const items: DeckFlowItem[] = []
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('### ')) items.push({ type: 'h', text: line.slice(4) })
    else if (line.startsWith('- ')) items.push({ type: 'li', text: line.slice(2) })
    else items.push({ type: 'p', text: line })
  }
  return items
}

// ── 조립 도우미 ───────────────────────────────────────────────────────

let seq = 0
function slideId(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}`
}

function tableSlides(input: {
  chapter: DeckChapterKey
  title: string
  subtitle?: string | null
  columns: DeckColumn[]
  rows: DeckTableRow[]
  notes?: string[]
  chain?: string[]
  legend?: string | null
  tone?: 'default' | 'emergency'
}): DeckSlide[] {
  const notes = (input.notes ?? []).map((n) => n.trim()).filter(Boolean)
  const chain = (input.chain ?? []).map((n) => n.trim()).filter(Boolean)
  const pages = paginateTable(input.rows, input.columns, notesHeight(notes, chain))
  return pages.map((rows, i) => ({
    kind: 'table' as const,
    id: slideId(input.chapter),
    chapter: input.chapter,
    title: input.title,
    subtitle: input.subtitle ?? null,
    part: pages.length > 1 ? { index: i + 1, total: pages.length } : null,
    columns: input.columns,
    rows,
    notes: i === pages.length - 1 ? notes : [],
    chain: i === pages.length - 1 ? chain : [],
    legend: input.legend ?? null,
    tone: input.tone ?? 'default',
  }))
}

function flowSlides(chapter: DeckChapterKey, title: string, items: DeckFlowItem[], tone: 'default' | 'emergency' = 'default', subtitle: string | null = null): DeckSlide[] {
  const pages = paginateFlow(items)
  return pages.map((page, i) => ({
    kind: 'flow' as const,
    id: slideId(chapter),
    chapter,
    title,
    subtitle,
    part: pages.length > 1 ? { index: i + 1, total: pages.length } : null,
    items: page,
    tone,
  }))
}

const txt = (v: string | number | null | undefined): string => (v == null ? '' : String(v).trim())
const orDash = (v: string | number | null | undefined): string => txt(v) || '—'

function guideSection(plan: PlanData, kind: GuideSectionKind): GuideSection | null {
  return plan.guide?.sections.find((s) => s.kind === kind) ?? null
}

/** 표 데이터가 있고 줄이 하나라도 채워진 섹션만 싣는다(빈 뼈대는 장표에 싣지 않는다) */
function guideData<K extends GuideSectionData['type']>(
  plan: PlanData,
  kind: K,
): Extract<GuideSectionData, { type: K }> | null {
  const s = guideSection(plan, kind)
  const d = s?.data
  return d && d.type === kind ? (d as Extract<GuideSectionData, { type: K }>) : null
}

function filled(values: Array<string | number | null | undefined>): boolean {
  return values.some((v) => txt(v) !== '')
}

const MARK_SYMBOL: Record<GuideMark, string> = { main: '●', help: '○', none: '—' }

// ── 장마다 ─────────────────────────────────────────────────────────────

interface ChapterResult {
  slides: DeckSlide[]
  gaps: DeckGap[]
}

function summaryChapter(plan: PlanData, today: Date): DeckSlide {
  const p = plan.project
  const sessions = plan.program_sessions
  const starts = sessions.map((s) => s.start_time).filter((t): t is string => !!t).sort()
  const ends = sessions.map((s) => s.end_time ?? s.start_time).filter((t): t is string => !!t).sort()
  const staffing = guideData(plan, 'staffing')
  const radio = guideData(plan, 'radio')
  const staffTotal = staffing ? staffingTotal(staffing) : 0
  const items = plan.production_items
  const finals = items.filter((d) => d.status === 'final').length
  const specs = items.filter((d) => d.spec_size && d.spec_qty != null && d.spec_location && d.spec_type).length
  const stats = plan.registration_stats
  const guarantee = p.guarantee_pax != null && p.guarantee_pax > 0 ? p.guarantee_pax : null

  const timeRange = p.start_time && p.end_time ? `${p.start_time}–${p.end_time}` : p.start_time ?? ''
  const tiles: DeckTile[] = [
    p.event_date
      ? { label: '행사일', value: ddayLabel(p.event_date, today), sub: [formatDateWeekday(p.event_date), timeRange].filter(Boolean).join(' · ') }
      : { label: '행사일', value: '—', sub: '행사일 미입력', empty: true },
    p.expected_headcount != null
      ? {
          label: '예상 인원',
          value: `${p.expected_headcount.toLocaleString('ko-KR')}명`,
          sub: guarantee ? `보장 인원 ${guarantee.toLocaleString('ko-KR')}명` : txt(p.seating) || '좌석 형태 미입력',
        }
      : { label: '예상 인원', value: '—', sub: '예상 인원 미입력', empty: true },
    sessions.length > 0
      ? {
          label: '프로그램',
          value: `세션 ${sessions.length}개`,
          sub: starts.length ? `${starts[0]}–${ends[ends.length - 1] ?? starts[starts.length - 1]}` : '시각 미입력',
        }
      : { label: '프로그램', value: '—', sub: '프로그램표 미입력', empty: true },
    staffing && staffTotal > 0
      ? {
          label: '현장 인력',
          value: `${staffTotal}명`,
          sub: [`역할 ${staffing.rows.filter((r) => txt(r.role)).length}개`, radio ? `무전 ${radio.channels.filter((c) => txt(c.code) || txt(c.name)).length}채널` : '']
            .filter(Boolean)
            .join(' · '),
        }
      : { label: '현장 인력', value: '—', sub: '운영가이드 인력 미입력', empty: true },
    items.length > 0
      ? { label: '제작물', value: `확정 ${finals}/${items.length}`, sub: `규격 입력 ${specs}/${items.length}` }
      : { label: '제작물', value: '—', sub: '제작물 미등록', empty: true },
    {
      label: '등록',
      value: `${stats.attendee_total.toLocaleString('ko-KR')}명`,
      sub: guarantee
        ? `보장 대비 ${Math.round((stats.attendee_total / guarantee) * 1000) / 10}% · 체크인 ${stats.checked_in}명`
        : `RSVP ${stats.rsvp_total}건 · 체크인 ${stats.checked_in}명`,
      empty: stats.attendee_total === 0 && stats.rsvp_total === 0,
    },
  ]
  const line = [p.name, p.venue, p.organizer && `주최·주관 ${p.organizer}`].filter(Boolean).join(' · ') || null
  return { kind: 'summary', id: slideId('summary'), chapter: 'summary', title: '운영 요약', subtitle: null, part: null, tiles, line }
}

function overviewChapter(plan: PlanData): ChapterResult {
  const p = plan.project
  const date = p.event_date
    ? p.event_end_date && p.event_end_date !== p.event_date
      ? `${formatDateWeekday(p.event_date)} ~ ${formatDateWeekday(p.event_end_date)}`
      : formatDateWeekday(p.event_date)
    : ''
  const time = p.start_time && p.end_time ? `${p.start_time} ~ ${p.end_time}` : txt(p.start_time ?? p.end_time)
  const facts = [
    { label: '행사명', value: p.name },
    { label: '일자', value: date },
    { label: '시간', value: time },
    { label: '장소', value: txt(p.venue) },
    { label: '예상 인원', value: p.expected_headcount != null ? `${p.expected_headcount.toLocaleString('ko-KR')}명` : '' },
    { label: '좌석 형태', value: txt(p.seating) },
    { label: '주제', value: txt(p.theme) },
    { label: '주최 · 주관', value: txt(p.organizer) },
    { label: '사회', value: txt(p.mc_name) },
    { label: '참가 대상', value: txt(p.target_audience) },
  ].filter((f) => f.value)
  const items = (p.overview_items ?? []).filter((it) => txt(it.label) || txt(it.value))

  // 사실 칸(2열)이 차지하는 높이를 빼고 남는 자리에 개요 항목을 싣는다 — 넘치면 이어지는 글 장표로.
  // 한 줄 = 56px, 값이 길면 줄마다 24px 더(칸 폭 = 반 폭 − 이름 칸)
  const factRow = (f: { value: string }) => Math.max(56, 16 + 24 * lineCount(f.value, FACT_VALUE_WIDTH, 17))
  let factsHeight = 24
  for (let i = 0; i < facts.length; i += 2) factsHeight += Math.max(factRow(facts[i]), facts[i + 1] ? factRow(facts[i + 1]) : 0)
  const flow: DeckFlowItem[] = items.map((it) => ({ type: 'li', text: `${txt(it.label)} — ${txt(it.value)}` }))
  const firstPages = paginateFlow(flow, DECK_SIZE.bodyBudget - factsHeight)
  const firstItems = firstPages[0] ?? []
  const rest = flow.slice(firstItems.length)
  const slides: DeckSlide[] = [
    {
      kind: 'facts',
      id: slideId('overview'),
      chapter: 'overview',
      title: '행사 개요',
      subtitle: null,
      part: null,
      facts,
      items: items.slice(0, firstItems.length),
    },
  ]
  if (rest.length) slides.push(...flowSlides('overview', '행사 개요', rest, 'default', '이어서'))
  const gaps: DeckGap[] = items.length === 0 ? [{ chapter: 'overview', label: '개요 항목', where: '행사 설정 · 개요' }] : []
  return { slides, gaps }
}

function productionChapter(plan: PlanData): ChapterResult {
  const items = plan.production_items
  if (items.length === 0) {
    return { slides: [], gaps: [{ chapter: 'production', label: '제작물 리스트', where: '디자인 보드' }] }
  }
  const finals = items.filter((d) => d.status === 'final').length
  return {
    slides: tableSlides({
      chapter: 'production',
      title: '제작물 리스트',
      subtitle: `${items.length}종 · 확정 ${finals}`,
      columns: [
        { label: '카테고리', width: 0.11, nowrap: true },
        { label: '품명', width: 0.22, strong: true },
        { label: '규격', width: 0.16 },
        { label: '수량', width: 0.07, align: 'right', nowrap: true },
        { label: '위치', width: 0.17 },
        { label: '종류', width: 0.11 },
        { label: '시안', width: 0.07, nowrap: true },
        { label: '상태', width: 0.09, nowrap: true },
      ],
      rows: items.map((d) => ({
        cells: [
          d.category,
          d.title,
          orDash(d.spec_size),
          d.spec_qty != null ? String(d.spec_qty) : '—',
          orDash(d.spec_location),
          orDash(d.spec_type),
          d.latest_version ? `v${d.latest_version.version_no}` : '—',
          STATUS_LABELS[d.status],
        ],
      })),
    }),
    gaps: [],
  }
}

function spaceChapter(plan: PlanData): ChapterResult {
  const slides: DeckSlide[] = []
  const gaps: DeckGap[] = []

  const setup = guideData(plan, 'setup')
  const setupRows = setup ? setup.rows.filter((r) => filled([r.task, r.time, r.place, r.owner])) : []
  if (setup && (setupRows.length || setup.notes.some((n) => txt(n)))) {
    slides.push(
      ...tableSlides({
        chapter: 'space',
        title: GUIDE_KIND_META.setup.title,
        columns: [
          { label: '날짜', width: 0.12, nowrap: true },
          { label: '시각', width: 0.14, nowrap: true },
          { label: '작업', width: 0.34, strong: true },
          { label: '장소', width: 0.2 },
          { label: '담당', width: 0.2 },
        ],
        rows: setupRows.map((r) => ({ cells: [orDash(r.date), orDash(r.time), orDash(r.task), orDash(r.place), orDash(r.owner)] })),
        notes: setup.notes.map((n) => `시설 규정 · ${n}`),
      }),
    )
  } else {
    gaps.push({ chapter: 'space', label: GUIDE_KIND_META.setup.title, where: '운영가이드' })
  }

  // 존별 운영 — 운영가이드 존 섹션이 있으면 그것만(S9 04와 같은 규칙), 없으면 존운영 항목 본문
  const zoneContent = plan.guide_zone?.content?.trim()
  if (zoneContent) {
    slides.push(...flowSlides('space', GUIDE_KIND_META.zone.title, flowFromMarkdown(zoneContent)))
  } else {
    const written = plan.zones.filter((z) => z.content?.trim())
    if (written.length) {
      const flow: DeckFlowItem[] = []
      for (const z of written) {
        flow.push({ type: 'h', text: `${z.title} · ${z.category}` })
        flow.push(...flowFromMarkdown(z.content as string))
      }
      slides.push(...flowSlides('space', GUIDE_KIND_META.zone.title, flow))
    } else {
      gaps.push({ chapter: 'space', label: GUIDE_KIND_META.zone.title, where: '운영 보드 · 존운영 항목 또는 운영가이드' })
    }
  }
  return { slides, gaps }
}

const DAYPLAN_BANDS: Record<GuideDayplanRow['group'], string> = { pre: '사전 준비', main: '본행사', post: '마무리' }

/** 구간 카드 — 한 장에 3열, 줄(행)이 예산 안에 들면 두 줄까지. 항목 한 줄 22px · 카드 머리 30 · 안쪽 여백 32 */
const CHECK = { line: 22, font: 13, head: 30, pad: 32, gap: 16, checkWidth: 300, timelineWidth: 240 } as const

function cardHeight(card: DeckChecklistCard): number {
  const width = card.style === 'check' ? CHECK.checkWidth : CHECK.timelineWidth
  const body = card.items.length === 0 ? CHECK.line : card.items.reduce((s, it) => s + CHECK.line * lineCount(it.text, width, CHECK.font), 0)
  return CHECK.pad + CHECK.head + body
}

function checklistSlides(data: GuideChecklistsData): DeckSlide[] {
  const itemBudget = DECK_SIZE.bodyBudget - CHECK.pad - CHECK.head
  const cards: DeckChecklistCard[] = []
  for (const b of data.blocks) {
    const items = b.items.filter((it) => txt(it.text)).map((it) => ({ at: txt(it.at), text: txt(it.text) }))
    if (!txt(b.title) && items.length === 0) continue
    const width = b.style === 'check' ? CHECK.checkWidth : CHECK.timelineWidth
    let chunk: typeof items = []
    let used = 0
    let continued = false
    const flush = () => {
      cards.push({ title: txt(b.title) || '구간', span: txt(b.span), style: b.style, items: chunk, continued })
      continued = true
      chunk = []
      used = 0
    }
    for (const it of items) {
      const h = CHECK.line * lineCount(it.text, width, CHECK.font)
      if (chunk.length > 0 && used + h > itemBudget) flush()
      chunk.push(it)
      used += h
    }
    flush()
  }
  // 3장씩 한 줄 — 줄 높이 = 그 줄에서 가장 긴 카드. 줄을 예산 안에서 쌓는다
  const pages: DeckChecklistCard[][] = []
  let page: DeckChecklistCard[] = []
  let used = 0
  for (let i = 0; i < cards.length; i += 3) {
    const row = cards.slice(i, i + 3)
    const h = Math.max(...row.map(cardHeight))
    const need = page.length ? h + CHECK.gap : h
    if (page.length && used + need > DECK_SIZE.bodyBudget) {
      pages.push(page)
      page = []
      used = 0
    }
    used += page.length ? h + CHECK.gap : h
    page.push(...row)
  }
  if (page.length) pages.push(page)
  return pages.map((page, i) => ({
    kind: 'checklists' as const,
    id: slideId('program'),
    chapter: 'program' as const,
    title: GUIDE_KIND_META.checklists.title,
    subtitle: null,
    part: pages.length > 1 ? { index: i + 1, total: pages.length } : null,
    cards: page,
  }))
}

function programChapter(plan: PlanData): ChapterResult {
  const slides: DeckSlide[] = []
  const gaps: DeckGap[] = []

  const sessions = plan.program_sessions
  if (sessions.length) {
    slides.push(
      ...tableSlides({
        chapter: 'program',
        title: '프로그램표',
        subtitle: `세션 ${sessions.length}개`,
        columns: [
          { label: '시각', width: 0.14, nowrap: true },
          { label: '구분', width: 0.13 },
          { label: '세션', width: 0.33, strong: true },
          { label: '연사', width: 0.26 },
          { label: '비고', width: 0.14 },
        ],
        rows: sessions.map((s) => ({
          cells: [
            s.start_time ? `${s.start_time}${s.end_time ? `–${s.end_time}` : ''}` : '—',
            [txt(s.section), txt(s.track)].filter(Boolean).join(' · ') || '—',
            s.title,
            [txt(s.speaker_name), txt(s.speaker_title), txt(s.speaker_org)].filter(Boolean).join(' · ') || '—',
            orDash(s.note),
          ],
        })),
      }),
    )
  } else {
    gaps.push({ chapter: 'program', label: '프로그램표', where: '운영계획서 02 프로그램' })
  }

  const dayplan = guideData(plan, 'dayplan')
  const dayRows = dayplan ? dayplan.rows.filter((r) => filled([r.time, r.segment, r.content, r.av, r.owner])) : []
  if (dayRows.length) {
    const rows: DeckTableRow[] = []
    for (const g of ['pre', 'main', 'post'] as const) {
      const inGroup = dayRows.filter((r) => r.group === g)
      if (!inGroup.length) continue
      rows.push({ band: DAYPLAN_BANDS[g] })
      rows.push(...inGroup.map((r) => ({ cells: [orDash(r.time), orDash(r.segment), orDash(r.content), orDash(r.av), orDash(r.owner)] })))
    }
    slides.push(
      ...tableSlides({
        chapter: 'program',
        title: GUIDE_KIND_META.dayplan.title,
        columns: [
          { label: '시각', width: 0.13, nowrap: true },
          { label: '구간', width: 0.17, strong: true },
          { label: '내용', width: 0.36 },
          { label: '무대 · AV', width: 0.18 },
          { label: '담당', width: 0.16 },
        ],
        rows,
      }),
    )
  } else {
    gaps.push({ chapter: 'program', label: GUIDE_KIND_META.dayplan.title, where: '운영가이드' })
  }

  const checklists = guideData(plan, 'checklists')
  const checkSlides = checklists ? checklistSlides(checklists) : []
  if (checkSlides.length) slides.push(...checkSlides)
  else gaps.push({ chapter: 'program', label: GUIDE_KIND_META.checklists.title, where: '운영가이드' })

  const cues = plan.cuesheet?.cues ?? []
  if (plan.cuesheet && cues.length) {
    slides.push(
      ...tableSlides({
        chapter: 'program',
        title: '큐시트',
        subtitle: `${plan.cuesheet.title} · 큐 ${cues.length}개`,
        columns: [
          { label: '시각', width: 0.08, nowrap: true },
          { label: '큐', width: 0.07, nowrap: true, strong: true },
          { label: '구분', width: 0.12 },
          { label: 'MC · 진행', width: 0.3 },
          { label: '조명', width: 0.143 },
          { label: '영상', width: 0.143 },
          { label: '음향', width: 0.144 },
        ],
        rows: cues.map((c) => ({
          cells: [
            orDash(c.time_at),
            orDash(c.cue_no),
            orDash(c.segment),
            summaryLine(c.body),
            orDash(c.console_light),
            orDash(c.console_screen),
            orDash(c.console_audio),
          ],
        })),
      }),
    )
  } else {
    gaps.push({ chapter: 'program', label: '큐시트', where: '운영 보드 · 큐시트' })
  }
  return { slides, gaps }
}

function peopleChapter(plan: PlanData): ChapterResult {
  const slides: DeckSlide[] = []
  const gaps: DeckGap[] = []
  const stats = plan.registration_stats
  const guarantee = plan.project.guarantee_pax != null && plan.project.guarantee_pax > 0 ? plan.project.guarantee_pax : null
  const reg = guideData(plan, 'registration')
  const est = reg ? estimateRegistration(reg) : null
  const hasStats = stats.rsvp_total + stats.attendee_total > 0
  const hasCapacity = !!(reg && (est?.perMinute != null || reg.notes.some((n) => txt(n))))

  if (hasStats || hasCapacity) {
    const statTiles: DeckTile[] = hasStats
      ? [
          {
            label: '응답률',
            value: `${Math.round(stats.response_rate * 100)}%`,
            sub: `발송 ${stats.rsvp_sent}건 중 ${stats.rsvp_accepted + stats.rsvp_declined}건 응답`,
          },
          {
            label: '등록수',
            value: `${stats.attendee_total.toLocaleString('ko-KR')}명`,
            sub: guarantee
              ? `보장 인원 ${guarantee}명 대비 ${Math.round((stats.attendee_total / guarantee) * 1000) / 10}%`
              : `RSVP 전체 ${stats.rsvp_total}건`,
          },
          {
            label: '체크인율',
            value: `${Math.round(stats.checkin_rate * 100)}%`,
            sub: `체크인 ${stats.checked_in} / ${stats.attendee_total}`,
          },
        ]
      : []
    const capacity: DeckTile[] =
      reg && est
        ? [
            { label: '접수 라인', value: reg.lines != null ? `${reg.lines}개` : '—', sub: reg.seconds_per_person != null ? `1인 처리 ${reg.seconds_per_person}초` : '1인 처리 시간 미입력', empty: reg.lines == null },
            { label: '분당 처리', value: est.perMinute != null ? `${est.perMinute}명` : '—', sub: '라인 × 60 ÷ 1인 처리 초', empty: est.perMinute == null },
            {
              label: '피크 대기',
              value: est.waitMinutes != null ? `약 ${est.waitMinutes}분` : '—',
              sub:
                est.queue != null
                  ? `피크 ${reg.peak_minutes}분 도착 ${reg.peak_arrivals}명 · 쌓이는 줄 ${est.queue}명`
                  : '피크 구간·도착 인원 미입력',
              empty: est.waitMinutes == null,
            },
          ]
        : []
    slides.push({
      kind: 'registration',
      id: slideId('people'),
      chapter: 'people',
      title: '등록 운영',
      subtitle: null,
      part: null,
      stats: statTiles,
      capacity,
      notes: reg ? reg.notes.map(txt).filter(Boolean) : [],
      caption: plan.sheet_snapshot_at ? '등록수·체크인은 시트 기준 스냅숏(응답률은 RSVP 기준)' : null,
    })
  } else {
    gaps.push({ chapter: 'people', label: '등록 통계 · 등록 운영', where: '등록 보드 · 운영가이드' })
  }
  if (!hasCapacity) gaps.push({ chapter: 'people', label: GUIDE_KIND_META.registration.title, where: '운영가이드' })

  const vip = guideData(plan, 'vip')
  const vipRows = vip ? vip.rows.filter((r) => filled([r.target, r.arrival, r.route, r.seat, r.owner])) : []
  if (vipRows.length) {
    slides.push(
      ...tableSlides({
        chapter: 'people',
        title: GUIDE_KIND_META.vip.title,
        columns: [
          { label: '대상', width: 0.24, strong: true },
          { label: '도착', width: 0.1, nowrap: true },
          { label: '동선 · 대기 공간', width: 0.32 },
          { label: '좌석', width: 0.16 },
          { label: '담당', width: 0.18 },
        ],
        rows: vipRows.map((r) => ({ cells: [orDash(r.target), orDash(r.arrival), orDash(r.route), orDash(r.seat), orDash(r.owner)] })),
      }),
    )
  } else {
    gaps.push({ chapter: 'people', label: GUIDE_KIND_META.vip.title, where: '운영가이드' })
  }
  return { slides, gaps }
}

function orgChapter(plan: PlanData): ChapterResult {
  const slides: DeckSlide[] = []
  const gaps: DeckGap[] = []

  const staffing = guideData(plan, 'staffing')
  const staffRows = staffing ? staffing.rows.filter((r) => filled([r.role, r.count, r.call_time, r.duty, r.channel])) : []
  if (staffing && staffRows.length) {
    const total = staffingTotal(staffing)
    slides.push(
      ...tableSlides({
        chapter: 'org',
        title: GUIDE_KIND_META.staffing.title,
        subtitle: `합계 ${total}명`,
        columns: [
          { label: '역할', width: 0.24, strong: true },
          { label: '인원', width: 0.08, align: 'right', nowrap: true },
          { label: '콜타임', width: 0.1, nowrap: true },
          { label: '주 업무', width: 0.46 },
          { label: '무전', width: 0.12, nowrap: true },
        ],
        rows: staffRows.map((r) => ({
          cells: [orDash(r.role), typeof r.count === 'number' ? `${r.count}명` : '—', orDash(r.call_time), orDash(r.duty), orDash(r.channel)],
        })),
        notes: txt(staffing.extra) ? [`별도 인력 · ${txt(staffing.extra)}`] : [],
      }),
    )
  } else {
    gaps.push({ chapter: 'org', label: GUIDE_KIND_META.staffing.title, where: '운영가이드' })
  }

  const radio = guideData(plan, 'radio')
  const channels = radio ? radio.channels.filter((c) => filled([c.code, c.name, c.members])) : []
  if (radio && (channels.length || radio.chain.some((c) => txt(c)))) {
    slides.push(
      ...tableSlides({
        chapter: 'org',
        title: GUIDE_KIND_META.radio.title,
        subtitle: channels.length ? `${channels.length}채널` : null,
        columns: [
          { label: '채널', width: 0.12, nowrap: true, strong: true },
          { label: '이름', width: 0.24 },
          { label: '구성', width: 0.64 },
        ],
        rows: channels.map((c) => ({ cells: [orDash(c.code), orDash(c.name), orDash(c.members)] })),
        chain: radio.chain,
        notes: txt(radio.rule) ? [txt(radio.rule)] : [],
      }),
    )
  } else {
    gaps.push({ chapter: 'org', label: GUIDE_KIND_META.radio.title, where: '운영가이드' })
  }

  const raci = guideData(plan, 'raci')
  const raciRows = raci ? raci.rows.filter((r) => txt(r.area)) : []
  if (raci && raciRows.length) {
    slides.push(
      ...tableSlides({
        chapter: 'org',
        title: GUIDE_KIND_META.raci.title,
        legend: '● 주관 · ○ 협조 · — 해당 없음',
        columns: [
          { label: '영역', width: 0.28, strong: true },
          { label: raci.parties[0] || '주최', width: 0.13, align: 'center', mark: true, nowrap: true },
          { label: raci.parties[1] || '우리', width: 0.13, align: 'center', mark: true, nowrap: true },
          { label: raci.parties[2] || '협력사', width: 0.13, align: 'center', mark: true, nowrap: true },
          { label: '비고', width: 0.33 },
        ],
        rows: raciRows.map((r) => ({
          cells: [txt(r.area), MARK_SYMBOL[r.marks[0] ?? 'none'], MARK_SYMBOL[r.marks[1] ?? 'none'], MARK_SYMBOL[r.marks[2] ?? 'none'], orDash(r.note)],
        })),
      }),
    )
  } else {
    gaps.push({ chapter: 'org', label: GUIDE_KIND_META.raci.title, where: '운영가이드' })
  }

  // 옛 운영가이드의 역할별 체크리스트(마크다운) — 사람이 쓴 글이라 그대로 싣는다
  for (const role of plan.guide?.sections.filter((s) => s.kind === 'role' && s.content?.trim()) ?? []) {
    slides.push(...flowSlides('org', role.title || GUIDE_KIND_META.role.title, flowFromMarkdown(role.content as string)))
  }

  const milestones = plan.milestones
  if (milestones.length) {
    const done = milestones.filter((m) => m.done).length
    slides.push(
      ...tableSlides({
        chapter: 'org',
        title: '추진 일정',
        subtitle: `마일스톤 ${milestones.length}개 · 완료 ${done}`,
        columns: [
          { label: '기한', width: 0.16, nowrap: true },
          { label: '마일스톤', width: 0.54, strong: true },
          { label: '영역', width: 0.16, nowrap: true },
          { label: '상태', width: 0.14, nowrap: true },
        ],
        rows: milestones.map((m) => ({
          cells: [formatDateWeekday(m.due_date), m.title, m.area ? AREA_LABELS[m.area] : '전체', m.done ? '완료' : '예정'],
        })),
      }),
    )
  } else {
    gaps.push({ chapter: 'org', label: '추진 일정', where: '일정 · WBS' })
  }
  return { slides, gaps }
}

function safetyChapter(plan: PlanData): ChapterResult {
  const slides: DeckSlide[] = []
  const gaps: DeckGap[] = []

  const safety = guideData(plan, 'safety')
  const safetyRows = safety ? safety.rows.filter((r) => filled([r.action, r.owner])) : []
  if (safetyRows.length) {
    slides.push(
      ...tableSlides({
        chapter: 'safety',
        title: GUIDE_KIND_META.safety.title,
        columns: [
          { label: '항목', width: 0.16, strong: true, nowrap: true },
          { label: '조치', width: 0.64 },
          { label: '담당', width: 0.2 },
        ],
        rows: safetyRows.map((r) => ({ cells: [orDash(r.item), orDash(r.action), orDash(r.owner)] })),
      }),
    )
  } else {
    gaps.push({ chapter: 'safety', label: GUIDE_KIND_META.safety.title, where: '운영가이드' })
  }

  // 비상 대응 — 표(새 문서)면 표로, 옛 문서면 S9 07과 같은 글
  const emergencyData = guideData(plan, 'emergency')
  const emergencyRows = emergencyData ? emergencyData.rows.filter((r) => filled([r.situation, r.action])) : []
  if (emergencyRows.length) {
    slides.push(
      ...tableSlides({
        chapter: 'safety',
        title: GUIDE_KIND_META.emergency.title,
        tone: 'emergency',
        columns: [
          { label: '상황', width: 0.2, strong: true },
          { label: '1차 조치', width: 0.52 },
          { label: '담당', width: 0.16 },
          { label: '무전', width: 0.12, nowrap: true },
        ],
        rows: emergencyRows.map((r) => ({ cells: [orDash(r.situation), orDash(r.action), orDash(r.owner), orDash(r.channel)] })),
      }),
    )
  } else if (plan.emergency?.content?.trim()) {
    slides.push(...flowSlides('safety', GUIDE_KIND_META.emergency.title, flowFromMarkdown(plan.emergency.content), 'emergency'))
  } else {
    gaps.push({ chapter: 'safety', label: GUIDE_KIND_META.emergency.title, where: '운영가이드' })
  }
  return { slides, gaps }
}

// ── 전체 ─────────────────────────────────────────────────────────────

/** 목차 설명 — 장 이름과 같은 장표 하나뿐인 장 */
const TOC_FALLBACK: Partial<Record<DeckChapterKey, string>> = {
  summary: '행사일 · 인원 · 프로그램 · 인력 · 제작물 · 등록',
  overview: '일시 · 장소 · 인원 · 개요 항목',
}

/**
 * 장표 조립 — 표지 · 목차 · 운영 요약 · 01~07장. 내용이 하나도 없는 장은 빈 장표 한 장(어디서 채우는지)으로
 * 남긴다 — 목차에서 빠진 장이 보이게. `today`는 D-day 표기 기준(테스트 고정용).
 */
export function buildPlanDeck(plan: PlanData, today: Date = new Date()): PlanDeck {
  seq = 0
  const gaps: DeckGap[] = []
  const chapterSlides: DeckSlide[] = [summaryChapter(plan, today)]
  const builders: Array<[DeckChapterKey, () => ChapterResult]> = [
    ['overview', () => overviewChapter(plan)],
    ['production', () => productionChapter(plan)],
    ['space', () => spaceChapter(plan)],
    ['program', () => programChapter(plan)],
    ['people', () => peopleChapter(plan)],
    ['org', () => orgChapter(plan)],
    ['safety', () => safetyChapter(plan)],
  ]
  for (const [key, build] of builders) {
    const r = build()
    gaps.push(...r.gaps)
    if (r.slides.length) chapterSlides.push(...r.slides)
    else
      chapterSlides.push({
        kind: 'empty',
        id: slideId(key),
        chapter: key,
        title: DECK_CHAPTERS[key].title,
        subtitle: null,
        part: null,
        message: DECK_CHAPTERS[key].empty,
      })
  }

  const cover: DeckSlide = { kind: 'cover', id: 'cover', chapter: null, title: '표지', subtitle: null, part: null }
  const slides: DeckSlide[] = [cover, { kind: 'toc', id: 'toc', chapter: null, title: '목차', subtitle: null, part: null, entries: [] }, ...chapterSlides]

  const entries: DeckTocEntry[] = DECK_CHAPTER_ORDER.map((key) => {
    const first = slides.findIndex((s) => s.chapter === key)
    const inChapter = slides.filter((s) => s.chapter === key)
    const titles: string[] = []
    for (const s of inChapter) {
      if (s.kind === 'empty' || s.kind === 'summary' || s.title === DECK_CHAPTERS[key].title || titles.includes(s.title)) continue
      titles.push(s.title)
    }
    if (titles.length === 0 && TOC_FALLBACK[key]) titles.push(TOC_FALLBACK[key] as string)
    return {
      chapter: key,
      number: DECK_CHAPTERS[key].number,
      title: DECK_CHAPTERS[key].title,
      slideNo: first + 1,
      items: titles,
      empty: inChapter.every((s) => s.kind === 'empty'),
    }
  })
  slides[1] = { ...(slides[1] as Extract<DeckSlide, { kind: 'toc' }>), entries }
  return { slides, gaps }
}
