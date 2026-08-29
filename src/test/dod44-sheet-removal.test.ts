// DoD 44 (v2.6 §24.1-4) — 하드 삭제 금지. 시트에서 사라진 행은 삭제하지 않고
// sheet_status='removed'로 이력을 남기며, 그 행의 체크인 기록도 그대로 보존된다.
import { beforeEach, describe, expect, it } from 'vitest'
import { SHEET_PROJECT_ID } from '../fixtures/sheetFixtures'
import { MockProvider } from '../providers/mock/MockProvider'

const RB27 = SHEET_PROJECT_ID

let p: MockProvider
beforeEach(() => {
  p = new MockProvider()
})

async function named(provider: MockProvider, name: string) {
  return (await provider.listAttendees(RB27)).find((a) => a.name === name)
}

describe('DoD-44 시트에서 사라진 행', () => {
  it('반영해도 행이 사라지지 않고 상태만 바뀐다', async () => {
    const beforeRows = await p.listAttendees(RB27)
    const target = beforeRows.find((a) => a.name === '윤가람')!
    expect(target.sheet_status).toBe('confirmed')

    const diff = await p.getSheetDiff(RB27)
    expect(diff.rows.filter((r) => r.kind === 'removed')).toHaveLength(1)
    const result = await p.applySheetDiff(RB27, diff.snapshot_version)
    expect(result.removed).toBe(1)

    const afterRows = await p.listAttendees(RB27)
    const after = afterRows.find((a) => a.id === target.id)
    expect(after, '행이 삭제되면 안 된다').toBeTruthy()
    expect(after!.sheet_status).toBe('removed')
    // 추가 2건만 늘고 삭제는 0건이다
    expect(afterRows).toHaveLength(beforeRows.length + 2)
  })

  it('제거된 행의 체크인 이력이 보존된다', async () => {
    const before = await named(p, '윤가람')
    expect(before!.checked_in_at).toBeTruthy()

    const diff = await p.getSheetDiff(RB27)
    await p.applySheetDiff(RB27, diff.snapshot_version)

    const after = await named(p, '윤가람')
    expect(after!.checked_in_at).toBe(before!.checked_in_at)
    expect(after!.note).toBe(before!.note)
    expect(after!.badge_no).toBe(before!.badge_no)
  })

  it('제거된 행은 KPI에서 빠지되 명단에는 남는다', async () => {
    const before = (await p.getSheetRegistrationStats(RB27))!
    expect(before.applied).toBe(412)
    expect(before.confirmed).toBe(358)
    expect(before.checked_in).toBe(214)

    const diff = await p.getSheetDiff(RB27)
    await p.applySheetDiff(RB27, diff.snapshot_version)

    const after = (await p.getSheetRegistrationStats(RB27))!
    // 추가 2(신청) − 제거 1(확정·체크인 완료)
    expect(after.applied).toBe(414 - 1)
    expect(after.confirmed).toBe(357)
    expect(after.checked_in).toBe(213)
    // 명단에는 그대로 남아 있다
    expect(await named(p, '윤가람')).toBeTruthy()
  })

  it('이미 제거된 이력 행은 다시 제거 대상으로 계산되지 않는다', async () => {
    const history = await named(p, '노하린')
    expect(history!.sheet_status).toBe('removed')
    expect(history!.checked_in_at).toBeTruthy()

    const diff = await p.getSheetDiff(RB27)
    expect(diff.rows.some((r) => r.attendee_id === history!.id)).toBe(false)

    await p.applySheetDiff(RB27, diff.snapshot_version)
    const after = await named(p, '노하린')
    expect(after!.sheet_status).toBe('removed')
    expect(after!.checked_in_at).toBe(history!.checked_in_at)
    // 반영을 반복해도 이력 행이 다시 흔들리지 않는다
    const again = await p.getSheetDiff(RB27)
    expect(again.rows).toEqual([])
  })

  it('연결을 해제해도 참관객 행은 남는다', async () => {
    const before = (await p.listAttendees(RB27)).length
    await p.disconnectSheet(RB27)
    expect(await p.getSheetConnection(RB27)).toBeNull()
    expect((await p.listAttendees(RB27)).length).toBe(before)
    expect((await named(p, '윤가람'))!.sheet_status).toBe('confirmed')
  })
})
