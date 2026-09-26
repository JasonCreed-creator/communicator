// 운영가이드 현장 운영 섹션 정본 (설계서 v2.13 §23.5 · Phase 3.24 PR-A). 순수 함수만 둔다 —
// provider 2종(시드·저장)과 빌더 화면(뼈대 추가·표 편집)이 같은 템플릿·계산·글 변환을 써야 결과가 어긋나지 않는다.
//
// 원칙
// - 표로 채우는 섹션(data)은 저장할 때 content(마크다운 목록)를 다시 만든다 — 운영계획서 ⑦·발송 스냅숏·
//   인쇄처럼 content를 읽는 곳이 바뀌지 않는다(데이터 정본 = data, content = 읽기용 사본).
// - 템플릿은 실무 운영계획서 구조(설치·철거 → 인력·무전 → 역할 분담 → D-day 진행표 → 구간별 체크 →
//   등록 → 의전 → 안전)를 따르되, 값은 행사마다 사람이 고치는 **뼈대**다. 회사·행사 고유 명칭은 넣지 않는다.
// - 옛 문서(마크다운 4섹션)는 그대로 둔다 — 빠진 섹션만 뼈대로 끼워 넣고(기존 섹션 순서·내용 불변),
//   이미 있는 종류는 다시 만들지 않는다.
import type {
  GuideChecklistsData,
  GuideDayplanData,
  GuideDayplanRow,
  GuideEmergencyData,
  GuideMark,
  GuideRaciData,
  GuideRadioData,
  GuideRegistrationData,
  GuideSafetyData,
  GuideSectionData,
  GuideSetupData,
  GuideStaffingData,
  GuideVipData,
  ProgramSession,
  Project,
} from '../types/entities'
import type { GuideSectionKind } from '../types/enums'
import type { GuideSectionInput } from '../types/views'

// ── 종류·순서·묶음 ────────────────────────────────────────────────────

/** 섹션 순서 정본 — 새 문서 뼈대 순서이자 옛 문서에 끼워 넣을 자리의 기준 */
export const GUIDE_CANON_ORDER: readonly GuideSectionKind[] = [
  'setup',
  'staffing',
  'radio',
  'raci',
  'dayplan',
  'checklists',
  'registration',
  'vip',
  'safety',
  'zone',
  'emergency',
  'contacts',
]

export type GuideGroup = 'prep' | 'day' | 'safety' | 'other'

export const GUIDE_GROUP_ORDER: readonly GuideGroup[] = ['prep', 'day', 'safety', 'other']

export const GUIDE_GROUP_LABELS: Record<GuideGroup, string> = {
  prep: '준비',
  day: '당일',
  safety: '안전 · 공통',
  other: '기타',
}

export const GUIDE_KIND_META: Record<GuideSectionKind, { title: string; group: GuideGroup; source: string | null }> = {
  setup: { title: '설치·철거 일정', group: 'prep', source: '행사 일시·장소에서 뼈대' },
  staffing: { title: '현장 인력·콜타임', group: 'prep', source: '인원 합계 자동' },
  radio: { title: '무전·지휘 체계', group: 'prep', source: null },
  raci: { title: '역할 분담', group: 'prep', source: null },
  dayplan: { title: 'D-day 진행표', group: 'day', source: '프로그램표에서 뼈대' },
  checklists: { title: '구간별 체크리스트', group: 'day', source: null },
  registration: { title: '등록 운영', group: 'day', source: '대기 시간 자동 계산' },
  vip: { title: 'VIP 의전', group: 'day', source: null },
  safety: { title: '안전관리', group: 'safety', source: null },
  zone: { title: '존별 운영', group: 'safety', source: null },
  emergency: { title: '비상 대응', group: 'safety', source: null },
  contacts: { title: '연락망/비품', group: 'safety', source: null },
  role: { title: '역할별 체크리스트', group: 'other', source: null },
  custom: { title: '새 섹션', group: 'other', source: null },
}

/** 표로 채우는 종류(data 필수) — emergency는 data가 있을 때만 표(옛 문서 = 마크다운) */
const DATA_KINDS = new Set<GuideSectionKind>([
  'setup',
  'staffing',
  'radio',
  'raci',
  'dayplan',
  'checklists',
  'registration',
  'vip',
  'safety',
])

