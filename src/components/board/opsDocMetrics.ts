// 운영 보드 문서별 요약 숫자 (설계서 v2.13 §23.6 · 디자인지시서 §7-2.14 · 캔버스 "운영 문서 3종 실무화" ①).
// 네 유형이 같은 줄 모양(상태·버전·담당·마감)만 보이던 것을 유형마다 그 문서가 담은 것으로 바꾼다 —
// 큐시트 = 큐 수·운영 시간·대본 작성 / 시나리오 = 세션·멘트 작성·연사 확인·비상 멘트 /
// 운영가이드 = 섹션 채움·현장 인력·무전·원본 갱신 / 기타 = 최신 파일.
// 순수 함수만 — 보드 페이지가 provider에서 읽은 목록을 넘긴다(쓰기 0건 — R-O1).
import { guideSummary, type GuideSummary } from '../../lib/guideStructured'
import { scenarioProgress, type ScenarioProgress } from '../../lib/scenarioScript'
import type { Cue, GuideSection, ProgramSession, ScenarioBlock, Version } from '../../types/entities'
import type { DeliverableStatus } from '../../types/enums'
import type { OpsDocCardKey } from './opsDocCards'

export interface CueMetrics {
  type: 'cuesheet'
  cueCount: number
  /** 대본(본문)이 적힌 큐 */
  scripted: number
  /** 표 순서의 첫·마지막 큐 시각 */
  firstTime: string | null
  lastTime: string | null
}

export type OpsDocMetrics =
  | CueMetrics
  | { type: 'scenario'; progress: ScenarioProgress }
  | { type: 'guide'; summary: GuideSummary; staleTitles: string[] }
  | { type: 'other'; latest: Pick<Version, 'version_no' | 'file_name' | 'created_at'> | null }

export function cueMetrics(cues: readonly Pick<Cue, 'time_at' | 'body'>[]): CueMetrics {
  const times = cues.map((c) => c.time_at).filter((t): t is string => !!t && t.trim() !== '')
  return {
    type: 'cuesheet',
    cueCount: cues.length,
    scripted: cues.filter((c) => (c.body ?? '').trim() !== '').length,
    firstTime: times[0] ?? null,
    lastTime: times.length > 1 ? times[times.length - 1] : null,
  }
}

export function scenarioMetrics(
  blocks: readonly ScenarioBlock[],
  sessions: readonly Pick<ProgramSession, 'id'>[],
): OpsDocMetrics {
  return { type: 'scenario', progress: scenarioProgress(blocks, sessions) }
}

export function guideMetrics(sections: readonly GuideSection[]): OpsDocMetrics {
  return {
    type: 'guide',
    summary: guideSummary(sections),
    staleTitles: sections.filter((s) => s.source_stale).map((s) => s.title),
  }
}

/** 파일 종류 — 확장자 대문자('PDF'·'PNG'), 없으면 null */
export function fileKind(fileName: string): string | null {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(fileName.trim())
  return m ? m[1].toUpperCase() : null
}

/** '13:50–17:50' — 시각이 하나뿐이면 그 시각, 없으면 null */
export function timeRange(first: string | null, last: string | null): string | null {
  if (first && last) return `${first}–${last}`
  return first ?? null
}

export interface CardSummaryInput {
  status: DeliverableStatus
  metrics: OpsDocMetrics
}

/** 유형 카드의 굵은 줄(headline)과 그 아래 한 줄(detail) — 문서가 없으면 headline만 '문서 없음' */
export function cardSummary(key: OpsDocCardKey, rows: readonly CardSummaryInput[]): { headline: string; detail: string } {
  if (rows.length === 0) return { headline: '문서 없음', detail: '' }
  const join = (parts: (string | null | false)[]) => parts.filter(Boolean).join(' · ')

  if (key === 'cuesheet') {
    const ms = rows.map((r) => r.metrics).filter((m): m is CueMetrics => m.type === 'cuesheet')
    const cues = ms.reduce((n, m) => n + m.cueCount, 0)
    const scripted = ms.reduce((n, m) => n + m.scripted, 0)
    // 운영 시간은 큐가 가장 많은 문서(본행사) 기준 — 리허설 큐시트까지 섞으면 범위가 흐려진다
    const main = ms.slice().sort((a, b) => b.cueCount - a.cueCount)[0]
    return {
      headline: `큐 ${cues}개`,
      detail: cues === 0 ? '아직 큐 없음' : join([main ? timeRange(main.firstTime, main.lastTime) : null, `대본 ${scripted}/${cues}`]),
    }
  }
  if (key === 'scenario') {
    const ps = rows.flatMap((r) => (r.metrics.type === 'scenario' ? [r.metrics.progress] : []))
    const sum = (f: (p: ScenarioProgress) => number) => ps.reduce((n, p) => n + f(p), 0)
    const pending = sum((p) => p.speakerPending)
    const emergency = sum((p) => p.emergencyCount)
    return {
      headline: `멘트 ${sum((p) => p.spokenFilled)}/${sum((p) => p.spokenTotal)} 작성`,
      detail: join([
        `세션 ${sum((p) => p.sessionCount)}`,
        pending > 0 && `연사 확인 대기 ${pending}`,
        emergency > 0 && `비상 멘트 ${emergency}종`,
      ]),
    }
  }
  if (key === 'guide') {
    const gs = rows.flatMap((r) => (r.metrics.type === 'guide' ? [r.metrics.summary] : []))
    const staff = gs.some((g) => g.staffTotal !== null) ? gs.reduce((n, g) => n + (g.staffTotal ?? 0), 0) : null
    const radio = gs.some((g) => g.radioChannels !== null) ? gs.reduce((n, g) => n + (g.radioChannels ?? 0), 0) : null
    const stale = gs.reduce((n, g) => n + g.staleCount, 0)
    return {
      headline: `섹션 ${gs.reduce((n, g) => n + g.filled, 0)}/${gs.reduce((n, g) => n + g.total, 0)} 채움`,
      detail: join([
        staff !== null && `현장 인력 ${staff}명`,
        radio !== null && `무전 ${radio}채널`,
        stale > 0 && `원본 바뀜 ${stale}`,
      ]),
    }
  }
  const waiting = rows.filter((r) => r.status === 'pending_approval').length
  const noFile = rows.filter((r) => r.metrics.type === 'other' && r.metrics.latest === null).length
  return {
    headline: `확정 ${rows.filter((r) => r.status === 'final').length}/${rows.length}`,
    detail: join([waiting > 0 && `컨펌대기 ${waiting}`, noFile > 0 && `파일 없음 ${noFile}`]) || '확인할 것 없음',
  }
}
