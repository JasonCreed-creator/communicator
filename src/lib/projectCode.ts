// 행사 코드 자동 제안 — 행사명에서 만든다(Phase 6.2 · 설계서 v2.15 §10 S0 · 사용자 지시 2026-09-26 "행사 코드는 행사명에 따라서 자동기입").
// 순수 함수. 코드는 파일 이름 규약(`YYMMDD_코드_행사명`)과 Drive 폴더 이름에 쓰이므로 영문 대문자·숫자(·구분 하이픈)만 만든다.
//
// 규칙: 단어마다 첫 글자 하나 → 영문은 대문자 그대로, 한글은 초성을 로마자 첫 글자로(ㅇ은 모음의 로마자 첫 글자 —
// '아'→A '이'→I '오'→O), 숫자·기호는 건너뛴다 → 최대 4자 + 연도 두 자리(행사일 → 행사명 속 20xx → 올해).
//   서울 테크 컨퍼런스 2026 → STC26 · 리멤버 빌드 2027 → RB27 · Virtual Summit 2026 → VS26
// 단어가 하나라 글자가 모자라면 그 단어의 음절마다 초성을 딴다(리멤버데이 → RMBD). 글자를 하나도 못 얻으면 null(칸을 비워 둔다 — 추측 금지).
// 같은 코드가 이미 있으면 -2, -3…을 붙인다(전역 유일 — projects.code unique).

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3

/** 초성 19개 → 로마자 첫 글자(ㅇ = 빈 문자열 → 모음으로) */
const INITIALS = ['G', 'K', 'N', 'D', 'T', 'R', 'M', 'B', 'P', 'S', 'S', '', 'J', 'J', 'C', 'K', 'T', 'P', 'H']
/** 중성 21개 → 로마자 첫 글자(ㅇ 초성일 때) */
const MEDIALS = ['A', 'A', 'Y', 'Y', 'E', 'E', 'Y', 'Y', 'O', 'W', 'W', 'O', 'Y', 'U', 'W', 'W', 'W', 'Y', 'E', 'E', 'I']

/** 한 글자 → 코드 글자(영문 대문자 하나) 또는 null */
export function codeLetter(ch: string): string | null {
  if (!ch) return null
  if (/^[A-Za-z]$/.test(ch)) return ch.toUpperCase()
  const cp = ch.codePointAt(0) ?? 0
  if (cp >= HANGUL_BASE && cp <= HANGUL_LAST) {
    const off = cp - HANGUL_BASE
    const initial = Math.floor(off / 588)
    const medial = Math.floor((off % 588) / 28)
    return INITIALS[initial] || MEDIALS[medial]
  }
  return null
}

const MAX_LETTERS = 4
const YEAR_RE = /^(20\d{2})년?$/

export interface SuggestCodeOptions {
  /** 행사일(YYYY-MM-DD) — 있으면 연도 두 자리의 첫 출처 */
  eventDate?: string | null
  /** 이미 쓰는 코드(대소문자 무관) — 겹치면 -2, -3… */
  taken?: Iterable<string>
  /** 올해 판정(테스트 주입) */
  today?: Date
}

function tokensOf(name: string): string[] {
  return name
    .normalize('NFC')
    .split(/[\s\-_·,./()[\]{}|&+:;!?'"“”‘’~]+/)
    .filter(Boolean)
}

function yearSuffix(tokens: string[], opts: SuggestCodeOptions): string {
  const fromDate = opts.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.eventDate) ? opts.eventDate.slice(2, 4) : null
  if (fromDate) return fromDate
  for (const t of tokens) {
    const m = YEAR_RE.exec(t)
    if (m) return m[1].slice(2)
  }
  return String((opts.today ?? new Date()).getFullYear()).slice(2)
}

/** 행사명 → 코드 글자(연도 없이). 글자를 못 얻으면 '' */
export function codeStem(name: string): string {
  const tokens = tokensOf(name)
  const words = tokens.filter((t) => !YEAR_RE.test(t) && !/^\d+$/.test(t))
  const initials: string[] = []
  for (const w of words) {
    const letter = codeLetter([...w][0] ?? '')
    if (letter) initials.push(letter)
  }
  if (initials.length >= 2) return initials.slice(0, MAX_LETTERS).join('')
  // 단어 하나(또는 글자를 낸 단어가 하나) — 그 단어의 글자마다
  const first = words.find((w) => [...w].some((c) => codeLetter(c)))
  if (!first) return initials.join('')
  const perChar: string[] = []
  for (const c of [...first]) {
    const letter = codeLetter(c)
    if (letter) perChar.push(letter)
    if (perChar.length >= MAX_LETTERS) break
  }
  return perChar.join('')
}

/** 행사명 → 코드 제안(예: STC26). 글자를 하나도 못 얻으면 null */
export function suggestProjectCode(name: string, opts: SuggestCodeOptions = {}): string | null {
  const stem = codeStem(name ?? '')
  if (!stem) return null
  const base = `${stem}${yearSuffix(tokensOf(name), opts)}`
  const taken = new Set([...(opts.taken ?? [])].map((c) => c.trim().toUpperCase()))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/** 새 행사의 자리표시 코드(createProject({})가 붙이는 EVT-…) — 사람이 정한 코드가 아니므로 자동 제안이 덮어써도 된다 */
export function isPlaceholderCode(code: string | null | undefined): boolean {
  const v = (code ?? '').trim()
  return v === '' || /^EVT-/i.test(v)
}
