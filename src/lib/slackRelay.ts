// v2.22.3(Phase 6.17) — 코멘트·등록 메모를 Slack 스레드에 **사람이 올린다**(기획자님 2026-09-28 #1 "자동으로 PUSH하기보다 슬랙에 올리기 버튼" ·
// #2 "멘션을 여러명 달게" · #5 "등록탭 안에서도 담당자간 소통 · 슬랙 푸시도"). 앱(SlackRelayPanel · 등록 소통)·서버(api/_lib/notify)가
// 같은 상수·판정을 쓴다 — 런타임 import 0(서버가 `../../../src/lib/slackRelay.js`로 읽는다).
//
//   · 자동 전송 0 — 글은 앱에 남고, Slack에는 누른 글만 간다(코멘트 알림 사건은 여전히 §9 매트릭스에 없다)
//   · 멘션 = 그 행사 멤버만(서버 SQL이 거른다) · 최대 10명 · Slack ID 없는 사람은 '이름(Slack 미연결)'(§9 규칙 그대로)
//   · 태그 = 운영 커뮤니케이션 프로토콜 v1.0 댓글 태그(§26.2) — 디자인 영역은 디자인 협업 태그, 운영·공통은 운영 태그.
//     등록 메모는 `[등록]`(프로토콜에 없는 앱 태그 — 등록 담당자 소통을 한눈에 가르기 위해 더한다 · PROGRESS 결정 로그)
export type RelayKind = 'comment' | 'note'
export type RelayArea = 'design' | 'ops' | 'common' | 'registration'
export type RelayChannel = 'thread' | 'design' | 'project' | 'global'

const OPS_TAGS = ['[제작]', '[결정]', '[WBS]', '[변경요청]', '[긴급]', '[견적변경]', '[킥오프]', '[베뉴]', '[현장]', '[결과보고]', '[정산]', '[종료]'] as const

/** 영역별 고를 수 있는 태그 — 첫 값이 기본값 */
export const RELAY_TAGS: Record<RelayArea, readonly string[]> = {
  design: ['[피드백]', '[의뢰]', '[시안]', '[검토요청]', '[확정]', '[납품]', '[일정]', '[변경요청]', '[긴급]'],
  ops: OPS_TAGS,
  common: OPS_TAGS,
  registration: ['[등록]', '[변경요청]', '[긴급]', '[결정]'],
}

export const RELAY_MAX_MENTIONS = 10
export const RELAY_BODY_MAX = 4000

export function defaultRelayTag(area: RelayArea): string {
  return RELAY_TAGS[area][0]
}

/** 서버가 받은 태그 검사 — 그 영역 어휘가 아니면 기본값 */
export function normalizeRelayTag(area: RelayArea, tag: unknown): string {
  return typeof tag === 'string' && RELAY_TAGS[area].includes(tag) ? tag : defaultRelayTag(area)
}

/** 항목 영역 → 태그 영역. 등록 메모는 늘 registration */
export function relayAreaOf(kind: RelayKind, area: string | null | undefined): RelayArea {
  if (kind === 'note') return 'registration'
  if (area === 'design') return 'design'
  if (area === 'ops') return 'ops'
  return 'common'
}

/** 멘션 id 정리 — 문자열만 · 공백 제거 · 중복 제거 · 상한 */
export function normalizeMentionIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const out: string[] = []
  for (const v of ids) {
    if (typeof v !== 'string') continue
    const id = v.trim()
    if (!id || out.includes(id)) continue
    out.push(id)
    if (out.length >= RELAY_MAX_MENTIONS) break
  }
  return out
}

export function relayChannelLabel(channel: RelayChannel): string {
  switch (channel) {
    case 'design':
      return '디자인 스레드'
    case 'thread':
      return '행사 스레드'
    case 'project':
      return '행사 채널'
    default:
      return '공용 채널'
  }
}

/** mock(데모)은 보내는 흉내를 내지 않는다 — 사실만 알린다(Slack 카드·리마인드와 같은 규약) */
export const SLACK_RELAY_MOCK_MESSAGE = 'Slack에 올리기는 실서버 모드에서 이 행사의 Slack 스레드로 갑니다 — 데모에서는 보내지 않습니다.'
