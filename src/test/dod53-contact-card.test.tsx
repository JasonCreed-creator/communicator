/** @vitest-environment jsdom */
// DoD-53 (Phase 3.18.1 §2) — 담당자 노출 계약.
//
// 사용자 확정 계약: 담당자(내부 스태프·발주처 담당자)의 이름·직함·연락처는 내부 화면과
// 발주처(/c) 화면 **모두**에 마스킹 없이 나간다. 넓어지는 것은 '담당자 표기'뿐이며,
// 기존 비노출 가드(금액·참가자 명단 PII·internal 코멘트)는 그대로 서 있어야 한다.
//
// 그래서 이 파일은 두 방향을 함께 고정한다:
//  ① 전자명함 붙여넣기 → 확인 표 수정 → 추가 = 직함·전화가 실제로 저장된다(버려지지 않는다)
//  ② /c 현황 = 담당자는 그대로 보이고, 금액 키·참가자 PII·internal 코멘트는 0건이다
// ②는 대조군 방식이다 — 내부 경로에 값이 실재함을 먼저 보이고, /c에서 0건임을 증명한다.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TOKEN } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** 픽스처 명함 1장 — 전 값이 가상이다(#RULE-NO-COMPANY) */
const CARD_TEXT = ['남신입 / 기획팀 대리', '가상이벤트(주)', 'newcard@example.com', '010-0000-2001'].join(
  '\n',
)

/** 금액은 어떤 이름으로도 발주처 지면에 넘어가지 않는다(DoD 23·30·32와 같은 키 집합) */
const MONEY_KEYS = [
  'total_amount',
  'breakdown',
  'settlement',
  'margin',
  'contract_amount',
  'ordered_amount',
  'actual_amount',
]

/** 런타임 객체 트리의 모든 key 수집 (배열·중첩 포함) */
function collectKeys(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      found.add(key)
      collectKeys(inner, found)
    }
  }
}

function keysIn(value: unknown): Set<string> {
  const found = new Set<string>()
  collectKeys(value, found)
  return found
}

describe('DoD-53 (a) 전자명함 임포트 — 직함·전화가 저장된다', () => {
  it('붙여넣기 → 인식 → 확인 표 수정 → 추가하면 담당자 표에 직함·전화가 뜬다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/settings')
    await screen.findByRole('heading', { name: '행사 설정' })
    await userEvent.click(await screen.findByRole('button', { name: '② 담당자' }))
    await screen.findByText('김기획')

    // 대조군: 기존 담당자도 직함·전화 열을 갖는다(픽스처가 실제로 값을 싣고 있다)
    const pmRow = screen.getByText('김기획').closest('tr')!
    expect(within(pmRow).getByText('기획팀 팀장')).toBeTruthy()
    expect(within(pmRow).getByText('010-0000-1001')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '전자명함 붙여넣기' }))
    await userEvent.type(screen.getByLabelText('명함·서명 텍스트'), CARD_TEXT)
    await userEvent.click(screen.getByRole('button', { name: '인식' }))

    // 파서가 채운 확인 표 — 여기서 사람이 고친 값이 그대로 저장돼야 한다
    const title = (await screen.findByLabelText('1번째 직함')) as HTMLInputElement
    const phone = screen.getByLabelText('1번째 전화') as HTMLInputElement
    expect(title.value).toBe('기획팀 대리')
    expect(phone.value).toBe('010-0000-2001')
    expect((screen.getByLabelText('1번째 이름') as HTMLInputElement).value).toBe('남신입')

    // 안내 문구도 사실과 맞다 — 저장되지 않는 것은 소속 하나뿐이다
    expect(screen.getByText(/직함·전화는 담당자 정보로 함께 저장/)).toBeTruthy()
    expect(screen.getByText(/소속은 아직 저장 자리가 없어/)).toBeTruthy()

    // 확인 표에서 직함을 고친다 — 저장되는 값은 파싱 원본이 아니라 이 수정본이다
    await userEvent.clear(title)
    await userEvent.type(title, '기획팀 수석')
    await userEvent.selectOptions(screen.getByLabelText('1번째 역할'), 'ops')
    await userEvent.click(screen.getByRole('button', { name: '1번째 담당자 추가' }))

    const newRow = (await screen.findByText('남신입')).closest('tr')!
    expect(within(newRow).getByText('기획팀 수석')).toBeTruthy()
    expect(within(newRow).getByText('010-0000-2001')).toBeTruthy()
    expect(within(newRow).getByText('newcard@example.com')).toBeTruthy()

    // 화면뿐 아니라 저장소에도 남는다(다시 읽어도 값이 있다)
    const members = await mockProvider().listMembers('prj-stc26')
    const saved = members.find((m) => m.profile.name === '남신입')!
    expect(saved.profile.title).toBe('기획팀 수석')
    expect(saved.profile.phone).toBe('010-0000-2001')
    expect(saved.role).toBe('ops')
  })
})

