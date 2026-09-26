// 시나리오 멘트 원고형 정본 (설계서 v2.13 §23.6 · Phase 3.24 PR-B).
// 시나리오 = MC가 소리 내어 읽는 원고. 블록마다 지시문(괄호 — 무대·조명·영상 동작, note)과
// 멘트(읽는 말, script)를 가른다. 영상·전환·지시 블록은 script도 지시문으로 보인다(읽는 말이 아니다).
// 순수 함수만 둔다 — provider 2종(시드)과 빌더·운영 보드(요약 숫자)가 함께 쓴다.
import type { ProgramSession, ScenarioBlock } from '../types/entities'
import type { ScenarioBlockKind } from '../types/enums'
import type { ScenarioBlockInput } from '../types/views'

/** 사람이 소리 내어 읽는 멘트 종류 — 이 종류의 script는 원고(크게), 나머지는 괄호 지시문으로 보인다 */
export const SPOKEN_SCENARIO_KINDS: readonly ScenarioBlockKind[] = ['mc', 'protocol', 'emergency']

export function isSpokenKind(kind: ScenarioBlockKind): boolean {
  return SPOKEN_SCENARIO_KINDS.includes(kind)
}

/** 연사 자리 표시 — 모르는 사실은 대괄호·○○○로 비워 둔다(추측 채움 금지) */
const SPEAKER_SLOT = /\[(연사 이름|연사|소속|직함)\]|○○○|OOO/

export function hasSpeakerSlot(script: string | null | undefined): boolean {
  return SPEAKER_SLOT.test(script ?? '')
}

type SpeakerFields = Pick<ProgramSession, 'speaker_name' | 'speaker_title' | 'speaker_org'>

const filled = (v: string | null | undefined): v is string => !!v && v.trim() !== ''

/**
 * 대괄호 자리를 프로그램표 연사 정보로 채운다 — 값이 없는 자리는 그대로 둔다.
 * 바뀐 자리가 하나도 없으면 null(채울 것이 없다). ○○○처럼 무엇의 자리인지 모르는 표시는 건드리지 않는다.
 */
export function fillSpeakerSlots(script: string, session: SpeakerFields): string | null {
  let changed = false
  const next = script.replace(/\[(연사 이름|연사|소속|직함)\]/g, (whole, slot: string) => {
    const value =
      slot === '소속' ? session.speaker_org : slot === '직함' ? session.speaker_title : session.speaker_name
    if (!filled(value)) return whole
    changed = true
    return value.trim()
  })
  return changed ? next : null
}

/** 원고 문단 — 빈 줄로 나눈다(한 줄 바꿈은 문단 안 줄바꿈으로 남는다) */
export function scriptParagraphs(script: string | null | undefined): string[] {
  return (script ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export interface ScenarioProgress {
  /** 세션 흐름의 멘트 블록(MC·의전) 수 — 비상 예비 멘트는 따로 센다 */
  spokenTotal: number
  /** 그중 멘트가 적힌 것 */
  spokenFilled: number
  /** 연사 자리(대괄호·○○○)가 남은 멘트 */
  speakerPending: number
  /** 비상 예비 멘트 수 */
  emergencyCount: number
  /** 블록이 걸린 프로그램표 세션 수 */
  sessionCount: number
}

export function scenarioProgress(
  blocks: readonly Pick<ScenarioBlock, 'kind' | 'script' | 'session_id'>[],
  sessions?: readonly Pick<ProgramSession, 'id'>[],
): ScenarioProgress {
  const known = sessions ? new Set(sessions.map((s) => s.id)) : null
  const spoken = blocks.filter((b) => b.kind === 'mc' || b.kind === 'protocol')
  const sessionIds = new Set(
    blocks
      .map((b) => b.session_id)
      .filter((id): id is string => !!id && (known ? known.has(id) : true)),
  )
  return {
    spokenTotal: spoken.length,
    spokenFilled: spoken.filter((b) => filled(b.script)).length,
    speakerPending: blocks.filter((b) => isSpokenKind(b.kind) && hasSpeakerSlot(b.script)).length,
    emergencyCount: blocks.filter((b) => b.kind === 'emergency').length,
    sessionCount: sessionIds.size,
  }
}

/**
 * 세션 소개 멘트 틀. 연사 정보가 하나라도 있으면(발표 세션) 아는 것은 채우고 모르는 것은 대괄호로 비운다 —
 * 그 자리가 '연사 확인 대기'로 보인다. 연사 정보가 전혀 없으면(쉬는 시간·등록 등일 수 있다) 빈 멘트로 둔다.
 */
export function sessionIntroScript(session: Pick<ProgramSession, 'title'> & SpeakerFields): string {
  const any = filled(session.speaker_name) || filled(session.speaker_org) || filled(session.speaker_title)
  if (!any) return ''
  const who = [
    filled(session.speaker_org) ? session.speaker_org.trim() : '[소속]',
    filled(session.speaker_title) ? session.speaker_title.trim() : '[직함]',
    filled(session.speaker_name) ? session.speaker_name.trim() : '[연사 이름]',
  ].join(' ')
  return `‘${session.title}’ 순서입니다. ${who} 님을 큰 박수로 모시겠습니다.`
}

/** 기본 비상 예비 멘트 3종 — 상황만 정해 두고 행사에 맞게 고쳐 쓰는 일반 문장(캔버스 시안 ②) */
export const DEFAULT_EMERGENCY_MENTS: readonly { situation: string; script: string }[] = [
  { situation: '영상 장애', script: '화면 준비에 잠시 시간이 필요합니다. 그동안 오늘 순서를 짧게 안내해 드리겠습니다.' },
  { situation: '발표자 지연', script: '다음 순서를 먼저 모시고, 준비가 끝나는 대로 이어서 진행하겠습니다.' },
  { situation: '음향 교체', script: '마이크를 점검하는 동안 잠시만 기다려 주시기 바랍니다.' },
]

/** 프로그램표 → 원고 뼈대(빈 문서에서만 — R-O3). 세션마다 MC 소개 멘트 1개 + 비상 예비 멘트 3종 */
export function buildScenarioSeed(sessions: readonly ProgramSession[]): ScenarioBlockInput[] {
  const out: ScenarioBlockInput[] = sessions.map((s) => ({
    session_id: s.id,
    time: s.start_time,
    kind: 'mc',
    script: sessionIntroScript(s),
    note: null,
  }))
  for (const e of DEFAULT_EMERGENCY_MENTS) {
    out.push({ session_id: null, time: null, kind: 'emergency', script: e.script, note: e.situation })
  }
  return out
}
