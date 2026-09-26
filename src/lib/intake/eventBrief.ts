// 행사 인테이크 — Slack 메시지(또는 붙여 넣은 글)에서 행사 기본 정보를 읽는 순수 함수(Phase 6.2 · 설계서 v2.15 §10 S0 · §8.7).
// 사용자 지시 2026-09-26 "행사 기본정보를 슬랙 메시지를 통해 불러와 기록하는 시스템 구축(행사 만들기 시)".
//
// 두 갈래가 같은 결과 모양(EventBriefFields)을 낸다:
//   ① 라벨 규칙(여기) — "행사명: …" · "일시: …" · "장소: …" · "인원: 300명"처럼 라벨이 붙은 줄만 읽는다(추측 없음). 서버·mock 공용
//   ② AI(Claude — 서버 api/intake · feature 'project_intake') — 자유 문장. 스키마·규칙 문장도 여기 둔다(서버가 import)
// 서버는 ①을 먼저 돌리고 ②로 빈 칸만 채운다(라벨이 명시한 값이 이긴다 — mergeBrief). 읽은 값은 전부 **제안**이라 화면이 주황으로 표시하고
// 사람이 확인·수정한 뒤 저장한다. 사람 이름·전화·이메일은 어떤 칸에도 넣지 않는다(주최·발주처는 조직명만).
// api/ 런타임이 이 파일을 불러오므로 런타임 import를 두지 않는다(CLAUDE.md §6).

export type BriefEventType = 'general' | 'recruiting'

export interface EventBriefFields {
  /** 행사명 */
  name: string | null
  /** 시작일 YYYY-MM-DD */
  event_date: string | null
  /** 종료일 YYYY-MM-DD(하루 행사면 null) */
  event_end_date: string | null
  /** HH:MM */
  start_time: string | null
  end_time: string | null
  venue: string | null
  expected_headcount: number | null
  /** 주최·주관 또는 발주처 — 조직명만 */
  organizer: string | null
  /** 주제·목적 한 줄 */
  theme: string | null
  target_audience: string | null
  /** 모객(참가 신청·RSVP·사전 등록)이 있으면 recruiting, 뚜렷하지 않으면 null */
  event_type: BriefEventType | null
  /** 그 밖의 요구사항 요약(운영 메모) */
  notes: string | null
}

export type BriefKey = keyof EventBriefFields

export const BRIEF_KEYS: readonly BriefKey[] = [
  'name',
  'event_date',
  'event_end_date',
  'start_time',
  'end_time',
  'venue',
  'expected_headcount',
  'organizer',
  'theme',
  'target_audience',
  'event_type',
  'notes',
]

export const EMPTY_BRIEF: EventBriefFields = {
  name: null,
  event_date: null,
  event_end_date: null,
  start_time: null,
  end_time: null,
  venue: null,
  expected_headcount: null,
  organizer: null,
  theme: null,
  target_audience: null,
  event_type: null,
  notes: null,
}

export const BRIEF_LABELS: Record<BriefKey, string> = {
  name: '행사명',
  event_date: '시작일',
  event_end_date: '종료일',
  start_time: '시작 시간',
  end_time: '종료 시간',
  venue: '장소',
  expected_headcount: '예상 인원',
  organizer: '주최·주관',
  theme: '주제',
  target_audience: '참가 대상',
  event_type: '행사 유형',
  notes: '메모',
}

// ── 날짜·시간 ──────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/**
 * 연도 없는 날짜의 연도 — 오늘 기준으로 이미 한 달 넘게 지난 날짜면 내년(행사 요청은 앞날을 말한다 — 가정).
 */
export function resolveYear(month: number, day: number, today: Date): number {
  const y = today.getFullYear()
  const candidate = new Date(y, month - 1, day)
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 31)
  return candidate < cutoff ? y + 1 : y
}

interface DateMatch {
  start: string
  end: string | null
  /** 원문에서의 위치(정렬용) */
  index: number
}

const FULL_DATE_RE = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g
const SHORT_DATE_RE = /(?<![\d.])(\d{1,2})\s*[./월]\s*(\d{1,2})\s*일?(?![\d.]*\d)/g
const RANGE_SEP = /^\s*(?:~|～|∼|-|–|—|부터|에서)\s*/

