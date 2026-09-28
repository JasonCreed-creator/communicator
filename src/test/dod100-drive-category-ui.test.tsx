/** @vitest-environment jsdom */
// DoD 100 (Phase 6.10 · 설계서 v2.21.6 §7.1 · §10 S6 ③) — 화면: 행사 설정 ③ Drive 카드 '보관 분류'.
//   ① pm: 셀렉트 첫 선택지 = '자동 — {성격·유형 판정}' · 폴더 안내 = 저장소/{분류 폴더}/{행사 ID}/ · 고르면 provider에 저장되고 안내가 바뀐다 · '자동'으로 되돌림
//   ② design(비 pm): 셀렉트 비활성 · 안내에 '바꾸면' 문구 0
//   ③ 표준 트리 안내가 저장소/분류/행사 ID
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { DRIVE_CATEGORY_FOLDERS, DRIVE_CATEGORY_LABELS } from '../lib/driveCategory'
import { projectLabel } from '../lib/projectLabel'
import { mockProvider, renderRoute } from './testUtils'

afterEach(async () => {
  cleanup()
  const p = mockProvider()
  p.switchUser('usr-pm')
  await p.updateProject(PROJECT_ID, { drive_category: null })
})

async function driveCard() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
  renderRoute('/settings?tab=integration')
  return await screen.findByTestId('drive-card')
}

describe('DoD 100 · ① 보관 분류 셀렉트(pm)', () => {
  it("첫 선택지 '자동 — MICE Solution · 모객'(샘플 = 대행형 모객형) · 폴더 안내 · 자체행사로 고르면 저장 + 안내 갱신 · 자동으로 되돌림", async () => {
    const card = await driveCard()
    const select = within(card).getByTestId('drive-category-select') as HTMLSelectElement
    const project = await mockProvider().getProject(PROJECT_ID)
    expect(project.kind).toBe('agency')
    expect(project.event_type).toBe('recruiting')
    expect(select.disabled).toBe(false)
    expect(select.value).toBe('')
    expect(select.options[0].textContent).toBe(`자동 — ${DRIVE_CATEGORY_LABELS.solution_recruiting}`)
    expect([...select.options].slice(1).map((o) => o.value)).toEqual(['solution_recruiting', 'solution_general', 'own', 'custom'])
    const folder = within(card).getByTestId('drive-category-folder')
    expect(folder.textContent).toContain(`저장소/${DRIVE_CATEGORY_FOLDERS.solution_recruiting}/${projectLabel(project)}/`)
    expect(folder.textContent).toContain('바꾸면 다음 폴더 보장 때')
    await userEvent.selectOptions(select, 'own')
    await waitFor(async () => expect((await mockProvider().getProject(PROJECT_ID)).drive_category).toBe('own'))
    await waitFor(() => expect(within(card).getByTestId('drive-category-folder').textContent).toContain(`저장소/${DRIVE_CATEGORY_FOLDERS.own}/`))
    expect((within(card).getByTestId('drive-category-select') as HTMLSelectElement).value).toBe('own')
    await userEvent.selectOptions(within(card).getByTestId('drive-category-select'), '')
    await waitFor(async () => expect((await mockProvider().getProject(PROJECT_ID)).drive_category).toBeNull())
    await waitFor(() => expect(within(card).getByTestId('drive-category-folder').textContent).toContain(`저장소/${DRIVE_CATEGORY_FOLDERS.solution_recruiting}/`))
  })

  it('③ 표준 트리 안내 = 저장소/분류/행사 ID', async () => {
    const card = await driveCard()
    expect(card.textContent).toContain('저장소/분류/행사 ID/')
    expect(card.textContent).not.toContain('저장소/연도')
  })
})

describe('DoD 100 · ② design은 읽기 전용', () => {
  it('셀렉트 비활성 · 안내에 바꾸기 문구 0 · 값은 보인다', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    await p.updateProject(PROJECT_ID, { drive_category: 'custom' })
    p.switchUser('usr-design')
    const card = await driveCard()
    const select = within(card).getByTestId('drive-category-select') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('custom')
    const folder = within(card).getByTestId('drive-category-folder')
    expect(folder.textContent).toContain(`저장소/${DRIVE_CATEGORY_FOLDERS.custom}/`)
    expect(folder.textContent).not.toContain('바꾸면')
  })
})
