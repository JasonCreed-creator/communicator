/** @vitest-environment jsdom */
// 시안 정렬(S-11 파트너 보드) — '파트너 보드.dc.html' + 패턴 기준 시트 §03·§05·§07.
//
// 전제 변경: 파트너는 로그인하지 않는다 → 보드는 **PM 접수 대장**이다. 다만 제출 포털(`/p`)은
// 현행 유지이므로 포털 제출분과 PM 접수분이 한 표에 공존한다.
// 이번 정렬의 핵심 계약만 단언한다:
//  ① 어휘 — KPI/열 라벨이 제출→접수 · 검토 대기→검토 필요 · 수정요청 미회신→재요청 미회신,
//     KPI 4장에 보조 수치 1줄(§07), 옛 '링크 상태' 열은 표에서 사라진다
//  ② 파트너 표 = 표 정본(.ui-table) + **진행 낮은 순 기본 정렬** + 셀 내 막대는 접수 진행 열에만
//  ③ 상세 = 좌측 담당 정보(연락처 **마스킹** — 원문 주소 0건) + 우측 제출 항목 .ui-table
//  ④ 모든 제출 행에 수신 경로·접수자 — 포털 제출분은 '포털'로 자동 확정, 미제출은 '미접수'
//  ⑤ 접수 기록(메일 등 외부 수신 대리 등록)은 기존 provider 전이를 그대로 타고, 기록 후
//     그 행의 수신 경로를 PM이 고른 값(메일)과 접수자로 표시한다
//  ⑥ 금액은 상세 패널을 연 상태에서도 화면 어디에도 없다(§21.2 R-H3)
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { renderRoute } from './testUtils'

afterEach(cleanup)

beforeEach(() => {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
})

/** 파트너 표(화면 첫 .ui-table) */
async function partnerTable(container: HTMLElement): Promise<HTMLTableElement> {
  await screen.findByText('가상다이아텍')
  return container.querySelector('table.ui-table') as HTMLTableElement
}

describe('S-11 ① 접수 대장 어휘 · KPI 보조 수치', () => {
  it('KPI 라벨이 접수 어휘로 바뀌고 4장 전부 보조 수치 1줄을 갖는다', async () => {
    renderRoute('/partners')
    await screen.findByText('가상다이아텍')

    for (const label of ['파트너 수', '이번 마감 접수', '접수 후 검토 필요', '재요청 미회신']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    // 옛 어휘는 KPI에 남아 있지 않다
    expect(screen.queryByText('이번 마감 제출')).toBeNull()
    expect(screen.queryByText('검토 대기')).toBeNull()
    expect(screen.queryByText('수정요청 미회신')).toBeNull()

    // 보조 수치 1줄(구분선 아래) — 픽스처: 참여 중 5 · 철회 0 / 재요청 미회신은 파트너명
    const countTile = screen.getByText('파트너 수').closest('.ui-card') as HTMLElement
    expect(within(countTile).getByText('참여 중 5 · 철회 0')).toBeTruthy()
    const unansweredTile = screen.getByText('재요청 미회신').closest('.ui-card') as HTMLElement
    expect(within(unansweredTile).getByText('가상실버네트웍스')).toBeTruthy()

    // 마감 타임라인의 건수 문구도 '접수'다
    expect(screen.getAllByText(/^접수 \d+\/5$/).length).toBeGreaterThan(0)
  })
})

describe('S-11 ② 파트너 표 — 표 정본 · 진행 낮은 순', () => {
  it('접수 진행 막대가 있는 .ui-table이고, 기본 정렬이 진행 낮은 순이다', async () => {
    const { container } = renderRoute('/partners')
    const table = await partnerTable(container)

    // 열 구성: 링크 상태(옛 열)는 사라지고 접수 진행·검토 필요·재요청·최근 접수가 들어온다
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '')
    expect(headers.some((h) => h.startsWith('접수 진행'))).toBe(true)
    expect(headers).toContain('검토 필요')
    expect(headers).toContain('재요청')
    expect(headers).toContain('최근 접수')
    expect(headers.some((h) => h.includes('링크'))).toBe(false)

    // 진행 낮은 순 — 아직 하나도 안 들어온 가상실버랩스(0/6)가 첫 행
    const firstRow = table.querySelectorAll('tbody tr')[0] as HTMLElement
    expect(within(firstRow).getByText('가상실버랩스')).toBeTruthy()
    expect(within(firstRow).getByText('0/6')).toBeTruthy()

    // 셀 내 막대는 진행률 열에만(§05 조건 4) — 행마다 정확히 1개
    for (const row of table.querySelectorAll('tbody tr')) {
      expect(within(row as HTMLElement).getAllByTestId('receipt-bar').length).toBe(1)
    }
  })
})

