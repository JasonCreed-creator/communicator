// 시나리오 빌더 — 세션 그룹핑(§10.2 "세션 그룹" 요구사항) 순수 헬퍼.
// 그룹은 화면 표시용 파생 구조일 뿐 별도 저장 필드가 아니다 — session_id·kind로만 묶는다.
// v2.13 §23.6(원고형): 비상 예비 멘트(kind 'emergency')는 세션과 무관한 마지막 묶음이다.
import type { ProgramSession, ScenarioBlock } from '../../types/entities'

/** session_id === null(또는 더는 존재하지 않는 세션을 가리키는) 블록의 그룹 키 */
export const COMMON_GROUP_KEY = '__common__'
/** 비상 예비 멘트 묶음 키 */
export const EMERGENCY_GROUP_KEY = '__emergency__'

export type ScenarioGroupKind = 'session' | 'common' | 'emergency'

export interface ScenarioGroup {
  key: string
  kind: ScenarioGroupKind
  /** 세션 묶음만 — 공통·비상 묶음은 null */
  session: ProgramSession | null
  items: ScenarioBlock[]
}

/**
 * 블록을 묶는다. 순서 = 프로그램표 세션 순서(sort_order) → '세션 밖 진행'(session_id가 null이거나
 * 지워진 세션을 가리키는 블록) → '비상 예비 멘트'. 각 묶음 안의 상대 순서는 입력 배열(blocks) 순서를 보존한다.
 */
export function groupScenarioBlocks(
  blocks: readonly ScenarioBlock[],
  sessions: readonly ProgramSession[],
): ScenarioGroup[] {
  const known = new Set(sessions.map((s) => s.id))
  const bySession = new Map<string, ScenarioBlock[]>()
  const common: ScenarioBlock[] = []
  const emergency: ScenarioBlock[] = []

  for (const b of blocks) {
    if (b.kind === 'emergency') emergency.push(b)
    else if (b.session_id && known.has(b.session_id)) {
      const arr = bySession.get(b.session_id)
      if (arr) arr.push(b)
      else bySession.set(b.session_id, [b])
    } else {
      common.push(b)
    }
  }

  const groups: ScenarioGroup[] = []
  for (const s of sessions) {
    const items = bySession.get(s.id)
    if (items && items.length > 0) groups.push({ key: s.id, kind: 'session', session: s, items })
  }
  if (common.length > 0) groups.push({ key: COMMON_GROUP_KEY, kind: 'common', session: null, items: common })
  if (emergency.length > 0) groups.push({ key: EMERGENCY_GROUP_KEY, kind: 'emergency', session: null, items: emergency })
  return groups
}

/**
 * 저장 직전 정규화 — 묶음 순서대로 평탄화한다. saveScenarioBlocks는 배열 순서로 sort_order를
 * 유도하므로(§8.2), 매 저장마다 이 함수를 거치면 화면 순서와 저장 순서가 항상 일치한다 —
 * 위/아래 옮기기는 묶음 안의 인접 교환만 하면 된다.
 */
export function arrangeScenarioBlocks(
  blocks: readonly ScenarioBlock[],
  sessions: readonly ProgramSession[],
): ScenarioBlock[] {
  return groupScenarioBlocks(blocks, sessions).flatMap((g) => g.items)
}

/** 'HH:MM' 두 개 사이 분 — 둘 중 하나라도 없거나 거꾸로면 null */
export function minutesBetween(start: string | null, end: string | null): number | null {
  const toMin = (t: string | null) => {
    const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t.trim()) : null
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = toMin(start)
  const b = toMin(end)
  return a === null || b === null || b <= a ? null : b - a
}

/** 세션 머리 옆 한 줄 — 길이(분) · 연사 · 비고. 프로그램표에 있는 것만 적는다 */
export function sessionCaption(s: ProgramSession): string {
  const parts: string[] = []
  const mins = minutesBetween(s.start_time, s.end_time)
  if (mins !== null) parts.push(`${mins}분`)
  const who = [s.speaker_org, s.speaker_title, s.speaker_name].filter((x) => x && x.trim()).join(' ')
  if (who) parts.push(`연사 ${who}`)
  if (s.note && s.note.trim()) parts.push(s.note.trim())
  return parts.join(' · ')
}