export function isDataGuideKind(kind: GuideSectionKind): boolean {
  return DATA_KINDS.has(kind)
}

/** 이 섹션을 표로 그리는가 — data가 있고 종류가 맞을 때만 */
export function hasGuideData(section: { kind: GuideSectionKind; data?: GuideSectionData | null }): boolean {
  return !!section.data && section.data.type === section.kind
}

/** 저장 전 검사 — 문제 문장(한국어) 또는 null. provider 2종이 같은 규칙으로 422를 낸다 */
export function guideDataProblem(kind: GuideSectionKind, data: GuideSectionData | null | undefined): string | null {
  if (data == null) {
    return DATA_KINDS.has(kind) ? `'${GUIDE_KIND_META[kind].title}' 섹션은 표 데이터가 필요합니다.` : null
  }
  if (typeof data !== 'object' || data.type !== kind) {
    return `'${GUIDE_KIND_META[kind]?.title ?? kind}' 섹션의 데이터 종류가 맞지 않습니다.`
  }
  if (!DATA_KINDS.has(kind) && kind !== 'emergency') {
    return `'${GUIDE_KIND_META[kind].title}' 섹션은 표 데이터를 받지 않습니다.`
  }
  return null
}

// ── 날짜 표기 ────────────────────────────────────────────────────────

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' + 며칠 → '12/9 (수)'. 날짜가 없으면 'D-1'·'D-day' 같은 상대 표기 */
export function guideDateLabel(eventDate: string | null, offsetDays: number): string {
  const m = eventDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate) : null
  if (!m) return offsetDays === 0 ? 'D-day' : offsetDays < 0 ? `D${offsetDays}` : `D+${offsetDays}`
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + offsetDays)
  const d = new Date(t)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAYS[d.getUTCDay()]})`
}

// ── 뼈대(템플릿) ─────────────────────────────────────────────────────

export interface GuideSeedContext {
  project: Pick<Project, 'kind' | 'event_date' | 'start_time' | 'end_time' | 'venue' | 'expected_headcount'>
  sessions: readonly ProgramSession[]
  /** 이 행사 담당자(내부 멤버) 수 — 인력표 첫 줄 인원 */
  memberCount: number
}

export function buildSetupData(ctx: GuideSeedContext): GuideSetupData {
  const { event_date, start_time, end_time, venue } = ctx.project
  const place = venue ?? ''
  const dMinus1 = guideDateLabel(event_date, -1)
  const dDay = guideDateLabel(event_date, 0)
  return {
    type: 'setup',
    rows: [
      { date: dMinus1, time: '', task: '설치 · 기술 리허설', place, owner: '우리 · 협력사' },
      { date: dDay, time: start_time ? `~${start_time}` : '', task: '입장 · 최종 셋업 · 리허설', place, owner: '우리' },
      {
        date: dDay,
        time: start_time && end_time ? `${start_time}–${end_time}` : '',
        task: '본행사',
        place,
        owner: '우리',
      },
      { date: dDay, time: end_time ? `${end_time} 이후` : '', task: '철거 · 반출', place, owner: '우리 · 협력사' },
    ],
    notes: [
      '설치물 높이 · 공용 공간 보양 규정 확인',
      '목공 구조물 방염필증 제출',
      '전기 공사는 베뉴 등록업체 경유',
      '임대 종료 시각과 초과 요금 확인',
    ],
  }
}

export function buildStaffingData(ctx: GuideSeedContext): GuideStaffingData {
  return {
    type: 'staffing',
    rows: [
      {
        role: 'PM · 파트 담당',
        count: ctx.memberCount > 0 ? ctx.memberCount : null,
        call_time: '',
        duty: '총괄 · 제작·연출 · 프로그램 · 등록',
        channel: 'CH1',
      },
      { role: '무대감독 · 진행 연출', count: null, call_time: '', duty: '큐시트 운영 · 무대 전환 · 연사 동선', channel: 'CH3' },
      { role: '전문 MC', count: null, call_time: '', duty: '리허설 · 전체 진행', channel: 'CH1' },
      { role: '운영 팀장', count: null, call_time: '', duty: '구역 책임', channel: 'CH2 · CH4' },
      { role: '현장 운영 요원', count: null, call_time: '', duty: '등록 안내 · 대기열 · 객석', channel: 'CH2' },
      { role: '등록 오퍼레이터', count: null, call_time: '', duty: '명찰 출력 · 체크인', channel: 'CH2' },
    ],
    extra: '협력사 기술 인력(무대 · LED · 음향 · 조명 · 중계)은 별도',
  }
}

export function buildRadioData(ctx: GuideSeedContext): GuideRadioData {
  return {
    type: 'radio',
    channels: [
      { code: 'CH1', name: '총괄', members: '총괄 PM · 고객 창구 · 무대감독' },
      { code: 'CH2', name: '로비', members: '등록 · 상담 · 기프트 수령대' },
      { code: 'CH3', name: '무대 · AV', members: '무대감독 · 영상 · 음향 · 조명 · 중계' },
      { code: 'CH4', name: '운영 지원', members: '반입 · 보관 · 안전 · 동선' },
    ],
    chain: [ctx.project.kind === 'host' ? '파트너·연사 요청' : '주최 요청', '총괄 PM', '무대감독 · 운영 팀장', '현장 요원'],
    rule: '변경 결정은 CH1에서 확정한 뒤 전 채널에 전파',
  }
}

/** 대행형 역할 분담 템플릿 — [주최사, 우리, 협력사·베뉴] */
const RACI_AGENCY: ReadonlyArray<{ area: string; marks: [GuideMark, GuideMark, GuideMark]; note: string }> = [
  { area: '모객 · 초청 발송', marks: ['main', 'help', 'none'], note: '' },
  { area: '프로그램 · 발표자 · 발표 자료', marks: ['main', 'help', 'none'], note: '' },
  { area: '키비주얼 · 콘텐츠 제작', marks: ['help', 'main', 'none'], note: '' },
  { area: '무대 · 영상 · 음향 · 조명', marks: ['none', 'main', 'help'], note: '' },
  { area: '등록 · 명찰 · 현장 운영', marks: ['help', 'main', 'help'], note: '' },
  { area: '상담 · 네트워킹', marks: ['main', 'help', 'none'], note: '' },
  { area: '기프트 · 기념품 · 경품', marks: ['help', 'main', 'none'], note: '' },
  { area: '설문 · 추첨', marks: ['help', 'main', 'none'], note: '' },
  { area: '공간 · 반입 · 안전', marks: ['none', 'main', 'help'], note: '' },
]

export function buildRaciData(ctx: GuideSeedContext): GuideRaciData {
  if (ctx.project.kind === 'host') {
    // 주최형 — 고객(주최사)이 맡던 주관은 우리가 맡고, 첫 열은 파트너사(협조)로 바뀐다(가정 — 사람이 고친다)
    return {
      type: 'raci',
      parties: ['파트너사', '우리', '협력사 · 베뉴'],
      rows: RACI_AGENCY.map((r) => ({
        area: r.area,
        marks: [r.marks[0] === 'main' ? 'help' : r.marks[0], r.marks[0] === 'main' ? 'main' : r.marks[1], r.marks[2]],
        note: r.note,
      })),
    }
  }
  return {
    type: 'raci',
    parties: ['주최사', '우리', '협력사 · 베뉴'],
    rows: RACI_AGENCY.map((r) => ({ area: r.area, marks: [...r.marks] as [GuideMark, GuideMark, GuideMark], note: r.note })),
  }
}

/** 본행사 줄 '내용' — 연사(소속 직함 이름) → 없으면 세션 비고. 묶음 기호(section: 'A'·'오전')는 내용이 아니라 넣지 않는다 */
function sessionContent(s: ProgramSession): string {
  const who = [s.speaker_org, s.speaker_title, s.speaker_name].filter((x) => x && x.trim()).join(' ')
  return who || (s.note ?? '').trim()
}

/** 프로그램표 세션 → 본행사 행(시각 순, 시각 없는 세션은 뒤). 세션 연결은 session_id로 남긴다 */
export function dayplanRowsFromSessions(sessions: readonly ProgramSession[]): GuideDayplanRow[] {
  return [...sessions]
    .sort((a, b) => {
      const ta = a.start_time ?? '99:99'
      const tb = b.start_time ?? '99:99'
      return ta.localeCompare(tb) || a.sort_order - b.sort_order
    })
    .map((s) => ({
      group: 'main' as const,
      time: s.start_time ?? '',
      segment: s.title,
      content: sessionContent(s),
      av: '',
      owner: '',
      session_id: s.id,
    }))
}

export function buildDayplanData(ctx: GuideSeedContext): GuideDayplanData {
  const main = dayplanRowsFromSessions(ctx.sessions)
  const { start_time, end_time } = ctx.project
  return {
    type: 'dayplan',
    rows: [
      { group: 'pre', time: '', segment: '입장 · 최종 셋업', content: '무대 · AV 점검, 로비 세팅', av: '시스템 체크', owner: '우리 · 협력사', session_id: null },
      { group: 'pre', time: '', segment: '리허설', content: '오프닝 큐 · MC · 발표자', av: '런스루', owner: '우리', session_id: null },
      { group: 'pre', time: '', segment: '스태프 브리핑', content: '요원 배치 · 무전 교신 점검', av: '', owner: '우리', session_id: null },
      { group: 'pre', time: '', segment: '오픈 준비 완료', content: '등록 · 로비 · 무대 최종 확인', av: 'BGM 온', owner: '우리', session_id: null },
      ...(main.length > 0
        ? main
        : [{ group: 'main' as const, time: start_time ?? '', segment: '본행사', content: '', av: '', owner: '', session_id: null }]),
      { group: 'post', time: end_time ?? '', segment: '퇴장', content: '배웅 · 출입문 분산 퇴장', av: '엔드 프레임', owner: '우리', session_id: null },
      { group: 'post', time: '', segment: '철거 · 반출', content: '퇴장 완료 확인 후 로비 → 무대 순 반출', av: '', owner: '우리 · 협력사', session_id: null },
    ],
  }
}

export function buildChecklistsData(): GuideChecklistsData {
  return {
    type: 'checklists',
    blocks: [
      {
        title: '오픈 준비',
        span: '등록 오픈 전',
        style: 'check',
        items: [
          '등록 라인 명찰 출력 테스트',
          '등록 명단 동기화',
          '기프트 · 기념품 수령대 적재',
          '상담 · 부스 대기 동선',
          '포토월 · 사이니지 송출',
          '무전 채널 교신',
          '음향 측면 · 후방 청취',
          '백업 PC · 예비 경로',
          '고객 창구 최종 확인',
        ].map((text) => ({ at: '', text })),
      },
      {
        title: '리허설 구성',
        span: '',
        style: 'timeline',
        items: [
          { at: '15분', text: '오프닝 큐 — 암전 · 영상 · 조명 업 · MC 멘트' },
          { at: '60분', text: '발표자 — 화면 전환 · 클리커 · 프롬프터 · 타이머' },
          { at: '15분', text: '중계 · 보조화면 — 측면 · 후방 시야 확인' },
          { at: '10분', text: '설문 · 추첨 — 화면 · 호명 · 수령 동선' },
          { at: '10분', text: '비상 시나리오 — 영상 장애 · 발표자 지연 · 음향 교체' },
        ],
      },
      {
        title: '브레이크',
        span: '20분',
        style: 'timeline',
        items: [
          { at: '0분', text: '브레이크 콜 — MC 안내 · 루프 영상 · 출입문 개방' },
          { at: '0~15분', text: '상담 · 네트워킹 · 포토월 · 화장실 동선 안내' },
          { at: '15분', text: '복귀 안내 — 사이니지 · 스태프 안내 · BGM 전환' },
          { at: '20분', text: '착석 확인 후 다음 순서 타이틀 큐' },
        ],
      },
      {
        title: '클로징 · 퇴장',
        span: '',
        style: 'timeline',
        items: [
          { at: '', text: '설문 — 화면 송출 · 동시 접속 확인' },
          { at: '', text: '추첨 — 순서 · 부재 시 재추첨 규칙 사전 공지' },
          { at: '', text: '퇴장 — 출입문 분산 · 주요 인사 동선 우선' },
          { at: '', text: '철거 착수 — 퇴장 완료 확인 후' },
        ],
      },
    ],
  }
}

export function buildRegistrationData(): GuideRegistrationData {
  return {
    type: 'registration',
    lines: null,
    seconds_per_person: 15,
    peak_minutes: 15,
    peak_arrivals: null,
    notes: ['등록 시 명찰 기준 1인 1회 지급', '퇴장 동선에는 배포 대기를 두지 않음'],
  }
}

export function buildVipData(): GuideVipData {
  return { type: 'vip', rows: [] }
}

export function buildSafetyData(): GuideSafetyData {
  return {
    type: 'safety',
    rows: [
      { item: '피난', action: '비상구 · 피난 통로 확보선 표시, 객석 통로 확보 · 소화전 · 비상문 앞 설치 금지', owner: '' },
      { item: '혼잡', action: '등록 대기열 스탠션 동선 분리 · 퇴장은 출입문 분산', owner: '' },
      { item: '응급', action: '응급 키트 · AED 위치 사전 확인 · 베뉴 현장 지원 창구 연계', owner: '' },
      { item: '시공 안전', action: '바닥 보양 · 방염필증 · 높이 제한 · 전기는 등록업체 경유', owner: '' },
      { item: '보험', action: '행사배상책임보험 — 설치일부터 철거 완료일까지', owner: '' },
    ],
  }
}

export function buildEmergencyData(): GuideEmergencyData {
  return {
    type: 'emergency',
    rows: [
      { situation: '영상 장애', action: '백업 PC 전환 · MC 예비 멘트', owner: '영상 오퍼', channel: 'CH3' },
      { situation: '발표자 지연', action: '다음 순서 선진행 · 무대감독이 순서 교체 콜', owner: '무대감독', channel: 'CH1' },
      { situation: '무선 마이크 불량', action: '예비 마이크 즉시 교체', owner: '음향', channel: 'CH3' },
      { situation: '환자 발생', action: '응급 키트 · AED · 베뉴 현장 지원 창구 연락', owner: '운영 팀장', channel: 'CH4' },
    ],
  }
}

/** 표 섹션 1개의 뼈대 데이터 */
export function buildGuideData(kind: GuideSectionKind, ctx: GuideSeedContext): GuideSectionData | null {
  switch (kind) {
    case 'setup':
      return buildSetupData(ctx)
    case 'staffing':
      return buildStaffingData(ctx)
    case 'radio':
      return buildRadioData(ctx)
    case 'raci':
      return buildRaciData(ctx)
    case 'dayplan':
      return buildDayplanData(ctx)
    case 'checklists':
      return buildChecklistsData()
    case 'registration':
      return buildRegistrationData()
    case 'vip':
      return buildVipData()
    case 'safety':
      return buildSafetyData()
    case 'emergency':
      return buildEmergencyData()
    default:
      return null
  }
}

// ── 계산 ─────────────────────────────────────────────────────────────

/** 인력 합계 — 인원을 적은 줄만 더한다 */
export function staffingTotal(data: GuideStaffingData): number {
  return data.rows.reduce((sum, r) => sum + (typeof r.count === 'number' && r.count > 0 ? r.count : 0), 0)
}

export interface RegistrationEstimate {
  /** 분당 처리 인원(소수 첫째 자리) */
  perMinute: number | null
  /** 피크 구간 끝에 남는 줄(명) */
  queue: number | null
  /** 그 줄이 빠지는 데 걸리는 시간(분, 올림) — 줄 끝 사람의 최대 대기 */
  waitMinutes: number | null
}

/**
 * 등록 처리 용량 — 처리 속도 = 라인 × 60 ÷ 1인 처리 초. 피크 구간(분) 동안 도착 인원이 처리량을 넘으면
 * 남는 줄 = 도착 − 처리 속도 × 구간, 최대 대기 = 남는 줄 ÷ 처리 속도(올림). 도착이 구간 안에 고르게 온다는 가정.
 */
export function estimateRegistration(d: GuideRegistrationData): RegistrationEstimate {
  const lines = d.lines ?? 0
  const sec = d.seconds_per_person ?? 0
  if (!(lines > 0) || !(sec > 0)) return { perMinute: null, queue: null, waitMinutes: null }
  const rate = (lines * 60) / sec
  const perMinute = Math.round(rate * 10) / 10
  const minutes = d.peak_minutes ?? 0
  const arrivals = d.peak_arrivals ?? 0
  if (!(minutes > 0) || !(arrivals > 0)) return { perMinute, queue: null, waitMinutes: null }
  const queue = Math.max(0, Math.round(arrivals - rate * minutes))
  return { perMinute, queue, waitMinutes: queue === 0 ? 0 : Math.ceil(queue / rate) }
}

// ── 글(content) 만들기 — 초경량 마크다운(### · -)만 쓴다 ─────────────────

const MARK_SYMBOL: Record<GuideMark, string> = { main: '●', help: '○', none: '—' }

function join(parts: Array<string | null | undefined>, sep = ' · '): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep)
}

function bullets(lines: string[]): string {
  const kept = lines.map((l) => l.trim()).filter(Boolean)
  return kept.length === 0 ? '- (비어 있음)' : kept.map((l) => `- ${l}`).join('\n')
}

const DAYPLAN_GROUP_LABELS: Record<GuideDayplanRow['group'], string> = {
  pre: '사전 준비',
  main: '본행사',
  post: '마무리',
}

export function guideDataMarkdown(data: GuideSectionData): string {
  switch (data.type) {
    case 'setup': {
      const rows = bullets(
        data.rows.map((r) => {
          const head = join([r.date, r.time], ' ')
          const tail = join([r.place, r.owner && `담당 ${r.owner}`])
          return join([head, r.task], ' · ') + (tail ? ` — ${tail}` : '')
        }),
      )
      const notes = data.notes.map((n) => n.trim()).filter(Boolean)
      return notes.length ? `${rows}\n\n### 시설 규정 메모\n${bullets(notes)}` : rows
    }
    case 'staffing': {
      const rows = bullets(
        data.rows.map((r) =>
          join([`${r.role}${typeof r.count === 'number' ? ` ${r.count}명` : ''}`, r.call_time && `콜타임 ${r.call_time}`, r.duty, r.channel]),
        ),
      )
      const total = `합계 ${staffingTotal(data)}명`
      return join([rows, total, data.extra], '\n')
    }
    case 'radio': {
      const rows = bullets(data.channels.map((c) => join([c.code, c.name], ' ') + (c.members.trim() ? ` — ${c.members.trim()}` : '')))
      const chain = data.chain.map((c) => c.trim()).filter(Boolean)
      return join([rows, chain.length ? `지휘 흐름: ${chain.join(' → ')}` : '', data.rule], '\n')
    }
    case 'raci': {
      const legend = '● 주관 · ○ 협조 · — 해당 없음'
      const rows = bullets(
        data.rows.map((r) => {
          const marks = data.parties.map((p, i) => `${p} ${MARK_SYMBOL[r.marks[i] ?? 'none']}`).join(' · ')
          return `${r.area} — ${marks}${r.note.trim() ? ` (${r.note.trim()})` : ''}`
        }),
      )
      return `${legend}\n${rows}`
    }
    case 'dayplan': {
      const groups: GuideDayplanRow['group'][] = ['pre', 'main', 'post']
      return groups
        .map((g) => {
          const rows = data.rows.filter((r) => r.group === g)
          if (rows.length === 0) return ''
          const lines = rows.map((r) => {
            const extra = join([r.av && `무대·AV ${r.av}`, r.owner && `담당 ${r.owner}`])
            return join([r.time, r.segment], ' ') + (r.content.trim() ? ` — ${r.content.trim()}` : '') + (extra ? ` (${extra})` : '')
          })
          return `### ${DAYPLAN_GROUP_LABELS[g]}\n${bullets(lines)}`
        })
        .filter(Boolean)
        .join('\n\n')
    }
    case 'checklists':
      return data.blocks
        .map((b) => {
          const title = join([b.title, b.span])
          const lines = b.items.map((it) => (b.style === 'check' ? `□ ${it.text}` : join([it.at, it.text], ' ')))
          return `### ${title || '구간'}\n${bullets(lines)}`
        })
        .join('\n\n')
    case 'registration': {
      const est = estimateRegistration(data)
      const lines: string[] = []
      if (est.perMinute !== null) {
        lines.push(`접수 라인 ${data.lines} · 1인 ${data.seconds_per_person}초 → 분당 ${est.perMinute}명`)
      }
      if (est.queue !== null && est.waitMinutes !== null) {
        lines.push(
          `피크 ${data.peak_minutes}분 도착 ${data.peak_arrivals}명 → 쌓이는 줄 ${est.queue}명 · 최대 대기 약 ${est.waitMinutes}분`,
        )
      }
      lines.push(...data.notes)
      return bullets(lines)
    }
    case 'vip':
      return bullets(
        data.rows.map((r) => join([r.target, r.arrival && `도착 ${r.arrival}`, r.route, r.seat && `좌석 ${r.seat}`, r.owner && `담당 ${r.owner}`])),
      )
    case 'safety':
      return bullets(data.rows.map((r) => `${r.item}: ${r.action}${r.owner.trim() ? ` (담당 ${r.owner.trim()})` : ''}`))
    case 'emergency':
      return bullets(
        data.rows.map((r) => {
          const who = join([r.owner, r.channel])
          return `${r.situation}: ${r.action}${who ? ` (${who})` : ''}`
        }),
      )
  }
}

