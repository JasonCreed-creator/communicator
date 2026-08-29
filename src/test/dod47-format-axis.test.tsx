/** @vitest-environment jsdom */
// DoD 47 (v2.6 §25 / Phase 3.18a) — format 축·프리셋 시드·S0 4카드.
//
// 이 테스트가 지키는 계약은 §25.1이다: **format의 권한은 3가지뿐**이다.
//   ① 온보딩 시드(1회) ② 견적 모델 결정 ③ 전용 화면의 복합 게이트 구성요소
// 상시 모듈 표시 게이트는 기존 축(kind·event_type·psa_enabled)이 계속 주인이다 — format이
// 두 번째 주인이 되면 §10 진입점 원칙과 충돌한다(감수 C1). 그래서 아래 (c)·(d)가 있다.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'
import {
  FORMAT_PRESETS,
  PRESET_CARD_ORDER,
  presetCardOf,
  usesRevenueModel,
  type PresetCardKey,
} from '../fixtures/formatPresets'
import { EVENT_FORMATS } from '../types/enums'

/** ③ 세팅 미완료 행사 — S0 위저드가 열리는 유일한 픽스처 */
const DRAFT_PROJECT = 'prj-forum-h2'
/** §21.3 주최형 데모 — v2.6에서 format:'dms'로 승격 */
const HOST_PROJECT = 'prj-virtual-summit'
/** §25.7 전시회 데모 [전부 가정] */
const EXPO_PROJECT = 'prj-virtual-expo'

afterEach(cleanup)

/** S0 ③단계까지 이동한다(①·②는 '다음'만 누르면 통과) */
async function openFormatStep() {
  renderRoute('/onboarding')
  await screen.findByRole('heading', { name: '① 행사개요' })
  fireEvent.click(await screen.findByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { name: '② 담당자' })
  fireEvent.click(await screen.findByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { name: '③ 유형·확인' })
}

