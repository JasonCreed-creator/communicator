// WBS 날짜 전개·지연/임박 판정 — 설계서 v1.4.1 §4-15 산식의 단일 정본.
// 지연 = 미완료 and end_date < today
// 임박 = 미완료 and today <= end_date <= today+2 — 지연과 배타 (v1.4.1에서 정본화).
import type { IsoDate } from '../types/entities'
import type { WbsTask } from '../types/entities'

/** IsoDate + n일 (UTC 기준 날짜 산술 — 시간대 영향 없음) */
export function addDays(isoDate: IsoDate, days: number): IsoDate {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Date → 로컬 기준 IsoDate */
export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** D 오프셋(음수=D-, 0=D-Day, 양수=D+) → event_date 기준 실제 날짜 */
export function offsetToDate(eventDate: IsoDate, offset: number): IsoDate {
  return addDays(eventDate, offset)
}

/** 지연: 미완료이고 end_date가 오늘 이전 (end_date 없으면 판정 불가 → false) */
export function isDelayed(task: Pick<WbsTask, 'status' | 'end_date'>, today: IsoDate): boolean {
  if (task.status === 'done' || !task.end_date) return false
  return task.end_date < today
}

/** 임박: 미완료이고 오늘 ≤ end_date ≤ 오늘+2 (지연과 배타) */
export function isImminent(task: Pick<WbsTask, 'status' | 'end_date'>, today: IsoDate): boolean {
  if (task.status === 'done' || !task.end_date) return false
  return task.end_date >= today && task.end_date <= addDays(today, 2)
}
