// DoD 81 (Phase 3.24 PR-B · 설계서 v2.13 §23.6) — 순수 함수: 멘트 원고형 판정·연사 자리·원고 뼈대 ·
// 묶음(세션 → 세션 밖 → 비상) · 운영 보드 문서 요약 숫자.
import { describe, expect, it } from 'vitest'
import {
  arrangeScenarioBlocks,
  groupScenarioBlocks,
  minutesBetween,
  sessionCaption,
} from '../components/scenario/scenarioGroups'
import { toPatch, toFormValues } from '../components/scenario/scenarioFormValues'
import { cardSummary, cueMetrics, fileKind, timeRange, type OpsDocMetrics } from '../components/board/opsDocMetrics'
import { guideSummary } from '../lib/guideStructured'
import {
  DEFAULT_EMERGENCY_MENTS,
  buildScenarioSeed,
  fillSpeakerSlots,
  hasSpeakerSlot,
  isSpokenKind,
  scenarioProgress,
  scriptParagraphs,
  sessionIntroScript,
} from '../lib/scenarioScript'
import { SCENARIO_KIND_LABELS } from '../lib/labels'
import type { GuideSection, ProgramSession, ScenarioBlock } from '../types/entities'

const session = (id: string, over: Partial<ProgramSession> = {}): ProgramSession => ({
  id,
  project_id: 'prj',
  section: null,
  start_time: '14:00',
  end_time: '14:50',
  title: `세션 ${id}`,
  speaker_name: null,
  speaker_title: null,
  speaker_org: null,
  note: null,
  track: null,
  sort_order: 1,
  ...over,
})

let seq = 0
const block = (over: Partial<ScenarioBlock>): ScenarioBlock => ({
  id: `b${++seq}`,
  deliverable_id: 'd',
  session_id: null,
  time: null,
  kind: 'mc',
  script: null,
  note: null,
  sort_order: seq,
  ...over,
})

describe('① 멘트와 지시문', () => {
  it('읽는 멘트 = MC·의전·비상 멘트 / 영상·전환·지시는 지시문 · 라벨 custom = 지시, emergency = 비상 멘트', () => {
    expect(['mc', 'protocol', 'emergency'].every((k) => isSpokenKind(k as ScenarioBlock['kind']))).toBe(true)
    expect(['video', 'transition', 'custom'].some((k) => isSpokenKind(k as ScenarioBlock['kind']))).toBe(false)
    expect(SCENARIO_KIND_LABELS.custom).toBe('지시')
    expect(SCENARIO_KIND_LABELS.emergency).toBe('비상 멘트')
  })

  it('원고 문단은 빈 줄로 나뉘고 한 줄 바꿈은 문단 안에 남는다', () => {
    expect(scriptParagraphs('첫 문단\n이어짐\n\n  둘째 문단  \n\n\n')).toEqual(['첫 문단\n이어짐', '둘째 문단'])
    expect(scriptParagraphs(null)).toEqual([])
    expect(scriptParagraphs('   ')).toEqual([])
  })
})

describe('② 연사 자리', () => {
  it('대괄호 자리·○○○·OOO를 찾고, 평범한 괄호는 자리가 아니다', () => {
    expect(hasSpeakerSlot('[연사 이름] 님')).toBe(true)
    expect(hasSpeakerSlot('[소속] 대표')).toBe(true)
    expect(hasSpeakerSlot('○○○ 님께')).toBe(true)
    expect(hasSpeakerSlot('OOO 님께')).toBe(true)
    expect(hasSpeakerSlot('[참고] 박수 유도')).toBe(false)
    expect(hasSpeakerSlot(null)).toBe(false)
  })

  it('프로그램표 값으로 채우고, 값이 없는 자리와 ○○○는 그대로 — 바뀐 자리가 없으면 null', () => {
    const s = { speaker_name: '김가상', speaker_title: null, speaker_org: '가상랩' }
    expect(fillSpeakerSlots('[소속] [직함] [연사 이름] 님', s)).toBe('가상랩 [직함] 김가상 님')
    expect(fillSpeakerSlots('[연사] 님과 ○○○ 님', s)).toBe('김가상 님과 ○○○ 님')
    expect(fillSpeakerSlots('○○○ 님', s)).toBeNull()
    expect(fillSpeakerSlots('[직함]', s)).toBeNull()
  })

  it('소개 멘트 틀 — 연사 정보가 전혀 없으면 빈 멘트(추측 없음), 일부만 있으면 모르는 칸만 대괄호', () => {
    expect(sessionIntroScript(session('a'))).toBe('')
    expect(sessionIntroScript(session('a', { title: '기조연설', speaker_name: '김가상', speaker_title: '대표', speaker_org: '가상랩' }))).toBe(
      '‘기조연설’ 순서입니다. 가상랩 대표 김가상 님을 큰 박수로 모시겠습니다.',
    )
    const partial = sessionIntroScript(session('a', { title: '패널', speaker_org: '가상랩' }))
    expect(partial).toBe('‘패널’ 순서입니다. 가상랩 [직함] [연사 이름] 님을 큰 박수로 모시겠습니다.')
    expect(hasSpeakerSlot(partial)).toBe(true)
  })
})

