// DoD 42 (v2.6 §24.1) — 시트 → 앱 **단방향**. 앱에서 시트로 나가는 경로가 없음을 증명한다.
//   (a) 반영이 앱 소유 필드(체크인·비고)를 절대 건드리지 않는다
//   (b) 원본 행(mock이 재현한 '시트 내용')은 어떤 provider 호출로도 바뀌지 않는다
//   (c) 명단 필드를 앱에서 고치는 provider 메서드가 아예 없다(시그니처 감사)
import { beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { ProviderError } from '../lib/errors'
import { SHEET_PROJECT_ID } from '../fixtures/sheetFixtures'
import { MockProvider } from '../providers/mock/MockProvider'

const RB27 = SHEET_PROJECT_ID

let p: MockProvider
beforeEach(() => {
  p = new MockProvider()
})

async function attendeeNamed(provider: MockProvider, name: string) {
  const rows = await provider.listAttendees(RB27)
  const found = rows.find((a) => a.name === name)
  expect(found, `${name} 행이 있어야 한다`).toBeTruthy()
  return found!
}

describe('DoD-42 (a) 반영은 앱 소유 필드를 덮어쓰지 않는다', () => {
  it('변경 반영 후에도 체크인·비고가 그대로다 (시트 소유 필드만 갱신)', async () => {
    const before = await attendeeNamed(p, '박서연')
    expect(before.group_tag).toBe('연사') // 화면(직전 스냅숏) 값
    expect(before.checked_in_at).toBe('2026-08-29T09:41:00.000Z')
    expect(before.note).toBe('연사 대기실 안내 필요')

    const diff = await p.getSheetDiff(RB27)
    await p.applySheetDiff(RB27, diff.snapshot_version)

    const after = await attendeeNamed(p, '박서연')
    expect(after.group_tag).toBe('VIP') // 시트 소유 — 원본을 따라간다
    expect(after.checked_in_at).toBe(before.checked_in_at) // 앱 소유 — 불변
    expect(after.note).toBe(before.note) // 앱 소유 — 불변
    expect(after.id).toBe(before.id)
  })

  it('제거 반영도 체크인·비고를 지우지 않는다', async () => {
    const before = await attendeeNamed(p, '윤가람')
    const diff = await p.getSheetDiff(RB27)
    await p.applySheetDiff(RB27, diff.snapshot_version)

    const after = await attendeeNamed(p, '윤가람')
    expect(after.sheet_status).toBe('removed')
    expect(after.checked_in_at).toBe(before.checked_in_at)
    expect(after.note).toBe(before.note)
  })

  it('앱에서 만든 체크인은 시트로 나가지 않는다 — 원본 행이 그대로다', async () => {
    const target = await attendeeNamed(p, '이준호')
    const rowsBefore = JSON.stringify(await p.getSheetDiff(RB27))

    await p.toggleCheckin(target.id)
    const diffAfter = await p.getSheetDiff(RB27)
    // 체크인은 시트가 모르는 값이라 차이 표에 등장하지 않는다(차이는 그대로 4건)
    expect(JSON.stringify(diffAfter)).toBe(rowsBefore)
    expect(diffAfter.rows).toHaveLength(4)
  })
})

describe('DoD-42 (b) 원본 행은 앱이 바꾸지 않는다', () => {
  it('반영·체크인·CSV 임포트를 거쳐도 원본 스냅숏(시트 내용)이 불변이다', async () => {
    const sourceOf = (provider: MockProvider) =>
      JSON.stringify(
        // provider 내부의 원본 행 = mock이 재현한 '시트의 현재 모습'
        (provider as unknown as { state: { sheet_source_rows: unknown[] } }).state.sheet_source_rows,
      )
    const before = sourceOf(p)

    const diff = await p.getSheetDiff(RB27)
    await p.applySheetDiff(RB27, diff.snapshot_version)
    const attendee = await attendeeNamed(p, '최은비')
    await p.toggleCheckin(attendee.id)
    await p.importRegistrationCsv(RB27, 'attendees', [
      { name: '현장등록', email: 'walkin-onsite@example.com' },
    ])

    expect(sourceOf(p)).toBe(before)
  })
})

describe('DoD-42 (c) 시트로 쓰는 메서드·명단 편집 메서드가 없다', () => {
  const methods = Object.getOwnPropertyNames(MockProvider.prototype)

  it('시트 관련 공개 메서드는 §24.4의 10종 + mock 전용 스위치 1종뿐이다', () => {
    const sheetMethods = methods.filter((m) => /sheet/i.test(m)).sort()
    expect(sheetMethods).toEqual(
      [
        'applySheetDiff',
        'attendeeFromSheetRow',
        'checkSheetUpdates',
        'connectSheet',
        'disconnectSheet',
        'getSheetConnection',
        'getSheetDiff',
        'getSheetRegistrationStats',
        'mustSheetConn',
        'previewSheetColumns',
        'probeSheet',
        'reauthorizeSheet',
        'sheetConnOf',
        'sheetDiffRows',
        'sheetRowsOf',
        'simulateSheetRevoke',
      ].sort(),
    )
    // 이름만으로도 '쓰기' 방향이 되는 메서드가 없어야 한다
    for (const name of sheetMethods) {
      expect(/^(push|write|update|sync)To/.test(name)).toBe(false)
    }
  })

  it('명단 필드(이름·소속·직함·구분)를 고치는 참관객 편집 메서드가 없다', () => {
    const attendeeWriters = methods.filter((m) => /attendee/i.test(m)).sort()
    // 존재하는 것은 조회·전환·시트 적재뿐 — updateAttendee 류는 없다
    expect(attendeeWriters).toEqual(['attendeeFromSheetRow', 'convertRsvpToAttendee', 'listAttendees'])
    expect(methods.some((m) => /^(update|patch|edit)Attendee/.test(m))).toBe(false)
  })
})

describe('DoD-42 (d) 미연결 행사는 시트 경로가 열리지 않는다', () => {
  it('연결이 없으면 getSheetConnection=null·통계 null(오류가 아님)', async () => {
    expect(await p.getSheetConnection(PROJECT_ID)).toBeNull()
    expect(await p.getSheetRegistrationStats(PROJECT_ID)).toBeNull()
    // 기존 등록 통계는 그대로 동작한다(폴백 경로)
    const legacy = await p.getRegistrationStats(PROJECT_ID)
    expect(legacy.attendee_total).toBeGreaterThan(0)
  })
})

describe('DoD-42 (e) 최초 연결 위저드 — 필수 매핑·연락처 마스킹', () => {
  const URL = 'https://sheets.example.com/spreadsheets/d/demo/edit'

  it('탭 4개 중 표가 아닌 1개는 선택할 수 없다', async () => {
    const probe = await p.probeSheet(PROJECT_ID, URL)
    expect(probe.tabs).toHaveLength(4)
    expect(probe.tabs.filter((t) => !t.selectable)).toHaveLength(1)
    expect(probe.service_account).toContain('@')
    await expect(p.previewSheetColumns(PROJECT_ID, URL, '안내문_초안')).rejects.toBeInstanceOf(
      ProviderError,
    )
  })

  it('컬럼 미리보기의 이메일·전화는 마스킹된 값으로만 내려온다', async () => {
    const preview = await p.previewSheetColumns(PROJECT_ID, URL, '참가자_확정')
    const email = preview.find((c) => c.suggested === 'email')!
    const phone = preview.find((c) => c.suggested === 'phone')!
    expect(email.masked).toBe(true)
    expect(email.sample).toContain('****')
    expect(email.sample).not.toContain('kimdohyun')
    expect(phone.masked).toBe(true)
    expect(phone.sample).toMatch(/\*{4}/)
    // 이름·소속처럼 민감하지 않은 열은 마스킹하지 않는다
    expect(preview.find((c) => c.suggested === 'name')!.masked).toBe(false)
  })

  it('필수 매핑(이름·이메일)이 없으면 422로 막힌다', async () => {
    const bad = p.connectSheet(PROJECT_ID, {
      url: URL,
      tab_name: '참가자_확정',
      mapping: [
        { column: '성명', field: 'name' },
        { column: '회사/기관', field: 'org' },
      ],
      first_row_is_header: true,
    })
    await expect(bad).rejects.toMatchObject({ code: 'validation', status: 400 })
    expect(await p.getSheetConnection(PROJECT_ID)).toBeNull()
  })

  it('연결에 성공하면 첫 스냅숏이 적재되고 버전 1에서 시작한다', async () => {
    const conn = await p.connectSheet(PROJECT_ID, {
      url: URL,
      tab_name: '참가자_확정',
      mapping: [
        { column: '성명', field: 'name' },
        { column: '이메일', field: 'email' },
        { column: '구분', field: 'group_tag' },
      ],
      first_row_is_header: true,
    })
    expect(conn.state).toBe('connected')
    expect(conn.snapshot_version).toBe(1)
    expect(conn.auto_check_minutes).toBe(15)
    const stats = (await p.getSheetRegistrationStats(PROJECT_ID))!
    expect(stats.applied).toBeGreaterThan(0)
    // 갓 연결한 직후에는 확인할 차이가 없다
    expect((await p.getSheetDiff(PROJECT_ID)).rows).toEqual([])
  })
})
