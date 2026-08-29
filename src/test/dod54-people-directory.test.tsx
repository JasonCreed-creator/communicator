/** @vitest-environment jsdom */
// DoD 54 (v2.7 §4-2b / Phase 3.20) — 담당자 마스터 + 진입점 정정.
//
// 배경: 담당자를 행사마다 다시 입력하고 있었다. 저장소는 사실 이미 있었다 — 프로필은 이메일로
// 한 사람으로 모이고 행사 간에 재사용된다. 없던 것은 **그것을 보여주고 고치는 경로**였다.
//
// 이 테스트가 지키는 계약:
//   ① 주소록은 **행사와 무관**하다 — 행사를 바꿔도 같은 목록이고, 배정은 그 위에 얹힌다
//   ② 등록한 사람을 **골라서** 배정한다(재입력 없음). 이미 배정된 사람은 후보에 없다
//   ③ 삭제는 **차단**하되 이유를 삼키지 않는다 — 어느 행사에 걸려 있는지 화면이 그대로 말한다
//   ④ 수정은 그 사람이 올라간 **모든 행사**에 함께 반영된다(프로필이 하나이므로)
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const SAMPLE = 'prj-stc26'

describe('DoD 54-A 주소록은 행사와 무관하다 (§4-2b)', () => {
  it('행사를 바꿔도 같은 목록이다 — 배정만 행사별로 다르다', async () => {
    const provider = mockProvider()
    const people = await provider.listPeople()
    expect(people.length).toBeGreaterThanOrEqual(4)

    // 배정은 행사별이지만 사람 자체는 하나다
    const pm = people.find((p) => p.email === 'pm@example.com')!
    expect(pm.assignments.length).toBeGreaterThan(0)
    const projectIds = new Set(pm.assignments.map((a) => a.project_id))
    expect(projectIds.size).toBe(pm.assignments.length) // 한 행사에 중복 배정 없음

    // 현재 행사를 바꿔도 listPeople은 인자를 받지 않는다(=행사 스코프가 아니다)
    localStorage.setItem('communicator.currentProjectId', 'prj-virtual-summit')
    const again = await provider.listPeople()
    expect(again.map((p) => p.id)).toEqual(people.map((p) => p.id))
  })

  it('등록 → 수정 → 삭제가 왕복한다', async () => {
    const provider = mockProvider()
    const created = await provider.createPerson({
      name: '남신입',
      email: 'rookie@example.com',
      title: '기획팀 사원',
      phone: '010-0000-2001',
    })
    expect(created.title).toBe('기획팀 사원')

    const updated = await provider.updatePerson(created.id, { title: '기획팀 대리' })
    expect(updated.title).toBe('기획팀 대리')
    expect(updated.name).toBe('남신입') // 안 건드린 필드는 그대로

    // 배정이 없으니 삭제된다
    await provider.removePerson(created.id)
    expect((await provider.listPeople()).some((p) => p.id === created.id)).toBe(false)
  })

  it('이메일은 신원 키다 — 중복 등록·중복 수정 모두 409', async () => {
    const provider = mockProvider()
    await expect(
      provider.createPerson({ name: '동명이인', email: 'PM@example.com' }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const a = await provider.createPerson({ name: '가상A', email: 'a@example.com' })
    await expect(
      provider.updatePerson(a.id, { email: 'pm@example.com' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await provider.removePerson(a.id)
  })

  it('이름·이메일을 비우는 수정은 거부한다', async () => {
    const provider = mockProvider()
    const people = await provider.listPeople()
    const target = people[0]
    await expect(provider.updatePerson(target.id, { name: '  ' })).rejects.toMatchObject({
      code: 'validation',
    })
    await expect(provider.updatePerson(target.id, { email: '' })).rejects.toMatchObject({
      code: 'validation',
    })
  })
})

describe('DoD 54-B 삭제는 차단하되 이유를 삼키지 않는다 (사용자 결정)', () => {
  it('배정된 행사가 있으면 409이고, 메시지가 어느 행사인지 말한다', async () => {
    const provider = mockProvider()
    const people = await provider.listPeople()
    const assigned = people.find((p) => p.assignments.length > 0)!
    const projectName = assigned.assignments[0].project_name

    await expect(provider.removePerson(assigned.id)).rejects.toMatchObject({ code: 'conflict' })
    // 사유가 비어 있으면 화면이 "왜 안 되는지"를 말할 수 없다
    await provider
      .removePerson(assigned.id)
      .then(() => expect.unreachable('삭제가 통과했다'))
      .catch((e: { message: string }) => {
        expect(e.message).toContain(projectName)
      })
  })

  it('배정을 전부 뺀 뒤에는 삭제된다 — 차단은 영구 금지가 아니다', async () => {
    const provider = mockProvider()
    const person = await provider.createPerson({ name: '가상B', email: 'b@example.com' })
    await provider.addMember(SAMPLE, {
      display_name: person.name,
      email: person.email!,
      role: 'design',
    })
    await expect(provider.removePerson(person.id)).rejects.toMatchObject({ code: 'conflict' })

    await provider.removeMember(SAMPLE, person.id)
    await provider.removePerson(person.id)
    expect((await provider.listPeople()).some((p) => p.id === person.id)).toBe(false)
  })
})

describe('DoD 54-C 배정은 재입력이 아니라 선택이다', () => {
  it('주소록에서 고르면 직함·전화가 함께 따라온다 — 다시 치지 않는다', async () => {
    const provider = mockProvider()
    const person = await provider.createPerson({
      name: '가상C',
      email: 'c@example.com',
      title: '운영팀 매니저',
      phone: '010-0000-3001',
    })

    // 피커가 하는 일과 같다: 고른 사람의 필드를 그대로 넘긴다
    await provider.addMember(SAMPLE, {
      display_name: person.name,
      email: person.email!,
      role: 'ops',
      title: person.title,
      phone: person.phone,
    })

    const members = await provider.listMembers(SAMPLE)
    const added = members.find((m) => m.profile.email === 'c@example.com')!
    expect(added.profile.title).toBe('운영팀 매니저')
    expect(added.profile.phone).toBe('010-0000-3001')

    // 같은 사람을 또 배정하면 409 — 피커는 이런 후보를 애초에 보여주지 않는다
    await expect(
      provider.addMember(SAMPLE, { display_name: person.name, email: person.email!, role: 'reg' }),
    ).rejects.toMatchObject({ code: 'conflict' })

    await provider.removeMember(SAMPLE, person.id)
    await provider.removePerson(person.id)
  })

  it('수정은 그 사람이 올라간 모든 행사에 함께 반영된다', async () => {
    const provider = mockProvider()
    const person = await provider.createPerson({ name: '가상D', email: 'd@example.com' })
    await provider.addMember(SAMPLE, {
      display_name: person.name,
      email: person.email!,
      role: 'design',
    })

    await provider.updatePerson(person.id, { name: '가상D-개명', phone: '010-0000-4001' })

    const members = await provider.listMembers(SAMPLE)
    const m = members.find((x) => x.user_id === person.id)!
    expect(m.profile.name).toBe('가상D-개명')
    expect(m.profile.phone).toBe('010-0000-4001')

    await provider.removeMember(SAMPLE, person.id)
    await provider.removePerson(person.id)
  })
})

describe('DoD 54-D 화면: 담당자 마스터가 전역 진입점으로 있다', () => {
  it('/people이 목록·등록·배정 현황을 보여준다', async () => {
    renderRoute('/people')
    await screen.findByRole('heading', { name: '담당자' })

    const table = await screen.findByRole('table')
    expect(within(table).getByText('김기획')).toBeTruthy()
    // 배정 현황이 보인다 — 삭제가 왜 막히는지 화면에서 미리 읽힌다
    // (여러 사람이 같은 행사에 걸려 있으므로 칩은 당연히 여러 개다)
    expect(within(table).getAllByText(/샘플 테크 컨퍼런스/).length).toBeGreaterThan(0)
  })

  it('배정된 사람을 삭제하면 차단 사유가 화면에 그대로 뜬다', async () => {
    const provider = mockProvider()
    const people = await provider.listPeople()
    const assigned = people.find((p) => p.assignments.length > 0)!

    renderRoute('/people')
    await screen.findByRole('table')
    const row = screen.getByTestId(`person-row-${assigned.id}`)
    // confirm을 통과시킨다
    const original = window.confirm
    window.confirm = () => true
    try {
      fireEvent.click(within(row).getByRole('button', { name: /삭제/ }))
      // 사유는 알림 안에서 읽는다 — 같은 행사명이 표의 배정 칩에도 있으므로 범위를 좁힌다
      const alert = await screen.findByText(/배정된 행사가 있어 삭제할 수 없습니다/)
      expect(alert.textContent).toContain(assigned.assignments[0].project_name)
      expect(alert.textContent).toContain('먼저 빼주세요')
    } finally {
      window.confirm = original
    }
  })
})

describe('DoD 54-E 진입점: 기능이 있는 자리에서 바로 된다 (§10)', () => {
  it('파트너 보드가 설정으로 보내지 않고 그 자리에서 관리하게 한다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-virtual-summit')
    renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })

    // 다른 화면으로 떠넘기는 안내가 사라졌다
    await waitFor(() => {
      expect(screen.queryByText(/행사 설정 ② 담당자에서 파트너를 추가하세요/)).toBeNull()
    })
    // 이 자리에서 여는 관리 경로가 있다
    expect(await screen.findByRole('button', { name: /파트너 관리/ })).toBeTruthy()
  })

  it('빈 상태가 다른 화면 이름이 아니라 행동을 준다', async () => {
    const board = (await import('../pages/PartnerBoardPage')).default
    expect(typeof board).toBe('function')
    const src = (
      await import('../pages/PartnerBoardPage?raw')
    ).default as unknown as string
    // 진입점 원칙: 빈 상태에서 다른 화면으로 보내는 문구를 되살리지 않는다
    expect(src).not.toContain('행사 설정 ② 담당자에서 파트너를 추가하세요')
  })
})
