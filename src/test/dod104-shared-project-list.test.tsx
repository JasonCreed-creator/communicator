/** @vitest-environment jsdom */
// DoD 104 (Phase 6.16 · 2026-09-28 저녁 기획자님 #3 "로그인한 담당자별로 행사가 뜨는 게 아니라 진행 중인 행사 목록은
// 모두에게 공유되고 담당자별로 권한이 있으면 된다 — 로그인한 담당자별로 행사 목록이 리셋되는 것 확인")
//   원인 = RLS projects_select가 멤버·생성자만 허용 → 사람마다 목록이 달랐다. 고침(설계서 v2.22 §6.1·§6.2):
//   열람은 로그인한 내부 사용자 전원(app.can_view) · 쓰기는 역할 그대로 · 명단·정산·발주처 토큰·파트너는 담당자만.
//   ① lib/roles — roles=[](열람자)는 권한 0(전에는 [role]로 되돌려 등록 권한이 있는 것처럼 보였다) · isMemberOf
//   ② mock provider — listProjects().is_member(담당 여부) · 열람 중인 행사에서 getCurrentUser() = roles [] · is_member false ·
//      전역 admin은 어디서나 담당
//   ③ 화면 — 열람 중이면 본문 위 안내 줄(viewer-banner) · 행사 목록 카드 '열람' 배지 · 등록 보드·정산보드는 담당자 전용 안내
//   (서버 = 로컬 Postgres supabase:check 6.16 시나리오: 비멤버 열람 행사·산출물·WBS 전부 / 명단·정산보드·발주처 토큰 0행 / 쓰기 거부)
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { isMemberOf, rolesOf } from '../lib/roles'
import { mockProvider, renderRoute } from './testUtils'

/** 진행 중 행사 하나에서 design(usr-design)의 배정을 빼 '담당 아닌 행사'를 만든다(픽스처는 4명 전원 배정) */
const NOT_MINE = 'prj-rebuild27'

beforeEach(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  await p.removeMember(NOT_MINE, 'usr-design', 'design').catch(() => undefined)
})

afterEach(async () => {
  cleanup()
  const p = mockProvider()
  p.switchUser('usr-pm')
  localStorage.removeItem('communicator.currentProjectId')
  const design = (await p.listPeople()).find((u) => u.id === 'usr-design')
  if (design?.email) await p.addMember(NOT_MINE, { display_name: design.name, email: design.email, role: 'design' }).catch(() => undefined)
})

describe('DoD 104 ① lib/roles — 열람자(roles 0)는 권한 0', () => {
  it('roles가 있으면(빈 배열 포함) 정본 · 없는 옛 값만 단일 role', () => {
    expect(rolesOf({ role: 'reg', roles: [] })).toEqual([])
    expect(rolesOf({ role: 'design' })).toEqual(['design'])
    expect(rolesOf({ role: 'design', roles: ['design', 'ops'] })).toEqual(['design', 'ops'])
    expect(rolesOf(null)).toEqual([])
  })
  it('isMemberOf — 역할이 하나라도 있거나 is_member면 담당, 열람자는 아님', () => {
    expect(isMemberOf({ role: 'reg', roles: [] })).toBe(false)
    expect(isMemberOf({ role: 'reg', roles: [], is_member: true })).toBe(true) // 전역 admin(멤버 아니어도 pm)
    expect(isMemberOf({ role: 'design' })).toBe(true)
    expect(isMemberOf({ role: 'design', roles: ['design'], is_member: false })).toBe(false)
    expect(isMemberOf(null)).toBe(false)
  })
})

