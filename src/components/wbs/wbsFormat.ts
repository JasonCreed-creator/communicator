// S5 WBS 화면 전용 표시 포맷터. 지연/임박 판정 자체는 lib/wbs.ts(정본)를 그대로 가져다 쓴다 —
// 여기는 오프셋·기간 라벨, 간트 축 좌표, 단계 옵션처럼 "화면에 어떻게 보여줄지"만 담당한다.
import { formatDate, type StatusLevel } from '../../lib/labels'
import { isDelayed, isImminent } from '../../lib/wbs'
import type { IsoDate } from '../../types/entities'
import type { WbsTask } from '../../types/entities'
import type { WbsDirection, WbsStatus } from '../../types/enums'

/** P6-② — host 행사 태스크 행의 방향 뱃지 톤(라벨 문구는 lib/labels.ts WBS_DIRECTION_LABELS 재사용,
 *  파트너 보드 타임라인 점 색과 동일 매핑). 대행형 행사에는 렌더하지 않는다(호출부에서 게이트). */
export const WBS_DIRECTION_BADGE_CLASSES: Record<WbsDirection, string> = {
  partner_submit: 'bg-accent-tint text-accent-deep',
  host_notice: 'bg-steel-tint text-steel',
  internal: 'bg-track text-ink-sub',
}

/** 패턴 기준 시트 §03 WBS 계열 5단계 라벨 — 미착수 / 진행 / 마감 임박 / 완료 / 지연.
 *  todo·doing·done은 저장된 상태, '마감 임박'·'지연'은 마감일에서 파생한다(wbsTaskLevel 참조). */
export const WBS_STATUS_LABELS: Record<WbsStatus, string> = {
  todo: '미착수',
  doing: '진행',
  done: '완료',
}

export const WBS_IMMINENT_LABEL = '마감 임박'
export const WBS_DELAYED_LABEL = '지연'

/** 패턴 기준 시트 §03 — WBS 계열의 의미 단계 매핑(색이 아니라 라벨이 계열을 말한다).
 *  미착수=중립 · 진행=진행 · 마감 임박=주의 · 완료=정상 · 지연=차단. */
export const WBS_STATUS_LEVELS: Record<WbsStatus, StatusLevel> = {
  todo: 'neutral',
  doing: 'progress',
  done: 'positive',
}

export type WbsUrgency = 'delayed' | 'imminent' | null

/** 지연/임박 판정은 lib/wbs.ts(정본)를 그대로 쓴다 — 여기는 표시 단계로 접는 어댑터다. */
export function wbsUrgency(task: Pick<WbsTask, 'status' | 'end_date'>, today: IsoDate): WbsUrgency {
  if (isDelayed(task, today)) return 'delayed'
  if (isImminent(task, today)) return 'imminent'
  return null
}

/** 태스크 하나의 배지 = 의미 단계 + 라벨. 마감 파생(지연·마감 임박)이 저장 상태보다 우선한다. */
export function wbsTaskLevel(
  task: Pick<WbsTask, 'status' | 'end_date'>,
  today: IsoDate,
): { level: StatusLevel; label: string } {
  const urgency = wbsUrgency(task, today)
  if (urgency === 'delayed') return { level: 'blocked', label: WBS_DELAYED_LABEL }
  if (urgency === 'imminent') return { level: 'attention', label: WBS_IMMINENT_LABEL }
  return { level: WBS_STATUS_LEVELS[task.status], label: WBS_STATUS_LABELS[task.status] }
}

const WBS_STATUS_CYCLE: readonly WbsStatus[] = ['todo', 'doing', 'done']

/** 상태 순환 토글: todo → doing → done → todo */
export function nextWbsStatus(current: WbsStatus): WbsStatus {
  const idx = WBS_STATUS_CYCLE.indexOf(current)
  return WBS_STATUS_CYCLE[(idx + 1) % WBS_STATUS_CYCLE.length]
}

/** D 오프셋 라벨: 음수=D-n, 0=D-day, 양수=D+n */
export function offsetLabel(offset: number): string {
  if (offset === 0) return 'D-day'
  return offset < 0 ? `D-${-offset}` : `D+${offset}`
}

/** 오프셋 구간 라벨: 'D-42~D-40' (시작=종료면 단일 표기) */
export function offsetRangeLabel(offsetStart: number, offsetEnd: number): string {
  return offsetStart === offsetEnd ? offsetLabel(offsetStart) : `${offsetLabel(offsetStart)}~${offsetLabel(offsetEnd)}`
}

