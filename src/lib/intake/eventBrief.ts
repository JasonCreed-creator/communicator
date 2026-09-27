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
  organizer: '고객사(주최·주관)',
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
// 라벨 동의어는 실제 요청 글 두 갈래를 덮는다 — ① 사람이 쓴 글("행사명: · 일시: · 장소:") ② Slack 워크플로 봇 양식
// ("[MICE 계약완료]" · "MICE 견적문의" — `• *고객사:* … · *주제:* … · *행사일시:* November 4th, 2026 at 12:00 AM UTC · *행사장소:* …`,
// 빈 칸은 "MICE only"·빈 값 — 2026-09-27 운영 실측). 굵은 글씨 별표·불릿·팀 멘션·이모지 코드는 규칙을 돌리기 전에 걷어낸다.

const BULLET = String.raw`[-•·◦▪●○▸►]?`
const LABELED: { key: Exclude<BriefKey, 'event_type' | 'notes' | 'event_end_date' | 'end_time' | 'expected_headcount'>; re: RegExp }[] = [
  {
    key: 'name',
    re: new RegExp(
      String.raw`^\s*${BULLET}\s*(?:행사명|행사\s*이름|행사\s*타이틀|행사\s*제목|행사\s*명칭|이벤트명|이벤트\s*이름|세미나명|컨퍼런스명|프로젝트명|프로젝트|제목|명칭|행사)\s*[:：][ \t]*(.+)$`,
      'm',
    ),
  },
  { key: 'venue', re: new RegExp(String.raw`^\s*${BULLET}\s*(?:행사\s*장소|장소명|장소|행사장|개최\s*장소|개최지|베뉴|위치|venue)\s*[:：][ \t]*(.+)$`, 'mi') },
  {
    key: 'organizer',
    re: new RegExp(String.raw`^\s*${BULLET}\s*(?:발주처|고객사명|고객사|고객명|클라이언트|광고주|주최·주관|주최/주관|주최|주관|의뢰사|고객)\s*[:：][ \t]*(.+)$`, 'm'),
  },
  { key: 'theme', re: new RegExp(String.raw`^\s*${BULLET}\s*(?:주제|슬로건|테마|컨셉|콘셉트|목적|행사\s*목적)\s*[:：][ \t]*(.+)$`, 'm') },
  {
    key: 'target_audience',
    re: new RegExp(
      String.raw`^\s*${BULLET}\s*(?:참가\s*대상|참석\s*대상|참가자\s*대상|모객\s*대상|타깃\s*조건|타겟\s*조건|타깃\s*대상|타겟\s*대상|타깃|타겟|대상)\s*[:：][ \t]*(.+)$`,
      'm',
    ),
  },
]
const DATE_LINE_RE = new RegExp(
  String.raw`^\s*${BULLET}\s*(?:행사\s*일시|행사\s*일자|개최\s*일시|개최일|행사일|일시|일자|날짜|행사\s*기간|기간|행사\s*일정|일정|date)\s*[:：][ \t]*(.+)$`,
  'mi',
)
const HEADCOUNT_LINE_RE = new RegExp(
  String.raw`^\s*${BULLET}\s*(?:예상\s*인원|참가\s*인원|참석\s*인원|목표\s*인원|모객\s*인원|참가\s*예정|참석\s*예정|예상\s*참석|쇼업\s*목표|목표\s*쇼업|인원|규모|참가자\s*수|참석자|참가자)\s*[:：][ \t]*(?:약|총)?\s*(\d[\d,]*)\s*(?:명|인|pax|persons?)?`,
  'im',
)
const HEADCOUNT_ANY_RE = /(?:약|총)?\s*(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:명|pax)(?![a-z])/i
const RECRUITING_RE = /모객|RSVP|참가\s*신청|사전\s*등록|초청\s*발송|리드\s*확보|참가자\s*모집/i
/** 채우지 않은 칸의 자리표시(워크플로 봇 기본값 "MICE only" 포함) — 값이 아니다 */
const PLACEHOLDER_RE = /^(?:mice only|미정|tbd|tba|n\/?a|-|—|–|없음|해당\s*없음|추후\s*확정|확인\s*필요|\?+)$/i
/** 메모로 옮기는 참고 ID 줄 — 금액·연락처·담당자 줄은 어떤 칸에도 옮기지 않는다 */
const NOTE_ID_RE = new RegExp(String.raw`^\s*${BULLET}\s*(아이템\s*ID|아이템\s*아이디|매관시\s*(?:계약\s*)?ID|계약\s*ID|집행\s*ID|재계약\s*ID)\s*[:：][ \t]*(.+)$`, 'gmi')

