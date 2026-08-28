/** @vitest-environment jsdom */
// DoD-12: 큐시트 정형 에디터 — 행 추가·편집·정렬이 S9 큐시트 섹션에 즉시 반영, 컨펌 발송 시
// 스냅숏 버전 자동 등록 (CLAUDE.md v1.4 §7 DoD-12, Phase 3.6c). 대상: dlv-004(개막식 큐시트,
// ops, internal_review, 큐 4행 cue-001~004). 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로
// 실행되며 같은 MockProvider 상태를 공유한다 (src/test/testUtils.tsx 참조).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

/** 큐시트 표(tbody)의 '큐번호' 열(1번째 셀) 값을 sort_order 순으로 읽는다 */
function cueNoOrder(scope: ParentNode = document): string[] {
  return Array.from(scope.querySelectorAll('table tbody > tr')).map(
    (tr) => tr.querySelector('td')?.textContent ?? '',
  )
}

/** S9 큐시트 섹션(열 순서: 시간·큐·구분…)의 '큐' 열(2번째 셀) 값을 순서대로 읽는다 */
function planCueOrder(section: HTMLElement): string[] {
  return Array.from(section.querySelectorAll('table tbody > tr')).map(
    (tr) => tr.querySelectorAll('td')[1]?.textContent ?? '',
  )
}

