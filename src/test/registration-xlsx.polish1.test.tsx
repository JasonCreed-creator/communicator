/** @vitest-environment jsdom */
// P9(3.15.1) — 등록(S4) xlsx 임포트: CSV/xlsx 등가 + 헤더 매핑 왕복 + 빈 행 제외 + 구글시트 연동 안내.
// xlsx는 exceljs로 그 자리에서 만든다(모듈 규칙상 quote 모듈 안에서만 — 헬퍼는 quote 모듈
// __tests__/fixtures/registrationXlsxFixture.ts에 두고 여기서는 결과 ArrayBuffer만 가져다 쓴다).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { toCsv } from '../components/internal/csvUtils'
import { buildRegistrationXlsx } from '../modules/quote/import/__tests__/fixtures/registrationXlsxFixture'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

const HEADERS = ['이름', '소속', '이메일', '전화']
const ROWS = [
  ['새손님A', '가상테크', 'new-a@example.com', '010-1111-2222'],
  ['새손님B', '가상랩스', 'new-b@example.com', '010-3333-4444'],
]

async function openMappingPanel(): Promise<HTMLElement> {
  const heading = await screen.findByText(/헤더 매핑/)
  return heading.closest('.ui-card') as HTMLElement
}

describe('P9 — CSV/xlsx 등가', () => {
  it('같은 행을 CSV(RSVP)·xlsx(참관객)로 각각 임포트하면 추출된 필드 값이 동일하다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')

    // ① CSV → RSVP 탭
    const csvInput = screen.getByLabelText(/CSV 임포트 \(RSVP\)/) as HTMLInputElement
    const csv = toCsv(HEADERS, ROWS)
    await userEvent.upload(csvInput, new File([csv], 'guests.csv', { type: 'text/csv' }))
    await openMappingPanel()
    await userEvent.click(screen.getByRole('button', { name: '가져오기 실행' }))
    expect(await screen.findByText(/신규 2건 · 갱신 0건/)).toBeTruthy()

    // ② xlsx(같은 headers·rows) → 참관객 탭
    await userEvent.click(screen.getByRole('button', { name: '참관객' }))
    const xlsxBuffer = await buildRegistrationXlsx(HEADERS, ROWS)
    const xlsxInput = screen.getByLabelText(/CSV 임포트 \(참관객\)/) as HTMLInputElement
    await userEvent.upload(
      xlsxInput,
      new File([xlsxBuffer], 'guests.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )
    const panel = await openMappingPanel()
    // 헤더 매핑도 CSV와 동일하게 감지된다 — 헤더 4개가 원래 순서 그대로 보인다
    const headerCells = panel.querySelectorAll('tbody tr td:first-child')
    expect(Array.from(headerCells).map((c) => c.textContent)).toEqual(HEADERS)
    await userEvent.click(screen.getByRole('button', { name: '가져오기 실행' }))
    expect(await screen.findByText(/신규 2건 · 갱신 0건/)).toBeTruthy()

    // ③ 두 경로가 뽑아낸 값이 동일한지 비교(대상 테이블만 다르고 파싱 결과는 같아야 한다)
    const rsvps = await mockProvider().listRsvpContacts('prj-stc26')
    const attendees = await mockProvider().listAttendees('prj-stc26')
    const rA = rsvps.find((r) => r.name === '새손님A')!
    const aA = attendees.find((a) => a.name === '새손님A')!
    expect(aA.org).toBe(rA.org)
    expect(aA.email).toBe(rA.email)
    const rB = rsvps.find((r) => r.name === '새손님B')!
    const aB = attendees.find((a) => a.name === '새손님B')!
    expect(aB.org).toBe(rB.org)
    expect(aB.email).toBe(rB.email)
  })
})

describe('P9 — 헤더 매핑 왕복(xlsx)', () => {
  it('자동 추측된 매핑을 사용자가 바꾸면 임포트 결과에 반영된다(전화 열을 무시로 변경)', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')
    await userEvent.click(screen.getByRole('button', { name: '참관객' }))

    const buffer = await buildRegistrationXlsx(['이름', '전화'], [['왕복테스트', '010-9999-0000']])
    const input = screen.getByLabelText(/CSV 임포트 \(참관객\)/) as HTMLInputElement
    await userEvent.upload(input, new File([buffer], 'roundtrip.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const panel = await openMappingPanel()

    const selects = within(panel).getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    expect((selects[0] as HTMLSelectElement).value).toBe('name')
    // 전화(phone)는 Attendee 임포트 스키마에 없는 필드지만 CsvImportRow에는 있다 — 자동 추측대로면 phone
    expect((selects[1] as HTMLSelectElement).value).toBe('phone')

    // 사용자가 매핑을 '무시'로 바꾼다
    await userEvent.selectOptions(selects[1], '무시')
    await userEvent.click(screen.getByRole('button', { name: '가져오기 실행' }))
    expect(await screen.findByText(/신규 1건 · 갱신 0건/)).toBeTruthy()

    const attendees = await mockProvider().listAttendees('prj-stc26')
    const row = attendees.find((a) => a.name === '왕복테스트')!
    expect(row.phone).toBeNull() // 무시로 바꿨으니 전화는 저장되지 않는다
  })
})

describe('P9 — 빈 행 제외(xlsx)', () => {
  it('중간에 빈 행이 섞여 있어도 유효 행만 헤더 매핑에 감지된다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')

    const buffer = await buildRegistrationXlsx(
      ['이름', '이메일'],
      [['빈행위A', 'blank-a@example.com'], [], ['빈행위B', 'blank-b@example.com']],
    )
    const input = screen.getByLabelText(/CSV 임포트 \(RSVP\)/) as HTMLInputElement
    await userEvent.upload(input, new File([buffer], 'blank-rows.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))

    expect(await screen.findByText(/2행 감지됨/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '가져오기 실행' }))
    expect(await screen.findByText(/신규 2건 · 갱신 0건/)).toBeTruthy()
  })
})

describe('P9 — 구글시트 연동 자리(안내만, 새 필드 없음)', () => {
  it('버튼을 누르면 시점을 밝히는 안내 문구가 뜨고, 닫기로 닫힌다', async () => {
    renderRoute('/registration')
    await screen.findByText('홍초청')

    expect(screen.queryByText(/구글 계정 연동/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '구글시트 연동' }))
    expect(
      await screen.findByText(
        '구글 계정 연동(Drive 이식 단계)과 함께 열립니다. 그때까지는 시트를 xlsx로 내려받아 임포트해 주세요.',
        { exact: false },
      ),
    ).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByText(/구글 계정 연동/)).toBeNull()
  })
})