describe('③ 원고 뼈대(시드)', () => {
  it('세션마다 MC 소개 멘트 1개(세션·시작 시각) + 비상 예비 멘트 3종(세션·시각 없음)', () => {
    const seed = buildScenarioSeed([session('s1', { start_time: '10:00' }), session('s2', { start_time: '11:00', speaker_name: '김가상' })])
    expect(seed).toHaveLength(5)
    expect(seed.slice(0, 2).map((b) => [b.session_id, b.time, b.kind])).toEqual([
      ['s1', '10:00', 'mc'],
      ['s2', '11:00', 'mc'],
    ])
    expect(seed[0].script).toBe('')
    expect(seed[1].script).toContain('김가상')
    expect(seed.slice(2)).toEqual(
      DEFAULT_EMERGENCY_MENTS.map((e) => ({ session_id: null, time: null, kind: 'emergency', script: e.script, note: e.situation })),
    )
  })

  it('프로그램표가 비면 비상 예비 멘트만', () => {
    expect(buildScenarioSeed([]).map((b) => b.kind)).toEqual(['emergency', 'emergency', 'emergency'])
  })
})

describe('④ 진행 숫자', () => {
  it('멘트 작성 = MC·의전 중 적힌 것(비상 멘트는 따로) · 연사 확인 대기 · 걸린 세션 수(지워진 세션 제외)', () => {
    const blocks = [
      block({ kind: 'mc', script: '안녕하십니까', session_id: 's1' }),
      block({ kind: 'mc', script: '  ', session_id: 's1' }),
      block({ kind: 'protocol', script: '[연사 이름] 님', session_id: 's2' }),
      block({ kind: 'video', script: '영상 V-01', session_id: 'gone' }),
      block({ kind: 'emergency', script: '○○○ 님 잠시만', note: '지연' }),
    ]
    expect(scenarioProgress(blocks, [session('s1'), session('s2')])).toEqual({
      spokenTotal: 3,
      spokenFilled: 2,
      speakerPending: 2,
      emergencyCount: 1,
      sessionCount: 2,
    })
    // 세션 목록 없이 부르면 null 아닌 세션 id는 모두 센다
    expect(scenarioProgress(blocks).sessionCount).toBe(3)
  })
})

describe('⑤ 묶음 · 폼', () => {
  it('세션(프로그램표 순) → 세션 밖 진행 → 비상 예비 멘트, 저장 순서도 같다', () => {
    const sessions = [session('s1'), session('s2')]
    const blocks = [
      block({ kind: 'emergency', note: '정전' }),
      block({ session_id: 's2' }),
      block({ session_id: null, time: '09:00' }),
      block({ session_id: 's1' }),
      block({ session_id: 'gone' }),
    ]
    const groups = groupScenarioBlocks(blocks, sessions)
    expect(groups.map((g) => g.kind)).toEqual(['session', 'session', 'common', 'emergency'])
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 2, 1])
    expect(arrangeScenarioBlocks(blocks, sessions).map((b) => b.id)).toEqual(groups.flatMap((g) => g.items.map((b) => b.id)))
  })

  it('비상 멘트로 저장하면 세션·시각은 비운다 · 빈 멘트는 null · 새 블록 기본 구분 = MC', () => {
    expect(toFormValues(null).kind).toBe('mc')
    expect(toPatch({ session_id: 's1', time: '10:00', kind: 'emergency', script: '멘트', note: '정전' })).toEqual({
      session_id: null,
      time: null,
      kind: 'emergency',
      script: '멘트',
      note: '정전',
    })
    expect(toPatch({ session_id: '', time: ' ', kind: 'mc', script: '   ', note: '' }).script).toBeNull()
  })

  it('세션 머리 한 줄 = 길이(분) · 연사 · 비고 — 프로그램표에 있는 것만', () => {
    expect(minutesBetween('14:10', '15:00')).toBe(50)
    expect(minutesBetween('15:00', '14:10')).toBeNull()
    expect(minutesBetween(null, '14:10')).toBeNull()
    expect(sessionCaption(session('a', { start_time: '14:10', end_time: '15:00', speaker_name: '김가상', note: '기조' }))).toBe(
      '50분 · 연사 김가상 · 기조',
    )
    expect(sessionCaption(session('a', { start_time: null, end_time: null }))).toBe('')
  })
})

