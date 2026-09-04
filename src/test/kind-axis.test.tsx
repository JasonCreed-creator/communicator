/** @vitest-environment jsdom */
// Phase 3.15b — 행사 설정 ③ 성격 카드(대행형/주최형)와 그 파급 효과.
// R-H1: kind 전환은 표시 계층만 바꾼다 — 사이드바 메뉴·S3 발송 UI가 즉시 반영되고,
// 어떤 행도 삭제되지 않는다(파트너 데이터 왕복 보존).
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('성격 카드 — 확인 다이얼로그 후 전환 (R-H1)', () => {
  it('취소하면 아무것도 바뀌지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '③ 유형·연동' }))

    await userEvent.click(await screen.findByRole('button', { name: /대행형/ }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect((await mockProvider().getProject(PROJECT_ID_HOST)).kind).toBe('host')
  })

  it('확인하면 주최형 → 대행형 → 주최형 왕복 후에도 파트너 5명이 그대로 보존된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    // 시작 상태 — 주최형: 사이드바에 파트너 보드 메뉴가 있다
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })
    expect(await screen.findByRole('link', { name: '파트너 보드' })).toBeTruthy()
    cleanup()

    // 대행형으로 전환
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '③ 유형·연동' }))
    await userEvent.click(await screen.findByRole('button', { name: /^대행형/ }))
    await waitFor(async () => expect((await mockProvider().getProject(PROJECT_ID_HOST)).kind).toBe('agency'))
    cleanup()

    // 대행형에서는 파트너 보드 메뉴가 사라진다
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })
    expect(screen.queryByRole('link', { name: '파트너 보드' })).toBeNull()
    cleanup()

    // 파트너 데이터는 지워지지 않는다(표시 계층만 전환 — R-H1)
    expect((await mockProvider().listPartners(PROJECT_ID_HOST)).length).toBe(5)

    // 다시 주최형으로 복원
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '③ 유형·연동' }))
    await userEvent.click(await screen.findByRole('button', { name: /^주최형/ }))
    await waitFor(async () => expect((await mockProvider().getProject(PROJECT_ID_HOST)).kind).toBe('host'))
    cleanup()

    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })
    expect(await screen.findByRole('link', { name: '파트너 보드' })).toBeTruthy()

    // 왕복 후에도 파트너 5명 그대로
    expect((await mockProvider().listPartners(PROJECT_ID_HOST)).length).toBe(5)
  })
})

describe('S3 — 주최형은 발주처 컨펌 발송 UI를 숨긴다 (DoD 31)', () => {
  it('kind=host인 행사의 내부검토 항목은 컨펌 발송 폼이 없고, agency로 돌아가면 다시 나타난다', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    const created = await p.createDeliverable({
      project_id: PROJECT_ID_HOST,
      area: 'design',
      category: '테스트 제작물',
      title: '주최형 발송 UI 테스트',
    })
    await p.transitionStatus(created.id, 'internal_review')

    // 주최형 — 발송 폼이 없다(반려 폼은 그대로 있다)
    await p.updateProject(PROJECT_ID_HOST, { kind: 'host' })
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute(`/items/${created.id}`)
    expect(await screen.findByRole('heading', { name: '주최형 발송 UI 테스트' })).toBeTruthy()
    // project.data(project.kind)는 detail.data와 별도 비동기 조회라, isHost 안내 문구가 뜰 때까지
    // 기다린 뒤에야 '발송 폼이 없다'는 부재 단정이 안정적이다(그 전엔 일시적으로 폼이 보일 수 있다).
    expect(await screen.findByText(/주최형 행사는 이 화면에서 발주처 컨펌을 발송하지 않습니다/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '컨펌 발송' })).toBeNull()
    expect(screen.getByRole('button', { name: '반려' })).toBeTruthy()
    cleanup()

    // 대행형으로 되돌리면 같은 항목에 발송 폼이 다시 뜬다
    await p.updateProject(PROJECT_ID_HOST, { kind: 'agency' })
    renderRoute(`/items/${created.id}`)
    expect(await screen.findByRole('heading', { name: '주최형 발송 UI 테스트' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: '컨펌 발송' })).toBeTruthy()

    // 테스트 뒤처리 — 다른 describe 블록에 영향 없도록 host로 복원
    await p.updateProject(PROJECT_ID_HOST, { kind: 'host' })
  })
})
