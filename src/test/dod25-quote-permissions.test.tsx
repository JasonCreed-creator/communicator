/** @vitest-environment jsdom */
// DoD-25 (v2.0) — 권한·모객형 그룹·컴플라이언스:
//  (a) app_role staff는 견적 메뉴 미표시 + /quotes 직접 접근 시 403 화면, sales·admin은 접근
//  (b) 행사 설정 ① 모객형 그룹은 일반형에서 숨김·데이터 보존
//  (c) 컴플라이언스 카드 체크 왕복
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

const provider = mockProvider()

afterEach(() => {
  cleanup()
  provider.setAppRole('sales') // 픽스처 기본으로 복원
})

describe('DoD-25 (a) app_role 게이트', () => {
  it('staff는 사이드바에 견적 메뉴가 없고, sales는 보인다', async () => {
    provider.setAppRole('staff')
    renderRoute('/projects')
    await screen.findAllByText('행사 목록')
    // 그룹 캡션(준비/운영)은 있어도 '견적' 링크는 없다
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /견적/ })).toBeNull()
    })
    cleanup()

    provider.setAppRole('sales')
    renderRoute('/projects')
    await screen.findByRole('link', { name: /견적/ })
  })

  it('staff가 /quotes 직접 접근 시 403 화면 (영업·관리자 권한 필요 안내)', async () => {
    provider.setAppRole('staff')
    renderRoute('/quotes')
    await screen.findByText('403')
    await screen.findByText('견적 메뉴는 영업·관리자 권한이 필요합니다.')
  })

  it('provider 레벨에서도 staff의 listQuotes는 403이다', async () => {
    provider.setAppRole('staff')
    await expect(provider.listQuotes()).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('admin은 /quotes 접근 가능 — 목록·요약이 렌더된다', async () => {
    provider.setAppRole('admin')
    renderRoute('/quotes')
    await screen.findByRole('heading', { name: '견적' })
    // 픽스처: ① 연결 3버전 + 미연결 1건 — 그룹 캡션 렌더
    await screen.findByText(/행사 연결 · 샘플 테크 컨퍼런스 2026/)
    await screen.findByText(/견적만 있음 · 행사 미생성/)
  })
})

describe('DoD-25 (b) 행사 설정 ① 모객형 그룹', () => {
  it('모객형(①)에서는 그룹이 보이고 보장 인원·쇼업 KPI·타겟팅 칩·연결 견적 링크가 렌더된다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/settings')
    const group = await screen.findByTestId('recruiting-group')
    expect(group.textContent).toContain('모객형 전용')
    const guarantee = (await screen.findByLabelText('보장 인원(게런티)')) as HTMLInputElement
    expect(guarantee.value).toBe('80')
    const kpi = (await screen.findByLabelText('쇼업 KPI (%)')) as HTMLInputElement
    expect(kpi.value).toBe('90')
    // 타겟팅 5축 칩 — 픽스처 선택값이 활성 칩으로
    expect(group.textContent).toContain('타겟팅 5축')
    expect(group.textContent).toContain('IT/통신')
    // 연결 견적 링크 (quote_id = quo-003 v3 확정)
    await screen.findByText(/견적 v3 확정 기준/)
    localStorage.removeItem('communicator.currentProjectId')
  })

  it('일반형으로 저장하면 그룹은 숨고, 모객 데이터는 보존된다 (숨김·데이터 보존)', async () => {
    // 일반형 전환 저장(모객 필드는 patch에 포함되지 않음 — 데이터 보존 계약)
    await provider.updateProject('prj-stc26', { event_type: 'general' })
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/settings')
    await screen.findByLabelText('행사명')
    expect(screen.queryByTestId('recruiting-group')).toBeNull()

    const preserved = await provider.getProject('prj-stc26')
    expect(preserved.guarantee_pax).toBe(80)
    expect(preserved.kpi_show_rate).toBe(90)
    expect(preserved.targeting?.industry).toContain('IT/통신')

    // 모객형 복귀 시 그대로 복원
    await provider.updateProject('prj-stc26', { event_type: 'recruiting' })
    cleanup()
    renderRoute('/settings')
    const guarantee = (await screen.findByLabelText('보장 인원(게런티)')) as HTMLInputElement
    expect(guarantee.value).toBe('80')
    localStorage.removeItem('communicator.currentProjectId')
  })

  it('견적 연결 패치는 app_role 게이트를 거친다 — staff는 403', async () => {
    provider.setAppRole('staff')
    await expect(provider.updateProject('prj-stc26', { quote_id: 'quo-002' })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('DoD-25 (c) 컴플라이언스 카드 체크 왕복', () => {
  it('S5에 카드 2종(내부·고객사)이 렌더되고 소통 대상 열이 있다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/schedule')
    await screen.findByText('내부 운영 규약 (역할별 책임)')
    await screen.findByText('고객사 계약 규약')
    // v2.0 §10 S5 — 태스크 표의 '소통 대상' 열
    const targetHeaders = await screen.findAllByText('소통 대상')
    expect(targetHeaders.length).toBeGreaterThan(0)
    localStorage.removeItem('communicator.currentProjectId')
  })

  it('체크 → checked_at 기록, 해제 → null (provider 왕복)', async () => {
    const [card] = await provider.listComplianceCards('prj-stc26')
    expect(card.items[0].checked).toBe(false)

    const checked = await provider.updateComplianceCard(card.id, {
      items: card.items.map((item, i) => (i === 0 ? { ...item, checked: true } : item)),
    })
    expect(checked.items[0].checked).toBe(true)
    expect(checked.items[0].checked_at).not.toBeNull()

    const unchecked = await provider.updateComplianceCard(card.id, {
      items: checked.items.map((item, i) => (i === 0 ? { ...item, checked: false } : item)),
    })
    expect(unchecked.items[0].checked).toBe(false)
    expect(unchecked.items[0].checked_at).toBeNull()

    const roundtrip = await provider.listComplianceCards('prj-stc26')
    expect(roundtrip[0].items[0].checked).toBe(false)
  })

  it('UI에서 체크하면 목록에 반영된다 (체크 왕복 UI)', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    const user = userEvent.setup()
    renderRoute('/schedule')
    await screen.findByText('고객사 계약 규약')
    const boxes = await screen.findAllByRole('checkbox', { name: /D\+1 검수 기한 준수/ })
    expect((boxes[0] as HTMLInputElement).checked).toBe(false)
    await user.click(boxes[0])
    await waitFor(async () => {
      const cards = await provider.listComplianceCards('prj-stc26')
      const client = cards.find((c) => c.kind === 'client')!
      expect(client.items[0].checked).toBe(true)
    })
    localStorage.removeItem('communicator.currentProjectId')
  })
})
