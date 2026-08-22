// S5 WBS 화면 전용 표시 포맷터. 지연/임박 판정 자체는 lib/wbs.ts(정본)를 그대로 가져다 쓴다 —
// 여기는 오프셋·기간 라벨, 간트 축 좌표, 단계 옵션처럼 "화면에 어떻게 보여줄지"만 담당한다.
import { formatDate } from '../../lib/labels'
import type { IsoDate } from '../../types/entities'
import type { WbsTask } from '../../types/entities'
import type { WbsStatus } from '../../types/enums'

export const WBS_STATUS_LABELS: Record<WbsStatus, string> = {
  todo: '예정',
  doing: '진행중',
  done: '완료',
}

/** 뱃지/토글 버튼용 색 — 시맨틱 고정(라벨 텍스트 동반 원칙, CLAUDE.md §6) */
export const WBS_STATUS_BADGE_CLASSES: Record<WbsStatus, string> = {
  todo: 'bg-gray-100 text-gray-700',
  doing: 'bg-blue-50 text-blue-800',
  done: 'bg-emerald-50 text-emerald-800',
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