/** 글에서 날짜(범위)를 찾는다 — 앞에 오는 것부터 */
export function findDates(text: string, today: Date): DateMatch[] {
  const out: DateMatch[] = []
  const seen = new Set<number>()
  const push = (index: number, start: string, rest: string, year: number) => {
    if (seen.has(index)) return
    seen.add(index)
    // 범위: "10.15~10.16" · "10/15-16" · "2026.10.15 ~ 2026.10.16"
    let end: string | null = null
    const sep = RANGE_SEP.exec(rest)
    if (sep) {
      const tail = rest.slice(sep[0].length)
      const full = /^(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(tail)
      const short = /^(\d{1,2})\s*[./월]\s*(\d{1,2})/.exec(tail)
      const dayOnly = /^(\d{1,2})\s*일?(?![\d:시])/.exec(tail)
      if (full) end = isoDate(Number(full[1]), Number(full[2]), Number(full[3]))
      else if (short) end = isoDate(year, Number(short[1]), Number(short[2]))
      else if (dayOnly) end = isoDate(year, Number(start.slice(5, 7)), Number(dayOnly[1]))
      if (end && end <= start) end = null
    }
    out.push({ start, end, index })
  }
  for (const m of text.matchAll(FULL_DATE_RE)) {
    const start = isoDate(Number(m[1]), Number(m[2]), Number(m[3]))
    if (start) push(m.index ?? 0, start, text.slice((m.index ?? 0) + m[0].length), Number(m[1]))
  }
  for (const m of text.matchAll(SHORT_DATE_RE)) {
    const idx = m.index ?? 0
    // 전체 날짜의 일부(2026.10.15의 "10.15")면 건너뛴다
    if ([...seen].some((s) => idx >= s && idx < s + 14)) continue
    const month = Number(m[1])
    const day = Number(m[2])
    if (month < 1 || month > 12) continue
    const year = resolveYear(month, day, today)
    const start = isoDate(year, month, day)
    if (start) push(idx, start, text.slice(idx + m[0].length), year)
  }
  return out.sort((a, b) => a.index - b.index)
}

const TIME_RE = /(오전|오후|낮|저녁|밤)?\s*(\d{1,2})\s*(?::|시)\s*(\d{2})?\s*분?\s*(am|pm|AM|PM)?/g

function toHHMM(meridiem: string | undefined, hourRaw: number, minute: number, ampm: string | undefined): string | null {
  let h = hourRaw
  if (h > 24 || minute > 59) return null
  const pm = meridiem === '오후' || meridiem === '저녁' || meridiem === '밤' || /pm/i.test(ampm ?? '')
  const am = meridiem === '오전' || /am/i.test(ampm ?? '')
  if (pm && h < 12) h += 12
  if (am && h === 12) h = 0
  if (h === 24) h = 0
  return `${pad2(h)}:${pad2(minute)}`
}

/** 글에서 시각(범위)을 찾는다 — "14:00~18:00" · "오후 2시~6시" · "14시 시작" */
export function findTimes(text: string): { start: string; end: string | null } | null {
  const matches: { time: string; index: number; end: number; meridiem?: string }[] = []
  for (const m of text.matchAll(TIME_RE)) {
    // "10.15" 같은 날짜 조각·"300명"은 시각이 아니다 — ':' 또는 '시'가 있어야 잡힌다(정규식이 보장) · 뒤에 '일'·'월'이 오면 날짜
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1)
    if (after === '일' || after === '월') continue
    const t = toHHMM(m[1], Number(m[2]), m[3] ? Number(m[3]) : 0, m[4])
    if (t) matches.push({ time: t, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, meridiem: m[1] })
  }
  if (matches.length === 0) return null
  const first = matches[0]
  const second = matches[1]
  let end: string | null = null
  if (second && RANGE_SEP.test(text.slice(first.end, second.index)) && second.index - first.end <= 6) {
    end = second.time
    // "오후 2시~6시" — 뒤 시각에 오전·오후가 없고 앞이 오후면 같은 오후로
    if (!second.meridiem && first.meridiem === '오후' && Number(second.time.slice(0, 2)) < 12) {
      end = `${pad2(Number(second.time.slice(0, 2)) + 12)}${second.time.slice(2)}`
    }
    if (end <= first.time) end = null
  }
  return { start: first.time, end }
}

