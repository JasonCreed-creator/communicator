/** @vitest-environment jsdom */
// DoD 78 (Phase 3.23 PR-8 · 디자인지시서 v1.4 §7-2.12) — 행사 설정 · 온보딩.
//  A. 행사 설정: 탭 이름에 번호 없음 · 머리 상태 배지(완료 = positive, 미완료 = attention — 빨강 없음) ·
//     탭 줄 오른쪽 필수 요약 · 개요 = 섹션 목록 + 섹션 카드 · 바꾼 칸 = accent 테두리 + '원래 …'(칸 안내는
//     이어 붙는다) · 고정 저장 바(바꾼 칸이 있을 때만 — n개 + 칸 이름 · 변경 취소 · 저장) → '저장됨 HH:mm' ·
//     행사 포맷은 읽기 전용 · PM이 아니면 칸 잠김 + 저장 바 없음
//  B. 온보딩: 머리 줄(새 행사 만들기 · 단계마다 저장돼요 · 나중에 하기) · 넓은 2열(무엇을 / 언제 · 어디서) ·
//     주 버튼은 '다음: 담당자' 하나 · 선택 항목은 접되 값이 있으면 펼쳐 둔다 · 바꾼 칸 표시 없음 ·
//     '나중에 하기' = 저장 안 한 입력이 있으면 먼저 묻고 행사 목록으로
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID, PROJECT_ID_PARTNER } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** 행사명·코드만 있는 세팅 미완료 행사 — 행사일·장소가 비었다 */
let draftId = ''

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  draftId = (await p.createProject({ name: '가상 설정 점검 행사', code: 'SET78' })).id
})

function select(id: string) {
  localStorage.setItem('communicator.currentProjectId', id)
}

async function openSettings(id = PROJECT_ID) {
  select(id)
  renderRoute('/settings')
  await screen.findByRole('heading', { name: '행사 설정' })
  await screen.findByLabelText('행사명')
}