describe('DoD-53 (b) /c 현황 담당자 블록 — 마스킹 없음', () => {
  it('내부 스태프와 발주처 담당자의 이름·직함·연락처가 그대로 뜬다', async () => {
    const status = await mockProvider().getClientStatus(DEMO_TOKEN)
    // 대조군: 계약이 두 종류의 담당자를 모두 싣는다
    expect(status.staff.length).toBeGreaterThan(0)
    expect(status.client_contact).not.toBeNull()

    renderRoute(`/c/${DEMO_TOKEN}/status`)
    const section = (await screen.findByRole('heading', { name: '담당자' })).closest('section')!
    const card = within(section)

    // 발주처 담당자(이 링크를 받은 사람)
    expect(card.getByText(status.client_contact!.name)).toBeTruthy()
    expect(card.getByText('발주처 담당자')).toBeTruthy()

    // 내부 스태프 — 이름·직함·이메일·전화 전부
    const pm = status.staff.find((s) => s.role === 'pm')!
    expect(pm.title).toBeTruthy() // 대조군: 직함이 실제로 실려 있다
    expect(pm.phone).toBeTruthy()
    expect(card.getByText(pm.display_name)).toBeTruthy()
    expect(card.getByText('담당 PM')).toBeTruthy()
    expect(card.getByText(`· ${pm.title}`)).toBeTruthy()
    expect(card.getByRole('link', { name: pm.email! }).getAttribute('href')).toBe(
      `mailto:${pm.email}`,
    )
    expect(card.getByRole('link', { name: pm.phone! }).getAttribute('href')).toBe(
      `tel:${pm.phone!.replace(/[^0-9+]/g, '')}`,
    )

    // 마스킹 흔적이 한 글자도 없다
    expect(section.textContent).not.toMatch(/[*●]/)
    for (const person of status.staff) {
      if (person.phone) expect(section.textContent).toContain(person.phone)
    }
  })
})

describe('DoD-53 (c) 담당자를 열어도 금액·참가자 PII는 0건', () => {
  it('/c 현황 응답에 금액 키가 없다 — 같은 값이 내부 경로에는 실재한다(대조군)', async () => {
    const provider = mockProvider()
    // 대조군: 금액 키는 내부 경로에 실재한다 — /c의 0건이 '데이터가 없어서'가 아님을 못 박는다
    const internalKeys = new Set([
      ...keysIn(await provider.listQuotes()), // 견적: total_amount·breakdown
      ...keysIn(await provider.getSettlementBoard('prj-stc26')), // 정산: ordered_amount·actual_amount·markup
      ...keysIn(await provider.listPartners('prj-virtual-summit')), // 파트너: contract_amount
    ])
    for (const key of [
      'total_amount',
      'breakdown',
      'ordered_amount',
      'actual_amount',
      'markup',
      'contract_amount',
    ]) {
      expect(internalKeys.has(key)).toBe(true)
    }

    const status = await provider.getClientStatus(DEMO_TOKEN)
    const statusKeys = keysIn(status)
    for (const key of MONEY_KEYS) expect(statusKeys.has(key)).toBe(false)
    // 담당자를 실어 보내는 지금도 큐 응답은 그대로다
    const queueKeys = keysIn(await provider.getClientQueue(DEMO_TOKEN))
    for (const key of MONEY_KEYS) expect(queueKeys.has(key)).toBe(false)
  })

  it('/c 현황 응답·화면에 참가자 명단 PII가 없다 — 내부 등록 보드에는 실재한다(대조군)', async () => {
    const provider = mockProvider()
    // 대조군: 참가자 명단은 내부 경로에 이름·이메일·전화로 실재한다
    const attendees = await provider.listAttendees('prj-stc26')
    const withPhone = attendees.find((a) => a.phone)!
    expect(withPhone).toBeTruthy()

    const status = await provider.getClientStatus(DEMO_TOKEN)
    const serialized = JSON.stringify(status)
    for (const attendee of attendees) {
      expect(serialized).not.toContain(attendee.name)
      if (attendee.email) expect(serialized).not.toContain(attendee.email)
      if (attendee.phone) expect(serialized).not.toContain(attendee.phone)
    }
    // 응답 트리에 참가자 컬렉션 자체가 없다
    const statusKeys = keysIn(status)
    for (const key of ['attendees', 'rsvp_contacts', 'sheet_source_rows']) {
      expect(statusKeys.has(key)).toBe(false)
    }

    renderRoute(`/c/${DEMO_TOKEN}/status`)
    await screen.findByRole('heading', { name: '담당자' })
    const html = document.body.textContent ?? ''
    for (const attendee of attendees) {
      expect(html).not.toContain(attendee.name)
      if (attendee.phone) expect(html).not.toContain(attendee.phone)
    }
    // 담당자 전화는 같은 화면에 그대로 있다 — 부재가 '전화를 다 가린 결과'가 아님을 못 박는다
    expect(html).toContain(status.staff.find((s) => s.phone)!.phone!)
  })

  it('internal 코멘트는 담당자 블록이 생긴 뒤에도 /c에 렌더되지 않는다 (dod3 회귀)', async () => {
    renderRoute(`/c/${DEMO_TOKEN}/status`)
    await screen.findByRole('heading', { name: '담당자' })
    await waitFor(() => expect(screen.getByText('담당 PM')).toBeTruthy())
    expect(document.body.textContent).not.toContain('[내부]')
    expect(document.body.textContent).not.toContain('단가 협의')
  })
})
