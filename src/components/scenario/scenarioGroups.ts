// 시나리오 빌더 — 세션 그룹핑(§10.2 "세션 그룹" 요구사항) 순수 헬퍼.
// 그룹은 화면 표시용 파생 구조일 뿐 별도 저장 필드가 아니다 — session_id로만 묶는다.
import type { ProgramSession, ScenarioBlock } from '../../types/entities'

/** session_id === null(또는 더는 존재하지 않는 세션을 가리키는) 블록의 그룹 키 */
export const COMMON_GROUP_KEY = '__common__'

export interface ScenarioGroup {
  key: string
  /** null = "공통/수동 블록" 그룹 */
  session: ProgramSession | null
  items: ScenarioBlock[]
}

/**
 * session_id로 블록을 묶는다. 그룹 순서 = 프로그램표 세션 순서(sort_order) 그대로, 마지막에
 * "공통/수동 블록" 그룹(session_id가 null이거나 삭제된 세션을 참조하는 블록)을 붙인다.
 * 각 그룹 내부의 상대 순서는 입력 배열(blocks)의 순서를 그대로 보존한다.
 */
export function groupScenarioBlocks(
  blocks: readonly ScenarioBlock[],
  sessions: readonly ProgramSession[],
): ScenarioGroup[] {
  const known = new Set(sessions.map((s) => s.id))
  const bySession = new Map<string, ScenarioBlock[]>()
  const common: ScenarioBlock[] = []

  for (const b of blocks) {
    if (b.session_id && known.has(b.session_id)) {
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
    if (items && items.length > 0) groups.push({ key: s.id, session: s, items })
  }
  if (common.length > 0) groups.push({ key: COMMON_GROUP_KEY, session: null, items: common })
  return groups
}

/**
 * 저장 직전 정규화 — 그룹 순서(세션 순 + 공통 마지막)대로 평탄화한다. saveScenarioBlocks는
 * 배열 순서로 sort_order를 유도하므로(§8.2), 매 저장마다 이 함수를 거치면 화면에 보이는
 * 그룹 순서와 저장 순서가 항상 일치한다 — ↑/↓ 정렬은 그룹 내부 인접 교환만 하면 된다.
 */
export function arrangeScenarioBlocks(
  blocks: readonly ScenarioBlock[],
  sessions: readonly ProgramSession[],
): ScenarioBlock[] {
  return groupScenarioBlocks(blocks, sessions).flatMap((g) => g.items)
}