/** 전개된 실날짜 + 원본 오프셋을 함께 보여주는 기간 표기: 'M월 D일~M월 D일 (D-42~D-40)' */
export function dateRangeLabel(
  startDate: IsoDate | null,
  endDate: IsoDate | null,
  offsetStart: number,
  offsetEnd: number,
): string {
  const dates =
    startDate && endDate
      ? startDate === endDate
        ? formatDate(startDate)
        : `${formatDate(startDate)}~${formatDate(endDate)}`
      : '날짜 미정'
  return `${dates} (${offsetRangeLabel(offsetStart, offsetEnd)})`
}

/** 간트 바 안쪽 기간 표기용 짧은 날짜 — 'M/D' */
export function shortDate(iso: IsoDate): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 간트 바 기간 표기 — 'M/D~M/D'. 전개 날짜가 없으면 오프셋 표기로 갈음한다. */
export function shortDateRangeLabel(
  startDate: IsoDate | null,
  endDate: IsoDate | null,
  offsetStart: number,
  offsetEnd: number,
): string {
  if (!startDate || !endDate) return offsetRangeLabel(offsetStart, offsetEnd)
  return startDate === endDate ? shortDate(startDate) : `${shortDate(startDate)}~${shortDate(endDate)}`
}

/** UTC 자정 기준 날짜 차이(a − b, 일수) — lib/wbs.ts의 addDays와 동일한 UTC 산술 */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const da = new Date(`${a}T00:00:00.000Z`).getTime()
  const db = new Date(`${b}T00:00:00.000Z`).getTime()
  return Math.round((da - db) / 86_400_000)
}

/** 간트 가로축 범위 — 설계서 요구 D-42~D+30(72칸+1 정규화) */
export const GANTT_AXIS_MIN = -42
export const GANTT_AXIS_MAX = 30
const GANTT_AXIS_SPAN = GANTT_AXIS_MAX - GANTT_AXIS_MIN

/** 오프셋 → 축 위 % 위치 (범위 밖은 클램프) */
export function offsetToPercent(offset: number): number {
  const clamped = Math.min(GANTT_AXIS_MAX, Math.max(GANTT_AXIS_MIN, offset))
  return ((clamped - GANTT_AXIS_MIN) / GANTT_AXIS_SPAN) * 100
}

export interface PhaseGroup {
  phase_no: number
  phase_name: string
  tasks: WbsTask[]
}

/** phase_no 오름차순으로 그룹핑 (체크리스트·간트 공용) */
export function groupTasksByPhase(tasks: WbsTask[]): PhaseGroup[] {
  const map = new Map<number, PhaseGroup>()
  for (const task of tasks) {
    if (!map.has(task.phase_no)) {
      map.set(task.phase_no, { phase_no: task.phase_no, phase_name: task.phase_name, tasks: [] })
    }
    map.get(task.phase_no)!.tasks.push(task)
  }
  return [...map.values()].sort((a, b) => a.phase_no - b.phase_no)
}

export interface PhaseSummary {
  total: number
  done: number
  delayed: number
  imminent: number
}

/** 단계 그룹 헤더용 집계 — 완료 n/m + 지연·임박 건수(간트 단계 헤더·체크리스트 그룹 행 공용) */
export function summarizePhase(tasks: WbsTask[], today: IsoDate): PhaseSummary {
  let done = 0
  let delayed = 0
  let imminent = 0
  for (const t of tasks) {
    if (t.status === 'done') done += 1
    const urgency = wbsUrgency(t, today)
    if (urgency === 'delayed') delayed += 1
    else if (urgency === 'imminent') imminent += 1
  }
  return { total: tasks.length, done, delayed, imminent }
}

export interface PhaseOption {
  phase_no: number
  phase_name: string
}

/** 필터 칩 옵션 — 태스크 데이터에서 등장하는 단계만, phase_no 순 */
export function phaseOptionsFrom(tasks: WbsTask[]): PhaseOption[] {
  const map = new Map<number, string>()
  for (const t of tasks) if (!map.has(t.phase_no)) map.set(t.phase_no, t.phase_name)
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([phase_no, phase_name]) => ({ phase_no, phase_name }))
}
