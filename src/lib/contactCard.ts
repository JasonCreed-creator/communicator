// 전자명함·메일 서명 텍스트 파서 — 행사 설정 ② 담당자 임포트(Phase 3.18.1 §2).
//
// 명함 서식은 회사마다 달라 완전 인식이 불가능하다. 그래서 원칙을 **"확실한 것만 채우고 나머지는 비운다"**로
// 잡았다 — 추측으로 채운 값은 사람이 찾아내야 할 오류가 되지만, 빈 칸은 화면이 그대로 드러내 준다.
// 결과는 확인 표에서 사람이 고칠 수 있으므로, 파서는 애매하면 포기하는 쪽을 택한다.
//
// 순수 함수만 둔다(외부 호출·현재 시각·랜덤 없음) — 같은 입력이면 언제나 같은 결과여야 테스트가 계약이 된다.

export interface ParsedContact {
  name: string
  title: string
  company: string
  email: string
  phone: string
}

const EMPTY: ParsedContact = { name: '', title: '', company: '', email: '', phone: '' }

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/** 한국 전화번호 — `+82` 국가번호·하이픈·점·공백·붙여쓰기를 모두 받는다.
 *  국가번호가 없으면 반드시 `0`으로 시작하도록 묶어 뒀다(그러지 않으면 `2026-08-29` 같은 날짜가 걸린다). */
const PHONE_RE = /(?:\+82[-.\s]?|0)(1[016789]|2|[3-6]\d|70|80)[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g

const URL_RE = /https?:\/\/|www\.|\.(?:com|net|org|io|kr|jp|us)\b/i

/** 직함 목록 — 토큰의 **끝**과 맞춰 본다(수석매니저·영업팀장처럼 앞에 수식이 붙는다). */
const TITLE_SUFFIXES = [
  '대표이사', '대표', '회장', '부회장', '사장', '부사장', '전무', '상무', '이사',
  '본부장', '실장', '센터장', '국장', '팀장', '파트장', '그룹장',
  '부장', '차장', '과장', '대리', '주임', '사원',
  '매니저', '수석', '책임', '선임', '전임', '연구원', '컨설턴트', '디렉터', '총괄', '프로', '인턴',
]

/** 영문 약칭 직함 — 단어 경계로만 맞춘다(`PM`이 `PMO`를 물지 않도록). */
const TITLE_ABBR_RE = /\b(?:PM|PL|PD|AE|AM|GM|MD|CEO|COO|CTO|CFO|CMO)\b/i

const COMPANY_MARKER_RE =
  /주식회사|유한회사|재단법인|사단법인|\(주\)|\(유\)|㈜|컴퍼니|\b(?:inc|ltd|corp|corporation|llc|company|gmbh)\b\.?/i

/** 이름 후보에서 제외할 조직 꼬리 — `기획팀 팀장`의 `기획팀`이 이름으로 잡히는 것을 막는다.
 *  사람 이름과 겹칠 수 있는 한 글자 꼬리(원·국 등)는 넣지 않았다(오탐이 더 나쁘다). */
const ORG_SUFFIX_RE = /(?:팀|본부|센터|사업부|부서|파트|그룹|부문|연구소|지사|지점|법인)$/

const KOREAN_NAME_RE = /^[가-힣]{2,4}$/
/** 라틴 이름은 2~3 토큰만 인정한다 — 한 토큰이면 부서·직함과 구별할 근거가 없다. */
const LATIN_NAME_RE = /^[A-Z][A-Za-z'’.-]{0,19}(?: [A-Z][A-Za-z'’.-]{0,19}){1,2}$/

/** 한 줄을 조각으로 쪼개는 구분자 — `홍길동 / 기획팀 팀장 / 가상이벤트(주)`가 한 줄로 오는 서식이 흔하다. */
const SEGMENT_SPLIT_RE = /\s*[|·•‧/,]\s*|\t+|\s{2,}/

function isTitleToken(token: string): boolean {
  if (TITLE_ABBR_RE.test(token)) return true
  return TITLE_SUFFIXES.some((suffix) => token.endsWith(suffix))
}

/** 매치 문자열을 `010-1234-5678` 꼴로 통일한다. 서울(02)만 지역번호가 두 자리다. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // 국가번호는 국내 표기(선행 0)로 되돌린다 — 국내 번호는 0으로 시작하므로 82 시작과 겹치지 않는다
  const national = digits.startsWith('82') ? `0${digits.slice(2)}` : digits
  const area = national.startsWith('02') ? '02' : national.slice(0, 3)
  const rest = national.slice(area.length)
  if (rest.length < 7) return national
  return `${area}-${rest.slice(0, -4)}-${rest.slice(-4)}`
}

/** 여러 번호가 있으면 휴대폰(01x)을 먼저 고른다 — 담당자에게 실제로 닿는 번호다. */
function pickPhone(text: string): string {
  const found: string[] = []
  PHONE_RE.lastIndex = 0
  for (const match of text.matchAll(PHONE_RE)) found.push(normalizePhone(match[0]))
  if (found.length === 0) return ''
  return found.find((p) => p.startsWith('01')) ?? found[0]
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** 이메일·전화·URL·빈 조각을 걷어낸 나머지 — 이름·직함·회사는 여기서만 찾는다. */
function textSegments(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    for (const raw of line.split(SEGMENT_SPLIT_RE)) {
      const seg = raw.trim().replace(/^[-–—:·]+|[-–—:·]+$/g, '').trim()
      if (!seg) continue
      if (EMAIL_RE.test(seg)) continue
      if (URL_RE.test(seg)) continue
      PHONE_RE.lastIndex = 0
      if (PHONE_RE.test(seg)) continue
      out.push(seg)
    }
  }
  return out
}

