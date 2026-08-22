import { useLayoutEffect, useRef, useState } from 'react'
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

/** 3.9.1 P2 — 축 눈금: D-42부터 7일 간격 + 축 끝(D+30) */
const TICK_OFFSETS: readonly number[] = (() => {
  const ticks: number[] = []
  for (let t = GANTT_AXIS_MIN; t <= GANTT_AXIS_MAX; t += 7) ticks.push(t)
  if (ticks[ticks.length - 1] !== GANTT_AXIS_MAX) ticks.push(GANTT_AXIS_MAX)
  return ticks
})()

/** 축 폭 대비 바 폭이 라벨(≈28px@1280)보다 좁아지는 경계 — 기간 3일 미만이면 라벨을 바 밖에 표시 */
const LABEL_OUTSIDE_UNDER_DAYS = 3

/** 3.10.1 R2 — 축 끝 눈금(D+30)과 직전 7일 눈금(D+28)의 픽셀 간격이 이보다 좁으면 직전 눈금을 생략 */
const MIN_LAST_TICK_GAP_PX = 28

/** 바 색 위 코드 라벨 잉크 — 연한 reg(#F3B48A) 위만 --ink, 그 외(brown·steel·accent·negative)는 --dark-ink */
function barLabelInk(colorClass: string): string {
  return colorClass.startsWith('bg-role-reg') ? 'text-ink' : 'text-dark-ink'
}

interface WbsGanttProps {
  tasks: WbsTask[]
  eventDate: IsoDate | null
}

/**
 * S5 간트 뷰 — 순수 CSS 바 차트. 가로축 D-42~D+30, offset 기반 % 포지셔닝.
 * 완료=역할색 40% 투명·지연=negative·임박=accent·기본=역할 컬러.
 * 3.9.1 P2: 행 좌측 160px 라벨 컬럼(코드+제목) + 바 코드 라벨 + 7일 간격 눈금(D-day는 brown 실선).
 * 3.10.1 R2: 오늘이 축 범위 안이면 세로선+라벨, 밖이면 캡션은 WBS 카드 토글 왼쪽(WbsBoard 담당) — 축 행은 눈금만.
 */
export default function WbsGantt({ tasks, eventDate }: WbsGanttProps) {
  const today = toIsoDate(new Date())
  const groups = groupTasksByPhase(tasks)
  const todayOffset = eventDate ? diffDays(today, eventDate) : null
  const showTodayLine = todayOffset !== null && todayOffset >= GANTT_AXIS_MIN && todayOffset <= GANTT_AXIS_MAX

  // 3.10.1 R2 — 축 실측 폭으로 D+28↔D+30 간격을 픽셀 환산해 겹침(28px 미만) 시 D+28을 생략
  const axisRef = useRef<HTMLDivElement | null>(null)
  const [axisWidth, setAxisWidth] = useState(0)
  useLayoutEffect(() => {
    const measure = () => setAxisWidth(axisRef.current?.getBoundingClientRect().width ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const lastTick = TICK_OFFSETS[TICK_OFFSETS.length - 1]
  const prevTick = TICK_OFFSETS[TICK_OFFSETS.length - 2]
  const lastGapPx = ((offsetToPercent(lastTick) - offsetToPercent(prevTick)) / 100) * axisWidth
  const omitPrevTick = lastGapPx < MIN_LAST_TICK_GAP_PX
  const ticks = omitPrevTick ? TICK_OFFSETS.filter((t) => t !== prevTick) : TICK_OFFSETS

  if (tasks.length === 0) {
    return <p className="text-sm text-ink-cap">표시할 태스크가 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      {/* 축 눈금 행 — 라벨 컬럼 폭만큼 들여쓰고 눈금 위치에 정렬.
          D+28 생략 시 D+30은 같은 줄 우측 정렬, 공존 시(광폭)만 겹침 방지로 아랫줄 */}
      <div className="flex">
        <div className="w-[160px] shrink-0" />
        <div ref={axisRef} className={`relative flex-1 ${showTodayLine ? 'h-9' : 'h-5'}`}>
          {ticks.map((t, i) => {
            const isFirst = i === 0
            const isLast = i === ticks.length - 1
            return (
              <span
                key={t}
                className={`absolute whitespace-nowrap text-[11px] font-medium tracking-[0.02em] ${
                  t === 0 ? 'text-brown' : 'text-ink-cap'
                } ${isLast && !omitPrevTick ? 'top-4' : 'top-0'}`}
                style={{
                  left: `${offsetToPercent(t)}%`,
                  // Tailwind 이동 유틸리티 클래스명이 DoD 금지 grep 패턴과 부분 일치해 인라인 transform 사용
                  transform: isFirst ? undefined : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
              >
                {offsetLabel(t)}
              </span>
            )
          })}
          {showTodayLine && (
            <span
              className="absolute bottom-0 whitespace-nowrap text-[11px] font-semibold text-accent-deep"
              style={{ left: `${offsetToPercent(todayOffset as number)}%`, transform: 'translateX(-50%)' }}
            >
              오늘
            </span>
          )}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.phase_no}>
          <h3 className="mb-1.5 text-xs font-semibold text-brown">
            {g.phase_no}. {g.phase_name}
          </h3>
          <div className="flex rounded-md bg-canvas p-2">
            {/* 3.9.1 P2 — 고정 160px 라벨 컬럼: 코드 + 제목(truncate). 바 행과 같은 h-5·간격으로 정렬 유지 */}
            <div className="w-[160px] shrink-0 space-y-1.5 pr-3">
              {g.tasks.map((task) => (
                <div key={task.id} className="flex h-5 min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[11px] font-semibold text-brown">{task.code}</span>
                  <span className="truncate text-[11px] text-ink-sub" title={task.title}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative min-w-0 flex-1 space-y-1.5">
              {/* 눈금 세로선 — 7일 간격 대시(--border), D-day만 brown 실선. 생략된 눈금은 세로선도 함께 생략 */}
              {ticks.map((t) => (
                <div
                  key={t}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 w-0 ${
                    t === 0 ? 'border-l border-brown' : 'border-l border-dashed border-border'
                  }`}
                  style={{ left: `${offsetToPercent(t)}%` }}
                />
              ))}
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
                const colorClass = barColorClass(task, today)
                const labelOutside = task.offset_end - task.offset_start < LABEL_OUTSIDE_UNDER_DAYS
                return (
                  <div key={task.id} className="relative h-5">
                    <div
                      className={`absolute h-5 rounded ${colorClass}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${task.code} ${task.title} · ${offsetLabel(task.offset_start)}~${offsetLabel(task.offset_end)}`}
                      data-testid="wbs-gantt-bar"
                    >
                      {!labelOutside && (
                        <span
                          className={`pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-[11px] font-semibold ${barLabelInk(colorClass)}`}
                        >
                          {task.code}
                        </span>
                      )}
                    </div>
                    {labelOutside && (
                      <span
                        className="pointer-events-none absolute inset-y-0 z-10 flex items-center whitespace-nowrap text-[11px] font-semibold text-ink-sub"
                        style={{ left: `calc(${left + width}% + 6px)` }}
                      >
                        {task.code}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
