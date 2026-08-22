// 큐시트 에디터 공용 헬퍼 — 폼 값 ↔ CueInput 변환 + 표 '내용' 열 요약.
// entities.Cue의 body는 마크다운 대본 전문이라, 표에는 첫 줄만 요약해 보여준다(전문은 대본 패널에서).
import type { Cue } from '../../types/entities'
import type { CueInput } from '../../types/views'

export interface CueFormValues {
  cue_no: string
  time_at: string
  segment: string
  body: string
  console_audio: string
  console_light: string
  console_screen: string
}

export function toFormValues(cue?: Cue | null): CueFormValues {
  return {
    cue_no: cue?.cue_no ?? '',
    time_at: cue?.time_at ?? '',
    segment: cue?.segment ?? '',
    body: cue?.body ?? '',
    console_audio: cue?.console_audio ?? '',
    console_light: cue?.console_light ?? '',
    console_screen: cue?.console_screen ?? '',
  }
}

export function toInput(v: CueFormValues): CueInput {
  return {
    cue_no: v.cue_no,
    time_at: v.time_at,
    segment: v.segment,
    body: v.body,
    console_audio: v.console_audio,
    console_light: v.console_light,
    console_screen: v.console_screen,
  }
}

/** 표의 '내용' 열 — body 첫 줄(마크다운 기호 제거)만 요약, 길면 말줄임 */
export function summaryLine(body: string | null | undefined): string {
  if (!body) return '—'
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return '—'
  const clean = line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '')
  return clean.length > 44 ? `${clean.slice(0, 44)}…` : clean
}