// ── 라벨 규칙 ─────────────────────────────────────────────────────────

const LABELED: { key: Exclude<BriefKey, 'event_type' | 'notes' | 'event_end_date' | 'end_time' | 'expected_headcount'>; re: RegExp }[] = [
  { key: 'name', re: /^\s*[-•*·]?\s*(?:행사명|행사 이름|행사\s*타이틀|이벤트명|프로젝트명|프로젝트|제목|행사)\s*[:：]\s*(.+)$/m },
  { key: 'venue', re: /^\s*[-•*·]?\s*(?:장소|행사장|행사 장소|베뉴|개최 장소|위치)\s*[:：]\s*(.+)$/m },
  { key: 'organizer', re: /^\s*[-•*·]?\s*(?:발주처|고객사|클라이언트|주최|주관|주최·주관|주최\/주관|의뢰사|고객)\s*[:：]\s*(.+)$/m },
  { key: 'theme', re: /^\s*[-•*·]?\s*(?:주제|슬로건|테마|목적|행사 목적)\s*[:：]\s*(.+)$/m },
  { key: 'target_audience', re: /^\s*[-•*·]?\s*(?:참가 대상|대상|타겟|참석 대상|참가자 대상)\s*[:：]\s*(.+)$/m },
]
const DATE_LINE_RE = /^\s*[-•*·]?\s*(?:일시|일자|날짜|행사일|개최일|기간|행사 기간|행사 일정|일정)\s*[:：]\s*(.+)$/m
const HEADCOUNT_LINE_RE = /^\s*[-•*·]?\s*(?:예상 인원|참가 인원|참석 인원|인원|규모|참가자 수|참석자|참가자)\s*[:：]\s*(?:약|총)?\s*(\d[\d,]*)\s*(?:명|인|pax|persons?)?/im
const HEADCOUNT_ANY_RE = /(?:약|총)?\s*(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:명|pax)(?![a-z])/i
const RECRUITING_RE = /모객|RSVP|참가\s*신청|사전\s*등록|초청\s*발송|리드\s*확보|참가자\s*모집/i

