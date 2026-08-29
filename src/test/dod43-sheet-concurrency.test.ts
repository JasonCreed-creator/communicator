// DoD 43 (v2.6 §24.3) — 동시 접속 계약. 여러 담당자가 같은 보드를 볼 때
//   R-S1 낡은 snapshot_version으로 반영하면 409 conflict
//   R-S2 자동/수동 확인은 **감지만** 한다 — 참가자 데이터를 바꾸지 않는다
//   R-S3 반영에 성공하면 snapshot_version이 오르고 snapshot_at이 원본 수정 시각으로 이동한다
import { beforeEach, describe, expect, it } from 'vitest'
import { SHEET_PROJECT_ID } from '../fixtures/sheetFixtures'
import { ProviderError } from '../lib/errors'
import { MockProvider } from '../providers/mock/MockProvider'

const RB27 = SHEET_PROJECT_ID

let p: MockProvider
beforeEach(() => {
  p = new MockProvider()
})

async function expectProviderError(fn: () => Promise<unknown>, code: string, status: number) {
  try {
    await fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError)
    const err = e as ProviderError
    expect(err.code).toBe(code)
    expect(err.status).toBe(status)
    return err
  }
  throw new Error('오류가 발생하지 않았다')
}

describe('DoD-43 R-S2 자동 확인은 감지까지만', () => {
  it('checkSheetUpdates가 참가자 데이터·스냅숏을 바꾸지 않는다', async () => {
    const before = JSON.stringify(await p.listAttendees(RB27))
    const conn0 = await p.getSheetConnection(RB27)

    const conn = await p.checkSheetUpdates(RB27)

    expect(JSON.stringify(await p.listAttendees(RB27))).toBe(before) // 데이터 무변경
    expect(conn.snapshot_version).toBe(conn0!.snapshot_version) // 스냅숏 그대로
    expect(conn.snapshot_at).toBe(conn0!.snapshot_at)
    // 갱신된 것은 상태·확인 시각·미확인 건수뿐
    expect(conn.state).toBe('stale')
    expect([conn.pending_added, conn.pending_changed, conn.pending_removed]).toEqual([2, 1, 1])
    expect(conn.checked_at).not.toBe(conn0!.checked_at)
  })

  it('반영 전까지 KPI는 직전 스냅숏 기준을 유지한다', async () => {
    const before = await p.getSheetRegistrationStats(RB27)
    await p.checkSheetUpdates(RB27)
    expect(await p.getSheetRegistrationStats(RB27)).toEqual(before)
  })
})

describe('DoD-43 R-S1 두 담당자 시나리오', () => {
  it('먼저 반영한 쪽만 성공하고, 낡은 버전으로 반영하면 409다', async () => {
    // 담당자 A·B가 같은 스냅숏(버전 3)의 차이를 보고 있다
    const seenByA = await p.getSheetDiff(RB27)
    const seenByB = await p.getSheetDiff(RB27)
    expect(seenByA.snapshot_version).toBe(seenByB.snapshot_version)
    expect([seenByA.added, seenByA.changed, seenByA.removed]).toEqual([2, 1, 1])

    // A가 먼저 반영 — 성공(R-S3)
    const applied = await p.applySheetDiff(RB27, seenByA.snapshot_version)
    expect(applied.applied).toBe(4)
    expect([applied.added, applied.changed, applied.removed]).toEqual([2, 1, 1])
    expect(applied.connection.snapshot_version).toBe(seenByA.snapshot_version + 1)
    expect(applied.connection.snapshot_at).toBe(seenByA.source_modified_at)
    expect(applied.connection.state).toBe('connected')
    expect([
      applied.connection.pending_added,
      applied.connection.pending_changed,
      applied.connection.pending_removed,
    ]).toEqual([0, 0, 0])

    // B는 아직 옛 버전을 들고 있다 — 조용히 덮어쓰지 않고 409로 막는다
    const err = await expectProviderError(
      () => p.applySheetDiff(RB27, seenByB.snapshot_version),
      'conflict',
      409,
    )
    expect(err.message).toContain('다른 담당자')
    expect(err.message).toContain('다시 확인')

    // B가 최신 차이를 다시 확인하면 남은 차이가 없다
    const fresh = await p.getSheetDiff(RB27)
    expect(fresh.snapshot_version).toBe(applied.connection.snapshot_version)
    expect(fresh.rows).toEqual([])
    const noop = await p.applySheetDiff(RB27, fresh.snapshot_version)
    expect(noop.applied).toBe(0)
    // 반영할 것이 없으면 버전을 올리지 않는다 — 남의 화면을 헛되이 낡게 만들지 않는다
    expect(noop.connection.snapshot_version).toBe(fresh.snapshot_version)
  })

  it('처음부터 낡은 버전(1)으로 호출해도 409다', async () => {
    await expectProviderError(() => p.applySheetDiff(RB27, 1), 'conflict', 409)
    // 실패한 호출은 아무것도 반영하지 않는다
    const diff = await p.getSheetDiff(RB27)
    expect(diff.rows).toHaveLength(4)
  })
})

describe('DoD-43 권한 끊김 상태의 반영 차단', () => {
  it('revoked면 반영이 막히고 재인증 후 다시 열린다', async () => {
    p.simulateSheetRevoke(RB27)
    const revoked = await p.getSheetConnection(RB27)
    expect(revoked!.state).toBe('revoked')
    expect(revoked!.failure_times).toHaveLength(3)

    // 자동 확인은 실패 시각만 쌓고 스냅숏은 유지한다
    const checked = await p.checkSheetUpdates(RB27)
    expect(checked.state).toBe('revoked')
    expect(checked.failure_times).toHaveLength(4)
    expect(checked.snapshot_at).toBe(revoked!.snapshot_at)

    await expectProviderError(
      () => p.applySheetDiff(RB27, checked.snapshot_version),
      'forbidden',
      403,
    )

    const restored = await p.reauthorizeSheet(RB27)
    expect(restored.state).toBe('stale') // 대기 중 차이가 그대로 남아 있다
    expect(restored.failure_times).toEqual([])
    const applied = await p.applySheetDiff(RB27, restored.snapshot_version)
    expect(applied.applied).toBe(4)
  })
})
