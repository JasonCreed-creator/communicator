// DoD 58 (설계서 v2.8 §4-1c) — 행사 하드 삭제(deleteProject).
//
// 사용자 요청은 "앞으로 생성된 행사의 경우 삭제가 가능하도록(관리자 권한설정)"이었다.
// 되돌릴 수 없는 유일한 행사 단위 조작이라, 이 파일은 **지워지는 범위**와 **지워지지 않는 범위**를
// 양쪽 다 못 박는다. 지우는 쪽만 검사하면 "너무 많이 지웠다"를 영영 못 잡기 때문이다.
//
// 이 테스트가 지키는 계약:
//   ① 권한 — 전역 app_role='admin' 하나뿐이다. 행사 pm(=sales·staff 프로필)은 자기 행사라도 못 지운다.
//      권한 판정이 존재 판정보다 **먼저** 온다(없는 행사도 비-admin에겐 403이라 존재가 새지 않는다)
//   ② 없는 행사 = 404
//   ③ 캐스케이드 — 행사에 매인 행은 손자까지 전부 사라진다. 상태 전수 검사로 잡는다
//      (새 테이블이 생겼는데 삭제 경로에 안 붙었으면 여기서 터지도록 일반 스캔으로 썼다)
//   ④ 견적은 **살아남되 연결만 풀린다**(project_id=null) — 금액 원본이자 골든 벡터의 근거다
//   ⑤ 주소록(users·profiles)은 행사 비종속 — 사람은 남고 배정만 사라진다
//   ⑥ 협력사 마스터(vendors)도 행사 비종속 — 건드리지 않는다
//   ⑦ 종료(closed) 행사도 지워진다 — assertWritable이 경로에 없다(대조군: 같은 행사에 쓰기는 409)
//   ⑧ **전부 지운 자리에서 다시 시작할 수 있다** — 행사 0건에서 getCurrentUser가 살아 있고
//      새 행사를 만들 수 있다. 이 파일에서 가장 중요한 테스트다(빈 상태 = 도입 첫날의 상태)
//   ⑨ 토큰은 행사와 함께 죽는다 — /c·/p 링크가 unhandled throw가 아니라 not_found로 닫힌다
//
// 대상은 **MockProvider**다. supabase 경로의 같은 계약(on delete cascade / set null·RLS)은
// `npm run supabase:check`의 SQL 단언이 따로 잠근다.
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_TOKEN, PROJECT_ID, PROJECT_ID_CLOSED } from '../fixtures/sampleProject'
import { PARTNER_DEMO_TOKEN, PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { ProviderError } from '../lib/errors'
import { MockProvider } from '../providers/mock/MockProvider'

/** 삭제 대상 = ① 샘플 테크 컨퍼런스(픽스처 정본 — 항목·버전·컨펌·랜딩·정산·시트가 전부 매달린 행사) */
const SAMPLE = PROJECT_ID

let p: MockProvider
beforeEach(() => {
  p = new MockProvider() // 매 테스트 독립 픽스처(파괴적 조작이라 공유 싱글턴을 쓰지 않는다)
})

/** 삭제는 전역 admin 전용 — 픽스처 기본값은 sales라 매번 승격해서 시작한다 */
function asAdmin(): MockProvider {
  p.setAppRole('admin')
  return p
}

/**
 * Mock은 state를 private으로 두지만 테스트에서는 캐스팅으로 들여다본다
 * (dod42-sheet-oneway.test.ts와 같은 관례 — provider 메서드로는 "안 남았다"를 증명할 수 없다).
 */
type Row = Record<string, unknown>
function stateOf(provider: MockProvider): Record<string, unknown> {
  return (provider as unknown as { state: Record<string, unknown> }).state
}

/** state의 배열 테이블만 [이름, 행들]로 훑는다 — 새 테이블이 생겨도 자동으로 검사 범위에 든다 */
function tables(provider: MockProvider): [string, Row[]][] {
  return Object.entries(stateOf(provider)).filter(
    (entry): entry is [string, Row[]] =>
      Array.isArray(entry[1]) && entry[1].every((r) => typeof r === 'object' && r !== null),
  )
}

function idsIn(rows: Row[], key: string, value: string): string[] {
  return rows.filter((r) => r[key] === value).map((r) => String(r.id))
}

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

describe('DoD-58 ① 권한 — 전역 admin 전용 (§4-1c)', () => {
  it('sales는 거부된다 — 코드·문구까지 고정한다', async () => {
    p.setAppRole('sales')
    const err = await expectProviderError(() => p.deleteProject(SAMPLE), 'forbidden', 403)
    expect(err.message).toBe('행사 삭제는 관리자(admin) 권한이 필요합니다.')
    // 거부는 실제로 아무것도 지우지 않았다
    expect((await p.listProjects()).some((x) => x.id === SAMPLE)).toBe(true)
  })

  it('staff도 거부된다 — 행사 pm 여부와 무관하다', async () => {
    p.setAppRole('staff')
    // 대조군: 이 사용자는 삭제하려는 바로 그 행사의 pm이다(=행사 역할로는 통과할 사람이다)
    expect((await p.getCurrentUser()).role).toBe('pm')
    const err = await expectProviderError(() => p.deleteProject(SAMPLE), 'forbidden', 403)
    expect(err.message).toBe('행사 삭제는 관리자(admin) 권한이 필요합니다.')
  })

  it('admin이면 통과한다 — 반환값은 없다(void)', async () => {
    await expect(asAdmin().deleteProject(SAMPLE)).resolves.toBeUndefined()
  })

  it('권한이 존재보다 먼저 판정된다 — 비-admin에게는 없는 행사도 403이다(존재가 새지 않는다)', async () => {
    p.setAppRole('staff')
    await expectProviderError(() => p.deleteProject('prj-does-not-exist'), 'forbidden', 403)
  })
})

describe('DoD-58 ② 없는 행사 = 404', () => {
  it('모르는 id는 not_found로 거부한다', async () => {
    await expectProviderError(() => asAdmin().deleteProject('prj-does-not-exist'), 'not_found', 404)
  })

  it('같은 행사를 두 번 지우면 두 번째는 404다 — 멱등 삭제로 위장하지 않는다', async () => {
    await asAdmin().deleteProject(SAMPLE)
    await expectProviderError(() => p.deleteProject(SAMPLE), 'not_found', 404)
  })
})

describe('DoD-58 ③ 캐스케이드 — 행사에 매인 것은 손자까지 사라진다', () => {
  it('상태 전수 검사: 지운 행사 id가 state 어디에도 남지 않는다', async () => {
    const state = stateOf(p)
    // 대조군 먼저 — 지우기 전에는 실제로 여기저기 매달려 있다
    const before = (JSON.stringify(state).match(/prj-stc26/g) ?? []).length
    expect(before).toBeGreaterThan(50)

    await asAdmin().deleteProject(SAMPLE)

    expect((JSON.stringify(state).match(/prj-stc26/g) ?? []).length).toBe(0)
  })

  it('project_id를 든 모든 테이블에서 그 행사의 행이 0건이다 (테이블 목록을 하드코딩하지 않는다)', async () => {
    const scoped = tables(p)
      .filter(([, rows]) => rows.some((r) => 'project_id' in r))
      .map(([name]) => name)
    // 삭제 경로가 실제로 훑어야 할 테이블이 이만큼은 된다(스캔이 비어 있으면 이 테스트는 무의미하다)
    expect(scoped.length).toBeGreaterThanOrEqual(15)

    await asAdmin().deleteProject(SAMPLE)

    const leftovers = tables(p)
      .map(([name, rows]) => [name, rows.filter((r) => r.project_id === SAMPLE).length] as const)
      .filter(([, n]) => n > 0)
    expect(leftovers).toEqual([])
  })

  it('손자 테이블(부모 id로만 닿는 것들)도 함께 사라진다 — 고아 행 0건', async () => {
    const state = stateOf(p)
    const deliverableIds = idsIn(state.deliverables as Row[], 'project_id', SAMPLE)
    const landingIds = idsIn(state.landing_pages as Row[], 'project_id', SAMPLE)
    const boardIds = idsIn(state.settlement_boards as Row[], 'project_id', SAMPLE)
    const partnerIds = idsIn(state.partners as Row[], 'project_id', SAMPLE)
    // 대조군 — 지우기 전에는 자식이 실제로 있다
    expect(deliverableIds.length).toBeGreaterThan(0)
    expect(landingIds.length).toBeGreaterThan(0)
    expect(boardIds.length).toBeGreaterThan(0)
    const versionIds = (state.versions as Row[])
      .filter((v) => deliverableIds.includes(String(v.deliverable_id)))
      .map((v) => String(v.id))
    expect(versionIds.length).toBeGreaterThan(0)

    await asAdmin().deleteProject(SAMPLE)

    const orphans = (rows: Row[], key: string, parents: string[]) =>
      rows.filter((r) => parents.includes(String(r[key]))).length
    expect(orphans(state.versions as Row[], 'deliverable_id', deliverableIds)).toBe(0)
    expect(orphans(state.approvals as Row[], 'deliverable_id', deliverableIds)).toBe(0)
    expect(orphans(state.comments as Row[], 'deliverable_id', deliverableIds)).toBe(0)
    expect(orphans(state.cues as Row[], 'deliverable_id', deliverableIds)).toBe(0)
    expect(orphans(state.scenario_blocks as Row[], 'deliverable_id', deliverableIds)).toBe(0)
    expect(orphans(state.guide_sections as Row[], 'deliverable_id', deliverableIds)).toBe(0)
    expect(orphans(state.settlement_buckets as Row[], 'board_id', boardIds)).toBe(0)
    expect(orphans(state.settlement_items as Row[], 'board_id', boardIds)).toBe(0)
    expect(orphans(state.partner_tokens as Row[], 'partner_id', partnerIds)).toBe(0)
    // landing_metrics는 배열이 아니라 랜딩 id 키의 Record다
    const metrics = state.landing_metrics as Record<string, unknown>
    expect(landingIds.filter((id) => id in metrics)).toEqual([])
  })

  it('행사 스코프 조회는 전부 404이거나 빈 값이다 — 삭제된 행사로는 아무것도 읽히지 않는다', async () => {
    await asAdmin().deleteProject(SAMPLE)

    const reads: [string, () => Promise<unknown>][] = [
      ['getProject', () => p.getProject(SAMPLE)],
      ['listMembers', () => p.listMembers(SAMPLE)],
      ['getDashboard', () => p.getDashboard(SAMPLE)],
      ['getOnboardingStatus', () => p.getOnboardingStatus(SAMPLE)],
      ['listDeliverables', () => p.listDeliverables(SAMPLE)],
      ['listMilestones', () => p.listMilestones(SAMPLE)],
      ['listRsvpContacts', () => p.listRsvpContacts(SAMPLE)],
      ['listAttendees', () => p.listAttendees(SAMPLE)],
      ['getRegistrationStats', () => p.getRegistrationStats(SAMPLE)],
      ['listClientContacts', () => p.listClientContacts(SAMPLE)],
      ['listClientTokens', () => p.listClientTokens(SAMPLE)],
      ['listInbox', () => p.listInbox(SAMPLE)],
      ['listProgramSessions', () => p.listProgramSessions(SAMPLE)],
      ['listWbsTasks', () => p.listWbsTasks(SAMPLE)],
      ['listRoleCharters', () => p.listRoleCharters(SAMPLE)],
      ['listPartnerTiers', () => p.listPartnerTiers(SAMPLE)],
      ['listPartners', () => p.listPartners(SAMPLE)],
      ['getPlan', () => p.getPlan(SAMPLE)],
      ['listComplianceCards', () => p.listComplianceCards(SAMPLE)],
      ['listLandingPages', () => p.listLandingPages(SAMPLE)],
      ['getSettlementBoard', () => p.getSettlementBoard(SAMPLE)],
      ['getSheetConnection', () => p.getSheetConnection(SAMPLE)],
    ]

    for (const [label, read] of reads) {
      let value: unknown
      try {
        value = await read()
      } catch (e) {
        expect(e, label).toBeInstanceOf(ProviderError)
        expect((e as ProviderError).code, label).toBe('not_found')
        continue
      }
      // 예외를 안 던지는 조회(스코프를 인자로만 거르는 것들)는 반드시 빈 값이어야 한다
      if (Array.isArray(value)) expect(value, label).toEqual([])
      else expect(value, label).toBeNull()
    }
  })

  it('다른 행사는 멀쩡하다 — 삭제가 옆 행사로 번지지 않는다', async () => {
    const others = (await p.listProjects()).filter((x) => x.id !== SAMPLE).map((x) => x.id)
    const deliverablesBefore = (stateOf(p).deliverables as Row[]).filter(
      (d) => d.project_id !== SAMPLE,
    ).length

    await asAdmin().deleteProject(SAMPLE)

    expect((await p.listProjects()).map((x) => x.id).sort()).toEqual([...others].sort())
    expect((stateOf(p).deliverables as Row[]).length).toBe(deliverablesBefore)
  })
})

describe('DoD-58 ④ 견적은 살아남고 연결만 풀린다 (§4-1c)', () => {
  it('listQuotes 건수는 그대로이고, 그 행사를 가리키던 견적만 project_id=null이 된다', async () => {
    const before = await p.listQuotes()
    const linked = before.filter((q) => q.project_id === SAMPLE).map((q) => q.id)
    const otherLinked = before
      .filter((q) => q.project_id !== null && q.project_id !== SAMPLE)
      .map((q) => `${q.id}:${q.project_id}`)
    expect(linked.length).toBeGreaterThan(0) // 대조군 — 원래는 연결돼 있었다
    expect(otherLinked.length).toBeGreaterThan(0) // 대조군 — 남의 연결도 있다

    await asAdmin().deleteProject(SAMPLE)

    const after = await p.listQuotes()
    expect(after).toHaveLength(before.length) // 한 건도 지워지지 않았다
    for (const id of linked) {
      expect(after.find((q) => q.id === id)!.project_id).toBeNull()
    }
    // 남의 행사 연결은 손대지 않는다
    expect(
      after.filter((q) => q.project_id !== null).map((q) => `${q.id}:${q.project_id}`),
    ).toEqual(otherLinked)
  })

  it('견적 본문(금액)은 그대로 남는다 — 연결만 끊는 것이지 원본을 지우는 것이 아니다', async () => {
    const before = await p.listQuotes()
    const target = before.find((q) => q.project_id === SAMPLE)!
    const totalBefore = target.total_amount

    await asAdmin().deleteProject(SAMPLE)

    const after = (await p.listQuotes()).find((q) => q.id === target.id)!
    expect(after.total_amount).toBe(totalBefore)
    expect(after.status).toBe(target.status)
  })
})

describe('DoD-58 ⑤ 주소록은 행사와 무관하다 (§4-2b 승계)', () => {
  it('사람 4명이 그대로 남고, 배정만 그 행사 몫이 빠진다', async () => {
    const before = await p.listPeople()
    expect(before).toHaveLength(4)
    const assignedToSample = before.filter((x) =>
      x.assignments.some((a) => a.project_id === SAMPLE),
    )
    expect(assignedToSample.length).toBe(4) // 대조군 — 4명 다 이 행사에 올라가 있다

    await asAdmin().deleteProject(SAMPLE)

    const after = await p.listPeople()
    expect(after.map((x) => x.email)).toEqual(before.map((x) => x.email)) // 사람은 그대로
    for (const person of after) {
      expect(person.assignments.some((a) => a.project_id === SAMPLE)).toBe(false)
      // 남은 배정에 '(삭제된 행사)' 자리표시가 새지 않는다 — 멤버 행 자체가 지워졌기 때문이다
      expect(person.assignments.every((a) => a.project_name !== '(삭제된 행사)')).toBe(true)
    }
  })

  it('그 행사에만 배정돼 있던 사람은 배정 0건이 되고, 그때부터 삭제된다(409가 풀린다)', async () => {
    // 픽스처의 4명은 전부 여러 행사에 걸쳐 있으니, "이 행사에만" 있는 사람을 하나 만들어 세운다
    const solo = await p.createPerson({ name: '남단독', email: 'solo@example.com' })
    await p.addMember(SAMPLE, { display_name: '남단독', email: 'solo@example.com', role: 'ops' })

    // 대조군 — 배정이 있으니 삭제가 막히고, 사유에 행사 이름이 들어간다
    const blocked = await expectProviderError(() => p.removePerson(solo.id), 'conflict', 409)
    expect(blocked.message).toContain('샘플 테크 컨퍼런스 2026')

    await asAdmin().deleteProject(SAMPLE)

    const after = (await p.listPeople()).find((x) => x.id === solo.id)!
    expect(after.assignments).toEqual([]) // 배정만 사라졌다
    await expect(p.removePerson(solo.id)).resolves.toBeUndefined() // 이제 지워진다
    expect((await p.listPeople()).some((x) => x.id === solo.id)).toBe(false)
  })
})

describe('DoD-58 ⑥ 협력사 마스터는 행사 비종속', () => {
  it('vendors 건수가 그대로다', async () => {
    const before = await p.listVendors()
    expect(before.length).toBeGreaterThan(0)

    await asAdmin().deleteProject(SAMPLE)

    expect((await p.listVendors()).map((v) => v.id)).toEqual(before.map((v) => v.id))
  })
})

describe('DoD-58 ⑦ 종료 행사도 지워진다 — assertWritable이 경로에 없다', () => {
  it('픽스처의 종료 행사를 바로 지운다', async () => {
    // 대조군 — 같은 행사에 '쓰기'는 종료 가드에 막힌다(409). 삭제만 그 가드를 타지 않는다
    await expectProviderError(
      () => p.updateProjectOverview(PROJECT_ID_CLOSED, { theme: '수정 시도' }),
      'conflict',
      409,
    )

    await expect(asAdmin().deleteProject(PROJECT_ID_CLOSED)).resolves.toBeUndefined()
    expect((await p.listProjects()).some((x) => x.id === PROJECT_ID_CLOSED)).toBe(false)
  })

  it('진행 중 행사를 종료한 뒤 지워도 된다 — 종료는 삭제의 선행 조건이 아니다', async () => {
    const closed = await p.closeProject(SAMPLE, true)
    expect(closed.status).toBe('closed')

    await expect(asAdmin().deleteProject(SAMPLE)).resolves.toBeUndefined()
    expect((await p.listProjects()).some((x) => x.id === SAMPLE)).toBe(false)
  })
})

describe('DoD-58 ⑧ 전부 지운 자리에서 다시 시작한다 (이 파일의 핵심)', () => {
  it('8행사를 전부 지워도 세션이 살아 있고 새 행사를 만들 수 있다', async () => {
    const all = (await p.listProjects()).map((x) => x.id)
    expect(all).toHaveLength(8)

    for (const id of all) await asAdmin().deleteProject(id)

    // ① 목록이 완전히 빈다
    expect(await p.listProjects()).toEqual([])

    // ② 세션이 죽지 않는다 — 멤버십 0건이어도 getCurrentUser는 403이 아니라 최소 권한으로 답한다
    const me = await p.getCurrentUser()
    expect(me.id).toBe('usr-pm')
    expect(me.project_id).toBe('') // 매달릴 행사가 없다
    expect(me.role).toBe('reg') // 행사 역할은 최소 권한으로 떨어진다
    expect(me.app_role).toBe('admin') // 전역 권한은 그대로다(행사에 매인 값이 아니므로)

    // ③ 빈 상태에서 첫 행사를 만들 수 있다 = 도입 첫날과 같은 자리
    const created = await p.createProject({ name: '첫 행사' })
    expect(created.name).toBe('첫 행사')
    expect(created.onboarded_at).toBeNull()
    expect(all).not.toContain(created.id) // 지운 행사의 id를 물려받지 않는다
    expect((await p.listProjects()).map((x) => x.id)).toEqual([created.id])

    // ④ 만든 사람이 pm으로 붙어 세션이 복구된다
    const back = await p.getCurrentUser()
    expect(back.project_id).toBe(created.id)
    expect(back.role).toBe('pm')

    // ⑤ 행사 밖 자산은 이 전멸에도 살아 있다 — 견적은 연결만 풀린 채, 주소록·협력사는 그대로
    const quotes = await p.listQuotes()
    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes.every((q) => q.project_id === null)).toBe(true)
    expect(await p.listPeople()).toHaveLength(4)
    expect((await p.listVendors()).length).toBeGreaterThan(0)
  })
})

