/** @vitest-environment jsdom */
// P5-①(3.15.1) — 등록(S4) 스케일: 검색·상태 필터·페이지네이션(50행/페이지). 픽스처는 손대지 않고
// 테스트에서 provider(importRegistrationCsv)로 행을 추가해 51건 시나리오를 만든다.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const PROJECT_ID = 'prj-stc26'

async function bulkAdd(target: 'rsvp' | 'attendees', count: number, namePrefix: string, emailPrefix: string) {
  const rows = Array.from({ length: count }, (_, i) => ({
    name: `${namePrefix}${i + 1}`,
    email: `${emailPrefix}${i + 1}@example.com`,
  }))
  await mockProvider().importRegistrationCsv(PROJECT_ID, target, rows)
}

describe('P5-① RSVP 탭 — 검색·상태 필터', () => {
  it('이름·이메일·소속 부분 일치로 검색된다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')
    expect(screen.getByText('정미디')).toBeTruthy()

    const search = screen.getByLabelText('이름·이메일·소속 검색')
    await userEvent.type(search, '가상전자') // 홍초청의 소속(org)
    expect(await screen.findByText('홍초청')).toBeTruthy()
    expect(screen.queryByText('정미디')).toBeNull()

    await userEvent.clear(search)
    await userEvent.type(search, 'guest2') // 정미디의 이메일 부분
    expect(await screen.findByText('정미디')).toBeTruthy()
    expect(screen.queryByText('홍초청')).toBeNull()
  })

  it('상태 필터로 invite_status가 좁혀진다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')

    await userEvent.selectOptions(screen.getByLabelText('RSVP 상태 필터'), '참석')
    expect(await screen.findByText('홍초청')).toBeTruthy() // accepted
    expect(screen.queryByText('정미디')).toBeNull() // sent
    expect(screen.queryByText('강일반')).toBeNull() // declined

    await userEvent.selectOptions(screen.getByLabelText('RSVP 상태 필터'), '전체 상태')
    expect(await screen.findByText('정미디')).toBeTruthy()
  })

  it('검색 결과가 없으면 안내 문구가 뜨고, 통계·체크인 등 기존 기능은 회귀 없다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')

    await userEvent.type(screen.getByLabelText('이름·이메일·소속 검색'), '존재하지않는이름')
    expect(await screen.findByText('검색·필터 조건에 맞는 대상이 없습니다.')).toBeTruthy()

    await userEvent.clear(screen.getByLabelText('이름·이메일·소속 검색'))
    await userEvent.click(screen.getByRole('button', { name: '통계' }))
    expect(await screen.findByText('응답률')).toBeTruthy()
  })
})

describe('P5-① RSVP 탭 — 페이지네이션(50행/페이지)', () => {
  it('51건이면 1페이지 50행·2페이지 1행으로 나뉘고 이전/다음이 동작한다', async () => {
    const before = await mockProvider().listRsvpContacts(PROJECT_ID)
    await bulkAdd('rsvp', 51 - before.length, '벌크초청', 'bulk-rsvp-')
    const total = await mockProvider().listRsvpContacts(PROJECT_ID)
    expect(total).toHaveLength(51)

    renderRoute('/registration')
    await screen.findByText('홍초청')

    expect(await screen.findByText('총 51건')).toBeTruthy()
    expect(screen.getByText('1 / 2 페이지')).toBeTruthy()
    const rsvpTable = screen.getByText('총 51건').closest('.ui-card') as HTMLElement
    expect(within(rsvpTable).getAllByRole('row')).toHaveLength(1 + 50) // 헤더 1 + 데이터 50

    const prevBtn = screen.getByRole('button', { name: '이전' }) as HTMLButtonElement
    const nextBtn = screen.getByRole('button', { name: '다음' }) as HTMLButtonElement
    expect(prevBtn.disabled).toBe(true)
    expect(nextBtn.disabled).toBe(false)

    await userEvent.click(nextBtn)
    expect(await screen.findByText('2 / 2 페이지')).toBeTruthy()
    expect(within(rsvpTable).getAllByRole('row')).toHaveLength(1 + 1) // 마지막 1행
    expect((screen.getByRole('button', { name: '다음' }) as HTMLButtonElement).disabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(await screen.findByText('1 / 2 페이지')).toBeTruthy()
  })

  it('검색으로 필터링하면 페이지가 1로 리셋되고 카운트가 필터 결과 기준으로 바뀐다', async () => {
    const before = await mockProvider().listRsvpContacts(PROJECT_ID)
    await bulkAdd('rsvp', Math.max(0, 51 - before.length), '벌크초청', 'bulk-rsvp2-')

    renderRoute('/registration')
    await screen.findByText('홍초청')
    await userEvent.click(screen.getByRole('button', { name: '다음' })) // 2페이지로 이동
    expect(await screen.findByText('2 / 2 페이지')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('이름·이메일·소속 검색'), '가상전자')
    // 필터 결과 1건 → 1/1 페이지로 리셋
    expect(await screen.findByText('1 / 1 페이지')).toBeTruthy()
    expect(screen.getByText('총 1건')).toBeTruthy()
  })
})

describe('P5-① 참관객 탭 — 검색·체크인 필터·페이지네이션', () => {
  it('체크인 여부 필터가 동작한다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')
    await userEvent.click(screen.getByRole('button', { name: '참관객' }))
    await screen.findByText('임참관')

    // 픽스처: att-002(임참관)만 체크인, att-001(홍초청)·att-003(오현장)은 미체크인
    await userEvent.selectOptions(screen.getByLabelText('체크인 여부 필터'), '체크인됨')
    expect(await screen.findByText('임참관')).toBeTruthy()
    expect(screen.queryByText('오현장')).toBeNull()

    await userEvent.selectOptions(screen.getByLabelText('체크인 여부 필터'), '미체크인')
    expect(await screen.findByText('오현장')).toBeTruthy()
    expect(screen.queryByText('임참관')).toBeNull()
  })

  it('51건이면 2페이지로 나뉜다', async () => {
    const before = await mockProvider().listAttendees(PROJECT_ID)
    await bulkAdd('attendees', 51 - before.length, '벌크참관', 'bulk-att-')
    expect(await mockProvider().listAttendees(PROJECT_ID)).toHaveLength(51)

    renderRoute('/registration')
    await screen.findByText('홍초청')
    await userEvent.click(screen.getByRole('button', { name: '참관객' }))

    expect(await screen.findByText('총 51건')).toBeTruthy()
    expect(screen.getByText('1 / 2 페이지')).toBeTruthy()
  })
})
