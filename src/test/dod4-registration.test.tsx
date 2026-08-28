/** @vitest-environment jsdom */
// DoD-4: 등록 — CSV 임포트(헤더 매핑 UI) → 테이블 → 체크인 토글 → 통계 3종.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-4 등록 모듈', () => {
  it('RSVP 테이블이 픽스처로 렌더된다', async () => {
    renderRoute('/registration')
    expect(await screen.findByText('홍초청')).toBeTruthy()
    expect(screen.getByText('정미디')).toBeTruthy()
  })

  it('CSV 임포트: 헤더 매핑 UI를 거쳐 email 기준 upsert된다 (신규 1·갱신 1)', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')

    // 한국어/변형 헤더 자동 추측(이름→name, E-mail→email) 검증
    const csv = '이름,E-mail\n새손님,new@example.com\n홍초청,guest1@example.com\n'
    const input = screen.getByLabelText(/CSV 임포트/) as HTMLInputElement
    await userEvent.upload(input, new File([csv], 'guests.csv', { type: 'text/csv' }))

    expect(await screen.findByText(/헤더 매핑/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '가져오기 실행' }))

    expect(await screen.findByText(/신규 1건 · 갱신 1건/)).toBeTruthy()
    expect(await screen.findByText('새손님')).toBeTruthy()

    const rsvps = await mockProvider().listRsvpContacts('prj-stc26')
    expect(rsvps).toHaveLength(6)
  })

  it('체크인 토글이 동작한다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')
    await userEvent.click(screen.getByRole('button', { name: '참관객' }))
    await screen.findByText('임참관')

    // 픽스처: att-002(임참관)만 체크인 상태 → 미체크인 버튼 2개
    // (v2.6 §24: 탭에 '체크인'이 생겼으므로 명단 표 안으로 범위를 좁힌다 — 의미는 그대로)
    const table = within(screen.getByRole('table', { name: '참관객 명단' }))
    const before = table.getAllByRole('button', { name: '체크인' })
    expect(before).toHaveLength(2)
    await userEvent.click(before[0])

    await waitFor(() => {
      expect(screen.getAllByText(/체크인 완료/)).toHaveLength(2)
    })
    const attendees = await mockProvider().listAttendees('prj-stc26')
    expect(attendees.filter((a) => a.checked_in_at)).toHaveLength(2)
  })

  it('통계 탭이 3종 KPI(응답률·등록 수·체크인율)를 렌더한다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')
    await userEvent.click(screen.getByRole('button', { name: '통계' }))

    expect(await screen.findByText('응답률')).toBeTruthy()
    expect(screen.getByText('등록 수')).toBeTruthy()
    expect(screen.getByText('체크인율')).toBeTruthy()
    expect(screen.getByText('RSVP 총원')).toBeTruthy()
  })
})
