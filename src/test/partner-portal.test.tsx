/** @vitest-environment jsdom */
// Phase 3.15c(에이전트 AC) — `/p/{token}` 파트너 제출 포털.
// DoD-32(격리, R-H2·R-H3) · DoD-33(검토 루프, §5.1) · 410(§6.2) · 375px 구조 계약(dod6 관례).
// testUtils.renderRoute는 /p 라우트를 갖고 있지 않으므로(공용 파일 미변경 원칙) 이 파일에서 자체
// MemoryRouter로 PartnerPortalPage 하나만 렌더한다 — App.tsx의 /p/:token 배선과 동일한 형태.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PARTNER_DEMO_TOKEN, PARTNER_EXPIRED_TOKEN, PARTNER_REVOKED_TOKEN, PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import type { DeadlineGroup } from '../components/partner-portal/deadlineGroups'
import PartnerPortalGroupList from '../components/partner-portal/PartnerPortalGroupList'
import PartnerPortalNoticeList from '../components/partner-portal/PartnerPortalNoticeList'
import { formatDate } from '../lib/labels'
import PartnerPortalPage from '../pages/PartnerPortalPage'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'
import type { PartnerPortalItem, PartnerPortalNotice } from '../types'

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

describe('P2(3.15.1, 감수 M2) — 참가 가이드 버튼·문의 안내', () => {
  it('가이드 링크·문의 이메일이 있으면(픽스처 기본값) 버튼과 안내가 렌더된다', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    const guideLink = (await screen.findByRole('link', {
      name: /참가 가이드 보기/,
    })) as HTMLAnchorElement
    expect(guideLink.getAttribute('href')).toBe('https://guide.example.com/vst26')
    expect(guideLink.getAttribute('target')).toBe('_blank')
    expect(guideLink.getAttribute('rel')).toBe('noreferrer')
    expect(await screen.findByText('문의: partners@example.com')).toBeTruthy()
  })

  it('값이 없으면 버튼·문의 안내 둘 다 렌더되지 않는다', async () => {
    const provider = mockProvider()
    await provider.updateProject(PROJECT_ID_HOST, { partner_guide_url: null, partner_contact_email: null })

    renderPortal(PARTNER_DEMO_TOKEN)
    await screen.findAllByText('가상다이아텍')
    expect(screen.queryByRole('link', { name: /참가 가이드 보기/ })).toBeNull()
    expect(screen.queryByText(/^문의:/)).toBeNull()

    // 뒤처리 — 이 파일의 다른 테스트가 픽스처 기본값을 기대한다
    await provider.updateProject(PROJECT_ID_HOST, {
      partner_guide_url: 'https://guide.example.com/vst26',
      partner_contact_email: 'partners@example.com',
    })
  })
})

// P6-③은 데모 픽스처(§21.3)의 HT 코드가 전부 서로 다른 D오프셋이라(실제 마감이 겹치는 예가 없다)
// 다건 그룹을 만들 수 없다 — PartnerPortalGroupList를 합성 데이터로 직접 렌더해 순수하게 검증한다.
function makePortalItem(overrides: Partial<PartnerPortalItem>): PartnerPortalItem {
  return {
    task_code: 'HT-X',
    task_title: '샘플 항목',
    deadline: '2026-09-01',
    deliverable_id: 'dlv-x',
    status: 'requested',
    comments: [],
    versions: [],
    ...overrides,
  }
}

describe('P6-③(3.15.1) — "다음 마감" 접힘 행 항목 요약', () => {
  it('그룹 항목이 1건이어도 접힘 요약에 제목이 보인다 — "제출:" 접두로 정확 일치 중복 방지', () => {
    const group: DeadlineGroup = {
      deadline: '2026-09-01',
      items: [makePortalItem({ deliverable_id: 'dlv-1', task_title: '부스 그래픽 제출 — 가상다이아텍' })],
    }
    const { container } = render(
      <PartnerPortalGroupList title="다음 마감 (대기)" groups={[group]} token="tok" onSubmitted={() => {}} />,
    )
    const summary = container.querySelector('summary')!
    expect(within(summary).getByText('1건')).toBeTruthy()
    // P6-③: 접힌 행에서도 뭘 내야 하는지 보인다. '제출:' 접두 덕에 펼친 카드의 <h3> 제목과
    // 완전히 같은 문자열이 아니므로 기존 정확 일치 쿼리(findByText(제목))는 깨지지 않는다.
    expect(within(summary).getByText('제출: 부스 그래픽 제출 — 가상다이아텍')).toBeTruthy()
    expect(within(summary).queryByText('부스 그래픽 제출 — 가상다이아텍')).toBeNull()
  })

  it('그룹 항목이 여럿이면 접힌 상태에서도 "제목 외 N건"으로 요약된다', () => {
    const group: DeadlineGroup = {
      deadline: '2026-09-01',
      items: [
        makePortalItem({ deliverable_id: 'dlv-1', task_title: '부스 그래픽 제출 — 가상다이아텍' }),
        makePortalItem({ deliverable_id: 'dlv-2', task_title: '발표자료 1차 초안 제출 — 가상다이아텍' }),
      ],
    }
    const { container } = render(
      <PartnerPortalGroupList title="다음 마감 (대기)" groups={[group]} token="tok" onSubmitted={() => {}} />,
    )
    const details = container.querySelector('details')!
    // 접힌 상태(펼치지 않은 상태)에서도 DOM에 요약이 이미 들어있다는 것이 "보인다"는 증거.
    expect(details.open).toBe(false)
    expect(within(details).getByText('제출: 부스 그래픽 제출 — 가상다이아텍 외 1건')).toBeTruthy()
  })
})

describe('P6-④(3.15.1) — 주최 측 안내 완료/예정 분리', () => {
  it('마감이 지난 안내는 완료 그룹(흐리게), 남은 안내는 예정 그룹으로 나뉜다', () => {
    // 실제 데모 픽스처는 오늘(테스트 실행일) 기준 전부 미래라 완료 그룹이 비므로, 날짜에 무관하게
    // 항상 성립하는 합성 데이터로 컴포넌트 렌더링만 독립 검증한다.
    const past: PartnerPortalNotice = {
      task_code: 'HT-X1',
      task_title: '지난 안내',
      deadline: '2020-01-01',
      note: null,
    }
    const future: PartnerPortalNotice = {
      task_code: 'HT-X2',
      task_title: '다가올 안내',
      deadline: '2099-01-01',
      note: null,
    }

    const { container } = render(<PartnerPortalNoticeList notices={[past, future]} />)

    expect(within(container).getByText('완료')).toBeTruthy()
    expect(within(container).getByText('예정')).toBeTruthy()
    expect(within(container).getByText('지난 안내')).toBeTruthy()
    expect(within(container).getByText('다가올 안내')).toBeTruthy()

    // 완료 그룹은 흐리게(opacity) 표시된다.
    const doneHeading = within(container).getByText('완료')
    const doneList = doneHeading.nextElementSibling as HTMLElement
    expect(doneList.className).toMatch(/opacity-60/)
  })

  it('전부 예정이면(픽스처 기본) "완료" 라벨 자체가 렌더되지 않는다(기존 화면 무변화 회귀)', async () => {
    renderPortal(PARTNER_DEMO_TOKEN)
    await screen.findByText('주최 측 안내')
    expect(screen.queryByText('완료')).toBeNull()
  })
})