describe('DoD-12 큐시트 정형 에디터', () => {
  it('(a) ops로 /items/dlv-004 진입 시 정형 표가 렌더되고(파일 업로드 폼 없음) 큐 4행이 보인다', async () => {
    mockProvider().switchUser('usr-ops')
    renderRoute('/items/dlv-004')

    expect(await screen.findByRole('heading', { name: '큐시트' })).toBeTruthy()
    // 큐 목록은 비동기 조회(useAsync) — 첫 큐가 뜰 때까지 기다린 뒤 표를 검사한다
    await screen.findByText('C01')

    // 파일 업로드 폼 대신 정형 표 — 버전 업로드 UI가 전혀 없다
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.queryByRole('button', { name: '업로드' })).toBeNull()

    // 표 헤더 — 행 추가 폼의 동명 필드 라벨(큐번호·시간·구분·음향·조명·스크린)과 겹치므로
    // thead 안에서만 검사한다.
    const cuesheetCard = screen.getByRole('heading', { name: '큐시트' }).closest('div')!.parentElement!
    const headerRow = within(cuesheetCard).getByRole('table').querySelector('thead tr')!
    expect(headerRow.textContent).toBe('큐번호시간구분내용음향조명스크린액션')

    // 큐 4행 (cue-001~004)
    expect(cueNoOrder()).toEqual(['C01', 'C02', 'C03', 'C04'])
    expect(screen.getByText('09:20')).toBeTruthy()
    expect(screen.getByText('사전')).toBeTruthy()

    // ops는 편집 UI(행 추가 포함) 사용 가능
    expect(screen.getByText('행 추가')).toBeTruthy()

    // 대본 전문 패널 — '대본' 토글 시 body 마크다운 전문이 펼쳐진다
    const c03Row = screen.getByText('C03').closest('tr')!
    await userEvent.click(within(c03Row).getByRole('button', { name: '대본' }))
    expect(await screen.findByText(/오늘 이 자리를 찾아주신 여러분을 진심으로 환영합니다/)).toBeTruthy()
  })

  it('(b) 행 추가 시 표에 반영된다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C01')

    const form = screen.getByText('행 추가').parentElement!
    await userEvent.type(within(form).getByLabelText('큐번호'), 'C05')
    await userEvent.type(within(form).getByLabelText('시간'), '10:05')
    await userEvent.type(within(form).getByLabelText('구분'), 'VIP 소개')
    await userEvent.type(within(form).getByLabelText('내용(대본)'), 'VIP 등장 안내 멘트')
    await userEvent.type(within(form).getByLabelText('음향'), 'SFX')
    await userEvent.type(within(form).getByLabelText('조명'), '스팟')
    await userEvent.type(within(form).getByLabelText('스크린'), 'VIP 프로필')
    await userEvent.click(within(form).getByRole('button', { name: '추가' }))

    expect(await screen.findByText('C05')).toBeTruthy()
    expect(cueNoOrder()).toEqual(['C01', 'C02', 'C03', 'C04', 'C05'])
    const c05Row = screen.getByText('C05').closest('tr')!
    expect(within(c05Row).getByText('10:05')).toBeTruthy()
    expect(within(c05Row).getByText('VIP 소개')).toBeTruthy()

    const cues = await mockProvider().listCues('dlv-004')
    expect(cues).toHaveLength(5)
  })

  it('(c) 행 편집(시간 변경)이 반영된다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C01')

    const row = screen.getByText('C01').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '편집' }))

    const timeInput = within(row).getByLabelText('시간') as HTMLInputElement
    expect(timeInput.value).toBe('09:20')
    await userEvent.clear(timeInput)
    await userEvent.type(timeInput, '09:15')
    await userEvent.click(within(row).getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(within(row).getByText('09:15')).toBeTruthy()
    })
    expect(within(row).queryByText('09:20')).toBeNull()

    const cue = (await mockProvider().listCues('dlv-004')).find((c) => c.cue_no === 'C01')
    expect(cue?.time_at).toBe('09:15')
  })

  it('(d) ↑/↓ 버튼으로 순서가 변경된다', async () => {
    renderRoute('/items/dlv-004')
    await screen.findByText('C01')
    expect(cueNoOrder()).toEqual(['C01', 'C02', 'C03', 'C04', 'C05'])

    const c02Row = screen.getByText('C02').closest('tr')!
    await userEvent.click(within(c02Row).getByRole('button', { name: '아래로' }))

    await waitFor(() => {
      expect(cueNoOrder()).toEqual(['C01', 'C03', 'C02', 'C04', 'C05'])
    })
  })

  it('(e) /plan 렌더 시 ③큐시트 섹션에 변경사항(편집·추가·정렬)이 즉시 반영된다', async () => {
    renderRoute('/plan')

    const cuesheetSection = (await screen.findByRole('heading', { name: '03 큐시트' })).closest('section')!
    expect(within(cuesheetSection).getByText('09:15')).toBeTruthy() // (c) 편집 반영
    expect(within(cuesheetSection).getByText('C05')).toBeTruthy() // (b) 추가 반영
    expect(within(cuesheetSection).getByText('VIP 소개')).toBeTruthy()
    expect(planCueOrder(cuesheetSection)).toEqual(['C01', 'C03', 'C02', 'C04', 'C05']) // (d) 정렬 반영
  })

  it('(f) pm으로 컨펌 발송 시 큐시트 스냅숏 버전(.pdf)이 자동 등록되고 컨펌대기로 전이된다', async () => {
    mockProvider().switchUser('usr-pm')
    renderRoute('/items/dlv-004')
    await screen.findByText('내부검토')

    // 버전 선택 셀렉트 대신 스냅숏 자동 등록 안내가 노출된다
    expect(screen.getByText(/발송 시 표의 스냅숏\(\.pdf\)이 자동 버전으로 등록됩니다/)).toBeTruthy()
    expect(screen.queryByText('버전 선택…')).toBeNull()

    const beforeVersionCount = (await mockProvider().getDeliverable('dlv-004')).versions.length

    await userEvent.click(screen.getByRole('button', { name: '컨펌 발송' }))

    expect(await screen.findByText('컨펌대기')).toBeTruthy()

    const detail = await mockProvider().getDeliverable('dlv-004')
    expect(detail.status).toBe('pending_approval')
    expect(detail.versions).toHaveLength(beforeVersionCount + 1)
    const latest = detail.versions[0]
    expect(latest.file_name.endsWith('.pdf')).toBe(true)
    expect(latest.note).toContain('큐시트 스냅숏')
  })

  it('(g) design 역할에는 큐시트 편집 UI가 노출되지 않는다(읽기 전용 표)', async () => {
    mockProvider().switchUser('usr-design')
    renderRoute('/items/dlv-004')

    expect(await screen.findByRole('heading', { name: '큐시트' })).toBeTruthy()
    // 표 자체(큐 내용)는 그대로 보인다
    expect(screen.getByText('C01')).toBeTruthy()
    // 편집 관련 액션은 전부 미노출
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
    expect(screen.queryByRole('button', { name: '위로' })).toBeNull()
    expect(screen.queryByRole('button', { name: '아래로' })).toBeNull()
    expect(screen.queryByText('행 추가')).toBeNull()
    // 대본 열람은 읽기 전용 사용자에게도 허용된다
    expect(screen.getAllByRole('button', { name: '대본' }).length).toBeGreaterThan(0)
  })
})