describe('S-11 ③④ 상세 — 담당 정보 마스킹 + 수신 경로·접수자', () => {
  it('연락처는 마스킹되고, 제출 항목 표의 모든 행에 수신 경로가 남는다', async () => {
    const { container } = renderRoute('/partners')
    const table = await partnerTable(container)
    await userEvent.click(within(table).getByText('가상다이아텍'))
    await screen.findByRole('heading', { name: /파트너 상세 — 가상다이아텍/ })

    // ③ 원문 이메일은 **표시되지 않고** 마스킹 표기만 남는다
    // (요청 메일 링크의 mailto: href에는 실주소가 들어가야 한다 — 눈에 보이는 텍스트만 검사)
    expect(container.textContent ?? '').not.toContain('partner@example.com')
    expect(screen.getByText(/^pa\*+@e\*+\.com$/)).toBeTruthy()

    // ④ 제출 항목 표 — 포털 제출분(HT-1)은 '포털'로 자동 확정, 나머지는 '미접수'
    const submissionTable = container.querySelectorAll('table.ui-table')[1] as HTMLElement
    expect(within(submissionTable).getByText('수신 경로 · 접수자')).toBeTruthy()
    const ht1 = await screen.findByTestId('submission-row-HT-1')
    expect(within(ht1).getByText('포털 · 자동 접수')).toBeTruthy()
    const ht3 = screen.getByTestId('submission-row-HT-3')
    expect(within(ht3).getByText('미접수')).toBeTruthy()
    expect(within(ht3).getByRole('link', { name: '요청 메일' }).getAttribute('href')).toMatch(
      /^mailto:partner@example\.com\?/,
    )
  })
})

describe('S-11 ⑤ 접수 기록 — 외부 수신분을 PM이 대신 등록', () => {
  it('재요청 미회신 행을 접수 기록하면 검토 필요로 바뀌고 수신 경로·접수자가 남는다', async () => {
    const { container } = renderRoute('/partners')
    const table = await partnerTable(container)
    // ptn-004(가상실버네트웍스) — HT-1이 재요청(changes_requested) 상태
    await userEvent.click(within(table).getByText('가상실버네트웍스'))
    await screen.findByRole('heading', { name: /파트너 상세 — 가상실버네트웍스/ })

    const ht1 = await screen.findByTestId('submission-row-HT-1')
    expect(within(ht1).getByText('재요청함')).toBeTruthy()
    await userEvent.click(within(ht1).getByRole('button', { name: '접수 기록' }))

    await userEvent.type(screen.getByLabelText('받은 파일명'), '부스도면_수정.pdf')
    await userEvent.selectOptions(screen.getByLabelText('수신 경로'), 'email')
    await userEvent.click(screen.getByRole('button', { name: '기록' }))

    // 전이는 기존 provider(uploadVersion → §5.1 host inbound 분기) 경유 — 검토 필요로 복귀
    const updated = await screen.findByTestId('submission-row-HT-1')
    expect(await within(updated).findByText('검토 필요')).toBeTruthy()
    // 수신 경로는 PM이 고른 표시값(메일) + 접수자(내부 사용자)
    expect((within(updated).getByLabelText('HT-1 수신 경로') as HTMLSelectElement).value).toBe('email')
    expect(within(updated).getByText('· 김기획')).toBeTruthy()
  })

  it('⑥ 상세 패널이 열린 상태에서도 금액 키는 화면에 0건이다(§21.2 R-H3)', async () => {
    const { container } = renderRoute('/partners')
    const table = await partnerTable(container)
    await userEvent.click(within(table).getByText('가상다이아텍'))
    const main = (await screen.findByRole('heading', { name: '파트너 보드' })).closest(
      'main',
    ) as HTMLElement
    await screen.findByTestId('submission-row-HT-1')

    for (const key of [
      'contract_amount',
      'total_amount',
      'breakdown',
      'settlement',
      'margin',
      'markup',
      'ordered_amount',
      'actual_amount',
    ]) {
      expect(main.innerHTML).not.toContain(key)
    }
  })
})
