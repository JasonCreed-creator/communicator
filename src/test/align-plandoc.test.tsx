/** @vitest-environment jsdom */
// S9 운영계획서 시안 정렬(v2.5.2) 계약 — '운영계획서.dc.html' 정본.
// ① 좌측 고정 목차 레일(옛 PlanProgressSummary 6칸 그리드 대체) ② 발행 게이트의 컨펌 발송 잠금
// ③ 표지 1장 + 러닝 헤더/푸터로 전 7쪽 ④ 원문자 폐기·01~08 넘버링 ⑤ 07 비상 대응 전용 장
// ⑥ 06 등록 통계 막대의 분모 = 보장 인원(없으면 막대 없음) ⑦ 페이지 경계 토글.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID, PROJECT_ID_PARTNER } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

function selectProject(id: string) {
  localStorage.setItem('communicator.currentProjectId', id)
}

describe('S9 ① 목차 레일 — 이동과 점검을 한 자리에서', () => {
  it('8개 섹션이 번호·상태와 함께 나열되고 각 항목이 섹션 앵커로 이동한다', async () => {
    selectProject(PROJECT_ID)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '01 행사개요' })

    const toc = screen.getByRole('navigation', { name: '운영계획서 목차' })
    const links = within(toc).getAllByRole('link')
    expect(links).toHaveLength(8)
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#plan-sec-overview',
      '#plan-sec-program',
      '#plan-sec-cuesheet',
      '#plan-sec-zones',
      '#plan-sec-production',
      '#plan-sec-registration',
      '#plan-sec-emergency',
      '#plan-sec-schedule',
    ])

    // 상태는 색 도트만이 아니라 단어로도 읽힌다(색만으로 구분 금지) — 샘플 테크는 07이 미입력
    const emergencyLink = links[6]
    expect(within(emergencyLink).getByText('미입력')).toBeTruthy()
    // 전체 진행률 + 상태별 집계
    expect(within(toc).getByText(/항목$/)).toBeTruthy()
    expect(within(toc).getByText(/^완료 \d+$/)).toBeTruthy()

    // 레일은 관리 UI라 인쇄에서 통째로 빠진다(레일 컨테이너에 전역 .print-hidden)
    expect(toc.closest('.print-hidden')).toBeTruthy()
  })
})

describe('S9 ② 발행 게이트 — 미입력이 있으면 컨펌 발송만 잠근다', () => {
  it('미입력 섹션(07 비상 대응)이 있으면 컨펌 발송이 비활성이고 잠긴 이유·이동 링크가 붙는다', async () => {
    selectProject(PROJECT_ID)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '01 행사개요' })

    const send = screen.getByRole('button', { name: '컨펌 발송' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    // 인쇄는 항상 허용
    const print = screen.getByRole('button', { name: '인쇄 · PDF' }) as HTMLButtonElement
    expect(print.disabled).toBe(false)

    // 잠긴 이유 — 경고 띠 + InfoTip 둘 다
    expect(screen.getByText(/07 비상 대응이\(가\) 비어 있습니다\./)).toBeTruthy()
    const jump = screen.getByRole('link', { name: /해당 섹션으로 이동/ })
    expect(jump.getAttribute('href')).toBe('#plan-sec-emergency')

    await userEvent.hover(screen.getByRole('button', { name: '도움말' }))
    expect(await screen.findByRole('tooltip')).toHaveProperty(
      'textContent',
      expect.stringContaining('미입력 섹션이 있으면 컨펌 발송이 열리지 않습니다'),
    )
  })
})

