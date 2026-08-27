/** @vitest-environment jsdom */
// P5-② + P6-② (3.15.1 폴리시) — S5 체크리스트: 주최형 파트너 인스턴스 접기 + 방향 뱃지.
// 데모 행사 '가상 서밋 2026'(PROJECT_ID_HOST) 픽스처(§21.3) 기준:
// HT-1 제출 상태 분포 = final 2·pending_approval 1·changes_requested 1·requested 1
// → 이 화면의 "제출" 정의(연결 산출물 status ∈ {pending_approval,approved,final})로는 3/5
// (파트너 보드의 "이번 마감 제출" 4/5와는 분모 산정 대상이 아니라 판정 기준 자체가 달라
//  의도적으로 다르다 — changes_requested를 제출로 보지 않는다. 보고 참조).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('S5 체크리스트 — 주최형 파트너 그룹 접기(P5-②)', () => {
  it('같은 code의 파트너 인스턴스(2건 이상)는 기본 접힘 그룹 행 1개로 렌더된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/schedule')
    await screen.findByText('HT-2') // host_notice 단일 행 — 그룹화 대상 아님, 로드 완료 신호

    // HT-1(partner_submit, 5인스턴스)은 접힌 상태 — 코드 텍스트가 그룹 행 1개에서만 나온다
    expect(screen.getAllByText('HT-1')).toHaveLength(1)
    const groupRow = screen.getByText('HT-1').closest('tr')!
    expect(within(groupRow).getByRole('button', { name: /펼치기/ })).toBeTruthy()
    // 판정: final×2 + pending_approval×1 = 제출 3, changes_requested·requested는 미제출
    expect(within(groupRow).getByText('제출 3/5')).toBeTruthy()
  })

  it('펼치기를 누르면 인스턴스 5행이 파트너명과 함께 노출되고, 접기로 되돌릴 수 있다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/schedule')
    await screen.findByText('HT-2')

    const groupRow = screen.getByText('HT-1').closest('tr')!
    await userEvent.click(within(groupRow).getByRole('button', { name: '펼치기' }))

    // 그룹 행(1) + 인스턴스 행(5) = 코드 텍스트 6번
    expect(screen.getAllByText('HT-1')).toHaveLength(6)
    expect(screen.getByText('가상다이아텍', { selector: 'span' })).toBeTruthy()
    for (const name of ['가상골드플랫폼', '가상실버클라우드', '가상실버네트웍스', '가상실버랩스']) {
      expect(screen.getAllByText(new RegExp(name)).length).toBeGreaterThan(0)
    }

    // groupRow는 펼침/접힘에도 같은 <tr>(요약 행)을 계속 가리킨다 — HT-1이 다시 여러 곳에 나타나는
    // 펼친 상태에서는 코드 텍스트로 재조회하면 모호해지므로 처음 잡아둔 참조를 그대로 쓴다.
    await userEvent.click(within(groupRow).getByRole('button', { name: '접기' }))
    expect(screen.getAllByText('HT-1')).toHaveLength(1)
  })

  it('제출 0/5 그룹(HT-3·HT-4·HT-5·HT-7·HT-8)도 각각 그룹 행으로 접힌다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/schedule')
    await screen.findByText('HT-2')

    for (const code of ['HT-3', 'HT-4', 'HT-5', 'HT-7', 'HT-8']) {
      const row = screen.getByText(code).closest('tr')!
      expect(within(row).getByText('제출 0/5')).toBeTruthy()
      expect(within(row).getByRole('button', { name: '펼치기' })).toBeTruthy()
    }
  })

  it('host_notice·internal 단일 코드(HT-2·HT-6)는 그룹화되지 않는다(펼치기 버튼 없음)', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/schedule')
    await screen.findByText('HT-2')

    const row2 = screen.getByText('HT-2').closest('tr')!
    expect(within(row2).queryByRole('button', { name: /펼치기|접기/ })).toBeNull()
    const row6 = screen.getByText('HT-6').closest('tr')!
    expect(within(row6).queryByRole('button', { name: /펼치기|접기/ })).toBeNull()
  })
})

describe('S5 체크리스트 — 방향 뱃지(P6-②)', () => {
  it('주최형 행사는 행마다 방향 뱃지(▲▼■)를 표기한다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/schedule')
    await screen.findByText('HT-2')

    // HT-1 그룹(partner_submit) 요약 행
    expect(within(screen.getByText('HT-1').closest('tr')!).getByText('▲ 파트너 제출')).toBeTruthy()
    // HT-2(host_notice 단일 행)
    expect(within(screen.getByText('HT-2').closest('tr')!).getByText('▼ 주최 통지')).toBeTruthy()
    // HT-6(internal 단일 행)
    expect(within(screen.getByText('HT-6').closest('tr')!).getByText('■ 내부')).toBeTruthy()
  })

  it('펼친 인스턴스 행에도 방향 뱃지가 각각 표기된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/schedule')
    await screen.findByText('HT-2')

    // partner_submit 그룹은 HT-1·3·4·5·7·8 6개 — 접힌 상태에서도 요약 행마다 뱃지 1개씩(=6)
    const before = screen.getAllByText('▲ 파트너 제출').length
    expect(before).toBe(6)

    await userEvent.click(within(screen.getByText('HT-1').closest('tr')!).getByRole('button', { name: '펼치기' }))
    // HT-1을 펼치면 인스턴스 5행이 각자 뱃지를 하나씩 추가로 얻는다(요약 행 뱃지는 유지)
    expect(screen.getAllByText('▲ 파트너 제출')).toHaveLength(before + 5)
  })
})

describe('S5 체크리스트 — 대행형은 미표기·그대로(회귀 없음)', () => {
  it('대행형 행사에는 방향 뱃지·펼치기 그룹이 렌더되지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/schedule')
    await screen.findByText('1.1')

    for (const label of ['▲ 파트너 제출', '▼ 주최 통지', '■ 내부']) {
      expect(screen.queryByText(label)).toBeNull()
    }
    expect(screen.queryByRole('button', { name: /펼치기/ })).toBeNull()
  })
})
