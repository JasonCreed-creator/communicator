/** @vitest-environment jsdom */
// Phase 3.15b — S-11 파트너 보드(§10.1) + 설정 ②담당자 탭 파트너 스왑.
// 데모 행사 '가상 서밋 2026'(PROJECT_ID_HOST) 픽스처(§21.3) 기준: 파트너 5(다이아1·골드1·실버3),
// HT-1 제출 상태 분포 = 승인 2(final)·검토중 1(pending_approval)·수정요청 1(changes_requested)·
// 미제출 1(requested).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('S-11 파트너 보드', () => {
  it('KPI 4·파트너 5행·검토 필요 1건이 렌더된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')

    expect(await screen.findByRole('heading', { name: '파트너 보드' })).toBeTruthy()

    // KPI: 파트너 수 5 · 이번 마감 접수 4/5(HT-1) · 접수 후 검토 필요 1 · 재요청 미회신 1
    // (Phase 3.17b 접수 대장 전환 — 라벨만 제출→접수 / 검토 대기→검토 필요 / 수정요청→재요청)
    expect(await screen.findByText('파트너 수')).toBeTruthy()
    const partnerCountTile = screen.getByText('파트너 수').closest('.ui-card') as HTMLElement
    // 타일 라벨은 집계보다 먼저 그려진다 — 수치는 비동기 로드를 기다려 단언한다(flake 방지, 3.16.4)
    expect(await within(partnerCountTile).findByText('5')).toBeTruthy()

    const currentDeadlineTile = screen.getByText('이번 마감 접수').closest('.ui-card') as HTMLElement
    expect(within(currentDeadlineTile).getByText('4/5')).toBeTruthy()

    const reviewPendingTile = screen.getByText('접수 후 검토 필요').closest('.ui-card') as HTMLElement
    expect(within(reviewPendingTile).getByText('1')).toBeTruthy()

    const unresolvedTile = screen.getByText('재요청 미회신').closest('.ui-card') as HTMLElement
    expect(within(unresolvedTile).getByText('1')).toBeTruthy()

    // 파트너 표 5행 — 등급·참여 상태(PARTNER_STATUS_LABELS).
    // (3.17b: 파트너명은 KPI '재요청 미회신' 보조 수치에도 나오므로 표 안으로 스코프한다)
    expect(await screen.findByText('가상다이아텍')).toBeTruthy()
    const partnerTable = screen.getByRole('table', { name: '' }) as HTMLElement
    for (const name of ['가상다이아텍', '가상골드플랫폼', '가상실버클라우드', '가상실버네트웍스', '가상실버랩스']) {
      expect(within(partnerTable).getByText(name)).toBeTruthy()
    }
    // (KPI 보조 수치에도 '참여 중 5'가 있으므로 표 안으로 스코프한다)
    expect(within(partnerTable).getAllByText('참여 중').length).toBe(5)

    // 마감 타임라인 — 방향 뱃지(WBS_DIRECTION_LABELS, 코드마다 1행)와 '이번 마감' 강조가 렌더
    expect(screen.getAllByText('▲ 파트너 제출').length).toBeGreaterThan(0)
    // '이번 마감'은 타임라인 강조 뱃지와 파트너 표 열 헤더 둘 다에 쓰인다 — 존재만 확인한다.
    expect(screen.getAllByText('이번 마감').length).toBeGreaterThan(0)
    expect(screen.getAllByText('▼ 주최 통지').length).toBeGreaterThan(0)
    expect(screen.getAllByText('■ 내부').length).toBeGreaterThan(0)
  })

  it('금액 키(계약액 등)는 어디에도 렌더되지 않는다(§21.2 R-H3)', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    const heading = await screen.findByRole('heading', { name: '파트너 보드' })
    // 사이드바(다른 화면의 /settlement 링크 등)는 이 화면 소관이 아니므로 본문(<main>)만 스코프한다.
    const main = heading.closest('main') as HTMLElement
    await screen.findByText('가상다이아텍') // 파트너 표까지 로드된 뒤 스냅숏
    const html = main.innerHTML
    for (const key of ['contract_amount', 'total_amount', 'breakdown', 'settlement', 'margin', 'markup', 'ordered_amount', 'actual_amount']) {
      expect(html).not.toContain(key)
    }
  })

  it('파트너 클릭 시 상세 패널이 열리고, 검토중 파트너는 수정요청에 코멘트가 필수다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })

    // ptn-003(가상실버클라우드) — HT-1이 검토중(pending_approval)
    await userEvent.click(await screen.findByText('가상실버클라우드'))
    expect(await screen.findByRole('heading', { name: /파트너 상세 — 가상실버클라우드/ })).toBeTruthy()

    // 제출물 목록에서 HT-1 항목이 '검토중' 배지로 뜬다(HOST_STATUS_LABELS) — 타임라인에도
    // 같은 코드가 나오므로(*AllBy*) 존재만 확인한다.
    expect(screen.getAllByText('HT-1').length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: '승인' })).toBeTruthy()

    // 코멘트 없이 수정요청 제출 → 클라이언트 가드가 막고 provider 호출 없이 에러만 뜬다
    await userEvent.click(screen.getByRole('button', { name: '수정요청' }))
    expect(await screen.findByText('수정요청은 코멘트가 필수입니다.')).toBeTruthy()
    // 여전히 검토 대기 상태 — 승인 버튼이 그대로 남아 있다(전이가 일어나지 않았다는 증거)
    expect(screen.getByRole('button', { name: '승인' })).toBeTruthy()
  })

  it('대행형 행사에서는 사이드바에 파트너 보드 메뉴가 없다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/home')
    await screen.findByRole('heading', { name: '홈 대시보드' })
    expect(screen.queryByRole('link', { name: '파트너 보드' })).toBeNull()
  })
})