function clean(s: string, max = 200): string | null {
  const v = s
    .replace(/[<>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[,;·]\s*$/, '')
    .trim()
    .slice(0, max)
  return v || null
}

export interface RuleExtraction {
  fields: EventBriefFields
  /** 규칙이 채운 칸(라벨이 명시한 값 — AI 결과보다 앞선다) */
  matched: BriefKey[]
}

/** 라벨이 붙은 줄만 읽는다. 날짜·인원은 라벨 줄이 없으면 글 전체에서 첫 번째 것 */
export function extractBriefByRules(text: string, today: Date = new Date()): RuleExtraction {
  const fields: EventBriefFields = { ...EMPTY_BRIEF }
  const matched: BriefKey[] = []
  const src = text.replace(/\r/g, '')
  for (const { key, re } of LABELED) {
    const m = re.exec(src)
    if (!m) continue
    const v = clean(m[1])
    if (v) {
      fields[key] = v
      matched.push(key)
    }
  }
  const dateLine = DATE_LINE_RE.exec(src)
  const dates = findDates(dateLine ? dateLine[1] : src, today)
  if (dates.length > 0) {
    fields.event_date = dates[0].start
    fields.event_end_date = dates[0].end
    matched.push('event_date')
    if (dates[0].end) matched.push('event_end_date')
    const times = findTimes(dateLine ? dateLine[1] : src)
    if (times) {
      fields.start_time = times.start
      fields.end_time = times.end
      matched.push('start_time')
      if (times.end) matched.push('end_time')
    }
  }
  const hc = HEADCOUNT_LINE_RE.exec(src) ?? HEADCOUNT_ANY_RE.exec(src)
  if (hc) {
    const n = Number(hc[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n >= 1 && n <= 1_000_000) {
      fields.expected_headcount = n
      matched.push('expected_headcount')
    }
  }
  if (RECRUITING_RE.test(src)) {
    fields.event_type = 'recruiting'
    matched.push('event_type')
  }
  return { fields, matched }
}

// ── AI(Claude) — 스키마·규칙 문장·검사 ──────────────────────────────────

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

/** 구조화 출력 스키마(구조화 출력 규약 — additionalProperties:false · 모든 키 required · 범위 제약 없음). 개인정보 칸 없음 */
export const AI_EVENT_BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...BRIEF_KEYS],
  properties: {
    name: nullable({ type: 'string', description: '행사명' }),
    event_date: nullable({ type: 'string', description: '시작일 YYYY-MM-DD' }),
    event_end_date: nullable({ type: 'string', description: '종료일 YYYY-MM-DD — 하루 행사면 null' }),
    start_time: nullable({ type: 'string', description: 'HH:MM 24시간' }),
    end_time: nullable({ type: 'string', description: 'HH:MM 24시간' }),
    venue: nullable({ type: 'string', description: '장소(건물·홀 이름 — 주소는 넣지 않음)' }),
    expected_headcount: nullable({ type: 'integer', description: '예상 인원(명)' }),
    organizer: nullable({ type: 'string', description: '주최·주관 또는 발주처 조직명 — 사람 이름 금지' }),
    theme: nullable({ type: 'string', description: '주제·목적 한 줄' }),
    target_audience: nullable({ type: 'string', description: '참가 대상' }),
    event_type: nullable({ type: 'string', enum: ['general', 'recruiting'] }),
    notes: nullable({ type: 'string', description: '그 밖의 요구사항 요약 — 두 문장 이내' }),
  },
} as const

export function aiEventBriefSystem(today: Date): string {
  const iso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  return [
    '당신은 한국 행사 대행사의 PM을 돕습니다. 동료가 Slack에 남긴 행사 요청 글에서 행사 기본 정보만 골라 정해진 칸에 옮겨 적습니다.',
    `오늘은 ${iso}입니다.`,
    '규칙:',
    '- 글에 적힌 것만 옮깁니다. 적혀 있지 않거나 확실하지 않은 칸은 null로 둡니다. 추측하지 않습니다.',
    '- 날짜는 YYYY-MM-DD, 시각은 24시간 HH:MM입니다. 연도가 없는 날짜는 오늘 이후로 가장 가까운 연도로 적습니다("10/15"가 오늘보다 앞이면 내년).',
    '- 기간이면 event_date = 첫날, event_end_date = 마지막 날. 하루 행사면 event_end_date는 null.',
    '- expected_headcount는 사람 수(정수)만 — "300명 내외"는 300, "200~300명"은 300. 모르면 null.',
    '- organizer에는 조직명만(발주처·고객사·주최·주관). 사람 이름·직함·전화번호·이메일은 어떤 칸에도 적지 않습니다.',
    '- event_type: 참가 신청·모객·RSVP·사전 등록·초청 발송이 있으면 "recruiting", 그런 말이 없으면 null(general로 단정하지 않음).',
    '- notes: 위 칸에 들어가지 않은 요구사항(예: 동시통역, 케이터링, 생중계)을 두 문장 이내로. 금액·견적 액수·사람 이름은 넣지 않습니다. 없으면 null.',
    '- venue는 건물·홀 이름까지만(주소는 넣지 않음). name은 글에 적힌 행사명 그대로(따옴표·이모지 제거).',
  ].join('\n')
}

export const AI_EVENT_BRIEF_INSTRUCTION = '다음 글에서 행사 기본 정보를 규칙대로 옮겨 적어 주세요.'

export class EventBriefShapeError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function optStr(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') throw new EventBriefShapeError('문자열이 아닙니다')
  return clean(v, max)
}