/** 이메일 도메인의 첫 라벨 — 회사 줄과 겹치는지 대조하는 데 쓴다. */
function domainKey(email: string): string {
  const label = (email.split('@')[1] ?? '').split('.')[0] ?? ''
  return label.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findCompany(segments: string[], email: string): string {
  const marked = segments.find((seg) => COMPANY_MARKER_RE.test(seg))
  if (marked) return marked

  const key = domainKey(email)
  if (key.length < 3) return ''
  return (
    segments.find((seg) => {
      const segKey = seg.toLowerCase().replace(/[^a-z0-9]/g, '')
      return segKey.length >= 3 && (segKey.includes(key) || key.includes(segKey))
    }) ?? ''
  )
}

/** 한 조각에서 이름(+같은 조각에 붙은 직함)을 떼어 낸다. 근거가 약하면 null을 준다. */
function splitNameTitle(segment: string): { name: string; title: string } | null {
  const tokens = segment.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const titleAt = tokens.findIndex(isTitleToken)
  const nameTokens = titleAt === -1 ? tokens : tokens.slice(0, titleAt)
  const title = titleAt === -1 ? '' : tokens.slice(titleAt).join(' ')
  if (nameTokens.length === 0) return null // 직함만 있는 조각

  // 숫자가 섞인 조각은 주소·번호다
  if (nameTokens.some((t) => /\d/.test(t))) return null

  if (nameTokens.length === 1) {
    const token = nameTokens[0]
    if (ORG_SUFFIX_RE.test(token)) return null
    if (KOREAN_NAME_RE.test(token)) return { name: token, title }
  }
  const latin = nameTokens.join(' ')
  if (LATIN_NAME_RE.test(latin)) return { name: latin, title }
  return null
}

/** 명함 텍스트 한 장을 필드로 나눈다. 인식하지 못한 필드는 빈 문자열로 남긴다(추측 채움 금지). */
export function parseContactCard(text: string): ParsedContact {
  if (!text || !text.trim()) return { ...EMPTY }

  const normalized = normalizeText(text)
  const email = normalized.match(EMAIL_RE)?.[0] ?? ''
  const phone = pickPhone(normalized)

  const segments = textSegments(normalized)
  const company = findCompany(segments, email)
  const rest = segments.filter((seg) => seg !== company)

  // "가장 짧고 위에 있는" 조각 — 명함은 이름을 맨 위에 짧게 둔다. 길이가 같으면 위쪽이 이긴다.
  // 다만 직함이 같은 조각에 붙어 있으면(`홍길동 팀장`) 그쪽을 먼저 본다 — 표지 없는 짧은 회사명이
  // 이름 자리를 뺏는 것을 막는 유일한 근거가 직함이다.
  let picked: { name: string; title: string; segment: string } | null = null
  let pickedRank: [number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  for (const seg of rest) {
    const hit = splitNameTitle(seg)
    if (!hit) continue
    const rank: [number, number] = [hit.title ? 0 : 1, seg.length]
    if (rank[0] < pickedRank[0] || (rank[0] === pickedRank[0] && rank[1] < pickedRank[1])) {
      picked = { ...hit, segment: seg }
      pickedRank = rank
    }
  }

  // 이름 조각에 직함이 안 붙어 있으면 다른 줄에서 찾는다(직함만 있는 줄이 흔하다)
  const nameSegment = picked?.segment ?? ''
  const title =
    picked?.title ||
    rest.find((seg) => seg !== nameSegment && seg.split(/\s+/).some(isTitleToken)) ||
    ''

  return { name: picked?.name ?? '', title, company, email, phone }
}

/** 여러 장을 한 번에 — **빈 줄 2개 이상**을 카드 경계로 본다(한 줄 띄우기는 같은 명함 안의 문단 구분). */
export function parseContactCards(text: string): ParsedContact[] {
  if (!text || !text.trim()) return []

  const chunks = normalizeText(text)
    .replace(/[ \t]+\n/g, '\n')
    .split(/\n{3,}/)

  return chunks
    .map((chunk) => parseContactCard(chunk))
    .filter((c) => c.name || c.title || c.company || c.email || c.phone)
}