/** provider 저장 직전 — data가 있으면 content를 data에서 다시 만든다(사람이 content를 따로 적지 않는다) */
export function withDerivedContent<T extends { data?: GuideSectionData | null; content?: string | null }>(s: T): T {
  return s.data ? { ...s, content: guideDataMarkdown(s.data) } : s
}

// ── 비어 있음 판정(목록 상태·진행률) ─────────────────────────────────────

export function isGuideSectionEmpty(section: {
  kind: GuideSectionKind
  content: string | null
  data?: GuideSectionData | null
}): boolean {
  const d = section.data
  if (d && d.type === section.kind) {
    switch (d.type) {
      case 'setup':
      case 'staffing':
      case 'dayplan':
      case 'vip':
      case 'safety':
      case 'emergency':
      case 'raci':
        return d.rows.length === 0
      case 'radio':
        return d.channels.length === 0
      case 'checklists':
        return d.blocks.every((b) => b.items.length === 0)
      case 'registration':
        return estimateRegistration(d).perMinute === null && d.notes.every((n) => !n.trim())
    }
  }
  return !(section.content ?? '').trim()
}

// ── 옛 문서에 뼈대 끼워 넣기 ───────────────────────────────────────────

/** 정본 12종 가운데 이 문서에 아직 없는 종류(정본 순서) */
export function missingGuideKinds(existing: ReadonlyArray<{ kind: GuideSectionKind }>): GuideSectionKind[] {
  const have = new Set(existing.map((s) => s.kind))
  return GUIDE_CANON_ORDER.filter((k) => !have.has(k))
}