describe('S9 ③ 표지 + 러닝 헤더/푸터 — 전 7쪽', () => {
  it('표지 1장 + 본문 6장이 쪽마다 푸터(버전 · 출력일시 · n/7)를 반복하고 마지막 쪽만 페이지 나눔이 없다', async () => {
    selectProject(PROJECT_ID)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '01 행사개요' })

    const pages = [...document.querySelectorAll('.plan-page')] as HTMLElement[]
    expect(pages).toHaveLength(7)
    pages.forEach((page, i) => {
      expect(page.textContent).toContain(`${i + 1}/7`)
      expect(page.textContent).toContain('초안') // 컨펌 스냅숏 전이라 버전 라벨은 '초안'
      expect(page.className.includes('print:break-after-page')).toBe(i < 6)
    })

    // 표지 — 제목 + 행사 + 문서 버전/출력 메타
    const cover = pages[0]
    expect(within(cover).getByRole('heading', { name: '운영계획서' })).toBeTruthy()
    expect(within(cover).getByText('샘플 테크 컨퍼런스 2026')).toBeTruthy()
    expect(within(cover).getByText('문서 버전')).toBeTruthy()
    expect(within(cover).getByText('컨펌 스냅숏 기준')).toBeTruthy()
    expect(within(cover).getByText('전 7쪽')).toBeTruthy()

    // 러닝 헤더 — 행사명 · 섹션명(표지 제외 6쪽)
    expect(pages[1].textContent).toContain('01 행사개요 · 02 프로그램')
    expect(pages[3].textContent).toContain('04 존별 운영 · 05 제작물 리스트')
  })

  it('페이지 경계 보기 토글이 화면상 A4 경계 표시를 켜고 끈다', async () => {
    selectProject(PROJECT_ID)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '01 행사개요' })

    expect(screen.getAllByText(/A4 \d쪽 끝 · \d쪽 시작/).length).toBe(6)
    await userEvent.click(screen.getByRole('switch', { name: '페이지 경계 보기' }))
    expect(screen.queryByText(/A4 \d쪽 끝 · \d쪽 시작/)).toBeNull()
  })
})

describe('S9 ④⑤ 넘버링·07 비상 대응 전용 장', () => {
  it('유니코드 원문자가 사라지고 01~08 번호 + 상태 배지(완료·작성 중·미입력)로 렌더된다', async () => {
    selectProject(PROJECT_ID)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '01 행사개요' })

    const sheet = document.querySelector('.plan-doc') as HTMLElement
    expect(sheet.textContent).not.toMatch(/[①②③④⑤⑥⑦⑧]/)
    for (const name of [
      '01 행사개요',
      '02 프로그램',
      '03 큐시트',
      '04 존별 운영',
      '05 제작물 리스트',
      '06 등록 통계',
      '07 비상 대응',
      '08 일정',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
    // 상태는 n/m 숫자가 아니라 세 단어 배지로 읽히고, 숫자는 배지 안에 남는다
    expect(screen.getAllByText(/완료 \d+\/\d+/).length).toBeGreaterThan(0)
    expect(screen.getByText(/미입력 \d+\/\d+/)).toBeTruthy()
  })

  it('07 비상 대응은 negative 경고 면 + 옆면 색인 탭 + 빈 상태 액션을 갖는다', async () => {
    selectProject(PROJECT_ID)
    renderRoute('/plan')
    const section = (await screen.findByRole('heading', { name: '07 비상 대응' })).closest(
      'section',
    ) as HTMLElement

    expect(section.className).toContain('border-2')
    expect(section.className).toContain('border-negative')
    // 종이 오른쪽 옆면 색인 탭(8×96)
    expect(section.querySelector('.bg-negative.w-2')).toBeTruthy()
    // 흑백에서도 읽히도록 제목 옆 '비상' 텍스트 라벨
    expect(within(section).getByText('비상')).toBeTruthy()
    // 빈 상태 ② — 한 줄 + ghost 액션 1개(accent 금지)
    const action = within(section).getByRole('link', { name: '운영가이드에서 작성' })
    expect(action.className).toContain('btn-ghost')
    expect(action.className).not.toContain('btn-accent')
  })
})

describe('S9 ⑥ 등록 통계 — 등록수 막대의 분모는 보장 인원', () => {
  it('보장 인원이 있는 모객형은 대비 비율 막대를, 없는 일반형은 막대 없이 숫자만 보여준다', async () => {
    selectProject(PROJECT_ID) // 모객형 · guarantee_pax 80
    const recruiting = renderRoute('/plan')
    await screen.findByRole('heading', { name: '06 등록 통계' })
    const recruitTile = screen.getByText('등록수').parentElement as HTMLElement
    expect(within(recruitTile).getByText(/보장 인원 80명 대비/)).toBeTruthy()
    expect(recruitTile.querySelector('.bg-track')).toBeTruthy()
    recruiting.unmount()

    selectProject(PROJECT_ID_PARTNER) // 일반형 · guarantee_pax 없음
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '06 등록 통계' })
    const generalTile = screen.getByText('등록수').parentElement as HTMLElement
    expect(within(generalTile).queryByText(/보장 인원/)).toBeNull()
    expect(generalTile.querySelector('.bg-track')).toBeNull()
    // 응답률·체크인율 막대는 그대로 — 분모가 있는 지표만 막대를 갖는다
    const responseTile = screen.getByText('응답률').parentElement as HTMLElement
    expect(responseTile.querySelector('.bg-track')).toBeTruthy()
  })
})