describe('S-11 파트너 보드 — 도움말(P8)', () => {
  it('KPI 4타일+헤더에 InfoTip이 있고 화면당 5개를 넘지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })
    await screen.findByText('가상다이아텍')

    expect(screen.getAllByRole('button', { name: '도움말' }).length).toBe(5)
  })
})

describe('S-11 파트너 보드 — 표 행 클릭 어포던스(P3)', () => {
  it('행마다 우측 화살표(›) 표시가 있다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })
    await screen.findByText('가상다이아텍')

    expect(screen.getAllByText('›').length).toBe(5)
  })
})

describe('S-11 파트너 보드 — 검토 필요 자동 선택·스크롤(P3)', () => {
  beforeEach(() => {
    // jsdom(30)엔 scrollIntoView가 없다 — 호출 여부를 검증하려면 최소 구현을 채워야 한다.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('KPI "접수 후 검토 필요" 타일 클릭 시 검토 필요 항목이 있는 첫 파트너가 선택되고 스크롤된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners')
    await screen.findByRole('heading', { name: '파트너 보드' })
    await screen.findByText('가상다이아텍')
    expect(screen.queryByRole('heading', { name: /파트너 상세/ })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /검토 필요/ }))

    expect(
      await screen.findByRole('heading', { name: /파트너 상세 — 가상실버클라우드/ }),
    ).toBeTruthy()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('?partner= 쿼리로 진입하면 해당 파트너가 자동 선택되고 스크롤된다(홈 위젯 진입 경로)', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/partners?partner=ptn-004')
    await screen.findByRole('heading', { name: '파트너 보드' })

    expect(
      await screen.findByRole('heading', { name: /파트너 상세 — 가상실버네트웍스/ }),
    ).toBeTruthy()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('행사 설정 ②담당자 — 주최형은 파트너 탭으로 대체', () => {
  it('주최형 행사는 파트너 카드, 대행형은 발주처 연락처 카드가 뜬다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '② 담당자' }))
    expect(await screen.findByRole('heading', { name: '파트너' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '발주처 연락처·토큰' })).toBeNull()
    cleanup()

    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '② 담당자' }))
    expect(await screen.findByRole('heading', { name: '발주처 연락처·토큰' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '파트너' })).toBeNull()
  })
})