describe('DoD-58 ⑨ 토큰은 행사와 함께 죽는다', () => {
  it('/c 발주처 토큰이 not_found로 닫힌다 (unhandled throw가 아니다)', async () => {
    // 대조군 — 지우기 전에는 열린다
    expect((await p.getClientQueue(DEMO_TOKEN)).project_name).toBe('샘플 테크 컨퍼런스 2026')

    await asAdmin().deleteProject(SAMPLE)

    await expectProviderError(() => p.getClientQueue(DEMO_TOKEN), 'not_found', 404)
    await expectProviderError(() => p.getClientStatus(DEMO_TOKEN), 'not_found', 404)
    // 토큰 행 자체가 사라졌다 — 회수(410)가 아니라 미존재(404)다
    expect((stateOf(p).client_tokens as Row[]).some((t) => t.token === DEMO_TOKEN)).toBe(false)
  })

  it('/p 파트너 토큰이 not_found로 닫힌다', async () => {
    // 대조군 — 지우기 전에는 열린다
    expect((await p.getPartnerPortal(PARTNER_DEMO_TOKEN)).partner_name).toBeTruthy()

    await asAdmin().deleteProject(PROJECT_ID_HOST)

    await expectProviderError(() => p.getPartnerPortal(PARTNER_DEMO_TOKEN), 'not_found', 404)
    expect((stateOf(p).partner_tokens as Row[]).some((t) => t.token === PARTNER_DEMO_TOKEN)).toBe(
      false,
    )
  })
})
