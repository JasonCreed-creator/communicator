/** @vitest-environment jsdom */
// Phase 3.17b — 시안 '온보딩 · 파트너 포털.dc.html' 정렬 계약.
//
// 이 파일이 지키는 것(정렬로 새로 생긴 계약만 — 기존 DoD-10·20·32·33은 각자 파일이 계속 지킨다):
//  ① 온보딩 카드 상단 = 전체 진행 막대 + '필수 n개 남음'(행사 설정 헤더와 같은 필수 4 정의)
//  ② 스텝 레일은 StepIndicator 규격 그대로 — 28px 원 · 완료 CheckIcon · 현재 2px 아웃라인 · 세로 레일
//  ③ '완료하면 이렇게 됩니다'는 steel 배너 — 되돌리기 비용이 큰 동작을 누르기 전에 밝힌다
//  ④ 포털 각 제출에 수신 경로 — PM 접수 대장(RECEIPT_CHANNEL_LABELS)과 **같은 문자열**
//  ⑤ 포털은 외부 지면 규격 — 터치 44(btn-sm 28 금지) · 밀집 표 금지 · 1열 스택
//  ⑥ 포털 배지 어휘는 내부와 동일(HOST_STATUS_LABELS) + 도트는 '검토중'(pending_approval) 하나에만
// 사용자 결정: 포털은 **제출 기능 포함 현행 유지** — 제출 버튼이 사라지지 않는 것도 함께 못박는다.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { RECEIPT_CHANNEL_LABELS, RECEIPT_NONE_LABEL, RECEIPT_UNRECORDED_LABEL } from '../components/partner/partnerReceipt'
import PartnerPortalItemCard from '../components/partner-portal/PartnerPortalItemCard'
import { PARTNER_DEMO_TOKEN } from '../fixtures/hostFixtures'
import type { PartnerPortalItem } from '../types'
import type { Version } from '../types/entities'
import PartnerPortalPage from '../pages/PartnerPortalPage'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={[`/p/${PARTNER_DEMO_TOKEN}`]}>
      <Routes>
        <Route path="/p/:token" element={<PartnerPortalPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function makeVersion(uploadedBy: string | null): Version {
  return {
    id: 'ver-x',
    deliverable_id: 'dlv-x',
    version_no: 1,
    drive_file_id: 'drv-x',
    file_name: 'sample.pdf',
    note: null,
    uploaded_by: uploadedBy,
    created_at: '2026-08-28T09:00:00.000Z',
  }
}

function makeItem(overrides: Partial<PartnerPortalItem> = {}): PartnerPortalItem {
  return {
    task_code: 'HT-9',
    task_title: '합성 제출 항목',
    deadline: '2026-09-02',
    deliverable_id: 'dlv-x',
    status: 'requested',
    comments: [],
    versions: [],
    ...overrides,
  }
}

/** ①행사개요 → ②담당자 → ③유형·확인까지 진행한 위저드 */
async function gotoStep3(user: ReturnType<typeof userEvent.setup>) {
  renderRoute('/onboarding')
  await screen.findByRole('heading', { name: '① 행사개요' })
  await screen.findByLabelText('행사명')
  await user.click(screen.getByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { name: '② 담당자' })
  await user.click(await screen.findByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { name: '③ 유형·확인' })
}

describe('S0 온보딩 — 진행 막대·스텝 레일·완료 안내', () => {
  it('① 카드 상단에 진행 막대와 "필수 n개 남음"이 있고, 단계가 넘어가면 채워진다', async () => {
    mockProvider().resetOnboarding()
    const user = userEvent.setup()

    renderRoute('/onboarding')
    await screen.findByRole('heading', { name: '① 행사개요' })

    const strip = screen.getByTestId('onboarding-progress')
    // 픽스처 샘플 행사는 필수 4가 모두 채워져 있다 → 0개 남음
    expect(within(strip).getByText('3단계 중 0단계 완료 · 필수 0개 남음')).toBeTruthy()
    const fill = strip.querySelector('.bg-accent, .bg-positive') as HTMLElement
    expect(fill.style.width).toBe('0%')

    await screen.findByLabelText('행사명')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await screen.findByRole('heading', { name: '② 담당자' })

    const strip2 = screen.getByTestId('onboarding-progress')
    expect(within(strip2).getByText('3단계 중 1단계 완료 · 필수 0개 남음')).toBeTruthy()
    expect((strip2.querySelector('.bg-accent, .bg-positive') as HTMLElement).style.width).toBe('33%')
  })

  it('② 스텝 레일 규격 — 28px 원 · 완료 체크 아이콘 · 현재 단계 2px 아웃라인 · 세로 레일', async () => {
    const user = userEvent.setup()
    await gotoStep3(user)

    const rail = screen.getByRole('list', { name: '온보딩 단계' })
    const circles = rail.querySelectorAll('span.h-7.w-7')
    expect(circles).toHaveLength(3)
    // 완료 2단계는 accent 면 + 체크 아이콘, 현재(③)는 2px accent 아웃라인
    expect(circles[0].querySelector('svg')).not.toBeNull()
    expect(circles[1].querySelector('svg')).not.toBeNull()
    expect(circles[2].className).toContain('border-2')
    expect(circles[2].className).toContain('border-accent')
    expect(circles[2].getAttribute('aria-current')).toBe('step')
    // 세로 레일(연결선)은 마지막을 제외한 원 아래에 붙는다
    expect(rail.querySelectorAll('.sm\\:w-px').length).toBe(2)
  })

  it('③ "완료하면 이렇게 됩니다"가 steel 배너로 승격되고 전개 결과를 완료 버튼 앞에 밝힌다', async () => {
    const user = userEvent.setup()
    await gotoStep3(user)

    const notice = screen.getByTestId('onboarding-completion-notice')
    expect(notice.className).toContain('bg-steel-tint')
    expect(notice.className).toContain('text-steel')
    expect(within(notice).getByText(/완료하면 이렇게 됩니다/)).toBeTruthy()
    // 모객형 픽스처 → WBS 37건 · R&R 4장 · 되돌리는 경로까지 문구에 있다
    expect(notice.textContent).toMatch(/모객형 WBS 37건/)
    expect(notice.textContent).toMatch(/R&R 카드 4장/)
    expect(notice.textContent).toMatch(/템플릿 재전개/)

    // 배너는 완료 버튼보다 앞(문서 순서)에 온다 — 누르기 전에 읽힌다
    const completeButton = screen.getByRole('button', { name: '온보딩 완료' })
    expect(notice.compareDocumentPosition(completeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('/p 파트너 포털 — 수신 경로·외부 지면 규격', () => {
  it('④ 각 제출 카드에 수신 경로가 PM 접수 대장과 같은 어휘로 표기된다', async () => {
    renderPortal()
    const heading = await screen.findByText(
      '파트너 기본 자료 제출 — 로고·회사소개·발표자 프로필·발표 개요 — 가상다이아텍',
    )
    const card = heading.closest('article')!
    // 픽스처 제출분은 포털 업로드(uploaded_by=null) → '포털' — PM 대장 라벨과 동일 문자열
    expect(RECEIPT_CHANNEL_LABELS.portal).toBe('포털')
    expect(within(card).getByText(/포털 수신$/)).toBeTruthy()

    // 아직 아무것도 안 들어온 항목은 추측하지 않고 '미접수'(PM 대장과 동일)
    const pending = (await screen.findByText('참관객 이용권·경품 제안 제출 — 가상다이아텍')).closest(
      'article',
    )!
    expect(within(pending).getByText(RECEIPT_NONE_LABEL)).toBeTruthy()

    // PM이 외부에서 받아 대리 등록한 분(uploaded_by=내부 사용자)은 경로를 저장하지 않는다 —
    // '메일'로 추측해 적지 않고 대장과 같은 '미기록'으로 남는다
    cleanup()
    const { container } = render(
      <PartnerPortalItemCard
        item={makeItem({ status: 'pending_approval', versions: [makeVersion('usr-pm')] })}
        token="tok"
        onSubmitted={() => {}}
      />,
    )
    expect(within(container).getByText(`8월 28일 제출 · ${RECEIPT_UNRECORDED_LABEL} 수신`)).toBeTruthy()
  })

  it('⑤ 외부 지면 규격 — 밀집 표 0건 · btn-sm 0건 · 제출 컨트롤 터치 44', async () => {
    const { container } = renderPortal()
    await screen.findAllByText('가상다이아텍')

    expect(container.querySelectorAll('.ui-table-dense')).toHaveLength(0)
    expect(container.querySelectorAll('.btn-sm')).toHaveLength(0)

    // 사용자 결정: 제출 기능은 현행 유지 — 버튼이 남아 있고 44px이다
    const submit = screen.getAllByRole('button', { name: '제출' })[0]
    expect(submit.className).toContain('h-11')
    for (const label of ['파일로 제출', '텍스트로 제출']) {
      expect(screen.getAllByRole('button', { name: label })[0].className).toContain('h-11')
    }
  })

  it('⑥ 배지는 내부와 같은 어휘 + 도트는 검토중(내 행동 대기) 하나에만 붙는다', async () => {
    const { container } = renderPortal()
    await screen.findAllByText('가상다이아텍')

    const badges = Array.from(container.querySelectorAll('.ui-badge[data-level]'))
    expect(badges.length).toBeGreaterThan(0)
    // 어휘는 주최형 정본 세트(HOST_STATUS_LABELS) 그대로 — 축약·재작명하지 않는다
    expect(screen.getAllByText('승인됨').length).toBeGreaterThan(0)
    expect(screen.getAllByText('제출 요청됨').length).toBeGreaterThan(0)

    for (const badge of badges) {
      const hasDot = badge.querySelector('span[aria-hidden]') !== null
      expect(hasDot).toBe(badge.textContent?.trim() === '검토중')
    }

    // 데모 픽스처에는 이 파트너의 '검토중' 항목이 없다 — 규칙이 공허해지지 않게 합성 카드로도 확인한다
    cleanup()
    const review = render(
      <PartnerPortalItemCard item={makeItem({ status: 'pending_approval' })} token="tok" onSubmitted={() => {}} />,
    )
    const reviewBadge = review.container.querySelector('.ui-badge[data-level]')!
    expect(reviewBadge.textContent?.trim()).toBe('검토중')
    expect(reviewBadge.querySelector('span[aria-hidden]')).not.toBeNull()

    cleanup()
    const requested = render(
      <PartnerPortalItemCard item={makeItem({ status: 'requested' })} token="tok" onSubmitted={() => {}} />,
    )
    const requestedBadge = requested.container.querySelector('.ui-badge[data-level]')!
    expect(requestedBadge.textContent?.trim()).toBe('제출 요청됨')
    expect(requestedBadge.querySelector('span[aria-hidden]')).toBeNull()
  })
})