function yymmdd(d: Date): string {
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

describe('DoD 78-A 행사 설정 — 탭 · 상태 배지 · 섹션 · 고정 저장 바', () => {
  it('A1 탭 이름에 번호가 없고 지금 탭은 aria-current="page", 탭 줄 오른쪽에 필수 요약', async () => {
    await openSettings()
    const [overview, members] = ['개요', '담당자'].map((name) => screen.getByRole('button', { name }))
    expect(screen.getByRole('button', { name: '유형·연동' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^[①②③]/ })).toBeNull()
    expect(overview.getAttribute('aria-current')).toBe('page')
    expect(members.getAttribute('aria-current')).toBeNull()
    expect(screen.getByTestId('required-summary').textContent).toBe('필수 4개 모두 입력됨')

    await userEvent.click(members)
    expect(screen.getByRole('button', { name: '담당자' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: '개요' }).getAttribute('aria-current')).toBeNull()
  })

  it('A2 머리 상태 배지 — 세팅 완료 = positive, 미완료 = attention(빨강은 지연 전용), 요약은 비은 칸 이름', async () => {
    await openSettings()
    expect(screen.getByText(/^세팅 완료 · /).getAttribute('data-level')).toBe('positive')
    cleanup()

    await openSettings(draftId)
    const todo = screen.getByText('세팅 미완료 · 필수 2개 남음')
    expect(todo.getAttribute('data-level')).toBe('attention')
    expect(todo.className).not.toContain('negative')
    expect(screen.getByTestId('required-summary').textContent).toBe('필수 2개 남음 — 행사일 · 장소')
  })

  it('A3 개요 = 섹션 목록 + 섹션 카드 — 모객형이면 4개, 누른 섹션이 지금 섹션이 된다', async () => {
    await openSettings()
    const nav = screen.getByRole('navigation', { name: '개요 섹션' })
    const items = within(nav).getAllByRole('button')
    const names = ['기본 정보', '일정·장소', '내용', '모객 설정']
    expect(items.map((b) => b.textContent)).toEqual(names)
    for (const name of names) expect(screen.getByRole('region', { name })).toBeTruthy()
    expect(items[0].getAttribute('aria-current')).toBe('true')

    await userEvent.click(items[1])
    expect(items[1].getAttribute('aria-current')).toBe('true')
    expect(items[0].getAttribute('aria-current')).toBeNull()
  })

  it('A4 칸을 바꾸면 accent 테두리 + "원래 …", 섹션에 변경 수, 고정 저장 바에 개수와 칸 이름 — 변경 취소로 되돌린다', async () => {
    await openSettings()
    expect(screen.queryByTestId('save-bar')).toBeNull()

    const headcount = screen.getByLabelText('예상 인원') as HTMLInputElement
    expect(headcount.value).toBe('300')
    await userEvent.clear(headcount)
    await userEvent.type(headcount, '320')

    expect(headcount.className).toContain('border-accent')
    expect(screen.getByText('원래 300명')).toBeTruthy()
    const navItem = within(screen.getByRole('navigation', { name: '개요 섹션' })).getByRole('button', { name: /^일정·장소/ })
    expect(within(navItem).getByTitle('바뀐 칸 1개').textContent).toBe('1')
    expect(within(screen.getByRole('region', { name: '일정·장소' })).getByText('필수 2 · 변경 1')).toBeTruthy()

    const bar = screen.getByRole('region', { name: '저장하지 않은 변경' })
    expect(within(bar).getByText('저장하지 않은 변경 1개')).toBeTruthy()
    expect(within(bar).getByText('예상 인원')).toBeTruthy()
    // 막는 바가 아니다 — 주 버튼은 저장 하나, 취소는 ghost
    expect(within(bar).getByRole('button', { name: '저장' }).className).toContain('btn-primary')
    expect(within(bar).getByRole('button', { name: '변경 취소' }).className).toContain('btn-ghost')

    await userEvent.click(within(bar).getByRole('button', { name: '변경 취소' }))
    expect(headcount.value).toBe('300')
    expect(headcount.className).not.toContain('border-accent')
    expect(screen.queryByText('원래 300명')).toBeNull()
    expect(screen.queryByTestId('save-bar')).toBeNull()
  })

  it('A5 유형을 바꾸면 "원래 모객형" 뒤에 칸 안내가 이어 붙고, 모객 설정 섹션이 빠진다(모객 칸은 바뀐 칸으로 세지 않는다)', async () => {
    await openSettings()
    await userEvent.selectOptions(screen.getByLabelText('행사 유형'), 'general')
    expect(
      screen.getByText(
        '원래 모객형 · 바꿔도 등록 데이터는 지워지지 않고 화면에서만 숨겨집니다. 일정(WBS) 다시 펼치기는 일정 화면에서 합니다.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('region', { name: '모객 설정' })).toBeNull()
    expect(within(screen.getByRole('region', { name: '저장하지 않은 변경' })).getByText('저장하지 않은 변경 1개')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(screen.getByRole('region', { name: '모객 설정' })).toBeTruthy()
  })

  it('A6 행사 포맷은 읽기 전용(고르는 칸 없음)이고, 행사 코드 칸은 오늘 날짜로 파일 이름 예시를 보인다', async () => {
    await openSettings()
    const fmt = screen.getByTestId('format-display')
    expect(fmt.textContent).toContain('컨퍼런스')
    expect(screen.getByText(/온보딩 3단계에서 정했습니다/)).toBeTruthy()
    // 기본 정보 섹션의 고르는 칸은 행사 유형 하나 — 포맷 셀렉트가 없다
    const basic = screen.getByRole('region', { name: '기본 정보' })
    expect(within(basic).getAllByRole('combobox').map((el) => el.id)).toEqual(['ov-event-type'])
    expect(screen.getByText(`파일 이름 앞에 붙습니다 — 예: ${yymmdd(new Date())}_STC26_…`)).toBeTruthy()
  })

  it('A7 PM이 아니면 칸이 잠기고 저장 바가 없다 — 섹션 목록으로 읽기는 그대로', async () => {
    mockProvider().switchUser('usr-design')
    try {
      await openSettings()
      expect((screen.getByLabelText('행사명') as HTMLInputElement).disabled).toBe(true)
      expect(screen.getByRole('navigation', { name: '개요 섹션' })).toBeTruthy()
      expect(screen.queryByTestId('save-bar')).toBeNull()
      expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    } finally {
      mockProvider().switchUser('usr-pm')
    }
  })

  it('A8 저장하면 저장 바가 사라지고 "저장됨 HH:mm" — 새 값이 기준이 되어 바꾼 칸 표시도 걷힌다', async () => {
    await openSettings()
    const headcount = screen.getByLabelText('예상 인원') as HTMLInputElement
    await userEvent.clear(headcount)
    await userEvent.type(headcount, '320')
    await userEvent.click(within(screen.getByRole('region', { name: '저장하지 않은 변경' })).getByRole('button', { name: '저장' }))

    expect((await screen.findByTestId('saved-note')).textContent).toMatch(/^저장됨 \d{2}:\d{2}$/)
    expect(screen.queryByTestId('save-bar')).toBeNull()
    expect(headcount.className).not.toContain('border-accent')
    expect(screen.queryByText('원래 300명')).toBeNull()
    expect((await mockProvider().getProject(PROJECT_ID)).expected_headcount).toBe(320)

    // 다시 고치면 캡션 대신 저장 바 — 기준은 방금 저장한 320
    await userEvent.type(headcount, '0')
    expect(screen.queryByTestId('saved-note')).toBeNull()
    expect(screen.getByText('원래 320명')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(headcount.value).toBe('320')
  })
})

describe('DoD 78-B 온보딩 — 머리 줄 · 넓은 2열 · 선택 항목 · 나중에 하기', () => {
  it('B0 이미 세팅이 끝난 행사는 단계 대신 안내와 행사 설정 링크 — 나중에 하기가 없다', async () => {
    select(PROJECT_ID)
    renderRoute('/onboarding')
    expect(await screen.findByText('이미 세팅이 완료된 행사입니다.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '행사 설정으로' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '나중에 하기' })).toBeNull()
  })

  it('B1 머리 줄 = 새 행사 만들기 · 단계마다 저장돼요 · 나중에 하기(ghost), 본문 = 무엇을 / 언제 · 어디서 2열, 주 버튼 하나', async () => {
    mockProvider().resetOnboarding(PROJECT_ID)
    select(PROJECT_ID)
    renderRoute('/onboarding')
    await screen.findByRole('heading', { name: '행사 기본 정보' })
    await screen.findByLabelText('행사명')

    expect(screen.getByText('새 행사 만들기')).toBeTruthy()
    expect(screen.getByText('단계마다 저장돼요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '나중에 하기' }).className).toContain('btn-ghost')

    const what = screen.getByText('무엇을').parentElement as HTMLElement
    const whenWhere = screen.getByText('언제 · 어디서').parentElement as HTMLElement
    for (const label of ['행사명', '행사 코드', '행사 유형', '예상 인원']) expect(within(what).getByLabelText(label)).toBeTruthy()
    for (const label of ['시작일', '종료일', '장소']) expect(within(whenWhere).getByLabelText(label)).toBeTruthy()

    const primaries = screen.getAllByRole('button').filter((b) => /\bbtn-(primary|accent)\b/.test(b.className))
    expect(primaries.map((b) => b.textContent)).toEqual(['다음: 담당자'])
  })

  it('B2 선택 항목은 접어 두되 값이 있으면 펼쳐 둔다 — 펼치기·접기는 aria-expanded', async () => {
    // 샘플 행사 — 주제·주최 등 선택 항목에 값이 있다 → 펼침
    select(PROJECT_ID)
    renderRoute('/onboarding')
    const filled = await screen.findByTestId('optional-fields')
    expect(within(filled).getByText('선택 항목 6개')).toBeTruthy()
    expect(within(filled).getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
    expect(within(filled).getByLabelText('주제(슬로건)')).toBeTruthy()
    cleanup()

    // 새 행사 — 비어 있다 → 접힘, 펼치면 칸이 나온다
    select(draftId)
    renderRoute('/onboarding')
    const empty = await screen.findByTestId('optional-fields')
    const toggle = within(empty).getByRole('button', { name: '펼치기' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(empty).queryByLabelText('주제(슬로건)')).toBeNull()
    await userEvent.click(toggle)
    expect(within(empty).getByLabelText('주제(슬로건)')).toBeTruthy()
    expect(within(empty).getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('B3 온보딩은 처음 채우는 중이라 바꾼 칸 표시(accent 테두리 · 원래 …)와 저장 바가 없다', async () => {
    select(PROJECT_ID)
    renderRoute('/onboarding')
    const venue = (await screen.findByLabelText('장소')) as HTMLInputElement
    await userEvent.type(venue, ' 2층')
    expect(venue.className).not.toContain('border-accent')
    expect(screen.queryByText(/^원래 /)).toBeNull()
    expect(screen.queryByTestId('save-bar')).toBeNull()
  })

  it('B4 나중에 하기 — 저장 안 한 입력이 있으면 먼저 묻고(취소하면 머무름), 없으면 묻지 않고 행사 목록으로', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    select(draftId)
    renderRoute('/onboarding')
    const venue = await screen.findByLabelText('장소')
    await userEvent.type(venue, '가상홀')

    await userEvent.click(screen.getByRole('button', { name: '나중에 하기' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: '행사 기본 정보' })).toBeTruthy()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: '나중에 하기' }))
    expect(await screen.findByRole('heading', { name: '행사 목록' })).toBeTruthy()
    // 나가면 이 단계의 입력은 저장되지 않는다
    expect((await mockProvider().getProject(draftId)).venue ?? '').toBe('')
    cleanup()

    confirm.mockClear()
    select(draftId)
    renderRoute('/onboarding')
    await screen.findByLabelText('장소')
    await userEvent.click(screen.getByRole('button', { name: '나중에 하기' }))
    expect(await screen.findByRole('heading', { name: '행사 목록' })).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()
  })
})

// 경합은 두 갈래다 — ① 전환이 그려지기 전에 이전 행사의 조회가 끝남(이 파일 전체 실행 순서에서 jsdom도 재현 —
// 단독 실행은 통과해 버린다) ② 전환은 그려졌는데 이전 조회가 늦게 옴(실브라우저 — demo:smoke ③ PR-8이 가드한다).
describe('DoD 78-C 가드 — 이전 행사의 온보딩 상태로 판정하지 않는다', () => {
  it('C1 세팅 미완료 행사를 보다가 다른 행사 링크(?project=)로 본체에 들어가면 그 화면이 열린다(행사 설정으로 끌려가지 않음)', async () => {
    // 링크가 가리키는 행사 = 세팅이 끝난 ② 일반형 진행 중(샘플 행사는 B에서 온보딩을 되돌렸다)
    expect((await mockProvider().getOnboardingStatus(PROJECT_ID_PARTNER)).completed).toBe(true)
    select(draftId)
    renderRoute(`/home?project=${PROJECT_ID_PARTNER}`)
    expect(await screen.findByRole('heading', { name: '홈 대시보드' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '행사 설정' })).toBeNull()
    expect(localStorage.getItem('communicator.currentProjectId')).toBe(PROJECT_ID_PARTNER)
  })
})
