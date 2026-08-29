/** @vitest-environment jsdom */
// DoD 46 (v2.6 §24 / 3.17.1 T3·T5) — 제외 가시성.
//
// 이메일 필수를 유지한 결정은 "탈락한 행을 화면에서 볼 수 있다"가 성립할 때만 안전하다.
// 여기서 고정하는 것은 두 가지다:
//   ① 시트 행 = 신청 + 제외 + 반영 대기 추가 − 반영 대기 제거  (화면 수치로 성립)
//   ② 제외 목록이 1클릭으로 열리고 사유 3종이 각각 뜬다
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

const SHEET_PROJECT = 'prj-rebuild27'

afterEach(cleanup)

describe('DoD 46 제외 가시성', () => {
  beforeEach(() => {
    localStorage.setItem('communicator.currentProjectId', SHEET_PROJECT)
  })

  it('시트 행 = 신청 + 제외 + 반영 대기 추가 − 반영 대기 제거 항등식이 성립한다', async () => {
    const stats = await mockProvider().getSheetRegistrationStats(SHEET_PROJECT)
    expect(stats).not.toBeNull()
    const s = stats!
    expect(s.source_rows).toBe(s.applied + s.excluded + s.pending_added - s.pending_removed)
  })

  it('KPI 캡션이 항등식의 모든 항을 화면 수치로 드러낸다', async () => {
    renderRoute('/registration')
    const kpi = within(await screen.findByTestId('sheet-kpi'))
    const support = within(await screen.findByTestId('applied-support'))

    const stats = await mockProvider().getSheetRegistrationStats(SHEET_PROJECT)
    const s = stats!

    // 신청(KPI 값) + 캡션의 나머지 세 항이 모두 지면에 있다 — 읽는 사람이 산술을 맞춰 볼 수 있어야 한다
    expect(kpi.getByText(String(s.applied))).toBeTruthy()
    expect(support.getByText(`시트 행 ${s.source_rows}`)).toBeTruthy()
    expect(support.getByRole('button', { name: `제외 ${s.excluded}` })).toBeTruthy()
    expect(support.getByText(`반영 대기 +${s.pending_added} / −${s.pending_removed}`)).toBeTruthy()
  })

  it('제외 건수 1클릭으로 목록이 열리고 사유 3종이 각각 뜬다', async () => {
    renderRoute('/registration')
    const support = within(await screen.findByTestId('applied-support'))

    await userEvent.click(support.getByRole('button', { name: /^제외 \d+$/ }))

    const dialog = await screen.findByRole('dialog', { name: '제외된 시트 행' })
    const table = within(within(dialog).getByRole('table', { name: '제외 목록' }))

    // 사유 3종이 모두 렌더된다(픽스처 6행에 골고루 깔려 있다)
    expect(table.getAllByText('이메일 없음').length).toBeGreaterThan(0)
    expect(table.getAllByText('이메일 중복').length).toBeGreaterThan(0)
    expect(table.getAllByText('필수 항목 누락').length).toBeGreaterThan(0)

    // 행 수 = 제외 건수
    const stats = await mockProvider().getSheetRegistrationStats(SHEET_PROJECT)
    expect(table.getAllByRole('row').slice(1)).toHaveLength(stats!.excluded)

    // 시트로 건너가는 경로 + 원본 연락처는 마스킹으로만
    expect(within(dialog).getByRole('link', { name: '시트에서 고치기 ↗' })).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/sheet\d+@example\.com/)
    expect(dialog.textContent).not.toMatch(/010-0000-\d{4}/)
  })
})
