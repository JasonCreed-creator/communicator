// 시나리오 빌더 폼 값 헬퍼 — cueFormValues.ts와 동일한 역할(폼 값 ↔ 저장용 필드 변환)이지만,
// v9 saveScenarioBlocks는 CueInput 방식의 개별 CRUD가 아니라 **벌크 전체 교체** 계약이라
// "5필드 패치"만 여기서 만들고, 배열 조립(추가 위치·정렬)은 scenarioGroups.ts + ScenarioBuilder가 맡는다.
import type { ScenarioBlock } from '../../types/entities'
import type { ScenarioBlockInput } from '../../types/views'
import type { ScenarioBlockKind } from '../../types/enums'

export interface ScenarioBlockFormValues {
  /** '' = 세션 밖 블록(session_id null), 그 외는 ProgramSession.id */
  session_id: string
  time: string
  kind: ScenarioBlockKind
  /** 멘트(MC·의전·비상) 또는 지시 내용(영상·전환·지시) */
  script: string
  /** 괄호 지시문 — 비상 예비 멘트에서는 상황 이름 */
  note: string
}

export function toFormValues(
  block?: ScenarioBlock | null,
  preset?: Partial<ScenarioBlockFormValues>,
): ScenarioBlockFormValues {
  return {
    session_id: block?.session_id ?? '',
    time: block?.time ?? '',
    // v2.13 §23.6 원고형 — 새 블록의 기본은 MC 멘트
    kind: block?.kind ?? 'mc',
    script: block?.script ?? '',
    note: block?.note ?? '',
    ...preset,
  }
}

/**
 * 폼 값 → 저장용 5필드 패치. 빈 문자열은 null로 정규화(entities.ScenarioBlock 규약과 일치).
 * 비상 예비 멘트는 세션·시각이 없다(§23.6 — 세션 흐름 밖에서 무대감독 콜에 읽는다).
 */
export function toPatch(
  values: ScenarioBlockFormValues,
): Pick<ScenarioBlock, 'session_id' | 'time' | 'kind' | 'script' | 'note'> {
  const emergency = values.kind === 'emergency'
  return {
    session_id: emergency ? null : values.session_id || null,
    time: emergency ? null : values.time.trim() || null,
    kind: values.kind,
    script: values.script.trim() ? values.script : null,
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