describe('DoD 47 format 축 (v2.6 §25)', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', DRAFT_PROJECT)
  })

  it('(a) 픽스처 마이그레이션 — 대행형 기존 행사는 conference, 주최형 데모만 판매형 포맷이다', async () => {
    const provider = mockProvider()
    const projects = await provider.listProjects()
    expect(projects.length).toBeGreaterThan(0)
    // 주최형 데모 2건만 판매형 포맷이고, 나머지 대행형 행사는 전부 기본값으로 마이그레이션된다
    const EXPECTED: Record<string, string> = { [HOST_PROJECT]: 'dms', [EXPO_PROJECT]: 'exhibition' }
    for (const summary of projects) {
      const p = await provider.getProject(summary.id)
      expect(EVENT_FORMATS).toContain(p.format)
      expect(p.format, `${p.name}의 format`).toBe(EXPECTED[p.id] ?? 'conference')
      expect(p.format === 'conference' ? p.kind : 'host').toBe(p.kind)
      // 초청제 게이트는 미구현이므로 conference 행사에 audience_model이 붙어선 안 된다(§25.6)
      if (p.format === 'conference') expect(p.audience_model).toBeNull()
    }
    expect(Object.keys(EXPECTED).every((id) => projects.some((s) => s.id === id))).toBe(true)
  })

  it('(b) S0 ③에 4카드가 정의 순서대로 렌더되고, 근거가 약한 프리셋만 "가정"으로 표기된다', async () => {
    await openFormatStep()

    const radios = screen.getAllByRole('radio', { name: /컨퍼런스|DMS|전시회/ })
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([...PRESET_CARD_ORDER])

    // 실측 근거가 1건이거나 미검증인 프리셋(dms·exhibition)만 '가정' 배지를 단다(§25.3·§25.7)
    for (const key of PRESET_CARD_ORDER) {
      const label = screen.getByRole('radio', { name: new RegExp(FORMAT_PRESETS[key].cardLabel) })
        .closest('label') as HTMLElement
      const assumed = within(label).queryByText('가정') !== null
      expect(assumed).toBe(FORMAT_PRESETS[key].assumed)
    }
  })

  it('(c) 카드를 고르면 format·kind·event_type·audience_model이 프리셋 값으로 한 번에 시드된다', async () => {
    await openFormatStep()
    const provider = mockProvider()

    fireEvent.click(screen.getByRole('radio', { name: /DMS/ }))
    await waitFor(async () => {
      const p = await provider.getProject(DRAFT_PROJECT)
      expect(p.format).toBe('dms')
    })
    const seeded = await provider.getProject(DRAFT_PROJECT)
    expect(seeded).toMatchObject(FORMAT_PRESETS.dms.seed)

    // 되돌리기도 시드다 — 컨퍼런스 일반형으로 가면 kind가 대행형으로 함께 돌아온다
    fireEvent.click(screen.getByRole('radio', { name: /컨퍼런스 · 일반형/ }))
    await waitFor(async () => {
      const p = await provider.getProject(DRAFT_PROJECT)
      expect(p.kind).toBe('agency')
    })
    expect(await provider.getProject(DRAFT_PROJECT)).toMatchObject(
      FORMAT_PRESETS.conference_general.seed,
    )
  })

  it('(d) 시드는 잠금이 아니다 — 세부 토글이 카드와 독립으로 kind·event_type을 바꾼다(§25.1)', async () => {
    await openFormatStep()
    const provider = mockProvider()

    fireEvent.click(screen.getByRole('radio', { name: /DMS/ }))
    await waitFor(async () => expect((await provider.getProject(DRAFT_PROJECT)).kind).toBe('host'))

    // 카드는 DMS인 채로 성격만 대행형으로 되돌린다
    fireEvent.change(screen.getByLabelText('행사 성격'), { target: { value: 'agency' } })
    await waitFor(async () => expect((await provider.getProject(DRAFT_PROJECT)).kind).toBe('agency'))

    const after = await provider.getProject(DRAFT_PROJECT)
    expect(after.format).toBe('dms') // format은 따라 바뀌지 않는다
    expect((screen.getByRole('radio', { name: /DMS/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('(e) format은 상시 게이트의 주인이 아니다 — 파트너 보드는 kind가 결정한다(감수 C1)', async () => {
    const provider = mockProvider()
    // format='dms'인데 kind='agency'로 되돌린 상태 = (c)의 결과와 같은 조합
    await provider.updateProject(DRAFT_PROJECT, { format: 'dms', kind: 'agency' })
    cleanup()

    renderRoute('/settings')
    await screen.findByTestId('format-display')
    expect(screen.queryByRole('link', { name: '파트너 보드' })).toBeNull()

    // kind만 host로 올리면(format 불변) 메뉴가 열린다
    await provider.updateProject(DRAFT_PROJECT, { kind: 'host' })
    cleanup()
    renderRoute('/settings')
    expect(await screen.findByRole('link', { name: '파트너 보드' })).toBeTruthy()
    expect((await provider.getProject(DRAFT_PROJECT)).format).toBe('dms')
  })

  it('(f) 이미 전개된 행사의 format 전환은 확인을 거친다 — 취소하면 아무것도 저장되지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', HOST_PROJECT)
    const provider = mockProvider()
    const before = await provider.getProject(HOST_PROJECT)
    expect(before.onboarded_at).not.toBeNull()

    // 완료된 행사는 S0가 안내 화면이므로 FormatStep은 행사 설정 경로에서 확인한다 —
    // 여기서는 컴포넌트 계약만 본다: onboarded_at != null + format 변경 → confirm
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { default: FormatStep } = await import('../components/onboarding/FormatStep')
    const { render } = await import('@testing-library/react')
    render(<FormatStep projectId={HOST_PROJECT} project={before} />)

    fireEvent.click(screen.getByRole('radio', { name: /전시회/ }))
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect((await provider.getProject(HOST_PROJECT)).format).toBe('dms') // 취소 → 무변경
    confirm.mockRestore()
  })


  it('(g) 견적 모델 라우팅 — conference만 비용형이고 dms·exhibition은 판매형이다(§25.1 권한 ②)', () => {
    expect(usesRevenueModel('conference')).toBe(false)
    expect(usesRevenueModel('dms')).toBe(true)
    expect(usesRevenueModel('exhibition')).toBe(true)

    // presetCardOf는 format을 우선한다 — kind·event_type이 독립으로 바뀐 뒤에도 카드가 흔들리지 않는다
    const cases: [Parameters<typeof presetCardOf>[0], Parameters<typeof presetCardOf>[1], PresetCardKey][] = [
      ['conference', 'general', 'conference_general'],
      ['conference', 'recruiting', 'conference_recruiting'],
      ['dms', 'general', 'dms'],
      ['exhibition', 'general', 'exhibition'],
    ]
    for (const [format, eventType, expected] of cases) {
      expect(presetCardOf(format, eventType)).toBe(expected)
    }
  })

  it('(h) S6 ① 개요는 format을 읽기로만 보여주고, DMS 그룹은 dms 행사에서만 뜬다', async () => {
    localStorage.setItem('communicator.currentProjectId', DRAFT_PROJECT)
    await mockProvider().updateProject(DRAFT_PROJECT, { format: 'conference', audience_model: null })
    renderRoute('/settings')

    const display = await screen.findByTestId('format-display')
    expect(display.getAttribute('data-format')).toBe('conference')
    expect(display.tagName).not.toBe('INPUT') // 편집 UI 아님 — 전환은 S0 ③이 확인을 받고 한다
    expect(display.tagName).not.toBe('SELECT')
    expect(screen.queryByTestId('dms-group')).toBeNull()
    cleanup()

    localStorage.setItem('communicator.currentProjectId', HOST_PROJECT)
    renderRoute('/settings')
    const group = await screen.findByTestId('dms-group')
    expect(within(group).getByText('초청제')).toBeTruthy()
    // 세션 정원·부스 수는 program_sessions·partners가 정본 — 여기 사본을 두지 않는다
    expect(within(group).queryAllByRole('spinbutton')).toHaveLength(0)
  })
})