/** Claude 응답 검사 — 모양이 어긋난 값은 null로(막지 않는다 — 어차피 사람이 확인한다). 객체가 아니면 EventBriefShapeError */
export function validateEventBrief(raw: unknown): EventBriefFields {
  if (!raw || typeof raw !== 'object') throw new EventBriefShapeError('객체가 아닙니다')
  const r = raw as Record<string, unknown>
  const date = (v: unknown) => (typeof v === 'string' && DATE_RE.test(v) && isoDate(Number(v.slice(0, 4)), Number(v.slice(5, 7)), Number(v.slice(8, 10))) ? v : null)
  const time = (v: unknown) => (typeof v === 'string' && HHMM_RE.test(v) ? v : null)
  const headcount = typeof r.expected_headcount === 'number' && Number.isInteger(r.expected_headcount) && r.expected_headcount >= 1 && r.expected_headcount <= 1_000_000 ? r.expected_headcount : null
  let event_date = date(r.event_date)
  let event_end_date = date(r.event_end_date)
  if (event_date && event_end_date && event_end_date <= event_date) event_end_date = null
  if (!event_date && event_end_date) {
    event_date = event_end_date
    event_end_date = null
  }
  return {
    name: optStr(r.name, 120),
    event_date,
    event_end_date,
    start_time: time(r.start_time),
    end_time: time(r.end_time),
    venue: optStr(r.venue, 120),
    expected_headcount: headcount,
    organizer: optStr(r.organizer, 120),
    theme: optStr(r.theme, 200),
    target_audience: optStr(r.target_audience, 200),
    event_type: r.event_type === 'general' || r.event_type === 'recruiting' ? r.event_type : null,
    notes: optStr(r.notes, 500),
  }
}

/** 규칙(라벨 명시)이 이기고, 나머지는 AI가 채운다 */
export function mergeBrief(rules: RuleExtraction, ai: EventBriefFields | null): EventBriefFields {
  if (!ai) return rules.fields
  const out: EventBriefFields = { ...ai }
  for (const k of rules.matched) (out as unknown as Record<string, unknown>)[k] = rules.fields[k]
  return out
}

/** 채워진 칸 */
export function filledBriefKeys(fields: EventBriefFields): BriefKey[] {
  return BRIEF_KEYS.filter((k) => fields[k] !== null && fields[k] !== '')
}

// ── 글 속 링크·첨부 ─────────────────────────────────────────────────────

export interface BriefLink {
  url: string
  /** 링크가 견적서·시트처럼 보이는가(구글 시트·Drive·xlsx·pdf) */
  looks_like_quote: boolean
  label: string | null
}

const URL_RE = /https?:\/\/[^\s<>|)\]"'）」』]+/g
const QUOTE_HINT_RE = /docs\.google\.com\/spreadsheets|drive\.google\.com|\.xlsx?\b|\.pdf\b|견적|quote|estimate/i

/** Slack 글의 `<url|label>` 표기와 맨 URL을 모두 찾는다(중복 제거) */
export function extractLinks(text: string): BriefLink[] {
  const out: BriefLink[] = []
  const seen = new Set<string>()
  const add = (url: string, label: string | null) => {
    const u = url.replace(/[.,;:!?]+$/, '')
    if (seen.has(u)) return
    seen.add(u)
    out.push({ url: u, looks_like_quote: QUOTE_HINT_RE.test(`${u} ${label ?? ''}`), label })
  }
  for (const m of text.matchAll(/<(https?:\/\/[^|>]+)(?:\|([^>]*))?>/g)) add(m[1], m[2]?.trim() || null)
  const bare = text.replace(/<https?:\/\/[^>]*>/g, ' ')
  for (const m of bare.matchAll(URL_RE)) add(m[0], null)
  return out
}

/** Slack mrkdwn → 읽기 좋은 글(링크 라벨 · 멘션 · 채널 표기 정리). 사람 멘션은 이름 대신 자리표시로 남긴다 */
export function slackTextToPlain(text: string): string {
  return text
    .replace(/<(https?:\/\/[^|>]+)\|([^>]*)>/g, '$2 ($1)')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/<@[UW][A-Z0-9]+(?:\|[^>]*)?>/g, '@담당자')
    .replace(/<#[CG][A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/<!(?:here|channel|everyone)>/g, '@채널')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
