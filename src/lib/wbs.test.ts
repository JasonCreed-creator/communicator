// DoD-14 경계값 — 지연/임박 판정의 정본 산식 검증 (시계 비의존: today 고정 주입)
import { describe, expect, it } from 'vitest'
import { addDays, isDelayed, isImminent, offsetToDate } from './wbs'

const TODAY = '2026-08-22'

function task(end_date: string | null, status: 'todo' | 'doing' | 'done' = 'todo') {
  return { status, end_date }
}

describe('wbs 날짜 산술', () => {
  it('addDays·offsetToDate — 월 경계 포함', () => {
    expect(addDays('2026-10-22', -42)).toBe('2026-09-10')
    expect(addDays('2026-10-22', 30)).toBe('2026-11-21')
    expect(offsetToDate('2026-10-22', 0)).toBe('2026-10-22')
  })
})

describe('지연/임박 경계값 (설계서 §4-15, 배타 확정은 PROGRESS 결정 로그)', () => {
  it('end_date=어제 → 지연이며 임박 아님', () => {
    const t = task(addDays(TODAY, -1))
    expect(isDelayed(t, TODAY)).toBe(true)
    expect(isImminent(t, TODAY)).toBe(false)
  })

  it('end_date=오늘 → 임박이며 지연 아님', () => {
    const t = task(TODAY)
    expect(isDelayed(t, TODAY)).toBe(false)
    expect(isImminent(t, TODAY)).toBe(true)
  })

  it('end_date=오늘+2 → 임박 (경계 포함)', () => {
    expect(isImminent(task(addDays(TODAY, 2)), TODAY)).toBe(true)
  })

  it('end_date=오늘+3 → 해당 없음 (경계 밖)', () => {
    const t = task(addDays(TODAY, 3))
    expect(isDelayed(t, TODAY)).toBe(false)
    expect(isImminent(t, TODAY)).toBe(false)
  })

  it('완료 태스크·end_date 없음은 항상 해당 없음', () => {
    expect(isDelayed(task(addDays(TODAY, -5), 'done'), TODAY)).toBe(false)
    expect(isImminent(task(TODAY, 'done'), TODAY)).toBe(false)
    expect(isDelayed(task(null), TODAY)).toBe(false)
    expect(isImminent(task(null), TODAY)).toBe(false)
  })
})