const CANON_INDEX = new Map(GUIDE_CANON_ORDER.map((k, i) => [k, i]))

/**
 * 기존 섹션은 서로의 순서·내용을 그대로 두고, 새 섹션을 정본 순서상 자리에 끼워 넣는다 —
 * 새 종류 k는 "정본 순서가 k보다 뒤인 첫 섹션" 앞에 들어가고, 그런 섹션이 없으면 맨 끝에 붙는다.
 * 정본 밖 종류(role·custom)는 기준이 되지 않는다(건너뛴다).
 */
export function mergeGuideSkeleton<T extends { kind: GuideSectionKind }>(existing: readonly T[], additions: readonly T[]): T[] {
  const out = [...existing]
  const sorted = [...additions].sort((a, b) => (CANON_INDEX.get(a.kind) ?? 99) - (CANON_INDEX.get(b.kind) ?? 99))
  for (const add of sorted) {
    const k = CANON_INDEX.get(add.kind) ?? 99
    const at = out.findIndex((s) => {
      const idx = CANON_INDEX.get(s.kind)
      return idx !== undefined && idx > k
    })
    if (at === -1) out.push(add)
    else out.splice(at, 0, add)
  }
  return out
}

/** 뼈대 섹션 입력 1개(표 섹션) — 제목은 정본 제목, content는 저장 때 provider가 만든다 */
export function guideSkeletonInput(kind: GuideSectionKind, ctx: GuideSeedContext): GuideSectionInput | null {
  const data = buildGuideData(kind, ctx)
  if (!data) return null
  return withDerivedContent({
    kind,
    title: GUIDE_KIND_META[kind].title,
    content: null,
    source_ref: null,
    source_stale: false,
    data,
  })
}
