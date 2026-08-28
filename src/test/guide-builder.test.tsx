/** @vitest-environment jsdom */
// v2.5 §23·§10.2 운영가이드 빌더(Phase 3.16d, AH). props 계약은 CuesheetEditor와 동일
// (deliverableId·canEdit) — 라우팅 전체를 세우지 않고 컴포넌트를 직접 MemoryRouter 안에 렌더한다
// (내부 "항목 상세로 이동" 링크가 react-router Link라 라우터 컨텍스트만 필요, ItemDetailPage 배선은
// 이 에이전트 소유 범위 밖 — AF/보드가 담당).
// 대상 픽스처: RE:BUILD 27(dlv-rb27-guide-01) — 4섹션(zone·role·emergency·contacts),
// zone 섹션만 source_stale=true(존별 운영 원본에 한 줄이 나중에 추가된 R-O4 데모).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GuideBuilder from '../components/guide/GuideBuilder'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

const provider = getDataProvider() as MockProvider

const GUIDE_ID = 'dlv-rb27-guide-01'

function renderBuilder(canEdit: boolean) {
  return render(
    <MemoryRouter>
      <GuideBuilder deliverableId={GUIDE_ID} canEdit={canEdit} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('운영가이드 빌더 — RE:BUILD 27 픽스처', () => {
  it('(a) 4섹션이 kind 라벨과 함께 렌더되고, zone 섹션에만 "갱신 있음" 배지가 붙는다', async () => {
    renderBuilder(true)

    expect(await screen.findByRole('heading', { name: '존별 운영' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '역할별 체크리스트' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '비상 대응' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '연락망/비품' })).toBeTruthy()

    expect(screen.getAllByText('갱신 있음')).toHaveLength(1)
    const zoneCard = screen.getByRole('heading', { name: '존별 운영' }).closest('article')!
    expect(within(zoneCard).getByText('갱신 있음')).toBeTruthy()

    // 역할별 체크리스트는 R&R 카드에서 조립된 내용이 보인다(assembleRoleSectionContent 결과)
    const roleCard = screen.getByRole('heading', { name: '역할별 체크리스트' }).closest('article')!
    expect(within(roleCard).getByText(/책임|담당|PM/)).toBeTruthy()
  })

  it('(b) 연락망/비품 섹션은 개인 연락처 경고 문구를 보여주고, 인쇄 기본 제외 클래스를 갖는다', async () => {
    renderBuilder(true)
    const contactsCard = (await screen.findByRole('heading', { name: '연락망/비품' })).closest('article')!
    expect(within(contactsCard).getByText(/개인 연락처.*넣지 마세요/)).toBeTruthy()
    // 기본값(연락망 포함 체크 해제)에서는 인쇄 제외 클래스가 붙는다(R-O6)
    expect(contactsCard.className).toContain('plan-print-hidden')

    // 체크하면 인쇄 제외 클래스가 사라진다
    await userEvent.click(screen.getByRole('checkbox', { name: /연락망 포함/ }))
    await waitFor(() => {
      expect(contactsCard.className).not.toContain('plan-print-hidden')
    })
  })

  it('(c) 차이 확인 → 반영 전에는 자동으로 저장되지 않는다(원본 조회만)', async () => {
    renderBuilder(true)
    const zoneCard = (await screen.findByRole('heading', { name: '존별 운영' })).closest('article')!

    await userEvent.click(within(zoneCard).getByRole('button', { name: '차이 확인' }))

    // 현재 원본에는 "애프터파티 정원 150명 유지 여부" 줄이 있다(존별 운영 원본에 나중에 추가된 줄)
    await within(zoneCard).findByText(/애프터파티 정원 150명 유지 여부/)
    // 저장된 내용(좌측)에는 아직 그 줄이 없다
    const savedLabel = within(zoneCard).getByText('저장된 내용')
    const savedBox = savedLabel.parentElement as HTMLElement
    expect(within(savedBox).queryByText(/애프터파티 정원 150명 유지 여부/)).toBeNull()

    // 차이를 보기만 했을 뿐 — 저장값·stale 플래그는 그대로다(자동 덮어쓰기 없음)
    const stored = await provider.listGuideSections(GUIDE_ID)
    const zone = stored.find((s) => s.kind === 'zone')!
    expect(zone.source_stale).toBe(true)
    expect(zone.content ?? '').not.toMatch(/애프터파티 정원 150명 유지 여부/)
  })

  it('(d) "반영"을 누르면 stale이 해제되고 표시 내용이 원본과 같아진다', async () => {
    renderBuilder(true)
    const zoneCard = (await screen.findByRole('heading', { name: '존별 운영' })).closest('article')!

    await userEvent.click(within(zoneCard).getByRole('button', { name: '차이 확인' }))
    await within(zoneCard).findByText(/애프터파티 정원 150명 유지 여부/)

    await userEvent.click(within(zoneCard).getByRole('button', { name: '반영' }))

    await waitFor(() => {
      expect(within(zoneCard).queryByText('갱신 있음')).toBeNull()
    })
    // 본문에도 갱신된 줄이 반영된다
    expect(within(zoneCard).getByText(/애프터파티 정원 150명 유지 여부/)).toBeTruthy()

    const stored = await provider.listGuideSections(GUIDE_ID)
    const zone = stored.find((s) => s.kind === 'zone')!
    expect(zone.source_stale).toBe(false)
    expect(zone.content ?? '').toMatch(/애프터파티 정원 150명 유지 여부/)
  })

  it('(e) 빈 문서에서는 "기본 4섹션 만들기" 시드 버튼이 보이고, 섹션이 있으면 보이지 않는다', async () => {
    // RB27 가이드(GUIDE_ID)는 이미 섹션이 있으므로 시드 버튼이 없다
    renderBuilder(true)
    await screen.findByRole('heading', { name: '존별 운영' })
    expect(screen.queryByRole('button', { name: '기본 4섹션 만들기' })).toBeNull()
    cleanup()

    const fresh = await provider.createDeliverable({
      project_id: PROJECT_ID_REBUILD27,
      area: 'ops',
      category: '운영가이드',
      title: '테스트 운영가이드(빌더 테스트)',
    })
    render(
      <MemoryRouter>
        <GuideBuilder deliverableId={fresh.id} canEdit />
      </MemoryRouter>,
    )
    const seedBtn = await screen.findByRole('button', { name: '기본 4섹션 만들기' })
    await userEvent.click(seedBtn)

    await screen.findByRole('heading', { name: '존별 운영' })
    expect(screen.getByRole('heading', { name: '역할별 체크리스트' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '비상 대응' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '연락망/비품' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '기본 4섹션 만들기' })).toBeNull()

    const built = await provider.listGuideSections(fresh.id)
    expect(built).toHaveLength(4)
  })

  it('(f) 읽기 전용(canEdit=false)에서는 편집·정렬·삭제·추가·시드·반영 버튼이 전혀 없다', async () => {
    renderBuilder(false)
    await screen.findByRole('heading', { name: '존별 운영' })

    expect(screen.queryByRole('button', { name: '수정' })).toBeNull()
    expect(screen.queryByRole('button', { name: '위로' })).toBeNull()
    expect(screen.queryByRole('button', { name: '아래로' })).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ 섹션 추가' })).toBeNull()
    expect(screen.queryByRole('button', { name: '기본 4섹션 만들기' })).toBeNull()

    // 인쇄·연락망 포함 체크는 열람 기능이라 읽기 전용에서도 남아 있다
    expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /연락망 포함/ })).toBeTruthy()

    // 차이 확인은 볼 수 있지만 "반영" 버튼은 없다
    const zoneCard = screen.getByRole('heading', { name: '존별 운영' }).closest('article')!
    await userEvent.click(within(zoneCard).getByRole('button', { name: '차이 확인' }))
    await within(zoneCard).findByText(/애프터파티 정원 150명 유지 여부/)
    expect(within(zoneCard).queryByRole('button', { name: '반영' })).toBeNull()
  })

  it('(g) 인쇄 버튼은 렌더되는 버튼 요소다(jsdom은 실제 인쇄를 계산하지 않음 — DoD-9 선례 방식)', async () => {
    renderBuilder(true)
    const printBtn = await screen.findByRole('button', { name: '인쇄' })
    expect(printBtn.tagName).toBe('BUTTON')
  })
})