describe('⑥ 운영 보드 문서 요약', () => {
  it('큐시트 — 큐 수·대본 작성·표 순서 첫·마지막 시각', () => {
    const m = cueMetrics([
      { time_at: '13:50', body: '착석 안내' },
      { time_at: null, body: '' },
      { time_at: '17:50', body: null },
    ])
    expect(m).toEqual({ type: 'cuesheet', cueCount: 3, scripted: 1, firstTime: '13:50', lastTime: '17:50' })
    expect(timeRange('13:50', '17:50')).toBe('13:50–17:50')
    expect(timeRange('13:50', null)).toBe('13:50')
    expect(timeRange(null, null)).toBeNull()
  })

  it('파일 종류는 확장자 대문자', () => {
    expect(fileKind('안전관리 계획서.pdf')).toBe('PDF')
    expect(fileKind('배치도_v2.PNG')).toBe('PNG')
    expect(fileKind('확장자없음')).toBeNull()
  })

  it('카드 요약 4종 — 큐시트는 큐가 가장 많은 문서의 운영 시간, 문서가 없으면 문서 없음', () => {
    const cue = (n: number, first: string, last: string, scripted: number): OpsDocMetrics => ({
      type: 'cuesheet',
      cueCount: n,
      scripted,
      firstTime: first,
      lastTime: last,
    })
    expect(
      cardSummary('cuesheet', [
        { status: 'internal_review', metrics: cue(24, '13:50', '17:50', 18) },
        { status: 'draft', metrics: cue(9, '10:00', '12:00', 9) },
      ]),
    ).toEqual({ headline: '큐 33개', detail: '13:50–17:50 · 대본 27/33' })
    expect(cardSummary('cuesheet', [])).toEqual({ headline: '문서 없음', detail: '' })

    const progress = { spokenTotal: 16, spokenFilled: 12, speakerPending: 2, emergencyCount: 3, sessionCount: 6 }
    expect(cardSummary('scenario', [{ status: 'draft', metrics: { type: 'scenario', progress } }])).toEqual({
      headline: '멘트 12/16 작성',
      detail: '세션 6 · 연사 확인 대기 2 · 비상 멘트 3종',
    })

    const summary = { filled: 9, total: 12, staffTotal: 22, radioChannels: 4, staleCount: 1 }
    expect(cardSummary('guide', [{ status: 'draft', metrics: { type: 'guide', summary, staleTitles: ['존별 운영'] } }])).toEqual({
      headline: '섹션 9/12 채움',
      detail: '현장 인력 22명 · 무전 4채널 · 원본 바뀜 1',
    })

    const file = { version_no: 2, file_name: 'a.pdf', created_at: '2026-11-30T00:00:00Z' }
    expect(
      cardSummary('other', [
        { status: 'pending_approval', metrics: { type: 'other', latest: file } },
        { status: 'requested', metrics: { type: 'other', latest: null } },
        { status: 'final', metrics: { type: 'other', latest: file } },
      ]),
    ).toEqual({ headline: '확정 1/3', detail: '컨펌대기 1 · 파일 없음 1' })
    expect(cardSummary('other', [{ status: 'draft', metrics: { type: 'other', latest: file } }]).detail).toBe('확인할 것 없음')
  })

  it('가이드 요약 — 인력 표·무전 표가 없으면 null(0과 구분) · 원본 바뀜 수', () => {
    const sec = (over: Partial<GuideSection>): GuideSection => ({
      id: 'g',
      deliverable_id: 'd',
      kind: 'custom',
      title: 't',
      content: null,
      source_ref: null,
      source_stale: false,
      sort_order: 1,
      data: null,
      ...over,
    })
    expect(guideSummary([sec({ content: '- a' }), sec({ source_stale: true, content: '- b' })])).toEqual({
      filled: 2,
      total: 2,
      staffTotal: null,
      radioChannels: null,
      staleCount: 1,
    })
    const withTables = guideSummary([
      sec({ kind: 'staffing', data: { type: 'staffing', rows: [{ role: '요원', count: 3, call_time: '', duty: '', channel: '' }], extra: '' } }),
      sec({ kind: 'radio', data: { type: 'radio', channels: [], chain: [], rule: '' } }),
    ])
    expect(withTables.staffTotal).toBe(3)
    expect(withTables.radioChannels).toBe(0)
    expect(withTables.filled).toBe(1)
  })
})
