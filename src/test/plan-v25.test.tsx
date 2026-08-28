/** @vitest-environment jsdom */
// v2.5 §23 — S9 운영계획서 확장(Phase 3.16d, AH): ⑦비상 대응 신설·② 세션별 시나리오 펼침·
// ③ 존별 운영에 운영가이드 존 섹션 반영. 대상: RE:BUILD 27(prj-rebuild27, §23.4) — 시나리오
// 1건(8블록·3세션 그룹)·운영가이드 1건(4섹션, zone stale=true). 회귀 대상: 샘플 테크(prj-stc26,
// scenario·guide 데이터 없음) — 기존 7섹션(v1.3 이후) 렌더가 그대로 유지되고 ⑦비상 대응만 추가된다.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('v2.5 S9 ⑦비상 대응 — RE:BUILD 27', () => {
  it('(a) ⑦비상 대응 섹션이 렌더되고 운영가이드의 emergency 섹션 본문을 보여준다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')

    const heading = await screen.findByRole('heading', { name: '07 비상 대응' })
    const section = heading.closest('section')!
    // guideAssembly.EMERGENCY_SECTION_PLACEHOLDER 원문의 일부
    expect(within(section).getByText(/1차 대응자와 절차를 작성하세요/)).toBeTruthy()
  })

  it('(b) 목차 레일(옛 PlanProgressSummary)에도 07 비상 대응이 노출된다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '07 비상 대응' })
    // v2.5.2 정렬 — 진행률 요약 6칸 그리드를 좌측 고정 목차 레일이 대체했다(의미 유지)
    const toc = screen.getByRole('navigation', { name: '운영계획서 목차' })
    expect(within(toc).getByText('비상 대응')).toBeTruthy()
    expect(within(toc).getByText('07')).toBeTruthy()
  })

  it('(c) 인쇄 시 숨김 대상이 아니다 — plan-section 구조 계약(page-break 회피) 적용', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')
    const heading = await screen.findByRole('heading', { name: '07 비상 대응' })
    const section = heading.closest('section')!
    expect(section.className).toContain('plan-section')
    expect(section.className).not.toContain('plan-print-hidden')
  })

  it('(d) ③존별 운영에 "운영가이드 존 섹션" 블록이 상단에 표시되고 stale이면 배지가 붙는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')
    const heading = await screen.findByRole('heading', { name: /존별 운영/ })
    const section = heading.closest('section')!
    const guideBlock = await within(section).findByText('운영가이드 존 섹션')
    const guideArticle = guideBlock.closest('div')!.parentElement as HTMLElement
    expect(within(guideArticle).getByText('갱신 있음')).toBeTruthy()
  })
})

describe('v2.5 S9 ② 세션별 시나리오 펼침 — RE:BUILD 27', () => {
  it('(a) 시나리오 블록이 연결된 세션에만 "진행 시나리오 펼침" 토글이 보인다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')

    // §23.4 픽스처 — 오프닝 키노트·트랙 세션·애프터파티 3세션에 블록 연결
    const openingRow = (await screen.findByText(/오프닝 키노트/)).closest('tr')!
    expect(within(openingRow).getByRole('button', { name: '진행 시나리오 펼침' })).toBeTruthy()
  })

  it('(b) 토글을 펼치면 블록(시각·구분·대본)이 나타나고 다시 접으면 사라진다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID_REBUILD27)
    renderRoute('/plan')

    const openingRow = (await screen.findByText(/오프닝 키노트/)).closest('tr')!
    await userEvent.click(within(openingRow).getByRole('button', { name: '진행 시나리오 펼침' }))

    // scb-rb27-03: video 블록(10:35), 대본에 'M-02' 토큰 포함
    expect(await screen.findByText(/M-02/)).toBeTruthy()
    expect(screen.getByText('영상')).toBeTruthy() // SCENARIO_KIND_LABELS.video
    expect(screen.getByText('10:35')).toBeTruthy() // scb-rb27-03 블록 time(유일값)

    await userEvent.click(within(openingRow).getByRole('button', { name: '진행 시나리오 접기' }))
    await waitFor(() => {
      expect(screen.queryByText(/M-02/)).toBeNull()
    })
  })
})

describe('v2.5 회귀 — 샘플 테크(prj-stc26, 시나리오·운영가이드 데이터 없음)', () => {
  it('(a) 기존 6섹션(개요·프로그램·큐시트·존별·제작물·등록) + ⑦비상 대응까지 8섹션, 시나리오 펼침 토글 없음', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/plan')

    await screen.findByRole('heading', { name: /행사개요/ })
    expect(screen.getByRole('heading', { name: /프로그램/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '03 큐시트' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /존별 운영/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /제작물 리스트/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /등록 통계/ })).toBeTruthy()
    // v2.5 신설 — 운영가이드 항목이 없어 emergency는 null이지만 섹션 자체는 항상 렌더된다(빈 상태)
    const emergencyHeading = screen.getByRole('heading', { name: '07 비상 대응' })
    const emergencySection = emergencyHeading.closest('section')!
    expect(within(emergencySection).getByText('등록된 운영가이드 항목이 없습니다.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /일정/ })).toBeTruthy()

    // 총 8개 섹션(v2.5 이전 7개 + ⑦비상 대응) — 의미 유지 갱신: dod9(b)와 동일 계약을 이 파일에서도 확인
    expect(document.querySelectorAll('.plan-section').length).toBe(8)

    // scenario가 null이므로 어떤 세션 행에도 시나리오 펼침 토글이 없다(회귀 없음)
    expect(screen.queryByText('진행 시나리오 펼침')).toBeNull()

    // ③존별 운영에도 "운영가이드 존 섹션" 블록이 없다(guide_zone=null)
    const zonesSection = screen.getByRole('heading', { name: /존별 운영/ }).closest('section')!
    expect(within(zonesSection).queryByText('운영가이드 존 섹션')).toBeNull()
  })
})
