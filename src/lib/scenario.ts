// 시나리오 → 큐시트 변환 규칙 정본 (설계서 v2.5 §23.3).
// 시나리오 = 사람이 읽는 진행 대본(MC·진행팀·의전) / 큐시트 = 콘솔 오퍼레이터용 3채널 큐.
// 순수 함수만 둔다 — provider(exportScenarioToCues)와 UI(빌더의 미리보기)가 함께 재사용한다.
import type { Cue, ScenarioBlock } from '../types/entities'

/** §23.3 큐 표기 토큰 — 1~2자 알파벳 + '-' + 1~3자리 숫자 (예: M-02·C-11·V-01) */
const CUE_TOKEN = /\b([A-Z]{1,2})-(\d{1,3})\b/g

/** kind→segment 라벨 — 큐 후보가 될 수 있는 두 종류만 (§23.3) */
const KIND_TO_SEGMENT: Record<'video' | 'transition', string> = {
  video: '영상',
  transition: '전환',
}

export interface ScenarioCueCandidate {
  block: ScenarioBlock
  /** script에서 추출된 큐 표기 토큰 원문(등장 순) */
  tokens: string[]
}

/**
 * §23.3 — 큐 후보 = kind가 'video'|'transition'이고 script에 큐 표기 토큰이 있는 블록.
 * sort_order 순서를 그대로 보존한다(호출부가 이미 정렬된 배열을 넘긴다고 가정).
 */
export function scenarioCueCandidates(blocks: readonly ScenarioBlock[]): ScenarioCueCandidate[] {
  const out: ScenarioCueCandidate[] = []
  for (const block of blocks) {
    if (block.kind !== 'video' && block.kind !== 'transition') continue
    const script = block.script ?? ''
    const tokens = [...script.matchAll(CUE_TOKEN)].map((m) => m[0])
    if (tokens.length === 0) continue
    out.push({ block, tokens })
  }
  return out
}

/** 다음 'S01'식 연번 생성기 — 기존 큐 번호(cue_no)와 충돌하지 않는다 */
function sequentialCueNoGenerator(existingCueNos: readonly (string | null)[]): () => string {
  const used = new Set(existingCueNos.filter((x): x is string => !!x))
  let i = 0
  return () => {
    let code: string
    do {
      i += 1
      code = `S${String(i).padStart(2, '0')}`
    } while (used.has(code))
    used.add(code)
    return code
  }
}

/**
 * §23.3 변환 — 대본 전문은 복사하지 않는다. body에는 시나리오 블록 참조 문구만 남기고,
 * 토큰은 채널별로 배치한다: M-*→console_audio · C-*→console_light · V-*→console_screen.
 * 그 외 접두 토큰은 참조 문구에 병기한다. R-O5: 기존 큐를 보존하고 후미에만 삽입한다 —
 * 호출부가 startSortOrder에 기존 큐의 최대 sort_order를 넘겨야 한다.
 */
export function buildCuesFromScenario(params: {
  candidates: readonly ScenarioCueCandidate[]
  targetDeliverableId: string
  existingCueNos: readonly (string | null)[]
  startSortOrder: number
  scenarioTitle: string
  makeId: () => string
}): Cue[] {
  const { candidates, targetDeliverableId, existingCueNos, startSortOrder, scenarioTitle, makeId } = params
  const nextCueNo = sequentialCueNoGenerator(existingCueNos)
  return candidates.map((candidate, i) => {
    const audio: string[] = []
    const light: string[] = []
    const screen: string[] = []
    const other: string[] = []
    for (const token of candidate.tokens) {
      const prefix = token.split('-')[0]
      if (prefix === 'M') audio.push(token)
      else if (prefix === 'C') light.push(token)
      else if (prefix === 'V') screen.push(token)
      else other.push(token)
    }
    const refNote =
      `시나리오 「${scenarioTitle}」 블록 참조` + (other.length ? ` (표기: ${other.join(', ')})` : '')
    return {
      id: makeId(),
      deliverable_id: targetDeliverableId,
      cue_no: nextCueNo(),
      time_at: candidate.block.time,
      segment: KIND_TO_SEGMENT[candidate.block.kind as 'video' | 'transition'],
      body: refNote,
      console_audio: audio.length ? audio.join(', ') : null,
      console_light: light.length ? light.join(', ') : null,
      console_screen: screen.length ? screen.join(', ') : null,
      sort_order: startSortOrder + i + 1,
    }
  })
}
