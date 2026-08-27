/** @vitest-environment jsdom */
// Phase 3.15c(에이전트 AC) — `/p/{token}` 파트너 제출 포털.
// DoD-32(격리, R-H2·R-H3) · DoD-33(검토 루프, §5.1) · 410(§6.2) · 375px 구조 계약(dod6 관례).
// testUtils.renderRoute는 /p 라우트를 갖고 있지 않으므로(공용 파일 미변경 원칙) 이 파일에서 자체
// MemoryRouter로 PartnerPortalPage 하나만 렌더한다 — App.tsx의 /p/:token 배선과 동일한 형태.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PARTNER_DEMO_TOKEN, PARTNER_EXPIRED_TOKEN, PARTNER_REVOKED_TOKEN } from '../fixtures/hostFixtures'
import { formatDate } from '../lib/labels'
import PartnerPortalPage from '../pages/PartnerPortalPage'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

afterEach(cleanup)

function mockProvider(): MockProvider {
  return getDataProvider() as MockProvider
}

function renderPortal(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/p/${token}`]}>
      <Routes>
        <Route path="/p/:token" element={<PartnerPortalPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 카드가 접힌 "다음 마감"/"완료된 제출" 그룹 안에 있으면 상호작용 전 펼친다. */
async function ensureExpanded(card: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  const details = card.closest('details')
  if (details && !details.open) {
    await user.click(details.querySelector('summary')!)
  }
}

const OTHER_PARTNER_NAMES = ['가상골드플랫폼', '가상실버클라우드', '가상실버네트웍스', '가상실버랩스']

describe('DoD-32 파트너 포털 격리 (§21.2 R-H2·R-H3)', () => {
  it('자기 파트너·등급만 상단 바에 렌더된다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    // 파트너명은 상단 바 + 본문 캡션 2곳에 정상적으로 나타난다(둘 다 자기 파트너)
    expect((await screen.findAllByText('가상다이아텍')).length).toBeGreaterThanOrEqual(2)
    expect(await screen.findByText('DIAMOND')).toBeTruthy()
    expect(await screen.findByText('가상 서밋 2026')).toBeTruthy()
  })

  it('대조군: 타 파트너명 4곳과 계약액 숫자가 화면 텍스트에 0건이다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    await screen.findAllByText('가상다이아텍')

    for (const name of OTHER_PARTNER_NAMES) {
      expect(screen.queryByText(name)).toBeNull()
    }
    const bodyText = document.body.textContent ?? ''
    // 픽스처 계약액(80,000,000 · 40,000,000 · 15,000,000) — 천단위 구분 유무 둘 다 확인
    expect(bodyText).not.toMatch(/80,?000,?000/)
    expect(bodyText).not.toMatch(/40,?000,?000/)
    expect(bodyText).not.toMatch(/15,?000,?000/)
  })

  it('getPartnerPortal 응답 자체에 타 파트너 행·contract_amount 키가 없다(구조 검증)', async () => {
    const data = await mockProvider().getPartnerPortal(PARTNER_DEMO_TOKEN)
    expect(data.partner_name).toBe('가상다이아텍')
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('contract_amount')
    for (const name of OTHER_PARTNER_NAMES) {
      expect(serialized).not.toContain(name)
    }
  })
})

describe('DoD-33 검토 루프 (§5.1)', () => {
  it('미제출 카드에서 파일 제출 시 검토중으로 즉시 반영된다', async () => {
    const user = userEvent.setup()
    renderPortal(PARTNER_DEMO_TOKEN)

    const heading = await screen.findByText('참관객 이용권·경품 제안 제출 — 가상다이아텍')
    const card = heading.closest('article')!
    expect(within(card).getByText('제출 요청됨')).toBeTruthy()
    await ensureExpanded(card, user)

    const fileInput = within(card).getByLabelText(/파일 선택/) as HTMLInputElement
    const file = new File(['brief content'], 'brief.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)
    await user.click(within(card).getByRole('button', { name: '제출' }))

    await waitFor(() => expect(within(card).getByText('검토중')).toBeTruthy())
  })

  it('수정요청 카드는 검토 코멘트를 보여주고, 재제출하면 검토중으로 복귀한다', async () => {
    const provider = mockProvider()
    const before = await provider.getPartnerPortal(PARTNER_DEMO_TOKEN)
    const target = before.submission_items.find((i) => i.task_code === 'HT-4')!

    await provider.submitPartnerItem(PARTNER_DEMO_TOKEN, target.deliverable_id, { file_name: 'booth.pdf' })
    await provider.reviewPartnerSubmission(target.deliverable_id, {
      decision: 'changes_requested',
      comment: '부스 그래픽 해상도를 300dpi 이상으로 다시 제출해주세요.',
    })

    const user = userEvent.setup()
    renderPortal(PARTNER_DEMO_TOKEN)

    const heading = await screen.findByText(target.task_title)
    const card = heading.closest('article')!
    expect(within(card).getByText('수정요청')).toBeTruthy()
    expect(
      within(card).getByText('부스 그래픽 해상도를 300dpi 이상으로 다시 제출해주세요.'),
    ).toBeTruthy()

    await ensureExpanded(card, user)
    await user.click(within(card).getByRole('button', { name: '텍스트로 제출' }))
    await user.type(within(card).getByLabelText(/텍스트 제출/), '해상도 개선하여 다시 올렸습니다.')
    await user.click(within(card).getByRole('button', { name: '다시 제출' }))

    await waitFor(() => expect(within(card).getByText('검토중')).toBeTruthy())
  })

  it('승인됨 카드는 제출 UI 없이 읽기 전용이다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    const heading = await screen.findByText(
      '파트너 기본 자료 제출 — 로고·회사소개·발표자 프로필·발표 개요 — 가상다이아텍',
    )
    const card = heading.closest('article')!
    expect(within(card).getByText('승인됨')).toBeTruthy()
    expect(within(card).queryByRole('button', { name: '제출' })).toBeNull()
    expect(within(card).queryByRole('button', { name: '다시 제출' })).toBeNull()
  })

  it('주최 측 안내(host_notice)는 읽기 전용으로 표시되고 제출 액션이 없다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    const noticeText = await screen.findByText('트랙 배정·부스 배치 확정 통지')
    const noticeRow = noticeText.closest('li')!
    expect(within(noticeRow).queryByRole('button')).toBeNull()
  })
})

describe('DoD-32 410 (§6.2 화이트리스트 · 만료·회수)', () => {
  it('회수된 토큰은 담당자에게 새 링크를 요청하라는 안내를 보여준다', async () => {
    renderPortal(PARTNER_REVOKED_TOKEN)
    expect(await screen.findByText('링크가 만료되었습니다')).toBeTruthy()
    expect(await screen.findByText('담당자에게 새 링크를 요청하세요.')).toBeTruthy()
  })

  it('만료된 토큰도 동일하게 410 안내를 보여준다', async () => {
    renderPortal(PARTNER_EXPIRED_TOKEN)
    expect(await screen.findByText('링크가 만료되었습니다')).toBeTruthy()
  })

  it('존재하지 않는 토큰은 무효 링크 안내를 보여준다', async () => {
    renderPortal('no-such-partner-token')
    expect(await screen.findByText('유효하지 않은 링크입니다')).toBeTruthy()
  })
})

describe('DoD-6 관례 — 375px 구조 계약', () => {
  it('협폭 컨테이너와 44px 제출 버튼을 유지한다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    await screen.findAllByText('가상다이아텍')

    expect(document.querySelector('.max-w-3xl')).not.toBeNull()
    const submitButtons = screen.getAllByRole('button', { name: '제출' })
    expect(submitButtons.length).toBeGreaterThan(0)
    expect(submitButtons[0].className).toContain('h-11')
  })
})

describe('이번 마감 그룹핑', () => {
  it('가장 가까운 미완료 마감이 상단 "이번 마감" 섹션에 고정된다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    const data = await mockProvider().getPartnerPortal(PARTNER_DEMO_TOKEN)
    const firstIncomplete = data.submission_items.find((i) => i.status !== 'final' && i.status !== 'approved')
    expect(firstIncomplete).toBeTruthy()

    const sectionTitle = await screen.findByText('이번 마감')
    const section = sectionTitle.closest('section')!
    expect(within(section).getByText(formatDate(firstIncomplete!.deadline!))).toBeTruthy()
  })
})