/** 규칙을 돌리기 전 정리 — Slack mrkdwn(굵게 `*…*` · 링크 · 멘션 · 팀 멘션 · 이모지 코드)을 걷어낸 글 */
export function normalizeForRules(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/<!subteam\^[^>]*>/g, ' ')
    .replace(/<!(?:here|channel|everyone)(?:\|[^>]*)?>/g, ' ')
    .replace(/<@[UW][A-Z0-9]+(?:\|[^>]*)?>/g, ' ')
    .replace(/<#[CG][A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]*)>/g, '$2 ($1)')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/:[a-z][a-z0-9_+-]*:/g, ' ')
    .replace(/\*/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// ── 영문 날짜(워크플로 봇 날짜 변수 — "November 4th, 2026 at 12:00 AM UTC") ─────────────
const EN_MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const EN_DATE_MDY_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[ \t]+(\d{1,2})(?!\d)(?:st|nd|rd|th)?,?[ \t]*(20\d{2})?(?:[ \t]*(?:at|,)?[ \t]*(\d{1,2})(?::(\d{2}))?[ \t]*(am|pm)?[ \t]*(utc|gmt|kst)?)?/i
const EN_DATE_DMY_RE = /\b(\d{1,2})(?:st|nd|rd|th)?[ \t]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?[ \t]*(20\d{2})?/i

export interface EnglishDateMatch {
  start: string
  /** KST HH:MM — UTC 자정(워크플로의 날짜만 있는 변수)이면 null */
  time: string | null
  index: number
}

/** 영문 날짜(+시각·시간대) → 날짜 YYYY-MM-DD와 KST 시각. UTC 표기는 KST(+9)로 옮기고, UTC 00:00은 '날짜만'으로 본다 */
export function findEnglishDate(text: string, today: Date): EnglishDateMatch | null {
  const m = EN_DATE_MDY_RE.exec(text)
  let year: number | null
  let month: number
  let day: number
  let hour: number | null = null
  let minute = 0
  let ampm: string | undefined
  let zone: string | undefined
  let index: number
  if (m) {
    month = EN_MONTHS[m[1].toLowerCase().slice(0, 3)]
    day = Number(m[2])
    year = m[3] ? Number(m[3]) : null
    hour = m[4] ? Number(m[4]) : null
    minute = m[5] ? Number(m[5]) : 0
    ampm = m[6]
    zone = m[7]
    index = m.index ?? 0
  } else {
    const n = EN_DATE_DMY_RE.exec(text)
    if (!n) return null
    day = Number(n[1])
    month = EN_MONTHS[n[2].toLowerCase().slice(0, 3)]
    year = n[3] ? Number(n[3]) : null
    index = n.index ?? 0
  }
  const y = year ?? resolveYear(month, day, today)
  if (hour === null || minute > 59) {
    const start = isoDate(y, month, day)
    return start ? { start, time: null, index } : null
  }
  let hh = hour
  if (ampm) {
    const pm = /pm/i.test(ampm)
    if (pm && hh < 12) hh += 12
    if (!pm && hh === 12) hh = 0
  }
  if (hh > 23) {
    const start = isoDate(y, month, day)
    return start ? { start, time: null, index } : null
  }
  if (zone && /utc|gmt/i.test(zone)) {
    const utcMidnight = hh === 0 && minute === 0
    const kst = new Date(Date.UTC(y, month - 1, day, hh + 9, minute))
    const start = isoDate(kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate())
    if (!start) return null
    return { start, time: utcMidnight ? null : `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`, index }
  }
  const start = isoDate(y, month, day)
  return start ? { start, time: `${pad2(hh)}:${pad2(minute)}`, index } : null
}

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

/** 라벨이 붙은 줄만 읽는다. 날짜·인원은 라벨 줄이 없으면 글 전체에서 첫 번째 것. 자리표시("MICE only"·미정·TBD)는 빈 칸 */
export function extractBriefByRules(text: string, today: Date = new Date()): RuleExtraction {
  const fields: EventBriefFields = { ...EMPTY_BRIEF }
  const matched: BriefKey[] = []
  const src = normalizeForRules(text)
  const value = (raw: string): string | null => {
    const v = clean(raw)
    return v && !PLACEHOLDER_RE.test(v) ? v : null
  }
  for (const { key, re } of LABELED) {
    const m = re.exec(src)
    if (!m) continue
    const v = value(m[1])
    if (v) {
      fields[key] = v
      matched.push(key)
    }
  }
  // 워크플로 봇 양식은 '주제' 줄이 행사명이다 — 행사명 줄이 따로 없으면 주제를 행사명으로 옮긴다(가정 — 사람이 주황 칸에서 확인)
  if (!fields.name && fields.theme) {
    fields.name = fields.theme
    fields.theme = null
    matched.push('name')
    matched.splice(matched.indexOf('theme'), 1)
  }
  const dateLine = DATE_LINE_RE.exec(src)
  const scope = dateLine ? dateLine[1] : src
  const en = findEnglishDate(scope, today)
  if (en) {
    fields.event_date = en.start
    matched.push('event_date')
    if (en.time) {
      fields.start_time = en.time
      matched.push('start_time')
    }
  } else {
    const dates = findDates(scope, today)
    if (dates.length > 0) {
      fields.event_date = dates[0].start
      fields.event_end_date = dates[0].end
      matched.push('event_date')
      if (dates[0].end) matched.push('event_end_date')
      const times = findTimes(scope)
      if (times) {
        fields.start_time = times.start
        fields.end_time = times.end
        matched.push('start_time')
        if (times.end) matched.push('end_time')
      }
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
  // 참고 ID(아이템ID·매관시 계약 ID·집행 ID·재계약 ID)만 메모로 — 금액·계약서류·인입채널·담당자 줄은 옮기지 않는다
  const ids: string[] = []
  for (const m of src.matchAll(NOTE_ID_RE)) {
    const v = value(m[2])
    if (v) ids.push(`${m[1].replace(/\s+/g, '')} ${v}`)
  }
  if (ids.length > 0) {
    fields.notes = ids.join(' · ').slice(0, 500)
    matched.push('notes')
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
    '- Slack 워크플로 봇 양식("[MICE 계약완료]" · "MICE 견적문의")에서는 "주제" 줄이 행사명이고, "MICE only"·"미정"·빈 값은 적히지 않은 것으로 봅니다. "계약 매출"·"계약금" 같은 금액 줄은 어떤 칸에도 옮기지 않습니다.',
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
    .replace(/<!subteam\^[^|>]*(?:\|([^>]*))?>/g, (_m, n: string | undefined) => (n && n.trim() ? n.trim() : '@팀'))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
