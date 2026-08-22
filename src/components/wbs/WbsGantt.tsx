import { ROLE_BAR_CLASSES } from '../../lib/labels'
import { isDelayed, isImminent, toIsoDate } from '../../lib/wbs'
import type { IsoDate, WbsTask } from '../../types/entities'
import {
  GANTT_AXIS_MAX,
  GANTT_AXIS_MIN,
  diffDays,
  groupTasksByPhase,
  offsetLabel,
  offsetToPercent,
} from './wbsFormat'

/** 간트 바 색 — 디자인지시서 v1 §3·§6 S5: 기본은 역할 컬러(ROLE_BAR_CLASSES),
 *  완료는 역할 컬러 40% 투명, 지연/임박은 역할색을 negative/accent로 대체(우선순위 최상단). */
function barColorClass(task: WbsTask, today: string): string {
  if (isDelayed(task, today)) return 'bg-negative'
  if (isImminent(task, today)) return 'bg-accent'
  if (task.status === 'done') return `${ROLE_BAR_CLASSES[task.role]} opacity-40`
  return ROLE_BAR_CLASSES[task.role]
}

interface WbsGanttProps {
  tasks: WbsTask[]
  eventDate: IsoDate | null
}

/**
 * S5 간트 뷰 — 순수 CSS 바 차트. 가로축 D-42~D+30, offset 기반 % 포지셔닝.
 * 완료=역할색 40% 투명·지연=negative·임박=accent·기본=역할 컬러. 오늘 위치는 축 범위 안일 때만 세로선으로 표시.
 */
export default function WbsGantt({ tasks, eventDate }: WbsGanttProps) {
  const today = toIsoDate(new Date())
  const groups = groupTasksByPhase(tasks)
  const todayOffset = eventDate ? diffDays(today, eventDate) : null
  const showTodayLine = todayOffset !== null && todayOffset >= GANTT_AXIS_MIN && todayOffset <= GANTT_AXIS_MAX

  if (tasks.length === 0) {
    return <p className="text-sm text-ink-cap">표시할 태스크가 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <span className="t-caption">{offsetLabel(GANTT_AXIS_MIN)}</span>
        <span className="t-caption">D-day</span>
        <span className="t-caption">{offsetLabel(GANTT_AXIS_MAX)}</span>
      </div>
      {groups.map((g) => (
        <div key={g.phase_no}>
          <h3 className="mb-1.5 text-xs font-semibold text-brown">
            {g.phase_no}. {g.phase_name}
          </h3>
          <div className="relative space-y-1.5 rounded-md bg-canvas p-2">
            {showTodayLine && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent"
                style={{ left: `${offsetToPercent(todayOffset as number)}%` }}
                aria-hidden="true"
                data-testid="wbs-gantt-today-line"
              />
            )}
            {g.tasks.map((task) => {
              const left = offsetToPercent(task.offset_start)
              const width = Math.max(offsetToPercent(task.offset_end) - left, 0.8)
              return (
                <div key={task.id} className="relative h-5">
                  <div
                    className={`absolute h-5 rounded ${barColorClass(task, today)}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${task.code} ${task.title} · ${offsetLabel(task.offset_start)}~${offsetLabel(task.offset_end)}`}
                    data-testid="wbs-gantt-bar"
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
