// 시나리오 빌더 폼 값 헬퍼 — cueFormValues.ts와 동일한 역할(폼 값 ↔ 저장용 필드 변환)이지만,
// v9 saveScenarioBlocks는 CueInput 방식의 개별 CRUD가 아니라 **벌크 전체 교체** 계약이라
// "5필드 패치"만 여기서 만들고, 배열 조립(추가 위치·정렬)은 scenarioGroups.ts + ScenarioBuilder가 맡는다.
import type { ScenarioBlock } from '../../types/entities'
import type { ScenarioBlockInput } from '../../types/views'
import type { ScenarioBlockKind } from '../../types/enums'

export interface ScenarioBlockFormValues {
  /** '' = 공통/수동 블록(session_id null), 그 외는 ProgramSession.id */
  session_id: string
  time: string
  kind: ScenarioBlockKind
  script: string
  note: string
}

export function toFormValues(block?: ScenarioBlock | null): ScenarioBlockFormValues {
  return {
    session_id: block?.session_id ?? '',
    time: block?.time ?? '',
    kind: block?.kind ?? 'custom',
    script: block?.script ?? '',
    note: block?.note ?? '',
  }
}

/** 폼 값 → 저장용 5필드 패치. 빈 문자열은 null로 정규화(entities.ScenarioBlock 규약과 일치). */
export function toPatch(
  values: ScenarioBlockFormValues,
): Pick<ScenarioBlock, 'session_id' | 'time' | 'kind' | 'script' | 'note'> {
  return {
    session_id: values.session_id || null,
    time: values.time.trim() || null,
    kind: values.kind,
    script: values.script || null,
    note: values.note.trim() || null,
  }
}

/** PUT scenario-blocks 벌크 입력 1건으로 변환 — id·sort_order는 서버가 매번 재발급한다(§8.2). */
export function toInput(
  block: Pick<ScenarioBlock, 'session_id' | 'time' | 'kind' | 'script' | 'note'>,
): ScenarioBlockInput {
  return {
    session_id: block.session_id,
    time: block.time,
    kind: block.kind,
    script: block.script,
    note: block.note,
  }
}
