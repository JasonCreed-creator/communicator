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

function barColorClass(task: WbsTask, today: string): string {
  if (task.status === 'done') return 'bg-emerald-500'
  if (isDelayed(task, today)) return 'bg-red-500'
  if (isImminent(task, today)) return 'bg-amber-500'
  return 'bg-gray-400'
}

interface WbsGanttProps {
  tasks: WbsTask[]
  eventDate: IsoDate | null
}

/**
 * S5 간트 뷰 — 순수 CSS 바 차트. 가로축 D-42~D+30, offset 기반 % 포지셔닝.
 * 완료=emerald·지연=red·임박=amber·기본=gray. 오늘 위치는 축 범위 안일 때만 세로선으로 표시.
 */
export default function WbsGantt({ tasks, eventDate }: WbsGanttProps) {
  const today = toIsoDate(new Date())
  const groups = groupTasksByPhase(tasks)
  const todayOffset = eventDate ? diffDays(today, eventDate) : null
  const showTodayLine = todayOffset !== null && todayOffset >= GANTT_AXIS_MIN && todayOffset <= GANTT_AXIS_MAX

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400">표시할 태스크가 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{offsetLabel(GANTT_AXIS_MIN)}</span>
        <span>D-day</span>
        <span>{offsetLabel(GANTT_AXIS_MAX)}</span>
      </div>
      {groups.map((g) => (
        <div key={g.phase_no}>
          <h3 className="mb-1.5 text-xs font-semibold text-gray-500">
            {g.phase_no}. {g.phase_name}
          </h3>
          <div className="relative space-y-1.5 rounded-md bg-gray-50 p-2">
            {showTodayLine && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-blue-500"
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
