/** @vitest-environment jsdom */
// DoD-8: S9 운영계획서 — mock 데이터로 6개 섹션 전부 렌더 + 섹션별 진행률 +
// 제작물 리스트 표가 지시 스펙에서 자동 생성 + 인라인 편집 권한 게이팅·왕복
// (CLAUDE.md v1.2 §7 DoD-8). 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 실행된다.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-8 S9 운영계획서', () => {
  it('(a) 6개 섹션 전부 렌더 + 섹션별 진행률 + 제작물 리스트가 지시 스펙에서 자동 생성된다', async () => {
    renderRoute('/plan')

    // ── 6개 섹션 헤더 ──────────────────────────────────────────────
    expect(await screen.findByRole('heading', { name: /행사개요/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /프로그램/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /존별 운영/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /제작물 리스트/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /등록 통계/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '⑥일정' })).toBeTruthy()

    // ① 행사개요 — 테마·장소·사회·개요 항목
    expect(screen.getByText('연결, 다음 단계로')).toBeTruthy()
    expect(screen.getByText('가상컨벤션센터 3F 그랜드볼룸')).toBeTruthy()
    expect(screen.getByText('진행자 조무대')).toBeTruthy()
    expect(screen.getByText(/참가 대상/)).toBeTruthy()

    // ② 프로그램 — 세션·연사
    expect(screen.getByText('기조연설 — 연결의 다음 단계')).toBeTruthy()
    expect(screen.getByText(/한석학/)).toBeTruthy()
    expect(screen.getByText('오전')).toBeTruthy()
    expect(screen.getByText('오후')).toBeTruthy()

    // ③ 존별 운영 — content 있는 항목은 마크다운 렌더, 없는 항목은 '본문 미작성'
    expect(screen.getByText('개막식 큐시트')).toBeTruthy()
    expect(screen.getByText('무대 운영')).toBeTruthy()
    expect(screen.getByText(/개막 30분 전 리허설 완료/)).toBeTruthy()
    expect(screen.getByText('등록존 운영')).toBeTruthy()
    expect(screen.getByText('등록존')).toBeTruthy()
    const scenarioRow = screen.getByText('운영 시나리오').closest('article')!
    expect(within(scenarioRow).getByText('본문 미작성')).toBeTruthy()

    // ④ 제작물 리스트 — 지시 스펙 표 자동 생성 (dlv-007 메인 게이트 현수막)
    const banner = screen.getByText('메인 게이트 현수막')
    const bannerRow = banner.closest('tr')!
    expect(within(bannerRow).getByText('23000×5000mm')).toBeTruthy()
    expect(within(bannerRow).getByText('1')).toBeTruthy()
    expect(within(bannerRow).getByText('메인 게이트 외벽')).toBeTruthy()
    // 카테고리·종류 셀 둘 다 '현수막' — 지시 스펙(spec_type)에서 자동 채워진 종류 셀 포함 2건
    expect(within(bannerRow).getAllByText('현수막')).toHaveLength(2)
    expect(within(bannerRow).getByText('지시됨')).toBeTruthy()
    // 스펙 없는 항목(dlv-001 메인 키비주얼)은 '—'로 표기
    const keyvisualRow = screen.getByText('메인 키비주얼').closest('tr')!
    expect(within(keyvisualRow).getAllByText('—').length).toBeGreaterThan(0)

    // ⑤ 등록 통계 3종
    expect(screen.getByText('응답률')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('등록수')).toBeTruthy()
    expect(screen.getByText('체크인율')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()

    // ⑥ 일정 — 마일스톤
    expect(screen.getByText('키비주얼 확정')).toBeTruthy()
    expect(screen.getByText('킥오프 미팅')).toBeTruthy()

    // 섹션별 진행률 (설계서 §8 getPlan 산식 그대로 재현)
    expect(screen.getAllByText(/5\/5 \(100%\)/).length).toBeGreaterThan(0) // overview·program
    expect(screen.getAllByText(/2\/3 \(67%\)/).length).toBeGreaterThan(0) // zones
    expect(screen.getAllByText(/2\/4 \(50%\)/).length).toBeGreaterThan(0) // production
    expect(screen.getAllByText(/1\/1 \(100%\)/).length).toBeGreaterThan(0) // registration
    expect(screen.getAllByText(/1\/5 \(20%\)/).length).toBeGreaterThan(0) // schedule
  })

  it('(b) design 역할에는 개요·프로그램 편집 UI가 노출되지 않는다', async () => {
    mockProvider().switchUser('usr-design')
    renderRoute('/plan')

    await screen.findByRole('heading', { name: /행사개요/ })
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(screen.queryByText('세션 추가')).toBeNull()
    expect(screen.queryByText('관리')).toBeNull()
  })

  it('(c) ops 역할에는 편집 버튼이 노출되고, 행사개요 인라인 편집이 저장→반영까지 왕복된다', async () => {
    mockProvider().switchUser('usr-ops')
    renderRoute('/plan')

    await screen.findByRole('heading', { name: /행사개요/ })
    expect(screen.getByRole('button', { name: '편집' })).toBeTruthy()
    // 프로그램표 관리 UI도 ops에 노출된다
    expect(screen.getByText('세션 추가')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '편집' }))
    const venueInput = screen.getByLabelText('장소') as HTMLInputElement
    expect(venueInput.value).toBe('가상컨벤션센터 3F 그랜드볼룸')
    await userEvent.clear(venueInput)
    await userEvent.type(venueInput, '가상컨벤션센터 5F 다이아몬드홀')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('가상컨벤션센터 5F 다이아몬드홀')).toBeTruthy()
    expect(screen.queryByText('가상컨벤션센터 3F 그랜드볼룸')).toBeNull()

    const project = await mockProvider().getProject('prj-stc26')
    expect(project.venue).toBe('가상컨벤션센터 5F 다이아몬드홀')
  })
})