describe('DoD 104 ② mock provider — 목록은 전원 공유 · is_member = 담당 여부', () => {
  it('design: 담당 행사 is_member=true · 담당 아닌 행사 false · 열람 중인 행사에서 getCurrentUser = roles 0', async () => {
    const p = mockProvider()
    p.switchUser('usr-design')
    const list = await p.listProjects()
    expect(list.find((s) => s.id === PROJECT_ID)?.is_member).toBe(true)
    expect(list.find((s) => s.id === NOT_MINE)?.is_member).toBe(false)
    // 목록 자체는 담당 여부와 무관하게 전부 온다
    expect(list.some((s) => s.id === NOT_MINE)).toBe(true)

    localStorage.setItem('communicator.currentProjectId', NOT_MINE)
    const me = await p.getCurrentUser()
    expect(me.roles).toEqual([])
    expect(me.role).toBe('reg') // 자리표시(옛 단일 역할 소비자용) — 권한 판정은 roles·is_member
    expect(me.is_member).toBe(false)
    expect(isMemberOf(me)).toBe(false)

    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    const mine = await p.getCurrentUser()
    expect(mine.roles).toEqual(['design'])
    expect(mine.is_member).toBe(true)
  })

  it('전역 admin은 담당이 아니어도 모든 행사에서 is_member=true(pm 권한 — Phase 6.5 규칙 그대로)', async () => {
    const p = mockProvider()
    const list = await p.listProjects() // usr-pm = 픽스처 admin·sales 계정이 아니면 sales — 여기서는 담당 여부만 본다
    expect(list.every((s) => typeof s.is_member === 'boolean')).toBe(true)
    p.switchUser('usr-design')
    p.setAppRole('admin')
    try {
      const asAdmin = await p.listProjects()
      expect(asAdmin.every((s) => s.is_member)).toBe(true)
      localStorage.setItem('communicator.currentProjectId', NOT_MINE)
      const me = await p.getCurrentUser()
      expect(me.roles).toEqual(['pm'])
      expect(me.is_member).toBe(true)
    } finally {
      p.setAppRole('staff')
    }
  })
})

describe('DoD 104 ③ 화면 — 열람 안내 줄 · 목록 배지 · 담당자 전용 화면', () => {
  it('담당 아닌 행사를 보면 본문 위 열람 안내 줄, 담당 행사에서는 없음', async () => {
    mockProvider().switchUser('usr-design')
    localStorage.setItem('communicator.currentProjectId', NOT_MINE)
    renderRoute('/home')
    const banner = await screen.findByTestId('viewer-banner', {}, { timeout: 4000 })
    expect(banner.textContent).toContain('열람만')
    cleanup()
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/home')
    await screen.findByText('홈 대시보드')
    expect(screen.queryByTestId('viewer-banner')).toBeNull()
  })

  it('행사 목록: 담당 아닌 진행 중 행사 카드에 열람 배지, 담당 행사에는 없음', async () => {
    mockProvider().switchUser('usr-design')
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/projects')
    await screen.findByRole('heading', { name: '행사 목록' }, { timeout: 4000 })
    const badges = await screen.findAllByText('열람', {}, { timeout: 4000 })
    expect(badges.length).toBeGreaterThanOrEqual(1)
    // 배정을 뺀 행사의 카드(또는 줄)에는 열람 배지, 담당 행사 카드에는 없다 — 카드·줄은 data-project-id로 집는다
    const notMine = document.querySelector(`[data-project-id="${NOT_MINE}"]`)
    expect(notMine).not.toBeNull()
    expect(within(notMine as HTMLElement).queryAllByText('열람').length).toBe(1)
    const mine = document.querySelector(`[data-project-id="${PROJECT_ID}"]`)
    expect(mine).not.toBeNull()
    expect(within(mine as HTMLElement).queryByText('열람')).toBeNull()
  })

  it('등록 보드·정산보드: 열람 중이면 담당자 전용 안내(빈 표 0), 담당 행사에서는 원래 화면', async () => {
    mockProvider().switchUser('usr-design')
    localStorage.setItem('communicator.currentProjectId', NOT_MINE)
    renderRoute('/registration')
    await screen.findByText(/참가자 명단·RSVP는 이 행사의 담당자만/, {}, { timeout: 4000 })
    expect(screen.queryByRole('button', { name: '참관객' })).toBeNull()
    cleanup()
    renderRoute('/settlement')
    await screen.findByText(/정산보드\(금액\)는 이 행사의 담당자만/, {}, { timeout: 4000 })
    cleanup()
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/registration')
    await screen.findByRole('heading', { name: '등록' }, { timeout: 4000 })
    await screen.findByRole('button', { name: '참관객' }, { timeout: 4000 })
    expect(screen.queryByText(/이 행사의 담당자만 볼 수 있어요/)).toBeNull()
  })
})
